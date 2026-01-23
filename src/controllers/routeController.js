const pool = require('../config/database');

/**
 * Get all routes with active bus count
 * GET /api/routes
 */
exports.getAllRoutes = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        r.route_id,
        r.route_number,
        r.route_name,
        r.origin as start_location,
        r.destination as end_location,
        r.distance_km as total_distance_km,
        r.estimated_duration_minutes as avg_duration_minutes,
        (SELECT COUNT(*)
         FROM trips t
         WHERE t.route_id = r.route_id
         AND t.status = 'active') as active_buses_count
       FROM routes r
       WHERE r.is_active = true
       ORDER BY r.route_number`
    );

    console.log(`📋 Retrieved ${result.rows.length} routes`);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Get routes error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get route by ID
 * GET /api/routes/:routeId
 */
exports.getRouteById = async (req, res) => {
  try {
    const { routeId } = req.params;

    const result = await pool.query(
      `SELECT
        route_id,
        route_number,
        route_name,
        origin as start_location,
        destination as end_location,
        distance_km as total_distance_km,
        estimated_duration_minutes as avg_duration_minutes,
        base_fare,
        fare_per_km,
        is_active,
        created_at,
        updated_at
       FROM routes
       WHERE route_id = $1`,
      [routeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Route not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Get route by ID error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get stops for a route (from active trip's trip_stops)
 * GET /api/routes/:routeId/stops
 */
exports.getRouteStops = async (req, res) => {
  try {
    const { routeId } = req.params;

    console.log(`🔍 Getting stops for route: ${routeId}`);

    // Get stops by joining trip_stops with stops table
    const result = await pool.query(
      `SELECT DISTINCT
         s.stop_id,
         s.stop_name,
         s.latitude,
         s.longitude,
         ts.sequence
       FROM trip_stops ts
       JOIN stops s ON ts.stop_id = s.stop_id
       JOIN trips t ON ts.trip_id = t.trip_id
       WHERE t.route_id = $1
       AND t.status = 'active'
       ORDER BY ts.sequence`,
      [routeId]
    );

    console.log(`✅ Found ${result.rows.length} stops for route ${routeId}`);

    if (result.rows.length === 0) {
      console.log(`⚠️ No active trips found for route ${routeId}`);
      return res.json({
        success: true,
        count: 0,
        data: [],
        message: 'No active trips on this route'
      });
    }

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });

  } catch (error) {
    console.error('❌ Get route stops error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Search routes by origin and destination
 * GET /api/routes/search?from=X&to=Y
 */
exports.searchRoutes = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: 'Both "from" and "to" parameters are required'
      });
    }

    const result = await pool.query(
      `SELECT
        r.route_id,
        r.route_number,
        r.route_name,
        r.origin as start_location,
        r.destination as end_location,
        r.distance_km as total_distance_km,
        r.estimated_duration_minutes as avg_duration_minutes,
        r.base_fare,
        r.fare_per_km,
        (SELECT COUNT(*)
         FROM trips t
         WHERE t.route_id = r.route_id
         AND t.status = 'active') as active_buses_count
       FROM routes r
       WHERE r.is_active = true
       AND (
         LOWER(r.route_name) LIKE LOWER($1)
         OR LOWER(r.origin) LIKE LOWER($1)
         OR LOWER(r.destination) LIKE LOWER($2)
       )
       ORDER BY r.route_number`,
      [`%${from}%`, `%${to}%`]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
      query: { from, to }
    });
  } catch (error) {
    console.error('❌ Search routes error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get active buses on a specific route (REAL-TIME LOCATIONS)
 * GET /api/routes/:route_id/buses
 */
exports.getBusesOnRoute = async (req, res) => {
  try {
    const { route_id } = req.params;

    console.log(`🚌 Fetching buses for route: ${route_id}`);

    const result = await pool.query(
      `SELECT
        t.trip_id,
        t.bus_id,
        t.route_id,
        t.driver_id,
        t.current_latitude as latitude,
        t.current_longitude as longitude,
        t.speed_kmh,
        t.last_location_update,
        t.status,
        b.bus_number,
        b.bus_type,
        b.total_seats as capacity,
        b.total_seats - COALESCE(
          (SELECT SUM(number_of_passengers)
           FROM bookings
           WHERE trip_id = t.trip_id
           AND booking_status = 'CONFIRMED'), 0
        ) as seats_available,
        d.name as driver_name,
        d.phone as driver_phone
       FROM trips t
       JOIN buses b ON t.bus_id = b.bus_id
       JOIN drivers d ON t.driver_id = d.driver_id
       WHERE t.route_id = $1
       AND t.status = 'active'
       ORDER BY t.start_time DESC`,
      [route_id]
    );

    console.log(`✅ Found ${result.rows.length} active buses on route ${route_id}`);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Get buses error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Create a new route
 * POST /api/routes
 */
exports.createRoute = async (req, res) => {
  try {
    const {
      route_number,
      route_name,
      origin,
      destination,
      distance_km,
      estimated_duration_minutes,
      base_fare,
      fare_per_km
    } = req.body;

    const result = await pool.query(
      `INSERT INTO routes (
        route_number, route_name, origin, destination,
        distance_km, estimated_duration_minutes,
        base_fare, fare_per_km, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      RETURNING *`,
      [
        route_number,
        route_name,
        origin,
        destination,
        distance_km,
        estimated_duration_minutes,
        base_fare,
        fare_per_km
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Create route error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
