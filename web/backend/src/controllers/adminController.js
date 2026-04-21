const adminUserModel = require('../models/adminUserModel');
const userModel = require('../models/userModel');
const { parsePositiveIntParam } = require('../utils/validation');

function isMissingAdminSchema(err) {
  return Boolean(err && (err.code === 'ER_BAD_FIELD_ERROR' || Number(err.errno) === 1054));
}

function isMissingAuditTable(err) {
  return Boolean(err && (err.code === 'ER_NO_SUCH_TABLE' || Number(err.errno) === 1146));
}

async function listUsers(req, res, next) {
  try {
    const pageRaw = req.query.page != null ? Number(req.query.page) : 1;
    const limitRaw = req.query.limit != null ? Number(req.query.limit) : 20;
    const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const rolParam = typeof req.query.rol === 'string' ? req.query.rol.trim() : '';
    const rol = adminUserModel.ROLES.includes(rolParam) ? rolParam : null;

    const { rows, total } = await adminUserModel.listUsersForAdmin({ page, limit, q, rol });
    return res.json({
      ok: true,
      usuarios: rows,
      total,
      page,
      limit,
    });
  } catch (err) {
    if (isMissingAdminSchema(err)) {
      return res.status(503).json({
        ok: false,
        error:
          'Faltan columnas en usuarios (activo, sesión). Ejecuta database/schema_admin_fase0_fase1.sql en MySQL.',
      });
    }
    return next(err);
  }
}

async function patchUser(req, res, next) {
  try {
    const targetId = parsePositiveIntParam(req.params.id);
    if (!targetId) {
      return res.status(400).json({ ok: false, error: 'ID de usuario inválido' });
    }

    const adminId = Number(req.user.id);
    if (targetId === adminId) {
      if (Object.prototype.hasOwnProperty.call(req.body, 'activo')) {
        const a = req.body.activo;
        const off = a === false || a === 0 || a === '0';
        if (off) {
          return res.status(400).json({ ok: false, error: 'No puedes suspender tu propia cuenta.' });
        }
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'rol') && req.body.rol !== 'admin') {
        return res.status(400).json({ ok: false, error: 'No puedes quitarte el rol de administrador a ti mismo.' });
      }
    }

    const target = await adminUserModel.findAdminRow(targetId);
    if (!target) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const patch = {};
    if (Object.prototype.hasOwnProperty.call(req.body, 'rol')) {
      const r = String(req.body.rol || '').trim();
      if (!adminUserModel.ROLES.includes(r)) {
        return res.status(400).json({ ok: false, error: 'Rol inválido' });
      }
      patch.rol = r;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'activo')) {
      const a = req.body.activo;
      const on = a === true || a === 1 || a === '1';
      patch.activo = on ? 1 : 0;
    }

    if (patch.rol === undefined && patch.activo === undefined) {
      return res.status(400).json({ ok: false, error: 'Envía al menos rol o activo para actualizar.' });
    }

    const wasActiveAdmin = target.rol === 'admin' && Number(target.activo) === 1;
    const removesActiveAdmin =
      wasActiveAdmin &&
      ((patch.rol !== undefined && patch.rol !== 'admin') || (patch.activo !== undefined && patch.activo === 0));

    if (removesActiveAdmin) {
      const n = await adminUserModel.countActiveAdmins();
      if (n <= 1) {
        return res.status(400).json({
          ok: false,
          error: 'No puedes quitar o suspender el único administrador activo de la plataforma.',
        });
      }
    }

    const detalle = JSON.stringify({
      antes: { rol: target.rol, activo: Number(target.activo) === 1 ? 1 : 0 },
      despues: {
        rol: patch.rol !== undefined ? patch.rol : target.rol,
        activo:
          patch.activo !== undefined
            ? patch.activo
            : Number(target.activo) === 1
              ? 1
              : 0,
      },
    });

    const result = await adminUserModel.updateUserByAdmin(
      targetId,
      patch,
      adminId,
      { accion: 'usuario_actualizado', detalle }
    );

    if (!result.ok) {
      if (result.reason === 'not_found') {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      }
      return res.status(400).json({ ok: false, error: 'No se pudo actualizar' });
    }

    const updated = await userModel.findById(targetId);
    return res.json({
      ok: true,
      usuario: {
        id: updated.id,
        nombre: updated.nombre,
        apellido: updated.apellido,
        email: updated.email,
        rol: updated.rol,
        activo: Number(updated.activo) === 1 ? 1 : 0,
        fecha_registro: updated.fecha_registro,
        ultimo_acceso_at: updated.ultimo_acceso_at,
        ultimo_login_metodo: updated.ultimo_login_metodo,
        tiene_google: Boolean(updated.google_id && String(updated.google_id).trim()),
      },
    });
  } catch (err) {
    if (isMissingAdminSchema(err)) {
      return res.status(503).json({
        ok: false,
        error:
          'Faltan columnas en usuarios. Ejecuta database/schema_admin_fase0_fase1.sql en MySQL.',
      });
    }
    if (isMissingAuditTable(err)) {
      return res.status(503).json({
        ok: false,
        error: 'Falta la tabla admin_usuario_auditoria. Ejecuta database/schema_admin_fase0_fase1.sql.',
      });
    }
    return next(err);
  }
}

module.exports = {
  listUsers,
  patchUser,
};
