const express = require("express");
const router = express.Router();
const {
  getSlotsByLot,
  createSlot,
  updateSlot,
  deleteSlot,
} = require("../controllers/slotController");
const { protect, authorize } = require("../middleware/authMiddleware");

router.get("/lot/:lotId", getSlotsByLot);
router.post("/", protect, authorize("owner", "admin"), createSlot);
router.put("/:id", protect, authorize("owner", "admin"), updateSlot);
router.delete("/:id", protect, authorize("owner", "admin"), deleteSlot);

module.exports = router;
