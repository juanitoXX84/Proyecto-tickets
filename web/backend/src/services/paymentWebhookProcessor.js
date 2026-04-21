const paymentModel = require('../models/paymentModel');
const mercadoPagoService = require('./mercadoPagoService');
const mailService = require('./mailService');

function parseOrdenIdFromExternalReference(ext) {
  const m = /^tr-(\d+)$/.exec(String(ext || '').trim());
  return m ? Number(m[1]) : null;
}

function isTerminalFailureStatus(status) {
  return ['rejected', 'cancelled', 'charged_back'].includes(String(status || '').toLowerCase());
}

/**
 * Procesa un pago notificado por Mercado Pago (id numérico de pago).
 */
async function processPaymentNotification(mpPaymentId) {
  if (!mercadoPagoService.isConfigured()) {
    return { ok: false, reason: 'mp_no_configurado' };
  }

  let pay;
  try {
    pay = await mercadoPagoService.fetchPayment(mpPaymentId);
  } catch (e) {
    return { ok: false, reason: 'mp_fetch_error', error: e.message };
  }

  const ordenId = parseOrdenIdFromExternalReference(pay.external_reference);
  if (!ordenId) {
    return { ok: false, reason: 'external_ref_invalida' };
  }

  const ord = await paymentModel.findOrdenById(ordenId);
  if (!ord) {
    return { ok: false, reason: 'orden_no_encontrada' };
  }

  const existing = await paymentModel.findPagoByMpPaymentId(String(pay.id));
  if (existing && existing.estado === 'aprobado') {
    return { ok: true, already: true };
  }

  const st = String(pay.status || '').toLowerCase();
  if (st === 'approved') {
    const applied = await paymentModel.applyApprovedPaymentIfNeeded({
      ordenId,
      mpPaymentId: pay.id,
      transactionAmount: pay.transaction_amount,
      statusDetail: pay.status_detail,
    });
    if (applied?.ok && !applied?.already) {
      try {
        const bundle = await paymentModel.getTicketDeliveryBundle(ordenId);
        if (bundle) await mailService.sendPurchaseTicketsEmail(bundle);
      } catch (e) {
        console.error('[tickets-mail] webhook envío falló para orden', ordenId, e?.message || e);
      }
    }
    return applied;
  }

  if (isTerminalFailureStatus(st)) {
    const rel = await paymentModel.releaseReservationForOrden(ordenId, pay.status_detail || st);
    return { ok: true, released: rel };
  }

  return { ok: true, pending: true, status: st };
}

module.exports = { processPaymentNotification, parseOrdenIdFromExternalReference };
