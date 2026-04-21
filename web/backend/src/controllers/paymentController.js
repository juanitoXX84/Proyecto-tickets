const eventModel = require('../models/eventModel');
const eventSeatModel = require('../models/eventSeatModel');
const paymentModel = require('../models/paymentModel');
const mercadoPagoService = require('../services/mercadoPagoService');
const mailService = require('../services/mailService');
const { canPurchaseEventAsCustomer } = require('../utils/purchasePolicy');
const { isPruebasRole } = require('../utils/roles');

function formatMercadoApiError(err) {
  if (!err || typeof err !== 'object') return String(err || 'Error');
  if (err.message) return String(err.message);
  if (typeof err.error === 'string') return err.error;
  if (Array.isArray(err.cause)) {
    const parts = err.cause.map((c) => c?.description || c?.code).filter(Boolean);
    if (parts.length) return parts.join('. ');
  }
  try {
    return JSON.stringify(err).slice(0, 400);
  } catch {
    return 'Error de Mercado Pago';
  }
}

function disponiblesZona(z) {
  const cap = Number(z?.capacidad);
  const vend = Number(z?.boletos_vendidos ?? 0);
  if (!Number.isFinite(cap) || cap < 0) return 0;
  return Math.max(0, Math.floor(cap - vend));
}

function disponiblesEvento(ev) {
  const cap = Number(ev?.capacidad);
  const vend = Number(ev?.boletosvendidos ?? 0);
  if (!Number.isFinite(cap) || cap < 0) return 0;
  return Math.max(0, Math.floor(cap - vend));
}

function minCardAmountMxN() {
  const raw = Number(process.env.MERCADOPAGO_MIN_CARD_AMOUNT_MXN ?? 10);
  if (!Number.isFinite(raw) || raw <= 0) return 10;
  return Math.round(raw * 100) / 100;
}

