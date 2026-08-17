from flask import Flask, request, render_template, redirect, url_for, flash, session, send_from_directory, jsonify, abort
# import sqlite3 as sql
# from flask_sqlalchemy import SQLAlchemy
# from flask import Flask
from flask_mail import Mail, Message
import random
import hmac
import secrets
import time
from datetime import timedelta, date
from pathlib import Path
import os
import hashlib
import re
from urllib.parse import urlparse, unquote
from dotenv import load_dotenv
from werkzeug.security import check_password_hash, generate_password_hash
from models import db, User, UserProfile, UserPreference
from feature_registry import FEATURES
from site_updates import SITE_UPDATES, get_latest_update, get_update_by_slug

# === Cloudinary：雲端大頭貼儲存 ===
try:
    import cloudinary
    import cloudinary.uploader as cloudinary_uploader
except ImportError:
    cloudinary = None
    cloudinary_uploader = None


# === 讀取 linkset.env === load_dotenv("linkset.env") 也可以
env_path = Path(__file__).resolve().parent / "linkset.env"
load_dotenv(env_path)

# === 匯入 Blueprint ===
from routes.schoolassignment_routes import schoolassignment_bp
from routes.portfolio_routes import portfolio_bp


app = Flask(__name__)

secret_key = os.getenv("SECRET_KEY", "").strip()

if not secret_key:
    if os.getenv("DYNO"):
        raise RuntimeError("Heroku 正式環境必須設定 SECRET_KEY")

    secret_key = secrets.token_hex(32)
    print("警告：本機未設定 SECRET_KEY，本次啟動使用臨時安全金鑰。")

app.secret_key = secret_key

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=bool(os.getenv("DYNO")),
    MAX_CONTENT_LENGTH=6 * 1024 * 1024
)


def get_csrf_token():
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token


@app.context_processor
def inject_csrf_token():
    return {"csrf_token": get_csrf_token}


@app.before_request
def validate_csrf_token():
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return None

    expected_token = session.get("csrf_token", "")
    submitted_token = (
        request.headers.get("X-CSRF-Token", "")
        or request.form.get("csrf_token", "")
    )

    if not expected_token or not submitted_token:
        abort(400, description="CSRF 驗證失敗，請重新整理頁面後再試")

    if not hmac.compare_digest(expected_token, submitted_token):
        abort(400, description="CSRF 驗證失敗，請重新整理頁面後再試")

    return None

#保存一天登入資訊
app.permanent_session_lifetime = timedelta(days=1)

#寄驗證信設定
app.config['MAIL_SERVER']='smtp.gmail.com'
app.config['MAIL_PORT'] = 465
app.config['MAIL_USERNAME'] = os.getenv("MAIL_USERNAME")
app.config['MAIL_PASSWORD'] = os.getenv("MAIL_PASSWORD")
app.config['MAIL_USE_TLS'] = False
app.config['MAIL_USE_SSL'] = True


# === Cloudinary 設定 ===
# 支援兩種部署方式：
# 1. CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
# 2. CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
CLOUDINARY_URL = os.getenv("CLOUDINARY_URL", "").strip()
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "").strip()
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "").strip()
CLOUDINARY_CONFIG_SOURCE = "separate_vars"

if CLOUDINARY_URL:
    try:
        parsed_cloudinary_url = urlparse(CLOUDINARY_URL)

        if parsed_cloudinary_url.scheme == "cloudinary":
            CLOUDINARY_API_KEY = unquote(parsed_cloudinary_url.username or "")
            CLOUDINARY_API_SECRET = unquote(parsed_cloudinary_url.password or "")
            CLOUDINARY_CLOUD_NAME = parsed_cloudinary_url.hostname or ""
            CLOUDINARY_CONFIG_SOURCE = "cloudinary_url"
    except Exception as cloudinary_url_error:
        print("Cloudinary URL 解析失敗：", cloudinary_url_error)

CLOUDINARY_PACKAGE_AVAILABLE = bool(
    cloudinary
    and cloudinary_uploader
)

CLOUDINARY_MISSING_SETTINGS = [
    setting_name
    for setting_name, setting_value in {
        "CLOUDINARY_CLOUD_NAME": CLOUDINARY_CLOUD_NAME,
        "CLOUDINARY_API_KEY": CLOUDINARY_API_KEY,
        "CLOUDINARY_API_SECRET": CLOUDINARY_API_SECRET
    }.items()
    if not setting_value
]

