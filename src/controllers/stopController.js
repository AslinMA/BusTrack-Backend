const pool = require('../config/database');

/**
 * Create new stop
 * POST /api/stops
 */

 /**
  * Sync all stops for one route in a single transaction
  * PUT /api/stops/route/:route_id/sync
  */
 exports.syncRouteStops = async (req, res) => {
   const client = await pool.connect();

   try {
     const routeId = parseInt(req.params.route_id, 10);
     const { stops } = req.body;

     if (!routeId || Number.isNaN(routeId)) {
       return res.status(400).json({
         success: false,
         error: 'Invalid route_id',
       });
     }

     if (!Array.isArray(stops)) {
       return res.status(400).json({
         success: false,
         error: 'stops must be an array',
       });
     }

     if (stops.length == 0) {
       return res.status(400).json({
         success: false,
         error: 'At least one stop is required',
       });
     }

     await client.query('BEGIN');

     const normalizedStops = stops.map((stop, index) => ({
       stop_id: Number(stop.stop_id ?? stop.stopId ?? 0),
       stop_name: String(stop.stop_name ?? stop.stopName ?? '').trim(),
       latitude: stop.latitude ?? 0.0,
       longitude: stop.longitude ?? 0.0,
       sequence: index + 1,
     }));

     for (const stop of normalizedStops) {
       if (!stop.stop_name) {
         throw new Error('Stop name cannot be empty');
       }
     }

     const existingResult = await client.query(
       `SELECT stop_id
        FROM stops
        WHERE route_id = $1
        ORDER BY sequence ASC, stop_id ASC`,
       [routeId]
     );

     const existingIds = existingResult.rows.map((row) => row.stop_id);
     const incomingExistingIds = normalizedStops
       .filter((stop) => stop.stop_id > 0)
       .map((stop) => stop.stop_id);

     const removedIds = existingIds.filter((id) => !incomingExistingIds.includes(id));

     if (removedIds.length > 0) {
       const usageCheck = await client.query(
         `SELECT DISTINCT stop_id
          FROM trip_stops
          WHERE stop_id = ANY($1::int[])`,
         [removedIds]
       );

       if (usageCheck.rows.length > 0) {
         throw new Error('Cannot delete stop(s) that are already used in trips');
       }

       await client.query(
         `DELETE FROM stops
          WHERE route_id = $1
            AND stop_id = ANY($2::int[])`,
         [routeId, removedIds]
       );
     }

     const syncedStops = [];

     for (const stop of normalizedStops) {
       if (stop.stop_id > 0) {
         const updateResult = await client.query(
           `UPDATE stops
            SET stop_name = $1,
                latitude = $2,
                longitude = $3,
                sequence = $4,
                updated_at = NOW()
            WHERE stop_id = $5
              AND route_id = $6
            RETURNING *`,
           [
             stop.stop_name,
             stop.latitude ?? 0.0,
             stop.longitude ?? 0.0,
             stop.sequence,
             stop.stop_id,
             routeId,
           ]
         );

         if (updateResult.rows.length === 0) {
           throw new Error(`Stop ${stop.stop_id} not found for this route`);
         }

         syncedStops.push(updateResult.rows[0]);
       } else {
         const insertResult = await client.query(
           `INSERT INTO stops (
              stop_name,
              latitude,
              longitude,
              route_id,
              sequence
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
           [
             stop.stop_name,
             stop.latitude ?? 0.0,
             stop.longitude ?? 0.0,
             routeId,
             stop.sequence,
           ]
         );

         syncedStops.push(insertResult.rows[0]);
       }
     }

     syncedStops.sort((a, b) => a.sequence - b.sequence);

     await client.query('COMMIT');

     console.log(`✅ Synced ${syncedStops.length} stops for route ${routeId}`);

     return res.json({
       success: true,
       message: 'Route stops synced successfully',
       count: syncedStops.length,
       data: syncedStops,
     });
   } catch (error) {
     await client.query('ROLLBACK');
     console.error('❌ Sync route stops error:', error);

     return res.status(500).json({
       success: false,
       error: error.message,
     });
   } finally {
     client.release();
   }
 };

exports.createStop = async (req, res) => {
  try {
    const { stop_name, latitude, longitude, route_id, sequence } = req.body;

    // Validate required fields
    if (!stop_name || !route_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: stop_name, route_id'
      });
    }

    // Check if stop already exists for this route
    const existingStop = await pool.query(
      `SELECT stop_id, stop_name, route_id, sequence, latitude, longitude
       FROM stops
       WHERE LOWER(stop_name) = LOWER($1)
       AND route_id = $2`,
      [stop_name, route_id]
    );

    if (existingStop.rows.length > 0) {
      // Stop already exists, return existing stop
      console.log(`ℹ️  Stop "${stop_name}" already exists with ID: ${existingStop.rows[0].stop_id}`);
      return res.status(200).json({
        success: true,
        message: 'Stop already exists',
        data: existingStop.rows[0]
      });
    }

    // If sequence not provided or is 0, calculate next sequence
    let stopSequence = sequence;
    if (!stopSequence || stopSequence === 0) {
      const maxSeq = await pool.query(
        'SELECT COALESCE(MAX(sequence), 0) as max_seq FROM stops WHERE route_id = $1',
        [route_id]
      );
      stopSequence = parseInt(maxSeq.rows[0].max_seq) + 1;
    }

    // Insert new stop
    const result = await pool.query(
      `INSERT INTO stops (stop_name, latitude, longitude, route_id, sequence)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [stop_name, latitude || 0.0, longitude || 0.0, route_id, stopSequence]
    );

    console.log(`✅ Created new stop: ${stop_name} (ID: ${result.rows[0].stop_id}, Sequence: ${stopSequence})`);

    res.status(201).json({
      success: true,
      message: 'Stop created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Create stop error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get all stops
 * GET /api/stops
 * Query params: route_id (optional)
 */
exports.getAllStops = async (req, res) => {
  try {
    const { route_id } = req.query;

    let query = 'SELECT * FROM stops';
    let params = [];

    if (route_id) {
      query += ' WHERE route_id = $1';
      params.push(route_id);
    }

    // Order by sequence first, then by stop_id
    query += ' ORDER BY sequence ASC, stop_id ASC';

    const result = await pool.query(query, params);

    console.log(`✅ Retrieved ${result.rows.length} stops${route_id ? ` for route_id=${route_id}` : ''}`);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Get stops error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get single stop by ID
 * GET /api/stops/:stop_id
 */
exports.getStopById = async (req, res) => {
  try {
    const { stop_id } = req.params;

    const result = await pool.query(
      'SELECT * FROM stops WHERE stop_id = $1',
      [stop_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stop not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Get stop error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update stop
 * PUT /api/stops/:stop_id
 */
exports.updateStop = async (req, res) => {
  try {
    const { stop_id } = req.params;
    const { stop_name, latitude, longitude, sequence } = req.body;

    const result = await pool.query(
      `UPDATE stops
       SET stop_name = COALESCE($1, stop_name),
           latitude = COALESCE($2, latitude),
           longitude = COALESCE($3, longitude),
           sequence = COALESCE($4, sequence)
       WHERE stop_id = $5
       RETURNING *`,
      [stop_name, latitude, longitude, sequence, stop_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stop not found'
      });
    }

    console.log(`✅ Updated stop: ${result.rows[0].stop_name} (ID: ${stop_id})`);

    res.json({
      success: true,
      message: 'Stop updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Update stop error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update multiple stops sequences
 * PUT /api/stops/reorder
 */
exports.reorderStops = async (req, res) => {
  try {
    const { stops } = req.body; // Array of {stop_id, sequence}

    if (!Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stops array'
      });
    }

    // Update each stop's sequence
    const updatePromises = stops.map(stop =>
      pool.query(
        'UPDATE stops SET sequence = $1 WHERE stop_id = $2',
        [stop.sequence, stop.stop_id]
      )
    );

    await Promise.all(updatePromises);

    console.log(`✅ Reordered ${stops.length} stops`);

    res.json({
      success: true,
      message: 'Stops reordered successfully',
      count: stops.length
    });
  } catch (error) {
    console.error('❌ Reorder stops error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Delete stop
 * DELETE /api/stops/:stop_id
 */
exports.deleteStop = async (req, res) => {
  try {
    const { stop_id } = req.params;

    // Check if stop is used in any trip_stops
    const usageCheck = await pool.query(
      'SELECT COUNT(*) FROM trip_stops WHERE stop_id = $1',
      [stop_id]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete stop that is used in trips'
      });
    }

    const result = await pool.query(
      'DELETE FROM stops WHERE stop_id = $1 RETURNING *',
      [stop_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stop not found'
      });
    }

    console.log(`✅ Deleted stop: ${result.rows[0].stop_name} (ID: ${stop_id})`);

    res.json({
      success: true,
      message: 'Stop deleted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Delete stop error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Delete all stops for a route
 * DELETE /api/stops/route/:route_id
 */
exports.deleteRouteStops = async (req, res) => {
  try {
    const { route_id } = req.params;

    // Check if any stops are used in trips
    const usageCheck = await pool.query(
      `SELECT COUNT(*) FROM trip_stops ts
       JOIN stops s ON ts.stop_id = s.stop_id
       WHERE s.route_id = $1`,
      [route_id]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete stops that are used in trips'
      });
    }

    const result = await pool.query(
      'DELETE FROM stops WHERE route_id = $1 RETURNING *',
      [route_id]
    );

    console.log(`✅ Deleted ${result.rows.length} stops for route ${route_id}`);

    res.json({
      success: true,
      message: 'Route stops deleted successfully',
      count: result.rows.length
    });
  } catch (error) {
    console.error('❌ Delete route stops error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get stops count by route
 * GET /api/stops/stats/count
 */
exports.getStopsStats = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.route_id, r.route_number, r.route_name,
              COUNT(s.stop_id) as stop_count
       FROM routes r
       LEFT JOIN stops s ON r.route_id = s.route_id
       GROUP BY r.route_id, r.route_number, r.route_name
       ORDER BY r.route_number`
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Get stops stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
