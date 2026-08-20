const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Slot = require("../models/Slot");
const ParkingLot = require("../models/ParkingLot");
const Notification = require("../models/Notification");
const generateOtp = require("../utils/generateOtp");

// Fire-and-forget helper — a failed notification write should never block
// the booking flow itself, so errors are swallowed here.
const notify = async (userId, type, title, message, bookingId) => {
  try {
    await Notification.create({ user: userId, type, title, message, booking: bookingId });
  } catch (err) {
    console.error("Failed to create notification:", err.message);
  }
};

// Checks whether [startTime, endTime) overlaps any existing non-cancelled
// booking for the given slot. Runs inside the passed session so the check
// and the insert are atomic together.
const hasOverlappingBooking = async (slotId, startTime, endTime, session) => {
  const overlap = await Booking.findOne({
    slot: slotId,
    status: { $in: ["pending", "confirmed", "active"] },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  }).session(session);

  return !!overlap;
};

// @desc    Create a booking for a slot + time window
// @route   POST /api/bookings
// @access  Private (user)
const createBooking = asyncHandler(async (req, res) => {
  const { slotId, startTime, endTime, vehicleNumber } = req.body;

  if (!slotId || !startTime || !endTime || !vehicleNumber) {
    res.status(400);
    throw new Error("slotId, startTime, endTime and vehicleNumber are required");
  }

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start) || isNaN(end) || start >= end) {
    res.status(400);
    throw new Error("Invalid time window");
  }
  if (start < new Date()) {
    res.status(400);
    throw new Error("Start time cannot be in the past");
  }

  const slot = await Slot.findById(slotId);
  if (!slot) {
    res.status(404);
    throw new Error("Slot not found");
  }
  if (slot.status === "maintenance") {
    res.status(400);
    throw new Error("This slot is currently under maintenance");
  }

  const lot = await ParkingLot.findById(slot.parkingLot);
  if (!lot || !lot.isActive) {
    res.status(404);
    throw new Error("Parking lot not found or inactive");
  }

  const hours = (end - start) / (1000 * 60 * 60);
  const amount = Math.ceil(hours * lot.pricePerHour * 100) / 100;

  // --- Concurrency-safe booking creation ---
  // Two users hitting "book this slot" at the same instant is the classic
  // race condition here. We use a transaction so the "is it free?" check
  // and the "create the booking" write happen atomically — the second
  // request will see the first request's booking (or the transaction will
  // conflict and retry/fail), instead of both succeeding.
  // NOTE: transactions require MongoDB to be running as a replica set
  // (MongoDB Atlas gives you this by default).
  const session = await mongoose.startSession();
  let booking;

  try {
    await session.withTransaction(async () => {
      const overlapping = await hasOverlappingBooking(slotId, start, end, session);
      if (overlapping) {
        throw new Error("SLOT_UNAVAILABLE");
      }

      const otp = generateOtp();

      const created = await Booking.create(
        [
          {
            user: req.user._id,
            parkingLot: lot._id,
            slot: slot._id,
            vehicleNumber,
            startTime: start,
            endTime: end,
            amount,
            status: "pending",
            paymentStatus: "pending",
            otp,
          },
        ],
        { session }
      );
      booking = created[0];
    });
  } catch (err) {
    if (err.message === "SLOT_UNAVAILABLE") {
      res.status(409);
      throw new Error("This slot is already booked for the selected time window");
    }
    throw err;
  } finally {
    session.endSession();
  }

  res.status(201).json({ success: true, data: booking });
});

// @desc    Simulate payment for a booking (swap this for a real gateway later)
// @route   PUT /api/bookings/:id/pay
// @access  Private (owner of the booking)
const payForBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    res.status(404);
    throw new Error("Booking not found");
  }
  if (booking.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized for this booking");
  }
  if (booking.status !== "pending") {
    res.status(400);
    throw new Error(`Booking is already ${booking.status}`);
  }

  booking.paymentStatus = "paid";
  booking.status = "confirmed";
  await booking.save();

  const lot = await ParkingLot.findById(booking.parkingLot);
  await notify(
    booking.user,
    "booking_confirmation",
    "Booking confirmed",
    `Your spot at ${lot?.name || "the lot"} is confirmed. Check-in code: ${booking.otp}`,
    booking._id
  );

  res.json({ success: true, data: booking });
});

// @desc    Get the logged-in user's bookings
// @route   GET /api/bookings/my
// @access  Private (user)
const getMyBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ user: req.user._id })
    .populate("parkingLot", "name address")
    .populate("slot", "slotNumber")
    .sort({ createdAt: -1 });

  res.json({ success: true, count: bookings.length, data: bookings });
});

// @desc    Get bookings for lots owned by the logged-in owner
// @route   GET /api/bookings/owner
// @access  Private (owner)
const getOwnerBookings = asyncHandler(async (req, res) => {
  const myLots = await ParkingLot.find({ owner: req.user._id }).select("_id");
  const lotIds = myLots.map((l) => l._id);

  const bookings = await Booking.find({ parkingLot: { $in: lotIds } })
    .populate("user", "name email phone")
    .populate("parkingLot", "name address")
    .populate("slot", "slotNumber")
    .sort({ createdAt: -1 });

  res.json({ success: true, count: bookings.length, data: bookings });
});

// @desc    Cancel a booking
// @route   PUT /api/bookings/:id/cancel
// @access  Private (owner of the booking)
const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    res.status(404);
    throw new Error("Booking not found");
  }
  if (booking.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    res.status(403);
    throw new Error("Not authorized for this booking");
  }
  if (["completed", "cancelled"].includes(booking.status)) {
    res.status(400);
    throw new Error(`Booking is already ${booking.status}`);
  }

  booking.status = "cancelled";
  if (booking.paymentStatus === "paid") {
    booking.paymentStatus = "refunded"; // hook up real refund logic here later
  }
  await booking.save();

  await notify(
    booking.user,
    "booking_cancelled",
    "Booking cancelled",
    `Your booking for slot has been cancelled.`,
    booking._id
  );

  res.json({ success: true, data: booking });
});

// @desc    Check in a booking using its OTP (marks it active)
// @route   PUT /api/bookings/:id/checkin
// @access  Private (owner of the lot, admin)
const checkInBooking = asyncHandler(async (req, res) => {
  const { otp } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    res.status(404);
    throw new Error("Booking not found");
  }
  if (booking.status !== "confirmed") {
    res.status(400);
    throw new Error("Only confirmed (paid) bookings can be checked in");
  }
  if (booking.otp !== otp) {
    res.status(400);
    throw new Error("Invalid OTP");
  }

  booking.status = "active";
  await booking.save();

  res.json({ success: true, data: booking });
});

// @desc    Check out a booking (marks it completed)
// @route   PUT /api/bookings/:id/checkout
// @access  Private (owner of the lot, admin)
const checkOutBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    res.status(404);
    throw new Error("Booking not found");
  }
  if (booking.status !== "active") {
    res.status(400);
    throw new Error("Only active bookings can be checked out");
  }

  booking.status = "completed";
  await booking.save();

  res.json({ success: true, data: booking });
});

module.exports = {
  createBooking,
  payForBooking,
  getMyBookings,
  getOwnerBookings,
  cancelBooking,
  checkInBooking,
  checkOutBooking,
};
