const asyncHandler = require("express-async-handler");
const ParkingLot = require("../models/ParkingLot");
const Slot = require("../models/Slot");
const Booking = require("../models/Booking");

// @desc    Owner creates a new parking lot
// @route   POST /api/parking
// @access  Private (owner, admin)
const createParkingLot = asyncHandler(async (req, res) => {
  const {
    name,
    address,
    latitude,
    longitude,
    totalSlots,
    pricePerHour,
    vehicleTypesSupported,
    amenities,
    images,
    timings,
  } = req.body;

  if (!name || !address || latitude === undefined || longitude === undefined || !totalSlots || pricePerHour === undefined) {
    res.status(400);
    throw new Error(
      "name, address, latitude, longitude, totalSlots and pricePerHour are required"
    );
  }

  const lot = await ParkingLot.create({
    owner: req.user._id,
    name,
    address,
    location: {
      type: "Point",
      coordinates: [longitude, latitude], // GeoJSON: [lng, lat]
    },
    totalSlots,
    pricePerHour,
    vehicleTypesSupported,
    amenities,
    images,
    timings,
  });

  // Auto-generate slot documents S1..Sn for this lot
  const slotsToCreate = Array.from({ length: totalSlots }, (_, i) => ({
    parkingLot: lot._id,
    slotNumber: `S${i + 1}`,
  }));
  await Slot.insertMany(slotsToCreate);

  res.status(201).json({ success: true, data: lot });
});

// Computes how many slots are free RIGHT NOW for each lot (total slots
// marked "available" minus ones currently covered by an overlapping
// pending/confirmed/active booking). N+1 query pattern is fine at MVP scale;
// swap for a single aggregation if lot counts grow large.
const attachAvailability = async (lots) => {
  const now = new Date();
  return Promise.all(
    lots.map(async (lot) => {
      const lotObj = lot.toObject ? lot.toObject() : lot;
      const usableSlots = await Slot.countDocuments({
        parkingLot: lotObj._id,
        status: "available",
      });
      const occupiedNow = await Booking.countDocuments({
        parkingLot: lotObj._id,
        status: { $in: ["pending", "confirmed", "active"] },
        startTime: { $lte: now },
        endTime: { $gte: now },
      });
      lotObj.availableCount = Math.max(0, usableSlots - occupiedNow);
      return lotObj;
    })
  );
};

// @desc    Find parking lots near a given lat/lng, with optional filters
// @route   GET /api/parking/nearby?lat=..&lng=..&radius=5&vehicleType=car&minPrice=&maxPrice=&availableOnly=true
// @access  Public
const getNearbyLots = asyncHandler(async (req, res) => {
  const { lat, lng, radius = 5, vehicleType, minPrice, maxPrice, availableOnly } = req.query; // radius in KILOMETERS

  if (!lat || !lng) {
    res.status(400);
    throw new Error("lat and lng query parameters are required");
  }

  const radiusKm = parseFloat(radius);
  if (isNaN(radiusKm) || radiusKm <= 0) {
    res.status(400);
    throw new Error("radius must be a positive number of kilometers");
  }

  const query = {
    isActive: true,
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [parseFloat(lng), parseFloat(lat)],
        },
        $maxDistance: radiusKm * 1000, // Mongo's $maxDistance is always meters
      },
    },
  };

  if (vehicleType) {
    query.vehicleTypesSupported = vehicleType;
  }
  if (minPrice || maxPrice) {
    query.pricePerHour = {};
    if (minPrice) query.pricePerHour.$gte = parseFloat(minPrice);
    if (maxPrice) query.pricePerHour.$lte = parseFloat(maxPrice);
  }

  let lots = await ParkingLot.find(query).populate("owner", "name email");
  lots = await attachAvailability(lots);

  if (availableOnly === "true") {
    lots = lots.filter((l) => l.availableCount > 0);
  }

  return res.json({ success: true, count: lots.length, data: lots });
});

