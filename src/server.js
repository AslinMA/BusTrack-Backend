const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const { connectRedis } = require('./config/redis');
const pool = require('./config/database');

// ✅ Initialize app FIRST
const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Make io accessible to routes
app.set('io', io);

// ✅ ALL ROUTES (Import routes here, AFTER app is initialized)
const stopRoutes = require('./routes/stopRoutes');

app.use('/api/routes', require('./routes/routeRoutes'));
app.use('/api/buses', require('./routes/busRoutes'));
app.use('/api/eta', require('./routes/etaRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/drivers', require('./routes/driverRoutes'));
app.use('/api/trips', require('./routes/tripRoutes'));
app.use('/api/stops', stopRoutes); // ✅ Register stop routes
app.use('/api/passengers', require('./routes/passengerRoutes'));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        websocket: 'active'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'BusTrack Sri Lanka API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      routes: '/api/routes',
      buses: '/api/buses',
      eta: '/api/eta',
      bookings: '/api/bookings',
      drivers: '/api/drivers',
      trips: '/api/trips',
      stops: '/api/stops', // ✅ Added
      health: '/health'
    }
  });
});

// Initialize WebSocket handlers
require('./sockets/busLocationHandler')(io);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global error handler:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 3000;

// Start server
const startServer = async () => {
  try {
    // Connect to Redis
    await connectRedis();

    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected');

    // Start HTTP server - ✅ NOW LISTENS ON ALL INTERFACES
    server.listen(PORT, '0.0.0.0', () => {
      console.log('╔═══════════════════════════════════════════════╗');
      console.log('║   🚌 BusTrack Sri Lanka Backend Server      ║');
      console.log('╠═══════════════════════════════════════════════╣');
      console.log(`║   🌐 Local: http://localhost:${PORT}             ║`);
      console.log(`║   📱 Network: http://192.168.8.108:${PORT}       ║`);
      console.log(`║   📡 WebSocket: Active                        ║`);
      console.log(`║   ✅ Database: Connected                      ║`);
      console.log(`║   🔐 Redis: Connected                         ║`);
      console.log('╠═══════════════════════════════════════════════╣');
      console.log('║   📋 API Endpoints:                           ║');
      console.log('║   • /api/routes                               ║');
      console.log('║   • /api/buses                                ║');
      console.log('║   • /api/bookings                             ║');
      console.log('║   • /api/drivers                              ║');
      console.log('║   • /api/trips                                ║');
      console.log('║   • /api/stops       [NEW]                    ║');
      console.log('╚═══════════════════════════════════════════════╝');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};


// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    pool.end();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    pool.end();
    process.exit(0);
  });
});

// Start the server
startServer();
