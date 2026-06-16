const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const User = require('../models/User');
const { generateOTP, getOTPExpiry } = require('../utils/generateOTP');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/tokenHelper');
const { sendOTPEmail } = require('../config/mailer');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/auth/register
 * Yeni kullanıcı kaydı + OTP gönder
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validasyon
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Tüm alanlar zorunludur' });
    }

    // Mevcut kullanıcı kontrolü
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(409).json({ message: 'Bu e-posta adresi zaten kullanımda' });
      }
      // Nick korumalı mı kontrol et
      if (existingUser.nickProtected) {
        return res.status(409).json({ message: 'Bu kullanıcı adı korumalıdır' });
      }
      return res.status(409).json({ message: 'Bu kullanıcı adı zaten alınmış' });
    }

    // OTP üret
    const otp = generateOTP();
    const otpExpiry = getOTPExpiry(10);

    // Kullanıcı oluştur
    const user = new User({
      username,
      email: email.toLowerCase(),
      password,
      otpCode: otp,
      otpExpiry,
    });

    await user.save();

    // OTP e-postası gönder
    try {
      await sendOTPEmail({ to: email, username, otp });
    } catch (mailError) {
      console.error('Mail gönderme hatası:', mailError.message);
      // Mail hatası olsa bile kayıt tamamlandı, kullanıcı yeniden gönderebilir
    }

    res.status(201).json({
      message: 'Kayıt başarılı! E-posta adresinize gönderilen doğrulama kodunu girin.',
      email: email.toLowerCase(),
    });
  } catch (error) {
    console.error('Register hatası:', error);
    res.status(500).json({ message: 'Kayıt sırasında hata oluştu' });
  }
});

/**
 * POST /api/auth/verify-otp
 * OTP doğrula ve hesabı aktif et
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'E-posta ve kod zorunludur' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+otpCode +otpExpiry +otpAttempts');

    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Hesap zaten doğrulanmış' });
    }

    // Deneme sayısı kontrolü
    if (user.otpAttempts >= 5) {
      return res.status(429).json({ message: 'Çok fazla başarısız deneme. Yeni kod talep edin.' });
    }

    // Süre kontrolü
    if (!user.otpExpiry || user.otpExpiry < new Date()) {
      return res.status(400).json({ message: 'Doğrulama kodunun süresi dolmuş. Yeni kod talep edin.' });
    }

    // Kod kontrolü
    if (user.otpCode !== otp.trim()) {
      user.otpAttempts += 1;
      await user.save();
      return res.status(400).json({
        message: 'Hatalı doğrulama kodu',
        attemptsLeft: 5 - user.otpAttempts,
      });
    }

    // Başarılı doğrulama
    user.isVerified = true;
    user.otpCode = undefined;
    user.otpExpiry = undefined;
    user.otpAttempts = 0;

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken = refreshToken;

    await user.save();

    res.json({
      message: 'E-posta doğrulandı! Hoş geldiniz!',
      accessToken,
      refreshToken,
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('OTP doğrulama hatası:', error);
    res.status(500).json({ message: 'Doğrulama sırasında hata oluştu' });
  }
});

/**
 * POST /api/auth/resend-otp
 * Yeni OTP kodu gönder
 */
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+otpCode +otpExpiry +otpAttempts');

    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Hesap zaten doğrulanmış' });
    }

    const otp = generateOTP();
    user.otpCode = otp;
    user.otpExpiry = getOTPExpiry(10);
    user.otpAttempts = 0;
    await user.save();

    await sendOTPEmail({ to: email, username: user.username, otp });

    res.json({ message: 'Yeni doğrulama kodu gönderildi' });
  } catch (error) {
    console.error('OTP yeniden gönderme hatası:', error);
    res.status(500).json({ message: 'Kod gönderilirken hata oluştu' });
  }
});

/**
 * POST /api/auth/login
 * Giriş yap ve token al
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'E-posta ve şifre zorunludur' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password +refreshToken');

    if (!user) {
      return res.status(401).json({ message: 'Geçersiz e-posta veya şifre' });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: 'E-posta adresinizi doğrulamanız gerekiyor',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Geçersiz e-posta veya şifre' });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    res.json({
      message: 'Giriş başarılı',
      accessToken,
      refreshToken,
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Login hatası:', error);
    res.status(500).json({ message: 'Giriş sırasında hata oluştu' });
  }
});

/**
 * POST /api/auth/refresh
 * Access token yenile
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token gerekli' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.userId).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Geçersiz refresh token' });
    }

    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save();

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (error) {
    res.status(401).json({ message: 'Token yenilenemedi' });
  }
});

/**
 * POST /api/auth/logout
 * Çıkış yap
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    req.user.refreshToken = null;
    req.user.isOnline = false;
    req.user.lastSeen = new Date();
    await req.user.save();

    res.json({ message: 'Çıkış başarılı' });
  } catch (error) {
    res.status(500).json({ message: 'Çıkış sırasında hata oluştu' });
  }
});

/**
 * GET /api/auth/me
 * Mevcut kullanıcı bilgileri
 */
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});

module.exports = router;
