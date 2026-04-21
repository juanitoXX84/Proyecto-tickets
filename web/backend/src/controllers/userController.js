const { validationResult } = require('express-validator');
const purchaseModel = require('../models/purchaseModel');
const userModel = require('../models/userModel');
const paymentModel = require('../models/paymentModel');
const mailService = require('../services/mailService');

/**
 * PATCH /api/user/profile — actualizar datos (perfil ya completo).
 */
async function updateProfile(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    const userId = Number(req.user.id);
    const { nombre, apellido, telefono, pais } = req.body;
    const updated = await userModel.updateProfile(userId, { nombre, apellido, telefono, pais });
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    return res.json({ ok: true, user: userModel.toPublicUser(updated) });
  } catch (err) {
    if (err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE')) {
      return res.status(503).json({
        ok: false,
        error: 'Tu historial de compras no está disponible temporalmente. Intenta de nuevo en unos minutos.',
      });
    }
    return next(err);
  }
}

/**
 * GET /api/user/purchases — solo datos del usuario del token (sin id en URL).
 */
async function purchases(req, res, next) {
  try {
    if (req.user.rol === 'organizador') {
      return res.status(403).json({
        ok: false,
        error: 'Los organizadores no tienen historial de compras; usa una cuenta de comprador.',
      });
    }
    const userId = Number(req.user.id);
    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida' });
    }
    const [ordenes, boletos] = await Promise.all([
      purchaseModel.listOrdersByUser(userId),
      purchaseModel.listTicketsByUser(userId),
    ]);
    return res.json({
      ok: true,
      ordenes,
      boletos,
    });
  } catch (err) {
    return next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    const userId = Number(req.user.id);
    const { currentPassword, newPassword } = req.body;
    const result = await userModel.changePassword(userId, currentPassword, newPassword);
    if (!result.ok) {
      if (result.reason === 'no_password_set') {
        return res.status(400).json({
          ok: false,
          error:
            'Tu cuenta no tiene contraseña local activa. Usa "Olvidé mi contraseña" para crear una nueva.',
        });
      }
      if (result.reason === 'bad_current') {
        return res.status(400).json({ ok: false, error: 'La contraseña actual no es correcta' });
      }
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

async function resendTicketsEmail(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    if (req.user.rol === 'organizador') {
      return res.status(403).json({ ok: false, error: 'Los organizadores no tienen compras de boletos.' });
    }
    const userId = Number(req.user.id);
    const ordenId = Number(req.params.ordenId);
    const ord = await paymentModel.findOrdenById(ordenId);
    if (!ord) {
      return res.status(404).json({ ok: false, error: 'Orden no encontrada' });
    }
    if (Number(ord.idusuario) !== userId) {
      return res.status(403).json({ ok: false, error: 'No autorizado para esta orden' });
    }
    if (!['pagado', 'completada'].includes(String(ord.estado || '').toLowerCase())) {
      return res.status(409).json({ ok: false, error: 'Solo se puede reenviar QR de órdenes pagadas' });
    }

    const bundle = await paymentModel.getTicketDeliveryBundle(ordenId);
    if (!bundle || !Array.isArray(bundle.tickets) || bundle.tickets.length === 0) {
      return res.status(404).json({ ok: false, error: 'No hay boletos emitidos para esta orden' });
    }

    const sent = await mailService.sendPurchaseTicketsEmail(bundle);
    return res.json({
      ok: true,
      ordenId,
      delivery: sent,
      hint:
        sent.mode === 'console'
          ? 'SMTP no configurado: revisa la consola del backend para ver el contenido del correo.'
          : null,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { purchases, updateProfile, changePassword, resendTicketsEmail };