CLOUDINARY_ENABLED = bool(
    CLOUDINARY_PACKAGE_AVAILABLE
    and not CLOUDINARY_MISSING_SETTINGS
)

if CLOUDINARY_ENABLED:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True
    )

print(
    "Cloudinary 狀態：",
    {
        "package_installed": CLOUDINARY_PACKAGE_AVAILABLE,
        "config_source": CLOUDINARY_CONFIG_SOURCE,
        "cloud_name_set": bool(CLOUDINARY_CLOUD_NAME),
        "api_key_set": bool(CLOUDINARY_API_KEY),
        "api_secret_set": bool(CLOUDINARY_API_SECRET),
        "enabled": CLOUDINARY_ENABLED
    }
)

# === 大頭貼限制 ===
DEFAULT_AVATAR_PATH = "assets/images/faces/face8.jpg"
ALLOWED_AVATAR_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
ALLOWED_AVATAR_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp"
}
MAX_AVATAR_SIZE = 2 * 1024 * 1024

# === 設定資料庫連線 ===

# === 取得目前 app.py 所在資料夾路徑 ===
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

# === 嘗試取得 Heroku MariaDB 連線字串 ===
db_url = (
    os.getenv("JAWSDB_MARIA_URL")
    or os.getenv("JAWSDB_URL")
    or os.getenv("DATABASE_URL")
)

# === Heroku 有資料庫連線字串時，使用 MariaDB ===
if db_url:

    # JawsDB 通常提供 mysql://，轉成 MariaDB Connector 格式
    if db_url.startswith("mysql://"):
        db_url = db_url.replace(
            "mysql://",
            "mariadb+mariadbconnector://",
            1
        )

# === 本機沒有雲端資料庫連線字串時，使用 SQLite ===
else:
    db_url = "sqlite:///" + os.path.join(
        BASE_DIR,
        "user_data.db"
    )

# === 套用資料庫設定 ===
app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# === 初始化資料庫 ===
db.init_app(app)

# === 本機開發可自動建表；Heroku 正式環境避免每個 worker 重複執行 ===
auto_create_db = os.getenv(
    "AUTO_CREATE_DB",
    "0" if os.getenv("DYNO") else "1"
).strip().lower() in {"1", "true", "yes"}

if auto_create_db:
    with app.app_context():
        db.create_all()
    
    
# === 註冊 Blueprint ===
app.register_blueprint(schoolassignment_bp)
app.register_blueprint(portfolio_bp)
mail = Mail(app)


PASSWORD_HASH_METHOD = "pbkdf2:sha256:600000"
PASSWORD_HASH_PREFIX = "pbkdf2:sha256:"
PASSWORD_COLUMN_MAX_LENGTH = 100
REGISTER_CODE_TTL_SECONDS = 10 * 60
REGISTER_CODE_RESEND_COOLDOWN_SECONDS = 60
REGISTER_CODE_MAX_SENDS_PER_HOUR = 5
REGISTER_CODE_MAX_ATTEMPTS = 5


def hash_user_password(password):
    """建立可放入既有 100 字元欄位的密碼雜湊。"""

    password_hash = generate_password_hash(
        password,
        method=PASSWORD_HASH_METHOD,
        salt_length=8
    )

    if len(password_hash) > PASSWORD_COLUMN_MAX_LENGTH:
        raise RuntimeError("密碼雜湊超過資料庫欄位長度")

    return password_hash


def verify_user_password(stored_password, submitted_password):
    """驗證新雜湊或舊明文密碼，並回傳是否需要升級。"""

    if not stored_password or submitted_password is None:
        return False, False

    if stored_password.startswith(PASSWORD_HASH_PREFIX):
        return check_password_hash(stored_password, submitted_password), False

    return hmac.compare_digest(stored_password, submitted_password), True



# === GitHub / Portfolio 展示用帳號 ===
# 這組帳號不是私人帳密，而是公開 Demo 帳號。
# 可透過環境變數覆寫；若不需要 Demo 帳號，可將 DEMO_ENABLED 設為 0。
DEMO_ENABLED = os.getenv("DEMO_ENABLED", "1").strip().lower() in {
    "1", "true", "yes"
}
DEMO_USERNAME = os.getenv("DEMO_USERNAME", "demo").strip() or "demo"
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "demo1234")
DEMO_NAME = os.getenv("DEMO_NAME", "作品展示帳號").strip() or "作品展示帳號"
DEMO_EMAIL = os.getenv("DEMO_EMAIL", "demo@example.com").strip() or "demo@example.com"


