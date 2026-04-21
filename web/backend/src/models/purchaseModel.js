const { query } = require('../config/database');

function pickExisting(fields, candidates) {
  for (const c of candidates) {
    if (fields.has(String(c).toLowerCase())) return c;
  }
  return null;
}

async function tableFieldSet(tableName) {
  try {
    const rows = await query(`SHOW COLUMNS FROM ${tableName}`);
    return new Set((rows || []).map((r) => String(r.Field || '').toLowerCase()));
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return null;
    throw e;
  }
}

async function listVirtualTicketsByOrders(userId) {
  const oFields = await tableFieldSet('ordenes');
  if (!oFields) return [];
  const userCol = pickExisting(oFields, ['idusuario', 'id_usuario', 'usuario_id', 'user_id']);
  if (!userCol) return [];
  const estadoCol = pickExisting(oFields, ['estado', 'status']) || 'estado';
  const totalCol = pickExisting(oFields, ['total', 'monto_total', 'monto']) || 'total';
  const cantCol =
    pickExisting(oFields, ['cantidad_boletos', 'cantidad', 'qty', 'boletos_cantidad']) ||
    null;
  const eventCol = pickExisting(oFields, ['idevento', 'id_evento', 'evento_id']);
  const zonaCol = pickExisting(oFields, ['idzona', 'id_zona', 'zona_id']);
  const pFields = await tableFieldSet('pagos');
  const pOrder = pFields
    ? pickExisting(pFields, ['idorden', 'id_orden', 'orden_id', 'order_id'])
    : null;
  const pEstado = pFields ? pickExisting(pFields, ['estado', 'status']) : null;

  const cantidadExpr = cantCol ? `COALESCE(o.${cantCol}, 1)` : '1';
  const paidByOrderStatus = `LOWER(COALESCE(o.${estadoCol}, '')) IN ('pagado','completada')`;
  const paidByPayment =
    pOrder && pEstado
      ? `EXISTS (SELECT 1 FROM pagos p WHERE p.${pOrder} = o.id AND LOWER(COALESCE(p.${pEstado}, '')) = 'aprobado')`
      : 'FALSE';
  const asPaid = `(${paidByOrderStatus} OR ${paidByPayment})`;

  const attempts = [];
  if (eventCol) {
    attempts.push(
      `SELECT o.id AS idorden,
              o.${eventCol} AS idevento,
              ${cantidadExpr} AS cantidad_boletos,
              o.${estadoCol} AS estado,
              o.${totalCol} AS total,
              e.titulo AS evento_titulo,
              e.fecha AS evento_fecha
       FROM ordenes o
       LEFT JOIN eventos e ON e.id = o.${eventCol}
       WHERE o.${userCol} = ? AND ${asPaid}
       ORDER BY o.id DESC`
    );
  }
  if (zonaCol) {
    attempts.push(
      `SELECT o.id AS idorden,
              ez.idevento AS idevento,
              ${cantidadExpr} AS cantidad_boletos,
              o.${estadoCol} AS estado,
              o.${totalCol} AS total,
              e.titulo AS evento_titulo,
              e.fecha AS evento_fecha
       FROM ordenes o
       LEFT JOIN evento_zonas ez ON ez.id = o.${zonaCol}
       LEFT JOIN eventos e ON e.id = ez.idevento
       WHERE o.${userCol} = ? AND ${asPaid}
       ORDER BY o.id DESC`
    );
  }
  if (!attempts.length) return [];

  for (const sql of attempts) {
    try {
      const rows = await query(sql, [userId]);
      const out = [];
      let syntheticId = 1;
      for (const r of rows) {
        const qty = Math.max(1, Math.floor(Number(r.cantidad_boletos) || 1));
        for (let i = 0; i < qty; i += 1) {
          out.push({
            id: `v-${r.idorden}-${syntheticId}`,
            idevento: r.idevento ?? null,
            idorden: r.idorden,
            estado: 'activo',
            codigo: null,
            evento_titulo: r.evento_titulo ?? 'Evento',
            evento_fecha: r.evento_fecha ?? null,
          });
          syntheticId += 1;
        }
      }
      return out;
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') continue;
      if (e.code === 'ER_NO_SUCH_TABLE') return [];
      throw e;
    }
  }
  return [];
}

