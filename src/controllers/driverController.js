const pool = require('../config/database');

/**
 * Driver login with license number
 * POST /api/drivers/login
 */
const bcrypt = require('bcrypt');
const pool = require('../config/database');

exports.loginDriver = async (req, res) => {
  try {
    const { license_number, password } = req.body;

    if (!license_number || !password) {
      return res.status(400).json({
        success: false,
        error: 'License number and password are required',
      });
    }

    const result = await pool.query(
      `SELECT
         d.driver_id,
         d.name,
         d.license_number,
         d.phone,
         d.email,
         d.photo_url,
         d.bus_id,
         d.status,
         d.approval_status,
         d.password_hash,
         b.bus_number
       FROM drivers d
       LEFT JOIN buses b ON d.bus_id = b.bus_id
       WHERE UPPER(TRIM(d.license_number)) = UPPER(TRIM($1))
       LIMIT 1`,
      [license_number]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid license number or password',
      });
    }

    const driver = result.rows[0];

    if (driver.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Driver account is inactive',
      });
    }

    if (driver.approval_status && driver.approval_status !== 'approved') {
      return res.status(403).json({
        success: false,
        error: 'Your account is pending admin approval',
      });
    }

    if (!driver.password_hash) {
      return res.status(403).json({
        success: false,
        error: 'Password is not set for this driver account',
      });
    }

    const isMatch = await bcrypt.compare(password, driver.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid license number or password',
      });
    }

    await pool.query(
      `UPDATE drivers
       SET last_login_at = NOW()
       WHERE driver_id = $1`,
      [driver.driver_id]
    );

    delete driver.password_hash;

    console.log(`✅ Driver logged in: ${driver.name} (${driver.license_number})`);

    return res.json({
      success: true,
      data: driver,
    });
  } catch (error) {
    console.error('❌ Driver login error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
/**
 * Get driver profile
 * GET /api/drivers/:driver_id
 */
exports.getDriverProfile = async (req, res) => {
  try {
    const { driver_id } = req.params;

    const result = await pool.query(
      `SELECT
        d.*,
        b.bus_number,
        b.bus_type,
        b.capacity
       FROM drivers d
       LEFT JOIN buses b ON d.bus_id = b.bus_id
       WHERE d.driver_id = $1`,
      [driver_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Driver not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get driver today's statistics
 * GET /api/drivers/:driver_id/stats
 */
exports.getDriverStats = async (req, res) => {
  try {
    const { driver_id } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const stats = await pool.query(
      `SELECT
        COUNT(DISTINCT t.trip_id) as total_trips,
        COUNT(DISTINCT b.booking_id) as total_passengers,
        COALESCE(SUM(CASE WHEN b.is_payment_collected THEN b.fare_amount ELSE 0 END), 0) as collected_revenue,
        COALESCE(SUM(b.fare_amount), 0) as total_revenue
       FROM trips t
       LEFT JOIN bookings b ON t.bus_id = b.bus_id
         AND DATE(b.travel_date) = DATE(t.start_time)
         AND b.booking_status != 'CANCELLED'
       WHERE t.driver_id = $1
         AND DATE(t.start_time) = $2`,
      [driver_id, today]
    );

    res.json({
      success: true,
      data: stats.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update driver location
 * POST /api/drivers/:driver_id/location
 */
exports.updateDriverLocation = async (req, res) => {
  try {
    const { driver_id } = req.params;
    const { latitude, longitude } = req.body;

    await pool.query(
      `UPDATE drivers
       SET last_latitude = $1,
           last_longitude = $2,
           last_location_update = NOW()
       WHERE driver_id = $3`,
      [latitude, longitude, driver_id]
    );

    res.json({
      success: true,
      message: 'Location updated'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
