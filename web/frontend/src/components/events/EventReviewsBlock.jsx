import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../services/api.js';
import { isBuyerLikeRole, isPruebasRole } from '../../utils/roles.js';
import styles from './EventReviewsBlock.module.css';

const MOTIVO_TEXTO = {
  ya_reseño: 'Ya enviaste tu reseña para este evento. ¡Gracias!',
  evento_no_ha_terminado: 'Podrás dejar tu calificación cuando el evento haya terminado.',
  sin_compra_aprobada: 'Solo pueden reseñar quienes compraron entrada y el pago quedó aprobado.',
  evento_cancelado: 'No se publican reseñas nuevas en eventos cancelados.',
  rol_no_permitido: null,
  servicio_no_disponible:
    'Las reseñas no están disponibles en este momento (error al consultar el servidor).',
  schema_resenas_faltante:
    'En el servidor falta crear la tabla de reseñas. Ejecuta en MySQL el archivo database/schema_evento_resenas.sql y reinicia el backend.',
  perfil_incompleto_api:
    'Completa tu perfil para poder enviar la reseña (comprueba también que tu sesión esté activa).',
  sesion_invalida:
    'Tu sesión expiró o falta el token. Cierra sesión y vuelve a iniciar sesión para enviar una reseña.',
  api_fetch_error:
    'No se pudo consultar el servidor si puedes dejar una reseña. Detalle técnico abajo (útil para depurar).',
};

function StarsDisplay({ value }) {
  const v = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return (
    <span className={styles.starsRow} aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= v ? styles.starOn : styles.starOff}>
          ★
        </span>
      ))}
    </span>
  );
}

