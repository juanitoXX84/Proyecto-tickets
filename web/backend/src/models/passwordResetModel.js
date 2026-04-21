const crypto = require('crypto');
const { getPool } = require('../config/database');

/** mysql2 puede devolver `usuarios.id` como BigInt; los placeholders deben ser número. */
function sqlUserId(userId) {
  if (typeof userId === 'bigint') return Number(userId);
  return Number(userId);
}

function resetSecret() {
  return (
    process.env.JWT_SECRET?.trim() ||
    process.env.PASSWORD_RESET_SECRET?.trim() ||
    'dev-only-password-reset-change-me'
  );
}

function hashCode(plainCode) {
  return crypto.createHmac('sha256', resetSecret()).update(String(plainCode).trim()).digest('hex');
}

/** HMAC-SHA256 → 32 bytes = 64 caracteres hex */
function codesMatch(storedHash, plainCode) {
  const computed = hashCode(plainCode);
  try {
    const ba = Buffer.from(String(storedHash), 'hex');
    const bb = Buffer.from(String(computed), 'hex');
    if (ba.length !== bb.length || ba.length !== 32) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Sustituye cualquier código previo del usuario. `plainCode` solo existe en memoria.
 */
async function replaceCodeForUser(userId, plainCode) {
  const pool = getPool();
  const uid = sqlUserId(userId);
  const codeHash = hashCode(plainCode);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await pool.execute(`DELETE FROM password_reset_codes WHERE user_id = ?`, [uid]);
  await pool.execute(
    `INSERT INTO password_reset_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)`,
    [uid, codeHash, expiresAt]
  );
}

/**
 * Comprueba el código y lo elimina si es correcto y no ha expirado.
 */
async function verifyAndConsume(userId, plainCode) {
  const pool = getPool();
  const uid = sqlUserId(userId);
  const [rows] = await pool.execute(
    `SELECT code_hash FROM password_reset_codes WHERE user_id = ? AND expires_at > NOW() LIMIT 1`,
    [uid]
  );
  if (!rows.length) return false;
  if (!codesMatch(rows[0].code_hash, plainCode)) return false;
  await pool.execute(`DELETE FROM password_reset_codes WHERE user_id = ?`, [uid]);
  return true;
}

/** Si falla el envío del correo, quitar el código para que el usuario pueda pedir otro. */
async function deleteAllForUser(userId) {
  const pool = getPool();
  await pool.execute(`DELETE FROM password_reset_codes WHERE user_id = ?`, [sqlUserId(userId)]);
}

module.exports = {
  replaceCodeForUser,
  verifyAndConsume,
  deleteAllForUser,
};
