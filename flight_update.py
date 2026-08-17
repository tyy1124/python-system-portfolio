import os
from datetime import datetime

import requests
from dotenv import load_dotenv
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app import app
from models import db, Airline, Airport, FlightGroup, Flight, FlightStatus


# === 本機讀取 linkset.env；Heroku 則直接讀取 Config Vars ===
load_dotenv("linkset.env")

CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")

TOKEN_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"
API_URL = "https://tdx.transportdata.tw/api/basic/v2/Air/FIDS/Airport/TPE"

# 每批 50 筆：避免 SQL 指令過大，也可把查詢數壓在免費方案限制內
BATCH_SIZE = 50


def get_tdx_access_token():
    if not CLIENT_ID:
        raise RuntimeError("找不到 TDX_CLIENT_ID，請檢查 linkset.env 或 Heroku Config Vars")
    if not CLIENT_SECRET:
        raise RuntimeError("找不到 TDX_CLIENT_SECRET，請檢查 linkset.env 或 Heroku Config Vars")

    response = requests.post(
        TOKEN_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "client_credentials",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET
        },
        timeout=30
    )
    response.raise_for_status()

    access_token = response.json().get("access_token")
    if not access_token:
        raise RuntimeError("TDX 回傳資料中找不到 access_token")

    return access_token


def get_tdx_flight():
    access_token = get_tdx_access_token()

    response = requests.get(
        API_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json"
        },
        timeout=60
    )
    response.raise_for_status()

    raw_data = response.json()
    if not isinstance(raw_data, list) or not raw_data:
        raise RuntimeError("TDX 航班資料格式不正確或沒有資料")

    return raw_data


def clean_text(value):
    if isinstance(value, str):
        value = value.strip()
        if value == "":
            return None
    return value


def normalize_boolean(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "y"}
    return bool(value)


def calculate_delay_minutes(schedule_time, estimated_time, actual_time, remark):
    if remark and "取消" in remark:
        return None

    final_time = actual_time or estimated_time
    if schedule_time is None or final_time is None:
        return None

    try:
        schedule_dt = datetime.fromisoformat(schedule_time)
        final_dt = datetime.fromisoformat(final_time)
    except (TypeError, ValueError):
        return None

    return int((final_dt - schedule_dt).total_seconds() / 60)


def get_flight_status(direction, remark, actual_time, delay_minutes):
    if remark and "取消" in remark:
        return "取消"

    if actual_time is None:
        if direction == "departure":
            return "尚未起飛"
        return "尚未抵達"

    if delay_minutes is None:
        return "未知"
    if delay_minutes < -5:
        return "提早"
    if delay_minutes <= 15:
        return "準點"
    return "延誤"


def clean_departure_flight(flight):
    clean_data = {
        "direction": "departure",
        "flight_date": clean_text(flight.get("FlightDate")),
        "flight_number": clean_text(flight.get("FlightNumber")),
        "airline_id": clean_text(flight.get("AirlineID")),
        "departure_airport_id": clean_text(flight.get("DepartureAirportID")),
        "arrival_airport_id": clean_text(flight.get("ArrivalAirportID")),
        "schedule_time": clean_text(flight.get("ScheduleDepartureTime")),
        "estimated_time": clean_text(flight.get("EstimatedDepartureTime")),
        "actual_time": clean_text(flight.get("ActualDepartureTime")),
        "remark": clean_text(flight.get("DepartureRemark")),
        "terminal": clean_text(flight.get("Terminal")),
        "gate": clean_text(flight.get("Gate")),
        "is_cargo": normalize_boolean(flight.get("IsCargo")),
        "aircraft_type": clean_text(flight.get("AcType")),
        "check_counter": clean_text(flight.get("CheckCounter")),
        "baggage_claim": None,
        "update_time": clean_text(flight.get("UpdateTime"))
    }

    clean_data["delay_minutes"] = calculate_delay_minutes(
        clean_data["schedule_time"],
        clean_data["estimated_time"],
        clean_data["actual_time"],
        clean_data["remark"]
    )
    clean_data["status"] = get_flight_status(
        clean_data["direction"],
        clean_data["remark"],
        clean_data["actual_time"],
        clean_data["delay_minutes"]
    )
    return clean_data


