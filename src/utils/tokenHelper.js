const jwt = require('jsonwebtoken');

/**
 * Access token üret (kısa ömürlü)
 */
const generateAccessToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '15m' }
  );
};

/**
 * Refresh token üret (uzun ömürlü)
 */
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
  );
};

/**
 * Access token doğrula
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Refresh token doğrula
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

/**
 * İki kullanıcı arasında deterministik özel oda ID'si oluştur
 */
const generateRoomId = (userId1, userId2) => {
  const sorted = [userId1.toString(), userId2.toString()].sort();
  return `private_${sorted[0]}_${sorted[1]}`;
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateRoomId,
};
