import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../services/api.js';
import styles from './MyPurchases.module.css';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export function MyPurchases() {
  const { user, loading: authLoading } = useAuth();
  const [ordenes, setOrdenes] = useState([]);
  const [boletos, setBoletos] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resendBusyId, setResendBusyId] = useState(null);
  const [resendMsgByOrder, setResendMsgByOrder] = useState({});

  useEffect(() => {
    if (!user) return;
    if (user.rol === 'organizador') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch('/api/user/purchases');
        if (!cancelled) {
          setOrdenes(data.ordenes || []);
          setBoletos(data.boletos || []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'No se pudo cargar el historial');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function resendTickets(ordenId) {
    if (!ordenId) return;
    setResendBusyId(ordenId);
    setResendMsgByOrder((prev) => ({ ...prev, [ordenId]: null }));
    try {
      const data = await apiFetch(`/api/user/purchases/${ordenId}/resend-tickets`, { method: 'POST' });
      const msg =
        data?.delivery?.mode === 'console'
          ? 'SMTP no está activo; revisa la consola del backend.'
          : 'QR reenviado a tu correo.';
      setResendMsgByOrder((prev) => ({ ...prev, [ordenId]: msg }));
    } catch (e) {
      setResendMsgByOrder((prev) => ({
        ...prev,
        [ordenId]: e.message || 'No se pudo reenviar el QR',
      }));
    } finally {
      setResendBusyId(null);
    }
  }

  if (authLoading) {
    return (
      <div className={styles.loadingWrap}>
        <span className={styles.spinner} />
        Cargando…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login?next=/mis-compras" replace />;
  }

  if (user.rol === 'organizador') {
    return (
      <div className={styles.shell}>
        <div className={styles.inner}>
          <div className={styles.header}>
            <h1 className={styles.title}>Mis compras</h1>
            <p className={styles.lead}>
              Las cuentas de organizador no compran entradas en la plataforma. Gestiona tus eventos desde el panel del
              organizador o usa una cuenta de comprador si necesitas boletos.
            </p>
            <p className="mt-6">
              <Link to="/organizador" className={styles.emptyLink}>
                Ir al panel del organizador →
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <p className={styles.kicker}>Cuenta</p>
          <h1 className={styles.title}>Mis compras</h1>
          <p className={styles.lead}>
            Órdenes y boletos asociados a tu cuenta.
          </p>
        </div>

        {error && <div className={styles.bannerErr}>{error}</div>}

        {loading ? (
          <div className={styles.loadingInner}>
            <span className={styles.spinner} />
            Cargando historial…
          </div>
        ) : (
          <div className={styles.stack}>
            <section>
              <h2 className={styles.sectionTitle}>Órdenes</h2>
              {ordenes.length === 0 ? (
                <p className={styles.empty}>
                  Aún no hay órdenes.{' '}
                  <Link to="/" className={styles.emptyLink}>
                    Explorar eventos
                  </Link>
                </p>
              ) : (
                <ul className={styles.list}>
                  {ordenes.map((o) => (
                    <li key={o.id} className={styles.orderRow}>
                      <div>
                        <p className={styles.monoId}>Orden #{o.id}</p>
                        <p className={styles.rowTitle}>{o.evento_titulo || 'Evento'}</p>
                        <p className={styles.rowMeta}>{formatWhen(o.fecha_creacion)}</p>
                        {resendMsgByOrder[o.id] ? (
                          <p className={styles.resendMsg}>{resendMsgByOrder[o.id]}</p>
                        ) : null}
                      </div>
                      <div className={styles.rowRight}>
                        <p className={styles.price}>
                          ${Number(o.total || 0).toFixed(2)} <span className={styles.priceUnit}>MXN</span>
                        </p>
                        <p className={styles.estado}>{o.estado || '—'}</p>
                        {['pagado', 'completada'].includes(String(o.estado || '').toLowerCase()) ? (
                          <button
                            type="button"
                            onClick={() => resendTickets(o.id)}
                            disabled={resendBusyId === o.id}
                            className={styles.resendBtn}
                          >
                            {resendBusyId === o.id ? 'Reenviando…' : 'Reenviar QR al correo'}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className={styles.sectionTitle}>Boletos</h2>
              {boletos.length === 0 ? (
                <p className={styles.empty}>No hay boletos emitidos a tu nombre todavía.</p>
              ) : (
                <ul className={styles.list}>
                  {boletos.map((b) => (
                    <li key={b.id} className={styles.orderRow}>
                      <div>
                        <p className={styles.boletoTitle}>{b.evento_titulo || 'Evento'}</p>
                        {(b.zona_nombre || Number.isFinite(Number(b.precio_unitario))) && (
                          <p className={styles.boletoZonaPrecio}>
                            {b.zona_nombre ? (
                              <>
                                Zona: <strong>{b.zona_nombre}</strong>
                              </>
                            ) : null}
                            {b.zona_nombre && Number.isFinite(Number(b.precio_unitario)) ? ' · ' : null}
                            {Number.isFinite(Number(b.precio_unitario)) ? (
                              <>
                                <strong>${Number(b.precio_unitario).toFixed(2)}</strong> MXN
                              </>
                            ) : null}
                          </p>
                        )}
                        <p className={styles.rowMeta}>{formatWhen(b.evento_fecha)}</p>
                        {b.codigo && (
                          <p className={styles.codigo}>
                            Código: <span className={styles.codigoVal}>{b.codigo}</span>
                          </p>
                        )}
                      </div>
                      <p className={styles.boletoEstado}>{b.estado || '—'}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <p className={styles.footer}>
          <Link to="/" className={styles.footerLink}>
            ← Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
