from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "user_data"

    帳號 = db.Column(db.String(100), primary_key=True)
    密碼 = db.Column(db.String(100), nullable=False)
    姓名 = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(255), nullable=False)

    # === 一位會員對應一份個人資料 ===
    profile = db.relationship(
        "UserProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan"
    )

    # === 一位會員對應一份網站偏好設定 ===
    preference = db.relationship(
        "UserPreference",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan"
    )


    # === 一位會員可以提供多筆 MNIST 手寫辨識回饋 ===
    mnist_feedback_samples = db.relationship(
        "MnistFeedbackSample",
        back_populates="user",
        cascade="all, delete-orphan"
    )


    # === 一位會員可以建立多份人工膝關節醫療品質資料集 ===
    medical_knee_datasets = db.relationship(
        "MedicalKneeDataset",
        back_populates="user",
        cascade="all, delete-orphan"
    )


class UserProfile(db.Model):
    __tablename__ = "user_profiles"

    # === 直接使用會員帳號作為一對一主鍵與外鍵 ===
    user_account = db.Column(
        db.String(100),
        db.ForeignKey("user_data.帳號", ondelete="CASCADE"),
        primary_key=True
    )

    phone = db.Column(db.String(30))
    birthday = db.Column(db.Date)
    gender = db.Column(db.String(20))
    city = db.Column(db.String(100))
    address = db.Column(db.String(255))
    occupation = db.Column(db.String(100))
    website = db.Column(db.String(255))
    biography = db.Column(db.Text)

    # === Cloudinary 圖片資訊 ===
    avatar_url = db.Column(db.String(500))
    avatar_public_id = db.Column(db.String(255))

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )

    user = db.relationship(
        "User",
        back_populates="profile"
    )


class UserPreference(db.Model):
    __tablename__ = "user_preferences"

    # === 帳號同時作為主鍵與外鍵，與會員形成一對一關係 ===
    user_account = db.Column(
        db.String(100),
        db.ForeignKey("user_data.帳號", ondelete="CASCADE"),
        primary_key=True
    )

    # === light：一般模式；dark：深色模式 ===
    theme_mode = db.Column(
        db.String(20),
        nullable=False,
        default="light"
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )

    user = db.relationship(
        "User",
        back_populates="preference"
    )


