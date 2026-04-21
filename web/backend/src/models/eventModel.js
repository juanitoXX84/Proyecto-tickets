const { query, getPool } = require('../config/database');
const eventZonaModel = require('./eventZonaModel');
const eventSeatModel = require('./eventSeatModel');

async function ignoreNoSuchTable(fn) {
  try {
    await fn();
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
}

/** `ordenes.idevento` existe solo si corriste schema_updates.sql; sin ella omitimos limpieza por evento. */
async function ignoreOrdenesSinIdevento(fn) {
  try {
    await fn();
  } catch (e) {
    if (
      e.code === 'ER_NO_SUCH_TABLE' ||
      e.code === 'ER_BAD_FIELD_ERROR' ||
      Number(e.errno) === 1054
    ) {
      return;
    }
    throw e;
  }
}

const E_BASE = `e.id, e.idorganizador, e.titulo, e.fecha, e.ubicacion, e.capacidad, e.precio,
            e.boletosvendidos, e.imagen, e.categoria_id, e.descripcion, e.activo`;

const E_EXT = `, e.fecha_fin, e.recinto, e.direccion, e.url_mapa, e.venta_inicio, e.venta_fin,
            e.limite_boletos_por_transaccion, e.generar_qr_email, e.instrucciones_canje`;

const E_MOD = `, e.estado_moderacion, e.moderacion_motivo, e.destacado, e.cancelado_at, e.motivo_cancelacion`;

const C_JOIN = `c.nombre AS categoria_nombre, c.icono AS categoria_icono, c.color AS categoria_color`;

async function hasModeracionColumns() {
  try {
    await query('SELECT estado_moderacion, destacado, cancelado_at FROM eventos LIMIT 0');
    return true;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

async function attachZonas(row) {
  if (!row) return null;
  let zonas = await eventZonaModel.listByEventId(row.id);
  zonas = await eventZonaModel.mergeSeatMapMetadata(zonas);
  row.zonas = zonas;
  return row;
}

function normalizeExtendedRow(row) {
  if (!row) return null;
  // Algunos drivers / configuraciones devuelven el nombre de columna en otro casing.
  if (!Object.prototype.hasOwnProperty.call(row, 'url_mapa')) {
    if (row.URL_MAPA !== undefined) {
      row.url_mapa = row.URL_MAPA;
    } else if (row.Url_Mapa !== undefined) {
      row.url_mapa = row.Url_Mapa;
    }
  }
  // El listado “básico” no trae columnas extendidas: no deben confundirse con NULL reales de MySQL.
  if (!Object.prototype.hasOwnProperty.call(row, 'url_mapa')) {
    row.fecha_fin = null;
    row.recinto = null;
    row.direccion = null;
    row.url_mapa = null;
    row.venta_inicio = null;
    row.venta_fin = null;
    row.limite_boletos_por_transaccion = null;
    row.generar_qr_email = 1;
    row.instrucciones_canje = null;
  }
  if (!Object.prototype.hasOwnProperty.call(row, 'estado_moderacion')) {
    row.estado_moderacion = Number(row.activo) === 1 ? 'aprobado' : 'borrador';
    row.moderacion_motivo = null;
    row.destacado = 0;
    row.cancelado_at = null;
    row.motivo_cancelacion = null;
  }
  return row;
}

async function listPublic(categoriaId) {
  const raw = categoriaId == null || categoriaId === '' ? null : Number(categoriaId);
  const filterByCat = Number.isInteger(raw) && raw > 0;
  const catClause = filterByCat ? ' AND e.categoria_id = ?' : '';
  const params = filterByCat ? [raw] : [];

  const catalogWhereMod =
    "e.activo = 1 AND e.estado_moderacion = 'aprobado' AND e.cancelado_at IS NULL";
  const catalogWhereLegacy = 'e.activo = 1';

  try {
    const rows = await query(
      `SELECT ${E_BASE}${E_EXT}${E_MOD},
            ${C_JOIN}
     FROM eventos e
     LEFT JOIN categorias c ON c.id = e.categoria_id
     WHERE ${catalogWhereMod}${catClause}
     ORDER BY e.destacado DESC, e.fecha ASC`,
      params
    );
    return rows.map((r) => normalizeExtendedRow({ ...r }));
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      try {
        const rows = await query(
          `SELECT ${E_BASE}${E_EXT},
                ${C_JOIN}
         FROM eventos e
         LEFT JOIN categorias c ON c.id = e.categoria_id
         WHERE ${catalogWhereLegacy}${catClause}
         ORDER BY e.fecha ASC`,
          params
        );
        return rows.map((r) => normalizeExtendedRow({ ...r }));
      } catch (e2) {
        if (e2.code === 'ER_BAD_FIELD_ERROR') {
          const rows = await query(
            `SELECT ${E_BASE},
                ${C_JOIN}
         FROM eventos e
         LEFT JOIN categorias c ON c.id = e.categoria_id
         WHERE ${catalogWhereLegacy}${catClause}
         ORDER BY e.fecha ASC`,
            params
          );
          return rows.map((r) => normalizeExtendedRow({ ...r }));
        }
        throw e2;
      }
    }
    throw e;
  }
}

async function findById(id) {
  const hasExt = await detectExtendedColumns();
  const hasMod = await hasModeracionColumns();
  const hasRec = await hasRecintoIdColumn();
  const hasUrlPlano = await hasUrlPlanoColumn();
  let sel = E_BASE;
  if (hasExt) sel += E_EXT;
  if (hasExt && hasMod) sel += E_MOD;
  if (hasRec) sel += ', e.idrecinto';
  if (hasUrlPlano) sel += ', e.url_plano';
  const rows = await query(
    `SELECT ${sel},
            ${C_JOIN}
     FROM eventos e
     LEFT JOIN categorias c ON c.id = e.categoria_id
     WHERE e.id = ?
     LIMIT 1`,
    [id]
  );
  const row = rows[0] || null;
  normalizeExtendedRow(row);
  if (row && !hasRec) row.idrecinto = null;
  return attachZonas(row);
}

async function listByOrganizer(organizerId) {
  try {
    return await query(
      `SELECT ${E_BASE}${E_EXT}${E_MOD},
            c.nombre AS categoria_nombre
     FROM eventos e
     LEFT JOIN categorias c ON c.id = e.categoria_id
     WHERE e.idorganizador = ?
     ORDER BY e.fecha DESC`,
      [organizerId]
    );
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      try {
        return await query(
          `SELECT ${E_BASE}${E_EXT},
                c.nombre AS categoria_nombre
         FROM eventos e
         LEFT JOIN categorias c ON c.id = e.categoria_id
         WHERE e.idorganizador = ?
         ORDER BY e.fecha DESC`,
          [organizerId]
        );
      } catch (e2) {
        if (e2.code === 'ER_BAD_FIELD_ERROR') {
          return await query(
            `SELECT ${E_BASE},
                c.nombre AS categoria_nombre
         FROM eventos e
         LEFT JOIN categorias c ON c.id = e.categoria_id
         WHERE e.idorganizador = ?
         ORDER BY e.fecha DESC`,
            [organizerId]
          );
        }
        throw e2;
      }
    }
    throw e;
  }
}

async function listAllForAdmin() {
  try {
    return await query(
      `SELECT ${E_BASE}${E_EXT}${E_MOD}
       FROM eventos e
       ORDER BY e.fecha DESC`
    );
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      try {
        return await query(`SELECT ${E_BASE}${E_EXT} FROM eventos e ORDER BY e.fecha DESC`);
      } catch (e2) {
        if (e2.code === 'ER_BAD_FIELD_ERROR') {
          return await query(`SELECT ${E_BASE} FROM eventos e ORDER BY e.fecha DESC`);
        }
        throw e2;
      }
    }
    throw e;
  }
}

