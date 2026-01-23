const express = require('express');
const router = express.Router();
const busController = require('../controllers/busController');

router.get('/', busController.getAllBuses);
router.get('/nearby', busController.getNearbyBuses);
router.get('/route/:routeId', busController.getBusesByRoute);
router.get('/:busId', busController.getBusById);

// ADD THIS NEW ROUTE (before /:busId/location to avoid conflicts)
router.get('/:busId/capacity', busController.getBusCapacity);

router.post('/:busId/location', busController.updateBusLocation);
router.post('/:busId/tracking/start', busController.startTracking);
router.post('/:busId/tracking/stop', busController.stopTracking);
router.get('/:busId/history', busController.getLocationHistory);

module.exports = router;
