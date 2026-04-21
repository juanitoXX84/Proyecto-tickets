/**
 * =============================================================================
 * Extensión Mercado Pago (placeholder — integración real fuera de este alcance)
 * =============================================================================
 *
 * Aquí conectarás el SDK oficial, un microservicio de pagos o la herramienta que
 * indique tu profesor/equipo. El backend solo expone rutas y validaciones;
 * la creación de preferencias, el webhook y la firma de notificaciones deben
 * implementarse siguiendo la documentación de Mercado Pago.
 *
 * Webhook (futuro): en Express, la ruta que reciba notificaciones debe usar
 * `express.raw({ type: 'application/json' })` registrada ANTES de `express.json()`
 * en app.js, y verificar la cabecera de firma según la guía oficial (nunca
 * confiar en el cuerpo sin verificación).
 *
 * Variables de entorno previstas (ejemplo):
 *   MERCADOPAGO_ACCESS_TOKEN
 *   MERCADOPAGO_WEBHOOK_SECRET (si aplica a tu flujo)
 */

function isMercadoPagoConfigured() {
  try {
    const svc = require('../services/mercadoPagoService');
    return svc.isConfigured();
  } catch {
    return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim());
  }
}

/**
 * Reemplazar por llamada real al SDK cuando integres pagos.
 * @returns {{ ok: false, reason: string }}
 */
function createPreferenceNotImplemented({ eventoId, cantidad, userId }) {
  return {
    ok: false,
    reason: 'Integración Mercado Pago pendiente (ver integrations/mercadoPago.placeholder.js)',
    ...(process.env.NODE_ENV !== 'production'
      ? { debug: { eventoId, cantidad, userId } }
      : {}),
  };
}

module.exports = {
  isMercadoPagoConfigured,
  createPreferenceNotImplemented,
};
