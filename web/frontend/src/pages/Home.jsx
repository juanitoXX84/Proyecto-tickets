import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, getToken } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { disponiblesParaListado } from '../utils/ticketAvailability.js';
import styles from './Home.module.css';

/** Solo eventos marcados como destacados por administración (el carrusel no mezcla el resto del listado). */
function heroPoolFrom(list) {
  if (!list.length) return [];
  return list.filter((e) => Number(e.destacado) === 1);
}

function eventSearchBlob(ev) {
  return [ev.titulo, ev.ubicacion, ev.descripcion, ev.categoria_nombre, ev.recinto, ev.direccion]
    .map((x) => (x == null ? '' : String(x).toLowerCase()))
    .join(' ');
}

function matchesSearchQuery(ev, tokens) {
  if (!tokens.length) return true;
  const blob = eventSearchBlob(ev);
  return tokens.every((t) => blob.includes(t));
}

function formatEventDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return {
    weekday: d.toLocaleDateString('es-MX', { weekday: 'short' }),
    day: d.getDate(),
    month: d.toLocaleDateString('es-MX', { month: 'short' }),
    time: d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    full: d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }),
  };
}

export function Home() {
  const { user, loading: authLoading } = useAuth();
  const showRegisterCta = !user && !(getToken() && authLoading);
  const [searchParams] = useSearchParams();
  const categoriaId = searchParams.get('categoria_id');
  const qRaw = String(searchParams.get('q') ?? '');
  const searchTokens = useMemo(
    () =>
      qRaw
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    [qRaw]
  );

  const [eventos, setEventos] = useState([]);
  const [destacadoIndex, setDestacadoIndex] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const visibleEventos = useMemo(
    () => eventos.filter((ev) => matchesSearchQuery(ev, searchTokens)),
    [eventos, searchTokens]
  );
  const destacadosVisibles = useMemo(() => heroPoolFrom(visibleEventos), [visibleEventos]);
  const destacadoActual = destacadosVisibles[destacadoIndex] || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const q =
          categoriaId && /^\d+$/.test(categoriaId)
            ? `?categoria_id=${encodeURIComponent(categoriaId)}`
            : '';
        const data = await apiFetch(`/api/events${q}`);
        const list = data.eventos || [];
        if (!cancelled) {
          setEventos(list);
          setDestacadoIndex(0);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'No se pudieron cargar los eventos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoriaId]);

  useEffect(() => {
    if (!destacadosVisibles.length) {
      setDestacadoIndex(0);
      return;
    }
    setDestacadoIndex((prev) => Math.min(prev, destacadosVisibles.length - 1));
  }, [destacadosVisibles]);

  /** Carrusel automatico solo entre destacados visibles (busqueda/categoria aplican al pool). */
  useEffect(() => {
    if (destacadosVisibles.length <= 1) return undefined;
    const intervalMs = 5500;
    const id = setInterval(() => {
      setDestacadoIndex((prev) => (prev + 1) % destacadosVisibles.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [destacadosVisibles]);

  function goPrevDestacado() {
    if (destacadosVisibles.length <= 1) return;
    setDestacadoIndex((prev) => (prev - 1 + destacadosVisibles.length) % destacadosVisibles.length);
  }

  function goNextDestacado() {
    if (destacadosVisibles.length <= 1) return;
    setDestacadoIndex((prev) => (prev + 1) % destacadosVisibles.length);
  }

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.loadingInner}>
          <span className={styles.spinner} />
          Cargando eventos…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorWrap}>
        <p className={styles.errorBox}>{error}</p>
        <p className={styles.errorHint}>
          Comprueba que la API esté en marcha y que la base de datos esté configurada en{' '}
          <code className={styles.inlineCode}>.env</code>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <section className={styles.hero}>
        <div className={styles.heroBlobs}>
          <div className={styles.heroBlob1} />
          <div className={styles.heroBlob2} />
        </div>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.heroKicker}>Entradas oficiales</p>
            <h1 className={styles.heroTitle}>Vive el evento antes del evento</h1>
            <p className={styles.heroLead}>
              Descubre conciertos, deportes y más. 
            </p>
            <div className={styles.heroCtas}>
              {showRegisterCta && (
                <Link to="/registro" className={styles.btnRegister}>
                  Crear cuenta
                </Link>
              )}
              <a href="#eventos" className={styles.btnGhost}>
                Ver eventos
              </a>
            </div>
          </div>
          {destacadoActual && (
            <div className={styles.heroAside}>
              {(() => {
                const cupoDest = disponiblesParaListado(destacadoActual);
                const agotadoDest = cupoDest <= 0;
                return (
                  <div className={styles.featuredCarousel}>
                    <Link
                      key={destacadoActual.id}
                      to={`/eventos/${destacadoActual.id}`}
                      className={`group ${agotadoDest ? styles.featuredLinkAgotado : styles.featuredLink} ${styles.featuredSlide}`}
                    >
                      <div className={styles.featuredMedia}>
                        {destacadoActual.imagen ? (
                          <img
                            src={destacadoActual.imagen}
                            alt=""
                            sizes="(min-width: 1024px) 50vw, 100vw"
                            decoding="async"
                            fetchPriority="high"
                            className={agotadoDest ? styles.featuredImgAgotado : styles.featuredImg}
                          />
                        ) : (
                          <div className={styles.featuredPlaceholder}>🎫</div>
                        )}
                        {agotadoDest && <div className={styles.badgeSinCupo}>Sin cupo</div>}
                      </div>
                      <div className={styles.featuredFooter}>
                        <p className={styles.featuredKicker}>Destacado</p>
                        <p className={styles.featuredTitle}>{destacadoActual.titulo}</p>
                        <p className={styles.featuredUbic}>{destacadoActual.ubicacion}</p>
                      </div>
                    </Link>

                    {destacadosVisibles.length > 1 && (
                      <div className={styles.carouselControls}>
                        <button type="button" onClick={goPrevDestacado} className={styles.carouselBtn} aria-label="Anterior destacado">
                          ‹
                        </button>
                        <div className={styles.carouselDots}>
                          {destacadosVisibles.map((item, idx) => (
                            <button
                              key={item.id}
                              type="button"
                              aria-label={`Ir al destacado ${idx + 1}`}
                              onClick={() => setDestacadoIndex(idx)}
                              className={idx === destacadoIndex ? styles.carouselDotActive : styles.carouselDot}
                            />
                          ))}
                        </div>
                        <button type="button" onClick={goNextDestacado} className={styles.carouselBtn} aria-label="Siguiente destacado">
                          ›
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </section>

      <section id="eventos" className={styles.listSection}>
        <div className={styles.listHeader}>
          <div>
            <h2 className={styles.listTitle}>Próximos eventos</h2>
            <p className={styles.listSubtitle}>Selecciona un evento para ver detalles y disponibilidad</p>
            {searchTokens.length > 0 && (
              <p className={styles.searchHint}>
                Resultados para «{qRaw.trim()}» · {visibleEventos.length} de {eventos.length}
              </p>
            )}
          </div>
        </div>

        {eventos.length === 0 ? (
          <p className={styles.empty}>No hay eventos públicos por ahora.</p>
        ) : visibleEventos.length === 0 ? (
          <p className={styles.empty}>
            No hay eventos que coincidan con «{qRaw.trim()}». Prueba otras palabras o borra el filtro de búsqueda.
          </p>
        ) : (
          <ul className={styles.eventList}>
            {visibleEventos.map((ev) => {
              const d = formatEventDate(ev.fecha);
              const cupo = disponiblesParaListado(ev);
              const agotado = cupo <= 0;
              return (
                <li key={ev.id}>
                  <Link
                    to={`/eventos/${ev.id}`}
                    className={`group ${agotado ? styles.cardLinkAgotado : styles.cardLink}`}
                  >
                    <div className={styles.cardMediaCol}>
                      <div className={styles.cardMedia}>
                        {ev.imagen ? (
                          <img
                            src={ev.imagen}
                            alt=""
                            sizes="(min-width: 768px) 224px, 100vw"
                            decoding="async"
                            className={agotado ? styles.cardImgAgotado : styles.cardImg}
                          />
                        ) : (
                          <div className={styles.cardImgPh}>🎵</div>
                        )}
                        {Number(ev.destacado) === 1 && <div className={styles.badgeDestacado}>Destacado</div>}
                        {agotado && <div className={styles.badgeCupo}>Sin cupo</div>}
                      </div>
                    </div>
                    <div className={styles.cardBody}>
                      <div className={styles.dateCol}>
                        <div className={agotado ? styles.dateBoxAgotado : styles.dateBox}>
                          <p className={agotado ? styles.dateWeekAgotado : styles.dateWeek}>{d.weekday}</p>
                          <p className={styles.dateDay}>{d.day}</p>
                          <p className={styles.dateMonth}>{d.month}</p>
                        </div>
                        <p className={styles.dateFullMobile}>{d.full}</p>
                      </div>
                      <div className={styles.contentCol}>
                        <p className={agotado ? styles.catAgotado : styles.cat}>{ev.categoria_nombre || 'Evento'}</p>
                        <h3 className={agotado ? styles.h3Agotado : styles.h3}>{ev.titulo}</h3>
                        <p className={styles.ubic}>{ev.ubicacion}</p>
                        <p className={styles.dateFullDesktop}>{d.full}</p>
                      </div>
                      <div className={styles.priceCol}>
                        <p className={agotado ? styles.priceAgotado : styles.price}>
                          ${Number(ev.precio).toFixed(2)} <span className={styles.priceUnit}>MXN</span>
                        </p>
                        <span className={agotado ? styles.pillAgotado : styles.pill}>
                          {agotado ? 'Sin cupo' : 'Ver entradas'}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
