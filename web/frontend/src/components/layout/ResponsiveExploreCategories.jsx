import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../services/api.js';

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

export default function ResponsiveExploreCategories() {
  const [searchParams] = useSearchParams();
  const activeCat = searchParams.get('categoria_id');
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

  const chipClass = (active) =>
    active
      ? 'rounded-full bg-white px-3 py-1 font-semibold text-brand-800 shadow-sm ring-1 ring-brand-200'
      : 'rounded-full px-3 py-1 hover:bg-white hover:text-brand-700';

  return (
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-2 text-sm font-medium text-zinc-600">
      <span className="mr-2 text-xs font-bold uppercase tracking-wide text-zinc-400">Explorar</span>
      <Link to={homeExploreHref(null, searchParams)} className={chipClass(!activeCat)}>
        Todos
      </Link>
      {categorias.map((c) => (
        <Link
          key={c.id}
          to={homeExploreHref(c.id, searchParams)}
          className={chipClass(String(activeCat) === String(c.id))}
        >
          {c.nombre}
        </Link>
      ))}
    </div>
  );
}