function isDemoAutoApproveEnabled() {
  const v = String(process.env.MERCADOPAGO_DEMO_AUTO_APPROVE || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function buildDemoPaymentId(ordenId) {
  return `demo_${Number(ordenId)}_${Date.now()}`;
}

async function trySendTicketsEmail(ordenId) {
  try {
    const bundle = await paymentModel.getTicketDeliveryBundle(ordenId);
    if (!bundle) return;
    await mailService.sendPurchaseTicketsEmail(bundle);
  } catch (e) {
    console.error('[tickets-mail] No se pudo enviar correo para orden', ordenId, e?.message || e);
  }
}

async function createPreference(req, res, next) {
  try {
    const eventoId = Number(req.body.eventoId);
    let cantidad = Number(req.body.cantidad);
    const zonaIdRaw = req.body.zonaId;
    const zonaId =
      zonaIdRaw === undefined || zonaIdRaw === null || zonaIdRaw === ''
        ? null
        : Number(zonaIdRaw);

    const seatIdsNorm = Array.isArray(req.body.seatIds)
      ? [...new Set(req.body.seatIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
      : [];

    if (!Number.isFinite(eventoId) || eventoId < 1) {
      return res.status(400).json({ ok: false, error: 'eventoId inválido' });
    }
    if (!Number.isFinite(cantidad) || cantidad < 1 || cantidad > 20) {
      return res.status(400).json({ ok: false, error: 'cantidad debe ser entre 1 y 20' });
    }

    const evento = await eventModel.findById(eventoId);
    if (!evento || Number(evento.activo) !== 1) {
      return res.status(404).json({ ok: false, error: 'Evento no disponible' });
    }
    if (evento.cancelado_at != null && String(evento.cancelado_at).trim() !== '') {
      return res.status(403).json({ ok: false, error: 'Este evento fue cancelado; no se pueden comprar entradas.' });
    }
    if (evento.estado_moderacion && evento.estado_moderacion !== 'aprobado') {
      return res.status(403).json({ ok: false, error: 'Este evento no está disponible para compra.' });
    }
    if (!canPurchaseEventAsCustomer(req.user, evento)) {
      const error =
        req.user.rol === 'admin'
          ? 'Los administradores no pueden comprar entradas.'
          : req.user.rol === 'organizador'
            ? 'Los organizadores no pueden comprar entradas; solo pueden crear y gestionar eventos.'
            : 'No puedes comprar entradas para este evento.';
      return res.status(403).json({ ok: false, error });
    }
    if (!eventModel.ventaAbierta(evento)) {
      return res.status(403).json({
        ok: false,
        error: 'La venta de boletos no está activa para este evento (fechas de venta o cierre)',
      });
    }

    const zonas = Array.isArray(evento.zonas) ? evento.zonas : [];
    let unitPrice;
    let idzona = null;
    let total;

    if (zonas.length > 0) {
      if (seatIdsNorm.length > 0) {
        cantidad = seatIdsNorm.length;
        if (!(await eventSeatModel.tableExists())) {
          return res.status(503).json({
            ok: false,
            error: 'Mapa de asientos no disponible. Ejecuta la migración SQL en la base de datos.',
          });
        }
        if (await eventSeatModel.tipoMapTableExists()) {
          await eventSeatModel.ensureTariffAssignmentsForEvent(eventoId);
        }
        const seatRows = await eventSeatModel.resolveSeatsForCheckout(eventoId, seatIdsNorm);
        const wanted = new Set(seatIdsNorm.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0));
        if (seatRows.length !== wanted.size) {
          return res.status(400).json({
            ok: false,
            error: 'Uno o más asientos no son válidos para este evento.',
          });
        }
        for (const r of seatRows) {
          if (String(r.estado) !== 'available') {
            return res.status(409).json({
              ok: false,
              error: 'Uno o más asientos ya no están disponibles.',
            });
          }
        }
        let sum = 0;
        for (const r of seatRows) {
          const p = Number(r.precio);
          if (!Number.isFinite(p) || p < 0) {
            return res.status(400).json({
              ok: false,
              error: 'Precio de zona no disponible para un asiento seleccionado.',
            });
          }
          sum += p;
        }
        total = Math.round(sum * 100) / 100;
        idzona = Number(seatRows[0].billing_zona_id);
        if (!Number.isFinite(idzona) || idzona < 1 || !zonas.some((row) => Number(row.id) === idzona)) {
          return res.status(400).json({ ok: false, error: 'No se pudo determinar la zona de cobro.' });
        }
        unitPrice = cantidad > 0 ? Math.round((total / cantidad) * 100) / 100 : total;
      } else {
        if (!Number.isFinite(zonaId) || zonaId < 1) {
          return res.status(400).json({ ok: false, error: 'Debes elegir una zona (zonaId)' });
        }
        const z = zonas.find((row) => Number(row.id) === zonaId);
        if (!z) {
          return res.status(400).json({ ok: false, error: 'Zona no válida para este evento' });
        }
        const usaMapa =
          Number(z.usa_mapa_asientos) === 1 ||
          z.usa_mapa_asientos === true ||
          z.usa_mapa_asientos === '1';
        if (usaMapa) {
          return res.status(400).json({
            ok: false,
            error: 'Selecciona tus asientos en el mapa antes de pagar.',
          });
        }
        if (disponiblesZona(z) < cantidad) {
          return res.status(409).json({ ok: false, error: 'No hay suficientes entradas en esta zona' });
        }
        unitPrice = Number(z.precio);
        idzona = z.id;
        total = Math.round(unitPrice * cantidad * 100) / 100;
      }
    } else {
      unitPrice = Number(evento.precio);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return res.status(400).json({ ok: false, error: 'Precio del evento no disponible' });
      }
      if (disponiblesEvento(evento) < cantidad) {
        return res.status(409).json({ ok: false, error: 'No hay suficientes entradas' });
      }
      total = Math.round(unitPrice * cantidad * 100) / 100;
    }

    const limMax = Math.min(100, Math.max(1, Number(evento.limite_boletos_por_transaccion) || 6));
    if (cantidad > limMax) {
      return res.status(400).json({
        ok: false,
        error: `Este evento permite como máximo ${limMax} boletos por compra.`,
      });
    }
    const minCard = minCardAmountMxN();
    if (total < minCard) {
      return res.status(400).json({
        ok: false,
        error: `El monto mínimo para pagar con tarjeta es $${minCard.toFixed(2)} MXN. Sube la cantidad o el precio de la zona.`,
        code: 'amount_below_card_minimum',
      });
    }

    if (!mercadoPagoService.isConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Integración de pagos no configurada',
        integration: 'mercadopago',
        hint:
          'En web/.env: MERCADOPAGO_ACCESS_TOKEN (credenciales de producción o prueba), MERCADOPAGO_WEBHOOK_TOKEN (secreto largo aleatorio) y API_PUBLIC_URL (URL HTTPS pública del backend, p. ej. ngrok, para que MP llame al webhook). Opcional: MERCADOPAGO_CURRENCY_ID (MXN, ARS, COP… según tu cuenta).',
      });
    }
    try {
      mercadoPagoService.webhookPathToken();
    } catch (e) {
      return res.status(503).json({ ok: false, error: e.message || 'Webhook no configurado' });
    }

    const created = await paymentModel.createPendingOrderWithPayment({
      userId: req.user.id,
      eventoId,
      zonaId: idzona,
      cantidad,
      unitPrice,
      total,
      seatIds: seatIdsNorm.length ? seatIdsNorm : undefined,
    });
    if (created.error) {
      if (created.error.includes('schema_fase4')) {
        return res.status(503).json({ ok: false, error: created.error });
      }
      return res.status(400).json({ ok: false, error: created.error });
    }

    let mp;
    try {
      mp = await mercadoPagoService.createCheckoutPreference({
        ordenId: created.ordenId,
        tituloItem: `${evento.titulo} · ${cantidad} entrada(s)`,
        unitPrice,
        cantidad,
        payerEmail: req.user.email,
        singleLineTotal: seatIdsNorm.length > 0 ? total : null,
      });
    } catch (e) {
      const described = mercadoPagoService.describePreferenceCreateError(e);
      console.error('[mp] create preference', described.technical || e);
      await paymentModel.releaseReservationForOrden(created.ordenId, 'mp_preference_error');
      return res.status(502).json({
        ok: false,
        error: described.error,
        ...(described.hint && { hint: `${described.hint} (${described.technical})` }),
      });
    }

    await paymentModel.updateOrdenPreferenceId(created.ordenId, mp.preferenceId);

    const publicKey = mercadoPagoService.getPublicKey();
    const accessTok = mercadoPagoService.readMercadoAccessToken() || '';
    if (publicKey && accessTok) {
      const tokProd = /^APP_USR-/.test(accessTok);
      const pkProd = /^APP_USR-/.test(publicKey);
      const tokTest = /^TEST-/.test(accessTok);
      const pkTest = /^TEST-/.test(publicKey);
      if ((tokProd && pkTest) || (tokTest && pkProd)) {
        console.warn(
          '[mp] MERCADOPAGO_PUBLIC_KEY y MERCADOPAGO_ACCESS_TOKEN parecen ser de modos distintos (prueba vs producción). El Card Brick suele fallar hasta usar el par correcto del panel.'
        );
      }
    }

    return res.json({
      ok: true,
      initPoint: mp.initPoint,
      init_point: mp.initPoint,
      preferenceId: mp.preferenceId,
      ordenId: created.ordenId,
      total,
      publicKey,
      demoAutoApprove: isDemoAutoApproveEnabled() && isPruebasRole(req.user),
    });
  } catch (err) {
    if (paymentModel.isSchemaError(err) || paymentModel.isMissingTable(err)) {
      return res.status(503).json({
        ok: false,
        error:
          'Faltan tablas o columnas de pagos. Ejecuta database/schema_tablas_compra_opcional.sql y database/schema_fase4_mercadopago.sql.',
      });
    }
    return next(err);
  }
}