def clean_arrival_flight(flight):
    clean_data = {
        "direction": "arrival",
        "flight_date": clean_text(flight.get("FlightDate")),
        "flight_number": clean_text(flight.get("FlightNumber")),
        "airline_id": clean_text(flight.get("AirlineID")),
        "departure_airport_id": clean_text(flight.get("DepartureAirportID")),
        "arrival_airport_id": clean_text(flight.get("ArrivalAirportID")),
        "schedule_time": clean_text(flight.get("ScheduleArrivalTime")),
        "estimated_time": clean_text(flight.get("EstimatedArrivalTime")),
        "actual_time": clean_text(flight.get("ActualArrivalTime")),
        "remark": clean_text(flight.get("ArrivalRemark")),
        "terminal": clean_text(flight.get("Terminal")),
        "gate": clean_text(flight.get("Gate")),
        "is_cargo": normalize_boolean(flight.get("IsCargo")),
        "aircraft_type": None,
        "check_counter": None,
        "baggage_claim": clean_text(flight.get("BaggageClaim")),
        "update_time": clean_text(flight.get("UpdateTime"))
    }

    clean_data["delay_minutes"] = calculate_delay_minutes(
        clean_data["schedule_time"],
        clean_data["estimated_time"],
        clean_data["actual_time"],
        clean_data["remark"]
    )
    clean_data["status"] = get_flight_status(
        clean_data["direction"],
        clean_data["remark"],
        clean_data["actual_time"],
        clean_data["delay_minutes"]
    )
    return clean_data


def clean_all_flights(airport_data):
    clean_flights = []
    for flight in airport_data.get("FIDSDeparture", []):
        clean_flights.append(clean_departure_flight(flight))
    for flight in airport_data.get("FIDSArrival", []):
        clean_flights.append(clean_arrival_flight(flight))
    return clean_flights


def split_batches(rows, batch_size=BATCH_SIZE):
    for index in range(0, len(rows), batch_size):
        yield rows[index:index + batch_size]


def bulk_upsert(model, rows, update_columns):
    if not rows:
        return 0

    table = model.__table__
    dialect_name = db.engine.dialect.name
    query_count = 0

    for batch in split_batches(rows):
        if dialect_name in {"mysql", "mariadb"}:
            statement = mysql_insert(table).values(batch)
            update_values = {
                column_name: statement.inserted[column_name]
                for column_name in update_columns
            }
            statement = statement.on_duplicate_key_update(**update_values)
        elif dialect_name == "sqlite":
            statement = sqlite_insert(table).values(batch)
            update_values = {
                column_name: statement.excluded[column_name]
                for column_name in update_columns
            }
            statement = statement.on_conflict_do_update(
                index_elements=[table.c.id],
                set_=update_values
            )
        else:
            raise RuntimeError(f"目前不支援此資料庫類型：{dialect_name}")

        db.session.execute(statement)
        query_count += 1

    return query_count


def get_next_id(records):
    if not records:
        return 1
    return max(record.id for record in records) + 1


def make_group_key(direction, departure_airport_id, arrival_airport_id, schedule_time, is_cargo):
    return (
        direction,
        departure_airport_id,
        arrival_airport_id,
        schedule_time,
        bool(is_cargo)
    )


def make_flight_key(flight_date, direction, flight_number, airline_id, departure_airport_id, arrival_airport_id):
    return (
        flight_date,
        direction,
        flight_number,
        airline_id,
        departure_airport_id,
        arrival_airport_id
    )


