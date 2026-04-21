/**
 * IDs numéricos positivos en rutas (evita NaN y coerciones raras).
 */
function parsePositiveIntParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return null;
  }
  return n;
}

module.exports = { parsePositiveIntParam };
