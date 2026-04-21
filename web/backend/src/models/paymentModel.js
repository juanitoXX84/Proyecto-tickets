const crypto = require('crypto');
const { getPool, query } = require('../config/database');
const eventSeatModel = require('./eventSeatModel');

function isSchemaError(err) {
  return err && (err.code === 'ER_BAD_FIELD_ERROR' || Number(err.errno) === 1054);
}

function isMissingTable(err) {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || Number(err.errno) === 1146);
}

function computeComisionPlataforma(transactionAmount) {
  const r = Number(process.env.PLATFORM_COMMISSION_RATE || 0);
  if (!Number.isFinite(r) || r <= 0) return null;
  const amt = Number(transactionAmount);
  if (!Number.isFinite(amt)) return null;
  return Math.round(amt * r * 100) / 100;
}

function generateBoletoCodigo(ordenId, i) {
  const hex = crypto.randomBytes(5).toString('hex').toUpperCase();
  return `TR-${ordenId}-${i}-${hex}`;
}

function generateSyntheticTicketCode(ordenId, i) {
  return `TR-DEMO-${ordenId}-${i + 1}`;
}

async function getEventoIdFromZona(conn, zonaId) {
  if (!zonaId) return null;
  try {
    const [rows] = await conn.execute(`SELECT idevento FROM evento_zonas WHERE id = ? LIMIT 1`, [zonaId]);
    const eid = Number(rows[0]?.idevento);
    return Number.isFinite(eid) && eid > 0 ? eid : null;
  } catch (err) {
    if (isSchemaError(err) || isMissingTable(err)) return null;
    throw err;
  }
}

function pickExistingField(fields, candidates) {
  for (const c of candidates) {
    if (fields.has(String(c).toLowerCase())) return c;
  }
  return null;
}

async function detectPagosColumnsConn(conn) {
  const [rows] = await conn.execute(`SHOW COLUMNS FROM pagos`);
  const fields = new Set((rows || []).map((r) => String(r.Field || '').toLowerCase()));
  return {
    orderCol: pickExistingField(fields, ['idorden', 'id_orden', 'orden_id', 'order_id']),
    estadoCol: pickExistingField(fields, ['estado', 'status']),
    mpPaymentIdCol: pickExistingField(fields, ['mp_payment_id']),
    mpStatusDetailCol: pickExistingField(fields, ['mp_status_detail']),
  };
}

async function resolvePaidOrderStatusConn(conn) {
  try {
    const [rows] = await conn.execute(`SHOW COLUMNS FROM ordenes LIKE 'estado'`);
    const type = String(rows?.[0]?.Type || '').toLowerCase();
    if (type.includes('enum(') && !type.includes("'pagado'") && type.includes("'completada'")) {
      return 'completada';
    }
  } catch {
    // fallback below
  }
  return 'pagado';
}

async function resolveOrdenEventoId(conn, ord) {
  const direct = Number(ord?.idevento);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return getEventoIdFromZona(conn, ord?.idzona);
}

function parseSeatIdsFromOrden(ord) {
  if (!ord?.seat_ids_json) return null;
  try {
    const j = JSON.parse(ord.seat_ids_json);
    return Array.isArray(j) && j.length ? j : null;
  } catch {
    return null;
  }
}

/**
 * Crea orden + pago pendientes y reserva cupo (transacción con bloqueo).
 * Si `seatIds` viene con zona de mapa: retiene butacas (`held`) sin sumar boletos_vendidos hasta el pago.
 */
