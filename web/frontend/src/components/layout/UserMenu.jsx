import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { OrganizerNotificationsBell } from './OrganizerNotificationsBell.jsx';

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocMouseDown(e) {
      if (!rootRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (!confirmLogout) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setConfirmLogout(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmLogout]);

  if (!user) return null;

  const initial = (user.nombre || user.email || '?').charAt(0).toUpperCase();
  const showOrganizer = user.rol === 'organizador';
  const showAdmin = user.rol === 'admin';

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {showOrganizer && <OrganizerNotificationsBell />}
      <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[200px] items-center gap-2 rounded-full border border-zinc-200 bg-white py-1.5 pl-1.5 pr-3 text-left shadow-sm hover:border-brand-300 hover:bg-zinc-50"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
          {initial}
        </span>
        <span className="hidden min-w-0 flex-1 truncate text-sm font-semibold text-zinc-800 sm:block">{user.nombre}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-500 transition ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 z-[60] mt-2 w-56 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
          role="menu"
        >
          {!showAdmin && (
            <Link
              to="/perfil"
              role="menuitem"
              className="block px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              onClick={() => setOpen(false)}
            >
              Editar perfil
            </Link>
          )}
          {!showAdmin && !showOrganizer && (
            <Link
              to="/mis-compras"
              role="menuitem"
              className="block px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              onClick={() => setOpen(false)}
            >
              Mis compras
            </Link>
          )}
          {showOrganizer && (
            <Link
              to="/organizador"
              role="menuitem"
              className="block px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              onClick={() => setOpen(false)}
            >
              Panel organizador
            </Link>
          )}
          {showAdmin && (
            <Link
              to="/admin"
              role="menuitem"
              className="block px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              onClick={() => setOpen(false)}
            >
              Administración
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            className="w-full border-t border-zinc-100 px-4 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
            onClick={() => {
              setOpen(false);
              setConfirmLogout(true);
            }}
          >
            Cerrar sesión
          </button>
        </div>
      )}

      {confirmLogout && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-confirm-title"
          onClick={() => setConfirmLogout(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="logout-confirm-title" className="font-display text-lg font-extrabold text-zinc-900">
              ¿Cerrar sesión?
            </h2>
            <p className="mt-2 text-sm text-zinc-600">Tendrás que volver a iniciar sesión para acceder a tu cuenta.</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmLogout(false);
                  logout();
                }}
                className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
