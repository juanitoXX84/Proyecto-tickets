import { PALETA_COLORES_PLANO, normalizePlanoColorHex } from '../../utils/zonaColoresPlano.js';
import { describeZonaPresentation } from '../../utils/zonaPresentation.js';
import styles from './EventZonaPlanoViewer.module.css';

function zonaHex(z, index) {
  return normalizePlanoColorHex(z.color_plano) || PALETA_COLORES_PLANO[index % PALETA_COLORES_PLANO.length].hex;
}

/** @param {unknown} v */
function coordToPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 1) return n * 100;
  return Math.min(100, Math.max(0, n));
}

/**
 * Plano estático del recinto con pins por zona (pos_x / pos_y en % sobre la imagen).
 *
 * @param {{
 *   imageUrl: string;
 *   zonas: Array<Record<string, unknown>>;
 *   disponiblesEnZona: (z: Record<string, unknown>) => number;
 *   selectedZonaId?: string | number | null;
 *   onPinSelect?: (id: string | number | null) => void;
 * }} props
 */
export function EventZonaPlanoViewer({
  imageUrl,
  zonas,
  disponiblesEnZona,
  selectedZonaId,
  onPinSelect,
}) {
  const list = Array.isArray(zonas) ? zonas : [];
  const interactive = typeof onPinSelect === 'function';
  const keyForCoord = (x, y) => `${Math.round(x * 10) / 10}|${Math.round(y * 10) / 10}`;
  const groups = new Map();
  for (const z of list) {
    const left = coordToPercent(z.pos_x);
    const top = coordToPercent(z.pos_y);
    if (left == null || top == null) continue;
    const k = keyForCoord(left, top);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(z.id);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.frame}>
        <img src={imageUrl} alt="" className={styles.img} decoding="async" />
        {list.map((z, i) => {
          const left = coordToPercent(z.pos_x);
          const top = coordToPercent(z.pos_y);
          if (left == null || top == null) return null;
          const libres = disponiblesEnZona(z);
          const agotada = libres <= 0;
          const hex = zonaHex(z, i);
          const sel = selectedZonaId != null && String(z.id) === String(selectedZonaId);
          const title = `${z.nombre_seccion || 'Zona'}${agotada ? ' (agotada)' : ''}`;
          const k = keyForCoord(left, top);
          const peers = groups.get(k) || [];
          const idx = Math.max(0, peers.findIndex((pid) => String(pid) === String(z.id)));
          const dupCount = peers.length;
          const radius = dupCount > 1 ? Math.min(14, 6 + dupCount * 1.4) : 0;
          const angle = dupCount > 1 ? (idx / dupCount) * Math.PI * 2 : 0;
          const dx = dupCount > 1 ? Math.cos(angle) * radius : 0;
          const dy = dupCount > 1 ? Math.sin(angle) * radius : 0;
          const zp = describeZonaPresentation(z);

          const cls = [
            styles.pin,
            agotada ? styles.pinAgotada : '',
            sel ? styles.pinSel : '',
            interactive && !agotada ? styles.pinInteractive : '',
          ]
            .filter(Boolean)
            .join(' ');

          const inner = (
            <>
              <span className={styles.pinDot} style={{ backgroundColor: hex }} aria-hidden />
              <span className={styles.pinStem} style={{ borderTopColor: hex }} aria-hidden />
            </>
          );

          if (interactive && !agotada) {
            return (
              <button
                key={z.id ?? `${i}-${hex}`}
                type="button"
                className={cls}
                style={{ left: `calc(${left}% + ${dx}px)`, top: `calc(${top}% + ${dy}px)` }}
                title={title}
                aria-label={`Elegir zona ${z.nombre_seccion || ''}`}
                aria-pressed={sel}
                onClick={() => onPinSelect(z.id)}
              >
                {inner}
                <span className={styles.pinTag} style={{ borderColor: zp.accentColor }}>{zp.shortLabel}</span>
              </button>
            );
          }

          return (
            <div
              key={z.id ?? `${i}-${hex}`}
              className={cls}
              style={{ left: `calc(${left}% + ${dx}px)`, top: `calc(${top}% + ${dy}px)` }}
              title={title}
              role="img"
              aria-label={title}
            >
              {inner}
              <span className={styles.pinTag} style={{ borderColor: zp.accentColor }}>{zp.shortLabel}</span>
            </div>
          );
        })}
      </div>
      <p className={styles.hint}>
        {interactive
          ? 'Toca un pin del mismo color que la zona en la lista para seleccionarla.'
          : 'Los pins indican la ubicación aproximada de cada zona en el plano.'}
      </p>
    </div>
  );
}
