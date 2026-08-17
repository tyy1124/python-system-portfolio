from flight_models_test import app, Flight, FlightStatus


def main():
    with app.app_context():
        statuses = FlightStatus.query.all()

        group_dict = {}

        for status in statuses:
            flight = status.flight

            key = (
                flight.direction,
                flight.departure_airport.airport_code,
                flight.arrival_airport.airport_code,
                status.schedule_time,
                status.estimated_time,
                status.actual_time,
                status.terminal,
                status.gate
            )

            if key not in group_dict:
                group_dict[key] = []

            group_dict[key].append({
                "airline_code": flight.airline.airline_code,
                "flight_number": flight.flight_number,
                "delay_minutes": status.delay_minutes,
                "status": status.status
            })

        codeshare_groups = []

        for key, flights in group_dict.items():
            if len(flights) >= 2:
                codeshare_groups.append((key, flights))

        print("疑似共掛班號群組數量：", len(codeshare_groups))

        print("\n前 20 組疑似共掛班號：")
        for key, flights in codeshare_groups[:20]:
            print("\n群組條件：", key)
            print("航班數：", len(flights))

            for flight in flights:
                print(
                    flight["airline_code"],
                    flight["flight_number"],
                    flight["status"],
                    flight["delay_minutes"]
                )


if __name__ == "__main__":
    main()