const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");

// Verifies the JWT and attaches the user to req.user
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id);
      if (!req.user) {
        res.status(401);
        throw new Error("User no longer exists");
      }
      return next();
    } catch (err) {
      res.status(401);
      throw new Error("Not authorized, token invalid or expired");
    }
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token provided");
  }
});

// Restricts a route to specific roles, e.g. authorize("owner", "admin")
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403);
      throw new Error(
        `Role '${req.user ? req.user.role : "unknown"}' is not permitted to access this resource`
      );
    }
    next();
  };
};

module.exports = { protect, authorize };
