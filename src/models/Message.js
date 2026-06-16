const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Kanal mesajı için
    channel: {
      type: String,
      enum: ['md-arkadaslik', 'md-sohbet', 'md-serbest', null],
      default: null,
    },
    // Özel mesaj için
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    content: {
      type: String,
      required: [true, 'Mesaj içeriği zorunludur'],
      maxlength: [2000, 'Mesaj en fazla 2000 karakter olabilir'],
    },
    type: {
      type: String,
      enum: ['text', 'image'],
      default: 'text',
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    // Özel mesaj oda ID'si (her iki yön için aynı)
    roomId: {
      type: String,
      default: null,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Kanal mesajları için index
messageSchema.index({ channel: 1, createdAt: -1 });
// Özel mesajlar için index
messageSchema.index({ roomId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
