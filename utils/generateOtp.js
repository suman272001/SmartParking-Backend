// Generates a 6-digit numeric OTP used to verify a user at check-in
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

module.exports = generateOtp;
