import { Fragment, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../services/api.js';
import { describeZonaPresentation } from '../../utils/zonaPresentation.js';
import styles from './UnifiedSeatMapPicker.module.css';

function sortFilas(rows) {
  const key = (f) => {
    let n = 0;
    const s = String(f || '').toUpperCase();
    for (let i = 0; i < s.length; i += 1) n = n * 26 + (s.charCodeAt(i) - 64);
    return n;
  };
  return [...new Set(rows)].sort((a, b) => key(a) - key(b));
}

export function UnifiedSeatMapPicker({
  eventId,
  zonas,
  selectionDisabled = false,
  onSelectionChange,
  /**
   * Zona de tarifa activa (botón GENERAL/VIP pulsado arriba). Solo se pueden **añadir**
   * asientos de ese tipo; la selección ya hecha de otros tipos se conserva al cambiar de botón.
   */
  activeTariffZonaId = null,
}) {
  const zonasArr = Array.isArray(zonas) ? zonas.filter((z) => z?.id != null) : [];
  const [unifiedSeats, setUnifiedSeats] = useState([]);
  const [unifiedZonas, setUnifiedZonas] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [selectionWarn, setSelectionWarn] = useState(null);

  const idsKey = useMemo(
    () => zonasArr.map((z) => String(z.id)).sort((a, b) => a.localeCompare(b)).join(','),
    [zonasArr]
  );

  const zonaById = useMemo(
    () => new Map((unifiedZonas.length ? unifiedZonas : zonasArr).map((z) => [String(z.id), z])),
    [zonasArr, unifiedZonas]
  );

  useEffect(() => {
    setSelectedKeys(new Set());
    setSelectionWarn(null);
    if (!zonasArr.length || !eventId) {
      setUnifiedSeats([]);
      setUnifiedZonas([]);
      setLoading(false);
      setLoadErr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadErr(null);
      try {
        const data = await apiFetch(`/api/seats/event/${eventId}/unified`);
        if (!cancelled) {
          setUnifiedSeats(Array.isArray(data.asientos) ? data.asientos : []);
          setUnifiedZonas(Array.isArray(data.zonas) ? data.zonas : []);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e.message || 'No se pudo cargar el mapa unificado');
          setUnifiedSeats([]);
          setUnifiedZonas([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey, eventId]);

  const { filasOrden, colsOrden, seatByCoord } = useMemo(() => {
    const rows = [];
    const cols = [];
    const byCoord = new Map();
    for (const a of unifiedSeats) {
      byCoord.set(`${a.fila}:${a.columna}`, a);
      rows.push(a.fila);
      cols.push(Number(a.columna));
    }
    const rowsSorted = sortFilas(rows);
    const colsSorted = [...new Set(cols)].sort((a, b) => a - b);
    return { filasOrden: rowsSorted, colsOrden: colsSorted, seatByCoord: byCoord };
  }, [unifiedSeats]);

  const selectedZoneFromKeys = useMemo(() => {
    const first = [...selectedKeys][0];
    if (!first) return null;
    return String(first).split(':')[0] || null;
  }, [selectedKeys]);

  const tariffIdsInSelection = useMemo(() => {
    const ids = new Set();
    for (const key of selectedKeys) {
      const zid = String(key).split(':')[0];
      if (zid) ids.add(zid);
    }
    return ids;
  }, [selectedKeys]);

  const selectedList = useMemo(() => {
    const out = [];
    for (const key of selectedKeys) {
      const [zid, sid] = String(key).split(':');
      const seat = unifiedSeats.find((a) => String(a.id) === String(sid));
      if (!seat) continue;
      out.push({ ...seat, zonaId: zid, zona: zonaById.get(String(zid)) || null });
    }
    return out.sort(
      (a, b) =>
        String(a.fila).localeCompare(String(b.fila), 'es') || Number(a.columna) - Number(b.columna)
    );
  }, [selectedKeys, unifiedSeats, zonaById]);

  useEffect(() => {
    const ids = selectedList.map((x) => x.id);
    onSelectionChange?.(ids);
  }, [selectedList, onSelectionChange]);

  function toggleSeat(zonaId, seat) {
    if (selectionDisabled || !seat || seat.estado !== 'available') return;
    const zid = String(zonaId);
    const skey = `${zid}:${seat.id}`;
    const already = selectedKeys.has(skey);

    if (!already) {
      if (activeTariffZonaId == null || String(activeTariffZonaId).trim() === '') {
        setSelectionWarn(
          'Pulsa primero GENERAL, VIP u otro tipo en la lista de arriba para añadir asientos de esa categoría.'
        );
        return;
      }
      if (String(activeTariffZonaId) !== zid) {
        setSelectionWarn(
          'Para añadir ese asiento, elige antes su tipo arriba. Puedes combinar tipos: cambia de botón y sigue marcando en el mapa.'
        );
        return;
      }
    }
    setSelectionWarn(null);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(skey)) next.delete(skey);
      else next.add(skey);
      return next;
    });
  }

  if (!zonasArr.length) return null;
  if (loading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.muted}>Cargando mapa unificado de asientos…</p>
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
  if (!filasOrden.length || !colsOrden.length) {
    return (
      <div className={styles.wrap}>
        <p className={styles.muted}>No hay asientos disponibles para mostrar en el mapa unificado.</p>
      </div>
    );
  }

  const selectedZona = selectedZoneFromKeys ? zonaById.get(String(selectedZoneFromKeys)) : null;
  const total =
    Math.round(selectedList.reduce((s, a) => s + Number(a.zona?.precio || 0), 0) * 100) / 100;
  const mixedTypes = tariffIdsInSelection.size > 1;

  return (
    <div className={styles.wrap}>
      <h3 className={styles.title}>Mapa unificado por tipo</h3>
      <p className={styles.lead}>
        <strong>1)</strong> Pulsa GENERAL, VIP u otro tipo arriba. <strong>2)</strong> Marca asientos de ese color en el
        mapa. <strong>3)</strong> Cambia de tipo arriba si quieres añadir otra categoría: todo suma en{' '}
        <strong>un solo pago</strong>.
      </p>

      <div className={styles.statusLegend}>
        <span className={styles.legendAvailNote}>Disponible: tono según el tipo (chips arriba)</span>
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

      <div className={styles.typeLegend}>
        {(unifiedZonas.length ? unifiedZonas : zonasArr).map((z) => {
          const zp = describeZonaPresentation(z);
          const inCart = tariffIdsInSelection.has(String(z.id));
          const addMode = activeTariffZonaId != null && String(activeTariffZonaId) === String(z.id);
          const highlight = addMode || inCart;
          return (
            <span
              key={z.id}
              className={`${styles.typeChip} ${highlight ? styles.typeChipActive : ''}`}
              style={{ borderColor: zp.accentColor, backgroundColor: zp.softColor }}
              title={addMode ? 'Modo selección: puedes añadir o quitar asientos de este tipo' : undefined}
            >
              {addMode ? '▶ ' : ''}
              {zp.typeLabel} · ${Number(z.precio || 0).toFixed(2)}
              {inCart ? ' ✓' : ''}
            </span>
          );
        })}
      </div>

      <div className={styles.stage}>PANTALLA / ESCENARIO</div>
      <div
        className={styles.gridWrap}
        style={{ gridTemplateColumns: `36px repeat(${colsOrden.length || 1}, minmax(38px, 1fr))` }}
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
              const seat = seatByCoord.get(`${fila}:${col}`);
              const zid = seat ? String(seat.id_zona_tarifa) : '';
              const zone = zonaById.get(zid);
              const zp = describeZonaPresentation(zone);
              if (!seat) return <div key={`${fila}-${col}-empty`} className={styles.cellMuted}>—</div>;
              const skey = `${zid}:${seat.id}`;
              const sel = selectedKeys.has(skey);
              let cls = styles.seatByType;
              if (seat.estado === 'sold') cls = styles.seatSold;
              else if (seat.estado === 'held') cls = styles.seatHeld;
              else if (sel) cls = styles.seatSel;
              const noTipoActivo =
                !sel &&
                (activeTariffZonaId == null || String(activeTariffZonaId).trim() === '');
              const bloqueadoPorTipo =
                !sel && activeTariffZonaId != null && String(activeTariffZonaId) !== zid;
              return (
                <button
                  key={`${zid}-${seat.id}`}
                  type="button"
                  disabled={
                    selectionDisabled || seat.estado !== 'available' || noTipoActivo || bloqueadoPorTipo
                  }
                  className={`${styles.seat} ${cls}`}
                  style={
                    cls === styles.seatByType
                      ? { backgroundColor: zp.softColor, borderColor: zp.accentColor }
                      : undefined
                  }
                  onClick={() => toggleSeat(zid, seat)}
                  title={`${zone?.nombre_seccion || 'Zona'} · Fila ${fila} asiento ${col}`}
                >
                  {seat.estado === 'sold' ? '×' : col}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className={styles.selection}>
        <h4 className={styles.selTitle}>Selección</h4>
        {selectionWarn ? <p className={styles.warn}>{selectionWarn}</p> : null}
        {selectedList.length === 0 ? (
          <p className={styles.muted}>
            {selectionDisabled
              ? 'La venta está cerrada: mapa en modo consulta.'
              : 'Elige un tipo arriba y luego los asientos de ese color. Repite con otro tipo para combinar en la misma compra.'}
          </p>
        ) : (
          <>
            <p className={styles.selType}>
              {mixedTypes ? (
                <>Varios tipos en esta compra — un solo pago con el total de abajo.</>
              ) : (
                <>
                  Tipo: <strong>{selectedZona?.nombre_seccion || '—'}</strong>
                </>
              )}
            </p>
            <ul className={styles.selList}>
              {selectedList.map((a) => (
                <li key={`${a.zonaId}-${a.id}`}>
                  Fila {a.fila}, asiento {a.columna}
                  {a.zona
                    ? ` · ${describeZonaPresentation(a.zona).typeLabel} $${Number(a.zona.precio || 0).toFixed(2)}`
                    : ''}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={styles.total}>
          <strong>
            Total: ${total.toFixed(2)} MXN
            {selectedList.length > 0 ? (
              <span className={styles.totalSub}>
                {' '}
                ({selectedList.length} asiento{selectedList.length === 1 ? '' : 's'})
              </span>
            ) : null}
          </strong>
        </p>
      </div>
    </div>
  );
}
