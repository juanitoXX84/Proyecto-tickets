const eventModel = require('../models/eventModel');
const reviewModel = require('../models/reviewModel');
const { parsePositiveIntParam } = require('../utils/validation');
const { canActAsBuyer, isPruebasRole } = require('../utils/roles');

const MAX_COMENTARIO = 2000;

function eventHasEnded(ev) {
  if (!ev) return false;
  const endIso = ev.fecha_fin || ev.fecha;
  if (!endIso) return false;
  const end = new Date(endIso);
  return Number.isFinite(end.getTime()) && end.getTime() < Date.now();
}

function eventIsCancelled(ev) {
  return ev && ev.cancelado_at != null && String(ev.cancelado_at).trim() !== '';
}

async function listByEvent(req, res, next) {
  try {
    const eventId = parsePositiveIntParam(req.params.id);
    if (!eventId) {
      return res.status(400).json({ ok: false, error: 'ID de evento inválido' });
    }
    const [agg, items] = await Promise.all([
      reviewModel.aggregatePublicByEvent(eventId),
      reviewModel.listPublicByEvent(eventId),
    ]);
    return res.json({
      ok: true,
      promedio: agg.promedio,
      total: agg.total,
      reseñas: items,
    });
  } catch (err) {
    if (reviewModel.isMissingTable(err)) {
      return res.json({ ok: true, promedio: null, total: 0, reseñas: [] });
    }
    return next(err);
  }
}

async function reviewEligibility(req, res, next) {
  try {
    const eventId = parsePositiveIntParam(req.params.id);
    if (!eventId) {
      return res.status(400).json({ ok: false, error: 'ID de evento inválido' });
    }
    if (!canActAsBuyer(req.user)) {
      return res.json({
        ok: true,
        puedeResenar: false,
        yaReseno: false,
        motivo: 'rol_no_permitido',
      });
    }

    const existing = await reviewModel.findByUserAndEvent(req.user.id, eventId);

    if (existing) {
      return res.json({
        ok: true,
        puedeResenar: false,
        yaReseno: true,
        motivo: 'ya_reseño',
      });
    }

    const ev = await eventModel.findById(eventId);
    if (!ev) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    if (eventIsCancelled(ev)) {
      return res.json({
        ok: true,
        puedeResenar: false,
        yaReseno: false,
        motivo: 'evento_cancelado',
      });
    }
    if (!eventHasEnded(ev) && !isPruebasRole(req.user)) {
      return res.json({
        ok: true,
        puedeResenar: false,
        yaReseno: false,
        motivo: 'evento_no_ha_terminado',
      });
    }

    let tieneBoleto = await reviewModel.hasApprovedTicketForEvent(req.user.id, eventId);
    if (!tieneBoleto && isPruebasRole(req.user)) {
      tieneBoleto = await reviewModel.hasPaidOrderTicketLenient(req.user.id, eventId);
    }
    if (!tieneBoleto && isPruebasRole(req.user)) {
      tieneBoleto = await reviewModel.hasPaidOrdenForEventPruebas(req.user.id, eventId);
    }
    if (!tieneBoleto) {
      return res.json({
        ok: true,
        puedeResenar: false,
        yaReseno: false,
        motivo: 'sin_compra_aprobada',
      });
    }

    const schemaOk = await reviewModel.reviewsSchemaReady();
    if (!schemaOk) {
      return res.json({
        ok: true,
        puedeResenar: false,
        yaReseno: false,
        motivo: 'schema_resenas_faltante',
      });
    }

    return res.json({
      ok: true,
      puedeResenar: true,
      yaReseno: false,
      motivo: null,
    });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    const eventId = parsePositiveIntParam(req.params.id);
    if (!eventId) {
      return res.status(400).json({ ok: false, error: 'ID de evento inválido' });
    }
    if (!canActAsBuyer(req.user)) {
      return res.status(403).json({ ok: false, error: 'Tu rol no puede publicar reseñas como comprador' });
    }

    const estrellas = Number(req.body.estrellas);
    if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
      return res.status(400).json({ ok: false, error: 'La calificación debe ser un entero entre 1 y 5 estrellas' });
    }

    let comentario = req.body.comentario;
    if (comentario == null || comentario === '') {
      comentario = null;
    } else {
      comentario = String(comentario).trim();
      if (comentario.length > MAX_COMENTARIO) {
        return res.status(400).json({
          ok: false,
          error: `El comentario no puede superar ${MAX_COMENTARIO} caracteres`,
        });
      }
      if (comentario === '') comentario = null;
    }

    const ev = await eventModel.findById(eventId);
    if (!ev) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    if (eventIsCancelled(ev)) {
      return res.status(403).json({ ok: false, error: 'No se pueden publicar reseñas en eventos cancelados' });
    }
    if (!eventHasEnded(ev) && !isPruebasRole(req.user)) {
      return res.status(403).json({
        ok: false,
        error: 'Solo puedes calificar después de que el evento haya terminado',
      });
    }

    let tieneBoleto = await reviewModel.hasApprovedTicketForEvent(req.user.id, eventId);
    if (!tieneBoleto && isPruebasRole(req.user)) {
      tieneBoleto = await reviewModel.hasPaidOrderTicketLenient(req.user.id, eventId);
    }
    if (!tieneBoleto && isPruebasRole(req.user)) {
      tieneBoleto = await reviewModel.hasPaidOrdenForEventPruebas(req.user.id, eventId);
    }
    if (!tieneBoleto) {
      return res.status(403).json({
        ok: false,
        error: 'Solo pueden reseñar quienes compraron entrada y el pago fue aprobado',
      });
    }

    const schemaOk = await reviewModel.reviewsSchemaReady();
    if (!schemaOk) {
      return res.status(503).json({
        ok: false,
        error:
          'La tabla de reseñas no está instalada. Ejecuta database/schema_evento_resenas.sql en MySQL.',
      });
    }

    let dup = null;
    try {
      dup = await reviewModel.findByUserAndEvent(req.user.id, eventId);
    } catch (e) {
      if (reviewModel.isMissingTable(e)) {
        return res.status(503).json({
          ok: false,
          error: 'Reseñas no disponibles. Ejecuta database/schema_evento_resenas.sql en MySQL.',
        });
      }
      throw e;
    }
    if (dup) {
      return res.status(409).json({ ok: false, error: 'Ya enviaste una reseña para este evento' });
    }

    try {
      const newId = await reviewModel.createReview({
        userId: req.user.id,
        eventId,
        estrellas,
        comentario,
      });
      return res.status(201).json({ ok: true, id: newId });
    } catch (err) {
      if (err && Number(err.errno) === 1062) {
        return res.status(409).json({ ok: false, error: 'Ya enviaste una reseña para este evento' });
      }
      if (reviewModel.isMissingTable(err)) {
        return res.status(503).json({
          ok: false,
          error: 'Reseñas no disponibles. Ejecuta database/schema_evento_resenas.sql en MySQL.',
        });
      }
      throw err;
    }
  } catch (err) {
    return next(err);
  }
}

module.exports = { listByEvent, reviewEligibility, create };
