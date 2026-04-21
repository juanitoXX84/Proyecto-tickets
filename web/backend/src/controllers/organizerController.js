const eventModel = require('../models/eventModel');
const eventZonaModel = require('../models/eventZonaModel');
const eventSeatModel = require('../models/eventSeatModel');
const recintoModel = require('../models/recintoModel');
const userModel = require('../models/userModel');
const { parsePositiveIntParam } = require('../utils/validation');
const { isGoogleMapsUrl, normalizeMapUrl } = require('../utils/googleMapsUrl');
const { normalizePlanoColor, ensureUniqueZonaPlanoColors } = require('../utils/zonaPlanoColor');

/** Fechas del evento y venta: solo instantes futuros; orden coherente entre inicio/fin. */
function validateOrganizerEventDates(payload) {
  const now = Date.now();

  const fechaMs = payload.fecha ? new Date(payload.fecha).getTime() : NaN;
  if (Number.isNaN(fechaMs)) {
    return { error: 'La fecha y hora de inicio no son válidas' };
  }
  if (fechaMs <= now) {
    return { error: 'La fecha y hora de inicio del evento deben ser posteriores al momento actual' };
  }

  if (payload.fecha_fin) {
    const finMs = new Date(payload.fecha_fin).getTime();
    if (Number.isNaN(finMs)) {
      return { error: 'La fecha de cierre del evento no es válida' };
    }
    if (finMs <= now) {
      return { error: 'La fecha de cierre del evento no puede ser una fecha u hora ya pasada' };
    }
    if (finMs < fechaMs) {
      return { error: 'La fecha de cierre debe ser posterior a la fecha de inicio del evento' };
    }
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
  if (payload.venta_inicio) {
    const viMs = new Date(payload.venta_inicio).getTime();
    if (Number.isNaN(viMs)) {
      return { error: 'La fecha de inicio de venta no es válida' };
    }
    const viMinStr = toLocalStr(payload.venta_inicio);
    if (viMinStr < nowMinStr) {
      return { error: 'El inicio de venta no puede ser antes de ahora' };
    }
    if (viMs >= fechaMs) {
      return { error: 'El inicio de venta debe ser antes del inicio del evento' };
    }
  }

  // venta_fin: no antes de ahora (al minuto), no después del evento, después de venta_inicio
  if (payload.venta_fin) {
    const vfMs = new Date(payload.venta_fin).getTime();
    if (Number.isNaN(vfMs)) {
      return { error: 'La fecha de fin de venta no es válida' };
    }
    const vfMinStr = toLocalStr(payload.venta_fin);
    if (vfMinStr < nowMinStr) {
      return { error: 'El fin de venta no puede ser antes de ahora' };
    }
    if (vfMs >= fechaMs) {
      return { error: 'El fin de venta debe ser antes del inicio del evento' };
    }
    if (payload.venta_inicio) {
      const viMs = new Date(payload.venta_inicio).getTime();
      if (!Number.isNaN(viMs) && vfMs < viMs) {
        return { error: 'El fin de venta debe ser posterior o igual al inicio de venta' };
      }
    }
  }

  return null;
}

function canManageEvent(user, eventRow) {
  if (!eventRow) return false;
  if (user.rol === 'admin') return true;
  if (user.rol === 'organizador' && eventRow.idorganizador === user.id) return true;
  return false;
}

function parseIdrecinto(body) {
  if (body.idrecinto === undefined || body.idrecinto === null || body.idrecinto === '') return null;
  const n = Number(body.idrecinto);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/** Zonas con color/pins: recinto legacy o URL de plano manual en `eventos.url_plano`. */
function hasPlanoContext(body) {
  if (parseIdrecinto(body)) return true;
  const raw = body.url_plano !== undefined && body.url_plano !== null ? String(body.url_plano).trim() : '';
  return raw.length > 0;
}

function usePlantillaRecinto(body) {
  return (
    body.usar_plantilla_recinto === true ||
    body.usar_plantilla_recinto === 1 ||
    body.usar_plantilla_recinto === '1' ||
    body.usar_plantilla_recinto === 'true'
  );
}

async function resolveZonasFromPlantillaIfRequested(body) {
  if (!usePlantillaRecinto(body)) return null;
  const rid = parseIdrecinto(body);
  if (!rid) {
    return { error: 'Para usar la plantilla debes elegir un recinto del catálogo (idrecinto).' };
  }
  if (!(await recintoModel.tableExists())) {
    return { error: 'No hay catálogo de recintos en la base de datos. Define las zonas manualmente.' };
  }
  const plant = await recintoModel.listPlantilla(rid);
  if (!plant.length) {
    return {
      error:
        'Este recinto no tiene plantilla de zonas. Configúrala en administración o desmarca “Usar plantilla”.',
    };
  }
  const zonas = plant.map((p) => {
    const pr = Number(p.precio_sugerido);
    const precio = Number.isFinite(pr) && pr > 0 ? pr : 1;
    const rawX = p.pos_x;
    const rawY = p.pos_y;
    let pos_x = null;
    let pos_y = null;
    if (rawX != null && rawX !== '' && rawY != null && rawY !== '') {
      const x = Number(rawX);
      const y = Number(rawY);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        pos_x = Math.round(Math.min(100, Math.max(0, x)) * 100) / 100;
        pos_y = Math.round(Math.min(100, Math.max(0, y)) * 100) / 100;
      }
    }
    return {
      nombre_seccion: p.nombre_seccion,
      descripcion_zona: p.descripcion_zona,
      precio,
      capacidad: p.capacidad,
      usa_mapa_asientos: 0,
      mapa_filas: null,
      mapa_columnas: null,
      limite_por_transaccion: p.limite_por_transaccion,
      pos_x,
      pos_y,
      color_plano: normalizePlanoColor(p.color_plano),
    };
  });
  const colorErr = ensureUniqueZonaPlanoColors(zonas);
  if (colorErr.error) return { error: colorErr.error };
  return { zonas };
}

async function validateAforoConRecinto(idrecinto, zonas) {
  if (!idrecinto || !zonas?.length) return null;
  if (!(await recintoModel.tableExists())) return null;
  const rec = await recintoModel.findById(idrecinto);
  if (!rec) return 'El recinto indicado no existe.';
  if (!rec.activo) return 'El recinto seleccionado está inactivo.';
  const sumCap = zonas.reduce((s, z) => s + Number(z.capacidad || 0), 0);
  const maxA = Number(rec.aforo_maximo) || 0;
  if (maxA > 0 && sumCap > maxA) {
    return `La suma de capacidades de las zonas (${sumCap}) supera el aforo máximo del recinto (${maxA}).`;
  }
  return null;
}

async function enrichBaseFromRecintoCatalogo(base, body, idrecinto) {
  if (!idrecinto) return;
  const off = body.aplicar_datos_recinto === false || body.aplicar_datos_recinto === 0 || body.aplicar_datos_recinto === '0';
  if (off) return;
  if (!(await recintoModel.tableExists())) return;
  const rec = await recintoModel.findById(idrecinto);
  if (!rec) return;
  if (!(base.recinto && String(base.recinto).trim()) && rec.nombre) {
    base.recinto = rec.nombre;
  }
  if (!(base.direccion && String(base.direccion).trim()) && rec.direccion) {
    base.direccion = String(rec.direccion).trim();
  }
  const mapRec = rec.url_mapa != null ? String(rec.url_mapa).trim() : '';
  if (!(base.url_mapa && String(base.url_mapa).trim()) && mapRec && isGoogleMapsUrl(mapRec)) {
    base.url_mapa = normalizeMapUrl(mapRec).slice(0, 512);
  }
}

function parseZonas(body) {
  let z = body.zonas;
  if (typeof z === 'string') {
    try {
      z = JSON.parse(z);
    } catch {
      return { error: 'El campo zonas no es un JSON válido' };
    }
  }
  if (!Array.isArray(z) || z.length < 1) {
    return { error: 'Debes definir al menos una zona de boletos (nombre, precio, capacidad)' };
  }
  const out = [];
  for (const row of z) {
    const nombre_seccion = String(row.nombre_seccion || '').trim();
    const precio = Number(row.precio);
    const useMapa =
      row.usa_mapa_asientos === true ||
      row.usa_mapa_asientos === 1 ||
      row.usa_mapa_asientos === '1';
    let mf =
      row.mapa_filas != null && row.mapa_filas !== '' ? Number(row.mapa_filas) : null;
    let mc =
      row.mapa_columnas != null && row.mapa_columnas !== '' ? Number(row.mapa_columnas) : null;
    let capacidadNum = Number(row.capacidad);
    if (useMapa) {
      mf = Math.min(40, Math.max(1, mf || 8));
      mc = Math.min(80, Math.max(1, mc || 10));
      capacidadNum = mf * mc;
    }
    if (!nombre_seccion) {
      return { error: 'Cada zona debe tener un nombre de sección' };
    }
    if (!Number.isFinite(precio) || precio <= 0) {
      return { error: `Precio inválido en la zona "${nombre_seccion}"` };
    }
    if (!Number.isFinite(capacidadNum) || capacidadNum < 1) {
      return { error: `Capacidad inválida en la zona "${nombre_seccion}"` };
    }
    let limite_por_transaccion = null;
    if (row.limite_por_transaccion != null && row.limite_por_transaccion !== '') {
      limite_por_transaccion = Number(row.limite_por_transaccion);
      if (!Number.isFinite(limite_por_transaccion) || limite_por_transaccion < 1) {
        return { error: `Límite por transacción inválido en "${nombre_seccion}"` };
      }
    }
    let pos_x = null;
    let pos_y = null;
    const hasX = row.pos_x != null && row.pos_x !== '';
    const hasY = row.pos_y != null && row.pos_y !== '';
    if (hasX || hasY) {
      if (!hasX || !hasY) {
        return { error: `En "${nombre_seccion}" debes enviar pos_x y pos_y juntos (o ninguno)` };
      }
      const x = Number(row.pos_x);
      const y = Number(row.pos_y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { error: `Hotspot inválido en "${nombre_seccion}"` };
      }
      pos_x = Math.round(Math.min(100, Math.max(0, x)) * 100) / 100;
      pos_y = Math.round(Math.min(100, Math.max(0, y)) * 100) / 100;
    }
    out.push({
      nombre_seccion,
      descripcion_zona: row.descripcion_zona ? String(row.descripcion_zona).trim().slice(0, 4000) : null,
      precio,
      capacidad: capacidadNum,
      usa_mapa_asientos: useMapa ? 1 : 0,
      mapa_filas: useMapa ? mf : null,
      mapa_columnas: useMapa ? mc : null,
      limite_por_transaccion,
      pos_x,
      pos_y,
      color_plano: normalizePlanoColor(row.color_plano),
      seat_coords: (() => {
        const raw = row.seat_coords;
        if (!Array.isArray(raw) || !useMapa) return [];
        const seen = new Set();
        const coords = [];
        for (const it of raw) {
          let fila = '';
          let columna = NaN;
          if (it && typeof it === 'object') {
            fila = String(it.fila || '').trim().toUpperCase();
            columna = Number(it.columna);
          } else if (typeof it === 'string') {
            const [f, c] = it.split(':');
            fila = String(f || '').trim().toUpperCase();
            columna = Number(c);
          }
          if (!fila || !Number.isFinite(columna) || columna < 1) continue;
          if (mf && mc) {
            if (columna > mc) continue;
            let maxRow = 0;
            for (let i = 0; i < fila.length; i += 1) {
              maxRow = maxRow * 26 + (fila.charCodeAt(i) - 64);
            }
            if (maxRow < 1 || maxRow > mf) continue;
          }
          const key = `${fila}:${Math.floor(columna)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          coords.push({ fila, columna: Math.floor(columna) });
        }
        return coords;
      })(),
    });
  }
  if (!hasPlanoContext(body)) {
    for (const row of out) row.color_plano = null;
  } else {
    const colorErr = ensureUniqueZonaPlanoColors(out);
    if (colorErr.error) return { error: colorErr.error };
  }
  return { zonas: out };
}

function estadoToActivo(body) {
  if (body.estado_publicacion === 'borrador') return false;
  if (body.activo === false || body.activo === 0 || body.activo === '0') return false;
  return true;
}

function mergeModeracionCreate(reqUser, base) {
  if (reqUser.rol === 'admin') {
    return {
      ...base,
      estado_moderacion: 'aprobado',
      moderacion_motivo: null,
      destacado: false,
      cancelado_at: null,
      motivo_cancelacion: null,
    };
  }
  if (!base.activo) {
    return { ...base, estado_moderacion: 'borrador', moderacion_motivo: null };
  }
  return { ...base, estado_moderacion: 'pendiente', moderacion_motivo: null };
}

function mergeModeracionUpdate(reqUser, prevEv, base) {
  if (reqUser.rol === 'admin') {
    return {
      ...base,
      estado_moderacion: prevEv.estado_moderacion || 'aprobado',
      moderacion_motivo: prevEv.moderacion_motivo ?? null,
    };
  }
  const estadoPrev = prevEv.estado_moderacion || 'borrador';
  const motivoPrev = prevEv.moderacion_motivo;
  if (!base.activo) {
    return { ...base, estado_moderacion: estadoPrev, moderacion_motivo: motivoPrev };
  }
  if (estadoPrev === 'aprobado') {
    return { ...base, estado_moderacion: 'aprobado', moderacion_motivo: null };
  }
  return { ...base, estado_moderacion: 'pendiente', moderacion_motivo: null };
}

function buildEventPayload(body, organizerId) {
  const categoriaRaw = body.categoria_id;
  const cat =
    categoriaRaw === '' || categoriaRaw === undefined || categoriaRaw === null
      ? null
      : Number(categoriaRaw);

  const rawMap =
    body.url_mapa !== undefined && body.url_mapa !== null
      ? body.url_mapa
      : body.urlMapa !== undefined && body.urlMapa !== null
        ? body.urlMapa
        : '';
  const urlMapRaw = String(rawMap).trim();
  const url_mapa_norm = urlMapRaw.length > 0 ? normalizeMapUrl(urlMapRaw).slice(0, 512) : '';
  const url_mapa = url_mapa_norm || null;

  let limite_boletos_por_transaccion = 6;
  if (body.limite_boletos_por_transaccion != null && body.limite_boletos_por_transaccion !== '') {
    const n = Number(body.limite_boletos_por_transaccion);
    if (Number.isFinite(n) && n >= 1 && n <= 100) {
      limite_boletos_por_transaccion = n;
    }
  }

  return {
    idorganizador: organizerId,
    titulo: body.titulo != null ? String(body.titulo).trim().slice(0, 50) : '',
    fecha: body.fecha,
    fecha_fin: body.fecha_fin || null,
    ubicacion: body.ubicacion != null ? String(body.ubicacion).trim().slice(0, 50) : '',
    recinto: body.recinto != null ? String(body.recinto).trim().slice(0, 50) : null,
    direccion: body.direccion != null ? String(body.direccion).trim().slice(0, 50) : null,
    url_mapa,
    imagen: body.imagen != null ? String(body.imagen).trim().slice(0, 1024) : null,
    categoria_id: cat,
    descripcion: body.descripcion != null ? String(body.descripcion).trim().slice(0, 300) : null,
    activo: estadoToActivo(body),
    venta_inicio: body.venta_inicio || null,
    venta_fin: body.venta_fin || null,
    limite_boletos_por_transaccion,
    generar_qr_email: body.generar_qr_email === false || body.generar_qr_email === 0 ? false : true,
    instrucciones_canje: body.instrucciones_canje != null ? String(body.instrucciones_canje).trim().slice(0, 4000) : null,
    url_plano:
      body.url_plano == null || body.url_plano === ''
        ? null
        : String(body.url_plano).trim().slice(0, 512) || null,
  };
}

function normalizeEventRowForNotify(row) {
  if (!row) return row;
  if (!Object.prototype.hasOwnProperty.call(row, 'estado_moderacion')) {
    return {
      ...row,
      estado_moderacion: Number(row.activo) === 1 ? 'aprobado' : 'borrador',
      moderacion_motivo: null,
      cancelado_at: null,
      motivo_cancelacion: null,
    };
  }
  return row;
}

function eventFullySold(ev, zonas) {
  const cap = Number(ev.capacidad) || 0;
  const soldAgg = Number(ev.boletosvendidos) || 0;
  const agregadoOk = cap > 0 && soldAgg >= cap;
  if (zonas && zonas.length > 0) {
    const zonasOk = zonas.every((z) => Number(z.boletos_vendidos || 0) >= Number(z.capacidad || 0));
    return agregadoOk || zonasOk;
  }
  return agregadoOk;
}

/**
 * Alertas derivadas de los eventos del organizador (sin tabla de notificaciones).
 */
async function notifications(req, res, next) {
  try {
    if (req.user.rol !== 'organizador') {
      return res.json({ ok: true, items: [] });
    }
    const rows = await eventModel.listByOrganizer(req.user.id);
    const normalized = rows.map(normalizeEventRowForNotify);
    const eventIds = normalized.map((e) => e.id);
    const zonasMap = await eventZonaModel.listGroupedByEventIds(eventIds);
    const now = Date.now();
    const items = [];

    for (const ev of normalized) {
      const zonas = zonasMap.get(Number(ev.id)) || [];
      const cancelado = ev.cancelado_at != null && String(ev.cancelado_at).trim() !== '';
      if (cancelado) {
        items.push({
          id: `cancel-${ev.id}`,
          type: 'evento_cancelado',
          titulo: 'Evento dado de baja',
          mensaje: ev.motivo_cancelacion
            ? String(ev.motivo_cancelacion).trim().slice(0, 500)
            : 'Tu evento fue cancelado en la plataforma.',
          idevento: ev.id,
          eventoTitulo: ev.titulo,
          at: ev.cancelado_at,
        });
        continue;
      }
      if (ev.estado_moderacion === 'rechazado') {
        items.push({
          id: `reject-${ev.id}`,
          type: 'moderacion_rechazada',
          titulo: 'Publicación rechazada',
          mensaje: ev.moderacion_motivo
            ? String(ev.moderacion_motivo).trim().slice(0, 500)
            : 'Revisa los datos del evento y vuelve a enviarlo a revisión.',
          idevento: ev.id,
          eventoTitulo: ev.titulo,
          at: null,
        });
        continue;
      }
      const fechaMs = ev.fecha ? new Date(ev.fecha).getTime() : 0;
      const futuro = !Number.isNaN(fechaMs) && fechaMs > now;
      const publicado = Number(ev.activo) === 1 && ev.estado_moderacion === 'aprobado';
      if (publicado && futuro && eventFullySold(ev, zonas)) {
        items.push({
          id: `soldout-${ev.id}`,
          type: 'entradas_agotadas',
          titulo: 'Entradas agotadas',
          mensaje: 'Se vendieron todas las entradas disponibles de este evento.',
          idevento: ev.id,
          eventoTitulo: ev.titulo,
          at: ev.fecha,
        });
      }
    }

    items.sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : 0;
      const tb = b.at ? new Date(b.at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return Number(b.idevento) - Number(a.idevento);
    });

    return res.json({ ok: true, items });
  } catch (err) {
    return next(err);
  }
}

async function listMine(req, res, next) {
  try {
    if (req.user.rol === 'admin') {
      const rows = await eventModel.listAllForAdmin();
      return res.json({ ok: true, eventos: rows });
    }
    if (req.user.rol !== 'organizador') {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }
    const rows = await eventModel.listByOrganizer(req.user.id);
    return res.json({ ok: true, eventos: rows });
  } catch (err) {
    return next(err);
  }
}

async function listRecintos(req, res, next) {
  try {
    const rows = await recintoModel.listForSelect({ soloActivos: true });
    return res.json({ ok: true, recintos: rows });
  } catch (err) {
    return next(err);
  }
}

async function getMineById(req, res, next) {
  try {
    const id = parsePositiveIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }
    const ev = await eventModel.findById(id);
    if (!ev) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    if (!canManageEvent(req.user, ev)) {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }
    const urlRaw = ev.url_mapa != null && ev.url_mapa !== '' ? String(ev.url_mapa) : ev.URL_MAPA;
    const url_mapa =
      urlRaw != null && String(urlRaw).trim() !== '' ? String(urlRaw).trim() : null;
    let zonasWithSeatCoords = ev.zonas;
    try {
      if (await eventSeatModel.tipoMapTableExists()) {
        const uni = await eventSeatModel.listUnifiedByEventId(id);
        const byZona = new Map();
        for (const s of uni.asientos || []) {
          const zid = Number(s.id_zona_tarifa);
          if (!Number.isFinite(zid) || zid < 1) continue;
          if (!byZona.has(zid)) byZona.set(zid, []);
          byZona.get(zid).push({
            fila: String(s.fila || '').toUpperCase(),
            columna: Number(s.columna),
          });
        }
        zonasWithSeatCoords = (Array.isArray(ev.zonas) ? ev.zonas : []).map((z) => ({
          ...z,
          seat_coords: byZona.get(Number(z.id)) || [],
        }));
      }
    } catch {
      zonasWithSeatCoords = ev.zonas;
    }
    return res.json({
      ok: true,
      evento: {
        ...ev,
        zonas: zonasWithSeatCoords,
        url_mapa,
        venta_abierta: eventModel.ventaAbierta(ev),
        evento_cancelado: Boolean(ev.cancelado_at),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    if (req.user.rol !== 'organizador' && req.user.rol !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Solo organizadores pueden crear eventos' });
    }
    const organizerId = req.user.rol === 'organizador' ? req.user.id : Number(req.body.idorganizador) || req.user.id;
    const plant = await resolveZonasFromPlantillaIfRequested(req.body);
    if (plant && plant.error) {
      return res.status(400).json({ ok: false, error: plant.error });
    }
    const parsed = plant?.zonas ? { zonas: plant.zonas } : parseZonas(req.body);
    if (parsed.error) {
      return res.status(400).json({ ok: false, error: parsed.error });
    }
    const idrecinto = parseIdrecinto(req.body);
    const aforoErr = await validateAforoConRecinto(idrecinto, parsed.zonas);
    if (aforoErr) {
      return res.status(400).json({ ok: false, error: aforoErr });
    }
    const base = buildEventPayload(req.body, organizerId);
    await enrichBaseFromRecintoCatalogo(base, req.body, idrecinto);
    if (!base.titulo) {
      return res.status(400).json({ ok: false, error: 'El nombre del evento es obligatorio' });
    }
    if (!base.fecha) {
      return res.status(400).json({ ok: false, error: 'La fecha y hora de inicio son obligatorias' });
    }
    if (!base.ubicacion) {
      return res.status(400).json({ ok: false, error: 'La ubicación o resumen del lugar es obligatorio' });
    }
    if (!base.url_mapa || !isGoogleMapsUrl(base.url_mapa)) {
      return res.status(400).json({
        ok: false,
        error:
          'Debes indicar un enlace válido de Google Maps (Compartir → Copiar enlace). No se aceptan otros mapas en este campo.',
      });
    }
    if (base.categoria_id != null && (!Number.isFinite(base.categoria_id) || base.categoria_id < 1)) {
      return res.status(400).json({ ok: false, error: 'Categoría inválida' });
    }
    const dateErr = validateOrganizerEventDates(base);
    if (dateErr) {
      return res.status(400).json({ ok: false, error: dateErr.error });
    }

    if (!base.descripcion || base.descripcion.trim() === '') {
      return res.status(400).json({ ok: false, error: 'La descripción detallada es obligatoria' });
    }
    if (!base.venta_inicio) {
      return res.status(400).json({ ok: false, error: 'La fecha de inicio de venta es obligatoria' });
    }
    if (!base.venta_fin) {
      return res.status(400).json({ ok: false, error: 'La fecha de fin de venta es obligatoria' });
    }

    const withMod = mergeModeracionCreate(req.user, base);
    const ev = await eventModel.createEventWithZones({
      ...withMod,
      zonas: parsed.zonas,
      idrecinto: idrecinto ?? null,
    });
    return res.status(201).json({ ok: true, evento: ev });
  } catch (err) {
    if (err.status === 400 || err.status === 503) {
      return res.status(err.status).json({ ok: false, error: err.message });
    }
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const id = parsePositiveIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }
    const ev = await eventModel.findById(id);
    if (!ev) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    if (!canManageEvent(req.user, ev)) {
      return res.status(403).json({ ok: false, error: 'No puedes editar este evento' });
    }
    if (ev.cancelado_at != null && String(ev.cancelado_at).trim() !== '') {
      return res.status(400).json({ ok: false, error: 'Este evento está cancelado y no se puede editar.' });
    }
    const organizerId = ev.idorganizador;
    const plant = await resolveZonasFromPlantillaIfRequested(req.body);
    if (plant && plant.error) {
      return res.status(400).json({ ok: false, error: plant.error });
    }
    const parsed = plant?.zonas ? { zonas: plant.zonas } : parseZonas(req.body);
    if (parsed.error) {
      return res.status(400).json({ ok: false, error: parsed.error });
    }
    const idrecinto =
      req.body.idrecinto === undefined ? undefined : parseIdrecinto(req.body);
    const aforoErr = await validateAforoConRecinto(
      idrecinto === undefined ? ev.idrecinto : idrecinto,
      parsed.zonas
    );
    if (aforoErr) {
      return res.status(400).json({ ok: false, error: aforoErr });
    }
    const base = buildEventPayload(req.body, organizerId);
    const ridForEnrich = idrecinto === undefined ? ev.idrecinto : idrecinto;
    await enrichBaseFromRecintoCatalogo(base, req.body, ridForEnrich);
    if (!base.titulo) {
      return res.status(400).json({ ok: false, error: 'El nombre del evento es obligatorio' });
    }
    if (!base.fecha) {
      return res.status(400).json({ ok: false, error: 'La fecha y hora de inicio son obligatorias' });
    }
    if (!base.ubicacion) {
      return res.status(400).json({ ok: false, error: 'La ubicación o resumen del lugar es obligatorio' });
    }
    if (!base.url_mapa || !isGoogleMapsUrl(base.url_mapa)) {
      return res.status(400).json({
        ok: false,
        error:
          'Debes indicar un enlace válido de Google Maps (Compartir → Copiar enlace). No se aceptan otros mapas en este campo.',
      });
    }
    if (base.categoria_id != null && (!Number.isFinite(base.categoria_id) || base.categoria_id < 1)) {
      return res.status(400).json({ ok: false, error: 'Categoría inválida' });
    }
    const dateErr = validateOrganizerEventDates(base);
    if (dateErr) {
      return res.status(400).json({ ok: false, error: dateErr.error });
    }

    if (!base.descripcion || base.descripcion.trim() === '') {
      return res.status(400).json({ ok: false, error: 'La descripción detallada es obligatoria' });
    }
    if (!base.venta_inicio) {
      return res.status(400).json({ ok: false, error: 'La fecha de inicio de venta es obligatoria' });
    }
    if (!base.venta_fin) {
      return res.status(400).json({ ok: false, error: 'La fecha de fin de venta es obligatoria' });
    }

    const withMod = mergeModeracionUpdate(req.user, ev, base);
    const updated = await eventModel.updateEventWithZones(id, {
      ...withMod,
      zonas: parsed.zonas,
      idrecinto,
    });
    return res.json({ ok: true, evento: updated });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ ok: false, error: err.message });
    }
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const id = parsePositiveIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }
    const ev = await eventModel.findById(id);
    if (!ev) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    if (!canManageEvent(req.user, ev)) {
      return res.status(403).json({ ok: false, error: 'No puedes eliminar este evento' });
    }

    const password =
      req.body && req.body.password != null && typeof req.body.password === 'string'
        ? req.body.password
        : '';
    if (!password.trim()) {
      return res.status(400).json({
        ok: false,
        error: 'Debes escribir tu contraseña para confirmar la eliminación del evento.',
      });
    }
    const cred = await userModel.findCredentialsForVerification(req.user.id);
    if (!cred) {
      return res.status(401).json({ ok: false, error: 'No se pudo verificar la cuenta' });
    }
    const passwordOk = await userModel.verifyPassword(cred, password);
    if (!passwordOk) {
      return res.status(403).json({
        ok: false,
        error:
          'Contraseña incorrecta. Si solo usas Google y no tienes contraseña en Ticket Rivals, configúrala en tu perfil primero.',
      });
    }

    const deleted = await eventModel.deleteEvent(id);
    if (!deleted) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    return res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
      return res.status(409).json({
        ok: false,
        error:
          'No se puede eliminar el evento: aún hay datos enlazados en la base de datos. Si el problema continúa, contacta al administrador.',
      });
    }
    return next(err);
  }
}

async function stats(req, res, next) {
  try {
    const id = parsePositiveIntParam(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }
    const ev = await eventModel.findById(id);
    if (!ev) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    }
    if (!canManageEvent(req.user, ev)) {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }
    const { query } = require('../config/database');
    let recaudado = 0;
    try {
      const ventas = await query(
        `SELECT COALESCE(SUM(p.monto), 0) AS recaudado
         FROM pagos p
         INNER JOIN ordenes o ON o.id = p.idorden
         WHERE o.idevento = ? AND p.estado = 'aprobado'`,
        [id]
      );
      recaudado = Number(ventas[0]?.recaudado || 0);
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        recaudado = null;
      } else {
        throw e;
      }
    }
    const countsRows = await query(
      `SELECT
         SUM(CASE WHEN b.estado IN ('pagado','activo','usado') THEN 1 ELSE 0 END) AS vendidos,
         SUM(CASE WHEN b.estado IN ('reservado') THEN 1 ELSE 0 END) AS reservados
       FROM boletos b WHERE b.idevento = ?`,
      [id]
    );
    const counts = countsRows[0] || {};
    const capacidad = ev.capacidad;
    const boletosvendidos = ev.boletosvendidos ?? 0;
    const disponibles = Math.max(0, capacidad - boletosvendidos);
    return res.json({
      ok: true,
      eventoId: id,
      capacidad,
      boletosvendidos,
      disponibles,
      recaudado,
      recaudado_nota:
        recaudado === null
          ? 'Ejecuta database/schema_updates.sql para habilitar recaudación por evento (columna ordenes.idevento).'
          : undefined,
      detalle_boletos: counts,
      nota_comisiones:
        'Las comisiones de la plataforma y de Mercado Pago se descuentan del cobro según los acuerdos vigentes; este panel muestra ventas brutas aprobadas.',
    });
  } catch (err) {
    return next(err);
  }
}

async function uploadEventImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No se recibió ninguna imagen' });
    }
    const url = `/uploads/event-images/${req.file.filename}`;
    return res.json({ ok: true, url });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listMine,
  listRecintos,
  getMineById,
  create,
  update,
  remove,
  stats,
  uploadEventImage,
  notifications,
};
