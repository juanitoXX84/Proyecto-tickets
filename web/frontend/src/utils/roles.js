/** Comprador normal o cuenta de demostración (mismas pantallas de compra). */
export function isBuyerLikeRole(rol) {
  const r = String(rol || '').trim();
  return r === 'usuario' || r === 'pruebas';
}

export function isPruebasRole(rol) {
  return String(rol || '').trim() === 'pruebas';
}
