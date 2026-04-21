import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch, uploadOrganizerEventImage } from '../services/api.js';
import './OrganizerEventFormPage.css';
import { isGoogleMapsUrl, pickEventMapUrl } from '../utils/googleMapsUrl.js';
import { composeZonaName, splitZonaName } from '../utils/zonaPresentation.js';

const ZONA_TIPOS = ['VIP', 'GENERAL', 'GRADAS'];

function mapNombreToZonaForm(nombre_seccion) {
  const raw = String(nombre_seccion || '').trim();
  const { base, detail } = splitZonaName(raw);
  const upper = String(base || raw).toUpperCase();
  if (ZONA_TIPOS.includes(upper)) {
    return { tipo_zona: upper, nombre_otro: '', etiqueta_tipo: detail || '' };
  }
  return { tipo_zona: 'otro', nombre_otro: raw, etiqueta_tipo: '' };
}

function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function emptyZona() {
  return {
    tipo_zona: 'GENERAL',
    nombre_otro: '',
    etiqueta_tipo: '',
    descripcion_zona: '',
    precio: '',
    capacidad: '80',
    usa_mapa_asientos: true,
    mapa_filas: '8',
    mapa_columnas: '10',
    seat_coords: [],
    limite_por_transaccion: '',
    pos_x: '',
    pos_y: '',
  };
}

function clampMapFilasCols(filasStr, colsStr) {
  const f = Math.min(40, Math.max(1, parseInt(String(filasStr || '8'), 10) || 8));
  const c = Math.min(80, Math.max(1, parseInt(String(colsStr || '10'), 10) || 10));
  return { mapa_filas: String(f), mapa_columnas: String(c), capacidad: String(f * c) };
}

function totalAsientosPreview(z) {
  const fStr = String(z.mapa_filas ?? '').trim();
  const cStr = String(z.mapa_columnas ?? '').trim();
  if (fStr === '' || cStr === '') return null;
  const fN = parseInt(fStr, 10);
  const cN = parseInt(cStr, 10);
  if (!Number.isFinite(fN) || !Number.isFinite(cN)) return null;
  return Math.min(40, Math.max(1, fN)) * Math.min(80, Math.max(1, cN));
}

