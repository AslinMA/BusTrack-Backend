const pool = require('../config/database');

// POST /api/passengers (create/update)
exports.upsertPassenger = async (req, res) => {
  try {
    const { phone, name } = req.body;

    if (!phone || !name) {
      return res.status(400).json({ success: false, error: 'phone and name are required' });
    }

    await pool.query(
      `
      INSERT INTO passengers (phone, name)
      VALUES ($1, $2)
      ON CONFLICT (phone)
      DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP
      `,
      [phone, name]
    );

    const result = await pool.query(
      'SELECT * FROM passengers WHERE phone = $1',
      [phone]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ upsertPassenger error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/passengers/:phone
exports.getPassengerByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const result = await pool.query(
      'SELECT * FROM passengers WHERE phone = $1',
      [phone]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    console.error('❌ getPassengerByPhone error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};