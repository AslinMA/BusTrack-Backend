const express = require('express');
const router = express.Router();
const pickupRequestController = require('../controllers/pickupRequestController');

// Create pickup request
router.post('/', pickupRequestController.createPickupRequest);

// Get pending pickup requests for a route
router.get('/route/:routeId', pickupRequestController.getPendingRequestsByRoute);

// List pickup requests
router.get('/', pickupRequestController.getPickupRequests);

router.get('/summary/:route_id', pickupRequestController.getPickupRequestSummaryByRoute);

// Get single pickup request
router.get('/:request_id', pickupRequestController.getPickupRequestById);



// Accept
router.put('/:request_id/accept', pickupRequestController.acceptPickupRequest);

// Cancel
router.put('/:request_id/cancel', pickupRequestController.cancelPickupRequest);

// Complete
router.put('/:request_id/complete', pickupRequestController.completePickupRequest);

module.exports = router;