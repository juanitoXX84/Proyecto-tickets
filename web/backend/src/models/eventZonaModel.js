const { query, getPool } = require('../config/database');

function parseHotspotPct(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
}

let cachedZonasTableExists = null;

/** Si la tabla no existe, el organizador puede seguir creando eventos (precio/cupo agregados en `eventos`). */
async function tableExists() {
  if (cachedZonasTableExists !== null) return cachedZonasTableExists;
  try {
    await query('SELECT id FROM evento_zonas LIMIT 0');
    cachedZonasTableExists = true;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      cachedZonasTableExists = false;
    } else {
      throw e;
    }
  }
  return cachedZonasTableExists;
}

/**
 * Si listByEventId cayó en un SELECT sin columnas del mapa, recupera usa_mapa / dimensiones por id de zona.
 */
async function mergeSeatMapMetadata(zonas) {
  if (!Array.isArray(zonas) || zonas.length === 0) return zonas;
  const allPresent = zonas.every(
    (z) =>
      Object.prototype.hasOwnProperty.call(z, 'usa_mapa_asientos') &&
      Object.prototype.hasOwnProperty.call(z, 'mapa_filas') &&
      Object.prototype.hasOwnProperty.call(z, 'mapa_columnas')
  );
  if (allPresent) return zonas;
  const ids = [...new Set(zonas.map((z) => z.id).filter((id) => id != null && id !== ''))];
  if (ids.length === 0) return zonas;
  try {
    const ph = ids.map(() => '?').join(',');
    const rows = await query(
      `SELECT id, usa_mapa_asientos, mapa_filas, mapa_columnas FROM evento_zonas WHERE id IN (${ph})`,
      ids
    );
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    return zonas.map((z) => {
      const extra = byId.get(Number(z.id));
      return extra ? { ...z, ...extra } : z;
    });
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') return zonas;
    throw e;
  }
}

async function listByEventId(eventId) {
  try {
    return await query(
      `SELECT id, idevento, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos,
              limite_por_transaccion, orden, pos_x, pos_y, color_plano,
              usa_mapa_asientos, mapa_filas, mapa_columnas
       FROM evento_zonas WHERE idevento = ? ORDER BY orden ASC, id ASC`,
      [eventId]
    );
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      try {
        return await query(
          `SELECT id, idevento, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos,
                  limite_por_transaccion, orden, pos_x, pos_y, color_plano
           FROM evento_zonas WHERE idevento = ? ORDER BY orden ASC, id ASC`,
          [eventId]
        );
      } catch (e2) {
        if (e2.code === 'ER_BAD_FIELD_ERROR') {
          try {
            return await query(
              `SELECT id, idevento, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos,
                      limite_por_transaccion, orden, pos_x, pos_y
               FROM evento_zonas WHERE idevento = ? ORDER BY orden ASC, id ASC`,
              [eventId]
            );
          } catch (e3) {
            if (e3.code === 'ER_BAD_FIELD_ERROR') {
              return await query(
                `SELECT id, idevento, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos,
                        limite_por_transaccion, orden
                 FROM evento_zonas WHERE idevento = ? ORDER BY orden ASC, id ASC`,
                [eventId]
              );
            }
            throw e3;
          }
        }
        throw e2;
      }
    }
    if (e.code === 'ER_NO_SUCH_TABLE') {
      return [];
    }
    throw e;
  }
}

