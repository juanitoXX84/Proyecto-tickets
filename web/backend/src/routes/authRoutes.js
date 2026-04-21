const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const passport = require('passport');
const authController = require('../controllers/authController');
const userModel = require('../models/userModel');
const { getEmailDeliveryStatus } = require('../services/mailService');
const { signAccessToken } = require('../utils/jwt');
const { authenticate, requireAuth } = require('../middleware/auth');

const router = express.Router();

const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes de recuperación. Espera unos minutos.' },
});

const registerRules = [
  body('nombre').trim().notEmpty().isLength({ max: 120 }).withMessage('Nombre requerido (máx. 120 caracteres)'),
  body('apellido').trim().notEmpty().isLength({ max: 120 }).withMessage('Apellido requerido'),
  body('email').trim().isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6, max: 128 }).withMessage('La contraseña debe tener entre 6 y 128 caracteres'),
];

const loginRules = [
  body('email').trim().isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').notEmpty().isLength({ max: 128 }).withMessage('Contraseña requerida'),
];

const setOauthPasswordRules = [
  body('password').isLength({ min: 6, max: 128 }).withMessage('La contraseña debe tener entre 6 y 128 caracteres'),
];

const completeProfileRules = [
  body('nombre').trim().notEmpty().isLength({ max: 120 }).withMessage('Nombre requerido'),
  body('apellido').trim().notEmpty().isLength({ max: 120 }).withMessage('Apellido requerido'),
  body('telefono').trim().notEmpty().isLength({ max: 32 }).withMessage('Teléfono requerido'),
  body('pais').trim().notEmpty().isLength({ max: 80 }).withMessage('País requerido'),
  body('password').isLength({ min: 6, max: 128 }).withMessage('La contraseña debe tener entre 6 y 128 caracteres'),
];

const forgotPasswordRules = [
  body('email').trim().isEmail().normalizeEmail().withMessage('Email inválido'),
];

const verifyResetCodeRules = [
  body('email').trim().isEmail().normalizeEmail().withMessage('Email inválido'),
  body('code')
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('El código debe ser de 6 dígitos'),
];

const resetPasswordWithCodeRules = [
  body('resetToken').trim().notEmpty().withMessage('Sesión de recuperación inválida'),
  body('newPassword')
    .isLength({ min: 6, max: 128 })
    .withMessage('La nueva contraseña debe tener entre 6 y 128 caracteres'),
];

router.post('/register', authWriteLimiter, registerRules, authController.register);
router.post('/login', authWriteLimiter, loginRules, authController.login);
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  forgotPasswordRules,
  authController.forgotPassword
);
router.post(
  '/verify-reset-code',
  authWriteLimiter,
  verifyResetCodeRules,
  authController.verifyResetCode
);
router.post(
  '/reset-password',
  authWriteLimiter,
  resetPasswordWithCodeRules,
  authController.resetPasswordWithCode
);
router.get('/me', authenticate, requireAuth, authController.me);
router.post('/logout', authController.destroySessionLogout);
router.post(
  '/set-oauth-password',
  authWriteLimiter,
  authenticate,
  requireAuth,
  setOauthPasswordRules,
  authController.setOauthPassword
);
router.post(
  '/complete-profile',
  authWriteLimiter,
  authenticate,
  requireAuth,
  completeProfileRules,
  authController.completeProfile
);

function googleEnv() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const callback = process.env.GOOGLE_CALLBACK_URL?.trim();
  return { id, secret, callback };
}

router.get('/providers', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { id, secret, callback } = googleEnv();
  const google = Boolean(id && secret && callback);
  res.json({
    ok: true,
    google,
    passwordResetEmail: getEmailDeliveryStatus(),
  });
});

router.get('/google', (req, res, next) => {
  const { id, secret } = googleEnv();
  if (!id || !secret) {
    return res.status(503).json({
      ok: false,
      error: 'Google OAuth no está configurado en el servidor',
      hint:
        'En el archivo web/.env asigna GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (credenciales de Google Cloud Console), guarda y reinicia el backend (npm run dev).',
    });
  }
  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
  })(req, res, next);
});

router.get(
  '/google/callback',
  (req, res, next) => {
    if (!googleEnv().id) {
      return res.status(503).send('Google OAuth no configurado');
    }
    return passport.authenticate('google', {
      session: true,
      failureRedirect: '/api/auth/google/failure',
    })(req, res, next);
  },
  async (req, res, next) => {
    try {
      const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
      if (!req.user?.id) {
        return res.redirect(302, `${frontend}/login?error=google`);
      }
      const full = await userModel.findById(Number(req.user.id));
      if (!full) {
        return res.redirect(302, `${frontend}/login?error=google`);
      }
      if (!userModel.isAccountActive(full)) {
        return res.redirect(302, `${frontend}/login?error=suspended`);
      }
      try {
        await userModel.recordSuccessfulLogin(full.id, 'google');
      } catch {
        /* columnas de sesión pendientes de migración */
      }
      const token = signAccessToken(authController.buildTokenPayload(full));
      const needsProfile = authController.needsProfileFlag(full);
      const fragment = new URLSearchParams({
        token,
        needsProfile: needsProfile ? '1' : '0',
      }).toString();
      return res.redirect(302, `${frontend}/auth/callback#${fragment}`);
    } catch (err) {
      return next(err);
    }
  }
);

router.get('/google/failure', (req, res) => {
  const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(`${frontend}/login?error=google`);
});

module.exports = router;
