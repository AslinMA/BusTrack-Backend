const pool = require('../config/database');
const { getRedisClient } = require('../config/redis');

class ETACalculator {
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  async getCurrentBusLocation(busId) {
    const redisClient = getRedisClient();
    
    if (redisClient) {
      try {
        const cached = await redisClient.get(`bus:live:${busId}`);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        console.log('Redis read error, falling back to database');
      }
    }

    const query = `
      SELECT latitude, longitude, speed_kmh as speed, heading, timestamp
      FROM bus_locations
      WHERE bus_id = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [busId]);
    
    if (result.rows.length === 0) {
      throw new Error('Bus location not found');
    }
    
    return result.rows[0];
  }

  async calculateETAToStop(busId, stopId) {
    try {
      const busLocation = await this.getCurrentBusLocation(busId);
      
      const stopQuery = 'SELECT latitude, longitude, stop_name FROM bus_stops WHERE stop_id = $1';
      const stopResult = await pool.query(stopQuery, [stopId]);
      
      if (stopResult.rows.length === 0) {
        throw new Error('Stop not found');
      }
      
      const stop = stopResult.rows[0];
      
      const distance = this.calculateDistance(
        busLocation.latitude,
        busLocation.longitude,
        stop.latitude,
        stop.longitude
      );
      
      const speed = busLocation.speed && busLocation.speed > 5 ? busLocation.speed : 30;
      
      const etaMinutes = Math.round((distance / speed) * 60);
      
      return {
        bus_id: busId,
        stop_id: stopId,
        stop_name: stop.stop_name,
        distance_km: parseFloat(distance.toFixed(2)),
        current_speed_kmh: parseFloat(speed.toFixed(1)),
        eta_minutes: etaMinutes,
        eta_text: this.formatETA(etaMinutes)
      };
    } catch (error) {
      throw new Error(`ETA calculation failed: ${error.message}`);
    }
  }

  async calculateETAForRoute(busId, routeId, userLatitude, userLongitude) {
    try {
      const busLocation = await this.getCurrentBusLocation(busId);
      
      const stopsQuery = `
        SELECT bs.*, rs.stop_sequence
        FROM route_stops rs
        JOIN bus_stops bs ON rs.stop_id = bs.stop_id
        WHERE rs.route_id = $1
        ORDER BY rs.stop_sequence
      `;
      const stopsResult = await pool.query(stopsQuery, [routeId]);
      const stops = stopsResult.rows;
      
      let nearestStop = null;
      let minDistanceToUser = Infinity;
      
      stops.forEach(stop => {
        const distanceToUser = this.calculateDistance(
          userLatitude,
          userLongitude,
          stop.latitude,
          stop.longitude
        );
        
        if (distanceToUser < minDistanceToUser) {
          minDistanceToUser = distanceToUser;
          nearestStop = stop;
        }
      });
      
      if (!nearestStop) {
        throw new Error('No stops found on route');
      }
      
      const etaToUser = await this.calculateETAToStop(busId, nearestStop.stop_id);
      
      return {
        ...etaToUser,
        nearest_stop: nearestStop.stop_name,
        distance_to_stop_km: parseFloat(minDistanceToUser.toFixed(2))
      };
    } catch (error) {
      throw new Error(`Route ETA calculation failed: ${error.message}`);
    }
  }

  formatETA(minutes) {
    if (minutes < 1) return 'Arriving now';
    if (minutes === 1) return '1 minute';
    if (minutes < 60) return `${minutes} minutes`;
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (mins === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    return `${hours}h ${mins}m`;
  }

  async getNextBusForStop(stopId) {
    try {
      const query = `
        SELECT DISTINCT
          b.bus_id,
          b.bus_number,
          b.route_id,
          br.route_number,
          br.route_name
        FROM buses b
        JOIN bus_routes br ON b.route_id = br.route_id
        JOIN route_stops rs ON b.route_id = rs.route_id
        WHERE 
          rs.stop_id = $1
          AND b.is_active = true
          AND b.is_tracking = true
      `;
      
      const result = await pool.query(query, [stopId]);
      const buses = result.rows;
      
      if (buses.length === 0) {
        return { message: 'No active buses found for this stop' };
      }
      
      const etaPromises = buses.map(bus => 
        this.calculateETAToStop(bus.bus_id, stopId)
          .catch(err => ({ bus_id: bus.bus_id, error: err.message }))
      );
      
      const etas = await Promise.all(etaPromises);
      
      const validETAs = etas
        .filter(eta => !eta.error)
        .sort((a, b) => a.eta_minutes - b.eta_minutes);
      
      return validETAs;
    } catch (error) {
      throw new Error(`Failed to get next bus: ${error.message}`);
    }
  }
}

module.exports = new ETACalculator();
