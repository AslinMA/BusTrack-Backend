const pool = require('../config/database');

/**
 * Get all routes with active bus count
 * GET /api/routes
 */
 function normalizeText(value) {
   return (value || '').toString().trim().toLowerCase();
 }

 function calculateStopMatchScore(stopRow, searchText) {
   const query = normalizeText(searchText);
   if (!query) return 0;

   const stopName = normalizeText(stopRow.stop_name);
   const address = normalizeText(stopRow.address);

   let score = 0;

   if (stopName === query) score += 100;
   if (address === query) score += 80;

   if (stopName.includes(query)) score += 50;
   if (address.includes(query)) score += 30;

   for (const word of query.split(/\s+/)) {
     if (!word) continue;
     if (stopName.includes(word)) score += 10;
     if (address.includes(word)) score += 5;
   }

   return score;
 }

 async function findBestMatchingTripStop(tripId, searchText) {
   const result = await pool.query(
     `SELECT
        ts.trip_id,
        ts.stop_id,
        ts.sequence,
        s.stop_name,
        s.address
      FROM trip_stops ts
      JOIN stops s ON ts.stop_id = s.stop_id
      WHERE ts.trip_id = $1
      ORDER BY ts.sequence ASC`,
     [tripId]
   );

   let bestStop = null;
   let bestScore = 0;

   for (const row of result.rows) {
     const score = calculateStopMatchScore(row, searchText);
     if (score > bestScore) {
       bestScore = score;
       bestStop = row;
     }
   }

   return bestScore > 0 ? bestStop : null;
 }

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
    const { from, to } = req.query;

    console.log(`🚌 Fetching buses for route: ${route_id}`);
    console.log(`📍 Direction filter from="${from || ''}" to="${to || ''}"`);

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

    let buses = result.rows;

    console.log(`✅ Found ${buses.length} active buses before direction filtering`);

    // ✅ Keep old behavior if no from/to provided
    if (!from || !to) {
      return res.json({
        success: true,
        count: buses.length,
        data: buses
      });
    }

    const filteredBuses = [];

    for (const bus of buses) {
      try {
        const fromStop = await findBestMatchingTripStop(bus.trip_id, from);
        const toStop = await findBestMatchingTripStop(bus.trip_id, to);

        console.log(`🧭 Trip ${bus.trip_id} matching:`);
        console.log(`   fromStop = ${fromStop ? `${fromStop.stop_name} (#${fromStop.sequence})` : 'NOT FOUND'}`);
        console.log(`   toStop   = ${toStop ? `${toStop.stop_name} (#${toStop.sequence})` : 'NOT FOUND'}`);

        // Must match both stops
        if (!fromStop || !toStop) {
          console.log(`❌ Trip ${bus.trip_id} skipped: from/to stop not found`);
          continue;
        }

        // Same stop not allowed for direction filtering
        if (fromStop.stop_id === toStop.stop_id) {
          console.log(`❌ Trip ${bus.trip_id} skipped: same from/to stop`);
          continue;
        }

        // ✅ Correct direction only
        if (fromStop.sequence < toStop.sequence) {
          filteredBuses.push({
            ...bus,
            matched_from_stop_id: fromStop.stop_id,
            matched_from_stop_name: fromStop.stop_name,
            matched_from_sequence: fromStop.sequence,
            matched_to_stop_id: toStop.stop_id,
            matched_to_stop_name: toStop.stop_name,
            matched_to_sequence: toStop.sequence,
          });

          console.log(`✅ Trip ${bus.trip_id} kept: correct direction`);
        } else {
          console.log(`❌ Trip ${bus.trip_id} removed: wrong direction (${fromStop.sequence} -> ${toStop.sequence})`);
        }
      } catch (tripError) {
        console.error(`❌ Error filtering trip ${bus.trip_id}:`, tripError.message);
      }
    }

    console.log(`🎯 Final filtered buses count: ${filteredBuses.length}`);

    res.json({
      success: true,
      count: filteredBuses.length,
      data: filteredBuses
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
