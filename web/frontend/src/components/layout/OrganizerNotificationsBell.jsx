import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../services/api.js';

function typeStyles(type) {
  if (type === 'evento_cancelado') return 'bg-red-100 text-red-800';
  if (type === 'moderacion_rechazada') return 'bg-amber-100 text-amber-900';
  if (type === 'entradas_agotadas') return 'bg-brand-100 text-brand-900';
  return 'bg-zinc-100 text-zinc-700';
}

export function OrganizerNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/organizer/notifications');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === 'visible') load();
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    load();
    function onDocMouseDown(e) {
      if (!rootRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, load]);

  const count = items.length;

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm hover:border-brand-300 hover:bg-zinc-50 hover:text-brand-800"
        aria-label="Notificaciones del organizador"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {count > 0 && (
          <span
            className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
            aria-hidden
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-[60] mt-2 w-80 max-w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white shadow-lg ring-1 ring-black/5"
          role="dialog"
          aria-label="Avisos de eventos"
        >
          <div className="border-b border-zinc-100 px-4 py-2.5">
            <p className="text-sm font-bold text-zinc-900">Avisos de tus eventos</p>
            <p className="text-xs text-zinc-500">Rechazos, cancelaciones y entradas agotadas</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">No hay avisos por ahora</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {items.map((n) => (
                  <li key={n.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${typeStyles(n.type)}`}>
                        {n.type === 'evento_cancelado' && 'Cancelado'}
                        {n.type === 'moderacion_rechazada' && 'Rechazado'}
                        {n.type === 'entradas_agotadas' && 'Agotado'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-zinc-900">{n.titulo}</p>
                    {n.eventoTitulo && (
                      <p className="text-xs font-medium text-zinc-600">{n.eventoTitulo}</p>
                    )}
                    <p className="mt-1 text-xs leading-relaxed text-zinc-600">{n.mensaje}</p>
                    {n.idevento != null && (
                      <Link
                        to={`/organizador/eventos/${n.idevento}/editar`}
                        className="mt-2 inline-block text-xs font-bold text-brand-700 hover:underline"
                        onClick={() => setOpen(false)}
                      >
                        Gestionar evento
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
