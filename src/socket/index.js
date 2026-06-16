const { authenticateSocket } = require('../middleware/auth');
const User = require('../models/User');
const Message = require('../models/Message');
const { generateRoomId } = require('../utils/tokenHelper');

// Kanal → {socketId: {userId, username, avatar}} haritası
const channelUsers = new Map();

// userId → socketId haritası
const userSocketMap = new Map();

const CHANNELS = ['md-arkadaslik', 'md-sohbet', 'md-serbest'];

/**
 * Bir kanalın online kullanıcı listesini yayınla
 */
const broadcastOnlineUsers = (io, channel) => {
  const users = channelUsers.get(channel) || new Map();
  const userList = Array.from(users.values());
  io.to(`channel:${channel}`).emit('online_users', { channel, users: userList });
};

/**
 * Socket.io başlatıcı
 */
const initSocket = (io) => {
  // JWT kimlik doğrulama middleware
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    const user = socket.user;
    console.log(`🔌 Bağlandı: ${user.username} (${socket.id})`);

    // Kullanıcıyı online olarak işaretle
    userSocketMap.set(user._id.toString(), socket.id);

    try {
      await User.findByIdAndUpdate(user._id, { isOnline: true, lastSeen: new Date() });
    } catch (err) {
      console.error('Online güncelleme hatası:', err);
    }

    // ─── KANAL OLAYlARI ──────────────────────────────────────────────

    /**
     * Kanala katıl
     */
    socket.on('join_channel', async ({ channel }) => {
      if (!CHANNELS.includes(channel)) return;

      // Mevcut kanaldan ayrıl
      CHANNELS.forEach((ch) => {
        if (socket.rooms.has(`channel:${ch}`)) {
          socket.leave(`channel:${ch}`);
          const chUsers = channelUsers.get(ch);
          if (chUsers) {
            chUsers.delete(socket.id);
            broadcastOnlineUsers(io, ch);
          }
        }
      });

      // Yeni kanala katıl
      socket.join(`channel:${channel}`);

      if (!channelUsers.has(channel)) channelUsers.set(channel, new Map());

      channelUsers.get(channel).set(socket.id, {
        userId: user._id.toString(),
        username: user.username,
        avatar: user.avatar,
        statusMessage: user.statusMessage,
      });

      broadcastOnlineUsers(io, channel);
      socket.currentChannel = channel;

      console.log(`📺 ${user.username} → ${channel}`);
    });

    /**
     * Kanal mesajı gönder
     */
    socket.on('send_message', async ({ channel, content }) => {
      if (!CHANNELS.includes(channel) || !content?.trim()) return;

      try {
        const message = await Message.create({
          sender: user._id,
          channel,
          content: content.trim().slice(0, 2000),
          type: 'text',
          isPrivate: false,
        });

        const populated = await message.populate('sender', 'username avatar');

        io.to(`channel:${channel}`).emit('receive_message', {
          message: populated,
          channel,
        });
      } catch (err) {
        console.error('Mesaj kayıt hatası:', err);
        socket.emit('error', { message: 'Mesaj gönderilemedi' });
      }
    });

    /**
     * Yazıyor göstergesi
     */
    socket.on('typing', ({ channel, isTyping }) => {
      if (!CHANNELS.includes(channel)) return;
      socket.to(`channel:${channel}`).emit('typing_display', {
        username: user.username,
        userId: user._id.toString(),
        isTyping,
        channel,
      });
    });

    // ─── ÖZEL SOHBET OLAYlARI ────────────────────────────────────────

    /**
     * Özel sohbet odasına katıl
     */
    socket.on('join_private', ({ targetUserId }) => {
      const roomId = generateRoomId(user._id, targetUserId);
      socket.join(roomId);
      console.log(`💬 Özel oda: ${user.username} → ${roomId}`);
    });

    /**
     * Özel sohbet odasından ayrıl
     */
    socket.on('leave_private', ({ targetUserId }) => {
      const roomId = generateRoomId(user._id, targetUserId);
      socket.leave(roomId);
    });

    /**
     * Özel mesaj gönder
     */
    socket.on('send_private_message', async ({ targetUserId, content }) => {
      if (!targetUserId || !content?.trim()) return;

      try {
        const roomId = generateRoomId(user._id, targetUserId);

        const message = await Message.create({
          sender: user._id,
          receiver: targetUserId,
          content: content.trim().slice(0, 2000),
          type: 'text',
          isPrivate: true,
          roomId,
        });

        const populated = await message.populate('sender', 'username avatar');

        // Her iki kullanıcıya da gönder
        io.to(roomId).emit('receive_private_message', {
          message: populated,
          roomId,
        });

        // Hedef kullanıcı odada değilse bildirim gönder
        const targetSocketId = userSocketMap.get(targetUserId.toString());
        if (targetSocketId) {
          io.to(targetSocketId).emit('private_notification', {
            from: { userId: user._id, username: user.username, avatar: user.avatar },
            content: content.slice(0, 50),
            roomId,
          });
        }
      } catch (err) {
        console.error('Özel mesaj hatası:', err);
        socket.emit('error', { message: 'Özel mesaj gönderilemedi' });
      }
    });

    /**
     * Özel sohbet yazıyor göstergesi
     */
    socket.on('private_typing', ({ targetUserId, isTyping }) => {
      const roomId = generateRoomId(user._id, targetUserId);
      socket.to(roomId).emit('private_typing_display', {
        username: user.username,
        isTyping,
      });
    });

    // ─── BAĞLANTI KESİLDİ ───────────────────────────────────────────

    socket.on('disconnect', async () => {
      console.log(`❌ Ayrıldı: ${user.username}`);

      userSocketMap.delete(user._id.toString());

      // Tüm kanallardan kaldır
      CHANNELS.forEach((ch) => {
        const chUsers = channelUsers.get(ch);
        if (chUsers && chUsers.has(socket.id)) {
          chUsers.delete(socket.id);
          broadcastOnlineUsers(io, ch);
        }
      });

      try {
        await User.findByIdAndUpdate(user._id, {
          isOnline: false,
          lastSeen: new Date(),
        });
      } catch (err) {
        console.error('Offline güncelleme hatası:', err);
      }
    });
  });
};

module.exports = initSocket;
