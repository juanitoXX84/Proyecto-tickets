const paymentModel = require('../models/paymentModel');

/**
 * GET /api/tickets/by-code/:codigo
 * Público: lectura de boleto para mostrar al escanear el QR (mismo dato que en el correo).
 */
async function getByCodePublic(req, res, next) {
  try {
    const codigoRaw = req.params.codigo != null ? String(req.params.codigo).trim() : '';
    if (!codigoRaw) {
      return res.status(400).json({ ok: false, error: 'Código de boleto requerido' });
    }
    const data = await paymentModel.getPublicTicketViewByCodigo(codigoRaw);
    if (!data) {
      return res.status(404).json({ ok: false, error: 'Boleto no encontrado o código inválido' });
    }
    return res.json({ ok: true, boleto: data });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getByCodePublic };