function aggregateFromZonas(zonas) {
  const prices = zonas.map((z) => Number(z.precio)).filter((n) => Number.isFinite(n));
  const caps = zonas.map((z) => Number(z.capacidad)).filter((n) => Number.isFinite(n) && n >= 0);
  return {
    precio: prices.length ? Math.min(...prices) : 0,
    capacidad: caps.reduce((a, b) => a + b, 0),
  };
}

function sqlUrlMapa(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function sqlUrlPlano(v) {
  if (v == null) return null;
  const s = String(v).trim().slice(0, 512);
  return s === '' ? null : s;
}

async function hasUrlPlanoColumn() {
  try {
    await query('SELECT url_plano FROM eventos LIMIT 0');
    return true;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

function buildEventInsertSQL(hasExt, hasMod) {
  if (hasExt && hasMod) {
    return `INSERT INTO eventos (
      idorganizador, titulo, fecha, fecha_fin, ubicacion, recinto, direccion, url_mapa,
      capacidad, precio, imagen, categoria_id, descripcion, activo,
      venta_inicio, venta_fin, limite_boletos_por_transaccion, generar_qr_email, instrucciones_canje,
      estado_moderacion, moderacion_motivo, destacado, cancelado_at, motivo_cancelacion
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  }
  if (hasExt) {
    return `INSERT INTO eventos (
      idorganizador, titulo, fecha, fecha_fin, ubicacion, recinto, direccion, url_mapa,
      capacidad, precio, imagen, categoria_id, descripcion, activo,
      venta_inicio, venta_fin, limite_boletos_por_transaccion, generar_qr_email, instrucciones_canje
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  }
  return `INSERT INTO eventos (
    idorganizador, titulo, fecha, ubicacion, capacidad, precio, imagen, categoria_id, descripcion, activo
  ) VALUES (?,?,?,?,?,?,?,?,?,?)`;
}

/**
 * Comprueba si existen todas las columnas del panel organizador (incl. url_mapa).
 * Sin caché: si el servidor arrancó antes de correr la migración y luego se añadieron columnas,
 * antes se quedaba hasExt=false para siempre y el UPDATE corto nunca persistía url_mapa.
 */
async function detectExtendedColumns() {
  try {
    await query(
      `SELECT fecha_fin, recinto, direccion, url_mapa, venta_inicio, venta_fin,
              limite_boletos_por_transaccion, generar_qr_email, instrucciones_canje
       FROM eventos LIMIT 0`
    );
    return true;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

async function hasRecintoIdColumn() {
  try {
    await query('SELECT idrecinto FROM eventos LIMIT 0');
    return true;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

function buildSeatOverridesByZonaId(inputZonas, dbZonas) {
  if (!Array.isArray(inputZonas) || !Array.isArray(dbZonas)) return null;
  if (!inputZonas.length || !dbZonas.length) return null;
  const map = new Map();
  let explicitMode = false;
  const n = Math.min(inputZonas.length, dbZonas.length);
  for (let i = 0; i < n; i += 1) {
    const zIn = inputZonas[i];
    const zDb = dbZonas[i];
    const hasSeatCoordsField = Object.prototype.hasOwnProperty.call(zIn || {}, 'seat_coords');
    if (!hasSeatCoordsField) continue;
    explicitMode = true;
    const coords = Array.isArray(zIn?.seat_coords) ? zIn.seat_coords : [];
    const zid = Number(zDb?.id);
    if (!Number.isFinite(zid) || zid < 1) continue;
    map.set(zid, coords);
  }
  if (!explicitMode) return null;
  return map;
}

async function syncEventRecintoConn(conn, eventId, idrecinto) {
  if (!(await hasRecintoIdColumn())) return;
  if (idrecinto === undefined) return;
  let v = null;
  if (idrecinto !== null && idrecinto !== '') {
    const n = Number(idrecinto);
    if (!Number.isFinite(n) || n < 1) {
      throw Object.assign(new Error('idrecinto inválido'), { status: 400 });
    }
    v = n;
  }
  await conn.execute('UPDATE eventos SET idrecinto = ? WHERE id = ?', [v, eventId]);
}

async function applyModeracionConn(conn, id, rest) {
  const has = await hasModeracionColumns();
  if (!has) return;
  const sets = [];
  const vals = [];
  if (rest.estado_moderacion !== undefined) {
    sets.push('estado_moderacion = ?');
    vals.push(rest.estado_moderacion);
  }
  if (rest.moderacion_motivo !== undefined) {
    sets.push('moderacion_motivo = ?');
    vals.push(rest.moderacion_motivo);
  }
  if (rest.destacado !== undefined) {
    sets.push('destacado = ?');
    vals.push(rest.destacado ? 1 : 0);
  }
  if (rest.cancelado_at !== undefined) {
    sets.push('cancelado_at = ?');
    vals.push(rest.cancelado_at);
  }
  if (rest.motivo_cancelacion !== undefined) {
    sets.push('motivo_cancelacion = ?');
    vals.push(rest.motivo_cancelacion);
  }
  if (!sets.length) return;
  vals.push(id);
  await conn.execute(`UPDATE eventos SET ${sets.join(', ')} WHERE id = ?`, vals);
}

async function createEventWithZones(data) {
  const { zonas, ...rest } = data;
  if (!zonas || !Array.isArray(zonas) || zonas.length < 1) {
    throw Object.assign(new Error('Se requiere al menos una zona de boletos'), { status: 400 });
  }
  const { precio, capacidad } = aggregateFromZonas(zonas);
  const hasExt = await detectExtendedColumns();
  const hasMod = await hasModeracionColumns();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let eventId;
    if (hasExt && hasMod) {
      const [r] = await conn.execute(buildEventInsertSQL(true, true), [
        rest.idorganizador,
        rest.titulo,
        rest.fecha,
        rest.fecha_fin || null,
        rest.ubicacion || null,
        rest.recinto || null,
        rest.direccion || null,
        sqlUrlMapa(rest.url_mapa),
        capacidad,
        precio,
        rest.imagen || null,
        rest.categoria_id ?? null,
        rest.descripcion || null,
        rest.activo ? 1 : 0,
        rest.venta_inicio || null,
        rest.venta_fin || null,
        rest.limite_boletos_por_transaccion ?? 6,
        rest.generar_qr_email ? 1 : 0,
        rest.instrucciones_canje || null,
        rest.estado_moderacion || 'aprobado',
        rest.moderacion_motivo ?? null,
        rest.destacado ? 1 : 0,
        rest.cancelado_at ?? null,
        rest.motivo_cancelacion ?? null,
      ]);
      eventId = r.insertId;
    } else if (hasExt) {
      const [r] = await conn.execute(buildEventInsertSQL(true, false), [
        rest.idorganizador,
        rest.titulo,
        rest.fecha,
        rest.fecha_fin || null,
        rest.ubicacion || null,
        rest.recinto || null,
        rest.direccion || null,
        sqlUrlMapa(rest.url_mapa),
        capacidad,
        precio,
        rest.imagen || null,
        rest.categoria_id ?? null,
        rest.descripcion || null,
        rest.activo ? 1 : 0,
        rest.venta_inicio || null,
        rest.venta_fin || null,
        rest.limite_boletos_por_transaccion ?? 6,
        rest.generar_qr_email ? 1 : 0,
        rest.instrucciones_canje || null,
      ]);
      eventId = r.insertId;
    } else {
      const [r] = await conn.execute(buildEventInsertSQL(false), [
        rest.idorganizador,
        rest.titulo,
        rest.fecha,
        rest.ubicacion || null,
        capacidad,
        precio,
        rest.imagen || null,
        rest.categoria_id ?? null,
        rest.descripcion || null,
        rest.activo ? 1 : 0,
      ]);
      eventId = r.insertId;
    }
    const zonasTableOk = await eventZonaModel.tableExists();
    if (zonasTableOk) {
      const insertedZonas = await eventZonaModel.insertManyConn(conn, eventId, zonas);
      await eventSeatModel.syncSeatMapsForEventConn(conn, eventId);
      const overrides = buildSeatOverridesByZonaId(zonas, insertedZonas);
      await eventSeatModel.ensureTariffAssignmentsForEventConn(conn, eventId, overrides);
    }
    await syncEventRecintoConn(conn, eventId, rest.idrecinto);
    if (await hasUrlPlanoColumn()) {
      await conn.execute('UPDATE eventos SET url_plano = ? WHERE id = ?', [
        sqlUrlPlano(rest.url_plano),
        eventId,
      ]);
    }
    await conn.commit();
    return findById(eventId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function updateEventWithZones(id, data) {
  const { zonas, ...rest } = data;
  const hasExt = await detectExtendedColumns();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (zonas && Array.isArray(zonas) && zonas.length > 0) {
      const existing = await eventZonaModel.listByEventId(id);
      const vendidos = existing.reduce((s, z) => s + Number(z.boletos_vendidos || 0), 0);
      if (vendidos > 0) {
        await conn.rollback();
        throw Object.assign(
          new Error('No se pueden reemplazar zonas cuando ya hay boletos vendidos en ellas'),
          { status: 409 }
        );
      }
      const { precio, capacidad } = aggregateFromZonas(zonas);
      if (hasExt) {
        await conn.execute(
          `UPDATE eventos SET
            titulo = ?, fecha = ?, fecha_fin = ?, ubicacion = ?, recinto = ?, direccion = ?, url_mapa = ?,
            capacidad = ?, precio = ?, imagen = ?, categoria_id = ?, descripcion = ?, activo = ?,
            venta_inicio = ?, venta_fin = ?, limite_boletos_por_transaccion = ?, generar_qr_email = ?, instrucciones_canje = ?
          WHERE id = ?`,
          [
            rest.titulo,
            rest.fecha,
            rest.fecha_fin || null,
            rest.ubicacion || null,
            rest.recinto || null,
            rest.direccion || null,
            sqlUrlMapa(rest.url_mapa),
            capacidad,
            precio,
            rest.imagen ?? null,
            rest.categoria_id === undefined ? null : rest.categoria_id,
            rest.descripcion ?? null,
            rest.activo ? 1 : 0,
            rest.venta_inicio || null,
            rest.venta_fin || null,
            rest.limite_boletos_por_transaccion ?? 6,
            rest.generar_qr_email ? 1 : 0,
            rest.instrucciones_canje ?? null,
            id,
          ]
        );
      } else {
        await conn.execute(
          `UPDATE eventos SET titulo = ?, fecha = ?, ubicacion = ?, capacidad = ?, precio = ?, imagen = ?, categoria_id = ?, descripcion = ?, activo = ?
           WHERE id = ?`,
          [
            rest.titulo,
            rest.fecha,
            rest.ubicacion || null,
            capacidad,
            precio,
            rest.imagen ?? null,
            rest.categoria_id === undefined ? null : rest.categoria_id,
            rest.descripcion ?? null,
            rest.activo ? 1 : 0,
            id,
          ]
        );
      }
      if (await eventZonaModel.tableExists()) {
        await eventZonaModel.deleteByEventIdConn(conn, id);
        const insertedZonas = await eventZonaModel.insertManyConn(conn, id, zonas);
        await eventSeatModel.syncSeatMapsForEventConn(conn, id);
        const overrides = buildSeatOverridesByZonaId(zonas, insertedZonas);
        await eventSeatModel.ensureTariffAssignmentsForEventConn(conn, id, overrides);
      }
    } else if (hasExt) {
      await conn.execute(
        `UPDATE eventos SET
          titulo = ?, fecha = ?, fecha_fin = ?, ubicacion = ?, recinto = ?, direccion = ?, url_mapa = ?,
          imagen = ?, categoria_id = ?, descripcion = ?, activo = ?,
          venta_inicio = ?, venta_fin = ?, limite_boletos_por_transaccion = ?, generar_qr_email = ?, instrucciones_canje = ?
        WHERE id = ?`,
        [
          rest.titulo,
          rest.fecha,
          rest.fecha_fin || null,
          rest.ubicacion || null,
          rest.recinto || null,
          rest.direccion || null,
          sqlUrlMapa(rest.url_mapa),
          rest.imagen ?? null,
          rest.categoria_id === undefined ? null : rest.categoria_id,
          rest.descripcion ?? null,
          rest.activo ? 1 : 0,
          rest.venta_inicio || null,
          rest.venta_fin || null,
          rest.limite_boletos_por_transaccion ?? 6,
          rest.generar_qr_email ? 1 : 0,
          rest.instrucciones_canje ?? null,
          id,
        ]
      );
    } else {
      await conn.execute(
        `UPDATE eventos SET titulo = ?, fecha = ?, ubicacion = ?, imagen = ?, categoria_id = ?, descripcion = ?, activo = ?
         WHERE id = ?`,
        [
          rest.titulo,
          rest.fecha,
          rest.ubicacion || null,
          rest.imagen ?? null,
          rest.categoria_id === undefined ? null : rest.categoria_id,
          rest.descripcion ?? null,
          rest.activo ? 1 : 0,
          id,
        ]
      );
    }
    await applyModeracionConn(conn, id, rest);
    await syncEventRecintoConn(conn, id, rest.idrecinto);
    if ((await hasUrlPlanoColumn()) && rest.url_plano !== undefined) {
      await conn.execute('UPDATE eventos SET url_plano = ? WHERE id = ?', [sqlUrlPlano(rest.url_plano), id]);
    }
    await conn.commit();
    return findById(id);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function setEventDestacado(id, destacado) {
  if (!(await hasModeracionColumns())) {
    throw Object.assign(new Error('Migración fase 2–3 no aplicada (eventos.destacado)'), { status: 503 });
  }
  const pool = getPool();
  await pool.execute('UPDATE eventos SET destacado = ? WHERE id = ?', [destacado ? 1 : 0, id]);
  return findById(id);
}

async function setEventCancelled(id, motivo) {
  if (!(await hasModeracionColumns())) {
    throw Object.assign(new Error('Migración fase 2–3 no aplicada'), { status: 503 });
  }
  const pool = getPool();
  await pool.execute(
    `UPDATE eventos SET cancelado_at = NOW(), motivo_cancelacion = ?, destacado = 0 WHERE id = ?`,
    [motivo != null ? String(motivo).trim().slice(0, 512) : null, id]
  );
  return findById(id);
}

async function setModeracionEstado(id, estado, motivo) {
  if (!(await hasModeracionColumns())) {
    throw Object.assign(new Error('Migración fase 2–3 no aplicada'), { status: 503 });
  }
  const pool = getPool();
  await pool.execute(
    `UPDATE eventos SET estado_moderacion = ?, moderacion_motivo = ? WHERE id = ?`,
    [estado, motivo != null ? String(motivo).trim().slice(0, 4000) : null, id]
  );
  return findById(id);
}

async function createEvent(data) {
  if (data.zonas && Array.isArray(data.zonas) && data.zonas.length > 0) {
    return createEventWithZones(data);
  }
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO eventos (idorganizador, titulo, fecha, ubicacion, capacidad, precio, imagen, categoria_id, descripcion, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.idorganizador,
      data.titulo,
      data.fecha,
      data.ubicacion || null,
      data.capacidad,
      data.precio,
      data.imagen || null,
      data.categoria_id ?? null,
      data.descripcion || null,
      data.activo !== undefined ? (data.activo ? 1 : 0) : 1,
    ]
  );
  return findById(result.insertId);
}

async function updateEvent(id, data) {
  const pool = getPool();
  const fields = [];
  const values = [];
  if (data.titulo !== undefined) {
    fields.push('titulo = ?');
    values.push(data.titulo);
  }
  if (data.fecha !== undefined) {
    fields.push('fecha = ?');
    values.push(data.fecha);
  }
  if (data.ubicacion !== undefined) {
    fields.push('ubicacion = ?');
    values.push(data.ubicacion);
  }
  if (data.capacidad !== undefined) {
    fields.push('capacidad = ?');
    values.push(data.capacidad);
  }
  if (data.precio !== undefined) {
    fields.push('precio = ?');
    values.push(data.precio);
  }
  if (data.imagen !== undefined) {
    fields.push('imagen = ?');
    values.push(data.imagen);
  }
  if (data.categoria_id !== undefined) {
    fields.push('categoria_id = ?');
    values.push(data.categoria_id);
  }
  if (data.descripcion !== undefined) {
    fields.push('descripcion = ?');
    values.push(data.descripcion);
  }
  if (data.activo !== undefined) {
    fields.push('activo = ?');
    values.push(data.activo);
  }
  if (fields.length === 0) {
    return findById(id);
  }
  values.push(id);
  await pool.execute(`UPDATE eventos SET ${fields.join(', ')} WHERE id = ?`, values);
  return findById(id);
}

/**
 * Elimina el evento y filas dependientes (boletos, pagos/órdenes, zonas).
 * Orden acorde a FKs típicas cuando `boletos.idevento` no tiene ON DELETE CASCADE.
 */
async function deleteEvent(id) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await ignoreNoSuchTable(() => conn.execute('DELETE FROM boletos WHERE idevento = ?', [id]));

    await ignoreOrdenesSinIdevento(() =>
      conn.execute(
        'DELETE p FROM pagos p INNER JOIN ordenes o ON o.id = p.idorden WHERE o.idevento = ?',
        [id]
      )
    );

    await ignoreOrdenesSinIdevento(() => conn.execute('DELETE FROM ordenes WHERE idevento = ?', [id]));

    await eventZonaModel.deleteByEventIdConn(conn, id);

    const [delEv] = await conn.execute('DELETE FROM eventos WHERE id = ?', [id]);
    if (!delEv.affectedRows) {
      await conn.rollback();
      return false;
    }

    await conn.commit();
    return true;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

function ventaAbierta(row) {
  if (!row) return false;
  if (row.cancelado_at != null && String(row.cancelado_at).trim() !== '') {
    return false;
  }
  const now = Date.now();
  if (row.venta_inicio) {
    const t = new Date(row.venta_inicio).getTime();
    if (Number.isFinite(t) && now < t) return false;
  }
  if (row.venta_fin) {
    const t = new Date(row.venta_fin).getTime();
    if (Number.isFinite(t) && now > t) return false;
  }
  return true;
}

module.exports = {
  listPublic,
  findById,
  hasRecintoIdColumn,
  listByOrganizer,
  listAllForAdmin,
  createEvent,
  createEventWithZones,
  updateEvent,
  updateEventWithZones,
  deleteEvent,
  aggregateFromZonas,
  ventaAbierta,
  hasModeracionColumns,
  setEventDestacado,
  setEventCancelled,
  setModeracionEstado,
};
