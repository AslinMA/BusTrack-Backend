const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');

// Create new booking
router.post('/', bookingController.createBooking);

// Get user's bookings by phone
router.get('/user/:phone', bookingController.getUserBookings);

// ✅ IMPORTANT: More specific routes MUST come BEFORE generic routes

// Get today's summary for driver dashboard
router.get('/driver/:driverId/today-summary', bookingController.getDriverTodaySummary);

// Get booking history for a bus (MUST be before /bus/:bus_id)
router.get('/bus/:busId/history', bookingController.getBookingsByBusHistory);

// Get bookings for a bus on specific date (for driver app)
router.get('/bus/:bus_id', bookingController.getBusByBusId);

// Get available seats for a bus
router.get('/seats/:bus_id', bookingController.getAvailableSeats);

// Get booking by ID or reference
router.get('/:booking_id', bookingController.getBookingById);

// Cancel booking
router.put('/:booking_id/cancel', bookingController.cancelBooking);

// Mark payment collected (for driver app)
router.put('/:booking_id/payment', bookingController.updatePaymentStatus);

// Update passenger's current location (for tracking)
router.put('/:booking_id/location', bookingController.updatePassengerLocation);


module.exports = router;
