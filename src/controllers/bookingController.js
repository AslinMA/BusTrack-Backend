const pool = require('../config/database');

/**
 * Generate unique booking reference
 */
function generateBookingReference() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK${timestamp}${random}`;
}

/**
 * Create a new booking
 * POST /api/bookings
 */
exports.createBooking = async (req, res) => {
  try {
    const {
      passenger_name,
      passenger_phone,
      route_id,
      bus_id,
      trip_id,
      pickup_stop_id,
      dropoff_stop_id,
      travel_date,
      number_of_passengers
    } = req.body;

    console.log('📥 Booking request:', req.body);

    // Validate required fields
    if (!passenger_name || !passenger_phone || !trip_id || !pickup_stop_id || !dropoff_stop_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: passenger_name, passenger_phone, trip_id, pickup_stop_id, dropoff_stop_id'
      });
    }

    // Check if trip is still active
    const tripCheck = await pool.query(
      `SELECT t.trip_id, t.route_id, t.bus_id, t.driver_id, t.status,
              r.route_number, r.base_fare, r.fare_per_km, r.distance_km,
              b.bus_number
       FROM trips t
       LEFT JOIN routes r ON t.route_id = r.route_id
       LEFT JOIN buses b ON t.bus_id = b.bus_id
       WHERE t.trip_id = $1`,
      [trip_id]
    );

    if (tripCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Trip not found'
      });
    }

    const trip = tripCheck.rows[0];

    if (trip.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Trip is no longer active'
      });
    }

    // Get pickup and dropoff stop sequences to calculate fare
    const stopsResult = await pool.query(
      `SELECT stop_id, sequence
       FROM trip_stops
       WHERE trip_id = $1 AND (stop_id = $2 OR stop_id = $3)
       ORDER BY sequence`,
      [trip_id, pickup_stop_id, dropoff_stop_id]
    );

    if (stopsResult.rows.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pickup or dropoff stop'
      });
    }

    const pickupSequence = stopsResult.rows[0].sequence;
    const dropoffSequence = stopsResult.rows[1].sequence;

    if (pickupSequence >= dropoffSequence) {
      return res.status(400).json({
        success: false,
        error: 'Pickup stop must be before dropoff stop'
      });
    }

    // Calculate fare based on distance between stops
    const totalStops = await pool.query(
      `SELECT COUNT(*) as total FROM trip_stops WHERE trip_id = $1`,
      [trip_id]
    );

    const stopCount = parseInt(totalStops.rows[0].total);
    const stopsDifference = dropoffSequence - pickupSequence;
    const estimatedDistance = (parseFloat(trip.distance_km) * stopsDifference) / Math.max(stopCount - 1, 1);
    const farePerPassenger = parseFloat(trip.base_fare) + (parseFloat(trip.fare_per_km) * estimatedDistance);
    const totalFare = farePerPassenger * (number_of_passengers || 1);

    console.log(`💰 Calculated fare: LKR ${totalFare.toFixed(2)} for ${number_of_passengers || 1} passenger(s)`);

    // Get stop names
    const stops = await pool.query(
      `SELECT stop_id, stop_name FROM stops
       WHERE stop_id IN ($1, $2)`,
      [pickup_stop_id, dropoff_stop_id]
    );

    // Create booking with calculated fare
    const result = await pool.query(
      `INSERT INTO bookings (
        passenger_name,
        passenger_phone,
        route_id,
        bus_id,
        trip_id,
        pickup_stop_id,
        dropoff_stop_id,
        travel_date,
        number_of_passengers,
        fare_amount,
        booking_status,
        payment_status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CONFIRMED', 'PENDING', NOW())
      RETURNING *`,
      [
        passenger_name,
        passenger_phone,
        trip.route_id || route_id,
        trip.bus_id || bus_id,
        trip_id,
        pickup_stop_id,
        dropoff_stop_id,
        travel_date || new Date(),
        number_of_passengers || 1,
        totalFare.toFixed(2)
      ]
    );

    const booking = result.rows[0];

    console.log(`✅ Booking created: #${booking.booking_id} for Trip #${trip_id} - Fare: LKR ${totalFare.toFixed(2)}`);

    // Emit WebSocket event to driver
    const io = req.app.get('io');
    if (io) {
      io.to(`driver_${trip.driver_id}`).emit('booking:new', {
        booking_id: booking.booking_id,
        passenger_name: booking.passenger_name,
        pickup_stop_id: booking.pickup_stop_id,
        number_of_passengers: booking.number_of_passengers
      });
      console.log(`📡 WebSocket: Sent booking notification to driver #${trip.driver_id}`);
    }

    res.status(201).json({
      success: true,
      data: {
        ...booking,
        route_number: trip.route_number,
        bus_number: trip.bus_number
      }
    });
  } catch (error) {
    console.error('❌ Create booking error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get booking by reference or ID
 * GET /api/bookings/:booking_id
 */
exports.getBookingById = async (req, res) => {
  try {
    const { booking_id } = req.params;

    // Check if it's a booking reference (starts with BK) or numeric ID
    const isReference = isNaN(booking_id) || booking_id.toString().startsWith('BK');

    const query = isReference
      ? `SELECT b.*,
          bus.bus_number, bus.bus_type,
          r.route_name, r.origin, r.destination,
          ps.stop_name as pickup_stop_name,
          ds.stop_name as dropoff_stop_name
         FROM bookings b
         JOIN buses bus ON b.bus_id = bus.bus_id
         JOIN routes r ON b.route_id = r.route_id
         LEFT JOIN stops ps ON b.pickup_stop_id = ps.stop_id
         LEFT JOIN stops ds ON b.dropoff_stop_id = ds.stop_id
         WHERE b.booking_reference = $1`
      : `SELECT b.*,
          bus.bus_number, bus.bus_type,
          r.route_name, r.origin, r.destination,
          ps.stop_name as pickup_stop_name,
          ds.stop_name as dropoff_stop_name
         FROM bookings b
         JOIN buses bus ON b.bus_id = bus.bus_id
         JOIN routes r ON b.route_id = r.route_id
         LEFT JOIN stops ps ON b.pickup_stop_id = ps.stop_id
         LEFT JOIN stops ds ON b.dropoff_stop_id = ds.stop_id
         WHERE b.booking_id = $1`;

    const result = await pool.query(query, [booking_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error fetching booking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get booking by reference
 * GET /api/bookings/reference/:reference
 */
exports.getBookingByReference = async (req, res) => {
  try {
    const { reference } = req.params;

    const result = await pool.query(
      `SELECT b.*,
        bus.bus_number, bus.bus_type,
        r.route_name, r.origin, r.destination,
        ps.stop_name as pickup_stop_name,
        ds.stop_name as dropoff_stop_name
      FROM bookings b
      JOIN buses bus ON b.bus_id = bus.bus_id
      JOIN routes r ON b.route_id = r.route_id
      LEFT JOIN stops ps ON b.pickup_stop_id = ps.stop_id
      LEFT JOIN stops ds ON b.dropoff_stop_id = ds.stop_id
      WHERE b.booking_reference = $1`,
      [reference]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error fetching booking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get user bookings by phone
 * GET /api/bookings/user/:phone
 */
exports.getUserBookings = async (req, res) => {
  try {
    const { phone } = req.params;

    const result = await pool.query(
      `SELECT b.*,
        bus.bus_number, bus.bus_type,
        r.route_name, r.origin, r.destination,
        ps.stop_name as pickup_stop_name,
        ds.stop_name as dropoff_stop_name
      FROM bookings b
      JOIN buses bus ON b.bus_id = bus.bus_id
      JOIN routes r ON b.route_id = r.route_id
      LEFT JOIN stops ps ON b.pickup_stop_id = ps.stop_id
      LEFT JOIN stops ds ON b.dropoff_stop_id = ds.stop_id
      WHERE b.passenger_phone = $1
      ORDER BY b.created_at DESC
      LIMIT 50`,
      [phone]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching user bookings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get all bookings (admin)
 * GET /api/bookings
 */
exports.getAllBookings = async (req, res) => {
  try {
    const { status, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT b.*,
        bus.bus_number, bus.bus_type,
        r.route_name, r.origin, r.destination,
        ps.stop_name as pickup_stop_name
      FROM bookings b
      JOIN buses bus ON b.bus_id = bus.bus_id
      JOIN routes r ON b.route_id = r.route_id
      LEFT JOIN stops ps ON b.pickup_stop_id = ps.stop_id
    `;

    const params = [];

    if (status) {
      query += ' WHERE b.status = $1';
      params.push(status);
    }

    query += ' ORDER BY b.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching all bookings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Cancel booking
 * PUT /api/bookings/:booking_id/cancel
 */
exports.cancelBooking = async (req, res) => {
  try {
    const { booking_id } = req.params;

    // Check if it's reference or ID
    const isReference = isNaN(booking_id) || booking_id.toString().startsWith('BK');

    const getQuery = isReference
      ? 'SELECT * FROM bookings WHERE booking_reference = $1'
      : 'SELECT * FROM bookings WHERE booking_id = $1';

    const booking = await pool.query(getQuery, [booking_id]);

    if (booking.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    const bookingData = booking.rows[0];

    if (bookingData.status === 'cancelled' || bookingData.booking_status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        error: 'Booking already cancelled'
      });
    }

    // Update booking status
    const updateQuery = isReference
      ? `UPDATE bookings
         SET booking_status = 'CANCELLED',
             status = 'cancelled',
             updated_at = NOW()
         WHERE booking_reference = $1
         RETURNING *`
      : `UPDATE bookings
         SET booking_status = 'CANCELLED',
             status = 'cancelled',
             updated_at = NOW()
         WHERE booking_id = $1
         RETURNING *`;

    const result = await pool.query(updateQuery, [booking_id]);

    // Free up capacity
    try {
      const passengers = bookingData.number_of_passengers || 1;
      await pool.query(
        `UPDATE bus_availability
         SET current_seated = GREATEST(0, current_seated - $1),
             seats_available = seats_available + $1,
             last_updated = NOW()
         WHERE bus_id = $2`,
        [passengers, bookingData.bus_id]
      );
      console.log(`✅ Freed ${passengers} seat(s) for bus ${bookingData.bus_id}`);
    } catch (availErr) {
      console.error('⚠️ Could not update availability:', availErr.message);
    }

    console.log(`✅ Booking cancelled: ${booking_id}`);

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update booking status
 * PUT /api/bookings/:booking_id/status
 */
exports.updateBookingStatus = async (req, res) => {
  try {
    const { booking_id } = req.params;
    const { status, payment_status } = req.body;

    const isReference = isNaN(booking_id) || booking_id.toString().startsWith('BK');

    const updateQuery = isReference
      ? `UPDATE bookings
         SET status = COALESCE($1, status),
             booking_status = COALESCE($2, booking_status),
             payment_status = COALESCE($3, payment_status),
             updated_at = NOW()
         WHERE booking_reference = $4
         RETURNING *`
      : `UPDATE bookings
         SET status = COALESCE($1, status),
             booking_status = COALESCE($2, booking_status),
             payment_status = COALESCE($3, payment_status),
             updated_at = NOW()
         WHERE booking_id = $4
         RETURNING *`;

    const result = await pool.query(updateQuery, [
      status || null,
      status ? status.toUpperCase() : null,
      payment_status || null,
      booking_id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    res.json({
      success: true,
      message: 'Booking status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating booking status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get available seats for a bus
 * GET /api/bookings/seats/:bus_id
 */
exports.getAvailableSeats = async (req, res) => {
  try {
    const { bus_id } = req.params;

    const result = await pool.query(
      `SELECT ba.*, b.bus_number, b.bus_type, b.total_seats
       FROM bus_availability ba
       JOIN buses b ON ba.bus_id = b.bus_id
       WHERE ba.bus_id = $1`,
      [bus_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bus availability not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error fetching capacity:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get booking statistics
 * GET /api/bookings/stats/summary
 */
exports.getBookingStats = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_bookings,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE payment_status = 'PENDING') as pending_payment,
        COUNT(*) FILTER (WHERE payment_status = 'PAID') as paid,
        SUM(fare_amount) as total_revenue,
        SUM(number_of_passengers) as total_passengers
      FROM bookings
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    `);

    res.json({
      success: true,
      data: stats.rows[0]
    });
  } catch (error) {
    console.error('❌ Error fetching booking stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get bookings for a bus on specific date (Driver App)
 * GET /api/bookings/bus/:bus_id?date=2026-01-10
 */
/**
 * Get bookings for a bus on specific date (Driver App)
 * GET /api/bookings/bus/:bus_id?date=2026-01-10
 */
exports.getBusByBusId = async (req, res) => {
  try {
    const { bus_id } = req.params;
    const { date } = req.query;

    const travelDate = date || new Date().toISOString().split('T')[0];

    // ✅ UPDATED QUERY WITH STOP COORDINATES
    const result = await pool.query(
      `SELECT
        b.*,
        pickup_stop.stop_name as pickup_stop_name,
        pickup_stop.latitude as pickup_latitude,
        pickup_stop.longitude as pickup_longitude,
        dropoff_stop.stop_name as dropoff_stop_name,
        dropoff_stop.latitude as dropoff_latitude,
        dropoff_stop.longitude as dropoff_longitude
       FROM bookings b
       LEFT JOIN stops pickup_stop ON b.pickup_stop_id = pickup_stop.stop_id
       LEFT JOIN stops dropoff_stop ON b.dropoff_stop_id = dropoff_stop.stop_id
       WHERE b.bus_id = $1
         AND DATE(b.travel_date) = $2
         AND b.booking_status != 'CANCELLED'
       ORDER BY b.pickup_stop_id`,
      [bus_id, travelDate]
    );

    console.log(`✅ Retrieved ${result.rows.length} bookings for bus ${bus_id} on ${travelDate}`);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching bus bookings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update payment status (Driver App)
 * PUT /api/bookings/:booking_id/payment
 */
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { booking_id } = req.params;
    const { payment_status, is_payment_collected } = req.body;

    const isReference = isNaN(booking_id) || booking_id.toString().startsWith('BK');

    const updateQuery = isReference
      ? `UPDATE bookings
         SET payment_status = COALESCE($1, payment_status),
             is_payment_collected = COALESCE($2, is_payment_collected),
             updated_at = NOW()
         WHERE booking_reference = $3
         RETURNING *`
      : `UPDATE bookings
         SET payment_status = COALESCE($1, payment_status),
             is_payment_collected = COALESCE($2, is_payment_collected),
             updated_at = NOW()
         WHERE booking_id = $3
         RETURNING *`;

    const result = await pool.query(updateQuery, [
      payment_status || 'PAID',
      is_payment_collected !== undefined ? is_payment_collected : true,
      booking_id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    console.log(`✅ Payment collected for booking ${booking_id}`);

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating payment status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
