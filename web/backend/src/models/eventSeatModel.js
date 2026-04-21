const { query, getPool } = require('../config/database');

function isBadField(err) {
  return err && (err.code === 'ER_BAD_FIELD_ERROR' || Number(err.errno) === 1054);
}

function isNoTable(err) {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || Number(err.errno) === 1146);
}

/** Solo cacheamos "existe": si la tabla no existía al arrancar el proceso y se creó después,
 * debemos poder detectarla sin reiniciar el servidor (antes se guardaba false y el sync no insertaba nunca). */
let cachedTableExists = false;
async function tableExists() {
  if (cachedTableExists) return true;
  try {
    await query('SELECT 1 FROM evento_asientos LIMIT 0');
    cachedTableExists = true;
    return true;
  } catch (e) {
    if (isNoTable(e)) return false;
    throw e;
  }
}

let cachedTipoMapExists = null;
async function tipoMapTableExists() {
  if (cachedTipoMapExists !== null) return cachedTipoMapExists;
  try {
    await query('SELECT id FROM evento_asiento_zona_tipo LIMIT 0');
    cachedTipoMapExists = true;
  } catch (e) {
    if (isNoTable(e) || isBadField(e)) cachedTipoMapExists = false;
    else throw e;
  }
  return cachedTipoMapExists;
}

