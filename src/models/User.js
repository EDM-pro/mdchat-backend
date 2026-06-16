const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Kullanıcı adı zorunludur'],
      unique: true,
      trim: true,
      minlength: [3, 'Kullanıcı adı en az 3 karakter olmalıdır'],
      maxlength: [20, 'Kullanıcı adı en fazla 20 karakter olabilir'],
      match: [/^[a-zA-Z0-9_-]+$/, 'Kullanıcı adı sadece harf, rakam, _ ve - içerebilir'],
    },
    email: {
      type: String,
      required: [true, 'E-posta zorunludur'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Şifre zorunludur'],
      minlength: [6, 'Şifre en az 6 karakter olmalıdır'],
      select: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    otpCode: {
      type: String,
      select: false,
    },
    otpExpiry: {
      type: Date,
      select: false,
    },
    otpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    avatar: {
      type: String,
      default: null,
    },
    statusMessage: {
      type: String,
      default: '',
      maxlength: [100, 'Durum mesajı en fazla 100 karakter olabilir'],
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    // Nick Koruma
    nickProtected: {
      type: Boolean,
      default: false,
    },
    nickPassword: {
      type: String,
      select: false,
      default: null,
    },
    // Refresh token
    refreshToken: {
      type: String,
      select: false,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Şifre hashleme - kayıt öncesi
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Şifre karşılaştırma
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Nick şifre karşılaştırma
userSchema.methods.compareNickPassword = async function (candidatePassword) {
  if (!this.nickPassword) return false;
  return bcrypt.compare(candidatePassword, this.nickPassword);
};

// Hassas alanları JSON'dan çıkar
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.otpCode;
  delete obj.otpExpiry;
  delete obj.otpAttempts;
  delete obj.nickPassword;
  delete obj.refreshToken;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
