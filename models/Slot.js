const mongoose = require("mongoose");

const slotSchema = new mongoose.Schema(
  {
    parkingLot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ParkingLot",
      required: true,
    },
    slotNumber: {
      type: String,
      required: true,
    },
    vehicleType: {
      type: String,
      enum: ["car", "bike", "truck"],
      default: "car",
    },
    // This is a coarse status flag for quick filtering/UI.
    // The real source of truth for "is this slot free at time X" is
    // the Booking collection (checked via overlap query) — see
    // bookingController.checkSlotAvailability.
    status: {
      type: String,
      enum: ["available", "maintenance"],
      default: "available",
    },
  },
  { timestamps: true }
);

// A lot can't have two slots with the same slot number
slotSchema.index({ parkingLot: 1, slotNumber: 1 }, { unique: true });

module.exports = mongoose.model("Slot", slotSchema);
