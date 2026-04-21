const { query, getPool } = require('../config/database');

function isMissingTable(err) {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || Number(err.errno) === 1146);
}

function displayAuthor(nombre, apellido) {
  const n = (nombre || '').trim();
  const a = (apellido || '').trim();
  if (!n && !a) return 'Asistente verificado';
  if (!a) return n;
  return `${n} ${a.charAt(0)}.`.trim();
}

const ORDER_COL_CANDS = ['idorden', 'id_orden', 'orden_id', 'order_id'];
const USER_COL_CANDS = ['idusuario', 'id_usuario', 'usuario_id', 'user_id', 'iduser'];
const EVENT_COL_CANDS = ['idevento', 'id_evento', 'evento_id', 'event_id'];

const colCache = {
  boletosOrder: undefined,
  boletosUser: undefined,
  boletosEvent: undefined,
  pagosOrder: undefined,
};

function pickCol(fieldsLower, candidates) {
  const f = fieldsLower instanceof Set ? fieldsLower : new Set(fieldsLower);
  return candidates.find((c) => f.has(c.toLowerCase())) || null;
}

async function resolveBoletosJoinColumns() {
  if (
    colCache.boletosOrder !== undefined &&
    colCache.boletosUser !== undefined &&
    colCache.boletosEvent !== undefined
  ) {
    return {
      orderCol: colCache.boletosOrder,
      userCol: colCache.boletosUser,
      eventCol: colCache.boletosEvent,
    };
  }
  try {
    const rows = await query('SHOW COLUMNS FROM boletos');
    const fields = new Set((rows || []).map((r) => String(r.Field || '').toLowerCase()));
    colCache.boletosOrder = pickCol(fields, ORDER_COL_CANDS);
    colCache.boletosUser = pickCol(fields, USER_COL_CANDS);
    colCache.boletosEvent = pickCol(fields, EVENT_COL_CANDS);
  } catch (e) {
    if (isMissingTable(e)) {
      colCache.boletosOrder = null;
      colCache.boletosUser = null;
      colCache.boletosEvent = null;
    } else {
      throw e;
    }
  }
  return {
    orderCol: colCache.boletosOrder,
    userCol: colCache.boletosUser,
    eventCol: colCache.boletosEvent,
  };
}

async function resolvePagosOrderColumn() {
  if (colCache.pagosOrder !== undefined) return colCache.pagosOrder;
  try {
    const rows = await query('SHOW COLUMNS FROM pagos');
    const fields = new Set((rows || []).map((r) => String(r.Field || '').toLowerCase()));
    colCache.pagosOrder = pickCol(fields, ORDER_COL_CANDS);
  } catch (e) {
    if (isMissingTable(e)) colCache.pagosOrder = null;
    else throw e;
  }
  return colCache.pagosOrder;
}

const ordenColCache = { resolved: false, userCol: null, eventCol: null, zonaCol: null };

async function resolveOrdenColumnsForReviews() {
  if (ordenColCache.resolved) return ordenColCache;
  ordenColCache.resolved = true;
  try {
    const rows = await query('SHOW COLUMNS FROM ordenes');
    const fields = new Set((rows || []).map((r) => String(r.Field || '').toLowerCase()));
    ordenColCache.userCol = pickCol(fields, USER_COL_CANDS);
    ordenColCache.eventCol = pickCol(fields, EVENT_COL_CANDS);
    ordenColCache.zonaCol = pickCol(fields, ['idzona', 'id_zona', 'zona_id']);
  } catch (e) {
    if (isMissingTable(e)) {
      ordenColCache.userCol = null;
      ordenColCache.eventCol = null;
      ordenColCache.zonaCol = null;
    } else {
      throw e;
    }
  }
  return ordenColCache;
}

