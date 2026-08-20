const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const ParkingLot = require("../models/ParkingLot");
const Booking = require("../models/Booking");

// @desc    Get all users on the platform
// @route   GET /api/admin/users
// @access  Private (admin)
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ success: true, count: users.length, data: users });
});

// @desc    Delete a user (and block if they own active lots)
// @route   DELETE /api/admin/users/:id
// @access  Private (admin)
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (user.role === "admin") {
    res.status(400);
    throw new Error("Cannot delete an admin account from here");
  }

  const ownsLots = await ParkingLot.findOne({ owner: user._id });
  if (ownsLots) {
    res.status(400);
    throw new Error("This user owns parking lots — remove those first");
  }

  await user.deleteOne();
  res.json({ success: true, message: "User removed" });
});

// @desc    Get every parking lot on the platform
// @route   GET /api/admin/parking
// @access  Private (admin)
const getAllLotsAdmin = asyncHandler(async (req, res) => {
  const lots = await ParkingLot.find().populate("owner", "name email").sort({ createdAt: -1 });
  res.json({ success: true, count: lots.length, data: lots });
});

// @desc    Get every booking on the platform
// @route   GET /api/admin/bookings
// @access  Private (admin)
const getAllBookingsAdmin = asyncHandler(async (req, res) => {
  const bookings = await Booking.find()
    .populate("user", "name email")
    .populate("parkingLot", "name address")
    .populate("slot", "slotNumber")
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ success: true, count: bookings.length, data: bookings });
});

// @desc    Platform-wide summary numbers for the admin dashboard
// @route   GET /api/admin/reports
// @access  Private (admin)
const getReports = asyncHandler(async (req, res) => {
  const [totalUsers, totalOwners, totalLots, totalBookings, revenueAgg, statusCounts] =
    await Promise.all([
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "owner" }),
      ParkingLot.countDocuments(),
      Booking.countDocuments(),
      Booking.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

  const bookingsByStatus = statusCounts.reduce((acc, s) => {
    acc[s._id] = s.count;
    return acc;
  }, {});

  res.json({
    success: true,
    data: {
      totalUsers,
      totalOwners,
      totalLots,
      totalBookings,
      totalRevenue: revenueAgg[0]?.total || 0,
      bookingsByStatus,
    },
  });
});

module.exports = { getAllUsers, deleteUser, getAllLotsAdmin, getAllBookingsAdmin, getReports };
