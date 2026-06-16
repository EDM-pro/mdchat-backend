require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const connectDB = require('./src/config/db');
const initSocket = require('./src/socket');

const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/user');
const messageRoutes = require('./src/routes/message');

const app = express();
const server = http.createServer(app);

// Socket.io
const rawOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL_2,
  'http://localhost:3000',
].filter(Boolean);

// Origin kontrolü - vercel.app ve railway.app'e izin ver
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (rawOrigins.includes(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true;
  if (origin.endsWith('.railway.app')) return true;
  return false;
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) callback(null, true);
      else callback(new Error('CORS engellendi: ' + origin));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) callback(null, true);
    else callback(new Error('CORS engellendi: ' + origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/message', messageRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Route bulunamadı' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Sunucu hatası', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

// Socket.io başlat
initSocket(io);

// Sunucuyu başlat
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚀 MD Chat Backend çalışıyor: http://localhost:${PORT}`);
    console.log(`📡 Socket.io aktif`);
    console.log(`🌿 Ortam: ${process.env.NODE_ENV}\n`);
  });
});
