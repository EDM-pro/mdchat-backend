const express = require('express');
const router = express.Router();

const Message = require('../models/Message');
const { authenticate } = require('../middleware/auth');
const { generateRoomId } = require('../utils/tokenHelper');

const VALID_CHANNELS = ['md-arkadaslik', 'md-sohbet', 'md-serbest'];

/**
 * GET /api/message/channel/:channelName
 * Kanal mesajlarını getir (sayfalı)
 */
router.get('/channel/:channelName', authenticate, async (req, res) => {
  try {
    const { channelName } = req.params;
    const { page = 1, limit = 50 } = req.query;

    if (!VALID_CHANNELS.includes(channelName)) {
      return res.status(400).json({ message: 'Geçersiz kanal' });
    }

    const messages = await Message.find({
      channel: channelName,
      isDeleted: false,
    })
      .populate('sender', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Kronolojik sıraya çevir
    messages.reverse();

    res.json({ messages, page: parseInt(page), channel: channelName });
  } catch (error) {
    console.error('Kanal mesajları hatası:', error);
    res.status(500).json({ message: 'Mesajlar getirilemedi' });
  }
});

/**
 * GET /api/message/private/:userId
 * Özel mesajları getir
 */
router.get('/private/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const roomId = generateRoomId(req.user._id, userId);

    const messages = await Message.find({
      roomId,
      isDeleted: false,
    })
      .populate('sender', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    messages.reverse();

    res.json({ messages, roomId });
  } catch (error) {
    console.error('Özel mesajlar hatası:', error);
    res.status(500).json({ message: 'Özel mesajlar getirilemedi' });
  }
});

module.exports = router;
