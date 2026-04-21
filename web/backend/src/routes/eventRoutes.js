const express = require('express');
const eventController = require('../controllers/eventController');
const reviewController = require('../controllers/reviewController');
const { authenticate, requireAuth, requireRole } = require('../middleware/auth');
const { requireProfileComplete } = require('../middleware/requireProfileComplete');

const router = express.Router();

router.get('/', eventController.listPublic);

/** Ruta más específica antes que `/:id/resenas` para que Express no confunda segmentos. */
router.get(
  '/:id/resenas/estado',
  authenticate,
  requireAuth,
  requireProfileComplete,
  reviewController.reviewEligibility
);
/** Lista pública de reseñas: sin `authenticate` para que invitados y tokens caducados no fallen en 401 al cargar la ficha. */
router.get('/:id/resenas', reviewController.listByEvent);
router.post(
  '/:id/resenas',
  authenticate,
  requireAuth,
  requireProfileComplete,
  requireRole('usuario', 'pruebas'),
  reviewController.create
);

router.get('/:id', eventController.getById);

module.exports = router;
