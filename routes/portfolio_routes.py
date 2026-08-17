from flask import Blueprint, render_template, request, session, redirect, url_for, Response, abort, send_file, jsonify
from functools import lru_cache
from datetime import datetime
from pathlib import Path
from werkzeug.utils import secure_filename
from sqlalchemy.exc import IntegrityError
from sqlalchemy import case, distinct, func
import io
import os
import re
import csv
import pandas as pd

from models import (
    db,
    Airline,
    Airport,
    FlightGroup,
    Flight,
    FlightStatus,
    MedicalKneeDataset,
    MedicalKneeRecord
)

# === 建立作品集 Blueprint ===
portfolio_bp = Blueprint("portfolio_bp",__name__)



# === 桃園機場航班查詢系統 ===
@portfolio_bp.route("/flight_system", methods=["GET"])
def flight_system():

    keyword = request.args.get("keyword", "").strip()
    date_filter = request.args.get("date_filter")
    status_filter = request.args.get("status_filter")
    direction_filter = request.args.get("direction_filter")
    cargo_filter = request.args.get("cargo_filter")

    page = request.args.get("page", 1, type=int)
    per_page = 50

    result_list = []

    query = (
        FlightStatus.query
        .join(Flight)
        .join(Airline)
        .order_by(Flight.flight_date.desc(), FlightStatus.delay_minutes.desc())
    )

    if keyword:
        query = query.filter(
            (Airline.airline_code.contains(keyword)) |
            (Flight.flight_number.contains(keyword))
        )

    if date_filter:
        query = query.filter(Flight.flight_date == date_filter)

    if status_filter:
        query = query.filter(FlightStatus.status == status_filter)

    if direction_filter:
        query = query.filter(Flight.direction == direction_filter)

    if cargo_filter == "cargo":
        query = query.filter(Flight.is_cargo == True)

    elif cargo_filter == "passenger":
        query = query.filter(Flight.is_cargo == False)

    pagination = query.paginate(
        page=page,
        per_page=per_page,
        error_out=False
    )

    flight_statuses = pagination.items

    for status in flight_statuses:
        flight = status.flight

        result_list.append({
            "flight_date": flight.flight_date,
            "airline_code": flight.airline.airline_code,
            "flight_number": flight.flight_number,
            "direction": flight.direction,
            "departure_airport": flight.departure_airport.airport_code,
            "arrival_airport": flight.arrival_airport.airport_code,
            "status": status.status,
            "delay_minutes": status.delay_minutes,
            "estimated_time": status.estimated_time,
            "actual_time": status.actual_time,
            "remark": status.remark,
            "is_cargo": flight.is_cargo
        })

    return render_template(
        "flight_system.html",
        keyword=keyword,
        date_filter=date_filter,
        status_filter=status_filter,
        direction_filter=direction_filter,
        cargo_filter=cargo_filter,
        result_list=result_list,
        pagination=pagination,
        tdx_update_available=bool(os.getenv("CLIENT_ID") and os.getenv("CLIENT_SECRET"))
    )


# === 手動更新桃園機場航班資料 ===
@portfolio_bp.route("/flight_system/update", methods=["POST"])
def flight_system_update():
    # GitHub / Demo 公開版不附真實 TDX 帳密。
    # 若部署者自行設定 CLIENT_ID / CLIENT_SECRET，按鈕即可實際抓取並更新資料庫。
    if not os.getenv("CLIENT_ID") or not os.getenv("CLIENT_SECRET"):
        return jsonify({
            "ok": False,
            "demo": True,
            "message": "Demo 公開版未配置 TDX API 帳密，因此無法執行即時更新；正式部署設定 CLIENT_ID / CLIENT_SECRET 後，此按鈕可直接向 TDX 抓取最新航班資料並寫入資料庫。"
        }), 409

    try:
        # 延遲匯入，避免啟動 Flask 時產生不必要的循環匯入。
        from flight_update import get_tdx_flight, clean_all_flights, import_clean_to_db

        raw_data = get_tdx_flight()
        if not raw_data:
            raise RuntimeError("TDX 未回傳航班資料")

        clean_flights = clean_all_flights(raw_data[0])
        result = import_clean_to_db(clean_flights)

        return jsonify({
            "ok": True,
            "message": f"更新完成：處理 {result['processed_flight_count']} 筆航班、{result['processed_status_count']} 筆航班狀態。"
        })
    except Exception as exc:
        db.session.rollback()
        return jsonify({
            "ok": False,
            "message": f"航班更新失敗：{exc}"
        }), 500


# === 航班分析總覽 ===
@portfolio_bp.route("/flight_analysis", methods=["GET"])
def flight_analysis():

    # === 取得日期篩選條件 ===
    date_filter = request.args.get("date_filter", "").strip()

    # === 航班基本查詢 ===
    flight_query = Flight.query

    # === 航班狀態查詢，連接 Flight 才能依日期篩選 ===
    status_query = (
        FlightStatus.query
        .join(Flight, FlightStatus.flight_id == Flight.id)
    )

    # === 有選擇日期時，所有分析資料都套用相同日期 ===
    if date_filter:
        flight_query = flight_query.filter(
            Flight.flight_date == date_filter
        )

        status_query = status_query.filter(
            Flight.flight_date == date_filter
        )

    flight_summary = flight_query.with_entities(
        func.count(Flight.id),
        func.count(distinct(Flight.flight_group_id)),
        func.count(distinct(Flight.airline_id)),
        func.sum(case((Flight.direction == "departure", 1), else_=0)),
        func.sum(case((Flight.direction == "arrival", 1), else_=0)),
        func.sum(case((Flight.is_cargo.is_(False), 1), else_=0)),
        func.sum(case((Flight.is_cargo.is_(True), 1), else_=0))
    ).one()

    (
        total_flights,
        actual_flight_count,
        airline_count,
        departure_count,
        arrival_count,
        passenger_count,
        cargo_count
    ) = [value or 0 for value in flight_summary]

    departure_airports = flight_query.with_entities(
        Flight.departure_airport_id.label("airport_id")
    ).filter(Flight.departure_airport_id.isnot(None))
    arrival_airports = flight_query.with_entities(
        Flight.arrival_airport_id.label("airport_id")
    ).filter(Flight.arrival_airport_id.isnot(None))
    airport_union = departure_airports.union(arrival_airports).subquery()
    airport_count = db.session.query(func.count()).select_from(
        airport_union
    ).scalar() or 0

    status_summary = status_query.with_entities(
        func.sum(case((FlightStatus.status == "延誤", 1), else_=0)),
        func.sum(case((FlightStatus.status == "準點", 1), else_=0)),
        func.sum(case((FlightStatus.status == "提早", 1), else_=0)),
        func.sum(case((FlightStatus.status == "取消", 1), else_=0)),
        func.sum(case((FlightStatus.status.in_(["尚未起飛", "尚未抵達"]), 1), else_=0)),
        func.avg(case(
            (FlightStatus.status == "延誤", FlightStatus.delay_minutes),
            else_=None
        ))
    ).one()

    delayed_count = status_summary[0] or 0
    on_time_count = status_summary[1] or 0
    early_count = status_summary[2] or 0
    cancelled_count = status_summary[3] or 0
    unfinished_count = status_summary[4] or 0
    average_delay = round(float(status_summary[5] or 0), 2)

    # === 延誤率與取消率 ===
    if total_flights > 0:
        delay_rate = round(
            delayed_count / total_flights * 100,
            2
        )

        cancellation_rate = round(
            cancelled_count / total_flights * 100,
            2
        )
    else:
        delay_rate = 0
        cancellation_rate = 0

    min_date, max_date = db.session.query(
        func.min(Flight.flight_date),
        func.max(Flight.flight_date)
    ).filter(Flight.flight_date.isnot(None)).one()
    min_date = min_date or ""
    max_date = max_date or ""

    # === 整理傳給 HTML 的分析資料 ===
    analysis = {
        "total_flights": total_flights,
        "actual_flight_count": actual_flight_count,
        "airline_count": airline_count,
        "airport_count": airport_count,
        "departure_count": departure_count,
        "arrival_count": arrival_count,
        "passenger_count": passenger_count,
        "cargo_count": cargo_count,
        "delayed_count": delayed_count,
        "on_time_count": on_time_count,
        "early_count": early_count,
        "cancelled_count": cancelled_count,
        "unfinished_count": unfinished_count,
        "average_delay": average_delay,
        "delay_rate": delay_rate,
        "cancellation_rate": cancellation_rate
    }

    return render_template(
        "flight_analysis.html",
        analysis=analysis,
        date_filter=date_filter,
        min_date=min_date,
        max_date=max_date
    )


