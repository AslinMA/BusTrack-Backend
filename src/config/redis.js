const redis = require('redis');

let client = null;

const connectRedis = async () => {
  if (!process.env.REDIS_URL) {
    console.log('⚠️ REDIS_URL not set. Starting without Redis.');
    return null;
  }

  try {
    client = redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.log('❌ Redis connection failed after 10 retries');
            return new Error('Redis connection failed');
          }
          return retries * 100;
        }
      }
    });

    client.on('error', (err) => {
      console.error('❌ Redis Client Error:', err);
    });

    client.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    await client.connect();
    return client;
  } catch (error) {
    console.error('⚠️ Redis connection error:', error.message);
    console.log('⚠️ Continuing without Redis (using database only)');
    return null;
  }
};

const getRedisClient = () => client;

module.exports = { connectRedis, getRedisClient };