const pool = require('../config/database');

class Bus {
  static async getAll() {
    const query = `
      SELECT 
        b.*,
        br.route_number,
        br.route_name,
        (
          SELECT COUNT(*) 
          FROM bus_locations bl 
          WHERE bl.bus_id = b.bus_id 
          AND bl.timestamp > NOW() - INTERVAL '5 minutes'
        ) as recent_updates
      FROM buses b
      LEFT JOIN bus_routes br ON b.route_id = br.route_id
      WHERE b.is_active = true
      ORDER BY b.bus_id
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async getById(busId) {
    const query = `
      SELECT 
        b.*,
        br.route_number,
        br.route_name,
        bl.latitude,
        bl.longitude,
        bl.speed_kmh,
        bl.heading,
        bl.timestamp as last_update
      FROM buses b
      LEFT JOIN bus_routes br ON b.route_id = br.route_id
      LEFT JOIN LATERAL (
        SELECT latitude, longitude, speed_kmh, heading, timestamp
        FROM bus_locations
        WHERE bus_id = b.bus_id
        ORDER BY timestamp DESC
        LIMIT 1
      ) bl ON true
      WHERE b.bus_id = $1
    `;
    
    const result = await pool.query(query, [busId]);
    return result.rows[0];
  }

  static async getByRoute(routeId) {
    const query = `
      SELECT 
        b.bus_id,
        b.bus_number,
        b.driver_name,
        b.driver_phone,
        b.capacity,
        b.is_active,
        bl.latitude,
        bl.longitude,
        bl.speed_kmh,
        bl.heading,
        bl.timestamp as last_update
      FROM buses b
      LEFT JOIN LATERAL (
        SELECT latitude, longitude, speed_kmh, heading, timestamp
        FROM bus_locations
        WHERE bus_id = b.bus_id
        ORDER BY timestamp DESC
        LIMIT 1
      ) bl ON true
      WHERE b.route_id = $1 AND b.is_active = true
      ORDER BY b.bus_id
    `;
    
    const result = await pool.query(query, [routeId]);
    return result.rows;
  }

  static async getNearby(latitude, longitude, radiusMeters = 5000) {
    const query = `
      SELECT 
        b.bus_id,
        b.bus_number,
        b.route_id,
        br.route_number,
        br.route_name,
        bl.latitude,
        bl.longitude,
        bl.speed_kmh,
        bl.heading,
        bl.timestamp,
        ST_Distance(
          ST_GeomFromText('POINT(' || $2 || ' ' || $1 || ')', 4326)::geography,
          bl.location::geography
        ) as distance_meters
      FROM buses b
      INNER JOIN bus_routes br ON b.route_id = br.route_id
      INNER JOIN LATERAL (
        SELECT latitude, longitude, speed_kmh, heading, timestamp, location
        FROM bus_locations
        WHERE bus_id = b.bus_id
        ORDER BY timestamp DESC
        LIMIT 1
      ) bl ON true
      WHERE 
        b.is_active = true
        AND bl.timestamp > NOW() - INTERVAL '10 minutes'
        AND ST_DWithin(
          ST_GeomFromText('POINT(' || $2 || ' ' || $1 || ')', 4326)::geography,
          bl.location::geography,
          $3
        )
      ORDER BY distance_meters
    `;
    
    const result = await pool.query(query, [latitude, longitude, radiusMeters]);
    return result.rows;
  }

  static async updateLocation(busId, latitude, longitude, speed = 0, heading = 0, accuracy = 10) {
    const query = `
      INSERT INTO bus_locations (bus_id, location, latitude, longitude, speed_kmh, heading)
      VALUES (
        $1,
        ST_GeomFromText('POINT(' || $3 || ' ' || $2 || ')', 4326),
        $2,
        $3,
        $4,
        $5
      )
      RETURNING *
    `;
    
    const result = await pool.query(query, [busId, latitude, longitude, speed, heading]);
    return result.rows[0];
  }

  static async startTracking(busId) {
    const query = `
      UPDATE buses 
      SET is_active = true 
      WHERE bus_id = $1 
      RETURNING *
    `;
    
    const result = await pool.query(query, [busId]);
    return result.rows[0];
  }

  static async stopTracking(busId) {
    const query = `
      UPDATE buses 
      SET is_active = false 
      WHERE bus_id = $1 
      RETURNING *
    `;
    
    const result = await pool.query(query, [busId]);
    return result.rows[0];
  }

  static async getLocationHistory(busId, limit = 100) {
    const query = `
      SELECT 
        latitude,
        longitude,
        speed_kmh,
        heading,
        timestamp
      FROM bus_locations
      WHERE bus_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;
    
    const result = await pool.query(query, [busId, limit]);
    return result.rows;
  }
}

module.exports = Bus;
