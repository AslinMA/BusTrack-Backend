const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');

// ⚠️ IMPORTANT: Order matters! More specific routes FIRST
router.get('/search', routeController.searchRoutes);
router.get('/:routeId/stops', routeController.getRouteStops);
router.get('/:route_id/buses', routeController.getBusesOnRoute);
router.get('/:routeId', routeController.getRouteById);
router.get('/', routeController.getAllRoutes);
router.post('/', routeController.createRoute);

module.exports = router;
