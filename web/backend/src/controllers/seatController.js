const eventSeatModel = require('../models/eventSeatModel');
const { parsePositiveIntParam } = require('../utils/validation');

async function listByZona(req, res, next) {
  try {
    const zonaId = parsePositiveIntParam(req.params.zonaId);
    if (!zonaId) {
      return res.status(400).json({ ok: false, error: 'Zona inválida' });
    }
    const asientos = await eventSeatModel.listByZoneId(zonaId);
    return res.json({ ok: true, asientos });
  } catch (err) {
    return next(err);
  }
}

async function listUnifiedByEvent(req, res, next) {
  try {
    const eventId = parsePositiveIntParam(req.params.eventId);
    if (!eventId) {
      return res.status(400).json({ ok: false, error: 'Evento inválido' });
    }
    await eventSeatModel.ensureTariffAssignmentsForEvent(eventId);
    const data = await eventSeatModel.listUnifiedByEventId(eventId);
    return res.json({ ok: true, ...data });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listByZona, listUnifiedByEvent };