function rowLetter(index) {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function shareMapDimensions(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const firstMapIdx = list.findIndex((r) => Boolean(r?.usa_mapa_asientos));
  if (firstMapIdx < 0) return list;
  const shared = clampMapFilasCols(list[firstMapIdx].mapa_filas, list[firstMapIdx].mapa_columnas);
  return list.map((r) =>
    r.usa_mapa_asientos
      ? {
          ...r,
          mapa_filas: shared.mapa_filas,
          mapa_columnas: shared.mapa_columnas,
          capacidad: shared.capacidad,
        }
      : r
  );
}

/** Mínimo para inputs datetime-local (hora local, minuto actual). */
function datetimeLocalFloorToMinute() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function maxDatetimeLocal(a, b) {
  const x = (a || '').trim();
  const y = (b || '').trim();
  if (!x) return y;
  if (!y) return x;
  return x > y ? x : y;
}

function validateFutureEventDraft({ fecha, fecha_fin, venta_inicio, venta_fin }) {
  const now = Date.now();
  if (!fecha) return 'La fecha y hora de inicio son obligatorias';
  const f = new Date(fecha).getTime();
  if (Number.isNaN(f)) return 'La fecha de inicio no es válida';
  if (f <= now) return 'La fecha y hora de inicio deben ser posteriores al momento actual';
  if (fecha_fin) {
    const fin = new Date(fecha_fin).getTime();
    if (Number.isNaN(fin)) return 'La fecha de cierre no es válida';
    if (fin <= now) return 'La fecha de cierre no puede ser una fecha u hora ya pasada';
    if (fin < f) return 'La fecha de cierre debe ser posterior al inicio del evento';
  }
  // Comparar como string al minuto (formato local YYYY-MM-DDTHH:MM)
  const pad = (n) => String(n).padStart(2, '0');
  const nowStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const toLocalStr = (isoStr) => isoStr.replace('Z', '').substring(0, 16);
  const nowMinStr = nowStr();
  // venta_inicio: no antes de ahora (al minuto), no después del evento
  if (venta_inicio) {
    const vi = new Date(venta_inicio).getTime();
    if (Number.isNaN(vi)) return 'El inicio de venta no es válido';
    if (toLocalStr(venta_inicio) < nowMinStr) return 'El inicio de venta no puede ser antes de ahora';
    if (vi >= f) return 'El inicio de venta debe ser antes del inicio del evento';
  }
  // venta_fin: no antes de ahora (al minuto), no después del evento, después de venta_inicio
  if (venta_fin) {
    const vf = new Date(venta_fin).getTime();
    if (Number.isNaN(vf)) return 'El fin de venta no es válido';
    if (toLocalStr(venta_fin) < nowMinStr) return 'El fin de venta no puede ser antes de ahora';
    if (vf >= f) return 'El fin de venta debe ser antes del inicio del evento';
    if (venta_inicio) {
      const vi = new Date(venta_inicio).getTime();
      if (!Number.isNaN(vi) && vf < vi) return 'El fin de venta debe ser posterior o igual al inicio de venta';
    }
  }
  return null;
}


export function OrganizerEventFormPage() {
  const { id: editId } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(editId);

  const [categorias, setCategorias] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [titulo, setTitulo] = useState('');
  const [categoria_id, setCategoriaId] = useState('');
  const [imagen, setImagen] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [estado_publicacion, setEstadoPublicacion] = useState('publicado');

  const [fecha, setFecha] = useState('');
  const [fecha_fin, setFechaFin] = useState('');
  const [recinto, setRecinto] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [direccion, setDireccion] = useState('');
  const [url_mapa, setUrlMapa] = useState('');

  const [venta_inicio, setVentaInicio] = useState('');
  const [venta_fin, setVentaFin] = useState('');
  const [limite_boletos_por_transaccion, setLimiteBoletos] = useState('6');

  
  const [generar_qr_email, setGenerarQrEmail] = useState(true);
  const [instrucciones_canje, setInstruccionesCanje] = useState('');

  const formRef = useRef(null);

  const [zonas, setZonas] = useState([emptyZona()]);
  const [imageUploading, setImageUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch('/api/categories');
        if (!cancelled) setCategorias(data.categorias || []);
      } catch {
        if (!cancelled) setCategorias([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await apiFetch(`/api/organizer/events/${editId}`);
        const ev = data.evento;
        if (!ev || cancelled) return;
        setTitulo(ev.titulo || '');
        setCategoriaId(ev.categoria_id != null ? String(ev.categoria_id) : '');
        setImagen(ev.imagen || '');
        setDescripcion(ev.descripcion || '');
        setEstadoPublicacion(Number(ev.activo) === 1 ? 'publicado' : 'borrador');
        setFecha(isoToDatetimeLocal(ev.fecha));
        setFechaFin(isoToDatetimeLocal(ev.fecha_fin));
        setRecinto(ev.recinto || '');
        setUbicacion(ev.ubicacion || '');
        setDireccion(ev.direccion || '');
        setUrlMapa(pickEventMapUrl(ev));
        setVentaInicio(isoToDatetimeLocal(ev.venta_inicio));
        setVentaFin(isoToDatetimeLocal(ev.venta_fin));
        setLimiteBoletos(
          ev.limite_boletos_por_transaccion != null ? String(ev.limite_boletos_por_transaccion) : '6'
        );
        setGenerarQrEmail(Number(ev.generar_qr_email) !== 0);
        setInstruccionesCanje(ev.instrucciones_canje || '');
        if (ev.zonas && ev.zonas.length > 0) {
          setZonas(
            ev.zonas.map((z) => {
              const { tipo_zona, nombre_otro, etiqueta_tipo } = mapNombreToZonaForm(z.nombre_seccion);
              const usaMap =
                Number(z.usa_mapa_asientos) === 1 ||
                z.usa_mapa_asientos === true ||
                z.usa_mapa_asientos === '1';
              return {
                tipo_zona,
                nombre_otro,
                etiqueta_tipo,
                descripcion_zona: z.descripcion_zona || '',
                precio: String(z.precio ?? ''),
                capacidad: String(z.capacidad ?? ''),
                usa_mapa_asientos: usaMap,
                mapa_filas:
                  z.mapa_filas != null && z.mapa_filas !== '' ? String(z.mapa_filas) : '8',
                mapa_columnas:
                  z.mapa_columnas != null && z.mapa_columnas !== ''
                    ? String(z.mapa_columnas)
                    : '10',
                limite_por_transaccion:
                  z.limite_por_transaccion != null ? String(z.limite_por_transaccion) : '',
                pos_x: z.pos_x != null && z.pos_x !== '' ? String(z.pos_x) : '',
                pos_y: z.pos_y != null && z.pos_y !== '' ? String(z.pos_y) : '',
                seat_coords: Array.isArray(z.seat_coords)
                  ? z.seat_coords
                      .map((c) => `${String(c?.fila || '').trim().toUpperCase()}:${Number(c?.columna)}`)
                      .filter((k) => /^[A-Z]+:\d+$/.test(k))
                  : [],
              };
            })
          );
        } else {
          setZonas([
            {
              tipo_zona: 'GENERAL',
              nombre_otro: '',
              etiqueta_tipo: '',
              descripcion_zona: '',
              precio: String(ev.precio ?? ''),
              capacidad:
                ev.capacidad != null && ev.capacidad !== '' ? String(ev.capacidad) : '80',
              usa_mapa_asientos: true,
              mapa_filas: '8',
              mapa_columnas: '10',
              limite_por_transaccion: '',
              pos_x: '',
              pos_y: '',
              seat_coords: [],
            },
          ]);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'No se pudo cargar el evento');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, editId]);

  function addZona() {
    setZonas((rows) => shareMapDimensions([...rows, emptyZona()]));
  }

  function removeZona(i) {
    setZonas((z) => (z.length <= 1 ? z : z.filter((_, j) => j !== i)));
  }

  function patchZona(i, field, value) {
    setZonas((z) =>
      shareMapDimensions(
        z.map((row, j) => {
          if (j !== i) return row;
          let next = { ...row, [field]: value };
          if (field === 'tipo_zona' && value === 'otro') {
            next = { ...next, etiqueta_tipo: '' };
          }
          if (field === 'usa_mapa_asientos') {
            if (value) {
              const sync = clampMapFilasCols(next.mapa_filas, next.mapa_columnas);
              next = { ...next, ...sync, usa_mapa_asientos: true };
            } else {
              next = { ...next, usa_mapa_asientos: false };
            }
          } else if (next.usa_mapa_asientos && (field === 'mapa_filas' || field === 'mapa_columnas')) {
            const raw = String(value ?? '');
            const clean = raw.replace(/\D/g, '');
            next = { ...row, [field]: clean };
            const fStr = String(field === 'mapa_filas' ? clean : next.mapa_filas ?? '').trim();
            const cStr = String(field === 'mapa_columnas' ? clean : next.mapa_columnas ?? '').trim();
            const fN = parseInt(fStr, 10);
            const cN = parseInt(cStr, 10);
            if (fStr !== '' && cStr !== '' && Number.isFinite(fN) && Number.isFinite(cN)) {
              const f = Math.min(40, Math.max(1, fN));
              const c = Math.min(80, Math.max(1, cN));
              next.capacidad = String(f * c);
            }
          }
          return next;
        })
      )
    );
  }

  /** Ajusta filas/columnas a los límites al salir del campo (no mientras escribes). */
  function normalizeMapaForRow(i) {
    setZonas((rows) =>
      shareMapDimensions(
        rows.map((row, j) => {
          if (j !== i || !row.usa_mapa_asientos) return row;
          const fStr = String(row.mapa_filas ?? '').trim();
          const cStr = String(row.mapa_columnas ?? '').trim();
          let fN = parseInt(fStr, 10);
          let cN = parseInt(cStr, 10);
          if (!Number.isFinite(fN) || fStr === '') fN = 8;
          if (!Number.isFinite(cN) || cStr === '') cN = 10;
          const f = Math.min(40, Math.max(1, fN));
          const c = Math.min(80, Math.max(1, cN));
          return { ...row, mapa_filas: String(f), mapa_columnas: String(c), capacidad: String(f * c) };
        })
      )
    );
  }

  function aplicarPresetMapa(i, filas, cols) {
    const f = Math.min(40, Math.max(1, filas));
    const c = Math.min(80, Math.max(1, cols));
    setZonas((rows) =>
      shareMapDimensions(
        rows.map((row, j) =>
          j !== i
            ? row
            : {
                ...row,
                usa_mapa_asientos: true,
                mapa_filas: String(f),
                mapa_columnas: String(c),
                capacidad: String(f * c),
              }
        )
      )
    );
  }

  function toggleSeatCoordForZone(zoneIndex, seatKey) {
    setZonas((rows) => {
      const takenByOther = rows.some((z, j) => {
        if (j === zoneIndex) return false;
        if (!z.usa_mapa_asientos) return false;
        const arr = Array.isArray(z.seat_coords) ? z.seat_coords : [];
        return arr.includes(seatKey);
      });
      if (takenByOther) return rows;
      return rows.map((z, j) => {
        if (j !== zoneIndex) return z;
        const cur = new Set(Array.isArray(z.seat_coords) ? z.seat_coords : []);
        if (cur.has(seatKey)) cur.delete(seatKey);
        else cur.add(seatKey);
        return { ...z, seat_coords: [...cur] };
      });
    });
  }

  async function onImageFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImageUploading(true);
    try {
      const data = await uploadOrganizerEventImage(file);
      if (data?.url) setImagen(data.url);
    } catch (err) {
      setError(err.data?.error || err.message || 'No se pudo subir la imagen');
    } finally {
      setImageUploading(false);
      e.target.value = '';
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    
    // Validar campos requeridos manualmente y hacer scroll al primero que falle
    const requiredFields = formRef.current?.querySelectorAll('[required]');
    for (const field of requiredFields) {
      if (!field.value || (field.type === 'checkbox' && !field.checked)) {
        const label = field.closest('div')?.querySelector('label')?.textContent?.replace('*', '').trim() || 'Este campo';
        setError(`Falta completar: ${label}`);
        field.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => field.focus(), 300);
        return;
      }
    }
    
    // Validar descripción detallada obligatoria
    if (!descripcion || descripcion.trim() === '') {
      setError('La descripción detallada es obligatoria. Por favor, proporciona información sobre el evento.');
      return;
    }
    
    // Validar fechas de venta obligatorias
    if (!venta_inicio || venta_inicio.trim() === '') {
      setError('La fecha de inicio de venta es obligatoria.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    
    if (!venta_fin || venta_fin.trim() === '') {
      setError('La fecha de fin de venta es obligatoria.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    
    for (const z of zonas) {
      const nombre = composeZonaName(z.tipo_zona, z.nombre_otro, z.etiqueta_tipo);
      if (!nombre) {
        setError('Cada zona debe tener tipo VIP, GENERAL, GRADAS u "Otro" con un nombre.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    
    // Validar fechas del evento
    const dateMsg = validateFutureEventDraft({ fecha, fecha_fin, venta_inicio, venta_fin });
    if (dateMsg) {
      setError(dateMsg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const urlMapTrim = String(url_mapa || '').trim();
    if (!isGoogleMapsUrl(urlMapTrim)) {
      setError(
        'Pega un enlace de Google Maps válido (en la app o en maps.google.com: Compartir → Copiar enlace). Enlaces cortos goo.gl o maps.app.goo.gl también sirven.'
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    const body = {
      titulo,
      categoria_id: categoria_id === '' ? null : Number(categoria_id),
      imagen: imagen || null,
      descripcion: descripcion || null,
      estado_publicacion,
      fecha: fecha ? new Date(fecha + 'Z').toISOString() : null,
      fecha_fin: fecha_fin ? new Date(fecha_fin + 'Z').toISOString() : null,
      recinto: recinto || null,
      ubicacion,
      direccion: direccion || null,
      url_mapa: urlMapTrim,
      venta_inicio: venta_inicio ? new Date(venta_inicio + 'Z').toISOString() : null,
      venta_fin: venta_fin ? new Date(venta_fin + 'Z').toISOString() : null,
      limite_boletos_por_transaccion: limite_boletos_por_transaccion === '' ? 6 : Number(limite_boletos_por_transaccion),
      generar_qr_email: generar_qr_email,
      instrucciones_canje: instrucciones_canje || null,
      url_plano: null,
      idrecinto: null,
      usar_plantilla_recinto: false,
      aplicar_datos_recinto: false,
      zonas: zonas.map((z) => {
        const useMap = Boolean(z.usa_mapa_asientos);
        const mf = Math.min(40, Math.max(1, parseInt(z.mapa_filas, 10) || 8));
        const mc = Math.min(80, Math.max(1, parseInt(z.mapa_columnas, 10) || 10));
        const capNum = useMap ? mf * mc : Number(z.capacidad);
        const base = {
          nombre_seccion: composeZonaName(z.tipo_zona, z.nombre_otro, z.etiqueta_tipo).slice(0, 80),
          descripcion_zona: z.descripcion_zona || null,
          precio: Number(z.precio),
          capacidad: capNum,
          usa_mapa_asientos: useMap ? 1 : 0,
          mapa_filas: useMap ? mf : null,
          mapa_columnas: useMap ? mc : null,
          limite_por_transaccion: z.limite_por_transaccion === '' ? null : Number(z.limite_por_transaccion),
        };
        const hasX = z.pos_x !== '' && z.pos_x != null;
        const hasY = z.pos_y !== '' && z.pos_y != null;
        if (hasX && hasY) {
          base.pos_x = Number(z.pos_x);
          base.pos_y = Number(z.pos_y);
        }
        if (useMap) {
          base.seat_coords = (Array.isArray(z.seat_coords) ? z.seat_coords : [])
            .map((k) => {
              const [f, c] = String(k).split(':');
              const fila = String(f || '').trim().toUpperCase();
              const columna = Number(c);
              if (!fila || !Number.isFinite(columna) || columna < 1) return null;
              return { fila, columna: Math.floor(columna) };
            })
            .filter(Boolean);
        }
        return base;
      }),
    };
    try {
      if (isEdit) {
        await apiFetch(`/api/organizer/events/${editId}`, { method: 'PUT', body });
      } else {
        await apiFetch('/api/organizer/events', { method: 'POST', body });
      }
      navigate('/organizador');
    } catch (err) {
      setError(err.data?.error || err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-500">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-red-600">{loadError}</p>
        <Link to="/organizador" className="mt-4 inline-block font-semibold text-brand-700 hover:underline">
          Volver al panel
        </Link>
      </div>
    );
  }

  const minDateTimeStr = datetimeLocalFloorToMinute();
  const minFechaFinStr = maxDatetimeLocal(fecha, minDateTimeStr);
  const minVentaFinStr = maxDatetimeLocal(venta_inicio, minDateTimeStr);
  const firstMapZoneIndex = zonas.findIndex((z) => Boolean(z.usa_mapa_asientos));
  const masterZona = firstMapZoneIndex >= 0 ? zonas[firstMapZoneIndex] : null;
  const masterRows = Math.min(40, Math.max(1, Number(masterZona?.mapa_filas) || 8));
  const masterCols = Math.min(80, Math.max(1, Number(masterZona?.mapa_columnas) || 10));

  return (
    <div className="organizer-event-form-page">
      <div>
        <div>
          <p>Organizador</p>
          <h1>{isEdit ? 'Editar evento' : 'Nuevo evento'}</h1>
        </div>
        <Link to="/organizador">← Panel</Link>
      </div>

      <form ref={formRef} onSubmit={onSubmit} noValidate>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <section>
          <h2>1. Información general</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Nombre del evento *</label>
              <input
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={50}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-500">{titulo.length}/50 caracteres</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Categoría</label>
              <select
                value={categoria_id}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              >
                <option value="">— Seleccionar —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Imagen promocional</label>
              <p className="mt-0.5 text-xs text-zinc-500">
                Sube una imagen desde tu equipo o pega una URL pública. Para un banner nítido en pantallas grandes y
                móviles retina, usa <strong className="font-semibold text-zinc-700">al menos ~1920×820 px</strong> (o
                más, horizontal tipo 21∶9). Imágenes muy pequeñas se verán pixeladas al ampliarse.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:border-brand-400 hover:text-brand-800">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    disabled={imageUploading || saving}
                    onChange={onImageFileChange}
                  />
                  {imageUploading ? 'Subiendo…' : 'Importar desde el dispositivo'}
                </label>
                {imagen && (
                  <img
                    src={imagen}
                    alt=""
                    className="h-14 w-24 shrink-0 rounded-lg border border-zinc-200 object-cover object-center"
                    title="Vista previa"
                  />
                )}
              </div>
              <label className="mt-3 block text-xs font-medium text-zinc-600">O URL de imagen</label>
              <input
                value={imagen}
                onChange={(e) => setImagen(e.target.value)}
                placeholder="https://… o /uploads/event-images/…"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Descripción detallada *</label>
              <textarea
                required
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                maxLength={300}
                rows={5}
                placeholder="Reglas, qué incluye el boleto, restricciones de edad…"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-500">{descripcion.length}/300 caracteres</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Estado en la web *</label>
              <select
                value={estado_publicacion}
                onChange={(e) => setEstadoPublicacion(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              >
                <option value="publicado">Publicado (visible para el público)</option>
                <option value="borrador">Borrador (no aparece en el listado público)</option>
              </select>
              <p className="mt-1 text-xs text-zinc-500">
                “Agotado” se calcula cuando no quedan boletos; no es un estado manual aquí.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2>2. Logística y ubicación</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Fecha del evento y dónde se realiza. Los asientos numerados se configuran en la siguiente sección: solo
            indicas <strong className="font-semibold text-zinc-800">cuántas filas</strong> y{' '}
            <strong className="font-semibold text-zinc-800">cuántos asientos por fila</strong>; al guardar se crean solos.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700">Fecha y hora de inicio *</label>
              <input
                type="datetime-local"
                required
                min={minDateTimeStr}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-500">Solo fechas y horas posteriores al momento actual.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700">Fecha y hora de cierre</label>
              <input
                type="datetime-local"
                min={minFechaFinStr}
                value={fecha_fin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700">Recinto / lugar</label>
              <input
                value={recinto}
                onChange={(e) => setRecinto(e.target.value)}
                maxLength={50}
                placeholder="Ej. Arena Ciudad de México"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-500">{recinto.length}/50 caracteres</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Resumen ubicación (listados) *</label>
              <input
                required
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                maxLength={50}
                placeholder="Ej. CDMX · Centro"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-500">{ubicacion.length}/50 caracteres</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700">Dirección física</label>
              <input
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                maxLength={50}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-500">{direccion.length}/50 caracteres</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700">Enlace de Google Maps *</label>
              <input
                required
                value={url_mapa}
                onChange={(e) => setUrlMapa(e.target.value)}
                placeholder="https://maps.app.goo.gl/… o https://www.google.com/maps/…"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-500">
                En Google Maps: ubicación → Compartir → Copiar enlace. Los compradores lo verán en la ficha y en el
                checkout.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2>3. Zonas y asientos</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Una zona = un tipo de boleto (VIP, General…). Marca <strong className="font-semibold text-zinc-800">butacas numeradas</strong>, pon{' '}
            <strong className="font-semibold text-zinc-800">filas</strong> y <strong className="font-semibold text-zinc-800">asientos por fila</strong> y guarda: el sistema genera el mapa completo. Desmarca solo si vendes cupo general sin elegir asiento.
          </p>
          <div className="mt-4 space-y-6">
            {zonas.map((z, i) => (
              (() => {
                const isMasterMapZone = Boolean(z.usa_mapa_asientos) && i === firstMapZoneIndex;
                const ownSeats = new Set(Array.isArray(z.seat_coords) ? z.seat_coords : []);
                const takenByOther = new Set(
                  zonas.flatMap((zz, j) =>
                    j === i || !zz.usa_mapa_asientos ? [] : Array.isArray(zz.seat_coords) ? zz.seat_coords : []
                  )
                );
                return (
              <div key={i} className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-zinc-800">Zona {i + 1}</span>
                    <p className="text-xs text-zinc-500">
                      Nombre visible:{' '}
                      <strong className="text-zinc-700">
                        {composeZonaName(z.tipo_zona, z.nombre_otro, z.etiqueta_tipo) || '—'}
                      </strong>
                    </p>
                  </div>
                  {zonas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeZona(i)}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-zinc-600">Zona *</label>
                    <select
                      value={z.tipo_zona}
                      onChange={(e) => patchZona(i, 'tipo_zona', e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                    >
                      <option value="VIP">VIP</option>
                      <option value="GENERAL">GENERAL</option>
                      <option value="GRADAS">GRADAS</option>
                      <option value="otro">Otro (nombre propio)</option>
                    </select>
                  </div>
                  {z.tipo_zona === 'otro' && (
                    <div>
                      <label className="text-xs font-medium text-zinc-600">Nombre de la zona *</label>
                      <input
                        required
                        value={z.nombre_otro}
                        onChange={(e) => patchZona(i, 'nombre_otro', e.target.value)}
                        placeholder="Ej. Palco norte"
                        className="mt-0.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                  {z.tipo_zona !== 'otro' && (
                    <div>
                      <label className="text-xs font-medium text-zinc-600">Subzona / lado (opcional)</label>
                      <input
                        value={z.etiqueta_tipo || ''}
                        onChange={(e) => patchZona(i, 'etiqueta_tipo', e.target.value.slice(0, 40))}
                        placeholder="Ej. Lateral A, Sur, Preferente 1"
                        className="mt-0.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Nombre final: <strong>{composeZonaName(z.tipo_zona, '', z.etiqueta_tipo || '')}</strong>
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-zinc-600">Precio por boleto (MXN) *</label>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="numeric"
                      maxLength={6}
                      value={z.precio}
                      onChange={(e) => {
                        let v = e.target.value.replace(/[^0-9.]/g, '');
                        if (v.length > 6) v = v.slice(0, 6);
                        patchZona(i, 'precio', v);
                      }}
                      className="mt-0.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2 rounded-xl border-2 border-brand-200 bg-brand-50/50 px-4 py-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-zinc-900">
                      <input
                        type="checkbox"
                        checked={Boolean(z.usa_mapa_asientos)}
                        onChange={(e) => patchZona(i, 'usa_mapa_asientos', e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      Butacas numeradas (el comprador elige asiento en el mapa)
                    </label>
                    <p className="mt-1 text-xs text-zinc-600">
                      Activo = rejilla tipo cine (filas con letras, asientos con números). Al guardar el evento se crean
                      todos los asientos de una vez.
                    </p>
                    {z.usa_mapa_asientos ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {isMasterMapZone ? (
                          <div className="sm:col-span-2">
                            <p className="mb-1 text-xs font-medium text-zinc-700">Opciones rápidas</p>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { label: '8 x 10', filas: 8, cols: 10 },
                                { label: '10 x 12', filas: 10, cols: 12 },
                                { label: '12 x 14', filas: 12, cols: 14 },
                                { label: '15 x 20', filas: 15, cols: 20 },
                              ].map((opt) => (
                                <button
                                  key={opt.label}
                                  type="button"
                                  className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:border-brand-400 hover:text-brand-700"
                                  onClick={() => aplicarPresetMapa(i, opt.filas, opt.cols)}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="sm:col-span-2 space-y-2">
                            <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs font-medium text-indigo-900">
                              Esta zona usa el mismo mapa base de la primera zona. Marca aquí qué asientos pertenecen a{' '}
                              <strong>{composeZonaName(z.tipo_zona, z.nombre_otro, z.etiqueta_tipo) || 'esta zona'}</strong>.
                            </p>
                            <div className="max-h-52 overflow-auto rounded-lg border border-zinc-200 bg-white p-2">
                              {Array.from({ length: masterRows }).map((_, ri) => {
                                const fila = rowLetter(ri);
                                return (
                                  <div key={fila} className="mb-1 flex items-center gap-1">
                                    <span className="w-5 text-[10px] font-bold text-zinc-500">{fila}</span>
                                    <div className="flex flex-wrap gap-1">
                                      {Array.from({ length: masterCols }).map((__, ci) => {
                                        const col = ci + 1;
                                        const key = `${fila}:${col}`;
                                        const selected = ownSeats.has(key);
                                        const blocked = takenByOther.has(key);
                                        return (
                                          <button
                                            key={key}
                                            type="button"
                                            title={`${fila}${col}${blocked ? ' (ya asignado a otra zona)' : ''}`}
                                            disabled={blocked}
                                            onClick={() => toggleSeatCoordForZone(i, key)}
                                            className={`h-6 min-w-6 rounded border px-1 text-[10px] font-bold ${
                                              selected
                                                ? 'border-brand-600 bg-brand-600 text-white'
                                                : blocked
                                                  ? 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-300'
                                                  : 'border-zinc-300 bg-white text-zinc-700 hover:border-brand-400'
                                            }`}
                                          >
                                            {col}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <p className="text-[11px] text-zinc-500">
                              Seleccionados para esta zona: <strong>{ownSeats.size}</strong> asientos.
                            </p>
                          </div>
                        )}
                        <div>
                          <label className="text-xs font-medium text-zinc-700">¿Cuántas filas? *</label>
                          <input
                            required
                            type="number"
                            inputMode="numeric"
                            value={z.mapa_filas}
                            onChange={(e) => patchZona(i, 'mapa_filas', e.target.value)}
                            onBlur={() => normalizeMapaForRow(i)}
                            disabled={!isMasterMapZone}
                            className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                          />
                          <p className="mt-0.5 text-[11px] text-zinc-500">Ej. 8 → filas A a H</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-zinc-700">¿Cuántos asientos por fila? *</label>
                          <input
                            required
                            type="number"
                            inputMode="numeric"
                            value={z.mapa_columnas}
                            onChange={(e) => patchZona(i, 'mapa_columnas', e.target.value)}
                            onBlur={() => normalizeMapaForRow(i)}
                            disabled={!isMasterMapZone}
                            className="mt-0.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                          />
                          <p className="mt-0.5 text-[11px] text-zinc-500">Ej. 10 → números 1 a 10</p>
                        </div>
                        <p className="sm:col-span-2 rounded-lg bg-white/80 px-2 py-1.5 text-center text-sm font-medium text-brand-900">
                          Total en esta zona: {totalAsientosPreview(z) ?? '…'} asientos
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-zinc-500">Desactivado: indica abajo cuántos boletos hay en total (cupo).</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-600">Capacidad (stock) *</label>
                    <input
                      required
                      type="number"
                      min="1"
                      inputMode="numeric"
                      maxLength={6}
                      disabled={Boolean(z.usa_mapa_asientos)}
                      value={z.capacidad}
                      onChange={(e) => {
                        let v = e.target.value.replace(/\D/g, '');
                        if (v.length > 6) v = v.slice(0, 6);
                        patchZona(i, 'capacidad', v);
                      }}
                      className="mt-0.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-600">Límite por transacción (zona)</label>
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Vacío = usar global"
                      value={z.limite_por_transaccion}
                      onChange={(e) => {
                        let v = e.target.value.replace(/\D/g, '');
                        if (v.length > 6) v = v.slice(0, 6);
                        patchZona(i, 'limite_por_transaccion', v);
                      }}
                      className="mt-0.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-zinc-600">Descripción de la zona</label>
                    <textarea
                      value={z.descripcion_zona}
                      onChange={(e) => patchZona(i, 'descripcion_zona', e.target.value.slice(0, 300))}
                      maxLength={300}
                      rows={2}
                      placeholder="Beneficios de esta sección…"
                      className="mt-0.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-zinc-400">{z.descripcion_zona?.length || 0}/300</p>
                  </div>
                </div>
              </div>
                );
              })()
            ))}
            <button
              type="button"
              onClick={addZona}
              className="text-sm font-semibold text-brand-700 hover:underline"
            >
              + Añadir otra zona
            </button>
          </div>
        </section>

        <section>
          <h2>4. Control de ventas</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Inicio de venta pública *</label>
              <input
                type="datetime-local"
                required
                value={venta_inicio}
                onChange={(e) => setVentaInicio(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-500">Puede ser la fecha y hora actual para venta inmediata.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Fin de venta *</label>
              <input
                type="datetime-local"
                required
                value={venta_fin}
                onChange={(e) => setVentaFin(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-500">Debe ser posterior al inicio de venta y antes del evento.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700">
                Límite máximo de boletos por compra (evento)
              </label>
              <input
                type="number"
                min="1"
                inputMode="numeric"
                maxLength={6}
                value={limite_boletos_por_transaccion}
                onChange={(e) => {
                  let v = e.target.value.replace(/\D/g, '');
                  if (v.length > 6) v = v.slice(0, 6);
                  setLimiteBoletos(v);
                }}
                className="mt-1 w-full max-w-xs rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
            </div>
          </div>
          <div className="mt-6 rounded-lg border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Comisión del organizador</p>
            <p className="mt-1 text-amber-900/90">
              El dinero neto que recibirás depende de las comisiones de la plataforma. En el panel de
              estadísticas verás ventas brutas aprobadas; los porcentajes exactos los confirma tu administrador o contrato.
            </p>
          </div>
        </section>

        <section>
          <h2>5. Validación y canje</h2>
          <div className="mt-4 space-y-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={generar_qr_email}
                onChange={(e) => setGenerarQrEmail(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-brand-600"
              />
              <span>
                <span className="font-medium text-zinc-800">Generar / enviar código QR por correo tras el pago</span>
                <span className="mt-0.5 block text-sm text-zinc-500">
                  (La integración real irá cuando conectes Mercado Pago y el envío de correos.)
                </span>
              </span>
            </label>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Instrucciones de canje para el cliente</label>
              <textarea
                value={instrucciones_canje}
                onChange={(e) => setInstruccionesCanje(e.target.value.slice(0, 300))}
                maxLength={300}
                rows={3}
                placeholder="Ej. Presenta tu código en la entrada principal…"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-400">{instrucciones_canje?.length || 0}/300</p>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-brand-600 px-8 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear evento'}
          </button>
          <Link
            to="/organizador"
            className="inline-flex items-center rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
