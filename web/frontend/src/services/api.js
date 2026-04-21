/**
 * Cliente HTTP del front.
 *
 * Seguridad / consola del navegador (F12):
 * - Cualquier dato que la app legítima pueda ver (token, respuestas de /api para TU sesión),
 *   el mismo usuario puede leerlo desde la consola o la pestaña Red. Eso no es un fallo del
 *   servidor: es su propio navegador.
 * - Lo que SÍ debe garantizar el backend: no servir datos de otros usuarios ni operaciones
 *   admin sin JWT válido y comprobación de rol en cada ruta (autorización en servidor).
 * - El riesgo principal con token en localStorage es XSS (inyección de script); por eso no hay
 *   secretos de API en el bundle y conviene no loguear tokens ni respuestas sensibles.
 */
const TOKEN_KEY = 'tr_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const method = String(options.method || 'GET').toUpperCase();
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const fetchOptions = {
    credentials: 'include',
    ...options,
    headers,
  };
  // Evita UI obsoleta al volver desde redirects externos (ej. Mercado Pago).
  if (method === 'GET' && fetchOptions.cache == null) {
    fetchOptions.cache = 'no-store';
  }
  const res = await fetch(path, fetchOptions);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { ok: false, error: text || 'Respuesta inválida' };
  }
  if (!res.ok) {
    let message = data?.error || res.statusText;
    if (
      res.status === 500 &&
      (!message || message === 'Internal Server Error' || message === 'Request failed')
    ) {
      message =
        'Error del servidor. Abre la terminal donde corre el backend (npm run dev) y revisa el mensaje de error allí.';
    }
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function uploadOrganizerEventImage(file) {
  const fd = new FormData();
  fd.append('imagen', file);
  return apiFetch('/api/organizer/events/upload-image', { method: 'POST', body: fd });
}