/**
 * Historial de compras del usuario autenticado.
 * Consultas parametrizadas; solo filtra por idusuario (autorización en controlador).
 */
async function listOrdersByUser(userId) {
  const oFields = await tableFieldSet('ordenes');
  if (!oFields) return [];
  const userCol = pickExisting(oFields, ['idusuario', 'id_usuario', 'usuario_id', 'user_id']);
  if (!userCol) return [];
  const eventCol = pickExisting(oFields, ['idevento', 'id_evento', 'evento_id']);
  const zonaCol = pickExisting(oFields, ['idzona', 'id_zona', 'zona_id']);
  const totalCol = pickExisting(oFields, ['total', 'monto_total', 'monto']) || 'total';
  const estadoCol = pickExisting(oFields, ['estado', 'status']) || 'estado';
  const fechaCol =
    pickExisting(oFields, ['fecha_creacion', 'fecha', 'created_at', 'createdon']) || 'fecha_creacion';
  const pFields = await tableFieldSet('pagos');
  const pOrder = pFields
    ? pickExisting(pFields, ['idorden', 'id_orden', 'orden_id', 'order_id'])
    : null;
  const pEstado = pFields ? pickExisting(pFields, ['estado', 'status']) : null;
  const estadoResolvedExpr =
    pOrder && pEstado
      ? `CASE
            WHEN LOWER(COALESCE(o.${estadoCol}, '')) IN ('pagado','completada') THEN o.${estadoCol}
            WHEN EXISTS (SELECT 1 FROM pagos p WHERE p.${pOrder} = o.id AND LOWER(COALESCE(p.${pEstado}, '')) = 'aprobado') THEN 'completada'
            ELSE o.${estadoCol}
          END`
      : `o.${estadoCol}`;

  const attempts = [];
  if (eventCol) {
    attempts.push(
      `SELECT o.id,
              o.${eventCol} AS idevento,
              o.${totalCol} AS total,
              ${estadoResolvedExpr} AS estado,
              o.${fechaCol} AS fecha_creacion,
              e.titulo AS evento_titulo,
              e.fecha AS evento_fecha,
              e.ubicacion AS evento_ubicacion
       FROM ordenes o
       LEFT JOIN eventos e ON e.id = o.${eventCol}
       WHERE o.${userCol} = ?
       ORDER BY o.id DESC`
    );
  }
  if (zonaCol) {
    attempts.push(
      `SELECT o.id,
              ez.idevento AS idevento,
              o.${totalCol} AS total,
              ${estadoResolvedExpr} AS estado,
              o.${fechaCol} AS fecha_creacion,
              e.titulo AS evento_titulo,
              e.fecha AS evento_fecha,
              e.ubicacion AS evento_ubicacion
       FROM ordenes o
       LEFT JOIN evento_zonas ez ON ez.id = o.${zonaCol}
       LEFT JOIN eventos e ON e.id = ez.idevento
       WHERE o.${userCol} = ?
       ORDER BY o.id DESC`
    );
  }
  attempts.push(
    `SELECT o.id,
            NULL AS idevento,
            o.${totalCol} AS total,
            ${estadoResolvedExpr} AS estado,
            o.${fechaCol} AS fecha_creacion,
            NULL AS evento_titulo,
            NULL AS evento_fecha,
            NULL AS evento_ubicacion
     FROM ordenes o
     WHERE o.${userCol} = ?
     ORDER BY o.id DESC`
  );

  for (const sql of attempts) {
    try {
      return await query(sql, [userId]);
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') continue;
      if (e.code === 'ER_NO_SUCH_TABLE') return [];
      throw e;
    }
  }
  return [];
}

function parseSeatIdsFromOrdenRow(ord) {
  if (!ord?.seat_ids_json) return null;
  try {
    const j = JSON.parse(ord.seat_ids_json);
    return Array.isArray(j) && j.length ? j.map((x) => Number(x)) : null;
  } catch {
    return null;
  }
}

function ticketSortKeyForOrden(t) {
  const id = t.id;
  if (typeof id === 'string' && id.startsWith('v-')) {
    const last = id.split('-').pop();
    const n = Number(last);
    return Number.isFinite(n) ? n : 0;
  }
  return Number(id) || 0;
}

