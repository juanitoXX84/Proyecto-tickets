const express = require('express');
const ticketController = require('../controllers/ticketController');

const router = express.Router();

router.get('/by-code/:codigo', ticketController.getByCodePublic);

module.exports = router;