def ensure_demo_user():
    """建立或修復公開作品展示帳號，不使用任何私人帳密。"""

    if not DEMO_ENABLED:
        return

    # Demo 部署若使用全新資料庫，也要能直接啟動。
    db.create_all()

    demo_user = User.query.filter_by(
        帳號=DEMO_USERNAME
    ).first()

    demo_password_hash = hash_user_password(
        DEMO_PASSWORD
    )

    if demo_user is None:
        demo_user = User(
            帳號=DEMO_USERNAME,
            密碼=demo_password_hash,
            姓名=DEMO_NAME,
            email=DEMO_EMAIL
        )
        db.session.add(demo_user)
    else:
        # === 每次啟動都恢復 Demo 的核心登入資訊，避免公開展示帳號失效 ===
        demo_user.密碼 = demo_password_hash
        demo_user.姓名 = DEMO_NAME
        demo_user.email = DEMO_EMAIL

    db.session.flush()

    demo_profile = UserProfile.query.filter_by(
        user_account=DEMO_USERNAME
    ).first()

    if demo_profile is None:
        db.session.add(
            UserProfile(
                user_account=DEMO_USERNAME
            )
        )

    demo_preference = UserPreference.query.filter_by(
        user_account=DEMO_USERNAME
    ).first()

    if demo_preference is None:
        db.session.add(
            UserPreference(
                user_account=DEMO_USERNAME,
                theme_mode="light"
            )
        )

    db.session.commit()


with app.app_context():
    ensure_demo_user()


def get_demo_login_context():
    return {
        "demo_enabled": DEMO_ENABLED,
        "demo_username": DEMO_USERNAME,
        "demo_password": DEMO_PASSWORD
    }

def digest_registration_code(code):
    return hashlib.sha256(str(code).encode("utf-8")).hexdigest()


def clear_registration_verification():
    for key in (
        "register_code_hash",
        "register_code_expires_at",
        "register_code_attempts",
        "register_account",
        "register_email"
    ):
        session.pop(key, None)


# === 取得或建立會員個人資料 ===
def get_or_create_user_profile(user):

    profile = UserProfile.query.filter_by(
        user_account=user.帳號
    ).first()

    if profile is None:
        profile = UserProfile(
            user_account=user.帳號
        )

        db.session.add(profile)
        db.session.commit()

    return profile


# === 取得或建立會員網站偏好設定 ===
def get_or_create_user_preference(user):

    preference = UserPreference.query.filter_by(
        user_account=user.帳號
    ).first()

    if preference is None:
        preference = UserPreference(
            user_account=user.帳號,
            theme_mode="light"
        )

        db.session.add(preference)
        db.session.commit()

    if preference.theme_mode not in {"light", "dark"}:
        preference.theme_mode = "light"
        db.session.commit()

    return preference


# === 取得會員目前大頭貼網址 ===
def get_profile_avatar_url(profile):

    if profile and profile.avatar_url:
        return profile.avatar_url

    return url_for(
        "static",
        filename=DEFAULT_AVATAR_PATH
    )


# === Cloudinary 安全狀態資訊：不回傳任何 Secret ===
def get_cloudinary_status_context():

    if CLOUDINARY_ENABLED:
        return {
            "enabled": True,
            "message": "Cloudinary 已完成設定，可以上傳圖片。",
            "missing_items": [],
            "config_source": CLOUDINARY_CONFIG_SOURCE
        }

    missing_items = list(CLOUDINARY_MISSING_SETTINGS)

    if not CLOUDINARY_PACKAGE_AVAILABLE:
        missing_items.insert(
            0,
            "Python 套件 cloudinary"
        )

    return {
        "enabled": False,
        "message": "Cloudinary 尚未完成設定，暫時不能上傳圖片。",
        "missing_items": missing_items,
        "config_source": CLOUDINARY_CONFIG_SOURCE
    }


# === 檢查大頭貼副檔名 ===
def allowed_avatar_file(filename):

    if "." not in filename:
        return False

    extension = filename.rsplit(
        ".",
        1
    )[1].lower()

    return extension in ALLOWED_AVATAR_EXTENSIONS


