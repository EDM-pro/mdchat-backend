const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { Readable } = require('stream');
const router = express.Router();

const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

// Cloudinary yapılandırması
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer - memory storage (Cloudinary'e stream)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Sadece resim dosyaları yüklenebilir'), false);
  },
});

/**
 * Cloudinary'e buffer yükle
 */
const uploadToCloudinary = (buffer, userId) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'mdchat/avatars',
        public_id: `avatar_${userId}`,
        overwrite: true,
        transformation: [
          { width: 200, height: 200, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    Readable.from(buffer).pipe(uploadStream);
  });
};

/**
 * GET /api/user/profile
 */
router.get('/profile', authenticate, (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});

/**
 * PUT /api/user/profile
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { username, statusMessage } = req.body;
    const user = req.user;

    if (username && username !== user.username) {
      if (user.nickProtected) {
        return res.status(403).json({
          message: 'Nick\'iniz korumalı. Değiştirmek için Nick Şifreleme panelini kullanın.',
        });
      }
      const existingUser = await User.findOne({ username, _id: { $ne: user._id } });
      if (existingUser) {
        if (existingUser.nickProtected) return res.status(409).json({ message: 'Bu kullanıcı adı korumalıdır' });
        return res.status(409).json({ message: 'Bu kullanıcı adı zaten kullanımda' });
      }
      user.username = username;
    }

    if (statusMessage !== undefined) user.statusMessage = statusMessage.slice(0, 100);

    await user.save();
    res.json({ message: 'Profil güncellendi', user: user.toSafeObject() });
  } catch (error) {
    console.error('Profil güncelleme hatası:', error);
    res.status(500).json({ message: 'Profil güncellenirken hata oluştu' });
  }
});

/**
 * POST /api/user/avatar
 * Cloudinary'e yükle
 */
router.post('/avatar', authenticate, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Dosya yüklenmedi' });

    // Cloudinary yapılandırılmamışsa hata ver
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(503).json({ message: 'Avatar yükleme servisi yapılandırılmamış' });
    }

    const result = await uploadToCloudinary(req.file.buffer, req.user._id.toString());

    req.user.avatar = result.secure_url;
    await req.user.save();

    res.json({ message: 'Avatar güncellendi', avatar: result.secure_url, user: req.user.toSafeObject() });
  } catch (error) {
    console.error('Avatar yükleme hatası:', error);
    res.status(500).json({ message: 'Avatar yüklenirken hata oluştu' });
  }
});

/**
 * DELETE /api/user/avatar
 */
router.delete('/avatar', authenticate, async (req, res) => {
  try {
    if (process.env.CLOUDINARY_CLOUD_NAME && req.user.avatar?.includes('cloudinary')) {
      await cloudinary.uploader.destroy(`mdchat/avatars/avatar_${req.user._id}`);
    }
    req.user.avatar = null;
    await req.user.save();
    res.json({ message: 'Avatar silindi', user: req.user.toSafeObject() });
  } catch (error) {
    res.status(500).json({ message: 'Avatar silinirken hata oluştu' });
  }
});

/**
 * POST /api/user/nick-protect
 */
router.post('/nick-protect', authenticate, async (req, res) => {
  try {
    const { action, nickPassword, currentPassword } = req.body;
    const user = await User.findById(req.user._id).select('+nickPassword');

    if (action === 'enable') {
      if (!nickPassword || nickPassword.length < 4) return res.status(400).json({ message: 'Nick şifresi en az 4 karakter olmalıdır' });
      if (user.nickProtected) return res.status(400).json({ message: 'Nick zaten korumalı' });
      user.nickPassword = await bcrypt.hash(nickPassword, 12);
      user.nickProtected = true;
      await user.save();
      return res.json({ message: 'Nick koruması aktif edildi' });
    }

    if (action === 'disable') {
      if (!user.nickProtected) return res.status(400).json({ message: 'Nick zaten korumasız' });
      const isValid = await user.compareNickPassword(currentPassword);
      if (!isValid) return res.status(401).json({ message: 'Nick şifresi hatalı' });
      user.nickProtected = false;
      user.nickPassword = null;
      await user.save();
      return res.json({ message: 'Nick koruması kaldırıldı' });
    }

    if (action === 'change') {
      if (!user.nickProtected) return res.status(400).json({ message: 'Nick korumalı değil' });
      const isValid = await user.compareNickPassword(currentPassword);
      if (!isValid) return res.status(401).json({ message: 'Mevcut şifre hatalı' });
      user.nickPassword = await bcrypt.hash(nickPassword, 12);
      await user.save();
      return res.json({ message: 'Nick şifresi güncellendi' });
    }

    res.status(400).json({ message: 'Geçersiz işlem' });
  } catch (error) {
    console.error('Nick koruma hatası:', error);
    res.status(500).json({ message: 'İşlem sırasında hata oluştu' });
  }
});

/**
 * GET /api/user/online
 */
router.get('/online', authenticate, async (req, res) => {
  try {
    const users = await User.find({ isOnline: true, _id: { $ne: req.user._id } })
      .select('username avatar statusMessage isOnline lastSeen')
      .limit(50);
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: 'Kullanıcılar getirilemedi' });
  }
});

/**
 * GET /api/user/:userId
 */
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('username avatar statusMessage isOnline lastSeen nickProtected');
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Kullanıcı bilgileri getirilemedi' });
  }
});

module.exports = router;
