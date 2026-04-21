/** Normaliza hex `#rgb` / `#rrggbb` para colores de zona en el plano (sin catálogo de recintos). */

function normalizePlanoColor(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return `#${h.toLowerCase()}`;
}

function ensureUniqueZonaPlanoColors(zonas) {
  const seen = new Set();
  for (const z of zonas) {
    const c = normalizePlanoColor(z.color_plano);
    if (!c) continue;
    const key = c.toLowerCase();
    if (seen.has(key)) {
      return {
        error: 'Dos zonas no pueden usar el mismo color en el plano. Elige un color distinto para cada zona.',
      };
    }
    seen.add(key);
  }
  return {};
}

module.exports = { normalizePlanoColor, ensureUniqueZonaPlanoColors };
