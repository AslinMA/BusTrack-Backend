const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');

// Create new booking
router.post('/', bookingController.createBooking);

// Get user's bookings by phone
router.get('/user/:phone', bookingController.getUserBookings);

// Get booking by ID or reference
router.get('/:booking_id', bookingController.getBookingById);

// Cancel booking
router.put('/:booking_id/cancel', bookingController.cancelBooking);

// Get available seats for a bus
router.get('/seats/:bus_id', bookingController.getAvailableSeats);

// 🆕 NEW: Get bookings for a bus on specific date (for driver app)
router.get('/bus/:bus_id', bookingController.getBusByBusId);

// 🆕 NEW: Mark payment collected (for driver app)
router.put('/:booking_id/payment', bookingController.updatePaymentStatus);

// Get booking history for a bus (for driver trip history)
router.get('/bus/:busId/history', bookingController.getBookingsByBusHistory);

// Get today's summary for driver dashboard
router.get('/driver/:driverId/today-summary', bookingController.getDriverTodaySummary);


module.exports = router;
