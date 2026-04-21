const express = require('express');
const seatController = require('../controllers/seatController');

const router = express.Router();

router.get('/event/:eventId/unified', seatController.listUnifiedByEvent);
router.get('/zona/:zonaId', seatController.listByZona);
/** Alias corto: GET /api/seats/:zonaId (misma respuesta que /zona/:zonaId). */
router.get('/:zonaId', seatController.listByZona);

module.exports = router;
