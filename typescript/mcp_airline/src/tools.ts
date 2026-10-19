// Centralized tool definitions for airline domain
import {
  AirlineDatabase,
  AirportCode,
  CabinClass,
  DirectFlight,
  Flight,
  FlightDateStatus,
  FlightDateStatusAvailable,
  FlightInfo,
  FlightType,
  Insurance,
  Passenger,
  Payment,
  PaymentMethod,
  Reservation,
  ReservationFlight,
  User,
  Certificate,
} from "./types.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
  handler: (args: any, db: AirlineDatabase) => any;
}

// Helper functions
function searchDirectFlight(
  db: AirlineDatabase,
  date: string,
  origin?: string,
  destination?: string,
  leave_after?: string
): DirectFlight[] {
  const results: DirectFlight[] = [];
  const dbState = db.getState();

  for (const flight of Object.values(dbState.flights)) {
    const check =
      (origin === undefined || flight.origin === origin) &&
      (destination === undefined || flight.destination === destination) &&
      (date in flight.dates) &&
      (flight.dates[date].status === "available") &&
      (leave_after === undefined || flight.scheduled_departure_time_est >= leave_after);

    if (check) {
      const flightDateData = flight.dates[date] as FlightDateStatusAvailable;
      const directFlight: DirectFlight = {
        flight_number: flight.flight_number,
        origin: flight.origin,
        destination: flight.destination,
        status: "available",
        scheduled_departure_time_est: flight.scheduled_departure_time_est,
        scheduled_arrival_time_est: flight.scheduled_arrival_time_est,
        available_seats: flightDateData.available_seats,
        prices: flightDateData.prices,
      };
      results.push(directFlight);
    }
  }
  return results;
}