# === 計算個人資料完成度 ===
def calculate_profile_completion(profile):

    profile_values = [
        profile.phone,
        profile.birthday,
        profile.gender,
        profile.city,
        profile.address,
        profile.occupation,
        profile.website,
        profile.biography,
        profile.avatar_url
    ]

    completed_count = sum(
        1
        for value in profile_values
        if value
    )

    return round(
        completed_count
        / len(profile_values)
        * 100
    )


# === 上傳大頭貼到 Cloudinary ===
def upload_profile_avatar(avatar_file, account):

    if not CLOUDINARY_ENABLED:
        raise ValueError(
            "尚未完成 Cloudinary 設定，"
            "請先設定 CLOUDINARY_CLOUD_NAME、"
            "CLOUDINARY_API_KEY 與 CLOUDINARY_API_SECRET"
        )

    if not avatar_file or not avatar_file.filename:
        return None

    if not allowed_avatar_file(avatar_file.filename):
        raise ValueError(
            "大頭貼只允許 JPG、JPEG、PNG 或 WEBP"
        )

    if avatar_file.mimetype not in ALLOWED_AVATAR_MIME_TYPES:
        raise ValueError(
            "上傳的檔案不是支援的圖片格式"
        )

    avatar_file.stream.seek(
        0,
        os.SEEK_END
    )

    file_size = avatar_file.stream.tell()

    avatar_file.stream.seek(0)

    if file_size > MAX_AVATAR_SIZE:
        raise ValueError(
            "大頭貼檔案不可超過 2 MB"
        )

    # === 不直接把會員帳號放入公開圖片 ID ===
    account_hash = hashlib.sha256(
        account.encode("utf-8")
    ).hexdigest()[:24]

    try:
        upload_result = cloudinary_uploader.upload(
            avatar_file.stream,
            folder="tyy_user_avatars",
            public_id=f"user_{account_hash}",
            overwrite=True,
            invalidate=True,
            resource_type="image",
            transformation=[
                {
                    "width": 600,
                    "height": 600,
                    "crop": "fill",
                    "gravity": "auto",
                    "quality": "auto"
                }
            ]
        )
    except Exception as cloudinary_upload_error:
        print("Cloudinary 上傳失敗：", repr(cloudinary_upload_error))
        raise ValueError(
            "Cloudinary 圖片上傳失敗，請確認 Heroku Config Vars、"
            "Cloudinary 憑證與網路狀態"
        ) from cloudinary_upload_error

    avatar_url = upload_result.get("secure_url")
    avatar_public_id = upload_result.get("public_id")

    if not avatar_url or not avatar_public_id:
        raise ValueError(
            "Cloudinary 未回傳完整圖片資料，請稍後再試"
        )

    return {
        "avatar_url": avatar_url,
        "avatar_public_id": avatar_public_id
    }

#搜尋特定資料夾的檔案  send_from_directory
@app.route("/assets/<path:filename>")
def assets(filename):
    return send_from_directory("static/assets", filename)
#驗證信寄送
def send_mail(email):

    code = str(secrets.randbelow(900000) + 100000)
       
    msg = Message('TYY小站 帳號註冊驗證', sender = app.config['MAIL_USERNAME'], recipients = [email])
    msg.body = f"你的帳號註冊驗證碼為:{code}"
    mail.send(msg)
    return code            

#入口跳轉
@app.route("/")
def index():
    if session.get("account_login"):
        return redirect(url_for("home"))
    return redirect(url_for("login"))

#登入頁面
@app.route('/login', methods=['GET', 'POST'])
def login():
    
    if request.method == "POST":
        account = request.form.get("account")
        password = request.form.get("password")
        user = User.query.filter_by(帳號=account).first()
        password_valid, password_needs_upgrade = verify_user_password(
            user.密碼 if user else None,
            password
        )

        if user and password_valid:
            if password_needs_upgrade:
                user.密碼 = hash_user_password(password)
                db.session.commit()

            preference = get_or_create_user_preference(user)

            session.permanent = True
            session["account_login"] = user.帳號
            session["user_name_login"] = user.姓名
            session["email_login"] = user.email
            session["theme_mode"] = preference.theme_mode
                
            return render_template('success.html',account = session["account_login"] ,
                                                  user_name = session["user_name_login"] ,
                                                  email = session["email_login"])
        else:
            error = "帳號或密碼錯誤"
            return render_template("login.html", error=error, **get_demo_login_context())
        
    return render_template('login.html', **get_demo_login_context())


