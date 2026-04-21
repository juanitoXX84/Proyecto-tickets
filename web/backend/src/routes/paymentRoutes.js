const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, requireAuth } = require('../middleware/auth');
const { requireProfileComplete } = require('../middleware/requireProfileComplete');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

const createPreferenceRules = [
  body('eventoId').isInt({ min: 1 }).withMessage('eventoId inválido'),
  body('cantidad').isInt({ min: 1, max: 20 }).withMessage('cantidad debe ser entre 1 y 20'),
  body('zonaId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('zonaId inválido'),
];

const brickCardRules = [
  body('ordenId').isInt({ min: 1 }).withMessage('ordenId inválido'),
  body('formData').isObject().withMessage('formData inválido'),
];
const demoApproveRules = [body('ordenId').isInt({ min: 1 }).withMessage('ordenId inválido')];

router.post(
  '/create-preference',
  authenticate,
  requireAuth,
  requireProfileComplete,
  createPreferenceRules,
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    return paymentController.createPreference(req, res, next);
  }
);

router.post(
  '/brick-card',
  authenticate,
  requireAuth,
  requireProfileComplete,
  brickCardRules,
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    return paymentController.submitCardBrick(req, res, next);
  }
);

router.post(
  '/demo-approve',
  authenticate,
  requireAuth,
  requireProfileComplete,
  demoApproveRules,
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    return paymentController.approveDemo(req, res, next);
  }
);

module.exports = router;
