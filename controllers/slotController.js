const asyncHandler = require("express-async-handler");
const Slot = require("../models/Slot");
const ParkingLot = require("../models/ParkingLot");

// Small helper to confirm the requester owns the parking lot this slot belongs to
const assertOwnsLot = async (lotId, user) => {
  const lot = await ParkingLot.findById(lotId);
  if (!lot) {
    const err = new Error("Parking lot not found");
    err.statusCode = 404;
    throw err;
  }
  if (lot.owner.toString() !== user._id.toString() && user.role !== "admin") {
    const err = new Error("Not authorized for this parking lot");
    err.statusCode = 403;
    throw err;
  }
  return lot;
};

// @desc    Get all slots for a parking lot
// @route   GET /api/slots/lot/:lotId
// @access  Public
const getSlotsByLot = asyncHandler(async (req, res) => {
  const slots = await Slot.find({ parkingLot: req.params.lotId });
  res.json({ success: true, count: slots.length, data: slots });
});

// @desc    Add a single extra slot to a lot
// @route   POST /api/slots
// @access  Private (owner)
const createSlot = asyncHandler(async (req, res) => {
  const { parkingLot, slotNumber, vehicleType } = req.body;

  if (!parkingLot || !slotNumber) {
    res.status(400);
    throw new Error("parkingLot and slotNumber are required");
  }

  const lot = await assertOwnsLot(parkingLot, req.user);

  const slot = await Slot.create({ parkingLot: lot._id, slotNumber, vehicleType });

  lot.totalSlots += 1;
  await lot.save();

  res.status(201).json({ success: true, data: slot });
});

// @desc    Update a slot (e.g. set to maintenance)
// @route   PUT /api/slots/:id
// @access  Private (owner)
const updateSlot = asyncHandler(async (req, res) => {
  const slot = await Slot.findById(req.params.id);
  if (!slot) {
    res.status(404);
    throw new Error("Slot not found");
  }

  await assertOwnsLot(slot.parkingLot, req.user);

  if (req.body.status) slot.status = req.body.status;
  if (req.body.vehicleType) slot.vehicleType = req.body.vehicleType;

  await slot.save();
  res.json({ success: true, data: slot });
});

// @desc    Delete a slot
// @route   DELETE /api/slots/:id
// @access  Private (owner)
const deleteSlot = asyncHandler(async (req, res) => {
  const slot = await Slot.findById(req.params.id);
  if (!slot) {
    res.status(404);
    throw new Error("Slot not found");
  }

  const lot = await assertOwnsLot(slot.parkingLot, req.user);

  await slot.deleteOne();
  lot.totalSlots = Math.max(0, lot.totalSlots - 1);
  await lot.save();

  res.json({ success: true, message: "Slot deleted" });
});

module.exports = { getSlotsByLot, createSlot, updateSlot, deleteSlot };
