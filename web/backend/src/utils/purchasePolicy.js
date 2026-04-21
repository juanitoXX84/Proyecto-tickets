const { canActAsBuyer } = require('./roles');

/**
 * Regla de negocio: administradores y organizadores no compran boletos (solo gestión).
 * `usuario` y `pruebas` sí pueden comprar.
 */
function canPurchaseEventAsCustomer(user, eventRow) {
  if (!user || !eventRow) return false;
  return canActAsBuyer(user);
}

module.exports = { canPurchaseEventAsCustomer };
