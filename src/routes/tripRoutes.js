const router = require('express').Router();
const tripController = require('../controllers/tripController');

// Trip management
router.post('/start', tripController.startTrip);
router.get('/driver/:driver_id/active', tripController.getActiveTrip);
router.get('/active', tripController.getActiveTrips);

// Trip updates
router.put('/:trip_id/location', tripController.updateTripLocation);
router.put('/:trip_id/stops/:stop_id/complete', tripController.markStopCompleted);
router.put('/:trip_id/end', tripController.endTrip);

// Trip bookings
router.get('/:trip_id/bookings', tripController.getTripBookings);
router.get('/:trip_id/eta/:stop_id', tripController.calculateETA);
router.get('/:trip_id/seats', tripController.getAvailableSeats);



module.exports = router;
