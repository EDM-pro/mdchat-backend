const { verifyAccessToken } = require('../utils/tokenHelper');
const User = require('../models/User');

/**
 * JWT kimlik doğrulama middleware
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Yetkilendirme token\'ı bulunamadı' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'Kullanıcı bulunamadı' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: 'E-posta adresinizi doğrulamanız gerekiyor' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token süresi doldu', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Geçersiz token' });
  }
};

/**
 * Socket.io için JWT doğrulama
 */
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Kimlik doğrulama gerekli'));
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId);

    if (!user || !user.isVerified) {
      return next(new Error('Geçersiz kullanıcı'));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Geçersiz token'));
  }
};

module.exports = { authenticate, authenticateSocket };
