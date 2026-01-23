 const express = require('express');
const router = express.Router();
const etaController = require('../controllers/etaController');

router.get('/calculate', etaController.calculateETAToStop);
router.get('/route', etaController.calculateETAForRoute);
router.get('/next-bus/:stopId', etaController.getNextBusForStop);

module.exports = router;

