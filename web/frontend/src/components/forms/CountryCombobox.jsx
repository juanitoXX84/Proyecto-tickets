import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { PAISES_ES } from '../../data/paisesEs.js';

function normalize(s) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/**
 * Combobox accesible: lista filtrable de países en español.
 * `value` / `onChange` usan el nombre del país tal como se guarda en BD.
 */
export function CountryCombobox({
  label,
  value,
  onChange,
  disabled = false,
  placeholder = 'Selecciona tu país',
  filterPlaceholder = 'Escribir para buscar…',
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const containerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const options = useMemo(() => {
    const legacy =
      value && String(value).trim() && !PAISES_ES.includes(value) ? [String(value).trim()] : [];
    const merged = [...legacy, ...PAISES_ES];
    const q = search.trim();
    if (!q) return merged;
    const nq = normalize(q);
    return merged.filter((p) => normalize(p).includes(nq));
  }, [search, value]);

  useEffect(() => {
    function onDoc(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const inputCls =
    'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50';

  return (
    <div ref={containerRef} className="relative">
      {label ? (
        <label id={`${uid}-label`} className="block text-sm font-medium text-zinc-700">
          {label}
        </label>
      ) : null}
      <button
        type="button"
        id={`${uid}-trigger`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-labelledby={label ? `${uid}-label` : undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}
      >
        <span className={value ? 'truncate text-zinc-900' : 'truncate text-zinc-400'}>
          {value || placeholder}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg ring-1 ring-black/5">
          <input
            type="text"
            autoComplete="off"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={filterPlaceholder}
            className="w-full border-b border-zinc-100 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500/20"
            aria-label="Filtrar países"
          />
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={label ? `${uid}-label` : `${uid}-trigger`}
            className="max-h-56 overflow-y-auto py-1"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-zinc-500" role="presentation">
                Sin coincidencias
              </li>
            ) : (
              options.map((p) => (
                <li key={p} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={p === value}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-brand-50 focus:bg-brand-50 focus:outline-none ${
                      p === value ? 'bg-brand-50/80 font-medium text-brand-900' : 'text-zinc-800'
                    }`}
                    onClick={() => {
                      onChange(p);
                      setOpen(false);
                    }}
                  >
                    {p}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
