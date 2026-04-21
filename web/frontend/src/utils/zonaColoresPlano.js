/** Colores para identificar zonas en el plano (sin depender de un módulo de recintos). */

export const PALETA_COLORES_PLANO = [
  { hex: '#2563eb', label: 'Azul' },
  { hex: '#dc2626', label: 'Rojo' },
  { hex: '#16a34a', label: 'Verde' },
  { hex: '#ca8a04', label: 'Amarillo' },
  { hex: '#9333ea', label: 'Violeta' },
  { hex: '#ea580c', label: 'Naranja' },
  { hex: '#0891b2', label: 'Cian' },
  { hex: '#db2777', label: 'Rosa' },
  { hex: '#4f46e5', label: 'Índigo' },
  { hex: '#65a30d', label: 'Lima' },
  { hex: '#0d9488', label: 'Turquesa' },
  { hex: '#c026d3', label: 'Fucsia' },
];

/**
 * @param {unknown} input
 * @returns {string} `#rrggbb` en minúsculas o cadena vacía si no es un hex válido
 */
export function normalizePlanoColorHex(input) {
  if (input == null) return '';
  const s = String(input).trim();
  if (!s) return '';
  const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return '';
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return `#${h.toLowerCase()}`;
}

/**
 * @param {string} hex
 * @returns {string} etiqueta amigable o el hex normalizado si no está en la paleta
 */
export function labelForPlanoColorHex(hex) {
  const n = normalizePlanoColorHex(hex);
  if (!n) return '';
  const found = PALETA_COLORES_PLANO.find((p) => p.hex.toLowerCase() === n);
  return found ? found.label : n;
}

/**
 * @param {unknown[]} usedRaw colores ya asignados (pueden ser vacíos o repetidos)
 * @returns {string} primer hex de la paleta que no esté en uso
 */
export function firstFreePlanoColor(usedRaw) {
  const used = new Set(
    (usedRaw || [])
      .map((c) => normalizePlanoColorHex(c))
      .filter(Boolean)
      .map((c) => c.toLowerCase())
  );
  for (const p of PALETA_COLORES_PLANO) {
    if (!used.has(p.hex.toLowerCase())) return p.hex;
  }
  return PALETA_COLORES_PLANO[0].hex;
}

/**
 * @param {unknown[]} zonas
 * @param {(z: unknown) => unknown} getColor
 * @returns {{ error?: string }}
 */
export function validateZonasColoresUnicos(zonas, getColor) {
  const seen = new Set();
  for (const z of zonas) {
    const hex = normalizePlanoColorHex(getColor(z));
    if (!hex) continue;
    const key = hex.toLowerCase();
    if (seen.has(key)) {
      return {
        error:
          'Dos zonas no pueden usar el mismo color en el plano. Elige un color distinto para cada zona.',
      };
    }
    seen.add(key);
  }
  return {};
}