def import_clean_to_db(clean_flights):
    # === 基礎代碼與群組數量有限，維持一次讀取 ===
    existing_airlines = Airline.query.all()
    existing_airports = Airport.query.all()
    existing_groups = FlightGroup.query.all()

    # === 航班與狀態只讀取本次同步涉及的日期，避免歷史資料持續占用記憶體 ===
    relevant_dates = sorted({
        flight_data.get("flight_date")
        for flight_data in clean_flights
        if flight_data.get("flight_date")
    })
    existing_flights = (
        Flight.query
        .filter(Flight.flight_date.in_(relevant_dates))
        .all()
        if relevant_dates
        else []
    )
    relevant_flight_ids = [flight.id for flight in existing_flights]
    existing_statuses = (
        FlightStatus.query
        .filter(FlightStatus.flight_id.in_(relevant_flight_ids))
        .all()
        if relevant_flight_ids
        else []
    )
    database_query_count = 5

    # === 航空公司與機場快取 ===
    airline_id_by_code = {row.airline_code: row.id for row in existing_airlines}
    airport_id_by_code = {row.airport_code: row.id for row in existing_airports}
    next_airline_id = get_next_id(existing_airlines)
    next_airport_id = get_next_id(existing_airports)
    airline_rows = []
    airport_rows = []
    skipped_count = 0

    for flight_data in clean_flights:
        airline_code = flight_data["airline_id"]
        departure_code = flight_data["departure_airport_id"]
        arrival_code = flight_data["arrival_airport_id"]

        required_values = [
            flight_data["flight_date"],
            flight_data["flight_number"],
            airline_code,
            departure_code,
            arrival_code,
            flight_data["schedule_time"]
        ]
        if any(value is None for value in required_values):
            skipped_count += 1
            continue

        if airline_code not in airline_id_by_code:
            airline_id_by_code[airline_code] = next_airline_id
            airline_rows.append({"id": next_airline_id, "airline_code": airline_code})
            next_airline_id += 1

        for airport_code in [departure_code, arrival_code]:
            if airport_code not in airport_id_by_code:
                airport_id_by_code[airport_code] = next_airport_id
                airport_rows.append({"id": next_airport_id, "airport_code": airport_code})
                next_airport_id += 1

    database_query_count += bulk_upsert(Airline, airline_rows, ["airline_code"])
    database_query_count += bulk_upsert(Airport, airport_rows, ["airport_code"])

    # === 航班群組快取 ===
    # 識別鍵不再使用預估時間、實際時間、航廈與登機門，避免資料更新時建立新群組。
    group_id_by_key = {}
    group_row_by_id = {}

    for group in sorted(existing_groups, key=lambda row: row.id):
        key = make_group_key(
            group.direction,
            group.departure_airport_id,
            group.arrival_airport_id,
            group.schedule_time,
            group.is_cargo
        )
        if key not in group_id_by_key:
            group_id_by_key[key] = group.id

        group_row_by_id[group.id] = {
            "id": group.id,
            "direction": group.direction,
            "departure_airport_id": group.departure_airport_id,
            "arrival_airport_id": group.arrival_airport_id,
            "schedule_time": group.schedule_time,
            "estimated_time": group.estimated_time,
            "actual_time": group.actual_time,
            "terminal": group.terminal,
            "gate": group.gate,
            "is_cargo": bool(group.is_cargo)
        }

    next_group_id = get_next_id(existing_groups)
    valid_flights = []

    for flight_data in clean_flights:
        airline_code = flight_data["airline_id"]
        departure_code = flight_data["departure_airport_id"]
        arrival_code = flight_data["arrival_airport_id"]

        required_values = [
            flight_data["flight_date"],
            flight_data["flight_number"],
            airline_code,
            departure_code,
            arrival_code,
            flight_data["schedule_time"]
        ]
        if any(value is None for value in required_values):
            continue

        airline_id = airline_id_by_code[airline_code]
        departure_airport_id = airport_id_by_code[departure_code]
        arrival_airport_id = airport_id_by_code[arrival_code]
        key = make_group_key(
            flight_data["direction"],
            departure_airport_id,
            arrival_airport_id,
            flight_data["schedule_time"],
            flight_data["is_cargo"]
        )

        if key not in group_id_by_key:
            group_id_by_key[key] = next_group_id
            next_group_id += 1

        group_id = group_id_by_key[key]
        old_row = group_row_by_id.get(group_id, {})
        group_row_by_id[group_id] = {
            "id": group_id,
            "direction": flight_data["direction"],
            "departure_airport_id": departure_airport_id,
            "arrival_airport_id": arrival_airport_id,
            "schedule_time": flight_data["schedule_time"],
            "estimated_time": flight_data["estimated_time"] if flight_data["estimated_time"] is not None else old_row.get("estimated_time"),
            "actual_time": flight_data["actual_time"] if flight_data["actual_time"] is not None else old_row.get("actual_time"),
            "terminal": flight_data["terminal"] if flight_data["terminal"] is not None else old_row.get("terminal"),
            "gate": flight_data["gate"] if flight_data["gate"] is not None else old_row.get("gate"),
            "is_cargo": bool(flight_data["is_cargo"])
        }

        valid_flights.append({
            "flight_data": flight_data,
            "airline_id": airline_id,
            "departure_airport_id": departure_airport_id,
            "arrival_airport_id": arrival_airport_id,
            "flight_group_id": group_id
        })

    current_group_ids = {item["flight_group_id"] for item in valid_flights}
    group_rows = [group_row_by_id[group_id] for group_id in current_group_ids]
    database_query_count += bulk_upsert(
        FlightGroup,
        group_rows,
        [
            "direction",
            "departure_airport_id",
            "arrival_airport_id",
            "schedule_time",
            "estimated_time",
            "actual_time",
            "terminal",
            "gate",
            "is_cargo"
        ]
    )

    # === 航班號快取 ===
    flight_id_by_key = {}
    for flight in sorted(existing_flights, key=lambda row: row.id):
        key = make_flight_key(
            flight.flight_date,
            flight.direction,
            flight.flight_number,
            flight.airline_id,
            flight.departure_airport_id,
            flight.arrival_airport_id
        )
        if key not in flight_id_by_key:
            flight_id_by_key[key] = flight.id

    next_flight_id = get_next_id(existing_flights)
    flight_row_by_id = {}

    for item in valid_flights:
        flight_data = item["flight_data"]
        key = make_flight_key(
            flight_data["flight_date"],
            flight_data["direction"],
            flight_data["flight_number"],
            item["airline_id"],
            item["departure_airport_id"],
            item["arrival_airport_id"]
        )

        if key not in flight_id_by_key:
            flight_id_by_key[key] = next_flight_id
            next_flight_id += 1

        flight_id = flight_id_by_key[key]
        flight_row_by_id[flight_id] = {
            "id": flight_id,
            "flight_group_id": item["flight_group_id"],
            "flight_date": flight_data["flight_date"],
            "direction": flight_data["direction"],
            "flight_number": flight_data["flight_number"],
            "airline_id": item["airline_id"],
            "departure_airport_id": item["departure_airport_id"],
            "arrival_airport_id": item["arrival_airport_id"],
            "is_cargo": bool(flight_data["is_cargo"])
        }
        item["flight_id"] = flight_id

    flight_rows = list(flight_row_by_id.values())
    database_query_count += bulk_upsert(
        Flight,
        flight_rows,
        [
            "flight_group_id",
            "flight_date",
            "direction",
            "flight_number",
            "airline_id",
            "departure_airport_id",
            "arrival_airport_id",
            "is_cargo"
        ]
    )

    # === 航班狀態快取 ===
    status_id_by_flight_id = {}
    for status_record in sorted(existing_statuses, key=lambda row: row.id):
        if status_record.flight_id not in status_id_by_flight_id:
            status_id_by_flight_id[status_record.flight_id] = status_record.id

    next_status_id = get_next_id(existing_statuses)
    status_row_by_flight_id = {}

    for item in valid_flights:
        flight_data = item["flight_data"]
        flight_id = item["flight_id"]

        if flight_id not in status_id_by_flight_id:
            status_id_by_flight_id[flight_id] = next_status_id
            next_status_id += 1

        status_row_by_flight_id[flight_id] = {
            "id": status_id_by_flight_id[flight_id],
            "flight_id": flight_id,
            "estimated_time": flight_data["estimated_time"],
            "actual_time": flight_data["actual_time"],
            "delay_minutes": flight_data["delay_minutes"],
            "status": flight_data["status"],
            "remark": flight_data["remark"],
            "aircraft_type": flight_data["aircraft_type"],
            "check_counter": flight_data["check_counter"],
            "baggage_claim": flight_data["baggage_claim"],
            "update_time": flight_data["update_time"]
        }

    status_rows = list(status_row_by_flight_id.values())
    database_query_count += bulk_upsert(
        FlightStatus,
        status_rows,
        [
            "flight_id",
            "estimated_time",
            "actual_time",
            "delay_minutes",
            "status",
            "remark",
            "aircraft_type",
            "check_counter",
            "baggage_claim",
            "update_time"
        ]
    )

    db.session.commit()

    return {
        "valid_count": len(valid_flights),
        "skipped_count": skipped_count,
        "new_airline_count": len(airline_rows),
        "new_airport_count": len(airport_rows),
        "processed_group_count": len(group_rows),
        "processed_flight_count": len(flight_rows),
        "processed_status_count": len(status_rows),
        "database_query_count": database_query_count
    }


def main():
    print("開始抓取 TDX 航班資料...")
    raw_data = get_tdx_flight()

    print("開始清洗航班資料...")
    clean_flights = clean_all_flights(raw_data[0])
    print("清洗後總筆數：", len(clean_flights))

    with app.app_context():
        try:
            print("開始以批次方式匯入資料庫...")
            result = import_clean_to_db(clean_flights)
        except Exception:
            db.session.rollback()
            print("匯入失敗，已嘗試回復本次交易")
            raise

    print("有效航班筆數：", result["valid_count"])
    print("略過不完整筆數：", result["skipped_count"])
    print("新增航空公司：", result["new_airline_count"])
    print("新增機場：", result["new_airport_count"])
    print("處理航班群組：", result["processed_group_count"])
    print("處理航班號：", result["processed_flight_count"])
    print("處理航班狀態：", result["processed_status_count"])
    print("本次約使用資料庫 SQL 次數：", result["database_query_count"])
    print("每日航班資料更新完成")


if __name__ == "__main__":
    main()
