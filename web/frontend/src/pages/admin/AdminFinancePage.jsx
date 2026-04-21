import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../services/api.js';
import styles from './AdminFinancePage.module.css';

function formatMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(x);
}

function defaultRange() {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - 30);
  const f = (d) => d.toISOString().slice(0, 10);
  return { desde: f(desde), hasta: f(hasta) };
}

export function AdminFinancePage() {
  const init = defaultRange();
  const [desde, setDesde] = useState(init.desde);
  const [hasta, setHasta] = useState(init.hasta);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const params = new URLSearchParams({ desde, hasta });
      const res = await apiFetch(`/api/admin/finance/summary?${params.toString()}`);
      setData(res);
    } catch (e) {
      setError(e.data?.error || e.message || 'No se pudo cargar el resumen');
    } finally {
      setLoading(false);
    }
  }

  const r = data?.resumen;

  return (
    <div className={styles.shell}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-zinc-900">Resumen financiero</h1>
          
        </div>
        <Link
          to="/admin/pagos"
          className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Ver listado de pagos
        </Link>
      </div>

      <div className="mb-8 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-zinc-700">Desde</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-zinc-700">Hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? 'Calculando…' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {data?.comision_config && (
        <p className="mb-4 text-xs text-zinc-500">
          Tasa configurada: {(Number(data.comision_config.PLATFORM_COMMISSION_RATE) * 100).toFixed(2)}% del monto aprobado
          (solo referencia interna; Mercado Pago cobra sus propias comisiones aparte).
        </p>
      )}

      {r && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-zinc-500">Pagos aprobados</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-zinc-900">{r.num_aprobados}</p>
            <p className="mt-1 text-xs text-zinc-500">de {r.num_pagos} movimientos en el rango</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-zinc-500">Bruto aprobado</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-emerald-800">{formatMoney(r.total_bruto_aprobado)}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-zinc-500">Comisión plataforma (estimada)</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-brand-800">
              {formatMoney(r.total_comision_plataforma)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-zinc-500">Estimado organizadores</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-zinc-900">
              {formatMoney(r.total_estimado_organizadores)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-zinc-500">Monto marcado reembolsado</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-violet-800">
              {formatMoney(r.total_reembolsado_monto)}
            </p>
          </div>
        </div>
      )}

      {!r && !loading && !error && (
        <p className="text-sm text-zinc-500">Elige fechas y pulsa Actualizar para ver totales.</p>
      )}
    </div>
  );
}
