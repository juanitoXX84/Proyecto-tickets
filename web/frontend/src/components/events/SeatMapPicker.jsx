import { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import { apiFetch } from '../../services/api.js';
import { describeZonaPresentation } from '../../utils/zonaPresentation.js';
import styles from './SeatMapPicker.module.css';

function sortFilas(rows) {
  const key = (f) => {
    let n = 0;
    const s = String(f || '').toUpperCase();
    for (let i = 0; i < s.length; i += 1) {
      n = n * 26 + (s.charCodeAt(i) - 64);
    }
    return n;
  };
  return [...new Set(rows)].sort((a, b) => key(a) - key(b));
}

export function SeatMapPicker({ zonaId, zona, unitPrice, onSelectionChange, selectionDisabled = false }) {
  const [asientos, setAsientos] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const reload = useCallback(async () => {
    if (!zonaId) return;
    setLoading(true);
    setLoadErr(null);
    try {
      const data = await apiFetch(`/api/seats/${zonaId}`);
      setAsientos(Array.isArray(data.asientos) ? data.asientos : []);
    } catch (e) {
      setLoadErr(e.message || 'No se pudo cargar el mapa');
      setAsientos([]);
    } finally {
      setLoading(false);
    }
  }, [zonaId]);

  useEffect(() => {
    setSelectedIds(new Set());
    reload();
  }, [zonaId, reload]);

  useEffect(() => {
    if (typeof onSelectionChange === 'function') {
      onSelectionChange([...selectedIds]);
    }
  }, [selectedIds, onSelectionChange]);

  const { filasOrden, colsOrden, seatMap } = useMemo(() => {
    const map = new Map();
    for (const a of asientos) {
      map.set(`${a.fila}:${a.columna}`, a);
    }
    const filas = sortFilas(asientos.map((a) => a.fila));
    const cols = [...new Set(asientos.map((a) => Number(a.columna)))].sort((x, y) => x - y);
    return { filasOrden: filas, colsOrden: cols, seatMap: map };
  }, [asientos]);

  function toggleSeat(a) {
    if (selectionDisabled || !a || a.estado !== 'available') return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(a.id)) next.delete(a.id);
      else next.add(a.id);
      return next;
    });
  }

  const selectedList = useMemo(() => {
    const byId = new Map(asientos.map((x) => [x.id, x]));
    return [...selectedIds]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort(
        (a, b) =>
          String(a.fila).localeCompare(String(b.fila), 'es') || Number(a.columna) - Number(b.columna)
      );
  }, [selectedIds, asientos]);

  const total = Math.round(Number(unitPrice || 0) * selectedList.length * 100) / 100;

  const presentation = useMemo(
    () => describeZonaPresentation(zona ?? { nombre_seccion: 'GENERAL', descripcion_zona: '' }),
    [zona]
  );

  const gridCols = colsOrden.length || 1;

  if (!zonaId) return null;

  if (loading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.muted}>Cargando mapa de asientos…</p>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className={styles.wrap}>
        <p className={styles.err}>{loadErr}</p>
      </div>
    );
  }

  if (asientos.length === 0) {
    return (
      <div className={styles.wrap}>
        <p className={styles.muted}>No hay asientos configurados para esta zona.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h3 className={styles.title}>Mapa interactivo de la zona</h3>
      <p className={styles.lead}>
        {selectionDisabled
          ? 'Consulta del mapa (la venta no está abierta; no puedes seleccionar asientos). Disponible con el tono de esta categoría; ocupado con ✕; en proceso de pago en violeta; tu selección en azul.'
          : 'Los disponibles usan el color de esta categoría. Ocupados muestran ✕; “en pago” en violeta; tu selección en azul.'}
      </p>
      <div className={styles.legend}>
        <span>
          <span
            className={styles.dot}
            style={{ backgroundColor: presentation.accentColor }}
            aria-hidden
          />{' '}
          Disponible
        </span>
        <span>
          <span className={styles.legendX} aria-hidden>
            ×
          </span>{' '}
          Ocupado
        </span>
        <span>
          <span className={`${styles.dot} ${styles.dotHeld}`} /> En pago
        </span>
        <span>
          <span className={`${styles.dot} ${styles.dotSel}`} /> Tu selección
        </span>
      </div>

      <div className={styles.stage}>PANTALLA / ESCENARIO</div>

      <div
        className={styles.gridWrap}
        style={{
          gridTemplateColumns: `36px repeat(${gridCols}, minmax(38px, 1fr))`,
        }}
      >
        <div className={styles.corner} aria-hidden />
        {colsOrden.map((c) => (
          <div key={`h-${c}`} className={styles.colHead}>
            {c}
          </div>
        ))}
        {filasOrden.map((fila) => (
          <Fragment key={fila}>
            <div className={styles.rowHead}>{fila}</div>
            {colsOrden.map((col) => {
              const a = seatMap.get(`${fila}:${col}`);
              if (!a) {
                return (
                  <div key={`${fila}-${col}-empty`} className={styles.cellMuted}>
                    —
                  </div>
                );
              }
              const sel = selectedIds.has(a.id);
              let cls = styles.seatAvail;
              if (a.estado === 'sold') cls = styles.seatSold;
              else if (a.estado === 'held') cls = styles.seatHeld;
              else if (sel) cls = styles.seatSel;
              const availStyle =
                cls === styles.seatAvail
                  ? {
                      backgroundColor: presentation.softColor,
                      border: `2px solid ${presentation.accentColor}`,
                      color: '#0f172a',
                    }
                  : undefined;
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={selectionDisabled || a.estado !== 'available'}
                  className={`${styles.seat} ${cls}`}
                  style={availStyle}
                  onClick={() => toggleSeat(a)}
                  title={
                    selectionDisabled
                      ? 'Venta cerrada'
                      : a.estado === 'sold'
                        ? 'Ocupado'
                        : a.estado === 'held'
                          ? 'En proceso de pago'
                          : sel
                            ? 'Quitar'
                            : 'Elegir'
                  }
                >
                  {a.estado === 'sold' ? '×' : col}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className={styles.selection}>
        <h4 className={styles.selTitle}>Selección</h4>
        {selectedList.length === 0 ? (
          <p className={styles.muted}>
            {selectionDisabled
              ? 'Cuando la venta esté abierta podrás elegir asientos disponibles aquí.'
              : 'Toca los asientos disponibles en el mapa para añadirlos.'}
          </p>
        ) : (
          <ul className={styles.selList}>
            {selectedList.map((a) => (
              <li key={a.id}>
                Fila {a.fila}, asiento {a.columna}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.total}>
          <strong>
            Total: ${total.toFixed(2)} MXN
            {selectedList.length > 0 && (
              <span className={styles.totalSub}>
                {' '}
                ({selectedList.length} × ${Number(unitPrice || 0).toFixed(2)})
              </span>
            )}
          </strong>
        </p>
      </div>
    </div>
  );
}