/** Índice 0 → A, 7 → H, 26 → AA */
function rowLetter(index) {
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

async function deleteSeatsForZonaConn(conn, zonaId) {
  await conn.execute(`DELETE FROM evento_asientos WHERE id_zona = ?`, [zonaId]);
}

/**
 * Regenera todas las butacas disponibles para una zona (transacción externa).
 */
async function syncZoneSeatsConn(conn, zonaId, filas, columnas) {
  const f = Math.min(40, Math.max(1, Math.floor(Number(filas)) || 8));
  const c = Math.min(80, Math.max(1, Math.floor(Number(columnas)) || 10));
  await deleteSeatsForZonaConn(conn, zonaId);
  for (let ri = 0; ri < f; ri += 1) {
    const fila = rowLetter(ri);
    for (let col = 1; col <= c; col += 1) {
      await conn.execute(
        `INSERT INTO evento_asientos (id_zona, fila, columna, estado) VALUES (?, ?, ?, 'available')`,
        [zonaId, fila, col]
      );
    }
  }
  await conn.execute(`UPDATE evento_zonas SET capacidad = ? WHERE id = ?`, [f * c, zonaId]);
}

/** Tras crear/editar zonas: sincroniza filas según columnas en BD. */
async function syncSeatMapsForEventConn(conn, eventId) {
  if (!(await tableExists())) return;
  let rows;
  try {
    const [r] = await conn.execute(
      `SELECT id, usa_mapa_asientos, mapa_filas, mapa_columnas FROM evento_zonas WHERE idevento = ?`,
      [eventId]
    );
    rows = r;
  } catch (e) {
    if (isBadField(e)) return;
    throw e;
  }
  for (const z of rows) {
    if (!Number(z.usa_mapa_asientos)) continue;
    const filas = z.mapa_filas != null ? Number(z.mapa_filas) : 8;
    const cols = z.mapa_columnas != null ? Number(z.mapa_columnas) : 10;
    await syncZoneSeatsConn(conn, z.id, filas, cols);
  }
}

async function listByZoneId(zonaId) {
  if (!(await tableExists())) return [];
  const rows = await query(
    `SELECT id, id_zona, fila, columna, estado FROM evento_asientos WHERE id_zona = ? ORDER BY fila ASC, columna ASC`,
    [zonaId]
  );
  return rows;
}

async function listByTariffZonaId(zonaId) {
  if (!(await tableExists())) return [];
  if (!(await tipoMapTableExists())) return [];
  return query(
    `SELECT s.id, s.id_zona, s.fila, s.columna, s.estado
     FROM evento_asiento_zona_tipo t
     INNER JOIN evento_asientos s ON s.id = t.id_asiento
     WHERE t.id_zona_tarifa = ?
     ORDER BY s.fila ASC, s.columna ASC`,
    [zonaId]
  );
}

async function hasTariffAssignmentForSeats(zonaTarifaId, seatIds) {
  if (!(await tipoMapTableExists())) return false;
  const ids = [...new Set((seatIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return false;
  const ph = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT COUNT(*) AS n
     FROM evento_asiento_zona_tipo
     WHERE id_zona_tarifa = ? AND id_asiento IN (${ph})`,
    [zonaTarifaId, ...ids]
  );
  return Number(rows[0]?.n || 0) === ids.length;
}

async function ensureTariffAssignmentsForEventConn(conn, eventId, overridesByZonaId = null) {
  if (!(await tableExists())) return;
  if (!(await tipoMapTableExists())) return;
  let zonas;
  try {
    const [zr] = await conn.execute(
      `SELECT id, idevento, orden, capacidad, precio, usa_mapa_asientos
       FROM evento_zonas
       WHERE idevento = ?
       ORDER BY orden ASC, id ASC`,
      [eventId]
    );
    zonas = zr;
  } catch (e) {
    if (isBadField(e) || isNoTable(e)) return;
    throw e;
  }
  const mapZones = zonas.filter((z) => Number(z.usa_mapa_asientos) === 1);
  if (mapZones.length < 2) return;

  const baseZone = mapZones[0];
  const [sr] = await conn.execute(
    `SELECT id, fila, columna
     FROM evento_asientos
     WHERE id_zona = ?
     ORDER BY fila ASC, columna ASC`,
    [baseZone.id]
  );
  const seats = sr || [];
  if (!seats.length) return;

  const filas = [...new Set(seats.map((s) => String(s.fila)))];
  const rowKey = (f) => {
    let n = 0;
    const s = String(f || '').toUpperCase();
    for (let i = 0; i < s.length; i += 1) n = n * 26 + (s.charCodeAt(i) - 64);
    return n;
  };
  filas.sort((a, b) => rowKey(a) - rowKey(b));

  const sortedZones = [...mapZones].sort((a, b) => Number(b.precio || 0) - Number(a.precio || 0));
  const weights = sortedZones.map((z) => Math.max(1, Number(z.capacidad) || 1));
  const wSum = weights.reduce((s, x) => s + x, 0);
  const nRows = filas.length;
  const counts = sortedZones.map((_, i) => Math.floor((weights[i] / wSum) * nRows));
  if (sortedZones.length <= nRows) {
    for (let i = 0; i < counts.length; i += 1) counts[i] = Math.max(1, counts[i]);
  }
  let used = counts.reduce((s, x) => s + x, 0);
  while (used > nRows) {
    let idx = counts.findIndex((x) => x > 1);
    if (idx < 0) idx = counts.findIndex((x) => x > 0);
    if (idx < 0) break;
    counts[idx] -= 1;
    used -= 1;
  }
  while (used < nRows) {
    const idx = used % counts.length;
    counts[idx] += 1;
    used += 1;
  }

  const seatToZonaOverride = new Map();
  let firstOverrideZonaId = null;
  if (overridesByZonaId && typeof overridesByZonaId === 'object') {
    const byCoord = new Map(seats.map((s) => [`${String(s.fila).toUpperCase()}:${Number(s.columna)}`, s.id]));
    const entries = overridesByZonaId instanceof Map ? [...overridesByZonaId.entries()] : Object.entries(overridesByZonaId);
    for (const [zonaIdRaw] of entries) {
      const zid = Number(zonaIdRaw);
      if (Number.isFinite(zid) && zid > 0 && firstOverrideZonaId == null) {
        firstOverrideZonaId = zid;
      }
    }
    for (const [zonaIdRaw, coords] of entries) {
      const zonaId = Number(zonaIdRaw);
      if (!Number.isFinite(zonaId) || zonaId < 1 || !Array.isArray(coords)) continue;
      for (const c of coords) {
        const fila = String(c?.fila || '').trim().toUpperCase();
        const col = Number(c?.columna);
        if (!fila || !Number.isFinite(col) || col < 1) continue;
        const sid = byCoord.get(`${fila}:${Math.floor(col)}`);
        if (!sid) continue;
        seatToZonaOverride.set(Number(sid), zonaId);
      }
    }
  }

  const rowToZona = new Map();
  let ptr = 0;
  for (let i = 0; i < sortedZones.length; i += 1) {
    for (let j = 0; j < counts[i] && ptr < filas.length; j += 1) {
      rowToZona.set(filas[ptr], sortedZones[i].id);
      ptr += 1;
    }
  }
  while (ptr < filas.length) {
    rowToZona.set(filas[ptr], sortedZones[sortedZones.length - 1].id);
    ptr += 1;
  }

  const baseSeatIds = seats.map((s) => Number(s.id)).filter((n) => Number.isFinite(n) && n > 0);
  if (!baseSeatIds.length) return;
  const ph = baseSeatIds.map(() => '?').join(',');

  // Si no vienen overrides explícitos y ya existe una asignación completa para estos asientos,
  // NO recalculamos (evita pisar selección manual del organizador al reabrir/vista pública).
  if (!overridesByZonaId) {
    const [existingRows] = await conn.execute(
      `SELECT t.id_asiento, t.id_zona_tarifa
       FROM evento_asiento_zona_tipo t
       INNER JOIN evento_zonas z ON z.id = t.id_zona_tarifa
       WHERE z.idevento = ? AND t.id_asiento IN (${ph})`,
      [eventId, ...baseSeatIds]
    );
    const validZonaIds = new Set(mapZones.map((z) => Number(z.id)));
    const existingMap = new Map();
    for (const r of existingRows || []) {
      const sid = Number(r.id_asiento);
      const zid = Number(r.id_zona_tarifa);
      if (!Number.isFinite(sid) || !Number.isFinite(zid)) continue;
      if (!validZonaIds.has(zid)) continue;
      existingMap.set(sid, zid);
    }
    if (existingMap.size === baseSeatIds.length) {
      return;
    }
    // Si está parcial, conservamos lo existente y completamos solo faltantes.
    for (const [sid, zid] of existingMap.entries()) {
      seatToZonaOverride.set(Number(sid), Number(zid));
    }
  }

  await conn.execute(`DELETE FROM evento_asiento_zona_tipo WHERE id_asiento IN (${ph})`, baseSeatIds);
  for (const s of seats) {
    const tarifaZonaId = Number(
      seatToZonaOverride.get(Number(s.id)) ??
        (firstOverrideZonaId != null ? firstOverrideZonaId : rowToZona.get(String(s.fila)))
    );
    if (!Number.isFinite(tarifaZonaId) || tarifaZonaId < 1) continue;
    await conn.execute(
      `INSERT INTO evento_asiento_zona_tipo (id_asiento, id_zona_tarifa) VALUES (?, ?)`,
      [s.id, tarifaZonaId]
    );
  }
}

async function ensureTariffAssignmentsForEvent(eventId, overridesByZonaId = null) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await ensureTariffAssignmentsForEventConn(conn, eventId, overridesByZonaId);
  } finally {
    conn.release();
  }
}

async function listUnifiedByEventId(eventId) {
  if (!(await tableExists())) return { zonas: [], asientos: [] };
  if (!(await tipoMapTableExists())) return { zonas: [], asientos: [] };

  let zonas;
  try {
    zonas = await query(
      `SELECT id, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos, orden,
              usa_mapa_asientos, mapa_filas, mapa_columnas, color_plano
       FROM evento_zonas
       WHERE idevento = ? AND usa_mapa_asientos = 1
       ORDER BY orden ASC, id ASC`,
      [eventId]
    );
  } catch (e) {
    if (!isBadField(e)) throw e;
    zonas = await query(
      `SELECT id, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos, orden,
              usa_mapa_asientos, mapa_filas, mapa_columnas
       FROM evento_zonas
       WHERE idevento = ? AND usa_mapa_asientos = 1
       ORDER BY orden ASC, id ASC`,
      [eventId]
    );
  }
  if (!zonas.length) return { zonas: [], asientos: [] };

  const baseZoneId = Number(zonas[0].id);
  const asientos = await query(
    `SELECT s.id, s.fila, s.columna, s.estado, t.id_zona_tarifa
     FROM evento_asientos s
     INNER JOIN evento_asiento_zona_tipo t ON t.id_asiento = s.id
     WHERE s.id_zona = ?
     ORDER BY s.fila ASC, s.columna ASC`,
    [baseZoneId]
  );

  return { zonas, asientos };
}

async function holdSeatsConn(conn, zonaId, seatIds, ordenId) {
  const ids = [...new Set(seatIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) throw Object.assign(new Error('Asientos inválidos'), { status: 400 });
  const ph = ids.map(() => '?').join(',');
  const [res] = await conn.execute(
    `UPDATE evento_asientos
     SET estado = 'held', id_orden_held = ?, held_at = NOW(), id_orden_compra = NULL
     WHERE id_zona = ? AND id IN (${ph}) AND estado = 'available'`,
    [ordenId, zonaId, ...ids]
  );
  if (res.affectedRows !== ids.length) {
    throw Object.assign(new Error('Uno o más asientos ya no están disponibles'), { status: 409 });
  }
}

async function holdSeatsByTariffZonaConn(conn, zonaTarifaId, seatIds, ordenId) {
  const ids = [...new Set(seatIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) throw Object.assign(new Error('Asientos inválidos'), { status: 400 });
  if (!(await tipoMapTableExists())) {
    throw Object.assign(new Error('Tabla de asignación de asientos por tipo no existe'), { status: 503 });
  }
  const ph = ids.map(() => '?').join(',');
  const [res] = await conn.execute(
    `UPDATE evento_asientos s
     INNER JOIN evento_asiento_zona_tipo t ON t.id_asiento = s.id
     SET s.estado = 'held', s.id_orden_held = ?, s.held_at = NOW(), s.id_orden_compra = NULL
     WHERE t.id_zona_tarifa = ? AND s.id IN (${ph}) AND s.estado = 'available'`,
    [ordenId, zonaTarifaId, ...ids]
  );
  if (res.affectedRows !== ids.length) {
    throw Object.assign(new Error('Uno o más asientos ya no están disponibles'), { status: 409 });
  }
}

/**
 * Datos de cada asiento para checkout: zona de cobro (tarifa), precio y disponibilidad.
 */
async function resolveSeatsForCheckoutConn(conn, eventId, seatIds) {
  if (!(await tableExists())) return [];
  const ids = [...new Set(seatIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  const [rows] = await conn.execute(
    `SELECT s.id, s.estado, s.id_zona AS id_zona_physical,
            t.id_zona_tarifa,
            COALESCE(t.id_zona_tarifa, s.id_zona) AS billing_zona_id,
            COALESCE(zt.precio, zp.precio) AS precio
     FROM evento_asientos s
     INNER JOIN evento_zonas zp ON zp.id = s.id_zona
     LEFT JOIN evento_asiento_zona_tipo t ON t.id_asiento = s.id
     LEFT JOIN evento_zonas zt ON zt.id = t.id_zona_tarifa
     WHERE s.id IN (${ph}) AND zp.idevento = ?`,
    [...ids, eventId]
  );
  return rows || [];
}

async function resolveSeatsForCheckout(eventId, seatIds) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    return await resolveSeatsForCheckoutConn(conn, eventId, seatIds);
  } finally {
    conn.release();
  }
}

/** Suma boletos_vendidos por zona de tarifa (mapa unificado con precios distintos por asiento). */
async function countSeatsByBillingZonaConn(conn, seatIds) {
  const ids = [...new Set(seatIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  const [rows] = await conn.execute(
    `SELECT COALESCE(t.id_zona_tarifa, s.id_zona) AS zid, COUNT(*) AS n
     FROM evento_asientos s
     LEFT JOIN evento_asiento_zona_tipo t ON t.id_asiento = s.id
     WHERE s.id IN (${ph})
     GROUP BY COALESCE(t.id_zona_tarifa, s.id_zona)`,
    ids
  );
  return rows || [];
}

/**
 * Retiene asientos de una orden: admite mezcla de zonas de tarifa en el mismo mapa.
 */
async function holdSeatsForOrderConn(conn, eventId, seatIds, ordenId) {
  const rows = await resolveSeatsForCheckoutConn(conn, eventId, seatIds);
  const wanted = new Set(seatIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0));
  if (rows.length !== wanted.size) {
    throw Object.assign(new Error('Uno o más asientos no son válidos para este evento'), { status: 400 });
  }
  for (const r of rows) {
    if (String(r.estado) !== 'available') {
      throw Object.assign(new Error('Uno o más asientos ya no están disponibles'), { status: 409 });
    }
  }
  const groups = new Map();
  for (const r of rows) {
    const hasTariff = r.id_zona_tarifa != null && Number(r.id_zona_tarifa) > 0;
    const key = hasTariff ? `t:${r.id_zona_tarifa}` : `p:${r.id_zona_physical}`;
    if (!groups.has(key)) {
      groups.set(key, {
        hasTariff,
        zonaId: hasTariff ? Number(r.id_zona_tarifa) : Number(r.id_zona_physical),
        ids: [],
      });
    }
    groups.get(key).ids.push(Number(r.id));
  }
  for (const g of groups.values()) {
    if (g.hasTariff) {
      await holdSeatsByTariffZonaConn(conn, g.zonaId, g.ids, ordenId);
    } else {
      await holdSeatsConn(conn, g.zonaId, g.ids, ordenId);
    }
  }
}

async function releaseHeldForOrdenConn(conn, ordenId) {
  await conn.execute(
    `UPDATE evento_asientos
     SET estado = 'available', id_orden_held = NULL, held_at = NULL
     WHERE id_orden_held = ?`,
    [ordenId]
  );
}

async function finalizeHeldToSoldConn(conn, ordenId) {
  await conn.execute(
    `UPDATE evento_asientos
     SET estado = 'sold', id_orden_compra = ?, id_orden_held = NULL, held_at = NULL
     WHERE id_orden_held = ?`,
    [ordenId, ordenId]
  );
}

async function releaseSoldSeatsForRefundConn(conn, ordenId) {
  await conn.execute(
    `UPDATE evento_asientos
     SET estado = 'available', id_orden_compra = NULL
     WHERE id_orden_compra = ?`,
    [ordenId]
  );
}

module.exports = {
  tableExists,
  tipoMapTableExists,
  syncZoneSeatsConn,
  syncSeatMapsForEventConn,
  listByZoneId,
  listByTariffZonaId,
  hasTariffAssignmentForSeats,
  listUnifiedByEventId,
  ensureTariffAssignmentsForEventConn,
  ensureTariffAssignmentsForEvent,
  holdSeatsConn,
  holdSeatsByTariffZonaConn,
  resolveSeatsForCheckout,
  resolveSeatsForCheckoutConn,
  countSeatsByBillingZonaConn,
  holdSeatsForOrderConn,
  releaseHeldForOrdenConn,
  finalizeHeldToSoldConn,
  releaseSoldSeatsForRefundConn,
};