# =========================================================
# === 醫療資料分析：抗憂鬱藥物使用人數 ===================
# =========================================================

MEDICAL_DATA_FILENAME = "A21030000I-L50007-001.csv"

MEDICAL_GENDER_COLUMNS = {
    "男性": "性別＿男",
    "女性": "性別＿女"
}

MEDICAL_AGE_COLUMNS = {
    "30歲以下": "年齡別＿30歲以下",
    "31－40歲": "年齡別＿31－40歲",
    "41－50歲": "年齡別＿41－50歲",
    "51－65歲": "年齡別＿51－65歲",
    "65歲以上": "年齡別＿65歲以上"
}

MEDICAL_BRANCH_COLUMNS = {
    "臺北業務組": "臺北業務組",
    "北區業務組": "北區業務組",
    "中區業務組": "中區業務組",
    "南區業務組": "南區業務組",
    "高屏業務組": "高屏業務組",
    "東區業務組": "東區業務組"
}


def _medical_safe_int(value):
    """把 pandas 數值轉成可安全交給 JSON 的 Python int / None。"""

    if pd.isna(value):
        return None

    return int(value)


def _medical_percent(numerator, denominator):
    """計算百分比，避免 0 除錯誤。"""

    if denominator in (None, 0) or numerator is None:
        return None

    return round(numerator / denominator * 100, 2)


@lru_cache(maxsize=4)
def _load_medical_analysis_payload(csv_path, file_modified_time):
    """
    讀取並整理醫療資料。

    file_modified_time 會成為快取鍵的一部分；CSV 更新後會自動重新讀取，
    不必在每次開啟頁面時重複解析檔案。
    """

    dataframe = pd.read_csv(
        csv_path,
        encoding="utf-8-sig"
    )

    required_columns = [
        "年別",
        "抗憂鬱藥物使用人數",
        *MEDICAL_GENDER_COLUMNS.values(),
        *MEDICAL_AGE_COLUMNS.values(),
        *MEDICAL_BRANCH_COLUMNS.values()
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in dataframe.columns
    ]

    if missing_columns:
        raise ValueError(
            "醫療資料缺少必要欄位："
            + "、".join(missing_columns)
        )

    # === 官方資料以「…」表示尚未提供，統一轉成空值 ===
    dataframe = dataframe.replace({
        "…": pd.NA,
        "...": pd.NA,
        "－": pd.NA,
        "-": pd.NA,
        "": pd.NA
    })

    # === 年別與所有分析欄位統一轉成數字 ===
    for column in dataframe.columns:
        dataframe[column] = pd.to_numeric(
            dataframe[column],
            errors="coerce"
        )

    dataframe = (
        dataframe
        .dropna(subset=["年別", "抗憂鬱藥物使用人數"])
        .sort_values("年別")
        .reset_index(drop=True)
    )

    if dataframe.empty:
        raise ValueError("醫療資料沒有可分析的年度紀錄")

    # === 縣市欄位：業務組＿縣市 ===
    city_columns = []

    for column in dataframe.columns:
        if "＿" not in column:
            continue

        prefix, city_name = column.split("＿", 1)

        if prefix in MEDICAL_BRANCH_COLUMNS and city_name:
            city_columns.append((city_name, column, prefix))

    years = []
    national_records = []
    gender_records = []
    age_records = []
    branch_records = []
    city_records = {}
    raw_records = []

    first_total = int(dataframe.iloc[0]["抗憂鬱藥物使用人數"])
    previous_total = None

    for _, row in dataframe.iterrows():
        year_roc = int(row["年別"])
        year_ce = year_roc + 1911
        year_key = str(year_roc)
        year_label = f"民國 {year_roc} 年"
        total = int(row["抗憂鬱藥物使用人數"])

        yoy = None
        annual_change = None

        if previous_total not in (None, 0):
            annual_change = total - previous_total
            yoy = round(
                annual_change / previous_total * 100,
                2
            )

        years.append({
            "roc": year_roc,
            "ce": year_ce,
            "key": year_key,
            "label": year_label,
            "short_label": str(year_roc)
        })

        national_records.append({
            "year": year_roc,
            "year_ce": year_ce,
            "label": year_label,
            "total": total,
            "annual_change": annual_change,
            "yoy": yoy,
            "index": round(total / first_total * 100, 2)
        })

        gender_values = {
            label: _medical_safe_int(row[column])
            for label, column in MEDICAL_GENDER_COLUMNS.items()
        }

        gender_records.append({
            "year": year_roc,
            "label": year_label,
            "values": gender_values,
            "shares": {
                label: _medical_percent(value, total)
                for label, value in gender_values.items()
            }
        })

        age_values = {
            label: _medical_safe_int(row[column])
            for label, column in MEDICAL_AGE_COLUMNS.items()
        }

        age_records.append({
            "year": year_roc,
            "label": year_label,
            "values": age_values,
            "shares": {
                label: _medical_percent(value, total)
                for label, value in age_values.items()
            }
        })

        branch_values = {
            label: _medical_safe_int(row[column])
            for label, column in MEDICAL_BRANCH_COLUMNS.items()
        }

        branch_records.append({
            "year": year_roc,
            "label": year_label,
            "values": branch_values
        })

        year_city_values = {}

        for city_name, column, branch_name in city_columns:
            city_value = _medical_safe_int(row[column])

            if city_value is not None:
                year_city_values[city_name] = {
                    "value": city_value,
                    "branch": branch_name
                }

        city_records[year_key] = year_city_values

        raw_record = {
            "year": year_roc,
            "year_ce": year_ce,
            "total": total,
            "male": gender_values["男性"],
            "female": gender_values["女性"],
            "under_30": age_values["30歲以下"],
            "age_31_40": age_values["31－40歲"],
            "age_41_50": age_values["41－50歲"],
            "age_51_65": age_values["51－65歲"],
            "over_65": age_values["65歲以上"]
        }

        raw_records.append(raw_record)
        previous_total = total

    first_record = national_records[0]
    latest_record = national_records[-1]
    latest_gender = gender_records[-1]
    latest_age = age_records[-1]
    latest_branch = branch_records[-1]

    period_count = len(national_records) - 1

    if period_count > 0 and first_record["total"] > 0:
        cagr = round(
            (
                latest_record["total"]
                / first_record["total"]
            ) ** (1 / period_count) * 100 - 100,
            2
        )
    else:
        cagr = 0

    valid_growth_records = [
        record
        for record in national_records
        if record["yoy"] is not None
    ]

    largest_growth_record = max(
        valid_growth_records,
        key=lambda record: record["yoy"],
        default=None
    )

    latest_city_values = city_records.get(
        str(latest_record["year"]),
        {}
    )

    latest_city_ranking = sorted(
        [
            {
                "city": city_name,
                "value": city_data["value"],
                "branch": city_data["branch"]
            }
            for city_name, city_data in latest_city_values.items()
        ],
        key=lambda item: item["value"],
        reverse=True
    )

    city_available_years = [
        int(year_key)
        for year_key, values in city_records.items()
        if values
    ]

    latest_age_ranking = sorted(
        latest_age["values"].items(),
        key=lambda item: item[1] or 0,
        reverse=True
    )

    latest_branch_ranking = sorted(
        latest_branch["values"].items(),
        key=lambda item: item[1] or 0,
        reverse=True
    )

    branch_sum_latest = sum(
        value or 0
        for value in latest_branch["values"].values()
    )

    city_sum_latest = sum(
        item["value"]
        for item in latest_city_values.values()
    )

    payload = {
        "metadata": {
            "title": "臺灣抗憂鬱藥物使用趨勢分析",
            "dataset_name": "抗憂鬱藥物使用人數",
            "provider": "衛生福利部中央健康保險署",
            "platform": "政府資料開放平臺／健保資料開放服務",
            "source_url": "https://data.gov.tw/dataset/146577",
            "resource_id": "A21030000I-L50007-001",
            "official_metadata_updated_at": "2025-09-18",
            "first_year": first_record["year"],
            "latest_year": latest_record["year"],
            "year_count": len(years),
            "city_first_year": min(city_available_years) if city_available_years else None
        },
        "years": years,
        "national": national_records,
        "gender": {
            "labels": list(MEDICAL_GENDER_COLUMNS.keys()),
            "records": gender_records
        },
        "age": {
            "labels": list(MEDICAL_AGE_COLUMNS.keys()),
            "records": age_records
        },
        "branch": {
            "labels": list(MEDICAL_BRANCH_COLUMNS.keys()),
            "records": branch_records
        },
        "city": {
            "labels": sorted({
                city_name
                for city_name, _, _ in city_columns
            }),
            "records": city_records,
            "available_years": city_available_years,
            "latest_ranking": latest_city_ranking
        },
        "kpis": {
            "latest_total": latest_record["total"],
            "latest_yoy": latest_record["yoy"],
            "total_growth": latest_record["total"] - first_record["total"],
            "total_growth_rate": round(
                (
                    latest_record["total"]
                    / first_record["total"]
                    - 1
                ) * 100,
                2
            ),
            "cagr": cagr,
            "female_share": latest_gender["shares"]["女性"],
            "senior_share": latest_age["shares"]["65歲以上"],
            "largest_growth_year": (
                largest_growth_record["year"]
                if largest_growth_record
                else None
            ),
            "largest_growth_rate": (
                largest_growth_record["yoy"]
                if largest_growth_record
                else None
            ),
            "top_city": (
                latest_city_ranking[0]
                if latest_city_ranking
                else None
            ),
            "top_age_group": {
                "label": latest_age_ranking[0][0],
                "value": latest_age_ranking[0][1],
                "share": latest_age["shares"][latest_age_ranking[0][0]]
            },
            "top_branch": {
                "label": latest_branch_ranking[0][0],
                "value": latest_branch_ranking[0][1]
            }
        },
        "quality": {
            "gender_matches_total": all(
                sum(
                    value or 0
                    for value in record["values"].values()
                ) == national_records[index]["total"]
                for index, record in enumerate(gender_records)
            ),
            "age_matches_total": all(
                sum(
                    value or 0
                    for value in record["values"].values()
                ) == national_records[index]["total"]
                for index, record in enumerate(age_records)
            ),
            "latest_branch_sum": branch_sum_latest,
            "latest_branch_extra": branch_sum_latest - latest_record["total"],
            "latest_city_sum": city_sum_latest,
            "latest_city_extra": city_sum_latest - latest_record["total"]
        },
        "raw_records": raw_records
    }

    return payload


