const pool = require('../config/database');

/**
 * Start a new trip
 * POST /api/trips/start
 */
exports.startTrip = async (req, res) => {
  try {
    const {
      driver_id,
      bus_id,
      route_id,
      route_number,
      start_time,
      stops,
      total_seats
    } = req.body;

    if (!driver_id || !bus_id || !route_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: driver_id, bus_id, route_id'
      });
    }

    // Check if driver has active trip
    const activeTrip = await pool.query(
      `SELECT trip_id FROM trips
       WHERE driver_id = $1 AND status = 'active'`,
      [driver_id]
    );

    if (activeTrip.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Driver already has an active trip'
      });
    }

    // Update bus total seats if provided
    if (total_seats) {
      await pool.query(
        `UPDATE buses SET total_seats = $1 WHERE bus_id = $2`,
        [parseInt(total_seats), bus_id]
      );
    }

    // Insert trip
    const tripResult = await pool.query(
      `INSERT INTO trips (
        driver_id, bus_id, route_id, route_number,
        start_time, status
      ) VALUES ($1, $2, $3, $4, $5, 'active')
      RETURNING *`,
      [driver_id, bus_id, route_id, route_number, start_time || new Date()]
    );

    const trip = tripResult.rows[0];

    // Insert trip stops
    if (stops && stops.length > 0) {
      for (const stop of stops) {
        await pool.query(
          `INSERT INTO trip_stops (
            trip_id, stop_id, sequence, is_completed
          ) VALUES ($1, $2, $3, false)`,
          [trip.trip_id, stop.stop_id, stop.sequence]
        );
      }
    }

    // Get complete trip data with stops
    const completeTrip = await pool.query(
      `SELECT
        t.*,
        json_agg(
          json_build_object(
            'stop_id', s.stop_id,
            'stop_name', s.stop_name,
            'latitude', s.latitude,
            'longitude', s.longitude,
            'sequence', ts.sequence,
            'is_completed', ts.is_completed
          ) ORDER BY ts.sequence
        ) FILTER (WHERE s.stop_id IS NOT NULL) as stops
       FROM trips t
       LEFT JOIN trip_stops ts ON t.trip_id = ts.trip_id
       LEFT JOIN stops s ON ts.stop_id = s.stop_id
       WHERE t.trip_id = $1
       GROUP BY t.trip_id`,
      [trip.trip_id]
    );

    console.log(`✅ Trip started: Trip #${trip.trip_id} by Driver #${driver_id}`);

    res.status(201).json({
      success: true,
      data: completeTrip.rows[0]
    });
  } catch (error) {
    console.error('❌ Start trip error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get active trip for driver
 * GET /api/trips/driver/:driver_id/active
 */
exports.getActiveTrip = async (req, res) => {
  try {
    const { driver_id } = req.params;

    const result = await pool.query(
      `SELECT
        t.*,
        json_agg(
          json_build_object(
            'stop_id', s.stop_id,
            'stop_name', s.stop_name,
            'latitude', s.latitude,
            'longitude', s.longitude,
            'sequence', ts.sequence,
            'is_completed', ts.is_completed
          ) ORDER BY ts.sequence
        ) FILTER (WHERE s.stop_id IS NOT NULL) as stops
       FROM trips t
       LEFT JOIN trip_stops ts ON t.trip_id = ts.trip_id
       LEFT JOIN stops s ON ts.stop_id = s.stop_id
       WHERE t.driver_id = $1 AND t.status = 'active'
       GROUP BY t.trip_id`,
      [driver_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active trip found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Get active trip error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get all active trips
 * GET /api/trips/active
 */
exports.getActiveTrips = async (req, res) => {
  try {
    const { route_id } = req.query;

    let query = `
      SELECT
        t.trip_id,
        t.driver_id,
        t.bus_id,
        t.route_id,
        t.route_number,
        t.start_time,
        t.status,
        t.current_latitude,
        t.current_longitude,
        t.speed_kmh,
        t.last_location_update,
        b.bus_number,
        b.total_seats as capacity,
        d.name as driver_name,
        d.phone as driver_phone,
        (
          SELECT json_agg(
            json_build_object(
              'stop_id', s.stop_id,
              'stop_name', s.stop_name,
              'latitude', s.latitude,
              'longitude', s.longitude,
              'sequence', ts.sequence,
              'is_completed', ts.is_completed
            ) ORDER BY ts.sequence
          )
          FROM trip_stops ts
          JOIN stops s ON ts.stop_id = s.stop_id
          WHERE ts.trip_id = t.trip_id
        ) as stops
      FROM trips t
      LEFT JOIN buses b ON t.bus_id = b.bus_id
      LEFT JOIN drivers d ON t.driver_id = d.driver_id
      WHERE t.status = 'active'
    `;

    const params = [];
    if (route_id) {
      query += ' AND t.route_id = $1';
      params.push(route_id);
    }

    query += ' ORDER BY t.start_time DESC';

    const result = await pool.query(query, params);

    // Calculate actual booked seats for each trip
    const tripsWithAvailability = await Promise.all(
      result.rows.map(async (trip) => {
        const seatResult = await pool.query(
          `SELECT COALESCE(SUM(number_of_passengers), 0) as booked_seats
           FROM bookings
           WHERE trip_id = $1 AND booking_status = 'CONFIRMED'`,
          [trip.trip_id]
        );

        const bookedSeats = parseInt(seatResult.rows[0].booked_seats) || 0;
        const capacity = parseInt(trip.capacity) || 45;

        return {
          ...trip,
          capacity,
          booked_seats: bookedSeats,
          seats_available: capacity - bookedSeats,
          seats_occupied: bookedSeats
        };
      })
    );

    res.json({
      success: true,
      count: tripsWithAvailability.length,
      data: tripsWithAvailability
    });
  } catch (error) {
    console.error('❌ Get active trips error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update trip location (GPS tracking)
 * PUT /api/trips/:trip_id/location
 */
/**
 * Update trip location (GPS tracking)
 * PUT /api/trips/:trip_id/location
 */
exports.updateTripLocation = async (req, res) => {
  try {
    const { trip_id } = req.params;
    const { latitude, longitude, speed } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Missing latitude or longitude'
      });
    }

    // ✅ ENSURE PROPER NUMBER CONVERSION
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const speedValue = parseFloat(speed) * 3.6 || 0; // ✅ Convert m/s to km/h

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid latitude or longitude format'
      });
    }

    console.log(`📍 Updating trip ${trip_id}: Lat=${lat}, Lng=${lon}, Speed=${speedValue.toFixed(1)} km/h`);

    const result = await pool.query(
      `UPDATE trips
       SET current_latitude = $1,
           current_longitude = $2,
           speed_kmh = $3,
           last_location_update = NOW()
       WHERE trip_id = $4 AND status = 'active'
       RETURNING *`,
      [lat, lon, speedValue, trip_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Active trip not found'
      });
    }

    const trip = result.rows[0];

 // ✅ FIXED: Broadcast via WebSocket with CORRECT room name
 const io = req.app.get('io');
 if (io) {
   const roomName = `route:${trip.route_id}`;  // ✅ Use colon, not underscore
   io.to(roomName).emit('bus:location:live', {
     trip_id: trip.trip_id,
     bus_id: trip.bus_id,
     route_id: trip.route_id,
     latitude: lat,
     longitude: lon,
     speed: speedValue,
     timestamp: new Date()
   });
   console.log(`📡 WebSocket: Broadcasting to room "${roomName}"`);  // ✅ Added log
 }


    console.log(`✅ Location updated successfully for trip ${trip_id}`);

    res.json({
      success: true,
      message: 'Location updated',
      data: {
        trip_id: trip.trip_id,
        latitude: lat,
        longitude: lon,
        speed: speedValue
      }
    });
  } catch (error) {
    console.error('❌ Update location error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Mark stop as completed
 * PUT /api/trips/:trip_id/stops/:stop_id/complete
 */
exports.markStopCompleted = async (req, res) => {
  try {
    const { trip_id, stop_id } = req.params;

    await pool.query(
      `UPDATE trip_stops
       SET is_completed = true,
           actual_arrival = NOW()
       WHERE trip_id = $1 AND stop_id = $2`,
      [trip_id, stop_id]
    );

    console.log(`✅ Stop #${stop_id} completed in Trip #${trip_id}`);

    res.json({
      success: true,
      message: 'Stop marked as completed'
    });
  } catch (error) {
    console.error('❌ Mark stop completed error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * End trip
 * PUT /api/trips/:trip_id/end
 */
exports.endTrip = async (req, res) => {
  try {
    const { trip_id } = req.params;

    await pool.query(
      `UPDATE trips
       SET end_time = NOW(),
           status = 'completed'
       WHERE trip_id = $1`,
      [trip_id]
    );

    console.log(`✅ Trip #${trip_id} ended`);

    res.json({
      success: true,
      message: 'Trip completed successfully'
    });
  } catch (error) {
    console.error('❌ End trip error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get bookings for a trip
 * GET /api/trips/:trip_id/bookings
 */
/**
 * Get bookings for a trip
 * GET /api/trips/:trip_id/bookings
 */
/**
 * Get bookings for a trip
 * GET /api/trips/:trip_id/bookings
 */
exports.getTripBookings = async (req, res) => {
  try {
    const { trip_id } = req.params;

    const result = await pool.query(
      `SELECT
        b.booking_id,
        b.booking_reference,
        b.trip_id,
        b.passenger_name,
        b.passenger_phone,
        b.pickup_stop_id,
        ps.stop_name AS pickup_stop_name,
        ps.latitude AS pickup_latitude,
        ps.longitude AS pickup_longitude,
        b.dropoff_stop_id,
        ds.stop_name AS dropoff_stop_name,
        ds.latitude AS dropoff_latitude,
        ds.longitude AS dropoff_longitude,
        b.number_of_passengers,
        b.fare_amount,
        b.booking_status,
        b.created_at as booking_time,
        b.travel_date
       FROM bookings b
       JOIN stops ps ON b.pickup_stop_id = ps.stop_id
       LEFT JOIN stops ds ON b.dropoff_stop_id = ds.stop_id
       WHERE b.trip_id = $1
       ORDER BY b.created_at DESC`,
      [trip_id]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Get trip bookings error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Calculate distance between two points using Haversine formula
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}

/**
 * Calculate ETA for bus to reach a stop
 * GET /api/trips/:trip_id/eta/:stop_id
 */
/**
 * Calculate ETA for bus to reach a stop
 * GET /api/trips/:trip_id/eta/:stop_id
 */
exports.calculateETA = async (req, res) => {
  try {
    const { trip_id, stop_id } = req.params;

    // Get current bus location
    const tripResult = await pool.query(
      `SELECT current_latitude, current_longitude, speed_kmh
       FROM trips
       WHERE trip_id = $1 AND status = 'active'`,
      [trip_id]
    );

    if (tripResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Active trip not found'
      });
    }

    const trip = tripResult.rows[0];

    if (!trip.current_latitude || !trip.current_longitude) {
      return res.status(400).json({
        success: false,
        error: 'Bus location not available yet'
      });
    }

    // Get stop location
    const stopResult = await pool.query(
      `SELECT latitude, longitude, stop_name
       FROM stops
       WHERE stop_id = $1`,
      [stop_id]
    );

    if (stopResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stop not found'
      });
    }

    const stop = stopResult.rows[0];

    // Calculate distance
    const distance = calculateDistance(
      parseFloat(trip.current_latitude),
      parseFloat(trip.current_longitude),
      parseFloat(stop.latitude),
      parseFloat(stop.longitude)
    );

    // ✅ IMPROVED ETA CALCULATION
    const currentSpeed = parseFloat(trip.speed_kmh) || 0;

    // If bus is very close (less than 100 meters), show "Arriving now"
    if (distance < 0.1) {
      return res.json({
        success: true,
        data: {
          stop_name: stop.stop_name,
          distance_km: parseFloat(distance.toFixed(2)),
          current_speed: parseFloat(currentSpeed.toFixed(1)),
          eta_minutes: 0,
          eta_text: 'Arriving now'
        }
      });
    }

    // ✅ Use realistic average speed for Sri Lankan city traffic
    let avgSpeed;
    if (currentSpeed > 10) {
      // Bus is moving - use 70% of current speed (accounts for stops/traffic)
      avgSpeed = currentSpeed * 0.7;
    } else {
      // Bus is stationary or very slow - use 25 km/h average
      avgSpeed = 25;
    }

    // Calculate ETA in minutes
    const etaMinutes = Math.ceil((distance / avgSpeed) * 60);

    res.json({
      success: true,
      data: {
        stop_name: stop.stop_name,
        distance_km: parseFloat(distance.toFixed(2)),
        current_speed: parseFloat(currentSpeed.toFixed(1)),
        eta_minutes: etaMinutes,
        eta_text: etaMinutes < 1 ? 'Arriving now' : `${etaMinutes} min${etaMinutes > 1 ? 's' : ''}`
      }
    });
  } catch (error) {
    console.error('❌ Calculate ETA error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get available seats for a trip
 * GET /api/trips/:trip_id/seats
 */
exports.getAvailableSeats = async (req, res) => {
  try {
    const { trip_id } = req.params;

    const result = await pool.query(
      `SELECT
        b.total_seats,
        COALESCE(
          (SELECT SUM(number_of_passengers)
           FROM bookings
           WHERE trip_id = $1
           AND booking_status = 'CONFIRMED'), 0
        ) as booked_seats
       FROM trips t
       JOIN buses b ON t.bus_id = b.bus_id
       WHERE t.trip_id = $1`,
      [trip_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    const trip = result.rows[0];
    const totalSeats = parseInt(trip.total_seats) || 45;
    const bookedSeats = parseInt(trip.booked_seats) || 0;
    const availableSeats = totalSeats - bookedSeats;

    res.json({
      success: true,
      data: {
        total_seats: totalSeats,
        booked_seats: bookedSeats,
        available_seats: availableSeats,
        is_full: availableSeats <= 0
      }
    });
  } catch (error) {
    console.error('❌ Get available seats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
