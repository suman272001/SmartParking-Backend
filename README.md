# Smart Parking — Backend (MERN)

## Setup

```bash
cd server
npm install
cp .env.example .env   # then fill in MONGO_URI and JWT_SECRET
npm run dev             # nodemon, needs devDependency installed
# or
npm start
```

Requires a MongoDB **replica set** (MongoDB Atlas gives you this for free)
because booking creation uses a transaction to prevent double-booking a slot.

## Folder structure

```
server/
├── config/db.js
├── models/          User, ParkingLot, Slot, Booking
├── middleware/       authMiddleware (JWT + role guard), errorMiddleware
├── controllers/       authController, parkingController, slotController, bookingController
├── routes/
├── utils/            generateToken, generateOtp
└── server.js
```

## Auth
`POST /api/auth/register` — body: `{ name, email, password, phone?, role? }` (role: "user" or "owner")
`POST /api/auth/login` — body: `{ email, password }`
`GET  /api/auth/me` — header: `Authorization: Bearer <token>`

## Parking lots
`GET  /api/parking/nearby?lat=..&lng=..&radius=5&vehicleType=car&minPrice=&maxPrice=&availableOnly=true` — public. `radius` is in **kilometers** (converted to meters internally for the geo query).
`GET  /api/parking/search?q=..&vehicleType=car&minPrice=&maxPrice=&availableOnly=true` — public, text search by lot name/address
`GET  /api/parking/:id` — public, includes slots
`GET  /api/parking/mine` — owner, their own lots
`POST /api/parking` — owner, body: `{ name, address, latitude, longitude, totalSlots, pricePerHour, vehicleTypesSupported?, amenities?, images?, timings? }`
`PUT  /api/parking/:id` — owner of that lot
`DELETE /api/parking/:id` — owner of that lot (blocked if active bookings exist)

## Slots
`GET  /api/slots/lot/:lotId` — public
`POST /api/slots` — owner, body: `{ parkingLot, slotNumber, vehicleType? }`
`PUT  /api/slots/:id` — owner, body: `{ status?, vehicleType? }`
`DELETE /api/slots/:id` — owner

## Bookings
`POST /api/bookings` — user, body: `{ slotId, startTime, endTime, vehicleNumber }`
  - Runs an overlap check inside a MongoDB transaction so two users can't
    double-book the same slot for overlapping times.
`PUT  /api/bookings/:id/pay` — user, simulates payment → status becomes "confirmed"
`GET  /api/bookings/my` — user, their booking history
`GET  /api/bookings/owner` — owner, bookings across all their lots
`PUT  /api/bookings/:id/cancel` — user (or admin)
`PUT  /api/bookings/:id/checkin` — owner, body: `{ otp }` → status becomes "active"
`PUT  /api/bookings/:id/checkout` — owner → status becomes "completed"

## Notes / things to swap out for production
- `payForBooking` simulates a successful payment — replace with a real
  Stripe/Razorpay webhook flow.
- OTP is generated server-side and returned in the booking response for now;
  in production, send it via SMS/email instead of trusting the client to read
  it off the API response.
- Add rate limiting (e.g. `express-rate-limit`) on `/api/auth/*` before deploying.
