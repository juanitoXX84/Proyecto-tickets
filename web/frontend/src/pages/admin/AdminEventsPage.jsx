import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../services/api.js';
import styles from './AdminEventsPage.module.css';

const FILTERS = [
  { value: 'pendiente', label: 'Pendientes de revisión' },
  { value: '', label: 'Todos' },
  { value: 'rechazado', label: 'Rechazados' },
  { value: 'cancelados', label: 'Cancelados' },
];

function formatShort(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export function AdminEventsPage() {
  const [filter, setFilter] = useState('pendiente');
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectMotivo, setRejectMotivo] = useState('');
  const [cancelId, setCancelId] = useState(null);
  const [cancelMotivo, setCancelMotivo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = filter ? `?estado=${encodeURIComponent(filter)}` : '';
    try {
      const data = await apiFetch(`/api/admin/events${q}`);
      setEventos(Array.isArray(data.eventos) ? data.eventos : []);
    } catch (e) {
      setError(e.data?.error || e.message || 'No se pudieron cargar los eventos');
      setEventos([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function patchModeracion(id, body) {
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/api/admin/events/${id}/moderacion`, { method: 'PATCH', body });
      await load();
      setRejectId(null);
      setRejectMotivo('');
    } catch (e) {
      setError(e.data?.error || e.message || 'Error');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleDestacado(id, destacado) {
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/api/admin/events/${id}/destacado`, { method: 'PATCH', body: { destacado } });
      await load();
    } catch (e) {
      setError(e.data?.error || e.message || 'Error');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmCancel(id) {
    setBusyId(id);
    setError(null);
    try {
      const data = await apiFetch(`/api/admin/events/${id}/cancelar`, {
        method: 'POST',
        body: { motivo: cancelMotivo.trim() || undefined },
      });
      await load();
      setCancelId(null);
      setCancelMotivo('');
      if (data.compradores_notificados != null) {
        /* opcional: toast */
      }
    } catch (e) {
      setError(e.data?.error || e.message || 'Error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.shell}>
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-2xl font-extrabold text-zinc-900">Eventos</h1>
        <p className="mt-1 text-sm text-zinc-600">
          
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">Vista</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900"
          >
            {FILTERS.map((f) => (
              <option key={f.value || 'all'} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Actualizar
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-16 text-zinc-500">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : eventos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 bg-white py-12 text-center text-zinc-500">
              No hay eventos en esta vista.
            </p>
          ) : (
            eventos.map((ev) => {
              const busy = busyId === ev.id;
              const cancelado = ev.cancelado_at != null && String(ev.cancelado_at).trim() !== '';
              const pendiente = ev.estado_moderacion === 'pendiente' && Number(ev.activo) === 1 && !cancelado;
              const rechazado = ev.estado_moderacion === 'rechazado';
              return (
                <div
                  key={ev.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-display text-lg font-bold text-zinc-900">{ev.titulo}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        ID {ev.id} · Organizador #{ev.idorganizador} · {formatShort(ev.fecha)}
                      </p>
                      <p className="mt-2 text-sm text-zinc-600">
                        <span className="font-semibold">Moderación:</span> {ev.estado_moderacion || '—'}
                        {Number(ev.destacado) === 1 && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                            Destacado
                          </span>
                        )}
                        {cancelado && (
                          <span className="ml-2 font-semibold text-red-700">Cancelado {formatShort(ev.cancelado_at)}</span>
                        )}
                      </p>
                      {rechazado && ev.moderacion_motivo && (
                        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
                          <span className="font-semibold">Motivo:</span> {ev.moderacion_motivo}
                        </p>
                      )}
                      {cancelado && ev.motivo_cancelacion && (
                        <p className="mt-2 text-sm text-zinc-600">{ev.motivo_cancelacion}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/admin/eventos/${ev.id}/vista-previa`}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100"
                      >
                        Vista previa
                      </Link>
                      {!cancelado &&
                        Number(ev.activo) === 1 &&
                        (ev.estado_moderacion === 'aprobado' || ev.estado_moderacion == null || ev.estado_moderacion === '') && (
                          <Link
                            to={`/eventos/${ev.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                          >
                            Ficha pública
                          </Link>
                        )}
                      {pendiente && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => patchModeracion(ev.id, { accion: 'aprobar' })}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setRejectId(ev.id);
                              setRejectMotivo('');
                            }}
                            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-bold text-red-800 hover:bg-red-100 disabled:opacity-50"
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                      {!cancelado && Number(ev.activo) === 1 && ev.estado_moderacion === 'aprobado' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggleDestacado(ev.id, !(Number(ev.destacado) === 1))}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          {Number(ev.destacado) === 1 ? 'Quitar destacado' : 'Destacar en inicio'}
                        </button>
                      )}
                      {!cancelado && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setCancelId(ev.id);
                            setCancelMotivo('');
                          }}
                          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                        >
                          Cancelar evento
                        </button>
                      )}
                    </div>
                  </div>

                  {rejectId === ev.id && (
                    <div className="mt-4 border-t border-zinc-100 pt-4">
                      <label className="block text-sm font-medium text-zinc-700">Motivo del rechazo</label>
                      <textarea
                        value={rejectMotivo}
                        onChange={(e) => setRejectMotivo(e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                        placeholder="Describe qué debe corregir el organizador"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy || !rejectMotivo.trim()}
                          onClick={() => patchModeracion(ev.id, { accion: 'rechazar', motivo: rejectMotivo.trim() })}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Confirmar rechazo
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectId(null)}
                          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  )}

                  {cancelId === ev.id && (
                    <div className="mt-4 border-t border-zinc-100 pt-4">
                      <p className="text-sm text-zinc-600">
                        Se bloquearán ventas y se enviará un correo a los compradores con boletos pagados (si existe SMTP
                        en el servidor).
                      </p>
                      <label className="mt-3 block text-sm font-medium text-zinc-700">Motivo (opcional)</label>
                      <textarea
                        value={cancelMotivo}
                        onChange={(e) => setCancelMotivo(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => confirmCancel(ev.id)}
                          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                        >
                          Confirmar cancelación
                        </button>
                        <button
                          type="button"
                          onClick={() => setCancelId(null)}
                          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
