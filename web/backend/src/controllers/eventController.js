const eventModel = require('../models/eventModel');
const recintoModel = require('../models/recintoModel');
const { parsePositiveIntParam } = require('../utils/validation');

async function withRecintoPlanoUrl(ev) {
  if (!ev) return ev;
  let recinto_url_plano = null;
  try {
    if (Object.prototype.hasOwnProperty.call(ev, 'url_plano') && ev.url_plano != null) {
      const manual = String(ev.url_plano).trim();
      if (manual) recinto_url_plano = manual;
    }
    if (!recinto_url_plano && ev.idrecinto != null && ev.idrecinto !== '') {
      if (await recintoModel.tableExists()) {
        const rec = await recintoModel.findById(ev.idrecinto);
        const raw = rec && rec.url_plano != null ? String(rec.url_plano).trim() : '';
        if (raw) recinto_url_plano = raw;
      }
    }
  } catch {
    recinto_url_plano = null;
  }
  return { ...ev, recinto_url_plano };
}

async function listPublic(req, res, next) {
  try {
    const q = req.query.categoria_id;
    let categoriaId = null;
    if (q != null && q !== '') {
      const n = Number(q);
      if (Number.isInteger(n) && n > 0) categoriaId = n;
    }
    const rows = await eventModel.listPublic(categoriaId);
    return res.json({ ok: true, eventos: rows });
  } catch (err) {
    return next(err);
  }
}

async function getById(req, res, next) {
  try {
    const id = parsePositiveIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }
    const ev = await eventModel.findById(id);
    if (!ev) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    const cancelado = ev.cancelado_at != null && String(ev.cancelado_at).trim() !== '';
    if (cancelado) {
      const url_mapa = ev.url_mapa ?? ev.URL_MAPA ?? null;
      const enriched = await withRecintoPlanoUrl({ ...ev, url_mapa });
      return res.json({
        ok: true,
        evento: {
          ...enriched,
          venta_abierta: false,
          evento_cancelado: true,
        },
      });
    }
    if (Number(ev.activo) !== 1 || ev.estado_moderacion !== 'aprobado') {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    const url_mapa = ev.url_mapa ?? ev.URL_MAPA ?? null;
    const enriched = await withRecintoPlanoUrl({
      ...ev,
      url_mapa,
      venta_abierta: eventModel.ventaAbierta(ev),
      evento_cancelado: false,
    });
    return res.json({
      ok: true,
      evento: enriched,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listPublic, getById };
