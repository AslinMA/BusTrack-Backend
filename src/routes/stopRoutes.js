const express = require('express');
const router = express.Router();
const stopController = require('../controllers/stopController');

// Stop CRUD operations
router.post('/', stopController.createStop);
router.get('/', stopController.getAllStops);
router.get('/stats/count', stopController.getStopsStats);

// NEW: batch sync for one route
router.put('/route/:route_id/sync', stopController.syncRouteStops);

// Existing helpers
router.put('/reorder', stopController.reorderStops);
router.delete('/route/:route_id', stopController.deleteRouteStops);

router.get('/:stop_id', stopController.getStopById);
router.put('/:stop_id', stopController.updateStop);
router.delete('/:stop_id', stopController.deleteStop);

module.exports = router;