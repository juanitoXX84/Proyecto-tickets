import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { EventBannerImage, GoogleMapsLinkButton } from '../components/GoogleMapsLinkButton.jsx';
import { apiFetch } from '../services/api.js';
import { canPurchaseEventAsCustomer } from '../utils/purchasePolicy.js';
import { normalizeMapUrl, pickEventMapUrl, shouldRenderMapsLinkButton } from '../utils/googleMapsUrl.js';
import {
  disponiblesEnZona,
  disponiblesEventoAgregado,
  totalDisponiblesZonas,
} from '../utils/ticketAvailability.js';
import { EventReviewsBlock } from '../components/events/EventReviewsBlock.jsx';
import { EventZonaPlanoViewer } from '../components/events/EventZonaPlanoViewer.jsx';
import { SeatMapPicker } from '../components/events/SeatMapPicker.jsx';
import { UnifiedSeatMapPicker } from '../components/events/UnifiedSeatMapPicker.jsx';
import {
  PALETA_COLORES_PLANO,
  labelForPlanoColorHex,
  normalizePlanoColorHex,
} from '../utils/zonaColoresPlano.js';
import { describeZonaPresentation } from '../utils/zonaPresentation.js';
import styles from './EventDetail.module.css';

function zonaPlanoColor(z, index) {
  const explicit = normalizePlanoColorHex(z?.color_plano);
  if (explicit) return explicit;
  /** Sin color en BD: usa el tono de categoría (VIP/gradas/…) para no mostrar azul de “selección”. */
  const zp = describeZonaPresentation(z ?? { nombre_seccion: '', descripcion_zona: '' });
  return zp.accentColor || PALETA_COLORES_PLANO[index % PALETA_COLORES_PLANO.length].hex;
}

/** Zona con mapa interactivo: flag en API o dimensiones guardadas (por si el listado omitió el flag). */
function zonaOfreceMapaButacas(z) {
  if (!z) return false;
  const flag =
    Number(z.usa_mapa_asientos) === 1 ||
    z.usa_mapa_asientos === true ||
    z.usa_mapa_asientos === '1';
  if (flag) return true;
  const mf = Number(z.mapa_filas);
  const mc = Number(z.mapa_columnas);
  return Number.isFinite(mf) && mf >= 1 && Number.isFinite(mc) && mc >= 1;
}

function canRenderUnifiedSeatMap(zonas) {
  const mapZones = (Array.isArray(zonas) ? zonas : []).filter(zonaOfreceMapaButacas);
  if (mapZones.length < 2) return false;
  const f0 = Number(mapZones[0].mapa_filas);
  const c0 = Number(mapZones[0].mapa_columnas);
  if (!Number.isFinite(f0) || !Number.isFinite(c0) || f0 < 1 || c0 < 1) return false;
  return mapZones.every((z) => Number(z.mapa_filas) === f0 && Number(z.mapa_columnas) === c0);
}

