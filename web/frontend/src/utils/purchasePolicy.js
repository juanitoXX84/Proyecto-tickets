/** Misma regla que en el backend (admin y organizador no compran; solo gestionan). */
export function canPurchaseEventAsCustomer(user, eventRow) {
  if (!user || !eventRow) return false;
  if (user.rol === 'admin' || user.rol === 'organizador') return false;
  return true;
}
