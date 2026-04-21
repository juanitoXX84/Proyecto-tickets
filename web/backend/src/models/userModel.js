const bcrypt = require('bcryptjs');
const { query, getPool } = require('../config/database');

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Gmail / Googlemail: mismo buzón aunque cambien puntos en el usuario o alias +algo.
 * Devuelve la parte local "canónica" (sin puntos, sin +etiqueta) o null si no aplica.
 */
function gmailCanonicalLocalPart(emailNorm) {
  const at = emailNorm.lastIndexOf('@');
  if (at < 1) return null;
  const domain = emailNorm.slice(at + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return null;
  const local = emailNorm.slice(0, at);
  const beforePlus = local.split('+')[0];
  return beforePlus.replace(/\./g, '');
}

/** Se detecta al vuelo: si no ejecutaste database/schema_perfil_usuario.sql, el login sigue funcionando. */
let perfilColumnState = null;
let perfilColumnDetectPromise = null;
let perfilColumnFalseSince = 0;
const PERFIL_COLUMN_RETRY_MS = 2 * 60 * 1000;

async function hasPerfilCompletadoColumn() {
  if (perfilColumnState === true) {
    return true;
  }
  if (perfilColumnState === false) {
    if (Date.now() - perfilColumnFalseSince < PERFIL_COLUMN_RETRY_MS) {
      return false;
    }
    perfilColumnState = null;
    perfilColumnDetectPromise = null;
  }
  if (!perfilColumnDetectPromise) {
    perfilColumnDetectPromise = (async () => {
      try {
        await query('SELECT perfil_completado FROM usuarios LIMIT 0');
        perfilColumnState = true;
      } catch (e) {
        if (e.code === 'ER_BAD_FIELD_ERROR') {
          perfilColumnState = false;
          perfilColumnFalseSince = Date.now();
        } else {
          perfilColumnDetectPromise = null;
          throw e;
        }
      }
      return perfilColumnState;
    })();
  }
  return perfilColumnDetectPromise;
}

function invalidatePerfilColumnCache() {
  perfilColumnState = null;
  perfilColumnDetectPromise = null;
  perfilColumnFalseSince = 0;
}

function withDefaultPerfil(row, hasColumn) {
  if (!row) return null;
  if (!hasColumn) {
    // Sin columna perfil_completado: no forzar “completo” a usuarios Google sin teléfono (deben pasar por completar perfil).
    const hasPhone = row.telefono != null && String(row.telefono).trim() !== '';
    if (row.google_id && !hasPhone) {
      row.perfil_completado = 0;
    } else {
      row.perfil_completado = 1;
    }
  }
  return row;
}

const USER_FIELDS =
  'id, nombre, apellido, email, rol, activo, ultimo_acceso_at, ultimo_login_metodo, telefono, avatar, fecha_registro, google_id, pais';

/** Cuenta habilitada (tras migración schema_admin_fase0_fase1.sql). NULL/undefined activo se trata como activo por compatibilidad. */
function isAccountActive(row) {
  if (!row) return true;
  const a = row.activo;
  if (a === null || a === undefined) return true;
  return Number(a) === 1;
}

async function recordSuccessfulLogin(userId, metodo) {
  const m = metodo === 'google' ? 'google' : 'password';
  await query('UPDATE usuarios SET ultimo_acceso_at = NOW(), ultimo_login_metodo = ? WHERE id = ?', [m, userId]);
}

async function findById(id) {
  const has = await hasPerfilCompletadoColumn();
  const fields = has ? `${USER_FIELDS}, perfil_completado` : USER_FIELDS;
  const rows = await query(`SELECT ${fields} FROM usuarios WHERE id = ? LIMIT 1`, [id]);
  return withDefaultPerfil(rows[0] || null, has);
}

/** Solo para verificación interna (p. ej. confirmar contraseña antes de borrar). */
async function findCredentialsForVerification(id) {
  const rows = await query('SELECT id, passwordhash FROM usuarios WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByEmail(email) {
  const key = normalizeEmail(email);
  if (!key) return null;
  const has = await hasPerfilCompletadoColumn();
  const extra = has ? ', perfil_completado' : '';
  const baseSelect = `SELECT id, nombre, apellido, email, passwordhash, rol, activo, ultimo_acceso_at, ultimo_login_metodo, telefono, avatar, fecha_registro, google_id, pais${extra}
     FROM usuarios`;
  const rows = await query(`${baseSelect} WHERE LOWER(TRIM(email)) = ? LIMIT 1`, [key]);
  if (rows[0]) {
    return withDefaultPerfil(rows[0], has);
  }
  const canon = gmailCanonicalLocalPart(key);
  if (!canon) {
    return null;
  }
  const rowsGmail = await query(
    `${baseSelect}
     WHERE LOWER(TRIM(SUBSTRING_INDEX(email, '@', -1))) IN ('gmail.com', 'googlemail.com')
       AND REPLACE(
         SUBSTRING_INDEX(SUBSTRING_INDEX(LOWER(TRIM(email)), '+', 1), '@', 1),
         '.',
         ''
       ) = ?
     LIMIT 1`,
    [canon]
  );
  return withDefaultPerfil(rowsGmail[0] || null, has);
}

async function findByGoogleId(googleId) {
  const has = await hasPerfilCompletadoColumn();
  const fields = has ? `${USER_FIELDS}, perfil_completado` : USER_FIELDS;
  const rows = await query(`SELECT ${fields} FROM usuarios WHERE google_id = ? LIMIT 1`, [googleId]);
  return withDefaultPerfil(rows[0] || null, has);
}

async function createLocalUser({ nombre, apellido, email, password, pais, rol = 'usuario' }) {
  const emailNorm = normalizeEmail(email);
  const passwordhash = await bcrypt.hash(password, 10);
  const pool = getPool();
  const has = await hasPerfilCompletadoColumn();
  let insertId;
  if (has) {
    const [result] = await pool.execute(
      `INSERT INTO usuarios (nombre, apellido, email, passwordhash, rol, pais, perfil_completado)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [nombre, apellido || null, emailNorm, passwordhash, rol, pais || null]
    );
    insertId = result.insertId;
  } else {
    const [result] = await pool.execute(
      `INSERT INTO usuarios (nombre, apellido, email, passwordhash, rol, pais)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nombre, apellido || null, emailNorm, passwordhash, rol, pais || null]
    );
    insertId = result.insertId;
  }
  return findById(insertId);
}

async function createOAuthPlaceholderPassword() {
  return bcrypt.hash(`oauth:${Date.now()}:${Math.random()}`, 10);
}

async function upsertGoogleUser({ googleId, email, nombre, apellido, pais }) {
  const emailNorm = normalizeEmail(email);
  const byGoogle = await findByGoogleId(googleId);
  if (byGoogle) {
    await query(
      `UPDATE usuarios SET nombre = COALESCE(?, nombre), apellido = COALESCE(?, apellido), pais = COALESCE(?, pais)
       WHERE id = ?`,
      [nombre, apellido, pais, byGoogle.id]
    );
    return findById(byGoogle.id);
  }

  const byEmail = await findByEmail(emailNorm);
  if (byEmail) {
    await query(`UPDATE usuarios SET google_id = ? WHERE id = ?`, [googleId, byEmail.id]);
    await query(
      `UPDATE usuarios SET nombre = COALESCE(?, nombre), apellido = COALESCE(?, apellido), pais = COALESCE(?, pais)
       WHERE id = ?`,
      [nombre, apellido, pais, byEmail.id]
    );
    return findById(byEmail.id);
  }

  const passwordhash = await createOAuthPlaceholderPassword();
  const pool = getPool();
  const has = await hasPerfilCompletadoColumn();
  let insertId;
  if (has) {
    const [result] = await pool.execute(
      `INSERT INTO usuarios (nombre, apellido, email, passwordhash, rol, google_id, pais, perfil_completado)
       VALUES (?, ?, ?, ?, 'usuario', ?, ?, 0)`,
      [nombre, apellido || null, emailNorm, passwordhash, googleId, pais || null]
    );
    insertId = result.insertId;
  } else {
    const [result] = await pool.execute(
      `INSERT INTO usuarios (nombre, apellido, email, passwordhash, rol, google_id, pais)
       VALUES (?, ?, ?, ?, 'usuario', ?, ?)`,
      [nombre, apellido || null, emailNorm, passwordhash, googleId, pais || null]
    );
    insertId = result.insertId;
  }
  invalidatePerfilColumnCache();
  return findById(insertId);
}

async function verifyPassword(userRow, plain) {
  if (!userRow || !userRow.passwordhash) return false;
  return bcrypt.compare(plain, userRow.passwordhash);
}

/** Restablecer contraseña sin conocer la actual (p. ej. flujo por código por correo). */
async function resetPasswordWithPlain(userId, plainPassword) {
  const passwordhash = await bcrypt.hash(plainPassword, 10);
  const pool = getPool();
  const [result] = await pool.execute(`UPDATE usuarios SET passwordhash = ? WHERE id = ?`, [
    passwordhash,
    userId,
  ]);
  if (!result.affectedRows) {
    return null;
  }
  return findById(userId);
}

async function changePassword(userId, currentPlain, newPlain) {
  const credentials = await findCredentialsForVerification(userId);
  if (!credentials) {
    return { ok: false, reason: 'not_found' };
  }
  if (!credentials.passwordhash) {
    return { ok: false, reason: 'no_password_set' };
  }
  if (!(await verifyPassword(credentials, currentPlain))) {
    return { ok: false, reason: 'bad_current' };
  }
  const passwordhash = await bcrypt.hash(newPlain, 10);
  const pool = getPool();
  const [result] = await pool.execute(`UPDATE usuarios SET passwordhash = ? WHERE id = ?`, [passwordhash, userId]);
  if (!result.affectedRows) {
    return { ok: false, reason: 'not_found' };
  }
  return { ok: true };
}

/** Solo usuarios con perfil pendiente (p. ej. primer acceso con Google). */
async function setOauthLocalPassword(userId, plainPassword) {
  const passwordhash = await bcrypt.hash(plainPassword, 10);
  const pool = getPool();
  const has = await hasPerfilCompletadoColumn();
  if (!has) {
    const [result] = await pool.execute(`UPDATE usuarios SET passwordhash = ? WHERE id = ?`, [
      passwordhash,
      userId,
    ]);
    if (!result.affectedRows) return null;
    return findById(userId);
  }
  const [result] = await pool.execute(
    `UPDATE usuarios SET passwordhash = ? WHERE id = ? AND COALESCE(perfil_completado, 0) = 0`,
    [passwordhash, userId]
  );
  if (!result.affectedRows) return null;
  return findById(userId);
}

async function completeProfile(userId, { nombre, apellido, telefono, pais, password }) {
  const has = await hasPerfilCompletadoColumn();
  const passwordhash = await bcrypt.hash(password, 10);
  const pool = getPool();
  if (!has) {
    const [result] = await pool.execute(
      `UPDATE usuarios
       SET nombre = ?, apellido = ?, telefono = ?, pais = ?, passwordhash = ?
       WHERE id = ?`,
      [nombre, apellido || null, telefono, pais || null, passwordhash, userId]
    );
    if (!result.affectedRows) {
      return null;
    }
    return findById(userId);
  }
  const [result] = await pool.execute(
    `UPDATE usuarios
     SET nombre = ?, apellido = ?, telefono = ?, pais = ?, passwordhash = ?, perfil_completado = 1
     WHERE id = ? AND COALESCE(perfil_completado, 0) = 0`,
    [nombre, apellido || null, telefono, pais || null, passwordhash, userId]
  );
  if (!result.affectedRows) {
    return null;
  }
  return findById(userId);
}

async function updateProfile(userId, { nombre, apellido, telefono, pais }) {
  const pool = getPool();
  await pool.execute(
    `UPDATE usuarios SET nombre = ?, apellido = ?, telefono = ?, pais = ? WHERE id = ?`,
    [nombre, apellido || null, telefono || null, pais || null, userId]
  );
  return findById(userId);
}

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    apellido: row.apellido,
    email: row.email,
    rol: row.rol,
    telefono: row.telefono,
    avatar: row.avatar,
    fecha_registro: row.fecha_registro,
    pais: row.pais,
  };
}

module.exports = {
  normalizeEmail,
  findById,
  findCredentialsForVerification,
  findByEmail,
  findByGoogleId,
  createLocalUser,
  upsertGoogleUser,
  verifyPassword,
  resetPasswordWithPlain,
  changePassword,
  setOauthLocalPassword,
  completeProfile,
  updateProfile,
  toPublicUser,
  hasPerfilCompletadoColumn,
  isAccountActive,
  recordSuccessfulLogin,
};