// @desc    Text search lots by name or area/address, with optional filters
// @route   GET /api/parking/search?q=camac&minPrice=&maxPrice=&availableOnly=true
// @access  Public
const searchLots = asyncHandler(async (req, res) => {
  const { q, minPrice, maxPrice, vehicleType, availableOnly } = req.query;

  if (!q || !q.trim()) {
    res.status(400);
    throw new Error("q (search text) is required");
  }

  const query = {
    isActive: true,
    $or: [{ name: { $regex: q, $options: "i" } }, { address: { $regex: q, $options: "i" } }],
  };

  if (vehicleType) query.vehicleTypesSupported = vehicleType;
  if (minPrice || maxPrice) {
    query.pricePerHour = {};
    if (minPrice) query.pricePerHour.$gte = parseFloat(minPrice);
    if (maxPrice) query.pricePerHour.$lte = parseFloat(maxPrice);
  }

  let lots = await ParkingLot.find(query).populate("owner", "name email");
  lots = await attachAvailability(lots);

  if (availableOnly === "true") {
    lots = lots.filter((l) => l.availableCount > 0);
  }

  return res.json({ success: true, count: lots.length, data: lots });
});

// @desc    Get a single parking lot with its slots
// @route   GET /api/parking/:id
// @access  Public
const getParkingLotById = asyncHandler(async (req, res) => {
  const lot = await ParkingLot.findById(req.params.id).populate(
    "owner",
    "name email"
  );

  if (!lot) {
    res.status(404);
    throw new Error("Parking lot not found");
  }

  const slots = await Slot.find({ parkingLot: lot._id });

  res.json({ success: true, data: { ...lot.toObject(), slots } });
});

// @desc    Get lots owned by the logged-in owner
// @route   GET /api/parking/mine
// @access  Private (owner)
const getMyLots = asyncHandler(async (req, res) => {
  const lots = await ParkingLot.find({ owner: req.user._id });
  res.json({ success: true, count: lots.length, data: lots });
});

// @desc    Update a parking lot
// @route   PUT /api/parking/:id
// @access  Private (owner of that lot, admin)
const updateParkingLot = asyncHandler(async (req, res) => {
  const lot = await ParkingLot.findById(req.params.id);

  if (!lot) {
    res.status(404);
    throw new Error("Parking lot not found");
  }

  if (lot.owner.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    res.status(403);
    throw new Error("Not authorized to update this parking lot");
  }

  const updatableFields = [
    "name",
    "address",
    "pricePerHour",
    "vehicleTypesSupported",
    "amenities",
    "images",
    "timings",
    "isActive",
  ];
  updatableFields.forEach((field) => {
    if (req.body[field] !== undefined) lot[field] = req.body[field];
  });

  // Allow updating coordinates explicitly
  if (req.body.latitude !== undefined && req.body.longitude !== undefined) {
    lot.location = {
      type: "Point",
      coordinates: [req.body.longitude, req.body.latitude],
    };
  }

  const updatedLot = await lot.save();
  res.json({ success: true, data: updatedLot });
});

// @desc    Delete a parking lot (and its slots)
// @route   DELETE /api/parking/:id
// @access  Private (owner of that lot, admin)
const deleteParkingLot = asyncHandler(async (req, res) => {
  const lot = await ParkingLot.findById(req.params.id);

  if (!lot) {
    res.status(404);
    throw new Error("Parking lot not found");
  }

  if (lot.owner.toString() !== req.user._id.toString() && req.user.role !== "admin") {
    res.status(403);
    throw new Error("Not authorized to delete this parking lot");
  }

  // Block deletion if there are active/future bookings
  const activeBooking = await Booking.findOne({
    parkingLot: lot._id,
    status: { $in: ["pending", "confirmed", "active"] },
    endTime: { $gte: new Date() },
  });
  if (activeBooking) {
    res.status(400);
    throw new Error("Cannot delete a lot with active or upcoming bookings");
  }

  await Slot.deleteMany({ parkingLot: lot._id });
  await lot.deleteOne();

  res.json({ success: true, message: "Parking lot deleted" });
});

module.exports = {
  createParkingLot,
  getNearbyLots,
  searchLots,
  getParkingLotById,
  getMyLots,
  updateParkingLot,
  deleteParkingLot,
};
