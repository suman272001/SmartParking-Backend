const mongoose = require("mongoose");

const parkingLotSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Parking lot name is required"],
      trim: true,
    },
    address: {
      type: String,
      required: [true, "Address is required"],
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        // [longitude, latitude]  <-- GeoJSON order, NOT lat/lng
        type: [Number],
        required: true,
        validate: {
          validator: (val) => val.length === 2,
          message: "Coordinates must be [longitude, latitude]",
        },
      },
    },
    totalSlots: {
      type: Number,
      required: true,
      min: 1,
    },
    pricePerHour: {
      type: Number,
      required: true,
      min: 0,
    },
    vehicleTypesSupported: {
      type: [String],
      enum: ["car", "bike", "truck"],
      default: ["car"],
    },
    amenities: {
      type: [String], // e.g. ["CCTV", "Covered", "EV Charging"]
      default: [],
    },
    images: {
      type: [String],
      default: [],
    },
    timings: {
      open: { type: String, default: "00:00" }, // "HH:mm"
      close: { type: String, default: "23:59" },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Geospatial index for "find nearby lots" queries
parkingLotSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("ParkingLot", parkingLotSchema);