async function approveDemo(req, res, next) {
  try {
    if (!isPruebasRole(req.user)) {
      return res.status(403).json({
        ok: false,
        error: 'Solo cuentas con rol Pruebas pueden aprobar pagos de demostración sin cargo real.',
      });
    }
    if (!isDemoAutoApproveEnabled()) {
      return res.status(403).json({
        ok: false,
        error: 'Modo demo desactivado. Activa MERCADOPAGO_DEMO_AUTO_APPROVE=true en .env.',
      });
    }
    const ordenId = Number(req.body.ordenId);
    if (!Number.isFinite(ordenId) || ordenId < 1) {
      return res.status(400).json({ ok: false, error: 'ordenId inválido' });
    }
    const ord = await paymentModel.findOrdenById(ordenId);
    if (!ord) {
      return res.status(404).json({ ok: false, error: 'Orden no encontrada' });
    }
    if (Number(ord.idusuario) !== Number(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }
    if (String(ord.estado) !== 'pendiente') {
      return res.status(409).json({ ok: false, error: 'Esta orden ya no está pendiente' });
    }
    const applied = await paymentModel.applyApprovedPaymentIfNeeded({
      ordenId,
      mpPaymentId: buildDemoPaymentId(ordenId),
      transactionAmount: ord.total,
      statusDetail: 'demo_auto_approved',
      allowWithoutTickets: true,
    });
    let final = applied;
    if (!applied.ok) {
      const fallback = await paymentModel.forceDemoApproveLenient({
        ordenId,
        mpPaymentId: buildDemoPaymentId(ordenId),
        statusDetail: 'demo_fallback_lenient',
      });
      if (!fallback.ok) {
        return res.status(500).json({
          ok: false,
          error:
            applied.reason ||
            fallback.reason ||
            'No se pudo aprobar la orden en modo demo',
        });
      }
      final = { ok: true, forced: true, warning: `Fallback demo aplicado: ${applied.reason || 'compatibilidad de esquema'}` };
    }
    if (!final.already) {
      await trySendTicketsEmail(ordenId);
    }
    return res.json({
      ok: true,
      status: 'approved',
      ordenId,
      demo: true,
      ...(final.warning ? { warning: final.warning } : {}),
      ...(final.forced ? { forced: true } : {}),
    });
  } catch (err) {
    return next(err);
  }
}

async function submitCardBrick(req, res, next) {
  try {
    const ordenId = Number(req.body.ordenId);
    const formData = req.body.formData;
    if (!Number.isFinite(ordenId) || ordenId < 1) {
      return res.status(400).json({ ok: false, error: 'ordenId inválido' });
    }
    if (!formData || typeof formData !== 'object') {
      return res.status(400).json({ ok: false, error: 'Datos de tarjeta ausentes' });
    }

    const ord = await paymentModel.findOrdenById(ordenId);
    if (!ord) {
      return res.status(404).json({ ok: false, error: 'Orden no encontrada' });
    }
    if (Number(ord.idusuario) !== Number(req.user.id)) {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }
    if (String(ord.estado) !== 'pendiente') {
      return res.status(409).json({ ok: false, error: 'Esta orden ya no está pendiente' });
    }

    let pay;
    try {
      pay = await mercadoPagoService.createPaymentFromCardForm({
        ordenId,
        ordenTotal: ord.total,
        formData,
        payerEmailFallback: req.user.email,
        mpPreferenceId: ord.mp_preference_id ?? ord.MP_PREFERENCE_ID ?? null,
      });
    } catch (e) {
      const status = Number(e?.status) || 502;
      const nested =
        Array.isArray(e?.cause)
          ? e.cause.map((c) => c?.description || c?.message || '').filter(Boolean).join('. ')
          : '';
      const raw =
        [e?.message && String(e.message), nested, formatMercadoApiError(e)].filter(Boolean).join(' ') ||
        '';
      const msg = mercadoPagoService.friendlyMercadoCredentialOrPaymentError(raw);
      console.error('[mp] brick payment', {
        status: e?.status,
        message: e?.message,
        cause: e?.cause,
      });
      return res.status(status >= 400 && status < 600 ? status : 502).json({
        ok: false,
        error: msg || 'Mercado Pago rechazó el cobro',
      });
    }

    if (!pay || pay.id == null) {
      return res.status(502).json({ ok: false, error: 'Respuesta inválida de Mercado Pago' });
    }

    const st = String(pay.status || '').toLowerCase();
    const mpId = pay.id;

    if (st === 'approved') {
      const applied = await paymentModel.applyApprovedPaymentIfNeeded({
        ordenId,
        mpPaymentId: mpId,
        transactionAmount: pay.transaction_amount,
        statusDetail: pay.status_detail,
      });
      if (!applied.ok) {
        if (applied.reason === 'monto_no_coincide') {
          await paymentModel.releaseReservationForOrden(ordenId, 'monto_no_coincide');
          return res.status(409).json({ ok: false, error: 'El monto no coincide con la orden' });
        }
        return res.status(500).json({
          ok: false,
          error: applied.reason || 'No se pudo registrar el pago aprobado',
        });
      }
      if (!applied.already) {
        await trySendTicketsEmail(ordenId);
      }
      return res.json({
        ok: true,
        status: 'approved',
        ordenId,
        paymentId: mpId,
      });
    }

    if (['rejected', 'cancelled', 'charged_back'].includes(st)) {
      await paymentModel.releaseReservationForOrden(ordenId, pay.status_detail || st);
      return res.json({
        ok: false,
        status: st,
        error: pay.status_detail || 'Pago rechazado',
      });
    }

    return res.json({
      ok: true,
      pending: true,
      status: st,
      paymentId: mpId,
      ordenId,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createPreference, submitCardBrick, approveDemo };