# === 臺灣抗憂鬱藥物使用趨勢分析 ===
@portfolio_bp.route("/medical_analysis", methods=["GET"])
def medical_analysis():

    base_dir = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            ".."
        )
    )

    csv_path = os.path.join(
        base_dir,
        "data",
        MEDICAL_DATA_FILENAME
    )

    if not os.path.exists(csv_path):
        return render_template(
            "medical_analysis.html",
            medical_data=None,
            error_message=(
                "找不到醫療分析資料，請確認 "
                "data/A21030000I-L50007-001.csv 是否存在"
            )
        )

    try:
        medical_data = _load_medical_analysis_payload(
            csv_path,
            os.path.getmtime(csv_path)
        )

        return render_template(
            "medical_analysis.html",
            medical_data=medical_data,
            error_message=None
        )

    except Exception as error:
        return render_template(
            "medical_analysis.html",
            medical_data=None,
            error_message=f"讀取醫療分析資料時發生錯誤：{error}"
        )



# =========================================================
# === 人工膝關節醫療品質分析與會員資料工作台 =============
# =========================================================

KNEE_DATA_FILENAME = "A21030000I-E3200F-001.csv"

KNEE_REQUIRED_COLUMNS = [
    "年度",
    "醫事機構代碼",
    "院所名稱",
    "特約類別",
    "人工膝關節置換後90天內發生手術傷口感染之案件數",
    "人工膝關節置換案件數",
    "人工膝關節置換病人數",
    "傷口感染率",
    "人工膝關節置換醫師數",
    "病患平均年齡",
    "病患重大傷病比率",
    "分母重大傷病人數",
    "縣市別",
    "鄉鎮別"
]

KNEE_CONTRACT_TYPES = {
    1: "醫學中心",
    2: "區域醫院",
    3: "地區醫院",
    4: "診所"
}

KNEE_COUNTY_NAMES = {
    "09020": "金門縣",
    "09007": "連江縣",
    "10002": "宜蘭縣",
    "10004": "新竹縣",
    "10005": "苗栗縣",
    "10007": "彰化縣",
    "10008": "南投縣",
    "10009": "雲林縣",
    "10010": "嘉義縣",
    "10013": "屏東縣",
    "10014": "臺東縣",
    "10015": "花蓮縣",
    "10016": "澎湖縣",
    "10017": "基隆市",
    "10018": "新竹市",
    "10020": "嘉義市",
    "10021": "臺南市",
    "63000": "臺北市",
    "64000": "高雄市",
    "65000": "新北市",
    "66000": "臺中市",
    "67000": "臺南市",
    "68000": "桃園市"
}

KNEE_MAX_FILE_SIZE = 5 * 1024 * 1024
KNEE_MAX_ROWS_PER_DATASET = 10000
KNEE_MAX_DATASETS_PER_USER = 10
KNEE_MAX_TOTAL_ROWS_PER_USER = 50000

KNEE_PERIOD_PATTERN = re.compile(
    r"^(?P<year>\d{4})年(?P<period_type>上半年度|全年度)$"
)


def _knee_login_account():
    """取得登入會員帳號；未登入時回傳 None。"""

    return session.get("account_login")


def _knee_clean_text(value):
    """清除 CSV 欄位前後空白與常見不可見字元。"""

    if value is None:
        return ""

    return str(value).replace("\ufeff", "").strip()


def _knee_parse_number(value, field_name, row_number, integer=False):
    """把輸入轉成非負數；錯誤時回傳可顯示給使用者的訊息。"""

    text = _knee_clean_text(value)

    if text == "":
        return None, f"第 {row_number} 列「{field_name}」不可空白"

    text = text.replace(",", "").replace("%", "")

    try:
        number = float(text)
    except ValueError:
        return None, f"第 {row_number} 列「{field_name}」必須是數字"

    if number < 0:
        return None, f"第 {row_number} 列「{field_name}」不可小於 0"

    if integer and not number.is_integer():
        return None, f"第 {row_number} 列「{field_name}」必須是整數"

    if integer:
        return int(number), None

    return float(number), None


def _knee_normalize_code(value, length, field_name, row_number, warnings):
    """
    標準化代碼。

    使用 Excel 開啟 CSV 時，前導 0 可能消失，因此純數字且長度不足時，
    會自動補回前導 0，並留下警告。
    """

    text = _knee_clean_text(value)

    # === 處理 Excel 可能輸出的 ="0101090517" ===
    if text.startswith('="') and text.endswith('"'):
        text = text[2:-1]

    text = text.lstrip("'")

    if not text.isdigit():
        return None, f"第 {row_number} 列「{field_name}」必須是純數字代碼"

    if len(text) > length:
        return None, (
            f"第 {row_number} 列「{field_name}」長度不可超過 {length} 碼"
        )

    if len(text) < length:
        original_text = text
        text = text.zfill(length)
        warnings.append(
            f"第 {row_number} 列「{field_name}」由 {original_text} "
            f"自動補為 {text}"
        )

    return text, None