# === MNIST 使用者手寫資料與辨識回饋 ===
class MnistFeedbackSample(db.Model):
    __tablename__ = "mnist_feedback_samples"

    id = db.Column(
        db.Integer,
        primary_key=True,
        autoincrement=True
    )

    # === 提供這筆資料的會員 ===
    user_account = db.Column(
        db.String(100),
        db.ForeignKey("user_data.帳號", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # === machine_learning 或 deep_learning ===
    model_type = db.Column(
        db.String(30),
        nullable=False,
        index=True
    )

    # === 28 x 28，共 784 個 0～255 像素，以 JSON 字串保存 ===
    pixel_data = db.Column(
        db.Text,
        nullable=False
    )

    predicted_label = db.Column(
        db.Integer,
        nullable=False
    )

    # === 使用者回報後才會有正確答案 ===
    correct_label = db.Column(
        db.Integer
    )

    confidence = db.Column(
        db.Float,
        nullable=False
    )

    is_correct = db.Column(
        db.Boolean
    )

    # === pending：等待回饋；confirmed：已確認答案 ===
    feedback_status = db.Column(
        db.String(20),
        nullable=False,
        default="pending",
        index=True
    )

    # === 匯出並加入訓練資料後可標記為 True ===
    used_for_training = db.Column(
        db.Boolean,
        nullable=False,
        default=False,
        index=True
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    feedback_at = db.Column(
        db.DateTime
    )

    user = db.relationship(
        "User",
        back_populates="mnist_feedback_samples"
    )


# === 人工膝關節品質分析：會員獨立資料集 ===
class MedicalKneeDataset(db.Model):
    __tablename__ = "medical_knee_datasets"

    id = db.Column(
        db.Integer,
        primary_key=True,
        autoincrement=True
    )

    user_account = db.Column(
        db.String(100),
        db.ForeignKey("user_data.帳號", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    dataset_name = db.Column(
        db.String(120),
        nullable=False
    )

    # === upload：CSV 匯入；manual：手動輸入 ===
    source_type = db.Column(
        db.String(20),
        nullable=False,
        default="upload"
    )

    original_filename = db.Column(
        db.String(255)
    )

    row_count = db.Column(
        db.Integer,
        nullable=False,
        default=0
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )

    user = db.relationship(
        "User",
        back_populates="medical_knee_datasets"
    )

    records = db.relationship(
        "MedicalKneeRecord",
        back_populates="dataset",
        cascade="all, delete-orphan",
        order_by="MedicalKneeRecord.period"
    )


# === 人工膝關節品質分析：標準化資料列 ===
class MedicalKneeRecord(db.Model):
    __tablename__ = "medical_knee_records"

    id = db.Column(
        db.Integer,
        primary_key=True,
        autoincrement=True
    )

    dataset_id = db.Column(
        db.Integer,
        db.ForeignKey("medical_knee_datasets.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    period = db.Column(
        db.String(30),
        nullable=False,
        index=True
    )

    institution_code = db.Column(
        db.String(20),
        nullable=False,
        index=True
    )

    institution_name = db.Column(
        db.String(255),
        nullable=False,
        index=True
    )

    contract_type = db.Column(
        db.Integer,
        nullable=False,
        index=True
    )

    infection_cases = db.Column(
        db.Integer,
        nullable=False
    )

    replacement_cases = db.Column(
        db.Integer,
        nullable=False
    )

    patient_count = db.Column(
        db.Integer,
        nullable=False
    )

    infection_rate = db.Column(
        db.Float,
        nullable=False
    )

    surgeon_count = db.Column(
        db.Integer,
        nullable=False
    )

    average_age = db.Column(
        db.Float,
        nullable=False
    )

    catastrophic_rate = db.Column(
        db.Float,
        nullable=False
    )

    catastrophic_count = db.Column(
        db.Integer,
        nullable=False
    )

    county_code = db.Column(
        db.String(10),
        nullable=False,
        index=True
    )

    township_code = db.Column(
        db.String(20),
        nullable=False,
        index=True
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    dataset = db.relationship(
        "MedicalKneeDataset",
        back_populates="records"
    )

    __table_args__ = (
        db.UniqueConstraint(
            "dataset_id",
            "period",
            "institution_code",
            name="uq_medical_knee_dataset_period_institution"
        ),
    )


class Airline(db.Model):
    __tablename__ = "airlines"

    id = db.Column(db.Integer, primary_key=True)
    airline_code = db.Column(db.String(10), unique=True, nullable=False)


class Airport(db.Model):
    __tablename__ = "airports"

    id = db.Column(db.Integer, primary_key=True)
    airport_code = db.Column(db.String(10), unique=True, nullable=False)


class FlightGroup(db.Model):
    __tablename__ = "flight_groups"

    id = db.Column(db.Integer, primary_key=True)

    direction = db.Column(db.String(20), nullable=False)

    departure_airport_id = db.Column(db.Integer, db.ForeignKey("airports.id"), nullable=False)
    arrival_airport_id = db.Column(db.Integer, db.ForeignKey("airports.id"), nullable=False)

    schedule_time = db.Column(db.String(30))
    estimated_time = db.Column(db.String(30))
    actual_time = db.Column(db.String(30))

    terminal = db.Column(db.String(10))
    gate = db.Column(db.String(20))
    is_cargo = db.Column(db.Boolean, default=False)

    departure_airport = db.relationship("Airport", foreign_keys=[departure_airport_id])
    arrival_airport = db.relationship("Airport", foreign_keys=[arrival_airport_id])


class Flight(db.Model):
    __tablename__ = "flights"

    id = db.Column(db.Integer, primary_key=True)

    flight_group_id = db.Column(db.Integer, db.ForeignKey("flight_groups.id"), nullable=False)

    flight_date = db.Column(db.String(20), nullable=False)
    direction = db.Column(db.String(20), nullable=False)
    flight_number = db.Column(db.String(20), nullable=False)

    airline_id = db.Column(db.Integer, db.ForeignKey("airlines.id"), nullable=False)
    departure_airport_id = db.Column(db.Integer, db.ForeignKey("airports.id"), nullable=False)
    arrival_airport_id = db.Column(db.Integer, db.ForeignKey("airports.id"), nullable=False)

    is_cargo = db.Column(db.Boolean, default=False)

    flight_group = db.relationship("FlightGroup")
    airline = db.relationship("Airline")
    departure_airport = db.relationship("Airport", foreign_keys=[departure_airport_id])
    arrival_airport = db.relationship("Airport", foreign_keys=[arrival_airport_id])


class FlightStatus(db.Model):
    __tablename__ = "flight_statuses"

    id = db.Column(db.Integer, primary_key=True)

    flight_id = db.Column(db.Integer, db.ForeignKey("flights.id"), nullable=False)

    estimated_time = db.Column(db.String(30))
    actual_time = db.Column(db.String(30))

    delay_minutes = db.Column(db.Integer)
    status = db.Column(db.String(20))
    remark = db.Column(db.String(50))

    aircraft_type = db.Column(db.String(50))
    check_counter = db.Column(db.String(50))
    baggage_claim = db.Column(db.String(50))
    update_time = db.Column(db.String(40))

    flight = db.relationship("Flight")