# === 註冊帳號是否重複：提供前端即時檢查 ===
@app.route("/check_account")
def check_account():

    account = request.args.get(
        "account",
        ""
    ).strip()

    if not account:
        return jsonify({
            "available": False,
            "message": "請先輸入帳號"
        })

    if len(account) > 100:
        return jsonify({
            "available": False,
            "message": "帳號不可超過 100 個字"
        })

    account_exists = User.query.filter_by(
        帳號=account
    ).first() is not None

    if account_exists:
        return jsonify({
            "available": False,
            "message": "此帳號已被使用"
        })

    return jsonify({
        "available": True,
        "message": "此帳號可以使用"
    })


# === 帳號註冊 ===
@app.route("/myregister", methods=["GET", "POST"])
def register():

    account = request.form.get(
        "account",
        ""
    ).strip()

    password = request.form.get(
        "password",
        ""
    )

    user_name = request.form.get(
        "user_name",
        ""
    ).strip()

    email = request.form.get(
        "email",
        ""
    ).strip()

    account_error = None
    password_error = None
    msg = None

    if request.method == "POST":

        action = request.form.get("action")
        input_code = request.form.get(
            "input_code",
            ""
        ).strip()

        # === 後端一定要再次驗證，不能只依賴瀏覽器 JavaScript ===
        if not account:
            account_error = "請輸入帳號"
        elif len(account) > 100:
            account_error = "帳號不可超過 100 個字"
        elif User.query.filter_by(帳號=account).first():
            account_error = "此帳號已被使用，請更換帳號"

        if len(password) < 6 or len(password) > 20:
            password_error = "密碼長度必須為 6～20 個字元"

        if not user_name:
            msg = "請輸入姓名"
        elif not email:
            msg = "請輸入 Email"

        if account_error or password_error or msg:
            return render_template(
                "myregister.html",
                account=account,
                password=password,
                user_name=user_name,
                email=email,
                account_error=account_error,
                password_error=password_error,
                msg=msg
            )

        try:
            if action == "send_code":
                current_time = int(time.time())
                last_sent_at = int(session.get("register_code_last_sent_at", 0))
                window_started_at = int(
                    session.get("register_code_window_started_at", current_time)
                )
                send_count = int(session.get("register_code_send_count", 0))

                if current_time - window_started_at >= 3600:
                    window_started_at = current_time
                    send_count = 0

                if current_time - last_sent_at < REGISTER_CODE_RESEND_COOLDOWN_SECONDS:
                    wait_seconds = (
                        REGISTER_CODE_RESEND_COOLDOWN_SECONDS
                        - (current_time - last_sent_at)
                    )
                    msg = f"請等待 {wait_seconds} 秒後再寄送驗證碼"
                    return render_template(
                        "myregister.html",
                        msg=msg,
                        account=account,
                        password=password,
                        email=email,
                        user_name=user_name
                    )

                if send_count >= REGISTER_CODE_MAX_SENDS_PER_HOUR:
                    msg = "驗證碼寄送次數過多，請一小時後再試"
                    return render_template(
                        "myregister.html",
                        msg=msg,
                        account=account,
                        password=password,
                        email=email,
                        user_name=user_name
                    )

                code = send_mail(email)
                session["register_code_hash"] = digest_registration_code(code)
                session["register_code_expires_at"] = (
                    current_time + REGISTER_CODE_TTL_SECONDS
                )
                session["register_code_attempts"] = 0
                session["register_account"] = account
                session["register_email"] = email
                session["register_code_last_sent_at"] = current_time
                session["register_code_window_started_at"] = window_started_at
                session["register_code_send_count"] = send_count + 1

                msg = "驗證碼已寄出"

                return render_template(
                    "myregister.html",
                    msg=msg,
                    account=account,
                    password=password,
                    email=email,
                    user_name=user_name
                )

            if action == "register":
                code_hash = session.get("register_code_hash")
                code_expires_at = int(
                    session.get("register_code_expires_at", 0)
                )
                code_attempts = int(
                    session.get("register_code_attempts", 0)
                )
                verified_account = session.get(
                    "register_account"
                )
                verified_email = session.get("register_email")
                current_time = int(time.time())

                if not code_hash or not verified_account:
                    msg = "請先寄送驗證碼"

                elif current_time > code_expires_at:
                    clear_registration_verification()
                    msg = "驗證碼已過期，請重新寄送"

                elif code_attempts >= REGISTER_CODE_MAX_ATTEMPTS:
                    clear_registration_verification()
                    msg = "驗證碼錯誤次數過多，請重新寄送"

                elif account != verified_account:
                    account_error = (
                        "帳號已變更，請重新寄送驗證碼"
                    )

                elif email != verified_email:
                    msg = "Email 已變更，請重新寄送驗證碼"

                elif not hmac.compare_digest(
                    digest_registration_code(input_code),
                    code_hash
                ):
                    session["register_code_attempts"] = code_attempts + 1
                    msg = "驗證碼錯誤"

                # === 註冊前再次查詢，避免檢查後被其他人搶先註冊 ===
                elif User.query.filter_by(
                    帳號=account
                ).first():
                    account_error = (
                        "此帳號已被使用，請更換帳號"
                    )

                else:
                    new_user = User(
                        帳號=account,
                        密碼=hash_user_password(password),
                        姓名=user_name,
                        email=email
                    )

                    new_profile = UserProfile(
                        user_account=account
                    )

                    new_preference = UserPreference(
                        user_account=account,
                        theme_mode="light"
                    )

                    db.session.add(new_user)
                    db.session.add(new_profile)
                    db.session.add(new_preference)
                    db.session.commit()

                    clear_registration_verification()

                    return render_template(
                        "register_success.html",
                        user_name=user_name
                    )

                return render_template(
                    "myregister.html",
                    msg=msg,
                    account=account,
                    password=password,
                    email=email,
                    user_name=user_name,
                    account_error=account_error,
                    password_error=password_error
                )

        except Exception as error:
            db.session.rollback()
            print("註冊錯誤：", error)

            msg = "註冊時發生錯誤，請稍後再試"

            return render_template(
                "myregister.html",
                msg=msg,
                account=account,
                password=password,
                email=email,
                user_name=user_name,
                account_error=account_error,
                password_error=password_error
            )

    return render_template(
        "myregister.html"
    )


