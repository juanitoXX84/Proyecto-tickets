import { useEffect, useState } from 'react';
import { Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { EventBannerImage, GoogleMapsLinkButton } from '../components/GoogleMapsLinkButton.jsx';
import { apiFetch } from '../services/api.js';
import { normalizeMapUrl, pickEventMapUrl, shouldRenderMapsLinkButton } from '../utils/googleMapsUrl.js';
import { disponiblesEnZona, disponiblesEventoAgregado } from '../utils/ticketAvailability.js';
import { PaymentTrustBadges } from '../components/checkout/PaymentTrustBadges.jsx';
import { PALETA_COLORES_PLANO, normalizePlanoColorHex } from '../utils/zonaColoresPlano.js';
import { describeZonaPresentation } from '../utils/zonaPresentation.js';
import { isPruebasRole } from '../utils/roles.js';
import { MercadoPagoCardBrick } from '../components/checkout/MercadoPagoCardBrick.jsx';
import styles from './CheckoutPlaceholder.module.css';

export function CheckoutPlaceholder() {
  const navigate = useNavigate();
  const { user, needsProfile, loading } = useAuth();
  const location = useLocation();
  const eventoId = location.state?.eventoId;
  const zonaIdCheckout = location.state?.zonaId;
  const seatIdsFromNav = location.state?.seatIds;
  const multiZonaTarifas = Boolean(location.state?.multiZonaTarifas);
  const totalEstimadoNav = location.state?.totalEstimado;
  const [evento, setEvento] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  /** Pago embebido con Card Brick (Public Key configurada en el servidor). */
  const [brickSession, setBrickSession] = useState(null);
  /** Si recargas la página y se pierde `totalEstimado` en el state, se recalcula con el mapa unificado. */
  const [totalRecalculado, setTotalRecalculado] = useState(null);

  useEffect(() => {
    const ids = Array.isArray(seatIdsFromNav)
      ? [...new Set(seatIdsFromNav.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
      : [];
    if (ids.length > 0) setCantidad(ids.length);
  }, [eventoId, seatIdsFromNav]);

  useEffect(() => {
    if (!eventoId || !user || needsProfile) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(`/api/events/${eventoId}`);
        if (!cancelled) {
          if (!data?.evento) setLoadErr('Evento no encontrado');
          else setEvento(data.evento);
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e.message || 'No se pudo cargar el evento');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventoId, user, needsProfile]);

  useEffect(() => {
    if (!eventoId) return;
    const ids = Array.isArray(seatIdsFromNav)
      ? [...new Set(seatIdsFromNav.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
      : [];
    if (ids.length === 0) return;
    if (Number.isFinite(Number(totalEstimadoNav))) {
      setTotalRecalculado(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(`/api/seats/event/${eventoId}/unified`);
        const zonas = Array.isArray(data?.zonas) ? data.zonas : [];
        const asientos = Array.isArray(data?.asientos) ? data.asientos : [];
        const zonaById = new Map(zonas.map((z) => [String(z.id), z]));
        let sum = 0;
        for (const sid of ids) {
          const a = asientos.find((x) => Number(x.id) === Number(sid));
          if (!a) continue;
          const z = zonaById.get(String(a.id_zona_tarifa));
          sum += Number(z?.precio || 0);
        }
        if (!cancelled) setTotalRecalculado(Math.round(sum * 100) / 100);
      } catch {
        if (!cancelled) setTotalRecalculado(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventoId, seatIdsFromNav, totalEstimadoNav]);

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <span className={styles.spinner} />
        Cargando…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (needsProfile) {
    return <Navigate to="/oauth/acceso" replace />;
  }

  if (user?.rol === 'admin') {
    const back = eventoId != null ? `/eventos/${eventoId}` : '/';
    return (
      <div className={styles.centerPage}>
        <div className={styles.card}>
          <h1 className={styles.title}>Compra no disponible</h1>
          <p className={styles.text}>
            Las cuentas de administrador no pueden comprar entradas. Usa una cuenta de comprador para pruebas de pago.
          </p>
          <Link to={back} className={styles.btnPrimary}>
            Volver
          </Link>
        </div>
      </div>
    );
  }

  if (user?.rol === 'organizador') {
    const back = eventoId != null ? `/eventos/${eventoId}` : '/organizador';
    return (
      <div className={styles.centerPage}>
        <div className={styles.card}>
          <h1 className={styles.title}>Compra no disponible</h1>
          <p className={styles.text}>
            Los organizadores no pueden comprar entradas; solo pueden crear y gestionar eventos. Para comprar boletos
            necesitas una cuenta de comprador.
          </p>
          <Link to={back} className={styles.btnPrimary}>
            {eventoId != null ? 'Volver al evento' : 'Ir al panel del organizador'}
          </Link>
        </div>
      </div>
    );
  }
  const ventaCerrada = evento && evento.venta_abierta === false;

  if (eventoId != null && !loadErr && !evento) {
    return (
      <div className={styles.loadingWrap}>
        <span className={styles.spinner} />
        Cargando datos del evento…
      </div>
    );
  }

  if (eventoId != null && loadErr) {
    return (
      <div className={styles.centerPage}>
        <p className={styles.errText}>{loadErr}</p>
        <Link to="/" className={styles.link}>
          Volver a eventos
        </Link>
      </div>
    );
  }

  if (eventoId != null && evento && evento.evento_cancelado) {
    return (
      <div className={styles.centerPage}>
        <div className={styles.cardRed}>
          <h1 className={styles.titleRed}>Evento cancelado</h1>
          <p className={styles.textRed}>
            {evento.motivo_cancelacion || 'Este evento ya no está disponible. No se puede completar la compra.'}
          </p>
          <Link to={`/eventos/${eventoId}`} className={styles.btnPrimary}>
            Ver ficha del evento
          </Link>
        </div>
      </div>
    );
  }

  if (eventoId != null && evento && ventaCerrada) {
    return (
      <div className={styles.centerPage}>
        <div className={styles.card}>
          <h1 className={styles.title}>Venta cerrada</h1>
          <p className={styles.text}>
            Este evento no permite comprar boletos en este momento (fechas de venta del organizador).
          </p>
          <Link to={`/eventos/${eventoId}`} className={styles.btnPrimary}>
            Volver al evento
          </Link>
        </div>
      </div>
    );
  }

  const fechaCheckout = evento?.fecha ? new Date(evento.fecha) : null;
  const mapaRaw = evento ? pickEventMapUrl(evento) : '';
  const mapaHref = normalizeMapUrl(mapaRaw);
  const zonasArr = Array.isArray(evento?.zonas) ? evento.zonas : [];
  const necesitaZona = zonasArr.length > 0;
  const zonaCheckout =
    evento && necesitaZona && zonaIdCheckout != null
      ? zonasArr.find((z) => String(z.id) === String(zonaIdCheckout))
      : null;

  const zonaUsaMapa =
    zonaCheckout &&
    (Number(zonaCheckout.usa_mapa_asientos) === 1 ||
      zonaCheckout.usa_mapa_asientos === true ||
      zonaCheckout.usa_mapa_asientos === '1');
  const seatIdsCheckout = Array.isArray(seatIdsFromNav)
    ? [...new Set(seatIdsFromNav.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
    : [];
  const compraPorAsientos = Boolean(zonaUsaMapa && seatIdsCheckout.length > 0);
  const pagoBloqueadoMapa = Boolean(
    evento && necesitaZona && zonaCheckout && zonaUsaMapa && !compraPorAsientos
  );

  const limMaxCompra = evento
    ? Math.min(100, Math.max(1, Number(evento.limite_boletos_por_transaccion) || 6))
    : 6;
  const dispZona = zonaCheckout ? disponiblesEnZona(zonaCheckout) : 0;
  const dispEvento = evento ? disponiblesEventoAgregado(evento) : 0;
  const maxCantidad = evento
    ? necesitaZona && !zonaCheckout
      ? 0
      : compraPorAsientos
        ? Math.min(limMaxCompra, seatIdsCheckout.length)
        : Math.min(limMaxCompra, zonaCheckout ? dispZona : dispEvento)
    : 1;

  const totalPagar = (() => {
    if (brickSession != null && Number.isFinite(Number(brickSession.total))) {
      return Number(brickSession.total);
    }
    if (compraPorAsientos && seatIdsCheckout.length > 0) {
      const fromNav = Number(totalEstimadoNav);
      if (Number.isFinite(fromNav)) return fromNav;
      if (Number.isFinite(totalRecalculado)) return totalRecalculado;
      return null;
    }
    if (!evento) return null;
    const n = Math.min(maxCantidad, Math.max(1, Math.floor(Number(cantidad) || 1)));
    if (zonaCheckout) return Math.round(Number(zonaCheckout.precio) * n * 100) / 100;
    return Math.round(Number(evento.precio || 0) * n * 100) / 100;
  })();

  const totalPagarLabel = Number.isFinite(totalPagar)
    ? `$${totalPagar.toFixed(2)} MXN`
    : compraPorAsientos && seatIdsCheckout.length > 0
      ? 'Calculando total…'
      : null;

  async function iniciarPagoMercadoPago() {
    if (!eventoId || !evento) return;
    setPayErr(null);
    setPayBusy(true);
    setBrickSession(null);
    try {
      let n = Math.min(maxCantidad, Math.max(1, Math.floor(Number(cantidad) || 1)));
      if (compraPorAsientos) n = seatIdsCheckout.length;
      const body = { eventoId: Number(eventoId), cantidad: n };
      if (zonaCheckout?.id != null) body.zonaId = zonaCheckout.id;
      if (compraPorAsientos) body.seatIds = seatIdsCheckout;
      const data = await apiFetch('/api/payments/create-preference', { method: 'POST', body });
      const initPoint = data.initPoint ?? data.init_point;

      if (data.publicKey && data.ordenId != null && data.total != null) {
        setBrickSession({
          publicKey: data.publicKey,
          ordenId: data.ordenId,
          total: data.total,
          initPoint: initPoint || null,
          demoAutoApprove: Boolean(data.demoAutoApprove),
        });
        return;
      }

      if (initPoint) {
        window.location.href = initPoint;
        return;
      }
      setPayErr(
        [data.error, data.hint].filter(Boolean).join(' — ') || 'No se pudo iniciar el pago'
      );
    } catch (e) {
      const parts = [e.data?.error, e.data?.hint].filter(Boolean);
      setPayErr(parts.length ? parts.join(' — ') : e.message || 'Error al crear la preferencia');
    } finally {
      setPayBusy(false);
    }
  }

  function abrirCheckoutClasico() {
    if (brickSession?.initPoint) {
      window.location.href = brickSession.initPoint;
    }
  }

  async function aprobarPagoDemo() {
    if (!brickSession?.ordenId) return;
    setPayErr(null);
    setPayBusy(true);
    try {
      const data = await apiFetch('/api/payments/demo-approve', {
        method: 'POST',
        body: { ordenId: Number(brickSession.ordenId) },
      });
      if (data?.ok && data?.status === 'approved') {
        navigate('/mis-compras');
        return;
      }
      setPayErr(data?.error || 'No se pudo aprobar el pago demo');
    } catch (e) {
      setPayErr(e?.data?.error || e?.message || 'No se pudo aprobar el pago demo');
    } finally {
      setPayBusy(false);
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.inner}>
        {evento && (
          <div className={styles.eventCard}>
            <EventBannerImage src={evento.imagen} alt="" />
            <div className={styles.eventBody}>
              <p className={styles.cat}>{evento.categoria_nombre || 'Evento'}</p>
              <h2 className={styles.eventTitle}>{evento.titulo}</h2>
              {zonaCheckout && (
                <p className={styles.zonaBox}>
                  {multiZonaTarifas ? (
                    <>
                      <span className={styles.zonaName}>Varias zonas o categorías</span>
                      <span className={styles.zonaSep}> · </span>
                      <span className={styles.zonaPrice}>{totalPagarLabel || 'Total en el pago'}</span>
                    </>
                  ) : (
                    <>
                      {(() => {
                        const zp = describeZonaPresentation(zonaCheckout);
                        return (
                          <span
                            className={styles.zonaTypeBadge}
                            style={{ borderColor: zp.accentColor, backgroundColor: zp.softColor }}
                          >
                            {zp.typeLabel}
                          </span>
                        );
                      })()}
                      <span
                        className={styles.zonaColorDot}
                        style={{
                          backgroundColor: (() => {
                            const fromDb = normalizePlanoColorHex(zonaCheckout.color_plano);
                            if (fromDb) return fromDb;
                            const zi = zonasArr.findIndex((z) => String(z.id) === String(zonaCheckout.id));
                            const i = zi >= 0 ? zi : 0;
                            return PALETA_COLORES_PLANO[i % PALETA_COLORES_PLANO.length].hex;
                          })(),
                        }}
                        title="Color de la zona en el plano"
                        aria-hidden
                      />
                      <span className={styles.zonaName}>{zonaCheckout.nombre_seccion}</span>
                      <span className={styles.zonaSep}> · </span>
                      <span className={styles.zonaPrice}>
                        {compraPorAsientos
                          ? totalPagarLabel || 'Total en el pago'
                          : `$${Number(zonaCheckout.precio).toFixed(2)} MXN`}
                      </span>
                    </>
                  )}
                </p>
              )}
              {fechaCheckout && (
                <>
                  <p className={styles.dateMain}>
                    {fechaCheckout.toLocaleDateString('es-MX', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                  <p className={styles.dateTime}>
                    {fechaCheckout.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </>
              )}
              {shouldRenderMapsLinkButton(mapaRaw, mapaHref) ? (
                <div className={styles.mapWrap}>
                  <GoogleMapsLinkButton href={mapaHref} />
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div className={styles.checkoutCard}>
          <p className={styles.checkoutLabel}>Checkout</p>
          <h1 className={styles.checkoutTitle}>Pago con Mercado Pago</h1>
          <p className={styles.checkoutHelp}>
            El pago lo procesa Mercado Pago de forma segura. Al continuar podrás completar el cobro con tarjeta u otros
            medios que el evento tenga disponibles. Si lo prefieres, también podrás usar la página de pago clásica de
            Mercado Pago en una nueva ventana.
          </p>

          {evento && totalPagarLabel && (
            <p className={styles.totalPagar}>
              <span className={styles.totalPagarLabel}>Total a pagar</span>
              <span className={styles.totalPagarAmount}>{totalPagarLabel}</span>
            </p>
          )}

          {evento && !compraPorAsientos && (
            <div className={styles.qtyBlock}>
              <label className={styles.qtyLabel} htmlFor="cantidad-boletos">
                Cantidad de boletos
              </label>
              <div className={styles.qtyRow}>
                <input
                  id="cantidad-boletos"
                  type="number"
                  min={1}
                  max={maxCantidad}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className={styles.qtyInput}
                />
                <span className={styles.qtyHint}>Máximo en esta compra: {maxCantidad}</span>
              </div>
            </div>
          )}

          {evento && compraPorAsientos && (
            <p className={styles.qtyHint}>
              Estás comprando <strong>{seatIdsCheckout.length}</strong> asiento
              {seatIdsCheckout.length === 1 ? '' : 's'} elegido
              {seatIdsCheckout.length === 1 ? '' : 's'} en la ficha del evento.
            </p>
          )}

          {evento && necesitaZona && !zonaCheckout && (
            <p className={styles.warnZona}>Vuelve a la ficha del evento y elige una zona antes de pagar.</p>
          )}

          {evento && zonaUsaMapa && !compraPorAsientos && zonaCheckout && (
            <p className={styles.warnZona}>
              Esta zona tiene mapa de asientos: vuelve al evento, elige tus asientos en el mapa y usa de nuevo{' '}
              <strong>Comprar entradas</strong>.
            </p>
          )}

          {payErr && <p className={styles.payErr}>{payErr}</p>}

          <PaymentTrustBadges />

          <div className={styles.actions}>
            <button
              type="button"
              disabled={payBusy || !evento || maxCantidad < 1 || pagoBloqueadoMapa || Boolean(brickSession)}
              onClick={iniciarPagoMercadoPago}
              className={styles.btnPay}
            >
              {brickSession
                ? 'Orden lista — usa el formulario de tarjeta abajo'
                : payBusy
                  ? 'Preparando pago…'
                  : 'Continuar al pago'}
            </button>
            <Link to="/" className={styles.btnGhost}>
              Volver a eventos
            </Link>
          </div>

          {brickSession && (
            <>
              {brickSession.demoAutoApprove && isPruebasRole(user?.rol) ? (
                <div className={styles.actions}>
                  <button type="button" className={styles.btnPay} onClick={aprobarPagoDemo} disabled={payBusy}>
                    {payBusy ? 'Aprobando pago demo…' : 'Aprobar pago de prueba (sin cargo real)'}
                  </button>
                </div>
              ) : null}
              <MercadoPagoCardBrick
                publicKey={brickSession.publicKey}
                amount={brickSession.total}
                ordenId={brickSession.ordenId}
                payerEmail={user?.email}
                onApproved={() => navigate('/mis-compras')}
                onPending={() => navigate('/checkout/retorno?status=pending')}
                onRejected={(msg) => setPayErr(msg)}
              />
              {brickSession.initPoint ? (
                <p className={styles.altCheckout}>
                  <button type="button" className={styles.linkBtn} onClick={abrirCheckoutClasico}>
                    Preferir la página clásica de Mercado Pago (redirect)
                  </button>
                </p>
              ) : null}
            </>
          )}
          <p className={styles.footerNote}>
            Tras aprobar el pago, revisa{' '}
            <Link to="/mis-compras" className={styles.footerLink}>
              Mis compras
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
