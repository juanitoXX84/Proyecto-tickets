const express = require('express');
const rateLimit = require('express-rate-limit');
const geocodeController = require('../controllers/geocodeController');

const router = express.Router();

const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas búsquedas. Espera un minuto e inténtalo de nuevo.' },
});

router.get('/search', geocodeLimiter, geocodeController.search);

module.exports = router;
