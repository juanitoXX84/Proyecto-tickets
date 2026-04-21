const { verifyAccessToken } = require('../utils/jwt');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  const token = header.slice(7);
  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.sub,
      rol: decoded.rol,
      email: decoded.email,
    };
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ ok: false, error: 'Autenticación requerida' });
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'Autenticación requerida' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }
    return next();
  };
}

module.exports = { authenticate, requireAuth, requireRole };
