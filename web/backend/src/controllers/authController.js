const crypto = require('crypto');
const { validationResult } = require('express-validator');
const userModel = require('../models/userModel');
const passwordResetModel = require('../models/passwordResetModel');
const { sendPasswordResetCode } = require('../services/mailService');
const { signAccessToken, signPasswordResetToken, verifyPasswordResetToken } = require('../utils/jwt');

const ACCOUNT_SUSPENDED_MSG =
  'Tu cuenta está suspendida. Si crees que es un error, contacta al soporte de Ticket Rivals.';

function buildTokenPayload(userRow) {
  return {
    sub: userRow.id,
    rol: userRow.rol,
    email: userRow.email,
  };
}

/** Solo cuenta como perfil listo el valor explícito 1 (MySQL puede devolver número, string, BigInt o Buffer). */
function needsProfileFlag(userRow) {
  if (!userRow) return false;
  const p = userRow.perfil_completado;
  if (p === true || p === 1 || p === '1') return false;
  if (typeof p === 'bigint') return p !== 1n;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer?.(p) && p.length > 0) {
    return p[0] !== 1;
  }
  const n = Number(p);
  if (Number.isFinite(n) && n === 1) return false;
  return true;
}

async function register(req, res, next) {
  try {
    if (process.env.ALLOW_LOCAL_REGISTER !== 'true') {
      return res.status(403).json({
        ok: false,
        error: 'El registro de nuevas cuentas es solo con Google. (ALLOW_LOCAL_REGISTER=true solo para pruebas)',
      });
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    const { nombre, apellido, email, password, pais } = req.body;
    const existing = await userModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ ok: false, error: 'El correo ya está registrado' });
    }
    const user = await userModel.createLocalUser({
      nombre,
      apellido,
      email,
      password,
      pais,
      rol: 'usuario',
    });
    try {
      await userModel.recordSuccessfulLogin(user.id, 'password');
    } catch {
      /* ignorar si aún no hay columnas de sesión */
    }
    const token = signAccessToken(buildTokenPayload(user));
    return res.status(201).json({
      ok: true,
      token,
      user: userModel.toPublicUser(user),
      needsProfile: needsProfileFlag(user),
    });
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    const { email, password } = req.body;
    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }
    if (!userModel.isAccountActive(user)) {
      return res.status(403).json({ ok: false, error: ACCOUNT_SUSPENDED_MSG });
    }
    const passwordOk = await userModel.verifyPassword(user, password);
    if (!passwordOk) {
      const googleAccount = Boolean(user.google_id);
      const error = googleAccount
        ? 'Contraseña incorrecta. Si entraste antes con Google, la clave de Ticket Rivals es la que elegiste en “Completar perfil” (no es la contraseña de Gmail). Si no completaste ese paso, usa “Continuar con Google”.'
        : 'Credenciales inválidas';
      return res.status(401).json({ ok: false, error });
    }
    const full = await userModel.findById(user.id);
    try {
      await userModel.recordSuccessfulLogin(user.id, 'password');
    } catch {
      /* columnas de sesión opcionales hasta migrar */
    }
    const token = signAccessToken(buildTokenPayload(full));
    return res.json({
      ok: true,
      token,
      user: userModel.toPublicUser(full),
      needsProfile: needsProfileFlag(full),
    });
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await userModel.findById(Number(req.user.id));
    if (!user) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    if (!userModel.isAccountActive(user)) {
      return res.status(403).json({ ok: false, error: ACCOUNT_SUSPENDED_MSG });
    }
    return res.json({
      ok: true,
      user: userModel.toPublicUser(user),
      needsProfile: needsProfileFlag(user),
    });
  } catch (err) {
    return next(err);
  }
}

