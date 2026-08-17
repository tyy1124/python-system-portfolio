import json
from datetime import datetime


# === 計算延誤分鐘 ===
def calculate_delay_minutes(schedule_time, estimated_time, actual_time, remark):
    if remark and "取消" in remark:
        return None

    final_time = actual_time or estimated_time

    if schedule_time is None or final_time is None:
        return None

    schedule_dt = datetime.fromisoformat(schedule_time)
    final_dt = datetime.fromisoformat(final_time)

    delay_minutes = int((final_dt - schedule_dt).total_seconds() / 60)

    return delay_minutes


# === 判斷航班狀態 ===
def get_flight_status(direction, remark, actual_time, delay_minutes):
    if remark and "取消" in remark:
        return "取消"

    if actual_time is None:
        if direction == "departure":
            return "尚未起飛"
        else:
            return "尚未抵達"

    if delay_minutes is None:
        return "未知"

    if delay_minutes < -5:
        return "提早"

    if delay_minutes <= 15:
        return "準點"

    return "延誤"


# === 整理單筆出境航班 ===
def clean_departure_flight(flight):
    clean_data = {
        "direction": "departure",
        "flight_date": flight.get("FlightDate"),
        "flight_number": flight.get("FlightNumber"),
        "airline_id": flight.get("AirlineID"),
        "departure_airport_id": flight.get("DepartureAirportID"),
        "arrival_airport_id": flight.get("ArrivalAirportID"),
        "schedule_time": flight.get("ScheduleDepartureTime"),
        "estimated_time": flight.get("EstimatedDepartureTime"),
        "actual_time": flight.get("ActualDepartureTime"),
        "remark": flight.get("DepartureRemark"),
        "terminal": flight.get("Terminal"),
        "gate": flight.get("Gate"),
        "is_cargo": flight.get("IsCargo"),
        "aircraft_type": flight.get("AcType"),
        "check_counter": flight.get("CheckCounter"),
        "baggage_claim": None,
        "update_time": flight.get("UpdateTime")
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


# === 整理單筆入境航班 ===
def clean_arrival_flight(flight):
    clean_data = {
        "direction": "arrival",
        "flight_date": flight.get("FlightDate"),
        "flight_number": flight.get("FlightNumber"),
        "airline_id": flight.get("AirlineID"),
        "departure_airport_id": flight.get("DepartureAirportID"),
        "arrival_airport_id": flight.get("ArrivalAirportID"),
        "schedule_time": flight.get("ScheduleArrivalTime"),
        "estimated_time": flight.get("EstimatedArrivalTime"),
        "actual_time": flight.get("ActualArrivalTime"),
        "remark": flight.get("ArrivalRemark"),
        "terminal": flight.get("Terminal"),
        "gate": flight.get("Gate"),
        "is_cargo": flight.get("IsCargo"),
        "aircraft_type": None,
        "check_counter": None,
        "baggage_claim": flight.get("BaggageClaim"),
        "update_time": flight.get("UpdateTime")
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


# === 清洗全部航班資料 ===
def clean_all_flights(airport_data):
    departures = airport_data.get("FIDSDeparture", [])
    arrivals = airport_data.get("FIDSArrival", [])

    clean_flights = []

    for flight in departures:
        clean_flights.append(clean_departure_flight(flight))

    for flight in arrivals:
        clean_flights.append(clean_arrival_flight(flight))

    return clean_flights


# === 主程式 ===
def main():
    with open("tdx_tpe_flights.json", "r", encoding="utf-8") as file:
        data = json.load(file)

    airport_data = data[0]

    clean_flights = clean_all_flights(airport_data)

    print("整理後總筆數：", len(clean_flights))
    
    # === 統計各狀態數量 ===
    status_count = {}
    
    for flight in clean_flights:
        status = flight["status"]
    
        if status not in status_count:
            status_count[status] = 0
    
        status_count[status] += 1
    
    print("\n狀態統計：")
    for status, count in status_count.items():
        print(status, count)

    print("\n前 5 筆整理後資料：")
    for flight in clean_flights[:5]:
        print(flight)

    with open("clean_tpe_flights.json", "w", encoding="utf-8") as file:
        json.dump(clean_flights, file, ensure_ascii=False, indent=4)

    print("\n已存成 clean_tpe_flights.json")
    
    


if __name__ == "__main__":
    main()