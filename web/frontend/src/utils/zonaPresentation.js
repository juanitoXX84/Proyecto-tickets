function normalizeText(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

export function inferZonaType(rawName, rawDesc) {
  const n = normalizeText(rawName);
  const d = normalizeText(rawDesc);
  const src = `${n} ${d}`;
  if (/\bVIP\b|\bPREFERENTE\b|\bPLATINO\b|\bPREMIUM\b/.test(src)) return 'vip';
  if (/\bGRADAS\b|\bGRADA\b|\bGRADERIO\b|\bTRIBUNA\b/.test(src)) return 'gradas';
  if (/\bGENERAL\b|\bGA\b|\bADMISION GENERAL\b/.test(src)) return 'general';
  return 'otro';
}

export function splitZonaName(rawName) {
  const raw = String(rawName || '').trim();
  if (!raw) return { base: '', detail: '' };
  const parts = raw.split(/\s*[·|-]\s*/).map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 1) return { base: raw, detail: '' };
  return { base: parts[0], detail: parts.slice(1).join(' · ') };
}

export function composeZonaName(tipoZona, nombreOtro, etiqueta) {
  const tipo = String(tipoZona || '').trim();
  const other = String(nombreOtro || '').trim();
  const extra = String(etiqueta || '').trim();
  const base = tipo === 'otro' ? other : tipo;
  if (!extra) return base;
  return `${base} · ${extra}`;
}

function styleByType(type) {
  if (type === 'vip')
    return { label: 'VIP', short: 'VIP', dot: '#B91C1C', soft: '#FEE2E2' };
  if (type === 'gradas')
    return { label: 'GRADAS', short: 'GRA', dot: '#047857', soft: '#A7F3D0' };
  if (type === 'general')
    return { label: 'GENERAL', short: 'GEN', dot: '#0F766E', soft: '#CCFBF1' };
  return { label: 'SECCION', short: 'SEC', dot: '#B45309', soft: '#FEF3C7' };
}

export function describeZonaPresentation(zona) {
  const rawName = String(zona?.nombre_seccion || '').trim();
  const rawDesc = String(zona?.descripcion_zona || '').trim();
  const split = splitZonaName(rawName);
  const type = inferZonaType(split.base || rawName, rawDesc);
  const style = styleByType(type);
  return {
    type,
    typeLabel: style.label,
    shortLabel: style.short,
    accentColor: style.dot,
    softColor: style.soft,
    displayName: split.base || rawName,
    variantLabel: split.detail || '',
  };
}