async function loadOrdenForTicketEnrich(ordenId) {
  try {
    const rows = await query(`SELECT * FROM ordenes WHERE id = ? LIMIT 1`, [ordenId]);
    return rows[0] || null;
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') return null;
    throw e;
  }
}

async function loadSeatsPricingForOrden(ordenId) {
  try {
    const rows = await query(
      `SELECT s.id, s.fila, s.columna,
              COALESCE(zt.nombre_seccion, z.nombre_seccion) AS nombre_seccion,
              CAST(COALESCE(zt.precio, z.precio, 0) AS DECIMAL(12,2)) AS precio_zona
       FROM evento_asientos s
       LEFT JOIN evento_zonas z ON z.id = s.id_zona
       LEFT JOIN evento_asiento_zona_tipo t ON t.id_asiento = s.id
       LEFT JOIN evento_zonas zt ON zt.id = t.id_zona_tarifa
       WHERE s.id_orden_compra = ?
       ORDER BY s.fila ASC, s.columna ASC`,
      [ordenId]
    );
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

async function loadSeatsPricingByIds(seatIds) {
  const ids = [...new Set((seatIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  try {
    const rows = await query(
      `SELECT s.id, s.fila, s.columna,
              COALESCE(zt.nombre_seccion, z.nombre_seccion) AS nombre_seccion,
              CAST(COALESCE(zt.precio, z.precio, 0) AS DECIMAL(12,2)) AS precio_zona
       FROM evento_asientos s
       LEFT JOIN evento_zonas z ON z.id = s.id_zona
       LEFT JOIN evento_asiento_zona_tipo t ON t.id_asiento = s.id
       LEFT JOIN evento_zonas zt ON zt.id = t.id_zona_tarifa
       WHERE s.id IN (${ph})`,
      ids
    );
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

/**
 * Añade zona_nombre y precio_unitario a cada fila de boleto (misma lógica que empareja QR ↔ asiento).
 */
async function enrichTicketsWithZonaPrecio(tickets) {
  if (!Array.isArray(tickets) || tickets.length === 0) return tickets;

  const byOrden = new Map();
  for (const t of tickets) {
    if (t.idorden == null || t.idorden === '') continue;
    const oid = Number(t.idorden);
    if (!Number.isFinite(oid) || oid < 1) continue;
    if (!byOrden.has(oid)) byOrden.set(oid, []);
    byOrden.get(oid).push(t);
  }

  for (const list of byOrden.values()) {
    list.sort((a, b) => ticketSortKeyForOrden(a) - ticketSortKeyForOrden(b));
  }

  for (const [ordenId, list] of byOrden) {
    const ord = await loadOrdenForTicketEnrich(ordenId);
    if (!ord) continue;

    let metas = [];
    const seatIdsOrdered = parseSeatIdsFromOrdenRow(ord);
    let seatRows = await loadSeatsPricingForOrden(ordenId);
    if (!seatRows.length && seatIdsOrdered && seatIdsOrdered.length) {
      seatRows = await loadSeatsPricingByIds(seatIdsOrdered);
    }

    if (seatRows.length > 0) {
      let seatPool = seatRows;
      if (seatIdsOrdered && seatIdsOrdered.length) {
        const byId = new Map(seatRows.map((s) => [Number(s.id), s]));
        const ordered = seatIdsOrdered.map((sid) => byId.get(Number(sid))).filter(Boolean);
        const used = new Set(ordered.map((s) => Number(s.id)));
        const rest = seatRows.filter((s) => !used.has(Number(s.id)));
        seatPool = ordered.length ? [...ordered, ...rest] : seatRows;
      }
      metas = seatPool.map((s) => ({
        zona_nombre: s.nombre_seccion || null,
        precio_unitario: Number(s.precio_zona),
      }));
    } else if (ord.idzona) {
      try {
        const zrows = await query(`SELECT nombre_seccion, precio FROM evento_zonas WHERE id = ? LIMIT 1`, [
          ord.idzona,
        ]);
        const z = zrows[0];
        const precio = z != null ? Number(z.precio) : null;
        const nombre = z?.nombre_seccion || null;
        metas = list.map(() => ({ zona_nombre: nombre, precio_unitario: precio }));
      } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE' && e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      }
    }

    if (!metas.length && ord.idevento) {
      try {
        const evRows = await query(`SELECT precio FROM eventos WHERE id = ? LIMIT 1`, [ord.idevento]);
        const p = Number(evRows[0]?.precio);
        const cant = Math.max(1, Number(ord.cantidad_boletos) || list.length);
        const unit = Number.isFinite(p) ? p : Number(ord.total) / cant;
        metas = list.map(() => ({ zona_nombre: null, precio_unitario: unit }));
      } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE' && e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      }
    }

    if (!metas.length && list.length) {
      const cant = Math.max(1, Number(ord.cantidad_boletos) || list.length);
      const unit = Number(ord.total) / cant;
      metas = list.map(() => ({ zona_nombre: null, precio_unitario: unit }));
    }

    list.forEach((t, i) => {
      const m = metas[i] ?? metas[metas.length - 1] ?? {};
      t.zona_nombre = m.zona_nombre ?? null;
      t.precio_unitario = m.precio_unitario ?? null;
    });
  }

  return tickets;
}

async function listTicketsByUser(userId) {
  const bFields = await tableFieldSet('boletos');
  if (!bFields) return [];
  const bUser = pickExisting(bFields, ['idusuario', 'id_usuario', 'usuario_id', 'user_id']);
  if (!bUser) return [];
  const bEvent = pickExisting(bFields, ['idevento', 'id_evento', 'evento_id']);
  const bOrder = pickExisting(bFields, ['idorden', 'id_orden', 'orden_id', 'order_id']);
  const bEstado = pickExisting(bFields, ['estado', 'status']) || 'estado';
  const bCodigo = pickExisting(bFields, ['codigo', 'codigo_boleto', 'ticket_code', 'code', 'folio']);

  const attempts = [];
  if (bEvent) {
    attempts.push(
      `SELECT b.id,
              b.${bEvent} AS idevento,
              ${bOrder ? `b.${bOrder}` : 'NULL'} AS idorden,
              b.${bEstado} AS estado,
              ${bCodigo ? `b.${bCodigo}` : 'NULL'} AS codigo,
              e.titulo AS evento_titulo,
              e.fecha AS evento_fecha
       FROM boletos b
       LEFT JOIN eventos e ON e.id = b.${bEvent}
       WHERE b.${bUser} = ?
       ORDER BY b.id DESC`
    );
  }

  if (bOrder) {
    const oFields = await tableFieldSet('ordenes');
    const oZona = oFields ? pickExisting(oFields, ['idzona', 'id_zona', 'zona_id']) : null;
    if (oZona) {
      attempts.push(
        `SELECT b.id,
                ez.idevento AS idevento,
                b.${bOrder} AS idorden,
                b.${bEstado} AS estado,
                ${bCodigo ? `b.${bCodigo}` : 'NULL'} AS codigo,
                e.titulo AS evento_titulo,
                e.fecha AS evento_fecha
         FROM boletos b
         LEFT JOIN ordenes o ON o.id = b.${bOrder}
         LEFT JOIN evento_zonas ez ON ez.id = o.${oZona}
         LEFT JOIN eventos e ON e.id = ez.idevento
         WHERE b.${bUser} = ?
         ORDER BY b.id DESC`
      );
    }
  }

  attempts.push(
    `SELECT b.id,
            NULL AS idevento,
            ${bOrder ? `b.${bOrder}` : 'NULL'} AS idorden,
            b.${bEstado} AS estado,
            ${bCodigo ? `b.${bCodigo}` : 'NULL'} AS codigo,
            NULL AS evento_titulo,
            NULL AS evento_fecha
     FROM boletos b
     WHERE b.${bUser} = ?
     ORDER BY b.id DESC`
  );

  for (const sql of attempts) {
    try {
      const rows = await query(sql, [userId]);
      if (Array.isArray(rows) && rows.length > 0) {
        await enrichTicketsWithZonaPrecio(rows);
        return rows;
      }
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') continue;
      if (e.code === 'ER_NO_SUCH_TABLE') return [];
      throw e;
    }
  }
  // Fallback para esquemas legacy: mostrar boletos virtuales desde ordenes pagadas.
  const virtual = await listVirtualTicketsByOrders(userId);
  await enrichTicketsWithZonaPrecio(virtual);
  return virtual;
}

module.exports = { listOrdersByUser, listTicketsByUser };