/** Agrupa zonas por idevento; Map<number, row[]>. Si no hay tabla, Map vacío. */
async function listGroupedByEventIds(eventIds) {
  const map = new Map();
  if (!eventIds || eventIds.length === 0) return map;
  const ok = await tableExists();
  if (!ok) return map;
  const uniq = [...new Set(eventIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (uniq.length === 0) return map;
  for (const id of uniq) map.set(id, []);
  try {
    const ph = uniq.map(() => '?').join(',');
    let rows;
      try {
        rows = await query(
          `SELECT id, idevento, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos,
                  limite_por_transaccion, orden, pos_x, pos_y, color_plano
           FROM evento_zonas WHERE idevento IN (${ph}) ORDER BY idevento, orden ASC, id ASC`,
          uniq
        );
      } catch (e) {
        if (e.code === 'ER_BAD_FIELD_ERROR') {
          try {
            rows = await query(
              `SELECT id, idevento, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos,
                      limite_por_transaccion, orden, pos_x, pos_y
               FROM evento_zonas WHERE idevento IN (${ph}) ORDER BY idevento, orden ASC, id ASC`,
              uniq
            );
          } catch (e2) {
            if (e2.code === 'ER_BAD_FIELD_ERROR') {
              rows = await query(
                `SELECT id, idevento, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos,
                        limite_por_transaccion, orden
                 FROM evento_zonas WHERE idevento IN (${ph}) ORDER BY idevento, orden ASC, id ASC`,
                uniq
              );
            } else {
              throw e2;
            }
          }
        } else {
          throw e;
        }
      }
    for (const r of rows) {
      const eid = Number(r.idevento);
      const arr = map.get(eid);
      if (arr) arr.push(r);
    }
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      map.clear();
      return map;
    }
    throw e;
  }
  return map;
}

async function deleteByEventIdConn(conn, eventId) {
  const ok = await tableExists();
  if (!ok) return;
  await conn.execute(`DELETE FROM evento_zonas WHERE idevento = ?`, [eventId]);
}

async function insertManyConn(conn, eventId, zonas) {
  let hasPos = true;
  try {
    await conn.execute('SELECT pos_x FROM evento_zonas LIMIT 0');
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') hasPos = false;
    else throw e;
  }
  let hasColor = true;
  try {
    await conn.execute('SELECT color_plano FROM evento_zonas LIMIT 0');
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') hasColor = false;
    else throw e;
  }
  let hasSeatMap = true;
  try {
    await conn.execute('SELECT usa_mapa_asientos FROM evento_zonas LIMIT 0');
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') hasSeatMap = false;
    else throw e;
  }
  let orden = 0;
  const inserted = [];
  for (const z of zonas) {
    const px = hasPos ? parseHotspotPct(z.pos_x) : null;
    const py = hasPos ? parseHotspotPct(z.pos_y) : null;
    const lim = z.limite_por_transaccion != null ? Number(z.limite_por_transaccion) : null;
    const colorVal = hasColor && z.color_plano ? String(z.color_plano).trim().slice(0, 7) : null;
    const base = [
      eventId,
      z.nombre_seccion,
      z.descripcion_zona || null,
      Number(z.precio),
      Number(z.capacidad),
      lim,
      orden,
    ];
    let ins;
    if (hasPos && hasColor) {
      [ins] = await conn.execute(
        `INSERT INTO evento_zonas (idevento, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos, limite_por_transaccion, orden, pos_x, pos_y, color_plano)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        [...base, px, py, colorVal]
      );
    } else if (hasPos) {
      [ins] = await conn.execute(
        `INSERT INTO evento_zonas (idevento, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos, limite_por_transaccion, orden, pos_x, pos_y)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [...base, px, py]
      );
    } else if (hasColor) {
      [ins] = await conn.execute(
        `INSERT INTO evento_zonas (idevento, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos, limite_por_transaccion, orden, color_plano)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [...base, colorVal]
      );
    } else {
      [ins] = await conn.execute(
        `INSERT INTO evento_zonas (idevento, nombre_seccion, descripcion_zona, precio, capacidad, boletos_vendidos, limite_por_transaccion, orden)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        base
      );
    }
    const insertId = ins.insertId;
    if (hasSeatMap && insertId) {
      const usa =
        z.usa_mapa_asientos === true ||
        z.usa_mapa_asientos === 1 ||
        z.usa_mapa_asientos === '1'
          ? 1
          : 0;
      const mf =
        z.mapa_filas != null && z.mapa_filas !== ''
          ? Math.min(40, Math.max(1, Number(z.mapa_filas)))
          : null;
      const mc =
        z.mapa_columnas != null && z.mapa_columnas !== ''
          ? Math.min(80, Math.max(1, Number(z.mapa_columnas)))
          : null;
      await conn.execute(
        `UPDATE evento_zonas SET usa_mapa_asientos = ?, mapa_filas = ?, mapa_columnas = ? WHERE id = ?`,
        [usa, usa ? mf : null, usa ? mc : null, insertId]
      );
    }
    inserted.push({
      id: insertId,
      idevento: eventId,
      nombre_seccion: z.nombre_seccion,
      orden,
    });
    orden += 1;
  }
  return inserted;
}

module.exports = {
  listByEventId,
  listGroupedByEventIds,
  deleteByEventIdConn,
  insertManyConn,
  tableExists,
  mergeSeatMapMetadata,
};
