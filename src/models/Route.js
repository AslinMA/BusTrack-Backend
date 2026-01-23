const pool = require('../config/database');

class Route {
  static async getAll() {
    try {
      const query = `
        SELECT
          r.*,
          COUNT(DISTINCT b.bus_id) as active_buses_count
        FROM routes r
        LEFT JOIN buses b ON r.route_id = b.route_id AND b.is_active = true
        WHERE r.is_active = true
        GROUP BY r.route_id
        ORDER BY r.route_number
      `;
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching routes: ${error.message}`);
    }
  }

  static async getById(routeId) {
    try {
      const query = `
        SELECT
          r.*,
          COUNT(DISTINCT b.bus_id) as active_buses_count
        FROM routes r
        LEFT JOIN buses b ON r.route_id = b.route_id AND b.is_active = true
        WHERE r.route_id = $1 AND r.is_active = true
        GROUP BY r.route_id
      `;
      const result = await pool.query(query, [routeId]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error fetching route: ${error.message}`);
    }
  }

  static async getStops(routeId) {
    try {
      const query = `
        SELECT
          s.stop_id,
          s.stop_name,
          s.latitude,
          s.longitude,
          rs.stop_sequence,
          rs.distance_from_start_km
        FROM route_stops rs
        JOIN stops s ON rs.stop_id = s.stop_id
        WHERE rs.route_id = $1
        ORDER BY rs.stop_sequence
      `;
      const result = await pool.query(query, [routeId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching route stops: ${error.message}`);
    }
  }

  static async searchRoutes(fromLocation, toLocation) {
    try {
      const query = `
        SELECT DISTINCT
          r.*,
          COUNT(DISTINCT b.bus_id) as active_buses_count
        FROM routes r
        LEFT JOIN buses b ON r.route_id = b.route_id AND b.is_active = true
        WHERE
          r.is_active = true
          AND (
            LOWER(r.start_location) LIKE LOWER($1)
            OR LOWER(r.route_name) LIKE LOWER($1)
          )
          AND (
            LOWER(r.end_location) LIKE LOWER($2)
            OR LOWER(r.route_name) LIKE LOWER($2)
          )
        GROUP BY r.route_id
        ORDER BY r.route_number
      `;
      const result = await pool.query(query, [`%${fromLocation}%`, `%${toLocation}%`]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error searching routes: ${error.message}`);
    }
  }
}

module.exports = Route;
