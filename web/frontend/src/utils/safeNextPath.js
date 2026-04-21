/**
 * Evita redirección abierta tras login (?next=https://sitio-malicioso.com).
 * Solo rutas relativas internas que empiecen por un solo "/".
 */
export function safeNextPath(raw) {
  if (raw == null || typeof raw !== 'string') return '/';
  const t = raw.trim();
  if (!t.startsWith('/') || t.startsWith('//')) return '/';
  return t;
}
