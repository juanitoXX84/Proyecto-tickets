import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { UserMenu } from './UserMenu.jsx';
import { apiFetch } from '../../services/api.js';
import ResponsiveExploreCategories from './ResponsiveExploreCategories.jsx';

function LogoMark() {
  return (
    <img
      src="/logo-ticket-rivals.png"
      alt=""
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 rounded-lg object-cover shadow-md ring-1 ring-black/5"
    />
  );
}

function homeExploreHref(categoriaId, searchParams) {
  const p = new URLSearchParams();
  if (categoriaId != null && String(categoriaId).trim() !== '') {
    p.set('categoria_id', String(categoriaId));
  }
  const qv = searchParams.get('q')?.trim();
  if (qv) p.set('q', qv);
  const s = p.toString();
  return s ? `/?${s}` : '/';
}

const SEARCH_DEBOUNCE_MS = 400;

function HeaderSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [value, setValue] = useState(() => searchParams.get('q') || '');
  const debounceRef = useRef(null);

  useEffect(() => {
    if (location.pathname === '/') {
      setValue(searchParams.get('q') || '');
    }
  }, [location.pathname, searchParams]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function applyToUrl(queryTrimmed) {
    const cat = searchParams.get('categoria_id');
    const p = new URLSearchParams();
    if (cat && /^\d+$/.test(cat)) p.set('categoria_id', cat);
    if (queryTrimmed) p.set('q', queryTrimmed);
    const qs = p.toString();
    if (!qs) {
      navigate('/', { replace: true });
      return;
    }
    navigate(`/?${qs}`, { replace: true });
  }

  function onChange(e) {
    const next = e.target.value;
    setValue(next);
    if (location.pathname !== '/') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyToUrl(next.trim()), SEARCH_DEBOUNCE_MS);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (location.pathname === '/') {
      applyToUrl(value.trim());
      return;
    }
    const v = value.trim();
    navigate(v ? `/?q=${encodeURIComponent(v)}` : '/');
  }

  return (
    <form className="relative w-full" onSubmit={onSubmit} role="search">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </span>
      <input
        type="search"
        name="q"
        value={value}
        onChange={onChange}
        placeholder="Busca por artista, evento o ciudad"
        autoComplete="off"
        aria-label="Buscar eventos"
        className="w-full rounded-full border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      />
    </form>
  );
}

function HamburgerMenu({ categorias }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-md bg-zinc-100 hover:bg-zinc-200 focus:outline-none"
        aria-label="Toggle menu"
      >
        <svg
          className="h-6 w-6 text-zinc-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d={isOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'}
          />
        </svg>
      </button>
      <div
        className={`absolute right-0 mt-2 w-64 rounded-lg bg-white shadow-xl ring-1 ring-black ring-opacity-10 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
        }`}
      >
        <div className="py-2">
          <Link
            to={homeExploreHref(null, new URLSearchParams())}
            className="block px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-brand-100 hover:text-brand-800 rounded-md"
          >
            Todos
          </Link>
          {categorias.map((c) => (
            <Link
              key={c.id}
              to={homeExploreHref(c.id, new URLSearchParams())}
              className="block px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-brand-100 hover:text-brand-800 rounded-md"
            >
              {c.nombre}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MainLayout() {
  const { user, loading } = useAuth();
  const hidePurchasesFooter = user?.rol === 'admin' || user?.rol === 'organizador';
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const [categorias, setCategorias] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch('/api/categories');
        if (!cancelled) setCategorias(Array.isArray(data?.categorias) ? data.categorias : []);
      } catch {
        if (!cancelled) setCategorias([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 lg:flex-nowrap lg:gap-6">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-3"
            title="Ticket Rivals — inicio"
            aria-label="Ticket Rivals, ir al inicio"
          >
            <LogoMark />
            <span className="font-display text-xl font-extrabold tracking-tight text-zinc-900">
              Ticket
              <span className="text-[#6c0084]"> Rivals</span>
            </span>
          </Link>

          <div className="order-3 flex w-full min-w-0 lg:order-none lg:max-w-xl lg:flex-1">
            <HeaderSearch />
          </div>

          <nav className="ml-auto flex items-center gap-2 sm:gap-3">
            {!loading && !user && (
              <>
                <Link
                  to="/login"
                  className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:border-brand-400 hover:text-brand-800"
                >
                  Iniciar sesión
                </Link>
                <Link
                  to="/registro"
                  className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-brand-700"
                >
                  Registrarse
                </Link>
              </>
            )}
            {!loading && user && <UserMenu />}
          </nav>
        </div>

        <div className="border-t border-zinc-100 bg-zinc-50/80">
          <div className="hidden sm:block">
            <ResponsiveExploreCategories />
          </div>
          <div className="block sm:hidden">
            <HamburgerMenu categorias={categorias} />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-zinc-200 bg-zinc-900 text-zinc-300">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-3">
              <img
                src="/logo-ticket-rivals.png"
                alt=""
                width={44}
                height={44}
                className="h-11 w-11 rounded-lg object-cover ring-1 ring-white/10"
              />
              <p className="font-display text-lg font-bold text-white">
                Ticket <span className="text-[#c084fc]">Rivals</span>
              </p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Plataforma de demostración para gestión y venta de entradas. Uso educativo únicamente.
            </p>
          </div>
          {!hidePurchasesFooter && (
            <div>
              <p className="font-semibold text-white">Ayuda</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link to="/mis-compras" className="hover:text-brand-300">
                    Mis compras
                  </Link>
                </li>
              </ul>
            </div>
          )}
          <div>
            <p className="font-semibold text-white">Legal</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link to="/terminos" className="hover:text-brand-300">
                  Términos y condiciones
                </Link>
              </li>
              <li>
                <Link to="/privacidad" className="hover:text-brand-300">
                  Aviso de privacidad
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Síguenos</p>
            <div className="mt-4 flex items-center gap-4">
              <a
                href="https://www.facebook.com/bihankayazzmin.mungarrolopez.9"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 transition hover:text-white"
                aria-label="Facebook"
              >
                <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>
              <a
                href="https://www.instagram.com/juanito_saurus/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 transition hover:text-white"
                aria-label="Instagram"
              >
                <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} Ticket Rivals — proyecto académico
        </div>
      </footer>
    </div>
  );
}