def _knee_validate_dataframe(dataframe):
    """
    驗證並標準化匯入資料。

    回傳：
    - normalized_records：可寫入資料庫的標準化資料
    - errors：阻止匯入的錯誤
    - warnings：已自動修正或值得注意的資訊
    """

    errors = []
    warnings = []
    normalized_records = []

    dataframe.columns = [
        _knee_clean_text(column)
        for column in dataframe.columns
    ]

    missing_columns = [
        column
        for column in KNEE_REQUIRED_COLUMNS
        if column not in dataframe.columns
    ]

    extra_columns = [
        column
        for column in dataframe.columns
        if column not in KNEE_REQUIRED_COLUMNS
    ]

    if missing_columns:
        errors.append(
            "缺少必要欄位："
            + "、".join(missing_columns)
        )

    if extra_columns:
        warnings.append(
            "下列額外欄位不會匯入："
            + "、".join(extra_columns)
        )

    if errors:
        return normalized_records, errors, warnings

    dataframe = dataframe[KNEE_REQUIRED_COLUMNS].copy()

    # === 刪除整列完全空白的資料 ===
    dataframe = dataframe[
        dataframe.apply(
            lambda row: any(
                _knee_clean_text(value)
                for value in row.tolist()
            ),
            axis=1
        )
    ].reset_index(drop=True)

    if dataframe.empty:
        errors.append("CSV 沒有任何可匯入的資料列")
        return normalized_records, errors, warnings

    if len(dataframe) > KNEE_MAX_ROWS_PER_DATASET:
        errors.append(
            f"單一資料集最多 {KNEE_MAX_ROWS_PER_DATASET:,} 列，"
            f"目前為 {len(dataframe):,} 列"
        )
        return normalized_records, errors, warnings

    seen_keys = set()

    for index, row in dataframe.iterrows():
        row_number = index + 2

        period = _knee_clean_text(row["年度"])
        period_match = KNEE_PERIOD_PATTERN.fullmatch(period)

        if not period_match:
            errors.append(
                f"第 {row_number} 列「年度」格式錯誤，"
                "請使用例如 2025年上半年度 或 2025年全年度"
            )
            continue

        year = int(period_match.group("year"))

        if year < 1900 or year > 2100:
            errors.append(
                f"第 {row_number} 列「年度」必須介於 1900～2100 年"
            )
            continue

        institution_code, code_error = _knee_normalize_code(
            row["醫事機構代碼"],
            10,
            "醫事機構代碼",
            row_number,
            warnings
        )

        county_code, county_error = _knee_normalize_code(
            row["縣市別"],
            5,
            "縣市別",
            row_number,
            warnings
        )

        township_code, township_error = _knee_normalize_code(
            row["鄉鎮別"],
            8,
            "鄉鎮別",
            row_number,
            warnings
        )

        for code_message in [
            code_error,
            county_error,
            township_error
        ]:
            if code_message:
                errors.append(code_message)

        if code_error or county_error or township_error:
            continue

        institution_name = _knee_clean_text(row["院所名稱"])

        if not institution_name:
            errors.append(
                f"第 {row_number} 列「院所名稱」不可空白"
            )
            continue

        if len(institution_name) > 255:
            errors.append(
                f"第 {row_number} 列「院所名稱」不可超過 255 個字元"
            )
            continue

        # === 避免下載 CSV 後被試算表當成公式執行 ===
        if institution_name.startswith(("=", "+", "-", "@")):
            errors.append(
                f"第 {row_number} 列「院所名稱」不可使用 =、+、-、@ 開頭"
            )
            continue

        contract_type, contract_error = _knee_parse_number(
            row["特約類別"],
            "特約類別",
            row_number,
            integer=True
        )

        if contract_error:
            errors.append(contract_error)
            continue

        if contract_type not in KNEE_CONTRACT_TYPES:
            errors.append(
                f"第 {row_number} 列「特約類別」必須是 "
                "1（醫學中心）、2（區域醫院）、"
                "3（地區醫院）或 4（診所）"
            )
            continue

        numeric_specs = [
            (
                "人工膝關節置換後90天內發生手術傷口感染之案件數",
                "infection_cases",
                True
            ),
            (
                "人工膝關節置換案件數",
                "replacement_cases",
                True
            ),
            (
                "人工膝關節置換病人數",
                "patient_count",
                True
            ),
            (
                "人工膝關節置換醫師數",
                "surgeon_count",
                True
            ),
            (
                "病患平均年齡",
                "average_age",
                False
            ),
            (
                "分母重大傷病人數",
                "catastrophic_count",
                True
            )
        ]

        parsed_numbers = {}
        row_has_numeric_error = False

        for column_name, target_name, integer_required in numeric_specs:
            parsed_value, parse_error = _knee_parse_number(
                row[column_name],
                column_name,
                row_number,
                integer=integer_required
            )

            if parse_error:
                errors.append(parse_error)
                row_has_numeric_error = True
            else:
                parsed_numbers[target_name] = parsed_value

        if row_has_numeric_error:
            continue

        infection_cases = parsed_numbers["infection_cases"]
        replacement_cases = parsed_numbers["replacement_cases"]
        patient_count = parsed_numbers["patient_count"]
        surgeon_count = parsed_numbers["surgeon_count"]
        average_age = parsed_numbers["average_age"]
        catastrophic_count = parsed_numbers["catastrophic_count"]

        if replacement_cases < 1:
            errors.append(
                f"第 {row_number} 列「人工膝關節置換案件數」至少要為 1"
            )
            continue

        if patient_count < 1:
            errors.append(
                f"第 {row_number} 列「人工膝關節置換病人數」至少要為 1"
            )
            continue

        if surgeon_count < 1:
            errors.append(
                f"第 {row_number} 列「人工膝關節置換醫師數」至少要為 1"
            )
            continue

        if infection_cases > replacement_cases:
            errors.append(
                f"第 {row_number} 列感染案件數不可大於置換案件數"
            )
            continue

        if patient_count > replacement_cases:
            errors.append(
                f"第 {row_number} 列病人數不可大於置換案件數"
            )
            continue

        if catastrophic_count > patient_count:
            errors.append(
                f"第 {row_number} 列重大傷病人數不可大於病人數"
            )
            continue

        if average_age < 0 or average_age > 120:
            errors.append(
                f"第 {row_number} 列病患平均年齡必須介於 0～120"
            )
            continue

        calculated_infection_rate = round(
            infection_cases / replacement_cases * 100,
            4
        )

        calculated_catastrophic_rate = round(
            catastrophic_count / patient_count * 100,
            4
        )

        supplied_infection_rate, infection_rate_error = _knee_parse_number(
            row["傷口感染率"],
            "傷口感染率",
            row_number,
            integer=False
        )

        supplied_catastrophic_rate, catastrophic_rate_error = _knee_parse_number(
            row["病患重大傷病比率"],
            "病患重大傷病比率",
            row_number,
            integer=False
        )

        if infection_rate_error:
            errors.append(infection_rate_error)
            continue

        if catastrophic_rate_error:
            errors.append(catastrophic_rate_error)
            continue

        if supplied_infection_rate > 100:
            errors.append(
                f"第 {row_number} 列傷口感染率不可超過 100%"
            )
            continue

        if supplied_catastrophic_rate > 100:
            errors.append(
                f"第 {row_number} 列病患重大傷病比率不可超過 100%"
            )
            continue

        if abs(
            supplied_infection_rate
            - calculated_infection_rate
        ) > 0.05:
            warnings.append(
                f"第 {row_number} 列傷口感染率與案件數不一致，"
                f"已由 {supplied_infection_rate:.2f}% "
                f"修正為 {calculated_infection_rate:.2f}%"
            )

        if abs(
            supplied_catastrophic_rate
            - calculated_catastrophic_rate
        ) > 0.05:
            warnings.append(
                f"第 {row_number} 列重大傷病比率與人數不一致，"
                f"已由 {supplied_catastrophic_rate:.2f}% "
                f"修正為 {calculated_catastrophic_rate:.2f}%"
            )

        unique_key = (
            period,
            institution_code
        )

        if unique_key in seen_keys:
            errors.append(
                f"第 {row_number} 列與前面資料重複："
                f"{period}／{institution_code}"
            )
            continue

        seen_keys.add(unique_key)

        normalized_records.append({
            "period": period,
            "institution_code": institution_code,
            "institution_name": institution_name,
            "contract_type": contract_type,
            "infection_cases": infection_cases,
            "replacement_cases": replacement_cases,
            "patient_count": patient_count,
            "infection_rate": calculated_infection_rate,
            "surgeon_count": surgeon_count,
            "average_age": round(average_age, 4),
            "catastrophic_rate": calculated_catastrophic_rate,
            "catastrophic_count": catastrophic_count,
            "county_code": county_code,
            "township_code": township_code
        })

        # === 避免一次列出過多訊息，保留前 100 筆錯誤即可 ===
        if len(errors) >= 100:
            errors.append(
                "錯誤數量過多，目前只顯示前 100 筆，"
                "請修正後重新匯入"
            )
            break

    return normalized_records, errors, warnings[:100]


