const jwt = require('jsonwebtoken');

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim()) {
    throw new Error('JWT_SECRET no está definido');
  }
  return String(secret).trim();
}

function signAccessToken(payload) {
  return jwt.sign(payload, jwtSecret(), { expiresIn: '7d' });
}

function verifyAccessToken(token) {
  return jwt.verify(token, jwtSecret());
}

/** Tras validar el código por correo; permite completar el cambio de contraseña (15 min). */
function signPasswordResetToken(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('userId inválido');
  }
  return jwt.sign({ sub: id, typ: 'pwd-reset' }, jwtSecret(), { expiresIn: '15m' });
}

function verifyPasswordResetToken(token) {
  const payload = jwt.verify(String(token).trim(), jwtSecret());
  if (payload.typ !== 'pwd-reset') {
    throw new jwt.JsonWebTokenError('token no es de recuperación');
  }
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id < 1) {
    throw new jwt.JsonWebTokenError('sub inválido');
  }
  return id;
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
};
