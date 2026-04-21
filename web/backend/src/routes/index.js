const express = require('express');
const authRoutes = require('./authRoutes');
const eventRoutes = require('./eventRoutes');
const organizerRoutes = require('./organizerRoutes');
const paymentRoutes = require('./paymentRoutes');
const userRoutes = require('./userRoutes');
const adminRoutes = require('./adminRoutes');
const categoryRoutes = require('./categoryRoutes');
const geocodeRoutes = require('./geocodeRoutes');
const seatRoutes = require('./seatRoutes');
const ticketRoutes = require('./ticketRoutes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'ticket-rivals-api', time: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/geocode', geocodeRoutes);
router.use('/events', eventRoutes);
router.use('/seats', seatRoutes);
router.use('/tickets', ticketRoutes);
router.use('/organizer', organizerRoutes);
router.use('/payments', paymentRoutes);
router.use('/user', userRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