def _knee_read_csv_bytes(raw_bytes):
    """嘗試以常見中文編碼讀取 CSV。"""

    encodings = [
        "utf-8-sig",
        "utf-8",
        "cp950",
        "big5"
    ]

    last_error = None

    for encoding in encodings:
        try:
            dataframe = pd.read_csv(
                io.BytesIO(raw_bytes),
                encoding=encoding,
                dtype=str,
                keep_default_na=False
            )

            return dataframe, encoding

        except UnicodeDecodeError as error:
            last_error = error

        except pd.errors.ParserError as error:
            last_error = error
            break

    raise ValueError(
        "無法讀取 CSV。請確認檔案是 UTF-8、UTF-8-SIG、"
        "Big5 或 CP950 編碼，且欄位分隔符號為逗號。"
    ) from last_error


def _knee_period_sort_key(period):
    """把 2025年上半年度／全年度轉成可排序的鍵。"""

    match = KNEE_PERIOD_PATTERN.fullmatch(
        _knee_clean_text(period)
    )

    if not match:
        return (0, 0)

    year = int(match.group("year"))
    period_order = (
        1
        if match.group("period_type") == "上半年度"
        else 2
    )

    return (year, period_order)


def _knee_record_to_dict(record):
    """將 ORM 紀錄轉成圖表可使用的 dict。"""

    period_match = KNEE_PERIOD_PATTERN.fullmatch(
        record.period
    )

    if period_match:
        year = int(period_match.group("year"))
        period_type = period_match.group("period_type")
    else:
        year = None
        period_type = ""

    return {
        "id": record.id,
        "period": record.period,
        "year": year,
        "period_type": period_type,
        "institution_code": record.institution_code,
        "institution_name": record.institution_name,
        "contract_type": record.contract_type,
        "contract_type_label": KNEE_CONTRACT_TYPES.get(
            record.contract_type,
            f"類別 {record.contract_type}"
        ),
        "infection_cases": record.infection_cases,
        "replacement_cases": record.replacement_cases,
        "patient_count": record.patient_count,
        "infection_rate": round(record.infection_rate, 4),
        "surgeon_count": record.surgeon_count,
        "average_age": round(record.average_age, 4),
        "catastrophic_rate": round(
            record.catastrophic_rate,
            4
        ),
        "catastrophic_count": record.catastrophic_count,
        "county_code": record.county_code,
        "county_name": KNEE_COUNTY_NAMES.get(
            record.county_code,
            record.county_code
        ),
        "township_code": record.township_code
    }


def _knee_plain_record_to_dict(record, record_id=None):
    """將驗證後的純 dict 轉為前端格式。"""

    period_match = KNEE_PERIOD_PATTERN.fullmatch(
        record["period"]
    )

    if period_match:
        year = int(period_match.group("year"))
        period_type = period_match.group("period_type")
    else:
        year = None
        period_type = ""

    return {
        "id": record_id,
        "period": record["period"],
        "year": year,
        "period_type": period_type,
        "institution_code": record["institution_code"],
        "institution_name": record["institution_name"],
        "contract_type": record["contract_type"],
        "contract_type_label": KNEE_CONTRACT_TYPES.get(
            record["contract_type"],
            f"類別 {record['contract_type']}"
        ),
        "infection_cases": record["infection_cases"],
        "replacement_cases": record["replacement_cases"],
        "patient_count": record["patient_count"],
        "infection_rate": round(
            record["infection_rate"],
            4
        ),
        "surgeon_count": record["surgeon_count"],
        "average_age": round(
            record["average_age"],
            4
        ),
        "catastrophic_rate": round(
            record["catastrophic_rate"],
            4
        ),
        "catastrophic_count": record["catastrophic_count"],
        "county_code": record["county_code"],
        "county_name": KNEE_COUNTY_NAMES.get(
            record["county_code"],
            record["county_code"]
        ),
        "township_code": record["township_code"]
    }


@lru_cache(maxsize=4)
def _load_official_knee_records(csv_path, file_modified_time):
    """讀取官方 CSV 並快取，避免每次開頁都重新解析。"""

    raw_bytes = Path(csv_path).read_bytes()
    dataframe, _ = _knee_read_csv_bytes(raw_bytes)

    normalized_records, errors, warnings = (
        _knee_validate_dataframe(dataframe)
    )

    if errors:
        raise ValueError(
            "官方人工膝關節資料格式錯誤："
            + "；".join(errors[:10])
        )

    return {
        "records": normalized_records,
        "warnings": warnings
    }


def _knee_build_payload(
    records,
    dataset_key,
    dataset_name,
    source_type,
    is_editable,
    updated_at=None
):
    """整理前端圖表、篩選器與表格需要的資料。"""

    records = sorted(
        records,
        key=lambda item: (
            _knee_period_sort_key(item["period"]),
            item["institution_name"],
            item["institution_code"]
        )
    )

    periods = sorted(
        {
            record["period"]
            for record in records
        },
        key=_knee_period_sort_key
    )

    institutions = sorted(
        {
            (
                record["institution_code"],
                record["institution_name"]
            )
            for record in records
        },
        key=lambda item: (
            item[1],
            item[0]
        )
    )

    counties = sorted(
        {
            (
                record["county_code"],
                record["county_name"]
            )
            for record in records
        },
        key=lambda item: (
            item[1],
            item[0]
        )
    )

    return {
        "dataset": {
            "key": str(dataset_key),
            "name": dataset_name,
            "source_type": source_type,
            "is_editable": is_editable,
            "row_count": len(records),
            "updated_at": (
                updated_at.strftime("%Y-%m-%d %H:%M")
                if updated_at
                else None
            )
        },
        "meta": {
            "periods": periods,
            "contract_types": [
                {
                    "value": value,
                    "label": label
                }
                for value, label in KNEE_CONTRACT_TYPES.items()
            ],
            "counties": [
                {
                    "code": code,
                    "name": name
                }
                for code, name in counties
            ],
            "institutions": [
                {
                    "code": code,
                    "name": name
                }
                for code, name in institutions
            ]
        },
        "records": records
    }


def _knee_get_user_datasets(account):
    """只取得目前會員自己的資料集。"""

    return (
        MedicalKneeDataset.query
        .filter_by(user_account=account)
        .order_by(
            MedicalKneeDataset.updated_at.desc(),
            MedicalKneeDataset.id.desc()
        )
        .all()
    )


