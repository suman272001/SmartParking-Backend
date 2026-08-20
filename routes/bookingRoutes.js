const express = require("express");
const router = express.Router();
const {
  createBooking,
  payForBooking,
  getMyBookings,
  getOwnerBookings,
  cancelBooking,
  checkInBooking,
  checkOutBooking,
} = require("../controllers/bookingController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.post("/", protect, authorize("user", "admin"), createBooking);
router.get("/my", protect, getMyBookings);
router.get("/owner", protect, authorize("owner", "admin"), getOwnerBookings);

router.put("/:id/pay", protect, payForBooking);
router.put("/:id/cancel", protect, cancelBooking);
router.put("/:id/checkin", protect, authorize("owner", "admin"), checkInBooking);
router.put("/:id/checkout", protect, authorize("owner", "admin"), checkOutBooking);

module.exports = router;
