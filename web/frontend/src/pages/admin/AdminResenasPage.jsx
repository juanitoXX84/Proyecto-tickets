import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../services/api.js';
import styles from './AdminUsersPage.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function StarsMini({ n }) {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return (
    <span className="inline-flex gap-0.5 text-lg leading-none" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= v ? 'text-amber-400' : 'text-zinc-200'}>
          ★
        </span>
      ))}
    </span>
  );
}

export function AdminResenasPage() {
  const [reseñas, setReseñas] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [soloVisibles, setSoloVisibles] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (soloVisibles) params.set('solo_visibles', '1');
    try {
      const data = await apiFetch(`/api/admin/resenas?${params.toString()}`);
      setReseñas(Array.isArray(data.reseñas) ? data.reseñas : []);
      setTotal(Number(data.total) || 0);
    } catch (e) {
      setError(e.data?.error || e.message || 'No se pudieron cargar las reseñas');
      setReseñas([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, soloVisibles]);

  useEffect(() => {
    load();
  }, [load]);

  async function setOculto(id, oculto) {
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/resenas/${id}`, { method: 'PATCH', body: { oculto } });
      await load();
    } catch (e) {
      window.alert(e.data?.error || e.message || 'Error al actualizar');
    } finally {
      setBusyId(null);
    }
  }

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar esta reseña de forma permanente?')) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/resenas/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      window.alert(e.data?.error || e.message || 'Error al eliminar');
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className={styles.shell}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-zinc-900">Reseñas</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Moderación: oculta contenido inapropiado o elimínalo del sitio.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-700">
          <input
            type="checkbox"
            checked={soloVisibles}
            onChange={(e) => {
              setPage(1);
              setSoloVisibles(e.target.checked);
            }}
            className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
          />
          Solo públicas (no ocultas)
        </label>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <p className="text-zinc-500">Cargando…</p>
      ) : reseñas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-12 text-center text-sm text-zinc-500">
          No hay reseñas registradas.
        </p>
      ) : (
        <ul className="space-y-4">
          {reseñas.map((r) => (
            <li
              key={r.id}
              className={`rounded-xl border bg-white p-4 shadow-sm ${
                r.oculto ? 'border-amber-200 bg-amber-50/40' : 'border-zinc-200'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StarsMini n={r.estrellas} />
                    {r.oculto && (
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold uppercase text-amber-900">
                        Oculta
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-semibold text-zinc-900">
                    <Link
                      to={`/admin/eventos/${r.idevento}/vista-previa`}
                      className="text-brand-700 hover:underline"
                    >
                      {r.evento_titulo || `Evento #${r.idevento}`}
                    </Link>
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {r.usuario_email}
                    {r.usuario_nombre || r.usuario_apellido
                      ? ` · ${[r.usuario_nombre, r.usuario_apellido].filter(Boolean).join(' ')}`
                      : ''}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">{formatDate(r.creado_en)}</p>
                  {r.comentario ? (
                    <p className="mt-3 whitespace-pre-wrap rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                      {r.comentario}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm italic text-zinc-400">Sin comentario de texto</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  {r.oculto ? (
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => setOculto(r.id, false)}
                      className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Mostrar
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => setOculto(r.id, true)}
                      className="rounded-full bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      Ocultar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => eliminar(r.id)}
                    className="rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-zinc-600">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