async function createPendingOrderWithPayment({
  userId,
  eventoId,
  zonaId,
  cantidad,
  unitPrice,
  total,
  seatIds,
}) {
  const seatOrder =
    zonaId != null && Array.isArray(seatIds) && seatIds.length > 0;
  let qty = cantidad;
  if (seatOrder) {
    qty = seatIds.length;
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let ordenIdFinal;

    if (zonaId != null && seatOrder) {
      if (!(await eventSeatModel.tableExists())) {
        await conn.rollback();
        return { error: 'El mapa de asientos no está configurado en el servidor (migración SQL).' };
      }
      const [zrows] = await conn.execute(
        `SELECT idevento, usa_mapa_asientos FROM evento_zonas WHERE id = ? FOR UPDATE`,
        [zonaId]
      );
      const z = zrows[0];
      if (!z || Number(z.idevento) !== Number(eventoId)) {
        await conn.rollback();
        return { error: 'Zona inválida para este evento' };
      }
      if (!Number(z.usa_mapa_asientos)) {
        await conn.rollback();
        return { error: 'Esta zona no usa mapa de asientos numerados' };
      }

      let ordResult;
      try {
        [ordResult] = await conn.execute(
          `INSERT INTO ordenes (idusuario, idevento, idzona, total, cantidad_boletos, estado)
           VALUES (?, ?, ?, ?, ?, 'pendiente')`,
          [userId, eventoId, zonaId, total, qty]
        );
      } catch (err) {
        if (!isSchemaError(err)) throw err;
        [ordResult] = await conn.execute(
          `INSERT INTO ordenes (idusuario, idzona, total, cantidad_boletos, estado)
           VALUES (?, ?, ?, ?, 'pendiente')`,
          [userId, zonaId, total, qty]
        );
      }

      ordenIdFinal = ordResult.insertId;

      try {
        await conn.execute(`UPDATE ordenes SET seat_ids_json = ? WHERE id = ?`, [
          JSON.stringify(seatIds),
          ordenIdFinal,
        ]);
      } catch (e) {
        if (!isSchemaError(e)) throw e;
      }

      try {
        await eventSeatModel.holdSeatsForOrderConn(conn, eventoId, seatIds, ordenIdFinal);
      } catch (e) {
        await conn.rollback();
        const msg = e?.message || 'Asientos no disponibles';
        if (e.status === 400 || e.status === 409) {
          return { error: msg };
        }
        throw e;
      }
    } else if (zonaId != null) {
      const [zrows] = await conn.execute(
        `SELECT idevento FROM evento_zonas WHERE id = ? FOR UPDATE`,
        [zonaId]
      );
      const zz = zrows[0];
      if (!zz || Number(zz.idevento) !== Number(eventoId)) {
        await conn.rollback();
        return { error: 'Zona inválida para este evento' };
      }
      const [upZ] = await conn.execute(
        `UPDATE evento_zonas SET boletos_vendidos = boletos_vendidos + ? WHERE id = ? AND boletos_vendidos + ? <= capacidad`,
        [qty, zonaId, qty]
      );
      if (upZ.affectedRows !== 1) {
        await conn.rollback();
        return { error: 'No hay suficientes entradas disponibles en esta zona' };
      }
      let ordResult;
      try {
        [ordResult] = await conn.execute(
          `INSERT INTO ordenes (idusuario, idevento, idzona, total, cantidad_boletos, estado)
           VALUES (?, ?, ?, ?, ?, 'pendiente')`,
          [userId, eventoId, zonaId, total, qty]
        );
      } catch (err) {
        if (!isSchemaError(err)) throw err;
        [ordResult] = await conn.execute(
          `INSERT INTO ordenes (idusuario, idzona, total, cantidad_boletos, estado)
           VALUES (?, ?, ?, ?, 'pendiente')`,
          [userId, zonaId, total, qty]
        );
      }
      ordenIdFinal = ordResult.insertId;
    } else {
      const [upE] = await conn.execute(
        `UPDATE eventos SET boletosvendidos = boletosvendidos + ? WHERE id = ? AND boletosvendidos + ? <= capacidad`,
        [qty, eventoId, qty]
      );
      if (upE.affectedRows !== 1) {
        await conn.rollback();
        return { error: 'No hay suficientes entradas disponibles' };
      }
      let ordResult;
      try {
        [ordResult] = await conn.execute(
          `INSERT INTO ordenes (idusuario, idevento, idzona, total, cantidad_boletos, estado)
           VALUES (?, ?, ?, ?, ?, 'pendiente')`,
          [userId, eventoId, zonaId, total, qty]
        );
      } catch (err) {
        if (!isSchemaError(err)) throw err;
        [ordResult] = await conn.execute(
          `INSERT INTO ordenes (idusuario, idzona, total, cantidad_boletos, estado)
           VALUES (?, ?, ?, ?, 'pendiente')`,
          [userId, zonaId, total, qty]
        );
      }
      ordenIdFinal = ordResult.insertId;
    }

    await conn.execute(
      `INSERT INTO pagos (idorden, metodo, monto, estado) VALUES (?, 'tarjeta', ?, 'pendiente')`,
      [ordenIdFinal, total]
    );

    await conn.commit();
    return { ok: true, ordenId: ordenIdFinal, unitPrice, total };
  } catch (err) {
    await conn.rollback();
    if (isSchemaError(err) || isMissingTable(err)) {
      return {
        error:
          'Ejecuta database/schema_fase4_mercadopago.sql (y tablas de compra) para habilitar pagos.',
      };
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function detectBoletosColumnsConn(conn) {
  const [rows] = await conn.execute(`SHOW COLUMNS FROM boletos`);
  const fields = new Set((rows || []).map((r) => String(r.Field || '').toLowerCase()));
  const pick = (...cands) => cands.find((c) => fields.has(c)) || null;
  const orderCol = pick('idorden', 'id_orden', 'orden_id', 'order_id');
  const userCol = pick('idusuario', 'id_usuario', 'usuario_id', 'user_id', 'iduser');
  const eventCol = pick('idevento', 'id_evento', 'evento_id', 'event_id');
  const estadoCol = pick('estado', 'status');
  const codigoCol = pick('codigo', 'codigo_boleto', 'ticket_code', 'code', 'folio');
  return { orderCol, userCol, eventCol, estadoCol, codigoCol };
}

async function insertBoletoConn(conn, { ordenId, userId, eventoId, codigo }) {
  const c = await detectBoletosColumnsConn(conn);
  if (!c.orderCol) {
    throw new Error('La tabla boletos no tiene columna de orden compatible.');
  }
  const cols = [c.orderCol];
  const vals = [ordenId];
  if (c.userCol) {
    cols.push(c.userCol);
    vals.push(userId);
  }
  if (c.eventCol) {
    cols.push(c.eventCol);
    vals.push(eventoId);
  }
  if (c.estadoCol) {
    cols.push(c.estadoCol);
    vals.push('activo');
  }
  if (c.codigoCol) {
    cols.push(c.codigoCol);
    vals.push(codigo);
  }
  const ph = cols.map(() => '?').join(', ');
  await conn.execute(`INSERT INTO boletos (${cols.join(', ')}) VALUES (${ph})`, vals);
}

async function markBoletosRefundedConn(conn, ordenId) {
  const c = await detectBoletosColumnsConn(conn);
  if (!c.orderCol || !c.estadoCol) return;
  await conn.execute(`UPDATE boletos SET ${c.estadoCol} = 'reembolsado' WHERE ${c.orderCol} = ?`, [ordenId]);
}

async function updateOrdenPreferenceId(ordenId, preferenceId) {
  await query(`UPDATE ordenes SET mp_preference_id = ? WHERE id = ?`, [preferenceId, ordenId]);
}

async function findOrdenById(ordenId) {
  const rows = await query(`SELECT * FROM ordenes WHERE id = ?`, [ordenId]);
  return rows[0] || null;
}

async function findOrdenByPreferenceId(preferenceId) {
  const rows = await query(`SELECT * FROM ordenes WHERE mp_preference_id = ?`, [preferenceId]);
  return rows[0] || null;
}

async function findPagoByOrdenId(ordenId) {
  const rows = await query(`SELECT * FROM pagos WHERE idorden = ? ORDER BY id DESC LIMIT 1`, [ordenId]);
  return rows[0] || null;
}

async function findPagoByMpPaymentId(mpPaymentId) {
  const rows = await query(`SELECT * FROM pagos WHERE mp_payment_id = ?`, [String(mpPaymentId)]);
  return rows[0] || null;
}

async function findPagoById(pagoId) {
  const rows = await query(`SELECT * FROM pagos WHERE id = ?`, [pagoId]);
  return rows[0] || null;
}

/**
 * Marca pago aprobado, orden pagada, emite boletos y actualiza cupos.
 * Idempotente si la orden ya está pagada.
 */
async function applyApprovedPaymentIfNeeded({
  ordenId,
  mpPaymentId,
  transactionAmount,
  statusDetail,
  allowWithoutTickets = false,
}) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const paidOrderStatus = await resolvePaidOrderStatusConn(conn);

    const [oRows] = await conn.execute(`SELECT * FROM ordenes WHERE id = ? FOR UPDATE`, [ordenId]);
    const ord = oRows[0];
    if (!ord) {
      await conn.rollback();
      return { ok: false, reason: 'orden_no_encontrada' };
    }

    if (ord.estado === 'pagado' || ord.estado === 'completada') {
      await conn.rollback();
      return { ok: true, already: true };
    }

    const [pRows] = await conn.execute(
      `SELECT * FROM pagos WHERE idorden = ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [ordenId]
    );
    const pago = pRows[0];
    if (!pago) {
      await conn.rollback();
      return { ok: false, reason: 'pago_no_encontrado' };
    }

    if (pago.mp_payment_id && String(pago.mp_payment_id) === String(mpPaymentId) && pago.estado === 'aprobado') {
      await conn.rollback();
      return { ok: true, already: true };
    }

    const cant = Math.max(1, Math.floor(Number(ord.cantidad_boletos) || 1));
    const totalOrden = Number(ord.total);
    const mpAmt = Number(transactionAmount);
    if (Number.isFinite(totalOrden) && Number.isFinite(mpAmt) && Math.abs(totalOrden - mpAmt) > 0.05) {
      await conn.rollback();
      return { ok: false, reason: 'monto_no_coincide', totalOrden, mpAmt };
    }

    /* Cupo por zona sin mapa ya se apartó al crear la orden; con mapa de asientos se suma aquí al aprobar. */

    const eventoId = await resolveOrdenEventoId(conn, ord);
    if (!eventoId) {
      await conn.rollback();
      return { ok: false, reason: 'evento_no_resuelto' };
    }

    if (
      ord.idzona &&
      (await eventSeatModel.tableExists()) &&
      parseSeatIdsFromOrden(ord)
    ) {
      await eventSeatModel.finalizeHeldToSoldConn(conn, ordenId);
      const soldSeatIds = parseSeatIdsFromOrden(ord);
      if (soldSeatIds && soldSeatIds.length > 0) {
        const byZ = await eventSeatModel.countSeatsByBillingZonaConn(conn, soldSeatIds);
        for (const row of byZ) {
          const zid = Number(row.zid);
          const n = Number(row.n);
          if (Number.isFinite(zid) && zid > 0 && Number.isFinite(n) && n > 0) {
            await conn.execute(`UPDATE evento_zonas SET boletos_vendidos = boletos_vendidos + ? WHERE id = ?`, [
              n,
              zid,
            ]);
          }
        }
      } else {
        await conn.execute(`UPDATE evento_zonas SET boletos_vendidos = boletos_vendidos + ? WHERE id = ?`, [
          cant,
          ord.idzona,
        ]);
      }
    }

    let ticketInsertWarning = null;
    for (let i = 0; i < cant; i += 1) {
      const codigo = generateBoletoCodigo(ordenId, i);
      try {
        await insertBoletoConn(conn, {
          ordenId,
          userId: ord.idusuario,
          eventoId,
          codigo,
        });
      } catch (e) {
        if (!allowWithoutTickets) throw e;
        ticketInsertWarning = e?.message || 'No se pudieron crear boletos en este esquema.';
        break;
      }
    }

    const comision = computeComisionPlataforma(transactionAmount);

    await conn.execute(`UPDATE ordenes SET estado = ? WHERE id = ?`, [paidOrderStatus, ordenId]);
    await conn.execute(
      `UPDATE pagos SET estado = 'aprobado', mp_payment_id = ?, mp_status_detail = ?, comision_plataforma = ? WHERE id = ?`,
      [String(mpPaymentId), statusDetail || null, comision, pago.id]
    );

    await conn.commit();
    return { ok: true, ordenId, boletos: cant, warning: ticketInsertWarning };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Fallback demo: fuerza orden/pago a aprobado aunque el esquema sea legacy.
 * No crea boletos; se usa para modo escolar cuando hay incompatibilidades de columnas.
 */
async function forceDemoApproveLenient({ ordenId, mpPaymentId, statusDetail }) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const paidOrderStatus = await resolvePaidOrderStatusConn(conn);
    const [oRows] = await conn.execute(`SELECT * FROM ordenes WHERE id = ? FOR UPDATE`, [ordenId]);
    const ord = oRows[0];
    if (!ord) {
      await conn.rollback();
      return { ok: false, reason: 'orden_no_encontrada' };
    }
    await conn.execute(`UPDATE ordenes SET estado = ? WHERE id = ?`, [paidOrderStatus, ordenId]);

    try {
      const cols = await detectPagosColumnsConn(conn);
      if (cols.orderCol && cols.estadoCol) {
        const [pRows] = await conn.execute(
          `SELECT * FROM pagos WHERE ${cols.orderCol} = ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
          [ordenId]
        );
        const p = pRows[0];
        if (p) {
          const sets = [`${cols.estadoCol} = ?`];
          const vals = ['aprobado'];
          if (cols.mpPaymentIdCol) {
            sets.push(`${cols.mpPaymentIdCol} = ?`);
            vals.push(String(mpPaymentId || `demo_${ordenId}_${Date.now()}`));
          }
          if (cols.mpStatusDetailCol) {
            sets.push(`${cols.mpStatusDetailCol} = ?`);
            vals.push(statusDetail || 'demo_lenient_approved');
          }
          vals.push(p.id);
          await conn.execute(`UPDATE pagos SET ${sets.join(', ')} WHERE id = ?`, vals);
        }
      }
    } catch {
      // En modo demo no bloqueamos por tabla/columnas de pagos incompatibles.
    }

    await conn.commit();
    return { ok: true, forced: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Listado admin de pagos con retroceso si faltan columnas (Fase 4 o schema_updates).
 */
async function listPagosAdmin({ page, limit, estado, q }) {
  const offset = (page - 1) * limit;
  const qTrim = q && String(q).trim() ? String(q).trim() : '';
  const estadoTrim = estado && String(estado).trim() ? String(estado).trim() : '';

  const attempts = [
    { mpCols: true, idevento: true, cantidadCol: true, mpSearch: true },
    { mpCols: true, idevento: true, cantidadCol: false, mpSearch: true },
    { mpCols: false, idevento: true, cantidadCol: false, mpSearch: false },
    { mpCols: false, idevento: false, cantidadCol: false, mpSearch: false },
  ];

  let lastErr = null;
  for (const a of attempts) {
    try {
      return await listPagosAdminOnce({
        offset,
        limit,
        estado: estadoTrim,
        q: qTrim,
        mpCols: a.mpCols,
        idevento: a.idevento,
        cantidadCol: a.cantidadCol,
        mpSearch: a.mpSearch,
      });
    } catch (err) {
      lastErr = err;
      if (!isSchemaError(err) && !isMissingTable(err)) {
        throw err;
      }
    }
  }
  throw lastErr;
}

async function listPagosAdminOnce({ offset, limit, estado, q, mpCols, idevento, cantidadCol, mpSearch }) {
  const params = [];
  let where = '1=1';
  if (estado) {
    where += ' AND p.estado = ?';
    params.push(estado);
  }
  if (q) {
    const like = `%${q}%`;
    if (mpSearch && mpCols) {
      where += ' AND (u.email LIKE ? OR e.titulo LIKE ? OR CAST(p.mp_payment_id AS CHAR) LIKE ?)';
      params.push(like, like, like);
    } else if (idevento) {
      where += ' AND (u.email LIKE ? OR e.titulo LIKE ?)';
      params.push(like, like);
    } else {
      where += ' AND (u.email LIKE ?)';
      params.push(like);
    }
  }

  const joinEvento = idevento ? 'LEFT JOIN eventos e ON e.id = o.idevento' : '';
  const selIdevento = idevento ? 'o.idevento' : 'NULL AS idevento';
  const selTitulo = idevento ? 'e.titulo AS evento_titulo' : 'NULL AS evento_titulo';

  const selMp = mpCols
    ? `p.mp_payment_id,
            p.mp_status_detail,
            p.comision_plataforma,
            p.reembolsado_at,`
    : `NULL AS mp_payment_id,
            NULL AS mp_status_detail,
            NULL AS comision_plataforma,
            NULL AS reembolsado_at,`;

  const selCantidad = cantidadCol ? 'o.cantidad_boletos' : '1 AS cantidad_boletos';

  const countSql = `SELECT COUNT(*) AS n
     FROM pagos p
     INNER JOIN ordenes o ON o.id = p.idorden
     LEFT JOIN usuarios u ON u.id = o.idusuario
     ${joinEvento}
     WHERE ${where}`;

  const countRows = await query(countSql, [...params]);
  const total = Number(countRows[0]?.n || 0);

  const rows = await query(
    `SELECT p.id AS pago_id,
            p.idorden,
            p.monto,
            p.estado AS pago_estado,
            p.fecha,
            ${selMp}
            ${selIdevento},
            ${selCantidad},
            o.estado AS orden_estado,
            ${selTitulo},
            u.email AS comprador_email
     FROM pagos p
     INNER JOIN ordenes o ON o.id = p.idorden
     LEFT JOIN usuarios u ON u.id = o.idusuario
     ${joinEvento}
     WHERE ${where}
     ORDER BY p.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total };
}

async function financeSummary({ desde, hasta }) {
  const fullSql = `SELECT
       COUNT(*) AS num_pagos,
       SUM(CASE WHEN p.estado = 'aprobado' THEN 1 ELSE 0 END) AS num_aprobados,
       SUM(CASE WHEN p.estado = 'aprobado' THEN p.monto ELSE 0 END) AS total_bruto_aprobado,
       SUM(CASE WHEN p.estado = 'aprobado' THEN COALESCE(p.comision_plataforma, 0) ELSE 0 END) AS total_comision_plataforma,
       SUM(CASE WHEN p.reembolsado_at IS NOT NULL THEN p.monto ELSE 0 END) AS total_reembolsado_monto
     FROM pagos p
     WHERE DATE(p.fecha) BETWEEN ? AND ?`;
  const basicSql = `SELECT
       COUNT(*) AS num_pagos,
       SUM(CASE WHEN p.estado = 'aprobado' THEN 1 ELSE 0 END) AS num_aprobados,
       SUM(CASE WHEN p.estado = 'aprobado' THEN p.monto ELSE 0 END) AS total_bruto_aprobado,
       0 AS total_comision_plataforma,
       0 AS total_reembolsado_monto
     FROM pagos p
     WHERE DATE(p.fecha) BETWEEN ? AND ?`;
  const params = [desde, hasta];
  let rows;
  try {
    rows = await query(fullSql, params);
  } catch (err) {
    if (!isSchemaError(err)) throw err;
    rows = await query(basicSql, params);
  }
  const r = rows[0] || {};
  const bruto = Number(r.total_bruto_aprobado || 0);
  const com = Number(r.total_comision_plataforma || 0);
  return {
    num_pagos: Number(r.num_pagos || 0),
    num_aprobados: Number(r.num_aprobados || 0),
    total_bruto_aprobado: bruto,
    total_comision_plataforma: com,
    total_estimado_organizadores: Math.round((bruto - com) * 100) / 100,
    total_reembolsado_monto: Number(r.total_reembolsado_monto || 0),
  };
}

/**
 * Libera cupo reservado si el pago no se aprueba (rechazo / cancelación en MP).
 */
async function releaseReservationForOrden(ordenId, statusDetail) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [oRows] = await conn.execute(`SELECT * FROM ordenes WHERE id = ? FOR UPDATE`, [ordenId]);
    const ord = oRows[0];
    if (!ord || ord.estado !== 'pendiente') {
      await conn.rollback();
      return { ok: true, skipped: true };
    }
    const cant = Math.max(1, Math.floor(Number(ord.cantidad_boletos) || 1));
    const hadSeatPick =
      (await eventSeatModel.tableExists()) && parseSeatIdsFromOrden(ord);
    if (hadSeatPick) {
      await eventSeatModel.releaseHeldForOrdenConn(conn, ordenId);
    } else if (ord.idzona != null) {
      await conn.execute(
        `UPDATE evento_zonas SET boletos_vendidos = GREATEST(0, boletos_vendidos - ?) WHERE id = ?`,
        [cant, ord.idzona]
      );
    } else {
      const eventoId = await resolveOrdenEventoId(conn, ord);
      if (eventoId) {
        await conn.execute(
          `UPDATE eventos SET boletosvendidos = GREATEST(0, boletosvendidos - ?) WHERE id = ?`,
          [cant, eventoId]
        );
      }
    }
    await conn.execute(`UPDATE ordenes SET estado = 'cancelada' WHERE id = ?`, [ordenId]);
    const [pRows] = await conn.execute(`SELECT id FROM pagos WHERE idorden = ? ORDER BY id DESC LIMIT 1`, [ordenId]);
    if (pRows[0]) {
      await conn.execute(`UPDATE pagos SET estado = 'rechazado', mp_status_detail = ? WHERE id = ?`, [
        statusDetail || null,
        pRows[0].id,
      ]);
    }
    await conn.commit();
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function markRefundInDb({ pagoId, ordenId }) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [pRows] = await conn.execute(`SELECT * FROM pagos WHERE id = ? FOR UPDATE`, [pagoId]);
    const pago = pRows[0];
    if (!pago || Number(pago.idorden) !== Number(ordenId)) {
      await conn.rollback();
      return { ok: false, error: 'Pago no encontrado' };
    }
    if (pago.reembolsado_at) {
      await conn.rollback();
      return { ok: false, error: 'Este pago ya fue reembolsado' };
    }
    if (pago.estado !== 'aprobado') {
      await conn.rollback();
      return { ok: false, error: 'Solo se pueden reembolsar pagos aprobados' };
    }

    const [oRows] = await conn.execute(`SELECT * FROM ordenes WHERE id = ? FOR UPDATE`, [ordenId]);
    const ord = oRows[0];
    if (!ord) {
      await conn.rollback();
      return { ok: false, error: 'Orden no encontrada' };
    }

    const cant = Math.max(1, Math.floor(Number(ord.cantidad_boletos) || 1));

    const hadSeatPick =
      (await eventSeatModel.tableExists()) && parseSeatIdsFromOrden(ord);
    if (hadSeatPick) {
      await eventSeatModel.releaseSoldSeatsForRefundConn(conn, ordenId);
    }

    const refundSeatIds = parseSeatIdsFromOrden(ord);
    if (hadSeatPick && refundSeatIds && refundSeatIds.length > 0) {
      const byZ = await eventSeatModel.countSeatsByBillingZonaConn(conn, refundSeatIds);
      for (const row of byZ) {
        const zid = Number(row.zid);
        const n = Number(row.n);
        if (Number.isFinite(zid) && zid > 0 && Number.isFinite(n) && n > 0) {
          await conn.execute(
            `UPDATE evento_zonas SET boletos_vendidos = GREATEST(0, boletos_vendidos - ?) WHERE id = ?`,
            [n, zid]
          );
        }
      }
    } else if (ord.idzona != null) {
      await conn.execute(
        `UPDATE evento_zonas SET boletos_vendidos = GREATEST(0, boletos_vendidos - ?) WHERE id = ?`,
        [cant, ord.idzona]
      );
    } else {
      const eventoId = await resolveOrdenEventoId(conn, ord);
      if (eventoId) {
        await conn.execute(
          `UPDATE eventos SET boletosvendidos = GREATEST(0, boletosvendidos - ?) WHERE id = ?`,
          [cant, eventoId]
        );
      }
    }

    await markBoletosRefundedConn(conn, ordenId);
    await conn.execute(
      `UPDATE pagos SET estado = 'reembolsado', reembolsado_at = NOW() WHERE id = ?`,
      [pagoId]
    );
    await conn.execute(`UPDATE ordenes SET estado = 'reembolsado' WHERE id = ?`, [ordenId]);

    await conn.commit();
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function buildSeatLabel(seat) {
  const fila = String(seat?.fila || '').trim();
  const col = Number(seat?.columna);
  if (fila && Number.isFinite(col) && col > 0) return `Fila ${fila} · Asiento ${col}`;
  if (fila) return `Fila ${fila}`;
  if (Number.isFinite(col) && col > 0) return `Asiento ${col}`;
  return null;
}

async function loadUserBasic(userId) {
  try {
    const rows = await query(`SELECT id, email, nombre, apellido FROM usuarios WHERE id = ? LIMIT 1`, [userId]);
    return rows[0] || null;
  } catch (err) {
    if (!isSchemaError(err)) throw err;
    const rows = await query(`SELECT id, email FROM usuarios WHERE id = ? LIMIT 1`, [userId]);
    return rows[0] || null;
  }
}

async function loadEventBasic(eventoId) {
  try {
    const rows = await query(
      `SELECT id, titulo, fecha, ubicacion, generar_qr_email, instrucciones_canje
       FROM eventos WHERE id = ? LIMIT 1`,
      [eventoId]
    );
    return rows[0] || null;
  } catch (err) {
    if (!isSchemaError(err)) throw err;
    const rows = await query(
      `SELECT id, titulo, fecha, ubicacion
       FROM eventos WHERE id = ? LIMIT 1`,
      [eventoId]
    );
    return rows[0] || null;
  }
}

async function loadZoneBasic(zonaId) {
  if (!zonaId) return null;
  try {
    const rows = await query(`SELECT id, nombre_seccion FROM evento_zonas WHERE id = ? LIMIT 1`, [zonaId]);
    return rows[0] || null;
  } catch (err) {
    if (isSchemaError(err) || isMissingTable(err)) return null;
    throw err;
  }
}

async function resolveEventIdFromZona(zonaId) {
  if (!zonaId) return null;
  try {
    const rows = await query(`SELECT idevento FROM evento_zonas WHERE id = ? LIMIT 1`, [zonaId]);
    const eid = Number(rows[0]?.idevento);
    return Number.isFinite(eid) && eid > 0 ? eid : null;
  } catch (err) {
    if (isSchemaError(err) || isMissingTable(err)) return null;
    throw err;
  }
}

async function loadTicketsByOrden(ordenId) {
  try {
    const rows = await query(
      `SELECT *
       FROM boletos
       WHERE idorden = ?
       ORDER BY id ASC`,
      [ordenId]
    );
    return rows.map((r) => ({
      id: r.id,
      codigo: r.codigo ?? r.codigoqr ?? r.code ?? null,
      estado: r.estado ?? r.status ?? null,
    }));
  } catch (err) {
    if (isSchemaError(err)) {
      try {
        const rows = await query(
          `SELECT *
           FROM boletos
           WHERE id_orden = ?
           ORDER BY id ASC`,
          [ordenId]
        );
        return rows.map((r) => ({
          id: r.id,
          codigo: r.codigo ?? r.codigoqr ?? r.code ?? null,
          estado: r.estado ?? r.status ?? null,
        }));
      } catch (err2) {
        if (isSchemaError(err2) || isMissingTable(err2)) return [];
        throw err2;
      }
    }
    if (isMissingTable(err)) return [];
    throw err;
  }
}

async function loadSeatsByOrden(ordenId) {
  try {
    return await query(
      `SELECT s.id, s.fila, s.columna,
              COALESCE(zt.nombre_seccion, z.nombre_seccion) AS nombre_seccion
       FROM evento_asientos s
       LEFT JOIN evento_zonas z ON z.id = s.id_zona
       LEFT JOIN evento_asiento_zona_tipo t ON t.id_asiento = s.id
       LEFT JOIN evento_zonas zt ON zt.id = t.id_zona_tarifa
       WHERE s.id_orden_compra = ?
       ORDER BY s.fila ASC, s.columna ASC`,
      [ordenId]
    );
  } catch (err) {
    if (isSchemaError(err) || isMissingTable(err)) return [];
    throw err;
  }
}

/** Localiza fila en `boletos` por código visible (compat. distintos nombres de columna). */
async function findBoletoRowByCodigo(code) {
  const c = String(code || '').trim();
  if (!c) return null;
  try {
    const rows = await query('SELECT * FROM boletos WHERE codigo = ? LIMIT 1', [c]);
    if (rows[0]) return rows[0];
  } catch (err) {
    if (!isSchemaError(err) && !isMissingTable(err)) throw err;
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      try {
        const rows = await query('SELECT * FROM boletos WHERE codigo_boleto = ? LIMIT 1', [c]);
        if (rows[0]) return rows[0];
      } catch (e2) {
        if (isMissingTable(e2)) return null;
        if (!isSchemaError(e2)) throw e2;
      }
    }
  }
  return null;
}

/**
 * Vista pública para QR (solo lectura): encuentra por código de boleto y devuelve datos ya enriquecidos como el correo.
 */
async function getPublicTicketViewByCodigo(rawCodigo) {
  let code = String(rawCodigo || '').trim();
  try {
    code = decodeURIComponent(code).trim();
  } catch {
    code = String(rawCodigo || '').trim();
  }
  if (!code) return null;
  const row = await findBoletoRowByCodigo(code);
  if (!row) return null;
  const ordenRaw = row.idorden ?? row.id_orden ?? row.order_id ?? row.idOrden;
  const ordenId = Number(ordenRaw);
  if (!Number.isFinite(ordenId) || ordenId < 1) return null;

  const bundle = await getTicketDeliveryBundle(ordenId);
  if (!bundle || !Array.isArray(bundle.tickets)) return null;
  const ticket =
    bundle.tickets.find((t) => String(t.codigo || '').trim() === code) ||
    bundle.tickets.find((t) => String(t.codigo || '').includes(code));
  if (!ticket || !ticket.codigo) return null;

  let ord = null;
  try {
    ord = await findOrdenById(ordenId);
  } catch {
    ord = null;
  }

  return {
    codigo: ticket.codigo,
    boletoEstado: ticket.estado ?? null,
    seatLabel: ticket.seatLabel ?? null,
    fila: ticket.fila ?? null,
    columna: ticket.columna ?? null,
    zonaNombre: ticket.zonaNombre ?? bundle.zonaNombre ?? null,
    ordenId: bundle.ordenId,
    ordenEstado: ord?.estado ?? null,
    event: bundle.event
      ? {
          id: bundle.event.id,
          titulo: bundle.event.titulo,
          fecha: bundle.event.fecha,
          ubicacion: bundle.event.ubicacion ?? null,
          instruccionesCanje: bundle.event.instruccionesCanje ?? null,
        }
      : null,
  };
}

/**
 * Datos consolidados para envío de boletos por correo (1 QR por boleto).
 * Si hay asientos numerados, empareja ticket↔asiento por orden de creación.
 */
async function getTicketDeliveryBundle(ordenId) {
  const oid = Number(ordenId);
  if (!Number.isFinite(oid) || oid < 1) return null;

  const ord = await findOrdenById(oid);
  if (!ord) return null;

  const eventoId = Number(ord.idevento) > 0 ? Number(ord.idevento) : null;
  const resolvedEventoId = eventoId || (await resolveEventIdFromZona(ord.idzona));
  if (!resolvedEventoId) return null;

  const [user, event, zone, tickets, seats] = await Promise.all([
    loadUserBasic(ord.idusuario),
    loadEventBasic(resolvedEventoId),
    loadZoneBasic(ord.idzona),
    loadTicketsByOrden(oid),
    loadSeatsByOrden(oid),
  ]);

  const seatPoolRaw = Array.isArray(seats) ? seats : [];
  const seatIdsOrdered = parseSeatIdsFromOrden(ord) || [];
  let seatPool = seatPoolRaw;
  if (seatIdsOrdered.length) {
    const byId = new Map(seatPoolRaw.map((s) => [Number(s.id), s]));
    const ordered = seatIdsOrdered.map((sid) => byId.get(Number(sid))).filter(Boolean);
    const used = new Set(ordered.map((s) => Number(s.id)));
    const rest = seatPoolRaw.filter((s) => !used.has(Number(s.id)));
    seatPool = [...ordered, ...rest];
  }
  let ticketsNorm = Array.isArray(tickets) ? tickets : [];
  const ticketsWithCode = ticketsNorm.filter((t) => t && t.codigo);
  if (!ticketsWithCode.length) {
    const qty = Math.max(1, Math.floor(Number(ord.cantidad_boletos) || 1));
    ticketsNorm = Array.from({ length: qty }, (_, i) => ({
      id: `syn-${oid}-${i + 1}`,
      codigo: generateSyntheticTicketCode(oid, i),
      estado: 'activo',
    }));
  }

  const ticketItems = ticketsNorm.map((t, i) => {
    const seat = seatPool[i] || null;
    const seatLabel = seat ? buildSeatLabel(seat) : null;
    return {
      id: t.id,
      codigo: t.codigo,
      estado: t.estado,
      seatId: seat?.id || null,
      fila: seat?.fila || null,
      columna: seat?.columna || null,
      seatLabel,
      zonaNombre: seat?.nombre_seccion || zone?.nombre_seccion || null,
    };
  });

  return {
    ordenId: oid,
    total: ord.total,
    cantidad: ord.cantidad_boletos,
    email: user?.email || null,
    compradorNombre: [user?.nombre, user?.apellido].filter(Boolean).join(' ').trim() || null,
    event: {
      id: event?.id || resolvedEventoId,
      titulo: event?.titulo || `Evento #${resolvedEventoId}`,
      fecha: event?.fecha || null,
      ubicacion: event?.ubicacion || null,
      generarQrEmail:
        event?.generar_qr_email == null ? true : Number(event.generar_qr_email) !== 0,
      instruccionesCanje: event?.instrucciones_canje || null,
    },
    zonaNombre: zone?.nombre_seccion || null,
    tickets: ticketItems,
  };
}

module.exports = {
  isSchemaError,
  isMissingTable,
  computeComisionPlataforma,
  createPendingOrderWithPayment,
  updateOrdenPreferenceId,
  findOrdenById,
  findOrdenByPreferenceId,
  findPagoByOrdenId,
  findPagoByMpPaymentId,
  findPagoById,
  applyApprovedPaymentIfNeeded,
  forceDemoApproveLenient,
  listPagosAdmin,
  financeSummary,
  markRefundInDb,
  releaseReservationForOrden,
  getTicketDeliveryBundle,
  getPublicTicketViewByCodigo,
};
