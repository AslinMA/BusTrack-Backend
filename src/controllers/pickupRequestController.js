const pool = require('../config/database');

/**
 * Create pickup request
 * POST /api/pickup-requests
 */
exports.createPickupRequest = async (req, res) => {
  try {
    const {
      route_id,
      passenger_name,
      passenger_phone,
      pickup_stop_id,
      pickup_location_text,
      latitude,
      longitude,
      destination_text,
      passenger_count,
      notes
    } = req.body;

    if (!route_id || latitude == null || longitude == null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: route_id, latitude, longitude'
      });
    }

    const parsedPassengerCount = parseInt(passenger_count) || 1;

    if (parsedPassengerCount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'passenger_count must be greater than 0'
      });
    }

    // Check route exists and active
    const routeCheck = await pool.query(
      `SELECT route_id, route_number, route_name
       FROM routes
       WHERE route_id = $1 AND is_active = true`,
      [route_id]
    );

    if (routeCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Route not found or inactive'
      });
    }

    const route = routeCheck.rows[0];

    const result = await pool.query(
      `INSERT INTO pickup_requests (
         route_id,
         passenger_name,
         passenger_phone,
         pickup_stop_id,
         pickup_location_text,
         latitude,
         longitude,
         destination_text,
         passenger_count,
         status,
         notes,
         requested_at,
         created_at,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         'PENDING',
         $10,
         NOW(),
         NOW(),
         NOW()
       )
       RETURNING *`,
      [
        route_id,
        passenger_name && passenger_name.trim() !== ''
          ? passenger_name.trim()
          : 'Passenger',
        passenger_phone && passenger_phone.trim() !== ''
          ? passenger_phone.trim()
          : null,
        pickup_stop_id || null,
        pickup_location_text || null,
        latitude,
        longitude,
        destination_text || null,
        parsedPassengerCount,
        notes || null
      ]
    );

    const request = result.rows[0];

    console.log(`✅ Pickup request created: #${request.request_id} for route ${route.route_number}`);

    res.status(201).json({
      success: true,
      message: 'Pickup request created successfully',
      data: {
        ...request,
        route_number: route.route_number,
        route_name: route.route_name
      }
    });
  } catch (error) {
    console.error('❌ Create pickup request error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get pickup requests
 * GET /api/pickup-requests
 * Optional query:
 *   route_id
 *   status
 */
exports.getPickupRequests = async (req, res) => {
  try {
    const { route_id, status } = req.query;

    let query = `
      SELECT
        pr.*,
        r.route_number,
        r.route_name,
        s.stop_name as pickup_stop_name,
        t.route_number as assigned_trip_route_number,
        d.name as assigned_driver_name
      FROM pickup_requests pr
      JOIN routes r ON pr.route_id = r.route_id
      LEFT JOIN stops s ON pr.pickup_stop_id = s.stop_id
      LEFT JOIN trips t ON pr.assigned_trip_id = t.trip_id
      LEFT JOIN drivers d ON pr.assigned_driver_id = d.driver_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (route_id) {
      query += ` AND pr.route_id = $${paramIndex++}`;
      params.push(route_id);
    }

    if (status) {
      query += ` AND pr.status = $${paramIndex++}`;
      params.push(status.toUpperCase());
    }

    query += ` ORDER BY pr.requested_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Get pickup requests error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get pickup request by id
 * GET /api/pickup-requests/:request_id
 */
exports.getPickupRequestById = async (req, res) => {
  try {
    const { request_id } = req.params;

    const result = await pool.query(
      `SELECT
         pr.*,
         r.route_number,
         r.route_name,
         s.stop_name as pickup_stop_name,
         t.route_number as assigned_trip_route_number,
         d.name as assigned_driver_name
       FROM pickup_requests pr
       JOIN routes r ON pr.route_id = r.route_id
       LEFT JOIN stops s ON pr.pickup_stop_id = s.stop_id
       LEFT JOIN trips t ON pr.assigned_trip_id = t.trip_id
       LEFT JOIN drivers d ON pr.assigned_driver_id = d.driver_id
       WHERE pr.request_id = $1`,
      [request_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pickup request not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Get pickup request by id error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Accept pickup request
 * PUT /api/pickup-requests/:request_id/accept
 */
exports.acceptPickupRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const { trip_id, driver_id } = req.body;

    if (!trip_id || !driver_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: trip_id, driver_id'
      });
    }

    // Check request exists and pending
    const requestCheck = await pool.query(
      `SELECT * FROM pickup_requests
       WHERE request_id = $1`,
      [request_id]
    );

    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pickup request not found'
      });
    }

    const request = requestCheck.rows[0];

    if (request.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: `Only PENDING requests can be accepted. Current status: ${request.status}`
      });
    }

    // Check trip
    const tripCheck = await pool.query(
      `SELECT trip_id, driver_id, route_id, status
       FROM trips
       WHERE trip_id = $1`,
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
        error: 'Trip is not active'
      });
    }

    if (parseInt(trip.driver_id) !== parseInt(driver_id)) {
      return res.status(400).json({
        success: false,
        error: 'Trip does not belong to this driver'
      });
    }

    if (parseInt(trip.route_id) !== parseInt(request.route_id)) {
      return res.status(400).json({
        success: false,
        error: 'Trip route does not match pickup request route'
      });
    }

    const result = await pool.query(
      `UPDATE pickup_requests
       SET status = 'ACCEPTED',
           assigned_trip_id = $1,
           assigned_driver_id = $2,
           accepted_at = NOW(),
           updated_at = NOW()
       WHERE request_id = $3
       RETURNING *`,
      [trip_id, driver_id, request_id]
    );

    console.log(`✅ Pickup request accepted: #${request_id} by driver #${driver_id}`);

    res.json({
      success: true,
      message: 'Pickup request accepted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Accept pickup request error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Cancel pickup request
 * PUT /api/pickup-requests/:request_id/cancel
 */

/**
 * Complete pickup request
 * PUT /api/pickup-requests/:request_id/complete
 */
exports.completePickupRequest = async (req, res) => {
  try {
    const { request_id } = req.params;

    const requestCheck = await pool.query(
      `SELECT * FROM pickup_requests WHERE request_id = $1`,
      [request_id]
    );

    if (requestCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pickup request not found'
      });
    }

    const request = requestCheck.rows[0];

    if (request.status !== 'ACCEPTED') {
      return res.status(400).json({
        success: false,
        error: `Only ACCEPTED requests can be completed. Current status: ${request.status}`
      });
    }

    const result = await pool.query(
      `UPDATE pickup_requests
       SET status = 'COMPLETED',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE request_id = $1
       RETURNING *`,
      [request_id]
    );

    res.json({
      success: true,
      message: 'Pickup request completed successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Complete pickup request error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};


exports.getPendingRequestsByRoute = async (req, res) => {
  try {
    const { routeId } = req.params;

    const result = await pool.query(
      `SELECT
         pr.*,
         r.route_number,
         r.route_name
       FROM pickup_requests pr
       JOIN routes r ON pr.route_id = r.route_id
       WHERE pr.route_id = $1
         AND pr.status = 'PENDING'
       ORDER BY pr.requested_at ASC`,
      [routeId]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Get pending pickup requests error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

exports.cancelPickupRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const result = await pool.query(
      `UPDATE pickup_requests
       SET status = 'CANCELLED',
           cancelled_at = NOW(),
           updated_at = NOW()
       WHERE request_id = $1
         AND status IN ('PENDING', 'ACCEPTED')
       RETURNING *`,
      [requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pickup request not found or already closed'
      });
    }

    res.json({
      success: true,
      message: 'Pickup request cancelled successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Cancel pickup request error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
exports.getPickupRequestSummaryByRoute = async (req, res) => {
  try {
    const { route_id } = req.params;

    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_requests,
         COALESCE(SUM(passenger_count) FILTER (WHERE status = 'PENDING'), 0) AS total_waiting_passengers
       FROM pickup_requests
       WHERE route_id = $1`,
      [route_id]
    );

    res.json({
      success: true,
      data: {
        route_id: parseInt(route_id),
        pending_requests: parseInt(result.rows[0].pending_requests) || 0,
        total_waiting_passengers: parseInt(result.rows[0].total_waiting_passengers) || 0,
      }
    });
  } catch (error) {
    console.error('❌ Get pickup request summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};