function paymentForUpdate(
  db: AirlineDatabase,
  user: User,
  payment_id: string,
  total_price: number
): Payment | null {
  // Check payment
  if (!user.payment_methods[payment_id]) {
    throw new Error("Payment method not found");
  }
  const payment_method = user.payment_methods[payment_id];
  if (payment_method.source === "certificate") {
    throw new Error("Certificate cannot be used to update reservation");
  }
  if (payment_method.source === "gift_card" && payment_method.amount < total_price) {
    throw new Error("Gift card balance is not enough");
  }

  // Deduct payment
  if (payment_method.source === "gift_card") {
    payment_method.amount -= total_price;
  }

  // Create payment if total price is not 0
  if (total_price !== 0) {
    return {
      payment_id: payment_id,
      amount: total_price,
    };
  }
  return null;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "book_reservation",
    description: "Book a reservation with flights, passengers, and payment methods",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The ID of the user to book the reservation such as 'sara_doe_496'"
        },
        origin: {
          type: "string",
          description: "The IATA code for the origin city such as 'SFO'"
        },
        destination: {
          type: "string",
          description: "The IATA code for the destination city such as 'JFK'"
        },
        flight_type: {
          type: "string",
          enum: ["one_way", "round_trip"],
          description: "The type of flight such as 'one_way' or 'round_trip'"
        },
        cabin: {
          type: "string",
          enum: ["basic_economy", "economy", "business"],
          description: "The cabin class such as 'basic_economy', 'economy', or 'business'"
        },
        flights: {
          type: "array",
          description: "An array of objects containing details about each piece of flight",
          items: {
            type: "object",
            properties: {
              flight_number: { type: "string" },
              date: { type: "string" }
            },
            required: ["flight_number", "date"]
          }
        },
        passengers: {
          type: "array",
          description: "An array of objects containing details about each passenger",
          items: {
            type: "object",
            properties: {
              first_name: { type: "string" },
              last_name: { type: "string" },
              dob: { type: "string" }
            },
            required: ["first_name", "last_name", "dob"]
          }
        },
        payment_methods: {
          type: "array",
          description: "An array of objects containing details about each payment method",
          items: {
            type: "object",
            properties: {
              payment_id: { type: "string" },
              amount: { type: "number" }
            },
            required: ["payment_id", "amount"]
          }
        },
        total_baggages: {
          type: "number",
          description: "The total number of baggage items to book the reservation"
        },
        nonfree_baggages: {
          type: "number",
          description: "The number of non-free baggage items to book the reservation"
        },
        insurance: {
          type: "string",
          enum: ["yes", "no"],
          description: "Whether the reservation has insurance"
        }
      },
      required: [
        "user_id", "origin", "destination", "flight_type", "cabin",
        "flights", "passengers", "payment_methods", "total_baggages",
        "nonfree_baggages", "insurance"
      ]
    },
    handler: (args, db) => {
      const {
        user_id,
        origin,
        destination,
        flight_type,
        cabin,
        flights,
        passengers,
        payment_methods,
        total_baggages,
        nonfree_baggages,
        insurance
      } = args as {
        user_id: string;
        origin: string;
        destination: string;
        flight_type: FlightType;
        cabin: CabinClass;
        flights: FlightInfo[];
        passengers: Passenger[];
        payment_methods: Payment[];
        total_baggages: number;
        nonfree_baggages: number;
        insurance: Insurance;
      };

      const user = db.getUser(user_id);
      const reservation_id = db.getNewReservationId();
      const dbState = db.getState();

      const reservation: Reservation = {
        reservation_id,
        user_id,
        origin,
        destination,
        flight_type,
        cabin,
        flights: [],
        passengers: JSON.parse(JSON.stringify(passengers)),
        payment_history: JSON.parse(JSON.stringify(payment_methods)),
        created_at: db.getDateTime(),
        total_baggages,
        nonfree_baggages,
        insurance,
      };

      // Update flights and calculate price
      let total_price = 0;
      const all_flights_date_data: FlightDateStatusAvailable[] = [];

      for (const flight_info of flights) {
        const flight_number = flight_info.flight_number;
        const flight = db.getFlight(flight_number);
        const flight_date_data = db.getFlightInstance(flight_number, flight_info.date);

        // Checking flight availability
        if (flight_date_data.status !== "available") {
          throw new Error(`Flight ${flight_number} not available on date ${flight_info.date}`);
        }

        const available_flight = flight_date_data as FlightDateStatusAvailable;

        // Checking seat availability
        if (available_flight.available_seats[cabin] < passengers.length) {
          throw new Error(`Not enough seats on flight ${flight_number}`);
        }

        // Calculate price
        const price = available_flight.prices[cabin];

        // Update reservation
        reservation.flights.push({
          origin: flight.origin,
          destination: flight.destination,
          flight_number,
          date: flight_info.date,
          price,
        });

        all_flights_date_data.push(available_flight);
        total_price += price * passengers.length;
      }

      // Add insurance fee
      if (insurance === "yes") {
        total_price += 30 * passengers.length;
      }

      // Add baggage fee
      total_price += 50 * nonfree_baggages;

      // Validate payment methods
      for (const payment_method of payment_methods) {
        const payment_id = payment_method.payment_id;
        const amount = payment_method.amount;

        if (!user.payment_methods[payment_id]) {
          throw new Error(`Payment method ${payment_id} not found`);
        }

        const user_payment_method = user.payment_methods[payment_id];
        if (user_payment_method.source === "gift_card" || user_payment_method.source === "certificate") {
          if (user_payment_method.amount < amount) {
            throw new Error(`Not enough balance in payment method ${payment_id}`);
          }
        }
      }

      const total_payment = payment_methods.reduce((sum, p) => sum + p.amount, 0);
      if (total_payment !== total_price) {
        throw new Error(
          `Payment amount does not add up, total price is ${total_price}, but paid ${total_payment}`
        );
      }

      // If checks pass, deduct payment
      for (const payment_method of payment_methods) {
        const payment_id = payment_method.payment_id;
        const amount = payment_method.amount;
        const user_payment_method = user.payment_methods[payment_id];

        if (user_payment_method.source === "gift_card") {
          user_payment_method.amount -= amount;
        } else if (user_payment_method.source === "certificate") {
          delete user.payment_methods[payment_id];
        }
      }

      // Update DB
      for (const flight_date_data of all_flights_date_data) {
        flight_date_data.available_seats[cabin] -= passengers.length;
      }
      dbState.reservations[reservation_id] = reservation;
      user.reservations.push(reservation_id);

      return reservation;
    }
  },

  {
    name: "calculate",
    description: "Calculate the result of a mathematical expression",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "The mathematical expression to calculate, such as '2 + 2'. The expression can contain numbers, operators (+, -, *, /), parentheses, and spaces."
        }
      },
      required: ["expression"]
    },
    handler: (args) => {
      const { expression } = args as { expression: string };

      try {
        // Use Function constructor to safely evaluate
        const result = Function(`"use strict"; return (${expression})`)();
        return String(Math.round(result * 100) / 100);
      } catch (error) {
        throw new Error("Invalid expression");
      }
    }
  },

  {
    name: "cancel_reservation",
    description: "Cancel the whole reservation",
    inputSchema: {
      type: "object",
      properties: {
        reservation_id: {
          type: "string",
          description: "The reservation ID, such as 'ZFA04Y'"
        }
      },
      required: ["reservation_id"]
    },
    handler: (args, db) => {
      const { reservation_id } = args as { reservation_id: string };
      const reservation = db.getReservation(reservation_id);

      // Reverse the payment
      const refunds: Payment[] = [];
      for (const payment of reservation.payment_history) {
        refunds.push({
          payment_id: payment.payment_id,
          amount: -payment.amount,
        });
      }
      reservation.payment_history.push(...refunds);
      reservation.status = "cancelled";

      // Note: Seat release not implemented as per original code
      console.error("⚠️  Seats release not implemented for cancellation");

      return reservation;
    }
  },

  {
    name: "get_reservation_details",
    description: "Get the details of a reservation",
    inputSchema: {
      type: "object",
      properties: {
        reservation_id: {
          type: "string",
          description: "The reservation ID, such as '8JX2WO'"
        }
      },
      required: ["reservation_id"]
    },
    handler: (args, db) => {
      const { reservation_id } = args as { reservation_id: string };
      return db.getReservation(reservation_id);
    }
  },

  {
    name: "get_user_details",
    description: "Get the details of a user, including their reservations",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The user ID, such as 'sara_doe_496'"
        }
      },
      required: ["user_id"]
    },
    handler: (args, db) => {
      const { user_id } = args as { user_id: string };
      return db.getUser(user_id);
    }
  },

  {
    name: "list_all_airports",
    description: "Returns a list of all available airports",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    },
    handler: () => {
      const airports: AirportCode[] = [
        { iata: "SFO", city: "San Francisco" },
        { iata: "JFK", city: "New York" },
        { iata: "LAX", city: "Los Angeles" },
        { iata: "ORD", city: "Chicago" },
        { iata: "DFW", city: "Dallas" },
        { iata: "DEN", city: "Denver" },
        { iata: "SEA", city: "Seattle" },
        { iata: "ATL", city: "Atlanta" },
        { iata: "MIA", city: "Miami" },
        { iata: "BOS", city: "Boston" },
        { iata: "PHX", city: "Phoenix" },
        { iata: "IAH", city: "Houston" },
        { iata: "LAS", city: "Las Vegas" },
        { iata: "MCO", city: "Orlando" },
        { iata: "EWR", city: "Newark" },
        { iata: "CLT", city: "Charlotte" },
        { iata: "MSP", city: "Minneapolis" },
        { iata: "DTW", city: "Detroit" },
        { iata: "PHL", city: "Philadelphia" },
        { iata: "LGA", city: "LaGuardia" },
      ];
      return airports;
    }
  },

  {
    name: "search_direct_flight",
    description: "Search for direct flights between two cities on a specific date",
    inputSchema: {
      type: "object",
      properties: {
        origin: {
          type: "string",
          description: "The origin city airport in three letters, such as 'JFK'"
        },
        destination: {
          type: "string",
          description: "The destination city airport in three letters, such as 'LAX'"
        },
        date: {
          type: "string",
          description: "The date of the flight in the format 'YYYY-MM-DD', such as '2024-01-01'"
        }
      },
      required: ["origin", "destination", "date"]
    },
    handler: (args, db) => {
      const { origin, destination, date } = args as {
        origin: string;
        destination: string;
        date: string;
      };
      return searchDirectFlight(db, date, origin, destination);
    }
  },

  {
    name: "search_onestop_flight",
    description: "Search for one-stop flights between two cities on a specific date",
    inputSchema: {
      type: "object",
      properties: {
        origin: {
          type: "string",
          description: "The origin city airport in three letters, such as 'JFK'"
        },
        destination: {
          type: "string",
          description: "The destination city airport in three letters, such as 'LAX'"
        },
        date: {
          type: "string",
          description: "The date of the flight in the format 'YYYY-MM-DD', such as '2024-05-01'"
        }
      },
      required: ["origin", "destination", "date"]
    },
    handler: (args, db) => {
      const { origin, destination, date } = args as {
        origin: string;
        destination: string;
        date: string;
      };

      const results: [DirectFlight, DirectFlight][] = [];

      for (const result1 of searchDirectFlight(db, date, origin, undefined)) {
        result1.date = date;

        // Calculate date2
        const hasNextDay = result1.scheduled_arrival_time_est.includes("+1");
        const dateObj = new Date(date);
        if (hasNextDay) {
          dateObj.setDate(dateObj.getDate() + 1);
        }
        const date2 = dateObj.toISOString().split('T')[0];

        for (const result2 of searchDirectFlight(
          db,
          date2,
          result1.destination,
          destination,
          result1.scheduled_arrival_time_est
        )) {
          result2.date = date2;
          results.push([result1, result2]);
        }
      }

      return results;
    }
  },

  {
    name: "send_certificate",
    description: "Send a certificate to a user. Be careful!",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The ID of the user to book the reservation, such as 'sara_doe_496'"
        },
        amount: {
          type: "number",
          description: "The amount of the certificate to send"
        }
      },
      required: ["user_id", "amount"]
    },
    handler: (args, db) => {
      const { user_id, amount } = args as { user_id: string; amount: number };
      const user = db.getUser(user_id);

      // Add a certificate, assume at most 3 cases per task
      const paymentIds = db.getNewPaymentIds();
      for (const id of paymentIds) {
        const payment_id = `certificate_${id}`;
        if (!user.payment_methods[payment_id]) {
          const new_payment: Certificate = {
            id: payment_id,
            amount,
            source: "certificate",
          };
          user.payment_methods[payment_id] = new_payment;
          return `Certificate ${payment_id} added to user ${user_id} with amount ${amount}.`;
        }
      }
      throw new Error("Too many certificates");
    }
  },

  {
    name: "transfer_to_human_agents",
    description: "Transfer the user to a human agent, with a summary of the user's issue. Only transfer if the user explicitly asks for a human agent or given the policy and the available tools, you cannot solve the user's issue.",
    inputSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "A summary of the user's issue"
        }
      },
      required: ["summary"]
    },
    handler: () => {
      return "Transfer successful";
    }
  },

  {
    name: "update_reservation_baggages",
    description: "Update the baggage information of a reservation",
    inputSchema: {
      type: "object",
      properties: {
        reservation_id: {
          type: "string",
          description: "The reservation ID, such as 'ZFA04Y'"
        },
        total_baggages: {
          type: "number",
          description: "The updated total number of baggage items included in the reservation"
        },
        nonfree_baggages: {
          type: "number",
          description: "The updated number of non-free baggage items included in the reservation"
        },
        payment_id: {
          type: "string",
          description: "The payment id stored in user profile, such as 'credit_card_7815826', 'gift_card_7815826', 'certificate_7815826'"
        }
      },
      required: ["reservation_id", "total_baggages", "nonfree_baggages", "payment_id"]
    },
    handler: (args, db) => {
      const { reservation_id, total_baggages, nonfree_baggages, payment_id } = args as {
        reservation_id: string;
        total_baggages: number;
        nonfree_baggages: number;
        payment_id: string;
      };

      const reservation = db.getReservation(reservation_id);
      const user = db.getUser(reservation.user_id);

      // Calculate price
      const total_price = 50 * Math.max(0, nonfree_baggages - reservation.nonfree_baggages);

      // Create payment
      const payment = paymentForUpdate(db, user, payment_id, total_price);
      if (payment !== null) {
        reservation.payment_history.push(payment);
      }

      // Update reservation
      reservation.total_baggages = total_baggages;
      reservation.nonfree_baggages = nonfree_baggages;

      return reservation;
    }
  },

  {
    name: "update_reservation_flights",
    description: "Update the flight information of a reservation",
    inputSchema: {
      type: "object",
      properties: {
        reservation_id: {
          type: "string",
          description: "The reservation ID, such as 'ZFA04Y'"
        },
        cabin: {
          type: "string",
          enum: ["basic_economy", "economy", "business"],
          description: "The cabin class of the reservation"
        },
        flights: {
          type: "array",
          description: "An array of objects containing details about each piece of flight in the ENTIRE new reservation. Even if the a flight segment is not changed, it should still be included in the array.",
          items: {
            type: "object",
            properties: {
              flight_number: { type: "string" },
              date: { type: "string" }
            },
            required: ["flight_number", "date"]
          }
        },
        payment_id: {
          type: "string",
          description: "The payment id stored in user profile, such as 'credit_card_7815826', 'gift_card_7815826', 'certificate_7815826'"
        }
      },
      required: ["reservation_id", "cabin", "flights", "payment_id"]
    },
    handler: (args, db) => {
      const { reservation_id, cabin, flights, payment_id } = args as {
        reservation_id: string;
        cabin: CabinClass;
        flights: FlightInfo[];
        payment_id: string;
      };

      const reservation = db.getReservation(reservation_id);
      const user = db.getUser(reservation.user_id);

      // Update flights and calculate price
      let total_price = 0;
      const reservation_flights: ReservationFlight[] = [];

      for (const flight_info of flights) {
        // If existing flight, keep it
        const matching_reservation_flight = reservation.flights.find(
          rf =>
            rf.flight_number === flight_info.flight_number &&
            rf.date === flight_info.date &&
            cabin === reservation.cabin
        );

        if (matching_reservation_flight) {
          total_price += matching_reservation_flight.price * reservation.passengers.length;
          reservation_flights.push(matching_reservation_flight);
          continue;
        }

        // If new flight:
        const flight = db.getFlight(flight_info.flight_number);
        const flight_date_data = db.getFlightInstance(
          flight_info.flight_number,
          flight_info.date
        );

        // Check flight availability
        if (flight_date_data.status !== "available") {
          throw new Error(
            `Flight ${flight_info.flight_number} not available on date ${flight_info.date}`
          );
        }

        const available_flight = flight_date_data as FlightDateStatusAvailable;

        // Check seat availability
        if (available_flight.available_seats[cabin] < reservation.passengers.length) {
          throw new Error(`Not enough seats on flight ${flight_info.flight_number}`);
        }

        // Calculate price and add to reservation
        const reservation_flight: ReservationFlight = {
          flight_number: flight_info.flight_number,
          date: flight_info.date,
          price: available_flight.prices[cabin],
          origin: flight.origin,
          destination: flight.destination,
        };
        total_price += reservation_flight.price * reservation.passengers.length;
        reservation_flights.push(reservation_flight);
      }

      // Deduct amount already paid for reservation
      total_price -= reservation.flights.reduce((sum, f) => sum + f.price, 0) * reservation.passengers.length;

      // Create payment
      const payment = paymentForUpdate(db, user, payment_id, total_price);
      if (payment !== null) {
        reservation.payment_history.push(payment);
      }

      // Update reservation
      reservation.flights = reservation_flights;
      reservation.cabin = cabin;

      // Note: Do not make flight database update here as per original code
      return reservation;
    }
  },

  {
    name: "update_reservation_passengers",
    description: "Update the passenger information of a reservation",
    inputSchema: {
      type: "object",
      properties: {
        reservation_id: {
          type: "string",
          description: "The reservation ID, such as 'ZFA04Y'"
        },
        passengers: {
          type: "array",
          description: "An array of objects containing details about each passenger",
          items: {
            type: "object",
            properties: {
              first_name: { type: "string" },
              last_name: { type: "string" },
              dob: { type: "string" }
            },
            required: ["first_name", "last_name", "dob"]
          }
        }
      },
      required: ["reservation_id", "passengers"]
    },
    handler: (args, db) => {
      const { reservation_id, passengers } = args as {
        reservation_id: string;
        passengers: Passenger[];
      };

      const reservation = db.getReservation(reservation_id);

      if (passengers.length !== reservation.passengers.length) {
        throw new Error("Number of passengers does not match");
      }

      reservation.passengers = JSON.parse(JSON.stringify(passengers));
      return reservation;
    }
  },

  {
    name: "get_flight_status",
    description: "Get the status of a flight",
    inputSchema: {
      type: "object",
      properties: {
        flight_number: {
          type: "string",
          description: "The flight number"
        },
        date: {
          type: "string",
          description: "The date of the flight"
        }
      },
      required: ["flight_number", "date"]
    },
    handler: (args, db) => {
      const { flight_number, date } = args as { flight_number: string; date: string };
      return db.getFlightInstance(flight_number, date).status;
    }
  },
];

// Helper functions to work with tools
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find(tool => tool.name === name);
}

export function getToolList() {
  return TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
}

export function executeToolCall(name: string, args: any, db: AirlineDatabase): any {
  const tool = getToolByName(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool.handler(args, db);
}
