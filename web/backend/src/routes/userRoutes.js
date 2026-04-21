const express = require('express');
const { body, param } = require('express-validator');
const userController = require('../controllers/userController');
const { authenticate, requireAuth } = require('../middleware/auth');
const { requireProfileComplete } = require('../middleware/requireProfileComplete');

const router = express.Router();

const profileRules = [
  body('nombre').trim().notEmpty().isLength({ max: 120 }).withMessage('Nombre requerido'),
  body('apellido').trim().notEmpty().isLength({ max: 120 }).withMessage('Apellido requerido'),
  body('telefono').trim().notEmpty().isLength({ max: 32 }).withMessage('Teléfono requerido'),
  body('pais').trim().notEmpty().isLength({ max: 80 }).withMessage('País requerido'),
];

const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Indica tu contraseña actual'),
  body('newPassword').isLength({ min: 6, max: 128 }).withMessage('La nueva contraseña debe tener entre 6 y 128 caracteres'),
];

router.patch('/profile', authenticate, requireAuth, requireProfileComplete, profileRules, userController.updateProfile);
router.patch(
  '/password',
  authenticate,
  requireAuth,
  requireProfileComplete,
  changePasswordRules,
  userController.changePassword
);
router.get('/purchases', authenticate, requireAuth, requireProfileComplete, userController.purchases);
router.post(
  '/purchases/:ordenId/resend-tickets',
  authenticate,
  requireAuth,
  requireProfileComplete,
  [param('ordenId').isInt({ min: 1 }).withMessage('ordenId inválido')],
  userController.resendTicketsEmail
);

module.exports = router;