def _knee_get_user_dataset(account, dataset_id):
    """依會員與資料集 ID 查詢，避免越權讀取其他會員資料。"""

    try:
        numeric_id = int(dataset_id)
    except (TypeError, ValueError):
        return None

    return (
        MedicalKneeDataset.query
        .filter_by(
            id=numeric_id,
            user_account=account
        )
        .first()
    )


def _knee_load_selected_payload(account, dataset_key):
    """載入官方資料或目前會員選擇的私人資料集。"""

    if not dataset_key or dataset_key == "official":
        base_dir = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                ".."
            )
        )

        csv_path = os.path.join(
            base_dir,
            "data",
            KNEE_DATA_FILENAME
        )

        if not os.path.exists(csv_path):
            raise FileNotFoundError(
                "找不到 data/A21030000I-E3200F-001.csv"
            )

        official_result = _load_official_knee_records(
            csv_path,
            os.path.getmtime(csv_path)
        )

        official_records = [
            _knee_plain_record_to_dict(record)
            for record in official_result["records"]
        ]

        payload = _knee_build_payload(
            official_records,
            "official",
            "健保署官方公開資料",
            "official",
            False,
            datetime.fromtimestamp(
                os.path.getmtime(csv_path)
            )
        )

        return payload, official_result["warnings"]

    dataset = _knee_get_user_dataset(
        account,
        dataset_key
    )

    if dataset is None:
        raise PermissionError(
            "找不到這份資料集，或你沒有使用權限"
        )

    records = [
        _knee_record_to_dict(record)
        for record in dataset.records
    ]

    payload = _knee_build_payload(
        records,
        dataset.id,
        dataset.dataset_name,
        dataset.source_type,
        True,
        dataset.updated_at
    )

    return payload, []


def _knee_render_page(
    account,
    selected_dataset_key="official",
    success_message=None,
    error_messages=None,
    warning_messages=None
):
    """統一渲染人工膝關節分析頁，避免每個 Route 重複程式碼。"""

    error_messages = list(error_messages or [])
    warning_messages = list(warning_messages or [])

    try:
        knee_data, data_warnings = _knee_load_selected_payload(
            account,
            selected_dataset_key
        )
        warning_messages.extend(data_warnings)

    except Exception as error:
        knee_data = None
        error_messages.append(str(error))
        selected_dataset_key = "official"

        # === 私人資料集失效時，仍嘗試回到官方資料 ===
        try:
            knee_data, data_warnings = _knee_load_selected_payload(
                account,
                "official"
            )
            warning_messages.extend(data_warnings)
        except Exception as official_error:
            error_messages.append(str(official_error))

    user_datasets = _knee_get_user_datasets(account)

    total_user_rows = sum(
        dataset.row_count
        for dataset in user_datasets
    )

    return render_template(
        "knee_quality_analysis.html",
        knee_data=knee_data,
        user_datasets=user_datasets,
        selected_dataset_key=str(selected_dataset_key),
        success_message=success_message,
        error_messages=error_messages,
        warning_messages=warning_messages,
        limits={
            "max_file_size_mb": (
                KNEE_MAX_FILE_SIZE // 1024 // 1024
            ),
            "max_rows_per_dataset": KNEE_MAX_ROWS_PER_DATASET,
            "max_datasets": KNEE_MAX_DATASETS_PER_USER,
            "max_total_rows": KNEE_MAX_TOTAL_ROWS_PER_USER,
            "current_dataset_count": len(user_datasets),
            "current_total_rows": total_user_rows
        }
    )


def _knee_records_to_csv_rows(records):
    """把資料轉回官方欄位順序，供下載與重新匯入。"""

    rows = []

    for record in records:
        rows.append([
            record["period"],
            record["institution_code"],
            record["institution_name"],
            record["contract_type"],
            record["infection_cases"],
            record["replacement_cases"],
            record["patient_count"],
            f'{record["infection_rate"]:.2f}%',
            record["surgeon_count"],
            f'{record["average_age"]:.4f}',
            f'{record["catastrophic_rate"]:.2f}%',
            record["catastrophic_count"],
            record["county_code"],
            record["township_code"]
        ])

    return rows


def _knee_csv_response(rows, filename):
    """建立含 UTF-8 BOM 的 CSV 下載回應。"""

    output = io.StringIO()
    writer = csv.writer(
        output,
        lineterminator="\n"
    )

    writer.writerow(KNEE_REQUIRED_COLUMNS)
    writer.writerows(rows)

    csv_text = "\ufeff" + output.getvalue()

    response = Response(
        csv_text,
        mimetype="text/csv; charset=utf-8"
    )

    response.headers["Content-Disposition"] = (
        f'attachment; filename="{filename}"'
    )

    return response


# === 人工膝關節品質分析與資料工作台 ===
@portfolio_bp.route(
    "/knee_quality_analysis",
    methods=["GET"]
)
def knee_quality_analysis():

    account = _knee_login_account()

    if not account:
        return redirect(
            url_for("login")
        )

    dataset_key = request.args.get(
        "dataset",
        "official"
    ).strip()

    return _knee_render_page(
        account,
        selected_dataset_key=dataset_key
    )


# === 下載人工膝關節空白 CSV 範本 ===
@portfolio_bp.route(
    "/knee_quality_template",
    methods=["GET"]
)
def knee_quality_template():

    account = _knee_login_account()

    if not account:
        return redirect(
            url_for("login")
        )

    return _knee_csv_response(
        [],
        "knee_quality_blank_template.csv"
    )


# === 下載人工膝關節範例 CSV ===
@portfolio_bp.route(
    "/knee_quality_example",
    methods=["GET"]
)
def knee_quality_example():

    account = _knee_login_account()

    if not account:
        return redirect(
            url_for("login")
        )

    example_rows = [[
        "2025年全年度",
        "0123456789",
        "範例醫院",
        2,
        1,
        100,
        98,
        "1.00%",
        8,
        "71.2500",
        "5.10%",
        5,
        "63000",
        "63000010"
    ]]

    return _knee_csv_response(
        example_rows,
        "knee_quality_example.csv"
    )


# === 下載官方或會員私人資料集 ===
@portfolio_bp.route(
    "/knee_quality_export",
    methods=["GET"]
)
def knee_quality_export():

    account = _knee_login_account()

    if not account:
        return redirect(
            url_for("login")
        )

    dataset_key = request.args.get(
        "dataset",
        "official"
    ).strip()

    try:
        payload, _ = _knee_load_selected_payload(
            account,
            dataset_key
        )
    except Exception:
        return _knee_csv_response(
            [],
            "knee_quality_export_error.csv"
        )

    rows = _knee_records_to_csv_rows(
        payload["records"]
    )

    safe_name = secure_filename(
        payload["dataset"]["name"]
    ) or "knee_quality_dataset"

    return _knee_csv_response(
        rows,
        f"{safe_name}.csv"
    )


