import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EventBannerImage, GoogleMapsLinkButton } from '../../components/GoogleMapsLinkButton.jsx';
import { apiFetch } from '../../services/api.js';
import styles from './AdminEventPreviewPage.module.css';
import { disponiblesEnZona, disponiblesEventoAgregado, totalDisponiblesZonas } from '../../utils/ticketAvailability.js';
import { normalizeMapUrl, pickEventMapUrl, shouldRenderMapsLinkButton } from '../../utils/googleMapsUrl.js';

function metaLine(ev) {
  const parts = [];
  if (ev.estado_moderacion) parts.push(`Moderación: ${ev.estado_moderacion}`);
  parts.push(Number(ev.activo) === 1 ? 'Publicado (activo=1)' : 'Borrador (activo=0)');
  if (ev.evento_cancelado) parts.push('Cancelado');
  return parts.join(' · ');
}

export function AdminEventPreviewPage() {
  const { id } = useParams();
  const [evento, setEvento] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvento(null);
    (async () => {
      try {
        const data = await apiFetch(`/api/admin/events/${id}`);
        if (!cancelled) setEvento(data.evento);
      } catch (e) {
        if (!cancelled) setError(e.data?.error || e.message || 'No se pudo cargar el evento');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-500">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !evento) {
    return (
      <div className={styles.shell}>
        <div className="mx-auto max-w-lg">
          <p className="text-red-600">{error || 'No encontrado'}</p>
          <Link to="/admin/eventos" className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline">
            ← Volver a eventos
          </Link>
        </div>
      </div>
    );
  }

  const fecha = evento.fecha ? new Date(evento.fecha) : null;
  const fechaFin = evento.fecha_fin ? new Date(evento.fecha_fin) : null;
  const zonas = Array.isArray(evento.zonas) ? evento.zonas : [];
  const mapaRaw = pickEventMapUrl(evento);
  const mapaHref = normalizeMapUrl(mapaRaw);
  const precioMin =
    zonas.length > 0
      ? Math.min(...zonas.map((z) => Number(z.precio)).filter((n) => Number.isFinite(n)))
      : Number(evento.precio);
  const totalZonas = totalDisponiblesZonas(zonas);
  const dispAgregado = disponiblesEventoAgregado(evento);
  const puedeVerPublico =
    !evento.evento_cancelado &&
    Number(evento.activo) === 1 &&
    (evento.estado_moderacion == null || evento.estado_moderacion === '' || evento.estado_moderacion === 'aprobado');

  return (
    <div className="min-h-full bg-white">
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto max-w-7xl px-4 py-4 text-sm text-amber-950">
          <p className="font-display text-base font-extrabold">Vista previa (solo administración)</p>
          <p className="mt-1 text-amber-900">
            Así se verán fecha, ubicación, zonas y textos. El catálogo público solo muestra eventos aprobados y no
            cancelados.
          </p>
          <p className="mt-2 text-xs font-medium text-amber-800">{metaLine(evento)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/admin/eventos"
              className="inline-flex rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
            >
              ← Lista de eventos
            </Link>
            {puedeVerPublico && (
              <Link
                to={`/eventos/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-800 hover:bg-zinc-50"
              >
                Abrir ficha pública (nueva pestaña)
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-7xl px-4 py-3 text-sm text-zinc-600">
          <Link to="/admin/eventos" className="font-medium text-zinc-700 hover:underline">
            Administración / Eventos
          </Link>
          <span className="mx-2 text-zinc-400">/</span>
          <span className="text-zinc-800">{evento.titulo}</span>
        </div>
      </div>

      <EventBannerImage src={evento.imagen} alt="" priority />

      {evento.evento_cancelado && (
        <div className="border-b border-red-200 bg-red-50">
          <div className="mx-auto max-w-7xl px-4 py-4 text-sm text-red-900">
            <p className="font-display text-base font-extrabold">Evento cancelado</p>
            {evento.motivo_cancelacion && <p className="mt-1">{evento.motivo_cancelacion}</p>}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-10 lg:grid lg:grid-cols-3 lg:items-start lg:gap-10 lg:py-12">
        <div className="min-w-0 lg:col-span-2">
          <p className="text-sm font-bold uppercase tracking-wide text-zinc-600">
            {evento.categoria_nombre || 'Evento'}
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
            {evento.titulo}
          </h1>
          {fecha && (
            <p className="mt-4 text-lg font-semibold text-zinc-800">
              {fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
          <p className="mt-1 text-lg text-zinc-600">
            {fecha?.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          </p>
          {shouldRenderMapsLinkButton(mapaRaw, mapaHref) ? (
            <div className="mt-3">
              <GoogleMapsLinkButton href={mapaHref} />
            </div>
          ) : null}
          {fechaFin && (
            <p className="mt-2 text-sm text-zinc-600">
              <span className="font-semibold text-zinc-800">Fin del evento: </span>
              {fechaFin.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
          <p className="mt-2 flex items-center gap-2 text-zinc-600">
            <svg className="h-5 w-5 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>
              {evento.ubicacion || 'Ubicación por confirmar'}
              {evento.recinto && (
                <>
                  <br />
                  <span className="text-zinc-800">{evento.recinto}</span>
                </>
              )}
            </span>
          </p>
          {evento.direccion && <p className="mt-2 text-sm text-zinc-600">{evento.direccion}</p>}

          {(evento.venta_inicio || evento.venta_fin) && (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              <p className="font-semibold text-zinc-900">Ventana de venta (configuración)</p>
              {evento.venta_inicio && (
                <p className="mt-1">
                  Inicio: {new Date(evento.venta_inicio).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
              {evento.venta_fin && (
                <p className="mt-1">
                  Fin: {new Date(evento.venta_fin).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
              <p className="mt-2 text-xs text-zinc-500">
                Venta abierta ahora (reglas):{' '}
                <span className="font-bold text-zinc-800">{evento.venta_abierta ? 'Sí' : 'No'}</span>
              </p>
            </div>
          )}

          {zonas.length > 0 && (
            <div className="mt-8 border-t border-zinc-200 pt-8">
              <h2 className="font-display text-xl font-bold text-zinc-900">Zonas y precios</h2>
              <p className="mt-1 text-sm text-zinc-500">Vista previa de secciones, precios y cupo.</p>
              <ul className="mt-4 space-y-3">
                {zonas.map((z) => {
                  const libres = disponiblesEnZona(z);
                  const agotada = libres <= 0;
                  return (
                    <li key={z.id ?? `${z.nombre_seccion}-${z.precio}`}>
                      <div
                        className={`w-full rounded-xl border px-4 py-3 text-left ${
                          agotada ? 'border-zinc-200 bg-zinc-100 text-zinc-500' : 'border-zinc-200 bg-zinc-50 shadow-sm'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className={`font-semibold ${agotada ? 'text-zinc-500' : 'text-zinc-900'}`}>
                              {z.nombre_seccion}
                            </p>
                            {z.descripcion_zona && (
                              <p className="mt-1 text-sm text-zinc-600">{z.descripcion_zona}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className={`text-lg font-bold ${agotada ? 'text-zinc-400' : 'text-zinc-900'}`}>
                              ${Number(z.precio).toFixed(2)} MXN
                            </p>
                            <p className="text-sm text-zinc-500">
                              {agotada ? (
                                <span className="font-medium text-zinc-400">Agotada</span>
                              ) : (
                                <>
                                  Cupo: <span className="font-semibold text-zinc-800">{libres}</span> / {z.capacidad}
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {evento.descripcion && (
            <div className="mt-8 border-t border-zinc-200 pt-8">
              <h2 className="font-display text-xl font-bold text-zinc-900">Acerca del evento</h2>
              <p className="mt-3 whitespace-pre-wrap leading-relaxed text-zinc-600">{evento.descripcion}</p>
            </div>
          )}
          {evento.instrucciones_canje && (
            <div className="mt-8 border-t border-zinc-200 pt-8">
              <h2 className="font-display text-xl font-bold text-zinc-900">Instrucciones de acceso</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">{evento.instrucciones_canje}</p>
            </div>
          )}
        </div>

        <aside className="mt-10 min-w-0 lg:mt-0">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-card">
            <p className="text-sm font-bold text-zinc-500">Resumen (vista previa)</p>
            <p className="mt-2 font-display text-3xl font-extrabold text-zinc-900">
              ${Number.isFinite(precioMin) ? precioMin.toFixed(2) : '0.00'}{' '}
              <span className="text-lg font-semibold text-zinc-500">MXN</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">{zonas.length > 0 ? 'Desde el precio más bajo por zona' : 'Precio base del evento'}</p>
            <p className="mt-4 text-sm text-zinc-600">
              {zonas.length > 0 ? (
                <>
                  Total disponible (zonas): <span className="font-bold text-zinc-900">{totalZonas}</span> boletos
                </>
              ) : (
                <>
                  Disponibles: <span className="font-bold text-zinc-900">{dispAgregado}</span> / {evento.capacidad}
                </>
              )}
            </p>
            <div className="mt-6 rounded-xl bg-zinc-100 px-3 py-2 text-center text-xs font-semibold text-zinc-600">
              Sin compra en vista previa
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