#註冊成功資訊
@app.route('/register_success', methods=['GET', 'POST'])
def register_success():
        return render_template('login.html', **get_demo_login_context()) 
    

# === 建立網站功能清單，供首頁與搜尋共用 ===
def get_feature_items():

    feature_items = []

    for feature in FEATURES:
        item = feature.copy()
        item["url"] = url_for(feature["endpoint"])
        feature_items.append(item)

    return feature_items


# === 整理首頁 Dashboard 資料 ===
def get_dashboard_context():

    feature_items = get_feature_items()

    category_counts = {}

    for item in feature_items:
        category = item["category"]
        category_counts[category] = category_counts.get(category, 0) + 1

    # === 首頁常用功能固定最多顯示 6 個 ===
    featured_items = [
        item
        for item in feature_items
        if item.get("featured")
    ][:6]

    # === 首頁只顯示最新一日更新，歷史公告由獨立頁面查看 ===
    latest_update = get_latest_update()

    return {
        "feature_items": feature_items,
        "featured_items": featured_items,
        "category_counts": category_counts,
        "total_feature_count": len(feature_items),
        "latest_update": latest_update
    }


# === 右側主頁 Dashboard 內容 ===
@app.route("/home_dashboard")
def home_dashboard():

    if not session.get("account_login"):
        return redirect(url_for("login"))

    dashboard_context = get_dashboard_context()

    return render_template(
        "home_dashboard.html",
        user_name=session.get("user_name_login"),
        **dashboard_context
    )


# === 全站功能搜尋 ===
@app.route("/site_search")
def site_search():

    if not session.get("account_login"):
        return redirect(url_for("login"))

    keyword = request.args.get(
        "keyword",
        ""
    ).strip()

    # === 沒有輸入關鍵字時，回到主頁內容 ===
    if not keyword:
        dashboard_context = get_dashboard_context()

        return render_template(
            "home_dashboard.html",
            user_name=session.get("user_name_login"),
            **dashboard_context
        )

    keyword_lower = keyword.casefold()

    search_results = []

    for item in get_feature_items():

        search_text = " ".join([
            item["title"],
            item["category"],
            item["description"],
            " ".join(item.get("keywords", []))
        ]).casefold()

        if keyword_lower in search_text:
            search_results.append(item)

    return render_template(
        "site_search_results.html",
        keyword=keyword,
        search_results=search_results
    )


# === 網站更新公告：日期列表 ===
@app.route("/update_history")
def update_history():

    if not session.get("account_login"):
        return redirect(url_for("login"))

    return render_template(
        "update_history.html",
        site_updates=SITE_UPDATES
    )


