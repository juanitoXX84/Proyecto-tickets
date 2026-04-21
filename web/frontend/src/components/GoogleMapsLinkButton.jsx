/**
 * Enlace al mapa compartido por el organizador (Google Maps).
 */
export function GoogleMapsLinkButton({ href, className = '' }) {
  if (!href || !String(href).trim()) return null;
  const url = String(href).trim();
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-brand-300 hover:text-brand-800 ${className}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-zinc-200" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path
            fill="#EA4335"
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"
          />
        </svg>
      </span>
      <span>Abrir en Google Maps</span>
    </a>
  );
}

/**
 * Cabecera de imagen de evento: recorte centrado sin deformar (object-cover).
 * `priority`: carga con prioridad alta (LCP en ficha); `sizes` ayuda al navegador si más adelante hay srcset.
 * `translateZ(0)` mejora el suavizado al escalar en algunos navegadores (compositor).
 */
export function EventBannerImage({ src, alt = '', priority = false }) {
  return (
    <div className="relative w-full overflow-hidden bg-zinc-200">
      <div className="relative aspect-[21/9] max-h-[min(22rem,52vh)] w-full sm:max-h-[min(26rem,55vh)] lg:max-h-[min(30rem,60vh)]">
        {src ? (
          <img
            src={src}
            alt={alt}
            sizes="100vw"
            decoding="async"
            fetchPriority={priority ? 'high' : undefined}
            className="absolute inset-0 h-full w-full object-cover object-center [transform:translateZ(0)]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-100 to-fuchsia-100 text-7xl opacity-40 sm:text-8xl">
            🎫
          </div>
        )}
      </div>
    </div>
  );
}
