/**
 * Roles que pueden comprar como cliente (no admin ni organizador).
 * `pruebas`: mismo flujo de compra que `usuario`, pero con extras controlados (ej. pago demo sin cargo).
 */
function canActAsBuyer(user) {
  if (!user) return false;
  const r = String(user.rol || '').trim();
  return r === 'usuario' || r === 'pruebas';
}

function isPruebasRole(user) {
  return Boolean(user && String(user.rol || '').trim() === 'pruebas');
}

module.exports = { canActAsBuyer, isPruebasRole };
