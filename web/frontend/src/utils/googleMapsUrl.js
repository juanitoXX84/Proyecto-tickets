/**
 * Limpia y añade https:// si el organizador pegó el enlace sin protocolo (muy habitual).
 */
export function normalizeMapUrl(raw) {
  if (raw == null) return '';
  let s = String(raw)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (!s || s.length > 1024) return '';
  if (s.startsWith('//')) {
    s = `https:${s}`;
  }
  if (!/^https?:\/\//i.test(s)) {
    if (/^(maps\.google\.|www\.google\.|google\.|[\w-]+\.google\.|goo\.gl|maps\.app\.goo\.gl|g\.page)/i.test(s)) {
      s = `https://${s.replace(/^\/+/, '')}`;
    }
  }
  return s;
}

function parseUrlLenient(s) {
  try {
    return new URL(s);
  } catch {
    try {
      return new URL(`https://${String(s).replace(/^\/+/, '')}`);
    } catch {
      return null;
    }
  }
}

/** Misma lógica que el backend, con URLs más permisivas tras normalizar. */
export function isGoogleMapsUrl(raw, depth = 0) {
  if (depth > 4) return false;
  if (raw == null) return false;
  const s = normalizeMapUrl(raw);
  if (!s || s.length > 512) return false;
  const u = parseUrlLenient(s);
  if (!u) return false;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  const full = u.href.toLowerCase();

  if ((h === 'www.google.com' || h === 'google.com') && (path === '/url' || path.startsWith('/url'))) {
    const inner = u.searchParams.get('q') || u.searchParams.get('url');
    if (inner && inner !== s) return isGoogleMapsUrl(inner, depth + 1);
  }

  if (h === 'maps.app.goo.gl' || h.endsWith('.goo.gl') || h === 'goo.gl') return true;
  if (h === 'g.page' || h.endsWith('.g.page')) return true;
  if (h.startsWith('maps.google.')) return true;
  if (h.includes('google.') && (path.startsWith('/maps') || path.includes('/maps/') || full.includes('/maps'))) return true;
  // Algunos enlaces móviles usan solo query (?q=...&map_action=...)
  if (h.includes('google.') && (full.includes('map_action') || full.includes('maps.google'))) return true;

  return false;
}

/**
 * Para la ficha pública: mostrar botón si hay URL https guardada y parece Maps/Google (el guardado ya validó en servidor).
 */
export function shouldShowPublicMapsLink(raw) {
  const s = normalizeMapUrl(raw);
  if (!s) return false;
  if (/^javascript:/i.test(s)) return false;
  if (isGoogleMapsUrl(s)) return true;
  const u = parseUrlLenient(s);
  if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) return false;
  const h = u.hostname.toLowerCase();
  const href = u.href.toLowerCase();
  if (/goo\.gl|g\.page|maps\.app|google\.[\w.]+/.test(h) && (href.includes('map') || href.includes('/maps'))) return true;
  return false;
}

/**
 * Lee url_mapa del objeto evento venga como venga la clave (API / driver MySQL).
 */
export function pickEventMapUrl(ev) {
  if (!ev || typeof ev !== 'object') return '';
  const v = ev.url_mapa ?? ev.URL_MAPA ?? ev.Url_Mapa ?? ev.urlMapa;
  if (v == null) return '';
  return String(v).trim();
}

/**
 * Ficha pública / checkout: mostrar botón si hay URL guardada y normalizada a https.
 * El organizador solo puede guardar enlaces válidos de Maps vía API; aquí evitamos falsos negativos del parser.
 */
export function shouldRenderMapsLinkButton(mapRaw, mapHref) {
  const raw = String(mapRaw || '').trim();
  const href = String(mapHref || '').trim();
  return Boolean(raw && href && /^https?:\/\//i.test(href) && !/^javascript:/i.test(href));
}
