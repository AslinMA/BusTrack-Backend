const BusSimulator = require('../simulator/busSimulator');

module.exports = (io) => {
  const simulator = new BusSimulator(io);

  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    // Passenger subscribes to route updates
    socket.on('route:subscribe', (data) => {
      const { route_id } = data;
      socket.join(`route:${route_id}`);
      console.log(`📍 Client ${socket.id} subscribed to route ${route_id}`);
    });

    // Passenger subscribes to specific bus
    socket.on('bus:subscribe', (data) => {
      const { bus_id } = data;
      socket.join(`bus:${bus_id}`);
      console.log(`🚌 Client ${socket.id} subscribed to bus ${bus_id}`);
    });

    // Driver subscribes to their bookings
    socket.on('driver:subscribe', (data) => {
      const { driver_id } = data;
      socket.join(`driver:${driver_id}`);
      console.log(`👨‍✈️ Driver ${driver_id} subscribed (socket: ${socket.id})`);
    });

    // Passenger shares their location with driver
    socket.on('passenger:location', (data) => {
      const { booking_id, latitude, longitude, user_id } = data;
      
      // Broadcast to driver
      io.emit('passenger:location:update', {
        booking_id,
        user_id,
        latitude,
        longitude,
        timestamp: new Date().toISOString()
      });

      console.log(`📍 Passenger location updated: Booking ${booking_id}`);
    });

    // Driver sends live location
    socket.on('driver:location', (data) => {
      const { driver_id, bus_id, latitude, longitude, speed, heading } = data;
      
      // Broadcast to all passengers tracking this bus
      io.to(`bus:${bus_id}`).emit('driver:location:update', {
        driver_id,
        bus_id,
        latitude,
        longitude,
        speed,
        heading,
        timestamp: new Date().toISOString()
      });

      console.log(`🚌 Driver location updated: Bus ${bus_id}`);
    });

    // Admin control: Start simulation (keep this for manual control)
    socket.on('simulation:start', () => {
      console.log('🚀 Starting bus simulation...');
      simulator.startSimulation();
      socket.emit('simulation:status', simulator.getStatus());
    });

    // Admin control: Stop simulation
    socket.on('simulation:stop', () => {
      console.log('🛑 Stopping bus simulation...');
      simulator.stopSimulation();
      socket.emit('simulation:status', simulator.getStatus());
    });

    // Get simulation status
    socket.on('simulation:status', () => {
      socket.emit('simulation:status', simulator.getStatus());
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
    });
  });

  // ✅ SIMULATOR DISABLED - Using real GPS only
  // Auto-start simulation when server starts (DISABLED FOR PRODUCTION)
  // setTimeout(() => {
  //   console.log('🎬 Auto-starting bus simulation in 5 seconds...');
  //   simulator.startSimulation();
  // }, 5000);

  console.log('⏸️  Bus simulator initialized but NOT auto-started');
  console.log('💡 Tip: Simulator can still be started manually via WebSocket events');

  return simulator;
};