# === 網站更新公告：單日完整內容 ===
@app.route("/update_history/<update_slug>")
def update_detail(update_slug):

    if not session.get("account_login"):
        return redirect(url_for("login"))

    update = get_update_by_slug(update_slug)

    if update is None:
        return render_template(
            "update_detail.html",
            update=None,
            error_message="找不到這筆更新公告"
        ), 404

    return render_template(
        "update_detail.html",
        update=update,
        error_message=None
    )


# === 關於我 ===
@app.route("/about_me")
def about_me():

    if not session.get("account_login"):
        return redirect(url_for("login"))

    dashboard_context = get_dashboard_context()

    return render_template(
        "about_me.html",
        total_feature_count=dashboard_context["total_feature_count"],
        category_counts=dashboard_context["category_counts"]
    )


# === 使用技術 ===
@app.route("/technology_overview")
def technology_overview():

    if not session.get("account_login"):
        return redirect(url_for("login"))

    return render_template(
        "technology_overview.html"
    )


# === 法律頁面共用資料 ===
def get_legal_page_context():

    return {
        "legal_last_updated": "2026 年 7 月 10 日",
        "legal_contact_email": os.getenv(
            "LEGAL_CONTACT_EMAIL",
            ""
        ).strip()
    }


# === 使用條款：右側內容版本 ===
@app.route("/terms_of_use")
def terms_of_use():

    return render_template(
        "terms_of_use.html",
        **get_legal_page_context()
    )


# === 隱私權政策：右側內容版本 ===
@app.route("/privacy_policy")
def privacy_policy():

    return render_template(
        "privacy_policy.html",
        **get_legal_page_context()
    )


# === 使用條款：可直接公開瀏覽的完整頁面 ===
@app.route("/legal/terms")
def public_terms_of_use():

    return render_template(
        "legal_page.html",
        page_title="使用條款",
        content_template="terms_of_use.html",
        **get_legal_page_context()
    )


# === 隱私權政策：可直接公開瀏覽的完整頁面 ===
@app.route("/legal/privacy")
def public_privacy_policy():

    return render_template(
        "legal_page.html",
        page_title="隱私權政策",
        content_template="privacy_policy.html",
        **get_legal_page_context()
    )


# === 儲存會員的深色／一般模式偏好 ===
@app.route("/update_theme", methods=["POST"])
def update_theme():

    account = session.get("account_login")

    if not account:
        return jsonify({
            "success": False,
            "message": "登入狀態已失效"
        }), 401

    request_data = request.get_json(
        silent=True
    ) or {}

    theme_mode = request_data.get(
        "theme_mode",
        ""
    ).strip().lower()

    if theme_mode not in {"light", "dark"}:
        return jsonify({
            "success": False,
            "message": "不支援的顯示模式"
        }), 400

    user = User.query.filter_by(
        帳號=account
    ).first()

    if not user:
        session.clear()

        return jsonify({
            "success": False,
            "message": "找不到會員資料"
        }), 404

    try:
        preference = get_or_create_user_preference(
            user
        )

        preference.theme_mode = theme_mode
        db.session.commit()

        session["theme_mode"] = theme_mode

        return jsonify({
            "success": True,
            "theme_mode": theme_mode
        })

    except Exception as error:
        db.session.rollback()
        print("更新主題模式錯誤：", error)

        return jsonify({
            "success": False,
            "message": "儲存顯示模式時發生錯誤"
        }), 500


# === 登出 ===
@app.route("/logout", methods=["POST"])
def logout():

    session.clear()

    return redirect(
        url_for("login")
    )


#會員主頁
@app.route("/home")
def home():

    account = session.get("account_login")

    if not account:
        return redirect(url_for("login"))

    user = User.query.filter_by(
        帳號=account
    ).first()

    if not user:
        session.clear()
        return redirect(url_for("login"))

    profile = get_or_create_user_profile(user)
    preference = get_or_create_user_preference(user)

    session["theme_mode"] = preference.theme_mode

    dashboard_context = get_dashboard_context()

    return render_template(
        "home.html",
        account=user.帳號,
        user_name=user.姓名,
        email=user.email,
        avatar_url=get_profile_avatar_url(profile),
        theme_mode=preference.theme_mode,
        **dashboard_context
    )


