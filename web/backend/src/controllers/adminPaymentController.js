const paymentModel = require('../models/paymentModel');
const mercadoPagoService = require('../services/mercadoPagoService');

function parsePageLimit(req) {
  const pageRaw = req.query.page != null ? Number(req.query.page) : 1;
  const limitRaw = req.query.limit != null ? Number(req.query.limit) : 25;
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 25;
  return { page, limit };
}

async function listPagos(req, res, next) {
  try {
    const { page, limit } = parsePageLimit(req);
    const estado = typeof req.query.estado === 'string' ? req.query.estado.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const { rows, total } = await paymentModel.listPagosAdmin({ page, limit, estado, q });
    return res.json({ ok: true, pagos: rows, total, page, limit });
  } catch (err) {
    if (paymentModel.isSchemaError(err) || paymentModel.isMissingTable(err)) {
      return res.status(503).json({
        ok: false,
        error: 'Ejecuta database/schema_fase4_mercadopago.sql y tablas de compra para ver pagos.',
      });
    }
    return next(err);
  }
}

async function financeSummary(req, res, next) {
  try {
    const desde = typeof req.query.desde === 'string' && req.query.desde.trim() ? req.query.desde.trim() : null;
    const hasta = typeof req.query.hasta === 'string' && req.query.hasta.trim() ? req.query.hasta.trim() : null;
    if (!desde || !hasta) {
      return res.status(400).json({ ok: false, error: 'Indica desde y hasta (YYYY-MM-DD)' });
    }
    const summary = await paymentModel.financeSummary({ desde, hasta });
    const rate = Number(process.env.PLATFORM_COMMISSION_RATE || 0);
    return res.json({
      ok: true,
      desde,
      hasta,
      resumen: summary,
      comision_config: Number.isFinite(rate) && rate > 0 ? { PLATFORM_COMMISSION_RATE: rate } : null,
    });
  } catch (err) {
    if (paymentModel.isSchemaError(err) || paymentModel.isMissingTable(err)) {
      return res.status(503).json({
        ok: false,
        error: 'Ejecuta database/schema_fase4_mercadopago.sql y tablas de compra.',
      });
    }
    return next(err);
  }
}

async function refundPago(req, res, next) {
  try {
    const pagoId = Number(req.params.id);
    if (!Number.isInteger(pagoId) || pagoId < 1) {
      return res.status(400).json({ ok: false, error: 'ID de pago inválido' });
    }
    const pago = await paymentModel.findPagoById(pagoId);
    if (!pago) {
      return res.status(404).json({ ok: false, error: 'Pago no encontrado' });
    }
    if (!pago.mp_payment_id) {
      return res.status(400).json({ ok: false, error: 'Este pago no tiene id de Mercado Pago' });
    }
    if (!mercadoPagoService.isConfigured()) {
      return res.status(503).json({ ok: false, error: 'MERCADOPAGO_ACCESS_TOKEN no configurado' });
    }

    try {
      await mercadoPagoService.createRefund(pago.mp_payment_id, {});
    } catch (e) {
      console.error('[mp] refund', e);
      return res.status(502).json({
        ok: false,
        error: e.message || 'Mercado Pago rechazó el reembolso',
      });
    }

    const done = await paymentModel.markRefundInDb({ pagoId, ordenId: pago.idorden });
    if (!done.ok) {
      return res.status(400).json({ ok: false, error: done.error });
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listPagos, financeSummary, refundPago };
