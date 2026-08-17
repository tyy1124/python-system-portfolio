import json
from app import app
from models import db, Airline, Airport, FlightGroup, Flight, FlightStatus

# === 取得或新增航空公司 ===
def get_or_create_airline(airline_code):
    airline = Airline.query.filter_by(airline_code=airline_code).first()

    if airline is None:
        airline = Airline(airline_code=airline_code)
        db.session.add(airline)
        db.session.flush()

    return airline


# === 取得或新增機場 ===
def get_or_create_airport(airport_code):
    airport = Airport.query.filter_by(airport_code=airport_code).first()

    if airport is None:
        airport = Airport(airport_code=airport_code)
        db.session.add(airport)
        db.session.flush()

    return airport


# === 取得或新增實際航班群組，用來合併共掛班號 ===
def get_or_create_flight_group(flight_data, departure_airport, arrival_airport):
    flight_group = FlightGroup.query.filter_by(
        direction=flight_data["direction"],
        departure_airport_id=departure_airport.id,
        arrival_airport_id=arrival_airport.id,
        schedule_time=flight_data["schedule_time"],
        estimated_time=flight_data["estimated_time"],
        actual_time=flight_data["actual_time"],
        terminal=flight_data["terminal"],
        gate=flight_data["gate"],
        is_cargo=flight_data["is_cargo"]
    ).first()

    if flight_group is None:
        flight_group = FlightGroup(
            direction=flight_data["direction"],
            departure_airport_id=departure_airport.id,
            arrival_airport_id=arrival_airport.id,
            schedule_time=flight_data["schedule_time"],
            estimated_time=flight_data["estimated_time"],
            actual_time=flight_data["actual_time"],
            terminal=flight_data["terminal"],
            gate=flight_data["gate"],
            is_cargo=flight_data["is_cargo"]
        )
        db.session.add(flight_group)
        db.session.flush()

    return flight_group


# === 取得或新增航班號資料 ===
def get_or_create_flight(flight_data, airline, departure_airport, arrival_airport, flight_group):
    flight = Flight.query.filter_by(
        flight_date=flight_data["flight_date"],
        direction=flight_data["direction"],
        flight_number=flight_data["flight_number"],
        airline_id=airline.id,
        departure_airport_id=departure_airport.id,
        arrival_airport_id=arrival_airport.id
    ).first()

    if flight is None:
        flight = Flight(
            flight_group_id=flight_group.id,
            flight_date=flight_data["flight_date"],
            direction=flight_data["direction"],
            flight_number=flight_data["flight_number"],
            airline_id=airline.id,
            departure_airport_id=departure_airport.id,
            arrival_airport_id=arrival_airport.id,
            is_cargo=flight_data["is_cargo"]
        )
        db.session.add(flight)
        db.session.flush()
    else:
        flight.flight_group_id = flight_group.id
        flight.is_cargo = flight_data["is_cargo"]

    return flight


# === 新增或更新航班狀態 ===
def create_or_update_flight_status(flight, flight_data):
    flight_status = FlightStatus.query.filter_by(flight_id=flight.id).first()

    if flight_status is None:
        flight_status = FlightStatus(flight_id=flight.id)
        db.session.add(flight_status)

    flight_status.estimated_time = flight_data["estimated_time"]
    flight_status.actual_time = flight_data["actual_time"]
    flight_status.delay_minutes = flight_data["delay_minutes"]
    flight_status.status = flight_data["status"]
    flight_status.remark = flight_data["remark"]
    flight_status.aircraft_type = flight_data["aircraft_type"]
    flight_status.check_counter = flight_data["check_counter"]
    flight_status.baggage_claim = flight_data["baggage_claim"]
    flight_status.update_time = flight_data["update_time"]


def main():
    with app.app_context():
        with open("clean_tpe_flights.json", "r", encoding="utf-8") as file:
            clean_flights = json.load(file)

        for flight_data in clean_flights:
            airline = get_or_create_airline(flight_data["airline_id"])
            departure_airport = get_or_create_airport(flight_data["departure_airport_id"])
            arrival_airport = get_or_create_airport(flight_data["arrival_airport_id"])

            flight_group = get_or_create_flight_group(
                flight_data,
                departure_airport,
                arrival_airport
            )

            flight = get_or_create_flight(
                flight_data,
                airline,
                departure_airport,
                arrival_airport,
                flight_group
            )

            create_or_update_flight_status(flight, flight_data)

        db.session.commit()

        print("清洗後資料已成功存入資料庫")
        print("航空公司數量：", Airline.query.count())
        print("機場數量：", Airport.query.count())
        print("實際航班群組數量：", FlightGroup.query.count())
        print("航班號數量：", Flight.query.count())
        print("航班狀態數量：", FlightStatus.query.count())


if __name__ == "__main__":
    main()