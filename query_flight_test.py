from flight_models_test import app, Airline, Airport, Flight, FlightStatus


def main():
    with app.app_context():
        print("航空公司數量：", Airline.query.count())
        print("機場數量：", Airport.query.count())
        print("航班數量：", Flight.query.count())
        print("航班狀態數量：", FlightStatus.query.count())

        print("\n延誤航班前 10 筆：")

        delayed_flights = (
            FlightStatus.query
            .filter(FlightStatus.status == "延誤")
            .order_by(FlightStatus.delay_minutes.desc())
            .limit(10)
            .all()
        )

        for status in delayed_flights:
            flight = status.flight
            airline = flight.airline
            departure_airport = flight.departure_airport
            arrival_airport = flight.arrival_airport

            print(
                airline.airline_code,
                flight.flight_number,
                departure_airport.airport_code,
                "→",
                arrival_airport.airport_code,
                status.delay_minutes,
                "分鐘",
                status.status
            )


if __name__ == "__main__":
    main()