async function setOauthPassword(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    const row = await userModel.findById(Number(req.user.id));
    if (!row) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    if (!userModel.isAccountActive(row)) {
      return res.status(403).json({ ok: false, error: ACCOUNT_SUSPENDED_MSG });
    }
    if (!needsProfileFlag(row)) {
      return res.status(400).json({ ok: false, error: 'El perfil ya está completo' });
    }
    const { password } = req.body;
    const updated = await userModel.setOauthLocalPassword(row.id, password);
    if (!updated) {
      return res.status(400).json({ ok: false, error: 'No se pudo actualizar la contraseña' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

async function completeProfile(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    const row = await userModel.findById(Number(req.user.id));
    if (!row) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    if (!userModel.isAccountActive(row)) {
      return res.status(403).json({ ok: false, error: ACCOUNT_SUSPENDED_MSG });
    }
    if (Number(row.perfil_completado) === 1) {
      return res.status(400).json({ ok: false, error: 'El perfil ya está completo' });
    }
    const { nombre, apellido, telefono, pais, password } = req.body;
    const updated = await userModel.completeProfile(row.id, {
      nombre,
      apellido,
      telefono,
      pais,
      password,
    });
    if (!updated || Number(updated.perfil_completado) !== 1) {
      return res.status(400).json({ ok: false, error: 'No se pudo guardar el perfil' });
    }
    const token = signAccessToken(buildTokenPayload(updated));
    return res.json({
      ok: true,
      token,
      user: userModel.toPublicUser(updated),
      needsProfile: false,
    });
  } catch (err) {
    return next(err);
  }
}

const FORGOT_PASSWORD_RESPONSE = {
  ok: true,
  message:
    'Si existe una cuenta con ese correo, recibirás un código de 6 dígitos en los próximos minutos. Revisa también la carpeta de spam.',
};

function isMissingPasswordResetTable(err) {
  return Boolean(err && (err.code === 'ER_NO_SUCH_TABLE' || Number(err.errno) === 1146));
}

function forgotPasswordVerboseLog() {
  return process.env.FORGOT_PW_DEBUG === '1' || process.env.NODE_ENV !== 'production';
}

async function forgotPassword(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    const { email } = req.body;
    const vLog = forgotPasswordVerboseLog();
    if (vLog) {
      console.log('[forgotPassword] Correo recibido (ya normalizado por la API):', email);
    }
    let user;
    try {
      user = await userModel.findByEmail(email);
    } catch (lookupErr) {
      console.error('[forgotPassword] Error al buscar usuario (se responde genérico por privacidad):', lookupErr.message || lookupErr);
      return res.json(FORGOT_PASSWORD_RESPONSE);
    }
    if (!user) {
      if (vLog) {
        console.warn(
          '[forgotPassword] No hay fila en usuarios para ese correo (ni equivalente Gmail). No se llama a SMTP. Comprueba en MySQL: SELECT email FROM usuarios WHERE email LIKE "%...";'
        );
      }
    }
    if (user) {
      const destino = String(user.email || '').trim();
      if (vLog) {
        console.log('[forgotPassword] Usuario encontrado id=', user.id, '| destino SMTP:', JSON.stringify(destino));
      }
      try {
        const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
        await passwordResetModel.replaceCodeForUser(user.id, code);
        if (vLog) {
          console.log('[forgotPassword] Código generado en BD; intentando enviar correo…');
        }
        try {
          await sendPasswordResetCode(destino, code);
          if (vLog) {
            console.log(
              '[forgotPassword] sendPasswordResetCode OK. Si no ves el mensaje: spam, pestaña Promociones y búsqueda "Ticket Rivals".'
            );
          }
        } catch (mailErr) {
          try {
            await passwordResetModel.deleteAllForUser(user.id);
          } catch (delErr) {
            console.error('[forgotPassword] No se pudo borrar el código tras fallo SMTP:', delErr.message || delErr);
          }
          console.error(
            '[forgotPassword] El correo no se pudo enviar; el código se anuló. Revisa SMTP en .env y los logs anteriores [mail].'
          );
          console.error('[forgotPassword] Detalle:', mailErr.message || mailErr);
        }
      } catch (err) {
        if (isMissingPasswordResetTable(err)) {
          console.error(
            '[forgotPassword] Falta la tabla password_reset_codes. Ejecuta database/schema_password_reset.sql en MySQL.'
          );
        } else {
          console.error('[forgotPassword]', err.message || err);
        }
      }
    }
    return res.json(FORGOT_PASSWORD_RESPONSE);
  } catch (err) {
    return next(err);
  }
}

/**
 * Valida el código del correo (único uso) y devuelve resetToken JWT para el paso de nueva contraseña.
 */
async function verifyResetCode(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    const { email, code } = req.body;
    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(400).json({ ok: false, error: 'Código incorrecto o expirado' });
    }
    const ok = await passwordResetModel.verifyAndConsume(user.id, String(code).trim());
    if (!ok) {
      return res.status(400).json({ ok: false, error: 'Código incorrecto o expirado' });
    }
    let resetToken;
    try {
      resetToken = signPasswordResetToken(user.id);
    } catch (e) {
      console.error('[verifyResetCode]', e.message);
      return res.status(500).json({ ok: false, error: 'Error al generar la sesión de recuperación' });
    }
    return res.json({ ok: true, resetToken });
  } catch (err) {
    if (isMissingPasswordResetTable(err)) {
      console.error(
        '[verifyResetCode] Falta la tabla password_reset_codes. Ejecuta database/schema_password_reset.sql en MySQL.'
      );
      return res.status(503).json({
        ok: false,
        error:
          'Recuperación por código no disponible en el servidor (falta tabla en la base de datos). Ejecuta database/schema_password_reset.sql en MySQL o contacta al administrador.',
      });
    }
    return next(err);
  }
}

async function resetPasswordWithCode(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ ok: false, error: errors.array()[0].msg });
    }
    const { resetToken, newPassword } = req.body;
    let userId;
    try {
      userId = verifyPasswordResetToken(resetToken);
    } catch {
      return res.status(400).json({
        ok: false,
        error:
          'La sesión de recuperación expiró o no es válida. Vuelve a solicitar un código desde «Olvidé mi contraseña».',
      });
    }
    const updated = await userModel.resetPasswordWithPlain(userId, newPassword);
    if (!updated) {
      return res.status(400).json({ ok: false, error: 'No se pudo actualizar la contraseña' });
    }
    return res.json({
      ok: true,
      message: 'Contraseña actualizada. Ya puedes iniciar sesión con tu correo y la nueva clave.',
    });
  } catch (err) {
    return next(err);
  }
}

function destroySessionLogout(req, res, next) {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((destroyErr) => {
      if (destroyErr) return next(destroyErr);
      const isProd = process.env.NODE_ENV === 'production';
      res.clearCookie('connect.sid', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
      });
      return res.json({ ok: true });
    });
  });
}

module.exports = {
  register,
  login,
  me,
  setOauthPassword,
  completeProfile,
  forgotPassword,
  verifyResetCode,
  resetPasswordWithCode,
  buildTokenPayload,
  destroySessionLogout,
  needsProfileFlag,
};
