const express = require('express');
const router = express.Router();
const stopController = require('../controllers/stopController');

// Stop CRUD operations
router.post('/', stopController.createStop);
router.get('/', stopController.getAllStops);
router.get('/stats/count', stopController.getStopsStats);
router.get('/:stop_id', stopController.getStopById);
router.put('/:stop_id', stopController.updateStop);
router.put('/reorder', stopController.reorderStops);
router.delete('/:stop_id', stopController.deleteStop);
router.delete('/route/:route_id', stopController.deleteRouteStops);

module.exports = router;
