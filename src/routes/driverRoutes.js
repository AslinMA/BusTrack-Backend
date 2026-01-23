const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driverController');

// Driver authentication
router.post('/login', driverController.loginDriver);

// Driver profile
router.get('/:driver_id', driverController.getDriverProfile);

// Driver statistics
router.get('/:driver_id/stats', driverController.getDriverStats);

// Update location (alternative to WebSocket)
router.post('/:driver_id/location', driverController.updateDriverLocation);

module.exports = router;
