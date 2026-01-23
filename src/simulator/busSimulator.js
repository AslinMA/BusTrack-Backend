const pool = require('../config/database');

class BusSimulator {
  constructor(io) {
    this.io = io;
    this.simulationIntervals = new Map();
    this.isRunning = false;
  }

  // Route coordinates (Panadura to Mathugama via Horana)
  getRouteCoordinates() {
    return [
      { lat: 6.7132, lng: 79.9033, name: 'Panadura' },
      { lat: 6.7145, lng: 79.9150, name: 'Panadura North' },
      { lat: 6.7180, lng: 79.9380, name: 'Wadduwa' },
      { lat: 6.7190, lng: 79.9680, name: 'Kalutara North' },
      { lat: 6.7153, lng: 80.0619, name: 'Horana' },
      { lat: 6.6200, lng: 80.1200, name: 'Ingiriya' },
      { lat: 6.5500, lng: 80.1400, name: 'Bulathsinhala' },
      { lat: 6.4869, lng: 80.1589, name: 'Mathugama' }
    ];
  }

  // Linear interpolation between two points
  interpolate(start, end, progress) {
    return {
      lat: start.lat + (end.lat - start.lat) * progress,
      lng: start.lng + (end.lng - start.lng) * progress
    };
  }

  // Calculate heading/direction between two points
  calculateHeading(start, end) {
    const dLng = end.lng - start.lng;
    const dLat = end.lat - start.lat;
    const angle = Math.atan2(dLng, dLat) * (180 / Math.PI);
    return (angle + 360) % 360;
  }

  // Simulate movement for a single bus
  async simulateBusMovement(busId) {
    const routeCoords = this.getRouteCoordinates();
    let currentSegment = Math.floor(Math.random() * (routeCoords.length - 1));
    let progress = Math.random();
    const speed = 30 + Math.random() * 20; // Random speed between 30-50 km/h

    const updateInterval = setInterval(async () => {
      try {
        // Move along current segment
        progress += 0.02; // Move 2% along segment each update

        if (progress >= 1.0) {
          // Move to next segment
          currentSegment = (currentSegment + 1) % (routeCoords.length - 1);
          progress = 0;
        }

        const start = routeCoords[currentSegment];
        const end = routeCoords[currentSegment + 1];
        const position = this.interpolate(start, end, progress);
        const heading = this.calculateHeading(start, end);

        // Update database - FIXED with proper type casting
        const query = `
          INSERT INTO bus_locations (bus_id, location, latitude, longitude, speed_kmh, heading)
          VALUES (
            $1, 
            ST_GeomFromText('POINT(' || $3::text || ' ' || $2::text || ')', 4326), 
            $2::numeric, 
            $3::numeric, 
            $4::numeric, 
            $5
          )
        `;
        
        await pool.query(query, [
          busId, 
          position.lat, 
          position.lng, 
          speed, 
          Math.round(heading)
        ]);

        // Broadcast via WebSocket
        this.io.emit('bus:location:live', {
          bus_id: busId,
          latitude: position.lat,
          longitude: position.lng,
          speed: speed,
          heading: Math.round(heading),
          timestamp: new Date().toISOString()
        });

        console.log(`📍 Bus ${busId} moved to ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)} | Speed: ${speed.toFixed(1)} km/h`);
      } catch (error) {
        console.error(`❌ Error simulating bus ${busId}:`, error.message);
      }
    }, 5000); // Update every 5 seconds

    this.simulationIntervals.set(busId, updateInterval);
  }

  // Start simulation for all active buses
  async startSimulation() {
    if (this.isRunning) {
      console.log('⚠️  Simulation already running');
      return;
    }

    try {
      const result = await pool.query(
        'SELECT bus_id FROM buses WHERE is_active = true'
      );

      const buses = result.rows;
      console.log(`🚀 Starting simulation for ${buses.length} buses...`);

      buses.forEach(bus => {
        this.simulateBusMovement(bus.bus_id);
      });

      this.isRunning = true;
      console.log('✅ Bus simulation started!');
    } catch (error) {
      console.error('❌ Error starting simulation:', error);
    }
  }

  // Stop simulation
  stopSimulation() {
    console.log('🛑 Stopping bus simulation...');
    
    this.simulationIntervals.forEach((interval, busId) => {
      clearInterval(interval);
      console.log(`Stopped simulation for bus ${busId}`);
    });

    this.simulationIntervals.clear();
    this.isRunning = false;
    console.log('✅ Bus simulation stopped');
  }

  // Get simulation status
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeBuses: this.simulationIntervals.size
    };
  }
}

module.exports = BusSimulator;
