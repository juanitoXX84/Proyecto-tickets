const { query, getPool } = require('../config/database');

/** Incluye `pruebas`: comprador con permiso de flujos de prueba (pago demo sin cargo, solo si el servidor lo permite). */
const ROLES = ['admin', 'organizador', 'usuario', 'pruebas'];

async function countActiveAdmins() {
  const rows = await query(
    `SELECT COUNT(*) AS c FROM usuarios WHERE rol = 'admin' AND COALESCE(activo, 1) = 1`
  );
  return Number(rows[0]?.c) || 0;
}

/**
 * Listado paginado para panel admin.
 * @param {{ page: number, limit: number, q: string, rol: string|null }} opts
 */
async function listUsersForAdmin({ page, limit, q, rol }) {
  const offset = (page - 1) * limit;
  const where = ['1=1'];
  const params = [];

  if (q && String(q).trim()) {
    const sanitized = String(q).trim().slice(0, 120).replace(/[%_]/g, '');
    if (sanitized) {
      const like = `%${sanitized}%`;
      where.push('(nombre LIKE ? OR apellido LIKE ? OR email LIKE ?)');
      params.push(like, like, like);
    }
  }

  if (rol && ROLES.includes(rol)) {
    where.push('rol = ?');
    params.push(rol);
  }

  const whereSql = where.join(' AND ');
  const countRows = await query(`SELECT COUNT(*) AS c FROM usuarios WHERE ${whereSql}`, params);
  const total = Number(countRows[0]?.c) || 0;

  const listParams = [...params, limit, offset];
  const rows = await query(
    `SELECT id, nombre, apellido, email, rol, activo, fecha_registro, ultimo_acceso_at, ultimo_login_metodo,
            (google_id IS NOT NULL AND TRIM(COALESCE(google_id, '')) <> '') AS tiene_google
     FROM usuarios
     WHERE ${whereSql}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    listParams
  );

  return { rows, total };
}

async function findAdminRow(id) {
  const rows = await query(
    `SELECT id, nombre, apellido, email, rol, activo FROM usuarios WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * @param {number} targetId
 * @param {{ rol?: string, activo?: number }} patch — solo campos definidos
 * @param {number} adminId
 * @param {{ accion: string, detalle: string|null }} audit
 */
async function updateUserByAdmin(targetId, patch, adminId, audit) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sets = [];
    const vals = [];
    if (patch.rol !== undefined) {
      sets.push('rol = ?');
      vals.push(patch.rol);
    }
    if (patch.activo !== undefined) {
      sets.push('activo = ?');
      vals.push(patch.activo);
    }
    if (!sets.length) {
      await conn.rollback();
      return { ok: false, reason: 'empty' };
    }
    vals.push(targetId);
    const [result] = await conn.execute(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`, vals);
    if (!result.affectedRows) {
      await conn.rollback();
      return { ok: false, reason: 'not_found' };
    }
    await conn.execute(
      `INSERT INTO admin_usuario_auditoria (admin_user_id, target_user_id, accion, detalle) VALUES (?, ?, ?, ?)`,
      [adminId, targetId, audit.accion, audit.detalle]
    );
    await conn.commit();
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  ROLES,
  countActiveAdmins,
  listUsersForAdmin,
  findAdminRow,
  updateUserByAdmin,
};
