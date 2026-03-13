const express = require('express');
const router = express.Router();
const pickupRequestController = require('../controllers/pickupRequestController');

// Create pickup request
router.post('/', pickupRequestController.createPickupRequest);

// List pickup requests
router.get('/', pickupRequestController.getPickupRequests);

// Get single pickup request
router.get('/:request_id', pickupRequestController.getPickupRequestById);

// Accept
router.put('/:request_id/accept', pickupRequestController.acceptPickupRequest);

// Cancel
router.put('/:request_id/cancel', pickupRequestController.cancelPickupRequest);

// Complete
router.put('/:request_id/complete', pickupRequestController.completePickupRequest);

module.exports = router;