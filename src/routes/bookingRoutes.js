const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');

// Create new booking
router.post('/', bookingController.createBooking);

// ✅ Driver manual booking
router.post('/driver/manual', bookingController.createDriverManualBooking);

// Get user's bookings by phone
router.get('/user/:phone', bookingController.getUserBookings);

// Get today's summary for driver dashboard
router.get('/driver/:driverId/today-summary', bookingController.getDriverTodaySummary);

// Get booking history for a bus
router.get('/bus/:busId/history', bookingController.getBookingsByBusHistory);

// Get bookings for a bus on specific date
router.get('/bus/:bus_id', bookingController.getBusByBusId);

// Get passengers for specific trip
router.get('/trip/:tripId', bookingController.getTripPassengers);

// Get available seats for a bus
router.get('/seats/:bus_id', bookingController.getAvailableSeats);

// Get booking by ID or reference
router.get('/:booking_id', bookingController.getBookingById);

// Cancel booking
router.put('/:booking_id/cancel', bookingController.cancelBooking);

// Mark payment collected
router.put('/:booking_id/payment', bookingController.updatePaymentStatus);

// Update passenger current location
router.put('/:booking_id/location', bookingController.updatePassengerLocation);

module.exports = router;