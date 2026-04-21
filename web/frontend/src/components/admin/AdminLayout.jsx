import { NavLink, Outlet, Link } from 'react-router-dom';

const navCls = ({ isActive }) =>
  `block rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
    isActive ? 'bg-brand-600 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
  }`;

export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-zinc-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 p-4">
          <Link to="/" className="font-display text-lg font-bold tracking-tight text-white">
            Ticket <span className="text-[#c084fc]">Rivals</span>
          </Link>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Administración</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <NavLink to="/admin/usuarios" className={navCls} end>
            Usuarios
          </NavLink>
          <NavLink to="/admin/eventos" className={navCls} end>
            Eventos
          </NavLink>
          <NavLink to="/admin/pagos" className={navCls} end>
            Pagos
          </NavLink>
          <NavLink to="/admin/finanzas" className={navCls} end>
            Finanzas
          </NavLink>
          <NavLink to="/admin/resenas" className={navCls} end>
            Reseñas
          </NavLink>
        </nav>
        <div className="border-t border-zinc-800 p-3">
          <Link
            to="/"
            className="block rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            ← Volver al sitio
          </Link>
        </div>
      </aside>
      <div className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
