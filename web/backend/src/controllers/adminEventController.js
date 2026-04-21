const eventModel = require('../models/eventModel');
const { parsePositiveIntParam } = require('../utils/validation');
const { query } = require('../config/database');
const { notifyEventCancelledPurchasers } = require('../services/mailService');

async function fetchPurchaserEmailsForEvent(eventId) {
  try {
    const rows = await query(
      `SELECT DISTINCT u.email
       FROM boletos b
       INNER JOIN usuarios u ON u.id = b.idusuario
       WHERE b.idevento = ? AND b.estado IN ('pagado','activo','usado') AND u.email IS NOT NULL AND TRIM(u.email) <> ''`,
      [eventId]
    );
    return rows.map((r) => r.email).filter(Boolean);
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR') {
      return [];
    }
    throw e;
  }
}

async function getEventPreview(req, res, next) {
  try {
    const id = parsePositiveIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }
    const ev = await eventModel.findById(id);
    if (!ev) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    const urlRaw = ev.url_mapa != null && ev.url_mapa !== '' ? String(ev.url_mapa) : ev.URL_MAPA;
    const url_mapa = urlRaw != null && String(urlRaw).trim() !== '' ? String(urlRaw).trim() : null;
    return res.json({
      ok: true,
      evento: {
        ...ev,
        url_mapa,
        venta_abierta: eventModel.ventaAbierta(ev),
        evento_cancelado: Boolean(ev.cancelado_at != null && String(ev.cancelado_at).trim() !== ''),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function listEvents(req, res, next) {
  try {
    const estado = typeof req.query.estado === 'string' ? req.query.estado.trim() : '';
    const rows = await eventModel.listAllForAdmin();
    let list = rows;
    if (estado === 'pendiente') {
      list = rows.filter(
        (r) =>
          r.estado_moderacion === 'pendiente' &&
          Number(r.activo) === 1 &&
          !(r.cancelado_at != null && String(r.cancelado_at).trim() !== '')
      );
    } else if (estado === 'rechazado') {
      list = rows.filter((r) => r.estado_moderacion === 'rechazado');
    } else if (estado === 'cancelados') {
      list = rows.filter((r) => r.cancelado_at != null && String(r.cancelado_at).trim() !== '');
    }
    return res.json({ ok: true, eventos: list });
  } catch (err) {
    return next(err);
  }
}

async function moderate(req, res, next) {
  try {
    const id = parsePositiveIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }
    const accion = String(req.body.accion || '').trim().toLowerCase();
    const motivo = req.body.motivo != null ? String(req.body.motivo).trim() : '';

    const ev = await eventModel.findById(id);
    if (!ev) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }

    if (accion === 'aprobar') {
      const updated = await eventModel.setModeracionEstado(id, 'aprobado', null);
      return res.json({ ok: true, evento: updated });
    }
    if (accion === 'rechazar') {
      if (!motivo) {
        return res.status(400).json({ ok: false, error: 'Indica un motivo de rechazo.' });
      }
      const updated = await eventModel.setModeracionEstado(id, 'rechazado', motivo);
      return res.json({ ok: true, evento: updated });
    }
    return res.status(400).json({ ok: false, error: 'accion debe ser aprobar o rechazar' });
  } catch (err) {
    if (err.status === 503) {
      return res.status(503).json({ ok: false, error: err.message });
    }
    return next(err);
  }
}

async function setDestacado(req, res, next) {
  try {
    const id = parsePositiveIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }
    const raw = req.body.destacado;
    const on = raw === true || raw === 1 || raw === '1';
    const ev = await eventModel.findById(id);
    if (!ev) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    if (Number(ev.activo) !== 1 || ev.estado_moderacion !== 'aprobado') {
      return res.status(400).json({
        ok: false,
        error: 'Solo se puede destacar un evento publicado y aprobado.',
      });
    }
    const updated = await eventModel.setEventDestacado(id, on);
    return res.json({ ok: true, evento: updated });
  } catch (err) {
    if (err.status === 503) {
      return res.status(503).json({ ok: false, error: err.message });
    }
    return next(err);
  }
}

async function cancelEvent(req, res, next) {
  try {
    const id = parsePositiveIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }
    const motivo = req.body.motivo != null ? String(req.body.motivo).trim() : '';
    const ev = await eventModel.findById(id);
    if (!ev) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    if (ev.cancelado_at != null && String(ev.cancelado_at).trim() !== '') {
      return res.status(400).json({ ok: false, error: 'El evento ya estaba cancelado.' });
    }

    const titulo = ev.titulo || 'Evento';
    const emails = await fetchPurchaserEmailsForEvent(id);
    const updated = await eventModel.setEventCancelled(id, motivo || null);

    try {
      await notifyEventCancelledPurchasers({
        to: emails,
        eventTitle: titulo,
        motivo: motivo || null,
      });
    } catch (mailErr) {
      console.error('[adminEventController.cancelEvent] Aviso correo:', mailErr.message || mailErr);
    }

    return res.json({
      ok: true,
      evento: updated,
      compradores_notificados: emails.length,
    });
  } catch (err) {
    if (err.status === 503) {
      return res.status(503).json({ ok: false, error: err.message });
    }
    return next(err);
  }
}

module.exports = {
  getEventPreview,
  listEvents,
  moderate,
  setDestacado,
  cancelEvent,
};