# === 個人資料：顯示與修改 ===
@app.route(
    "/personal_information",
    methods=["GET", "POST"]
)
def personal_information():

    account = session.get("account_login")

    if not account:
        return redirect(url_for("login"))

    user = User.query.filter_by(
        帳號=account
    ).first()

    if not user:
        session.clear()
        return redirect(url_for("login"))

    profile = get_or_create_user_profile(user)

    success_message = None
    error_message = None

    if request.method == "POST":

        try:
            user_name = request.form.get(
                "user_name",
                ""
            ).strip()

            phone = request.form.get(
                "phone",
                ""
            ).strip()

            birthday_text = request.form.get(
                "birthday",
                ""
            ).strip()

            gender = request.form.get(
                "gender",
                ""
            ).strip()

            city = request.form.get(
                "city",
                ""
            ).strip()

            address = request.form.get(
                "address",
                ""
            ).strip()

            occupation = request.form.get(
                "occupation",
                ""
            ).strip()

            website = request.form.get(
                "website",
                ""
            ).strip()

            biography = request.form.get(
                "biography",
                ""
            ).strip()

            reset_avatar = (
                request.form.get("reset_avatar")
                == "1"
            )

            avatar_file = request.files.get(
                "avatar"
            )

            if not user_name:
                raise ValueError(
                    "姓名不可空白"
                )

            if len(user_name) > 100:
                raise ValueError(
                    "姓名不可超過 100 個字"
                )

            if phone and not re.fullmatch(
                r"[0-9+\-()\s]{6,30}",
                phone
            ):
                raise ValueError(
                    "手機格式不正確，只能包含數字、空格、+、- 與括號"
                )

            birthday_value = None

            if birthday_text:
                try:
                    birthday_value = date.fromisoformat(
                        birthday_text
                    )
                except ValueError:
                    raise ValueError(
                        "生日格式不正確"
                    )

                if birthday_value > date.today():
                    raise ValueError(
                        "生日不可晚於今天"
                    )

            allowed_genders = {
                "",
                "male",
                "female",
                "other",
                "private"
            }

            if gender not in allowed_genders:
                raise ValueError(
                    "性別選項不正確"
                )

            if len(city) > 100:
                raise ValueError(
                    "所在城市不可超過 100 個字"
                )

            if len(address) > 255:
                raise ValueError(
                    "地址不可超過 255 個字"
                )

            if len(occupation) > 100:
                raise ValueError(
                    "職業不可超過 100 個字"
                )

            if len(website) > 255:
                raise ValueError(
                    "個人網站不可超過 255 個字"
                )

            if len(biography) > 500:
                raise ValueError(
                    "自我介紹不可超過 500 個字"
                )

            if website and not website.startswith(
                ("http://", "https://")
            ):
                website = "https://" + website

            if reset_avatar:

                if (
                    profile.avatar_public_id
                    and CLOUDINARY_ENABLED
                ):
                    cloudinary_uploader.destroy(
                        profile.avatar_public_id,
                        invalidate=True
                    )

                profile.avatar_url = None
                profile.avatar_public_id = None

            if avatar_file and avatar_file.filename:

                avatar_result = upload_profile_avatar(
                    avatar_file,
                    account
                )

                profile.avatar_url = avatar_result[
                    "avatar_url"
                ]

                profile.avatar_public_id = avatar_result[
                    "avatar_public_id"
                ]

            user.姓名 = user_name

            profile.phone = phone or None
            profile.birthday = birthday_value
            profile.gender = gender or None
            profile.city = city or None
            profile.address = address or None
            profile.occupation = occupation or None
            profile.website = website or None
            profile.biography = biography or None

            db.session.commit()

            session["user_name_login"] = user.姓名

            success_message = "個人資料已成功更新"

        except ValueError as error:
            db.session.rollback()
            error_message = str(error)

        except Exception as error:
            db.session.rollback()
            print("更新個人資料錯誤：", error)
            error_message = "更新個人資料時發生錯誤，請稍後再試"

    avatar_url = get_profile_avatar_url(
        profile
    )

    return render_template(
        "personal_information.html",
        account=user.帳號,
        user_name=user.姓名,
        email=user.email,
        profile=profile,
        avatar_url=avatar_url,
        default_avatar_url=url_for(
            "static",
            filename=DEFAULT_AVATAR_PATH
        ),
        profile_completion=calculate_profile_completion(
            profile
        ),
        cloudinary_enabled=CLOUDINARY_ENABLED,
        cloudinary_status=get_cloudinary_status_context(),
        success_message=success_message,
        error_message=error_message
    )


#主程式
if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)
