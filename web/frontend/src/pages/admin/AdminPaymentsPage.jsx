import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../services/api.js';
import styles from './AdminPaymentsPage.module.css';

const DEBOUNCE_MS = 400;

function formatMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(x);
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export function AdminPaymentsPage() {
  const [pagos, setPagos] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [estado, setEstado] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
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
    if (estado) params.set('estado', estado);
    try {
      const data = await apiFetch(`/api/admin/payments?${params.toString()}`);
      setPagos(Array.isArray(data.pagos) ? data.pagos : []);
      setTotal(Number(data.total) || 0);
    } catch (e) {
      setError(e.data?.error || e.message || 'No se pudieron cargar los pagos');
      setPagos([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, q, estado]);

  useEffect(() => {
    load();
  }, [load]);

  async function refund(pagoId) {
    if (!window.confirm('¿Solicitar reembolso total en Mercado Pago y marcar boletos como reembolsados?')) return;
    setBusyId(pagoId);
    try {
      await apiFetch(`/api/admin/payments/${pagoId}/refund`, { method: 'POST', body: {} });
      await load();
    } catch (e) {
      window.alert(e.data?.error || e.message || 'Error al reembolsar');
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className={styles.shell}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-zinc-900">Pagos y transacciones</h1>
          
        </div>
        <Link
          to="/admin/finanzas"
          className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Ver resumen financiero
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={qInput}
          onChange={(e) => {
            setQInput(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar por correo, evento o id MP…"
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        <select
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobado">Aprobado</option>
          <option value="rechazado">Rechazado</option>
          <option value="reembolsado">Reembolsado</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
      )}

      {loading ? (
        <p className="text-zinc-500">Cargando…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-bold uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Monto</th>
                <th className="px-4 py-3">Comisión TR</th>
                <th className="px-4 py-3">MP payment</th>
                <th className="px-4 py-3">Comprador</th>
                <th className="px-4 py-3">Evento</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {pagos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                    No hay pagos registrados.
                  </td>
                </tr>
              ) : (
                pagos.map((p) => (
                  <tr key={p.pago_id} className="hover:bg-zinc-50/80">
                    <td className="px-4 py-3 font-mono text-xs">{p.pago_id}</td>
                    <td className="px-4 py-3 text-zinc-600">{formatDate(p.fecha)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          p.pago_estado === 'aprobado'
                            ? 'bg-emerald-100 text-emerald-900'
                            : p.pago_estado === 'reembolsado'
                              ? 'bg-violet-100 text-violet-900'
                              : p.pago_estado === 'rechazado'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {p.pago_estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold">{formatMoney(p.monto)}</td>
                    <td className="px-4 py-3 text-zinc-600">{p.comision_plataforma != null ? formatMoney(p.comision_plataforma) : '—'}</td>
                    <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs text-zinc-600" title={p.mp_payment_id}>
                      {p.mp_payment_id || '—'}
                    </td>
                    <td className="max-w-[140px] truncate px-4 py-3 text-zinc-700" title={p.comprador_email}>
                      {p.comprador_email || '—'}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-zinc-700" title={p.evento_titulo}>
                      {p.idevento != null ? (
                        <Link to={`/eventos/${p.idevento}`} className="font-medium text-brand-700 hover:underline">
                          {p.evento_titulo || `#${p.idevento}`}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.pago_estado === 'aprobado' && p.mp_payment_id && !p.reembolsado_at && (
                        <button
                          type="button"
                          disabled={busyId === p.pago_id}
                          onClick={() => refund(p.pago_id)}
                          className="text-xs font-bold text-red-700 hover:underline disabled:opacity-50"
                        >
                          Reembolsar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-zinc-600">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
