const userModel = require('../models/userModel');

/**
 * Tras Google, hasta completar datos obligatorios no se permite comprar ni ver historial de compras.
 */
async function requireProfileComplete(req, res, next) {
  try {
    const row = await userModel.findById(Number(req.user.id));
    if (!row) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida' });
    }
    if (Number(row.perfil_completado) === 0) {
      return res.status(403).json({
        ok: false,
        error: 'Completa tu perfil para usar esta función',
        code: 'PERFIL_INCOMPLETO',
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireProfileComplete };
