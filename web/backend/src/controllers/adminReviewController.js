const reviewModel = require('../models/reviewModel');
const { parsePositiveIntParam } = require('../utils/validation');

async function listResenas(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const soloVisibles = req.query.solo_visibles;
    const { total, items } = await reviewModel.listAllForAdmin({ page, limit, soloVisibles });
    return res.json({
      ok: true,
      total,
      page,
      limit,
      reseñas: items.map((r) => ({
        id: r.id,
        idevento: r.idevento,
        evento_titulo: r.evento_titulo,
        idusuario: r.idusuario,
        usuario_email: r.usuario_email,
        usuario_nombre: r.usuario_nombre,
        usuario_apellido: r.usuario_apellido,
        estrellas: Number(r.estrellas),
        comentario: r.comentario || null,
        oculto: Number(r.oculto) === 1,
        creado_en: r.creado_en,
      })),
    });
  } catch (err) {
    if (reviewModel.isMissingTable(err)) {
      return res.status(503).json({
        ok: false,
        error: 'Tabla de reseñas no instalada. Ejecuta database/schema_evento_resenas.sql',
      });
    }
    return next(err);
  }
}

async function patchOculto(req, res, next) {
  try {
    const id = parsePositiveIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }
    const raw = req.body.oculto;
    const oculto = raw === true || raw === 1 || raw === '1';
    const ok = await reviewModel.setOculto(id, oculto);
    if (!ok) {
      return res.status(404).json({ ok: false, error: 'Reseña no encontrada' });
    }
    return res.json({ ok: true });
  } catch (err) {
    if (reviewModel.isMissingTable(err)) {
      return res.status(503).json({ ok: false, error: 'Tabla de reseñas no instalada' });
    }
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const id = parsePositiveIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }
    const ok = await reviewModel.removeById(id);
    if (!ok) {
      return res.status(404).json({ ok: false, error: 'Reseña no encontrada' });
    }
    return res.json({ ok: true });
  } catch (err) {
    if (reviewModel.isMissingTable(err)) {
      return res.status(503).json({ ok: false, error: 'Tabla de reseñas no instalada' });
    }
    return next(err);
  }
}

module.exports = { listResenas, patchOculto, remove };
