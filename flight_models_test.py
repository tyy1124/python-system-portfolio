from flask import Flask
from flask_sqlalchemy import SQLAlchemy


app = Flask(__name__)

# === SQLite 資料庫設定 ===
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///flight_data.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)


# === 航空公司表 ===
class Airline(db.Model):
    __tablename__ = "airlines"

    id = db.Column(db.Integer, primary_key=True)
    airline_code = db.Column(db.String(10), unique=True, nullable=False)


# === 機場表 ===
class Airport(db.Model):
    __tablename__ = "airports"

    id = db.Column(db.Integer, primary_key=True)
    airport_code = db.Column(db.String(10), unique=True, nullable=False)


# === 實際航班群組表：用來處理共掛班號 ===
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


# === 航班號資料表 ===
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


# === 航班狀態表：保留最新狀態 ===
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


def main():
    with app.app_context():
        db.create_all()
        print("資料庫建立成功：flight_data.db")
        print("已建立資料表：airlines, airports, flight_groups, flights, flight_statuses")


if __name__ == "__main__":
    main()