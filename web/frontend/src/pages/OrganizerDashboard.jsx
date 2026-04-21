import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PasswordInput } from '../components/forms/PasswordInput.jsx';
import { apiFetch } from '../services/api.js';
import styles from './OrganizerDashboard.module.css';

export function OrganizerDashboard() {
  const [eventos, setEventos] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch('/api/organizer/events');
        if (!cancelled) setEventos(data.eventos || []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'No se pudieron cargar tus eventos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function openDelete(ev) {
    setDeleteTarget(ev);
    setDeletePassword('');
    setDeleteError(null);
  }

  function closeDelete() {
    if (deleteLoading) return;
    setDeleteTarget(null);
    setDeletePassword('');
    setDeleteError(null);
  }

  async function confirmDelete(e) {
    e.preventDefault();
    if (!deleteTarget) return;
    setDeleteError(null);
    if (!deletePassword.trim()) {
      setDeleteError('Escribe tu contraseña para confirmar.');
      return;
    }
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/organizer/events/${deleteTarget.id}`, {
        method: 'DELETE',
        body: { password: deletePassword },
      });
      setEventos((list) => list.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeletePassword('');
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err.data?.error || err.message || 'No se pudo eliminar');
    } finally {
      setDeleteLoading(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <span className={styles.spinner} />
        Cargando panel…
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorWrap}>
        <p className={styles.errorText}>{error}</p>
        <Link to="/" className={styles.link}>
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Panel del organizador</h1>
          
        </div>
        <Link to="eventos/nuevo" className={styles.btnNew}>
          + Nuevo evento
        </Link>
      </div>
      <ul className={styles.list}>
        {eventos.map((ev) => {
          const cancelado = ev.cancelado_at != null && String(ev.cancelado_at).trim() !== '';
          const mod = ev.estado_moderacion;
          let estadoTxt = Number(ev.activo) === 1 ? 'Publicado' : 'Borrador';
          let estadoCls = Number(ev.activo) === 1 ? styles.estadoEmerald : styles.estadoAmber;
          if (cancelado) {
            estadoTxt = 'Cancelado';
            estadoCls = styles.estadoRed;
          } else if (mod === 'pendiente' && Number(ev.activo) === 1) {
            estadoTxt = 'En revisión';
            estadoCls = styles.estadoAmber;
          } else if (mod === 'rechazado') {
            estadoTxt = 'Rechazado';
            estadoCls = styles.estadoRed;
          } else if (mod === 'borrador' && Number(ev.activo) === 0) {
            estadoTxt = 'Borrador';
            estadoCls = styles.estadoAmber;
          }
          const verPublicoOk =
            !cancelado && Number(ev.activo) === 1 && (mod == null || mod === '' || mod === 'aprobado');
          return (
          <li key={ev.id} className={styles.row}>
            <div>
              <p className={styles.eventTitle}>{ev.titulo}</p>
              <p className={styles.meta}>
                {ev.fecha ? new Date(ev.fecha).toLocaleString('es-MX') : ''} ·{' '}
                <span className={estadoCls}>{estadoTxt}</span>
                {ev.categoria_nombre && (
                  <>
                    {' '}
                    · <span className={styles.cat}>{ev.categoria_nombre}</span>
                  </>
                )}
              </p>
              {mod === 'rechazado' && ev.moderacion_motivo && (
                <p className={styles.modBox}>
                  <span className={styles.modLabel}>Moderación:</span> {ev.moderacion_motivo}
                </p>
              )}
            </div>
            <div className={styles.actions}>
              <Link to={`eventos/${ev.id}/editar`} className={styles.btnEdit}>
                Editar
              </Link>
              {verPublicoOk ? (
                <Link to={`/eventos/${ev.id}`} className={styles.btnPublic}>
                  Ver público
                </Link>
              ) : (
                <span
                  className={styles.btnPublicDisabled}
                  title="Disponible cuando el evento esté aprobado y publicado"
                >
                  Ver público
                </span>
              )}
              <button type="button" onClick={() => openDelete(ev)} className={styles.btnDelete}>
                Eliminar
              </button>
            </div>
          </li>
          );
        })}
      </ul>
      {eventos.length === 0 && (
        <p className={styles.empty}>
          Aún no tienes eventos.{' '}
          <Link to="eventos/nuevo" className={styles.emptyLink}>
            Crea el primero
          </Link>
          .
        </p>
      )}

      {deleteTarget && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-event-title"
          onClick={closeDelete}
        >
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-event-title" className={styles.modalTitle}>
              Eliminar evento
            </h2>
            <p className={styles.modalText}>
              Vas a eliminar <strong className={styles.modalStrong}>{deleteTarget.titulo}</strong>. Esta acción no se puede
              deshacer. Escribe la contraseña de tu cuenta en Ticket Rivals para confirmar.
            </p>
            <form onSubmit={confirmDelete} className={styles.modalForm}>
              <div>
                <label htmlFor="delete-event-password" className={styles.modalLabel}>
                  Contraseña
                </label>
                <PasswordInput
                  id="delete-event-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className={styles.modalInput}
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                />
              </div>
              {deleteError && <p className={styles.modalErr}>{deleteError}</p>}
              <div className={styles.modalActions}>
                <button type="button" onClick={closeDelete} disabled={deleteLoading} className={styles.btnCancel}>
                  Cancelar
                </button>
                <button type="submit" disabled={deleteLoading} className={styles.btnDanger}>
                  {deleteLoading ? 'Eliminando…' : 'Eliminar definitivamente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
