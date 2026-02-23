const express = require('express');
const router = express.Router();
const passengerController = require('../controllers/passengerController');

router.post('/', passengerController.upsertPassenger);
router.get('/:phone', passengerController.getPassengerByPhone);

module.exports = router;