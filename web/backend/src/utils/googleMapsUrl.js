function normalizeMapUrl(raw) {
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

/**
 * Valida que la URL sea un enlace de Google Maps (compartir ubicación, dirección, etc.).
 */
function isGoogleMapsUrl(raw, depth = 0) {
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

  // Redirección tipo https://www.google.com/url?q=https%3A%2F%2Fmaps...
  if ((h === 'www.google.com' || h === 'google.com') && (path === '/url' || path.startsWith('/url'))) {
    const inner = u.searchParams.get('q') || u.searchParams.get('url');
    if (inner && inner !== s) return isGoogleMapsUrl(inner, depth + 1);
  }

  if (h === 'maps.app.goo.gl' || h.endsWith('.goo.gl') || h === 'goo.gl') return true;
  if (h === 'g.page' || h.endsWith('.g.page')) return true;
  if (h.startsWith('maps.google.')) return true;
  if (h.includes('google.') && (path.startsWith('/maps') || path.includes('/maps/') || full.includes('/maps'))) return true;
  if (h.includes('google.') && (full.includes('map_action') || full.includes('maps.google'))) return true;

  return false;
}

module.exports = { isGoogleMapsUrl, normalizeMapUrl };
