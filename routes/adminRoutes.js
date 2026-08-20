const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  deleteUser,
  getAllLotsAdmin,
  getAllBookingsAdmin,
  getReports,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Every route here is admin-only
router.use(protect, authorize("admin"));

router.get("/users", getAllUsers);
router.delete("/users/:id", deleteUser);
router.get("/parking", getAllLotsAdmin);
router.get("/bookings", getAllBookingsAdmin);
router.get("/reports", getReports);

module.exports = router;