# === 匯入會員人工膝關節 CSV 資料 ===
@portfolio_bp.route(
    "/knee_quality_upload",
    methods=["POST"]
)
def knee_quality_upload():

    account = _knee_login_account()

    if not account:
        return redirect(
            url_for("login")
        )

    dataset_name = _knee_clean_text(
        request.form.get("dataset_name")
    )

    upload_file = request.files.get(
        "dataset_file"
    )

    errors = []
    warnings = []

    if len(dataset_name) < 2 or len(dataset_name) > 120:
        errors.append(
            "資料集名稱必須為 2～120 個字元"
        )

    if upload_file is None or not upload_file.filename:
        errors.append("請選擇要匯入的 CSV 檔案")

    elif not upload_file.filename.lower().endswith(".csv"):
        errors.append("只允許匯入 .csv 檔案")

    user_datasets = _knee_get_user_datasets(account)

    if len(user_datasets) >= KNEE_MAX_DATASETS_PER_USER:
        errors.append(
            f"每位會員最多建立 {KNEE_MAX_DATASETS_PER_USER} 份資料集"
        )

    if errors:
        return _knee_render_page(
            account,
            selected_dataset_key="official",
            error_messages=errors
        )

    raw_bytes = upload_file.read()

    if len(raw_bytes) > KNEE_MAX_FILE_SIZE:
        errors.append(
            f"CSV 最大只能是 "
            f"{KNEE_MAX_FILE_SIZE // 1024 // 1024} MB"
        )

        return _knee_render_page(
            account,
            selected_dataset_key="official",
            error_messages=errors
        )

    try:
        dataframe, detected_encoding = _knee_read_csv_bytes(
            raw_bytes
        )

        normalized_records, validation_errors, validation_warnings = (
            _knee_validate_dataframe(dataframe)
        )

        errors.extend(validation_errors)
        warnings.extend(validation_warnings)

        if errors:
            return _knee_render_page(
                account,
                selected_dataset_key="official",
                error_messages=errors,
                warning_messages=warnings
            )

        current_total_rows = sum(
            dataset.row_count
            for dataset in user_datasets
        )

        if (
            current_total_rows
            + len(normalized_records)
            > KNEE_MAX_TOTAL_ROWS_PER_USER
        ):
            errors.append(
                f"每位會員最多可保存 "
                f"{KNEE_MAX_TOTAL_ROWS_PER_USER:,} 列資料；"
                f"目前已有 {current_total_rows:,} 列"
            )

            return _knee_render_page(
                account,
                selected_dataset_key="official",
                error_messages=errors,
                warning_messages=warnings
            )

        dataset = MedicalKneeDataset(
            user_account=account,
            dataset_name=dataset_name,
            source_type="upload",
            original_filename=secure_filename(
                upload_file.filename
            ),
            row_count=len(normalized_records)
        )

        db.session.add(dataset)
        db.session.flush()

        record_objects = [
            MedicalKneeRecord(
                dataset_id=dataset.id,
                **record
            )
            for record in normalized_records
        ]

        db.session.bulk_save_objects(
            record_objects
        )

        db.session.commit()

        warnings.insert(
            0,
            f"已使用 {detected_encoding} 編碼讀取檔案"
        )

        return _knee_render_page(
            account,
            selected_dataset_key=dataset.id,
            success_message=(
                f"已匯入「{dataset.dataset_name}」，"
                f"共 {dataset.row_count:,} 列"
            ),
            warning_messages=warnings
        )

    except Exception as error:
        db.session.rollback()

        return _knee_render_page(
            account,
            selected_dataset_key="official",
            error_messages=[
                f"匯入失敗：{error}"
            ],
            warning_messages=warnings
        )


# === 使用小型輸入系統新增一筆資料 ===
@portfolio_bp.route(
    "/knee_quality_manual_add",
    methods=["POST"]
)
def knee_quality_manual_add():

    account = _knee_login_account()

    if not account:
        return redirect(
            url_for("login")
        )

    target_dataset = request.form.get(
        "target_dataset",
        "new"
    ).strip()

    dataset_name = _knee_clean_text(
        request.form.get("manual_dataset_name")
    )

    year = _knee_clean_text(
        request.form.get("manual_year")
    )

    period_type = _knee_clean_text(
        request.form.get("manual_period_type")
    )

    errors = []

    try:
        infection_cases = int(
            request.form.get("infection_cases", "")
        )
        replacement_cases = int(
            request.form.get("replacement_cases", "")
        )
        patient_count = int(
            request.form.get("patient_count", "")
        )
        surgeon_count = int(
            request.form.get("surgeon_count", "")
        )
        catastrophic_count = int(
            request.form.get("catastrophic_count", "")
        )
        average_age = float(
            request.form.get("average_age", "")
        )
    except (TypeError, ValueError):
        errors.append(
            "案件數、人數與醫師數必須是整數；平均年齡必須是數字"
        )
        infection_cases = 0
        replacement_cases = 0
        patient_count = 0
        surgeon_count = 0
        catastrophic_count = 0
        average_age = 0

    infection_rate = (
        infection_cases / replacement_cases * 100
        if replacement_cases > 0
        else 0
    )

    catastrophic_rate = (
        catastrophic_count / patient_count * 100
        if patient_count > 0
        else 0
    )

    row_dict = {
        "年度": f"{year}年{period_type}",
        "醫事機構代碼": request.form.get(
            "institution_code",
            ""
        ),
        "院所名稱": request.form.get(
            "institution_name",
            ""
        ),
        "特約類別": request.form.get(
            "contract_type",
            ""
        ),
        "人工膝關節置換後90天內發生手術傷口感染之案件數": (
            infection_cases
        ),
        "人工膝關節置換案件數": replacement_cases,
        "人工膝關節置換病人數": patient_count,
        "傷口感染率": f"{infection_rate:.4f}%",
        "人工膝關節置換醫師數": surgeon_count,
        "病患平均年齡": average_age,
        "病患重大傷病比率": f"{catastrophic_rate:.4f}%",
        "分母重大傷病人數": catastrophic_count,
        "縣市別": request.form.get(
            "county_code",
            ""
        ),
        "鄉鎮別": request.form.get(
            "township_code",
            ""
        )
    }

    dataframe = pd.DataFrame(
        [row_dict],
        columns=KNEE_REQUIRED_COLUMNS
    )

    normalized_records, validation_errors, warnings = (
        _knee_validate_dataframe(dataframe)
    )

    errors.extend(validation_errors)

    if target_dataset == "new":
        user_datasets = _knee_get_user_datasets(account)

        if len(user_datasets) >= KNEE_MAX_DATASETS_PER_USER:
            errors.append(
                f"每位會員最多建立 "
                f"{KNEE_MAX_DATASETS_PER_USER} 份資料集"
            )

        if len(dataset_name) < 2 or len(dataset_name) > 120:
            errors.append(
                "建立新資料集時，名稱必須為 2～120 個字元"
            )

        dataset = None

    else:
        dataset = _knee_get_user_dataset(
            account,
            target_dataset
        )

        if dataset is None:
            errors.append(
                "找不到要加入的私人資料集"
            )

    if errors:
        return _knee_render_page(
            account,
            selected_dataset_key=(
                target_dataset
                if target_dataset != "new"
                else "official"
            ),
            error_messages=errors,
            warning_messages=warnings
        )

    normalized_record = normalized_records[0]

    if dataset is None:
        dataset = MedicalKneeDataset(
            user_account=account,
            dataset_name=dataset_name,
            source_type="manual",
            row_count=0
        )

        db.session.add(dataset)
        db.session.flush()

    duplicate_record = (
        MedicalKneeRecord.query
        .filter_by(
            dataset_id=dataset.id,
            period=normalized_record["period"],
            institution_code=normalized_record[
                "institution_code"
            ]
        )
        .first()
    )

    if duplicate_record:
        db.session.rollback()

        return _knee_render_page(
            account,
            selected_dataset_key=dataset.id,
            error_messages=[
                "這份資料集已存在相同年度與醫事機構代碼的資料"
            ]
        )

    try:
        db.session.add(
            MedicalKneeRecord(
                dataset_id=dataset.id,
                **normalized_record
            )
        )

        dataset.row_count = (
            MedicalKneeRecord.query
            .filter_by(dataset_id=dataset.id)
            .count()
            + 1
        )

        dataset.updated_at = datetime.utcnow()

        db.session.commit()

        return _knee_render_page(
            account,
            selected_dataset_key=dataset.id,
            success_message=(
                f"已將 {normalized_record['period']} "
                f"{normalized_record['institution_name']} "
                "加入資料集"
            ),
            warning_messages=warnings
        )

    except IntegrityError:
        db.session.rollback()

        return _knee_render_page(
            account,
            selected_dataset_key=dataset.id,
            error_messages=[
                "資料重複，無法新增"
            ]
        )

    except Exception as error:
        db.session.rollback()

        return _knee_render_page(
            account,
            selected_dataset_key=dataset.id,
            error_messages=[
                f"新增資料失敗：{error}"
            ]
        )