/** Coincide el evento por columna del boleto, idevento en orden o zona→evento. */
function buildEventMatchSqlParts(ord, bEventCol, eventId) {
  const eid = Number(eventId);
  if (!Number.isFinite(eid) || eid < 1) {
    return { joinEz: '', whereSql: '1 = 0', params: [] };
  }
  if (ord.eventCol && ord.zonaCol) {
    return {
      joinEz: `LEFT JOIN evento_zonas ez ON ez.id = o.${ord.zonaCol}`,
      whereSql: `(b.${bEventCol} = ? OR o.${ord.eventCol} = ? OR ez.idevento = ?)`,
      params: [eid, eid, eid],
    };
  }
  if (ord.eventCol) {
    return {
      joinEz: '',
      whereSql: `(b.${bEventCol} = ? OR o.${ord.eventCol} = ?)`,
      params: [eid, eid],
    };
  }
  return {
    joinEz: '',
    whereSql: `b.${bEventCol} = ?`,
    params: [eid],
  };
}

const PAID_ORDEN_SQL = `LOWER(TRIM(COALESCE(o.estado,''))) IN ('pagado','completada')`;

/**
 * Compra con pago aprobado y boleto válido (no reembolsado).
 */
async function hasApprovedTicketForEvent(userId, eventId) {
  try {
    const { orderCol, userCol, eventCol } = await resolveBoletosJoinColumns();
    const pOrder = await resolvePagosOrderColumn();
    const ord = await resolveOrdenColumnsForReviews();
    if (!orderCol || !userCol || !eventCol || !pOrder) return false;
    const parts = buildEventMatchSqlParts(ord, eventCol, eventId);
    const rows = await query(
      `SELECT 1 AS ok
       FROM boletos b
       INNER JOIN ordenes o ON o.id = b.${orderCol}
       ${parts.joinEz}
       WHERE b.${userCol} = ?
         AND ${parts.whereSql}
         AND o.estado IN ('pagado', 'completada')
         AND b.estado NOT IN ('reembolsado', 'reservado', 'cancelado')
         AND EXISTS (
           SELECT 1 FROM pagos p
           WHERE p.${pOrder} = o.id AND p.estado = 'aprobado'
         )
       LIMIT 1`,
      [userId, ...parts.params]
    );
    return Boolean(rows[0]);
  } catch (e) {
    if (isMissingTable(e) || e.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

/** Orden pagada + boleto enlazado; reconoce evento en boleto o en orden (o por zona). */
async function hasPaidOrderTicketLenient(userId, eventId) {
  try {
    const { orderCol, userCol, eventCol } = await resolveBoletosJoinColumns();
    const ord = await resolveOrdenColumnsForReviews();
    if (!orderCol || !userCol || !eventCol) return false;
    const parts = buildEventMatchSqlParts(ord, eventCol, eventId);
    const rows = await query(
      `SELECT 1 AS ok
       FROM boletos b
       INNER JOIN ordenes o ON o.id = b.${orderCol}
       ${parts.joinEz}
       WHERE b.${userCol} = ?
         AND ${parts.whereSql}
         AND ${PAID_ORDEN_SQL}
       LIMIT 1`,
      [userId, ...parts.params]
    );
    return Boolean(rows[0]);
  } catch (e) {
    if (isMissingTable(e) || e.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

/**
 * Solo cuenta órdenes pagadas ligadas al evento (sin fila en boletos o datos inconsistentes).
 * Uso: rol `pruebas` para QA.
 */
async function hasPaidOrdenForEventPruebas(userId, eventId) {
  try {
    const ord = await resolveOrdenColumnsForReviews();
    if (!ord.userCol) return false;
    const eid = Number(eventId);
    if (!Number.isFinite(eid) || eid < 1) return false;

    if (ord.eventCol && ord.zonaCol) {
      try {
        const rows = await query(
          `SELECT 1 AS ok
           FROM ordenes o
           LEFT JOIN evento_zonas ez ON ez.id = o.${ord.zonaCol}
           WHERE o.${ord.userCol} = ?
             AND (o.${ord.eventCol} = ? OR ez.idevento = ?)
             AND ${PAID_ORDEN_SQL}
           LIMIT 1`,
          [userId, eid, eid]
        );
        return Boolean(rows[0]);
      } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR' || isMissingTable(err)) {
          /* Sin tabla zonas o columnas distintas: sigue intento simple */
        } else {
          throw err;
        }
      }
    }

    if (ord.eventCol) {
      const rows = await query(
        `SELECT 1 AS ok
         FROM ordenes o
         WHERE o.${ord.userCol} = ?
           AND o.${ord.eventCol} = ?
           AND ${PAID_ORDEN_SQL}
         LIMIT 1`,
        [userId, eid]
      );
      return Boolean(rows[0]);
    }
    return false;
  } catch (e) {
    if (isMissingTable(e) || e.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

async function findByUserAndEvent(userId, eventId) {
  try {
    const rows = await query(
      `SELECT id, idevento, idusuario, estrellas, comentario, oculto, creado_en
       FROM evento_resenas
       WHERE idusuario = ? AND idevento = ?
       LIMIT 1`,
      [userId, eventId]
    );
    return rows[0] || null;
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}

/** True solo si existe la tabla y es consultable (para habilitar el formulario sin fallar después). */
async function reviewsSchemaReady() {
  try {
    await query(`SELECT 1 FROM evento_resenas LIMIT 1`);
    return true;
  } catch (e) {
    if (isMissingTable(e)) return false;
    throw e;
  }
}

async function listPublicByEvent(eventId) {
  try {
    const rows = await query(
      `SELECT r.id, r.estrellas, r.comentario, r.creado_en,
              u.nombre AS autor_nombre, u.apellido AS autor_apellido
       FROM evento_resenas r
       INNER JOIN usuarios u ON u.id = r.idusuario
       WHERE r.idevento = ? AND r.oculto = 0
       ORDER BY r.creado_en DESC`,
      [eventId]
    );
    return rows.map((row) => ({
      id: row.id,
      estrellas: Number(row.estrellas),
      comentario: row.comentario || null,
      creado_en: row.creado_en,
      autor: displayAuthor(row.autor_nombre, row.autor_apellido),
    }));
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

async function aggregatePublicByEvent(eventId) {
  try {
    const rows = await query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(AVG(estrellas), 0) AS promedio
       FROM evento_resenas
       WHERE idevento = ? AND oculto = 0`,
      [eventId]
    );
    const r = rows[0] || {};
    const total = Number(r.total) || 0;
    const raw = Number(r.promedio);
    return {
      total,
      promedio: total > 0 ? Math.round(raw * 10) / 10 : null,
    };
  } catch (e) {
    if (isMissingTable(e)) return { total: 0, promedio: null };
    throw e;
  }
}

async function createReview({ userId, eventId, estrellas, comentario }) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO evento_resenas (idevento, idusuario, estrellas, comentario)
     VALUES (?, ?, ?, ?)`,
    [eventId, userId, estrellas, comentario]
  );
  return result.insertId;
}

async function listAllForAdmin({ page, limit, soloVisibles }) {
  const offset = (page - 1) * limit;
  const where = [];
  const params = [];
  if (soloVisibles === '1' || soloVisibles === 'true') {
    where.push('r.oculto = 0');
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRows = await query(
    `SELECT COUNT(*) AS c FROM evento_resenas r ${whereSql}`,
    params
  );
  const total = Number(countRows[0]?.c) || 0;

  const rows = await query(
    `SELECT r.id, r.idevento, r.idusuario, r.estrellas, r.comentario, r.oculto, r.creado_en,
            e.titulo AS evento_titulo,
            u.email AS usuario_email,
            u.nombre AS usuario_nombre,
            u.apellido AS usuario_apellido
     FROM evento_resenas r
     INNER JOIN eventos e ON e.id = r.idevento
     INNER JOIN usuarios u ON u.id = r.idusuario
     ${whereSql}
     ORDER BY r.creado_en DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { total, items: rows };
}

async function setOculto(id, oculto) {
  const pool = getPool();
  const [r] = await pool.execute(`UPDATE evento_resenas SET oculto = ? WHERE id = ?`, [oculto ? 1 : 0, id]);
  return r.affectedRows === 1;
}

async function removeById(id) {
  const pool = getPool();
  const [r] = await pool.execute(`DELETE FROM evento_resenas WHERE id = ?`, [id]);
  return r.affectedRows === 1;
}

module.exports = {
  isMissingTable,
  hasApprovedTicketForEvent,
  hasPaidOrderTicketLenient,
  hasPaidOrdenForEventPruebas,
  reviewsSchemaReady,
  findByUserAndEvent,
  listPublicByEvent,
  aggregatePublicByEvent,
  createReview,
  listAllForAdmin,
  setOculto,
  removeById,
};
