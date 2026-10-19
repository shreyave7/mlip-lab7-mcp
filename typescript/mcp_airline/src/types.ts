// Airline domain data models based on tau2-bench

export type FlightType = "round_trip" | "one_way";
export type CabinClass = "business" | "economy" | "basic_economy";
export type Insurance = "yes" | "no";
export type MembershipLevel = "gold" | "silver" | "regular";

export interface AirportCode {
  iata: string;
  city: string;
}

export interface Name {
  first_name: string;
  last_name: string;
}

export interface Address {
  address1: string;
  address2?: string;
  city: string;
  country: string;
  state: string;
  zip: string;
}

// Payment Related Models
export interface Payment {
  payment_id: string;
  amount: number;
}

export interface PaymentMethodBase {
  source: string;
  id: string;
}

export interface CreditCard extends PaymentMethodBase {
  source: "credit_card";
  brand: string;
  last_four: string;
}

export interface GiftCard extends PaymentMethodBase {
  source: "gift_card";
  amount: number;
  id: string;
}

export interface Certificate extends PaymentMethodBase {
  source: "certificate";
  amount: number;
}

export type PaymentMethod = CreditCard | GiftCard | Certificate;

export interface Passenger {
  first_name: string;
  last_name: string;
  dob: string;
}

export type SeatPrices = {
  [K in CabinClass]: number;
};

export type AvailableSeats = {
  [K in CabinClass]: number;
};

// Flight Status Models
export interface FlightDateStatusAvailable {
  status: "available";
  available_seats: AvailableSeats;
  prices: SeatPrices;
}

export interface FlightDataStatusOnTime {
  status: "on time";
  estimated_departure_time_est: string;
  estimated_arrival_time_est: string;
}

export interface FlightDataStatusFlying {
  status: "flying";
  actual_departure_time_est: string;
  estimated_arrival_time_est: string;
}

export interface FlightDateStatusLanded {
  status: "landed";
  actual_departure_time_est: string;
  actual_arrival_time_est: string;
}

export interface FlightDateStatusCancelled {
  status: "cancelled";
}

export interface FlightDateStatusDelayed {
  status: "delayed";
  estimated_departure_time_est: string;
  estimated_arrival_time_est: string;
}

export type FlightDateStatus =
  | FlightDateStatusAvailable
  | FlightDateStatusLanded
  | FlightDateStatusCancelled
  | FlightDateStatusDelayed
  | FlightDataStatusFlying
  | FlightDataStatusOnTime;

export interface FlightBase {
  flight_number: string;
  origin: string;
  destination: string;
}

export interface Flight extends FlightBase {
  scheduled_departure_time_est: string;
  scheduled_arrival_time_est: string;
  dates: Record<string, FlightDateStatus>;
}

export interface DirectFlight extends FlightBase {
  status: "available";
  scheduled_departure_time_est: string;
  scheduled_arrival_time_est: string;
  date?: string;
  available_seats: AvailableSeats;
  prices: SeatPrices;
}

export interface ReservationFlight extends FlightBase {
  date: string;
  price: number;
}

export interface FlightInfo {
  flight_number: string;
  date: string;
}

export interface User {
  user_id: string;
  name: Name;
  address: Address;
  email: string;
  dob: string;
  payment_methods: Record<string, PaymentMethod>;
  saved_passengers: Passenger[];
  membership: MembershipLevel;
  reservations: string[];
}

export interface Reservation {
  reservation_id: string;
  user_id: string;
  origin: string;
  destination: string;
  flight_type: FlightType;
  cabin: CabinClass;
  flights: ReservationFlight[];
  passengers: Passenger[];
  payment_history: Payment[];
  created_at: string;
  total_baggages: number;
  nonfree_baggages: number;
  insurance: Insurance;
  status?: "cancelled";
}

export interface FlightDB {
  flights: Record<string, Flight>;
  users: Record<string, User>;
  reservations: Record<string, Reservation>;
}

export class AirlineDatabase {
  private db: FlightDB;

  constructor(initialDataPath: string) {
    this.db = this.loadInitialData(initialDataPath);
  }

  private loadInitialData(dataPath?: string): FlightDB {
    try {
      if (!dataPath) {
        throw new Error("No database path provided");
      }
      const data = Deno.readTextFileSync(dataPath);
      const parsedData = JSON.parse(data) as FlightDB;

      // Validate the structure
      if (!parsedData.flights || !parsedData.users || !parsedData.reservations) {
        throw new Error("Invalid database structure: missing flights, users, or reservations");
      }

      console.error(`✅ Loaded airline database from: ${dataPath}`);
      return parsedData;
    } catch (error) {
      throw new Error(`⚠️  Failed to load airline data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getUser(user_id: string): User {
    if (!this.db.users[user_id]) {
      throw new Error(`User ${user_id} not found`);
    }
    return this.db.users[user_id];
  }

  getReservation(reservation_id: string): Reservation {
    if (!this.db.reservations[reservation_id]) {
      throw new Error(`Reservation ${reservation_id} not found`);
    }
    return this.db.reservations[reservation_id];
  }

  getFlight(flight_number: string): Flight {
    if (!this.db.flights[flight_number]) {
      throw new Error(`Flight ${flight_number} not found`);
    }
    return this.db.flights[flight_number];
  }

  getFlightInstance(flight_number: string, date: string): FlightDateStatus {
    const flight = this.getFlight(flight_number);
    if (!flight.dates[date]) {
      throw new Error(`Flight ${flight_number} not found on date ${date}`);
    }
    return flight.dates[date];
  }

  getNewReservationId(): string {
    // Generate a random 6-character alphanumeric ID
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const maxAttempts = 100; // Prevent infinite loop

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let id = "";
      for (let i = 0; i < 6; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      // Check for collision
      if (!this.db.reservations[id]) {
        return id;
      }
    }

    throw new Error("Failed to generate unique reservation ID after multiple attempts");
  }

  getNewPaymentId(): number {
    // Generate a random 7-digit payment ID
    const maxAttempts = 100;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const id = Math.floor(1000000 + Math.random() * 9000000); // 7-digit number
      return id; // Collision checking happens in the tool handler
    }

    throw new Error("Failed to generate payment ID");
  }

  getNewPaymentIds(count: number = 3): number[] {
    // Generate multiple payment IDs for certificate creation
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(this.getNewPaymentId());
    }
    return ids;
  }

  getDateTime(): string {
    return "2024-05-15T15:00:00";
  }

  getState(): FlightDB {
    return this.db;
  }

  static createFromTau2Bench(): AirlineDatabase {
    const tau2Path = "../../data/airline/db.json";
    try {
      return new AirlineDatabase(tau2Path);
    } catch {
      console.error("📂 tau2-bench not found, exiting");
      throw new Error("Cannot initialize database: tau2-bench path not available");
    }
  }
}