export function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, needsProfile, loading: authLoading } = useAuth();
  const [evento, setEvento] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedZonaId, setSelectedZonaId] = useState(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [unifiedMapData, setUnifiedMapData] = useState(null);

  const onSeatSelectionChange = useCallback((ids) => {
    setSelectedSeatIds(ids);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvento(null);
    (async () => {
      try {
        const data = await apiFetch(`/api/events/${id}`);
        if (!cancelled) setEvento(data.evento);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Evento no encontrado');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, refreshTick]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setRefreshTick((v) => v + 1);
      }
    };
    const onPageShow = () => {
      setRefreshTick((v) => v + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  useEffect(() => {
    setSelectedZonaId(null);
    setSelectedSeatIds([]);
  }, [id]);

  useEffect(() => {
    const zs = Array.isArray(evento?.zonas) ? evento.zonas : [];
    if (canRenderUnifiedSeatMap(zs)) return;
    setSelectedSeatIds([]);
  }, [selectedZonaId, evento]);

  useEffect(() => {
    const zs = Array.isArray(evento?.zonas) ? evento.zonas : [];
    if (!evento || !id || !canRenderUnifiedSeatMap(zs)) {
      setUnifiedMapData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(`/api/seats/event/${id}/unified`);
        if (!cancelled) {
          setUnifiedMapData({
            asientos: Array.isArray(data.asientos) ? data.asientos : [],
            zonas: Array.isArray(data.zonas) ? data.zonas : [],
          });
        }
      } catch {
        if (!cancelled) setUnifiedMapData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evento, id, refreshTick]);

  useEffect(() => {
    if (!evento) return;
    const zs = Array.isArray(evento.zonas) ? evento.zonas : [];
    if (zs.length === 0) return;
    const unified = canRenderUnifiedSeatMap(zs);
    setSelectedZonaId((prev) => {
      if (prev != null) {
        const cur = zs.find((z) => String(z.id) === String(prev));
        if (cur && disponiblesEnZona(cur) > 0) return prev;
      }
      if (unified) {
        return null;
      }
      const firstConCupo = zs.find((z) => disponiblesEnZona(z) > 0);
      return firstConCupo ? firstConCupo.id : null;
    });
  }, [evento]);

  function handleComprar() {
    if (eventoCancelado) return;
    if (!user) {
      navigate(`/login?next=/eventos/${id}`);
      return;
    }
    if (needsProfile) {
      navigate('/oauth/acceso');
      return;
    }
    if (!canPurchaseEventAsCustomer(user, evento)) {
      return;
    }
    if (evento.venta_abierta === false) {
      return;
    }
    const zs = Array.isArray(evento.zonas) ? evento.zonas : [];
    const useUnified = canRenderUnifiedSeatMap(zs);

    let zonaCheckoutId = selectedZonaId;
    if (useUnified && selectedSeatIds.length > 0 && unifiedMapData?.asientos?.length) {
      const byId = new Map(unifiedMapData.asientos.map((a) => [Number(a.id), a]));
      const firstSeat = byId.get(Number(selectedSeatIds[0]));
      if (firstSeat && firstSeat.id_zona_tarifa != null) {
        zonaCheckoutId = firstSeat.id_zona_tarifa;
      }
    }

    const zSel = zs.length > 0 ? zs.find((row) => String(row.id) === String(zonaCheckoutId)) : null;
    const usaMapaZona = zSel && zonaOfreceMapaButacas(zSel);

    if (zs.length > 0) {
      if (useUnified) {
        if (selectedSeatIds.length === 0) return;
        if (totalDisponiblesZonas(zs) <= 0) return;
      } else {
        if (!zSel || disponiblesEnZona(zSel) <= 0) return;
        if (usaMapaZona && selectedSeatIds.length === 0) return;
      }
    }

    const multiZonaTarifas =
      useUnified &&
      unifiedMapData &&
      (() => {
        const t = new Set();
        for (const sid of selectedSeatIds) {
          const a = unifiedMapData.asientos.find((x) => Number(x.id) === Number(sid));
          if (a) t.add(String(a.id_zona_tarifa));
        }
        return t.size > 1;
      })();

    const totalEstimado = (() => {
      if (useUnified && unifiedMapData && selectedSeatIds.length > 0) {
        const zonaById = new Map(unifiedMapData.zonas.map((z) => [String(z.id), z]));
        let sum = 0;
        for (const sid of selectedSeatIds) {
          const a = unifiedMapData.asientos.find((x) => Number(x.id) === Number(sid));
          if (!a) continue;
          const z = zonaById.get(String(a.id_zona_tarifa));
          sum += Number(z?.precio || 0);
        }
        return Math.round(sum * 100) / 100;
      }
      if (useUnified) return 0;
      if (zs.length > 0 && zSel) {
        const selUsaMapa = zonaOfreceMapaButacas(zSel);
        return selUsaMapa
          ? Number(zSel.precio) * (selectedSeatIds.length || 0)
          : Number(zSel.precio);
      }
      return Number(evento.precio);
    })();

    navigate('/checkout', {
      state: {
        eventoId: Number(id),
        zonaId: zs.length > 0 ? zonaCheckoutId : undefined,
        totalEstimado,
        ...(usaMapaZona && selectedSeatIds.length
          ? {
              seatIds: selectedSeatIds,
              cantidadInicial: selectedSeatIds.length,
              ...(multiZonaTarifas ? { multiZonaTarifas: true } : {}),
            }
          : {}),
      },
    });
  }

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <span className={styles.spinner} />
        Cargando evento…
      </div>
    );
  }

  if (error || !evento) {
    return (
      <div className={styles.errorWrap}>
        <p className={styles.errorText}>{error || 'No encontrado'}</p>
        <Link to="/" className={styles.errorLink}>
          ← Volver al inicio
        </Link>
      </div>
    );
  }

  const fecha = evento.fecha ? new Date(evento.fecha) : null;
  const fechaFin = evento.fecha_fin ? new Date(evento.fecha_fin) : null;
  const eventoCancelado = Boolean(evento.evento_cancelado);
  const esAdmin = Boolean(user && user.rol === 'admin');
  const esOrganizador = Boolean(user && user.rol === 'organizador');
  const ventaCerrada = evento.venta_abierta === false || eventoCancelado;
  const zonas = Array.isArray(evento.zonas) ? evento.zonas : [];
  const useUnifiedSeatMap = canRenderUnifiedSeatMap(zonas);
  const mapZones = zonas.filter(zonaOfreceMapaButacas);
  const usarZonas = zonas.length > 0;
  const disponiblesAgregado = disponiblesEventoAgregado(evento);
  const totalDisponiblesZona = totalDisponiblesZonas(zonas);
  const totalDisponibles = usarZonas ? totalDisponiblesZona : disponiblesAgregado;
  const effectiveZonaId = selectedZonaId;
  const selectedZona = usarZonas
    ? zonas.find((z) => String(z.id) === String(effectiveZonaId)) ?? null
    : null;
  const selectedZonaIndex =
    usarZonas && selectedZona
      ? Math.max(0, zonas.findIndex((z) => String(z.id) === String(selectedZona.id)))
      : 0;
  const selectedZonaHex =
    usarZonas && selectedZona ? zonaPlanoColor(selectedZona, selectedZonaIndex) : null;
  const selectedZonaColorLabel = selectedZonaHex ? labelForPlanoColorHex(selectedZonaHex) : null;
  const selectedUsaMapa = Boolean(selectedZona) && zonaOfreceMapaButacas(selectedZona);
  const disponiblesSeleccion = usarZonas
    ? selectedZona
      ? disponiblesEnZona(selectedZona)
      : 0
    : disponiblesAgregado;
  const precioMostrado = (() => {
    if (useUnifiedSeatMap && unifiedMapData && selectedSeatIds.length > 0) {
      const zonaById = new Map(unifiedMapData.zonas.map((z) => [String(z.id), z]));
      let sum = 0;
      for (const sid of selectedSeatIds) {
        const a = unifiedMapData.asientos.find((x) => Number(x.id) === Number(sid));
        if (!a) continue;
        const z = zonaById.get(String(a.id_zona_tarifa));
        sum += Number(z?.precio || 0);
      }
      return Math.round(sum * 100) / 100;
    }
    if (useUnifiedSeatMap) return 0;
    if (usarZonas && selectedZona) {
      return selectedUsaMapa
        ? Number(selectedZona.precio) * (selectedSeatIds.length || 0)
        : Number(selectedZona.precio);
    }
    return Number(evento.precio);
  })();

  const unifiedMixedZoneTypes =
    useUnifiedSeatMap &&
    unifiedMapData &&
    selectedSeatIds.length > 0 &&
    (() => {
      const tarifas = new Set();
      for (const sid of selectedSeatIds) {
        const a = unifiedMapData.asientos.find((x) => Number(x.id) === Number(sid));
        if (a) tarifas.add(String(a.id_zona_tarifa));
      }
      return tarifas.size > 1;
    })();

  const unifiedSingleTypeZona =
    useUnifiedSeatMap &&
    unifiedMapData &&
    selectedSeatIds.length > 0 &&
    !unifiedMixedZoneTypes
      ? (() => {
          const t = new Set();
          for (const sid of selectedSeatIds) {
            const a = unifiedMapData.asientos.find((x) => Number(x.id) === Number(sid));
            if (a) t.add(String(a.id_zona_tarifa));
          }
          if (t.size !== 1) return null;
          const [onlyZid] = [...t];
          return zonas.find((zz) => String(zz.id) === onlyZid) ?? null;
        })()
      : null;

  /** Tarjeta lateral: carrito homogéneo → esa zona; si no hay asientos → botón activo; mapa no unificado → selectedZona */
  const zonaAsideVisual =
    usarZonas && !unifiedMixedZoneTypes
      ? useUnifiedSeatMap
        ? unifiedSingleTypeZona || selectedZona
        : selectedZona
      : null;
  const zonaAsideIndex =
    zonaAsideVisual != null
      ? Math.max(0, zonas.findIndex((z) => String(z.id) === String(zonaAsideVisual.id)))
      : 0;
  const zonaAsideHex = zonaAsideVisual ? zonaPlanoColor(zonaAsideVisual, zonaAsideIndex) : null;
  const zonaAsideColorLabel = zonaAsideHex ? labelForPlanoColorHex(zonaAsideHex) : null;

  const sinCupoCompra = usarZonas
    ? useUnifiedSeatMap
      ? totalDisponiblesZona <= 0 || selectedSeatIds.length === 0
      : !selectedZona ||
        disponiblesSeleccion <= 0 ||
        (selectedUsaMapa && selectedSeatIds.length === 0)
    : disponiblesAgregado <= 0;

  /** Evita mostrar «Agotado» cuando solo falta elegir zona o marcar asientos en el mapa. */
  const etiquetaBotonComprar = (() => {
    if (!user) return 'Inicia sesión para comprar';
    if (needsProfile) return 'Completa tu perfil para comprar';
    if (ventaCerrada) return 'Venta no disponible';
    if (totalDisponibles <= 0) return 'Agotado';

    if (usarZonas) {
      if (useUnifiedSeatMap) {
        if (totalDisponiblesZona <= 0) return 'Agotado';
        if (!selectedZona) return 'Elige tipo de entrada arriba';
        if (selectedSeatIds.length === 0) return 'Selecciona tus asientos en el mapa';
        return 'Comprar entradas';
      }
      if (!selectedZona) return 'Elige una zona';
      if (disponiblesSeleccion <= 0) return 'Agotado';
      if (selectedUsaMapa && selectedSeatIds.length === 0) return 'Selecciona tus asientos en el mapa';
      return 'Comprar entradas';
    }

    if (disponiblesAgregado <= 0) return 'Agotado';
    return 'Comprar entradas';
  })();

  const mapaRaw = pickEventMapUrl(evento);
  const mapaHref = normalizeMapUrl(mapaRaw);
  const recintoPlanoUrl = (evento.recinto_url_plano || '').trim();

  return (
    <div className={styles.root}>
      <div className={styles.breadcrumbBar}>
        <div className={styles.breadcrumbInner}>
          <Link to="/" className={esAdmin ? styles.crumbAdmin : styles.crumbUser}>
            Inicio
          </Link>
          <span className={styles.crumbSep}>/</span>
          <span className={styles.crumbCurrent}>{evento.titulo}</span>
        </div>
      </div>

      <EventBannerImage src={evento.imagen} alt="" priority />

      {eventoCancelado && (
        <div className={styles.cancelBar}>
          <div className={styles.cancelInner}>
            <p className={styles.cancelTitle}>Evento cancelado</p>
            {evento.motivo_cancelacion ? (
              <p className={styles.cancelText}>{evento.motivo_cancelacion}</p>
            ) : (
              <p className={styles.cancelText}>Este evento ya no se realizará. No se venden entradas.</p>
            )}
          </div>
        </div>
      )}

      <div
        className={`${styles.mainGrid} ${esAdmin || esOrganizador || eventoCancelado ? '' : styles.mainGridNormal}`}
      >
        <div
          className={`${styles.colMain} ${esAdmin || esOrganizador || eventoCancelado ? '' : styles.colMainWide}`}
        >
          <p className={esAdmin ? styles.catAdmin : styles.catUser}>{evento.categoria_nombre || 'Evento'}</p>
          <h1 className={styles.h1}>{evento.titulo}</h1>
          {fecha && (
            <p className={styles.dateMain}>
              {fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
          <p className={styles.time}>{fecha?.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
          {shouldRenderMapsLinkButton(mapaRaw, mapaHref) ? (
            <div className={styles.mapWrap}>
              <GoogleMapsLinkButton href={mapaHref} />
            </div>
          ) : null}
          {fechaFin && (
            <p className={styles.fechaFin}>
              <span className={styles.fechaFinLabel}>Fin del evento: </span>
              {fechaFin.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
          <p className={styles.locRow}>
            <svg
              className={esAdmin ? styles.iconAdmin : styles.iconUser}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>
              {evento.ubicacion || 'Ubicación por confirmar'}
              {evento.recinto && (
                <>
                  <br />
                  <span className={styles.recinto}>{evento.recinto}</span>
                </>
              )}
            </span>
          </p>
          {evento.direccion && <p className={styles.direccion}>{evento.direccion}</p>}
          {zonas.length > 0 && (esAdmin || esOrganizador) && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Zonas y precios</h2>
              <p className={styles.sectionLead}>
                {esAdmin
                  ? 'Precios y cupo por sección (solo consulta; las cuentas admin no compran entradas).'
                  : 'Precios y cupo por sección (solo consulta; los organizadores no compran entradas en la plataforma).'}
              </p>
              {recintoPlanoUrl ? (
                <EventZonaPlanoViewer imageUrl={recintoPlanoUrl} zonas={zonas} disponiblesEnZona={disponiblesEnZona} />
              ) : null}
              <ul className={styles.zonaList}>
                {zonas.map((z, zi) => {
                  const libres = disponiblesEnZona(z);
                  const agotada = libres <= 0;
                  const hexZ = zonaPlanoColor(z, zi);
                  const colorLabel = labelForPlanoColorHex(hexZ);
                  const zp = describeZonaPresentation(z);
                  return (
                    <li key={z.id ?? `${z.nombre_seccion}-${z.precio}`}>
                      <div
                        className={agotada ? styles.zonaCardStaticAgotada : styles.zonaCardStatic}
                        style={{ borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: hexZ }}
                      >
                        <div className={styles.zonaRow}>
                          <div className={styles.zonaTitleCol}>
                            <div className={styles.zonaTitleRow}>
                              <span
                                className={styles.zonaSwatch}
                                style={{ backgroundColor: hexZ }}
                                title={colorLabel ? `En el mapa: ${colorLabel}` : 'Color de esta zona'}
                                aria-hidden
                              />
                              <span className={styles.zonaTypeBadge} style={{ borderColor: zp.accentColor, backgroundColor: zp.softColor }}>
                                {zp.typeLabel}
                              </span>
                              <p className={agotada ? styles.zonaNameAgotada : styles.zonaName}>{z.nombre_seccion}</p>
                            </div>
                            {colorLabel ? (
                              <p className={agotada ? styles.zonaColorTagMuted : styles.zonaColorTag}>
                                Mismo color en el mapa: {colorLabel}
                              </p>
                            ) : null}
                            {z.descripcion_zona && <p className={styles.zonaDesc}>{z.descripcion_zona}</p>}
                          </div>
                          <div className="text-right">
                            <p className={agotada ? styles.zonaPriceAgotada : styles.zonaPrice}>
                              ${Number(z.precio).toFixed(2)} MXN
                            </p>
                            <p className={styles.zonaMeta}>
                              {agotada ? (
                                <span className={styles.zonaAgotadaLabel}>Agotada</span>
                              ) : (
                                <>
                                  Cupo: <span className={styles.zonaCupoNum}>{libres}</span> / {z.capacidad}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {zonas.length > 0 && !esAdmin && !esOrganizador && !eventoCancelado && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Elige tu zona</h2>
              <p className={styles.sectionLead}>
                {useUnifiedSeatMap
                  ? 'Mapa único: pulsa GENERAL, VIP u otro tipo arriba para activar la selección de ese color en el mapa. Puedes cambiar de tipo y seguir añadiendo asientos: todo queda en una sola compra y el total es la suma de cada boleto.'
                  : recintoPlanoUrl
                    ? 'Cada tipo de boleto tiene un color en el plano para ubicarte. Compara precios y cupo; si la zona tiene asientos numerados, elige tus butacas en el mapa debajo.'
                    : 'Compara precios y cupo por zona (VIP, General, etc.). Si la zona tiene asientos numerados, al seleccionarla podrás elegir tus butacas en el mapa.'}
              </p>
              {recintoPlanoUrl ? (
                <EventZonaPlanoViewer
                  imageUrl={recintoPlanoUrl}
                  zonas={zonas}
                  selectedZonaId={selectedZonaId}
                  disponiblesEnZona={disponiblesEnZona}
                  onPinSelect={setSelectedZonaId}
                />
              ) : null}
              <ul className={styles.zonaList}>
                {zonas.map((z, zi) => {
                  const libres = disponiblesEnZona(z);
                  const agotada = libres <= 0;
                  const sel = String(z.id) === String(effectiveZonaId);
                  const btnClass = agotada ? styles.zonaBtnAgotada : sel ? styles.zonaBtnSel : styles.zonaBtn;
                  const hexZ = zonaPlanoColor(z, zi);
                  const colorLabel = labelForPlanoColorHex(hexZ);
                  const mostrarColorPlano = Boolean(recintoPlanoUrl);
                  const zp = describeZonaPresentation(z);
                  return (
                    <li key={z.id ?? `${z.nombre_seccion}-${z.precio}`}>
                      <button
                        type="button"
                        disabled={agotada}
                        onClick={() => {
                          setSelectedZonaId(z.id);
                          if (!useUnifiedSeatMap) {
                            setSelectedSeatIds([]);
                          }
                        }}
                        className={btnClass}
                        style={{
                          borderLeftWidth: 4,
                          borderLeftStyle: 'solid',
                          borderLeftColor: hexZ,
                        }}
                      >
                        <div className={styles.zonaRow}>
                          <div className={styles.zonaTitleCol}>
                            <div className={styles.zonaTitleRow}>
                              {mostrarColorPlano ? (
                                <span
                                  className={styles.zonaSwatch}
                                  style={{ backgroundColor: hexZ }}
                                  title={colorLabel ? `En el mapa: ${colorLabel}` : 'Color de esta zona'}
                                  aria-hidden
                                />
                              ) : null}
                              <span className={styles.zonaTypeBadge} style={{ borderColor: zp.accentColor, backgroundColor: zp.softColor }}>
                                {zp.typeLabel}
                              </span>
                              <p className={agotada ? styles.zonaNameAgotada : styles.zonaName}>{z.nombre_seccion}</p>
                            </div>
                            {mostrarColorPlano && colorLabel ? (
                              <p className={agotada ? styles.zonaColorTagMuted : styles.zonaColorTag}>
                                Mismo color en el mapa: {colorLabel}
                              </p>
                            ) : null}
                            {z.descripcion_zona && <p className={styles.zonaDesc}>{z.descripcion_zona}</p>}
                          </div>
                          <div className="text-right">
                            <p className={agotada ? styles.zonaPriceAgotada : styles.zonaPriceSel}>
                              ${Number(z.precio).toFixed(2)} MXN
                            </p>
                            <p className={styles.zonaMeta}>
                              {agotada ? (
                                <span className={styles.zonaAgotadaLabel}>Agotada</span>
                              ) : (
                                <>
                                  Cupo: <span className={styles.zonaCupoNum}>{libres}</span> / {z.capacidad}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {useUnifiedSeatMap ? (
                <UnifiedSeatMapPicker
                  eventId={Number(id)}
                  zonas={mapZones}
                  activeTariffZonaId={selectedZonaId}
                  onSelectionChange={onSeatSelectionChange}
                  selectionDisabled={ventaCerrada}
                />
              ) : selectedZona && selectedUsaMapa ? (
                <>
                  {ventaCerrada && (
                    <p className={styles.hintAmber}>
                      La venta no está abierta ahora: puedes ver el mapa, pero no podrás reservar asientos hasta
                      que el organizador active la venta.
                    </p>
                  )}
                  <SeatMapPicker
                    zonaId={selectedZona.id}
                    zona={selectedZona}
                    unitPrice={Number(selectedZona.precio)}
                    onSelectionChange={onSeatSelectionChange}
                    selectionDisabled={ventaCerrada}
                  />
                </>
              ) : null}
            </div>
          )}
          {eventoCancelado && recintoPlanoUrl && zonas.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Plano del recinto</h2>
              <p className={styles.sectionLead}>Referencia de zonas (el evento está cancelado; no hay venta).</p>
              <EventZonaPlanoViewer imageUrl={recintoPlanoUrl} zonas={zonas} disponiblesEnZona={disponiblesEnZona} />
            </div>
          )}
          {evento.descripcion && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Acerca del evento</h2>
              <p className={styles.descText}>{evento.descripcion}</p>
            </div>
          )}
          {evento.instrucciones_canje && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Instrucciones de acceso</h2>
              <p className={styles.descTextSm}>{evento.instrucciones_canje}</p>
            </div>
          )}
        </div>

        {!esAdmin && !esOrganizador && !eventoCancelado && (
          <aside className={styles.aside}>
            <div className={styles.ticketCard}>
              <p className={styles.ticketLabel}>
                {usarZonas ? (unifiedMixedZoneTypes ? 'Tu selección' : 'Zona elegida') : 'Desde'}
              </p>
              <p className={styles.ticketPrice}>
                ${Number.isFinite(precioMostrado) ? precioMostrado.toFixed(2) : '0.00'}{' '}
                <span className={styles.ticketCurrency}>MXN</span>
              </p>
              {usarZonas && zonaAsideVisual && (
                <div className={styles.ticketZonaBlock}>
                  <span
                    className={styles.zonaSwatchLg}
                    style={{ backgroundColor: zonaAsideHex }}
                    title={zonaAsideColorLabel ? `En el mapa: ${zonaAsideColorLabel}` : undefined}
                    aria-hidden
                  />
                  <div>
                    <p className={styles.ticketZona}>
                      {(() => {
                        const zp = describeZonaPresentation(zonaAsideVisual);
                        return (
                          <>
                            <span
                              className={styles.ticketTypeBadge}
                              style={{ borderColor: zp.accentColor, backgroundColor: zp.softColor }}
                            >
                              {zp.typeLabel}
                            </span>{' '}
                            {zonaAsideVisual.nombre_seccion}
                          </>
                        );
                      })()}
                    </p>
                    {useUnifiedSeatMap && selectedSeatIds.length === 0 && selectedZona ? (
                      <p className={styles.ticketZonaColor}>Modo mapa: añadir asientos de este tipo.</p>
                    ) : null}
                    {useUnifiedSeatMap &&
                    selectedSeatIds.length > 0 &&
                    unifiedSingleTypeZona &&
                    selectedZona &&
                    String(selectedZona.id) !== String(unifiedSingleTypeZona.id) ? (
                      <p className={styles.ticketZonaColor}>
                        Carrito: {unifiedSingleTypeZona.nombre_seccion}. Cambia de botón arriba para añadir otro tipo.
                      </p>
                    ) : zonaAsideColorLabel ? (
                      <p className={styles.ticketZonaColor}>Color en el mapa: {zonaAsideColorLabel}</p>
                    ) : null}
                  </div>
                </div>
              )}
              {usarZonas && unifiedMixedZoneTypes && (
                <p className={styles.ticketMeta}>
                  Varios tipos de boleto en la misma orden — un solo pago por el total.
                </p>
              )}
              {usarZonas && useUnifiedSeatMap && !selectedZona && (
                <p className={styles.ticketMeta}>
                  Pulsa <strong>GENERAL</strong>, <strong>VIP</strong> u otra zona arriba para poder marcar asientos de ese tipo en el mapa.
                </p>
              )}
              {usarZonas && (useUnifiedSeatMap || (selectedUsaMapa && selectedZona)) && (
                <p className={styles.ticketMeta}>
                  Asientos seleccionados:{' '}
                  <span className={styles.ticketMetaBold}>{selectedSeatIds.length}</span>
                  {selectedSeatIds.length === 0
                    ? useUnifiedSeatMap
                      ? ''
                      : ' (elige en el mapa abajo)'
                    : ''}
                </p>
              )}
              <p className={styles.ticketMeta}>
                {usarZonas ? (
                  useUnifiedSeatMap ? (
                    <>
                      Disponibles (todas las zonas):{' '}
                      <span className={styles.ticketMetaBold}>{totalDisponiblesZona}</span>
                    </>
                  ) : (
                    <>
                      Cupo en esta zona: <span className={styles.ticketMetaBold}>{disponiblesSeleccion}</span>
                      {selectedZona ? ` / ${selectedZona.capacidad}` : ''}
                    </>
                  )
                ) : (
                  <>
                    Disponibles: <span className={styles.ticketMetaBold}>{disponiblesAgregado}</span> / {evento.capacidad}
                  </>
                )}
              </p>
              {usarZonas && (
                <p className={styles.ticketTotalZonas}>Total en todas las zonas: {totalDisponiblesZona} boletos</p>
              )}
              <button
                type="button"
                disabled={authLoading || (!user && false) || (user && (sinCupoCompra || ventaCerrada || totalDisponibles <= 0))}
                onClick={handleComprar}
                className={styles.btnComprar}
              >
                {etiquetaBotonComprar}
              </button>
              {ventaCerrada && (
                <p className={styles.hintAmber}>
                  Las fechas de venta no permiten comprar ahora (revisa inicio o fin de venta configurados por el
                  organizador).
                </p>
              )}
              {!user && (
                <p className={styles.hintZinc}>
                  Te pediremos sesión antes de confirmar el pago (Mercado Pago más adelante).
                </p>
              )}
              {user && needsProfile && (
                <p className={styles.hintAmber}>
                  Termina el registro en <strong>Completar perfil</strong> para poder comprar.
                </p>
              )}
            </div>
          </aside>
        )}
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-12 lg:pb-16">
        <EventReviewsBlock
          eventId={id}
          user={user}
          needsProfile={needsProfile}
          authLoading={authLoading}
        />
      </div>
    </div>
  );
}