# === 刪除會員自己的單筆人工膝關節資料 ===
@portfolio_bp.route(
    "/knee_quality_record_delete",
    methods=["POST"]
)
def knee_quality_record_delete():

    account = _knee_login_account()

    if not account:
        return redirect(
            url_for("login")
        )

    record_id = request.form.get(
        "record_id",
        type=int
    )

    record = (
        MedicalKneeRecord.query
        .join(
            MedicalKneeDataset,
            MedicalKneeRecord.dataset_id
            == MedicalKneeDataset.id
        )
        .filter(
            MedicalKneeRecord.id == record_id,
            MedicalKneeDataset.user_account == account
        )
        .first()
    )

    if record is None:
        return _knee_render_page(
            account,
            selected_dataset_key="official",
            error_messages=[
                "找不到要刪除的資料，或你沒有操作權限"
            ]
        )

    dataset_id = record.dataset_id

    try:
        db.session.delete(record)
        db.session.flush()

        dataset = _knee_get_user_dataset(
            account,
            dataset_id
        )

        if dataset:
            dataset.row_count = (
                MedicalKneeRecord.query
                .filter_by(dataset_id=dataset_id)
                .count()
            )
            dataset.updated_at = datetime.utcnow()

        db.session.commit()

        return _knee_render_page(
            account,
            selected_dataset_key=dataset_id,
            success_message="已刪除該筆資料"
        )

    except Exception as error:
        db.session.rollback()

        return _knee_render_page(
            account,
            selected_dataset_key=dataset_id,
            error_messages=[
                f"刪除資料失敗：{error}"
            ]
        )


# === 刪除會員自己的整份資料集 ===
@portfolio_bp.route(
    "/knee_quality_dataset_delete",
    methods=["POST"]
)
def knee_quality_dataset_delete():

    account = _knee_login_account()

    if not account:
        return redirect(
            url_for("login")
        )

    dataset_id = request.form.get(
        "dataset_id",
        type=int
    )

    dataset = _knee_get_user_dataset(
        account,
        dataset_id
    )

    if dataset is None:
        return _knee_render_page(
            account,
            selected_dataset_key="official",
            error_messages=[
                "找不到要刪除的資料集，或你沒有操作權限"
            ]
        )

    dataset_name = dataset.dataset_name

    try:
        db.session.delete(dataset)
        db.session.commit()

        return _knee_render_page(
            account,
            selected_dataset_key="official",
            success_message=(
                f"已刪除資料集「{dataset_name}」"
            )
        )

    except Exception as error:
        db.session.rollback()

        return _knee_render_page(
            account,
            selected_dataset_key="official",
            error_messages=[
                f"刪除資料集失敗：{error}"
            ]
        )



# platform_game
@portfolio_bp.route("/platform_game")
def platform_game():
    return render_template("platform_game.html")








# =========================================================
# === TYY Developer Toolkit：可搜尋、查看與下載範本 ========
# =========================================================

TOOLKIT_ROOT = (
    Path(__file__).resolve().parent.parent
    / "developer_toolkit_content"
)

TOOLKIT_ALLOWED_SUFFIXES = {
    ".md",
    ".txt",
    ".py",
    ".html",
    ".css",
    ".js",
    ".json",
    ".example"
}

TOOLKIT_CATEGORY_LABELS = {
    "01_Git_GitHub": "Git／GitHub",
    "02_Heroku部署": "Heroku 部署",
    "03_Flask框架": "Flask 框架",
    "04_SQLAlchemy資料庫": "SQLAlchemy 資料庫",
    "05_HTML_Bootstrap": "HTML／Bootstrap",
    "06_JavaScript": "JavaScript",
    "07_API_ETL": "API／ETL",
    "08_環境與安全": "環境與安全",
    "09_機器學習": "機器學習",
    "10_PyTorch": "PyTorch",
    "11_錯誤排查": "錯誤排查",
    "12_檢查清單": "檢查清單",
    "99_官方文件": "官方文件"
}


def _toolkit_login_account():
    return session.get("account_login")


def _toolkit_safe_path(relative_path):
    if not relative_path:
        abort(404)

    root = TOOLKIT_ROOT.resolve()
    requested_path = (TOOLKIT_ROOT / relative_path).resolve()

    if (
        requested_path == root
        or root not in requested_path.parents
        or not requested_path.is_file()
    ):
        abort(404)

    return requested_path


@lru_cache(maxsize=1)
def get_toolkit_files():
    toolkit_files = []

    if not TOOLKIT_ROOT.exists():
        return toolkit_files

    for file_path in TOOLKIT_ROOT.rglob("*"):
        if not file_path.is_file() or "__pycache__" in file_path.parts:
            continue

        relative_path = file_path.relative_to(TOOLKIT_ROOT)
        suffix = file_path.suffix.lower()

        if (
            suffix not in TOOLKIT_ALLOWED_SUFFIXES
            and not file_path.name.endswith(".env.example")
        ):
            continue

        try:
            content = file_path.read_text(
                encoding="utf-8",
                errors="replace"
            )
        except OSError:
            continue

        category_key = (
            relative_path.parts[0]
            if len(relative_path.parts) > 1
            else "其他"
        )

        category_label = TOOLKIT_CATEGORY_LABELS.get(
            category_key,
            category_key
        )

        preview = " ".join(
            content.strip().split()
        )[:180]

        toolkit_files.append({
            "title": file_path.name,
            "path": relative_path.as_posix(),
            "category_key": category_key,
            "category": category_label,
            "preview": preview,
            "search_text": (
                f"{file_path.name} {category_key} "
                f"{category_label} {content}"
            ).casefold()
        })

    return sorted(
        toolkit_files,
        key=lambda item: (
            item["category_key"],
            item["title"]
        )
    )


@portfolio_bp.route("/developer_toolkit")
def developer_toolkit():
    if not _toolkit_login_account():
        return redirect(url_for("login"))

    keyword = request.args.get(
        "keyword",
        ""
    ).strip()

    category_filter = request.args.get(
        "category_filter",
        ""
    ).strip()

    all_files = get_toolkit_files()

    categories = []
    seen_categories = set()

    for item in all_files:
        category_key = item["category_key"]

        if category_key in seen_categories:
            continue

        seen_categories.add(category_key)
        categories.append({
            "key": category_key,
            "label": item["category"]
        })

    result_files = all_files

    if category_filter:
        result_files = [
            item
            for item in result_files
            if item["category_key"] == category_filter
        ]

    if keyword:
        keyword_lower = keyword.casefold()
        result_files = [
            item
            for item in result_files
            if keyword_lower in item["search_text"]
        ]

    return render_template(
        "developer_toolkit.html",
        toolkit_files=result_files,
        categories=categories,
        keyword=keyword,
        category_filter=category_filter,
        total_file_count=len(all_files)
    )


@portfolio_bp.route("/developer_toolkit/view")
def developer_toolkit_view():
    if not _toolkit_login_account():
        return redirect(url_for("login"))

    relative_path = request.args.get(
        "path",
        ""
    ).strip()

    requested_path = _toolkit_safe_path(relative_path)

    content = requested_path.read_text(
        encoding="utf-8",
        errors="replace"
    )

    suffix = requested_path.suffix.lower().lstrip(".")

    return render_template(
        "developer_toolkit_view.html",
        title=requested_path.name,
        relative_path=relative_path,
        content=content,
        language_name=suffix or "text"
    )


@portfolio_bp.route("/developer_toolkit/download")
def developer_toolkit_download():
    if not _toolkit_login_account():
        return redirect(url_for("login"))

    relative_path = request.args.get(
        "path",
        ""
    ).strip()

    requested_path = _toolkit_safe_path(relative_path)

    return send_file(
        requested_path,
        as_attachment=True,
        download_name=requested_path.name
    )
