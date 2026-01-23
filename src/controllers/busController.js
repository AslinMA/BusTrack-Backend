 
const Bus = require('../models/Bus');
const { getRedisClient } = require('../config/redis');

exports.getAllBuses = async (req, res) => {
  try {
    const buses = await Bus.getAll();
    res.json({
      success: true,
      count: buses.length,
      data: buses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.getBusById = async (req, res) => {
  try {
    const { busId } = req.params;
    const bus = await Bus.getById(busId);
    
    if (!bus) {
      return res.status(404).json({
        success: false,
        error: 'Bus not found'
      });
    }
    
    res.json({
      success: true,
      data: bus
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.getBusesByRoute = async (req, res) => {
  try {
    const { routeId } = req.params;
    const buses = await Bus.getByRoute(routeId);
    
    res.json({
      success: true,
      count: buses.length,
      data: buses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.getNearbyBuses = async (req, res) => {
  try {
    const { lat, lng, radius = 5000 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Latitude (lat) and longitude (lng) are required'
      });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusMeters = parseInt(radius);
    
    const buses = await Bus.getNearby(latitude, longitude, radiusMeters);
    
    res.json({
      success: true,
      count: buses.length,
      data: buses,
      query: { latitude, longitude, radius: radiusMeters }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.updateBusLocation = async (req, res) => {
  try {
    const { busId } = req.params;
    const { latitude, longitude, speed = 0, heading = 0, accuracy = 10 } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }
    
    const location = await Bus.updateLocation(
      busId,
      parseFloat(latitude),
      parseFloat(longitude),
      parseFloat(speed),
      parseInt(heading),
      parseFloat(accuracy)
    );
    
    const redisClient = getRedisClient();
    if (redisClient) {
      try {
        const locationData = {
          bus_id: parseInt(busId),
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          speed: parseFloat(speed),
          heading: parseInt(heading),
          accuracy: parseFloat(accuracy),
          timestamp: new Date().toISOString()
        };
        
        await redisClient.setEx(
          `bus:live:${busId}`,
          300,
          JSON.stringify(locationData)
        );
      } catch (redisError) {
        console.error('Redis cache error:', redisError);
      }
    }
    
    res.json({
      success: true,
      message: 'Location updated successfully',
      data: location
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.startTracking = async (req, res) => {
  try {
    const { busId } = req.params;
    const bus = await Bus.startTracking(busId);
    
    res.json({
      success: true,
      message: 'Tracking started',
      data: bus
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.stopTracking = async (req, res) => {
  try {
    const { busId } = req.params;
    const bus = await Bus.stopTracking(busId);
    
    res.json({
      success: true,
      message: 'Tracking stopped',
      data: bus
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.getLocationHistory = async (req, res) => {
  try {
    const { busId } = req.params;
    const { limit = 100 } = req.query;
    
    const history = await Bus.getLocationHistory(busId, parseInt(limit));
    
    res.json({
      success: true,
      count: history.length,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
exports.getBusCapacity = async (req, res) => {
  try {
    const { busId } = req.params;

    // Check if bus exists
    const busResult = await pool.query(
      'SELECT * FROM buses WHERE bus_id = $1',
      [busId]
    );

    if (busResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bus not found'
      });
    }

    const bus = busResult.rows[0];

    // Try to get availability data
    let capacity;
    try {
      const availResult = await pool.query(
        'SELECT * FROM bus_availability WHERE bus_id = $1',
        [busId]
      );

      if (availResult.rows.length > 0) {
        capacity = availResult.rows[0];
      } else {
        throw new Error('No availability data');
      }
    } catch (dbError) {
      // If table doesn't exist or no data, return default
      console.log('Using default capacity for bus', busId);
      capacity = {
        bus_id: parseInt(busId),
        total_seats: bus.capacity || 60,
        seats_available: Math.floor((bus.capacity || 60) * 0.8),
        total_available: Math.floor((bus.capacity || 60) * 0.8),
        max_capacity: bus.capacity || 60,
        current_seated: Math.floor((bus.capacity || 60) * 0.2),
        current_standing: 0,
        status: 'AVAILABLE'
      };
    }

    res.json({
      success: true,
      data: capacity
    });
  } catch (error) {
    console.error('Error getting bus capacity:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};


