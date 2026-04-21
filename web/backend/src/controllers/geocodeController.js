const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';

/**
 * Proxy de búsqueda Nominatim (OpenStreetMap).
 * Política de uso: https://operations.osmfoundation.org/policies/nominatim/
 */
async function search(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) {
      return res.status(400).json({ ok: false, error: 'Escribe al menos 3 caracteres' });
    }
    if (q.length > 280) {
      return res.status(400).json({ ok: false, error: 'Consulta demasiado larga' });
    }

    const url = new URL(NOMINATIM_SEARCH);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '8');
    url.searchParams.set('q', q);
    url.searchParams.set('addressdetails', '1');

    const r = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'TicketRivals/1.0 (https://github.com; academic event-ticketing demo)',
        'Accept-Language': 'es,en',
      },
    });

    if (!r.ok) {
      return res.status(502).json({ ok: false, error: 'El servicio de mapas no respondió' });
    }

    const rows = await r.json();
    if (!Array.isArray(rows)) {
      return res.json({ ok: true, resultados: [] });
    }

    const resultados = rows
      .map((row) => {
        const lat = parseFloat(row.lat);
        const lon = parseFloat(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const url_mapa = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=18`;
        const nombre =
          row.name || (typeof row.display_name === 'string' ? row.display_name.split(',')[0].trim() : null);
        return {
          etiqueta: row.display_name || `${lat}, ${lon}`,
          lat,
          lon,
          url_mapa,
          nombre,
        };
      })
      .filter(Boolean);

    return res.json({ ok: true, resultados });
  } catch (err) {
    return next(err);
  }
}

module.exports = { search };
