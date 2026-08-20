const express = require("express");
const router = express.Router();
const {
  createParkingLot,
  getNearbyLots,
  searchLots,
  getParkingLotById,
  getMyLots,
  updateParkingLot,
  deleteParkingLot,
} = require("../controllers/parkingController");
const { protect, authorize } = require("../middleware/authMiddleware");

// Public — specific routes before the generic "/:id" route
router.get("/nearby", getNearbyLots);
router.get("/search", searchLots);
router.get("/mine", protect, authorize("owner", "admin"), getMyLots);
router.post("/", protect, authorize("owner", "admin"), createParkingLot);

router.get("/:id", getParkingLotById);
router.put("/:id", protect, authorize("owner", "admin"), updateParkingLot);
router.delete("/:id", protect, authorize("owner", "admin"), deleteParkingLot);

module.exports = router;
