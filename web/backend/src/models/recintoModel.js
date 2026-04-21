const { query } = require('../config/database');

/** Catálogo de recintos: lectura para plano, plantilla y panel organizador (sin CRUD admin aquí). */

async function tableExists() {
  try {
    await query('SELECT 1 FROM recintos LIMIT 0');
    return true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function hasUrlPlanoColumn() {
  try {
    await query('SELECT url_plano FROM recintos LIMIT 0');
    return true;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

async function findById(id) {
  if (!(await tableExists())) return null;
  const n = Number(id);
  if (!Number.isFinite(n) || n < 1) return null;
  const withPlano = await hasUrlPlanoColumn();
  const sel = withPlano
    ? `id, nombre, ubicacion_resumen, direccion, url_mapa, aforo_maximo, activo, url_plano`
    : `id, nombre, ubicacion_resumen, direccion, url_mapa, aforo_maximo, activo`;
  const rows = await query(`SELECT ${sel} FROM recintos WHERE id = ? LIMIT 1`, [n]);
  return rows[0] || null;
}

async function listForSelect({ soloActivos = true } = {}) {
  if (!(await tableExists())) return [];
  const where = soloActivos ? 'WHERE activo = 1' : '';
  return query(
    `SELECT id, nombre, ubicacion_resumen, aforo_maximo, activo FROM recintos ${where} ORDER BY nombre ASC`
  );
}

async function listPlantilla(idrecinto) {
  if (!(await tableExists())) return [];
  const n = Number(idrecinto);
  if (!Number.isFinite(n) || n < 1) return [];
  try {
    return await query(
      `SELECT nombre_seccion, descripcion_zona, precio_sugerido, capacidad, limite_por_transaccion,
              pos_x, pos_y, color_plano
       FROM recinto_plantilla_zonas WHERE idrecinto = ? ORDER BY orden ASC, id ASC`,
      [n]
    );
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    return query(
      `SELECT nombre_seccion, descripcion_zona, precio_sugerido, capacidad, limite_por_transaccion
       FROM recinto_plantilla_zonas WHERE idrecinto = ? ORDER BY orden ASC, id ASC`,
      [n]
    );
  }
}

module.exports = {
  tableExists,
  findById,
  listForSelect,
  listPlantilla,
};
