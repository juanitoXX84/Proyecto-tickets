const express = require('express');
const rateLimit = require('express-rate-limit');
const organizerController = require('../controllers/organizerController');
const { uploadEventImage: parseEventImageUpload } = require('../middleware/uploadEventImage');
const { authenticate, requireAuth, requireRole } = require('../middleware/auth');
const { requireProfileComplete } = require('../middleware/requireProfileComplete');

const router = express.Router();

const uploadImageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas subidas de imagen. Espera unos minutos e inténtalo de nuevo.' },
});

router.use(authenticate, requireAuth, requireProfileComplete, requireRole('organizador', 'admin'));

router.get('/notifications', organizerController.notifications);
router.get('/recintos', organizerController.listRecintos);
router.get('/events', organizerController.listMine);
router.get('/events/:id/stats', organizerController.stats);
router.post(
  '/events/upload-image',
  uploadImageLimiter,
  parseEventImageUpload,
  organizerController.uploadEventImage
);
router.get('/events/:id', organizerController.getMineById);
router.post('/events', organizerController.create);
router.put('/events/:id', organizerController.update);
router.delete('/events/:id', organizerController.remove);

module.exports = router;
