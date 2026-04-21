import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../services/api.js';
import styles from './AdminUsersPage.module.css';

const ROLES = [
  { value: '', label: 'Todos los roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'organizador', label: 'Organizador' },
  { value: 'usuario', label: 'Comprador' },
  { value: 'pruebas', label: 'Pruebas' },
];

const DEBOUNCE_MS = 400;

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

function metodoLabel(m) {
  if (m === 'google') return 'Google';
  if (m === 'password') return 'Manual';
  return '—';
}

export function AdminUsersPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [rolFilter, setRolFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rowBusy, setRowBusy] = useState({});
  const debounceRef = useRef(null);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQ(qInput.trim()), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q) params.set('q', q);
    if (rolFilter) params.set('rol', rolFilter);
    try {
      const data = await apiFetch(`/api/admin/users?${params.toString()}`);
      setUsuarios(Array.isArray(data.usuarios) ? data.usuarios : []);
      setTotal(Number(data.total) || 0);
    } catch (e) {
      setError(e.data?.error || e.message || 'No se pudieron cargar los usuarios');
      setUsuarios([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, q, rolFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function patchUser(id, body) {
    setRowBusy((b) => ({ ...b, [id]: true }));
    try {
      const data = await apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body });
      const u = data.usuario;
      if (u) {
        setUsuarios((list) =>
          list.map((row) => (row.id === id ? { ...row, ...u, tiene_google: u.tiene_google ? 1 : 0 } : row))
        );
      } else {
        await load();
      }
    } catch (e) {
      setError(e.data?.error || e.message || 'Error al guardar');
    } finally {
      setRowBusy((b) => {
        const next = { ...b };
        delete next[id];
        return next;
      });
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className={styles.shell}>
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-2xl font-extrabold text-zinc-900">Usuarios</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Búsqueda por nombre o correo, filtro por rol, cambio de permisos y suspensión de cuentas.
        </p>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[200px] flex-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">Buscar</label>
            <input
              type="search"
              value={qInput}
              onChange={(e) => {
                setPage(1);
                setQInput(e.target.value);
              }}
              placeholder="Nombre o correo"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div className="w-full sm:w-48">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">Rol</label>
            <select
              value={rolFilter}
              onChange={(e) => {
                setPage(1);
                setRolFilter(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {ROLES.map((r) => (
                <option key={r.value || 'all'} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-zinc-500">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-bold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3">Rol</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Último acceso</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {usuarios.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                        No hay usuarios con estos criterios.
                      </td>
                    </tr>
                  ) : (
                    usuarios.map((u) => {
                      const busy = Boolean(rowBusy[u.id]);
                      const active = Number(u.activo) === 1;
                      return (
                        <tr key={u.id} className="hover:bg-zinc-50/80">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-zinc-900">
                              {[u.nombre, u.apellido].filter(Boolean).join(' ') || '(sin nombre)'}
                            </p>
                            <p className="text-xs text-zinc-500">{u.email}</p>
                            {Boolean(u.tiene_google) && (
                              <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-800">
                                Google vinculado
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              disabled={busy}
                              value={u.rol}
                              onChange={(e) => patchUser(u.id, { rol: e.target.value })}
                              className="max-w-[140px] rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium text-zinc-800 disabled:opacity-50"
                            >
                              <option value="usuario">Comprador</option>
                              <option value="pruebas">Pruebas</option>
                              <option value="organizador">Organizador</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {active ? 'Activo' : 'Suspendido'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-600">
                            <div>{formatDate(u.ultimo_acceso_at)}</div>
                            <div className="text-zinc-400">{metodoLabel(u.ultimo_login_metodo)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => patchUser(u.id, { activo: !active })}
                              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                                active
                                  ? 'border border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
                                  : 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              } disabled:opacity-50`}
                            >
                              {busy ? '…' : active ? 'Suspender' : 'Reactivar'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
            <span>
              Página {page} de {totalPages} · {total} usuarios
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-semibold hover:bg-zinc-50 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-semibold hover:bg-zinc-50 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