export function EventReviewsBlock({ eventId, user, needsProfile, authLoading }) {
  const [loadingResenas, setLoadingResenas] = useState(true);
  const [resenasErr, setResenasErr] = useState(null);
  const [promedio, setPromedio] = useState(null);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState([]);

  const [estado, setEstado] = useState(null);
  const [estadoFetchErr, setEstadoFetchErr] = useState(null);
  const [loadingEstado, setLoadingEstado] = useState(false);

  const [estrellas, setEstrellas] = useState(5);
  const [comentario, setComentario] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState(null);
  const [submitOk, setSubmitOk] = useState(false);

  const loadResenas = useCallback(async () => {
    setLoadingResenas(true);
    setResenasErr(null);
    try {
      const data = await apiFetch(`/api/events/${eventId}/resenas`);
      setPromedio(data.promedio ?? null);
      setTotal(Number(data.total) || 0);
      setItems(Array.isArray(data.reseñas) ? data.reseñas : []);
    } catch (e) {
      setResenasErr(e.message || 'No se pudieron cargar las reseñas');
      setItems([]);
      setTotal(0);
      setPromedio(null);
    } finally {
      setLoadingResenas(false);
    }
  }, [eventId]);

  const loadEstado = useCallback(async () => {
    setEstadoFetchErr(null);
    if (!eventId || !user || needsProfile || !isBuyerLikeRole(user.rol)) {
      setEstado(null);
      return;
    }
    setLoadingEstado(true);
    try {
      const data = await apiFetch(`/api/events/${eventId}/resenas/estado`);
      setEstado(data);
    } catch (err) {
      const detail = err?.data?.error || err?.message || '';
      if (err?.status === 403 && err?.data?.code === 'PERFIL_INCOMPLETO') {
        setEstado({
          ok: true,
          puedeResenar: false,
          yaReseno: false,
          motivo: 'perfil_incompleto_api',
        });
      } else if (err?.status === 401) {
        setEstado({
          ok: true,
          puedeResenar: false,
          yaReseno: false,
          motivo: 'sesion_invalida',
        });
        setEstadoFetchErr(detail);
      } else {
        setEstado({
          ok: true,
          puedeResenar: false,
          yaReseno: false,
          motivo: 'api_fetch_error',
        });
        setEstadoFetchErr(detail || `HTTP ${err?.status || '?'}`);
      }
    } finally {
      setLoadingEstado(false);
    }
  }, [eventId, user, needsProfile]);

  useEffect(() => {
    loadResenas();
  }, [loadResenas]);

  useEffect(() => {
    loadEstado();
  }, [loadEstado]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitErr(null);
    setSubmitOk(false);
    setSubmitBusy(true);
    try {
      await apiFetch(`/api/events/${eventId}/resenas`, {
        method: 'POST',
        body: {
          estrellas,
          comentario: comentario.trim() || undefined,
        },
      });
      setSubmitOk(true);
      setComentario('');
      await loadResenas();
      await loadEstado();
    } catch (err) {
      setSubmitErr(err.data?.error || err.message || 'No se pudo enviar la reseña');
    } finally {
      setSubmitBusy(false);
    }
  }

  const showForm =
    user &&
    !needsProfile &&
    isBuyerLikeRole(user.rol) &&
    estado?.puedeResenar &&
    !authLoading &&
    !loadingEstado;

  const motivoBloqueo =
    user && !needsProfile && isBuyerLikeRole(user.rol) && estado && !estado.puedeResenar && estado.motivo
      ? estado.motivo === 'ya_reseño'
        ? null
        : MOTIVO_TEXTO[estado.motivo] ?? estado.motivo
      : null;

  const loginHint = !user && (
    <p className={styles.formHint}>
      <Link to={`/login?next=/eventos/${eventId}`} className="font-semibold text-brand-700 hover:underline">
        Inicia sesión
      </Link>{' '}
      con tu cuenta de comprador para ver si puedes dejar una reseña después del evento.
    </p>
  );

  return (
    <section className={styles.section} aria-labelledby="reviews-heading">
      <h2 id="reviews-heading" className={styles.title}>
        Reseñas y calificaciones
      </h2>
      <p className={styles.lead}>Opiniones de asistentes con entrada confirmada.</p>

      {resenasErr && <div className={styles.errBanner}>{resenasErr}</div>}

      {loadingResenas ? (
        <p className={styles.loading}>Cargando reseñas…</p>
      ) : (
        <>
          <div className={styles.summaryRow}>
            {total > 0 && promedio != null ? (
              <>
                <span className={styles.avgNum}>{promedio.toFixed(1)}</span>
                <div>
                  <StarsDisplay value={promedio} />
                  <p className={styles.avgLabel}>de 5 estrellas</p>
                </div>
                <p className={styles.countMeta}>
                  Según <strong>{total}</strong> {total === 1 ? 'reseña' : 'reseñas'}
                </p>
              </>
            ) : (
              <p className={styles.countMeta}>Aún no hay reseñas publicadas para este evento.</p>
            )}
          </div>

          {items.length === 0 && total === 0 && !resenasErr ? (
            <p className={styles.empty}>Cuando los asistentes califiquen el evento, verás sus comentarios aquí.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((r) => (
                <li key={r.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <span className={styles.author}>{r.autor}</span>
                    <StarsDisplay value={r.estrellas} />
                  </div>
                  {r.creado_en && (
                    <p className={styles.date}>
                      {new Date(r.creado_en).toLocaleString('es-MX', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  )}
                  {r.comentario ? <p className={styles.comment}>{r.comentario}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {loginHint}

      {user && needsProfile && (
        <p className={`${styles.formHint} mt-4`}>
          <Link to="/oauth/acceso" className="font-semibold text-brand-700 hover:underline">
            Completa tu perfil
          </Link>{' '}
          para poder dejar una reseña si corresponde.
        </p>
      )}

      {motivoBloqueo && (
        <p className={`${styles.formHint} mt-4 rounded-lg border border-zinc-200 bg-white px-3 py-2`}>
          {motivoBloqueo}
          {estadoFetchErr ? (
            <span className="mt-2 block font-mono text-xs text-red-700">{estadoFetchErr}</span>
          ) : null}
        </p>
      )}

      {user && !needsProfile && isBuyerLikeRole(user.rol) && estado?.yaReseno && (
        <p className={`${styles.formOk} mt-4`}>{MOTIVO_TEXTO.ya_reseño}</p>
      )}

      {showForm && (
        <form className={styles.formWrap} onSubmit={handleSubmit}>
          <h3 className={styles.formTitle}>Tu reseña</h3>
          {isPruebasRole(user?.rol) ? (
            <p className={styles.formHintPruebas}>
              Cuenta de pruebas: puedes publicar reseñas aunque el evento aún no haya terminado.
            </p>
          ) : null}
          <p className={styles.formHint}>Califica de 1 a 5 estrellas. El comentario es opcional.</p>

          <div className={styles.starPick}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`${styles.starBtn} ${estrellas === n ? styles.starBtnSel : ''}`}
                onClick={() => setEstrellas(n)}
                aria-label={`${n} estrellas`}
              >
                ★
              </button>
            ))}
          </div>

          <label className={styles.label} htmlFor={`review-comment-${eventId}`}>
            Comentario (opcional)
          </label>
          <textarea
            id={`review-comment-${eventId}`}
            className={styles.textarea}
            rows={4}
            maxLength={2000}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Cuéntanos cómo fue tu experiencia…"
          />

          {submitErr && <p className={styles.formErr}>{submitErr}</p>}
          {submitOk && <p className={styles.formOk}>¡Gracias! Tu reseña ya está publicada.</p>}

          <button type="submit" className={styles.btnSubmit} disabled={submitBusy}>
            {submitBusy ? 'Enviando…' : 'Publicar reseña'}
          </button>
        </form>
      )}
    </section>
  );
}
