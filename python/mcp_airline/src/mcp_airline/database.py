"""Airline database management."""

import json
import logging
import random
import string
from pathlib import Path
from typing import Optional


logger = logging.getLogger(__name__)


class AirlineDatabase:
    """
    Airline database manager for flights, users, and reservations.

    Provides methods to load and query airline data including users,
    flights, and reservations.
    """

    def __init__(self, db_path: Path | str):
        """
        Initialize database from a JSON file.

        Args:
            db_path: Path to the database JSON file

        Raises:
            ValueError: If database file cannot be loaded or is invalid
        """
        self._db_path = Path(db_path)
        self._data = self._load_data()

    @classmethod
    def from_tau2_bench(cls, base_path: Optional[Path] = None) -> "AirlineDatabase":
        """
        Create database from tau2-bench data directory.

        Args:
            base_path: Base path to data directory. If None, uses relative path.

        Returns:
            Initialized AirlineDatabase instance

        Raises:
            ValueError: If tau2-bench data cannot be found
        """
        if base_path is None:
            # Navigate from src/mcp_airline_py/ to data/
            base_path = Path(__file__).parent.parent.parent.parent.parent / "data"

        db_path = base_path / "airline" / "db.json"
        if not db_path.exists():
            raise ValueError(f"Database not found at {db_path}")

        return cls(db_path)

    def _load_data(self) -> dict:
        """
        Load and validate database from file.

        Returns:
            Parsed database dictionary

        Raises:
            ValueError: If file cannot be read or structure is invalid
        """
        try:
            with self._db_path.open('r', encoding='utf-8') as f:
                data = json.load(f)

            # Validate structure
            if not all(key in data for key in ['flights', 'users', 'reservations']):
                raise ValueError(
                    "Invalid database structure: missing flights, users, or reservations"
                )

            logger.info("Loaded airline database from: %s", self._db_path)
            return data

        except FileNotFoundError:
            raise ValueError(f"Database file not found: {self._db_path}")
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in database file: {e}")
        except Exception as e:
            raise ValueError(f"Failed to load airline data: {e}")

    def get_user(self, user_id: str) -> dict:
        """
        Get user by ID.

        Args:
            user_id: The user ID to look up

        Returns:
            User data dictionary

        Raises:
            ValueError: If user not found
        """
        if user_id not in self._data['users']:
            raise ValueError(f"User {user_id} not found")
        return self._data['users'][user_id]

    def get_reservation(self, reservation_id: str) -> dict:
        """
        Get reservation by ID.

        Args:
            reservation_id: The reservation ID to look up

        Returns:
            Reservation data dictionary

        Raises:
            ValueError: If reservation not found
        """
        if reservation_id not in self._data['reservations']:
            raise ValueError(f"Reservation {reservation_id} not found")
        return self._data['reservations'][reservation_id]

    def get_flight(self, flight_number: str) -> dict:
        """
        Get flight by flight number.

        Args:
            flight_number: The flight number to look up

        Returns:
            Flight data dictionary

        Raises:
            ValueError: If flight not found
        """
        if flight_number not in self._data['flights']:
            raise ValueError(f"Flight {flight_number} not found")
        return self._data['flights'][flight_number]

    def get_flight_instance(self, flight_number: str, date: str) -> dict:
        """
        Get specific flight instance for a date.

        Args:
            flight_number: The flight number
            date: The date in YYYY-MM-DD format

        Returns:
            Flight date status dictionary

        Raises:
            ValueError: If flight or date not found
        """
        flight = self.get_flight(flight_number)
        if date not in flight['dates']:
            raise ValueError(f"Flight {flight_number} not found on date {date}")
        return flight['dates'][date]

    def get_new_reservation_id(self) -> str:
        """
        Generate a unique 6-character alphanumeric reservation ID.

        Returns:
            New unique reservation ID

        Raises:
            ValueError: If unable to generate unique ID after max attempts
        """
        chars = string.ascii_uppercase + string.digits
        max_attempts = 100

        for _ in range(max_attempts):
            reservation_id = ''.join(random.choices(chars, k=6))
            if reservation_id not in self._data['reservations']:
                return reservation_id

        raise ValueError("Failed to generate unique reservation ID after multiple attempts")

    def get_new_payment_id(self) -> int:
        """
        Generate a 7-digit payment ID.

        Returns:
            New payment ID as integer
        """
        return random.randint(1000000, 9999999)

    def get_new_payment_ids(self, count: int = 3) -> list[int]:
        """
        Generate multiple payment IDs.

        Args:
            count: Number of IDs to generate

        Returns:
            List of payment IDs
        """
        return [self.get_new_payment_id() for _ in range(count)]

    def get_date_time(self) -> str:
        """
        Get current datetime for the simulation.

        Returns:
            Fixed datetime string for tau2-bench compatibility
        """
        return "2024-05-15T15:00:00"

    def get_state(self) -> dict:
        """
        Get the entire database state.

        Returns:
            Complete database dictionary
        """
        return self._data

    def reload(self) -> None:
        """
        Reload database from file, resetting all data to initial state.

        This method reloads the database data from disk without creating a new
        instance, allowing all existing references to the database to see the
        updated data.

        Raises:
            ValueError: If database file cannot be reloaded
        """
        self._data = self._load_data()
