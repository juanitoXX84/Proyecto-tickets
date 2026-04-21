const express = require('express');
const adminController = require('../controllers/adminController');
const adminEventController = require('../controllers/adminEventController');
const adminPaymentController = require('../controllers/adminPaymentController');
const adminReviewController = require('../controllers/adminReviewController');
const { authenticate, requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, requireAuth, requireRole('admin'));

router.get('/users', adminController.listUsers);
router.patch('/users/:id', adminController.patchUser);

router.get('/events', adminEventController.listEvents);
router.get('/events/:id', adminEventController.getEventPreview);
router.patch('/events/:id/moderacion', adminEventController.moderate);
router.patch('/events/:id/destacado', adminEventController.setDestacado);
router.post('/events/:id/cancelar', adminEventController.cancelEvent);

router.get('/payments', adminPaymentController.listPagos);
router.get('/finance/summary', adminPaymentController.financeSummary);
router.post('/payments/:id/refund', adminPaymentController.refundPago);

router.get('/resenas', adminReviewController.listResenas);
router.patch('/resenas/:id', adminReviewController.patchOculto);
router.delete('/resenas/:id', adminReviewController.remove);

module.exports = router;
