const { query } = require('../config/database');

async function list(req, res, next) {
  try {
    const rows = await query(
      `SELECT id, nombre, icono, color FROM categorias ORDER BY nombre ASC`
    );
    return res.json({ ok: true, categorias: rows });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list };
