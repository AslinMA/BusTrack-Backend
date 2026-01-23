const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: 'aws-1-ap-northeast-2.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.grnqvvcwqiiaipkuodfo',
  password: 'pci1jiK6IiBu5W7A',
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

module.exports = pool;

