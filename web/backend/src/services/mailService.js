const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

/** Contraseña de aplicaciones de Gmail suele venir con espacios; SMTP espera 16 caracteres seguidos. */
function normalizeSmtpPassword(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, '').trim();
}

function smtpHostSet() {
  return Boolean(process.env.SMTP_HOST?.trim());
}

/**
 * Estado para el cliente (GET /api/auth/providers) y comprobaciones internas.
 * No expone secretos.
 */
function getEmailDeliveryStatus() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = normalizeSmtpPassword(process.env.SMTP_PASS);

  if (!host) {
    return {
      canSendEmail: false,
      mode: 'console',
      hint:
        'El servidor no tiene SMTP_HOST en .env: el código de recuperación no se envía por correo; aparece solo en la consola donde corre el backend (npm run dev). Añade SMTP_HOST, SMTP_USER y SMTP_PASS y reinicia.',
    };
  }
  if (!user || !pass) {
    return {
      canSendEmail: false,
      mode: 'misconfigured',
      hint:
        'SMTP_HOST está definido pero faltan SMTP_USER o SMTP_PASS. Con Gmail: activa verificación en 2 pasos y crea una «contraseña de aplicaciones»; pégala en SMTP_PASS (puede ir sin espacios). Reinicia el backend tras guardar .env.',
    };
  }
  return {
    canSendEmail: true,
    mode: 'smtp',
    hint: null,
  };
}

function logEmailConfigOnStartup() {
  const s = getEmailDeliveryStatus();
  if (s.mode === 'console') {
    console.warn('[mail]', s.hint);
  } else if (s.mode === 'misconfigured') {
    console.warn('[mail]', s.hint);
  } else {
    console.log(
      '[mail] Recuperación por correo: SMTP configurado. Si no llegan mensajes, revisa carpeta spam y SMTP_DEBUG=true en .env.'
    );
  }
}

function buildTransport() {
  const host = process.env.SMTP_HOST.trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = normalizeSmtpPassword(process.env.SMTP_PASS);

  const debug = process.env.SMTP_DEBUG === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth:
      user && pass
        ? {
            user,
            pass,
          }
        : undefined,
    requireTLS: !secure && port === 587,
    tls: {
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    logger: debug,
    debug,
  });
}

/**
 * Envía el código de recuperación. Sin SMTP_HOST → solo consola.
 * Con SMTP_HOST pero sin usuario/clave → lanza error (el controlador anula el código en BD).
 */
async function sendPasswordResetCode(toEmail, code) {
  const status = getEmailDeliveryStatus();

  if (status.mode === 'console') {
    console.warn(`[mail] (solo consola) Código de recuperación para ${toEmail}: ${code}`);
    return { ok: true, mode: 'console' };
  }

  if (!status.canSendEmail) {
    const msg =
      'SMTP incompleto: con SMTP_HOST debes definir SMTP_USER y SMTP_PASS en .env (reinicia el backend).';
    console.error('[mail]', msg);
    throw new Error(msg);
  }

  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || 'noreply@ticketrivals.local';
  const subject = 'Ticket Rivals — código para restablecer contraseña';
  const text = [
    'Hola,',
    '',
    `Tu código de verificación es: ${code}`,
    '',
    'Caduca en 15 minutos. Si no solicitaste restablecer la contraseña, ignora este mensaje.',
    '',
    '— Ticket Rivals',
  ].join('\n');

  const html = `
    <p>Hola,</p>
    <p>Tu código de verificación es:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
    <p>Caduca en <strong>15 minutos</strong>. Si no solicitaste restablecer la contraseña, ignora este mensaje.</p>
    <p>— Ticket Rivals</p>
  `;

  const transporter = buildTransport();

  if (process.env.SMTP_VERIFY === 'true') {
    try {
      await transporter.verify();
      console.log('[mail] SMTP verify OK');
    } catch (vErr) {
      console.error('[mail] SMTP verify falló (revisa usuario, contraseña y puerto):', vErr.message);
      throw vErr;
    }
  }

  const to = String(toEmail || '').trim();
  if (!to) {
    throw new Error('Destinatario de correo vacío');
  }

  const authUser = process.env.SMTP_USER?.trim();
  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
      // Gmail a veces es estricto con MAIL FROM vs cuenta autenticada
      envelope: authUser ? { from: authUser, to } : undefined,
    });
    console.log('[mail] Correo de recuperación enviado. messageId=', info.messageId, 'to=', to);
    return { ok: true, mode: 'smtp', messageId: info.messageId };
  } catch (err) {
    console.error('[mail] Fallo al enviar a', to, ':', err.message);
    if (err.response) {
      console.error('[mail] Respuesta del servidor SMTP:', err.response);
    }
    if (err.code) {
      console.error('[mail] Código:', err.code);
    }
    throw err;
  }
}

/**
 * Diagnóstico manual: `node scripts/test-smtp.js` o con correo para enviar prueba real.
 * @param {{ sendTo?: string }} opts - si `sendTo` está definido, envía un correo de prueba.
 */
async function testSmtpConnection(opts = {}) {
  const status = getEmailDeliveryStatus();
  if (!status.canSendEmail) {
    const err = new Error(status.hint || 'SMTP no configurado');
    err.deliveryStatus = status;
    throw err;
  }
  const transporter = buildTransport();
  await transporter.verify();
  const result = { ok: true, verify: true };
  if (opts.sendTo) {
    const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();
    const info = await transporter.sendMail({
      from,
      to: opts.sendTo,
      subject: 'Ticket Rivals — prueba de correo',
      text: 'Si recibes este mensaje, el envío SMTP está bien configurado.',
    });
    result.messageId = info.messageId;
    result.sentTo = opts.sendTo;
  }
  return result;
}

/**
 * Aviso masivo de cancelación de evento (Fase 3). Sin SMTP → solo consola con resumen.
 * @param {{ to: string[], eventTitle: string, motivo: string|null }} opts
 */
async function notifyEventCancelledPurchasers(opts) {
  const to = Array.isArray(opts.to) ? [...new Set(opts.to.map((e) => String(e || '').trim()).filter(Boolean))] : [];
  const eventTitle = String(opts.eventTitle || 'Evento').slice(0, 500);
  const motivo = opts.motivo != null ? String(opts.motivo).trim().slice(0, 2000) : '';
  const status = getEmailDeliveryStatus();
  const bodyText = [
    'Hola,',
    '',
    `Te informamos que el evento «${eventTitle}» ha sido cancelado por el organizador o la plataforma.`,
    motivo ? `Detalle: ${motivo}` : '',
    '',
    'Si ya realizaste un pago, revisa las políticas de reembolso o contacta al soporte de Ticket Rivals.',
    '',
    '— Ticket Rivals',
  ]
    .filter(Boolean)
    .join('\n');

  if (status.mode === 'console' || !status.canSendEmail) {
    console.warn(
      `[mail] (cancelación evento) «${eventTitle}» — ${to.length} destinatario(s). SMTP no envía; muestra consola.`
    );
    if (to.length) console.warn('[mail] Destinatarios:', to.join(', '));
    return { ok: true, mode: 'console', attempted: to.length };
  }

  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || 'noreply@ticketrivals.local';
  const subject = `Ticket Rivals — evento cancelado: ${eventTitle}`;
  const transporter = buildTransport();
  const authUser = process.env.SMTP_USER?.trim();
  let sent = 0;
  for (const email of to) {
    try {
      await transporter.sendMail({
        from,
        to: email,
        subject,
        text: bodyText,
        html: `<p>Hola,</p><p>El evento <strong>${eventTitle}</strong> ha sido cancelado.</p>${motivo ? `<p>${motivo}</p>` : ''}<p>— Ticket Rivals</p>`,
        envelope: authUser ? { from: authUser, to: email } : undefined,
      });
      sent += 1;
    } catch (e) {
      console.error('[mail] Fallo aviso cancelación a', email, e.message);
    }
  }
  return { ok: true, mode: 'smtp', sent };
}

function formatEventDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function frontendPublicUrl() {
  const front = String(process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (front) return front;
  return 'http://localhost:5173';
}

function buildQrPayload(_bundle, ticket) {
  const code = String(ticket?.codigo || '').trim();
  if (!code) return frontendPublicUrl();
  return `${frontendPublicUrl()}/boleto/${encodeURIComponent(code)}`;
}

async function buildQrAttachments(bundle) {
  const attachments = [];
  const tickets = Array.isArray(bundle?.tickets) ? bundle.tickets : [];
  for (const t of tickets) {
    if (!t?.codigo) continue;
    const cid = `tr-qr-${bundle.ordenId}-${t.id}@ticketrivals.local`;
    const pngDataUrl = await QRCode.toDataURL(buildQrPayload(bundle, t), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 360,
    });
    const base64 = String(pngDataUrl).split(',')[1] || '';
    attachments.push({
      filename: `${t.codigo}.png`,
      content: base64,
      encoding: 'base64',
      contentType: 'image/png',
      cid,
      ticketId: t.id,
    });
  }
  return attachments;
}

/**
 * Envía boletos con QR por correo al comprador.
 * Retorna modo "console" cuando SMTP no está operativo.
 */
async function sendPurchaseTicketsEmail(bundle) {
  if (!bundle || !bundle.ordenId) return { ok: false, skipped: true, reason: 'bundle_invalido' };
  const to = String(bundle.email || '').trim();
  const tickets = Array.isArray(bundle.tickets) ? bundle.tickets.filter((t) => t?.codigo) : [];
  if (!to || tickets.length === 0) {
    return { ok: false, skipped: true, reason: 'sin_destino_o_boletos' };
  }
  if (bundle.event && bundle.event.generarQrEmail === false) {
    return { ok: true, skipped: true, reason: 'evento_no_envia_qr' };
  }

  const status = getEmailDeliveryStatus();
  const eventTitle = String(bundle.event?.titulo || `Evento #${bundle.event?.id || ''}`).trim();
  const eventDate = formatEventDate(bundle.event?.fecha);
  const zoneName = bundle.zonaNombre ? String(bundle.zonaNombre) : null;

  const lines = [
    `Hola${bundle.compradorNombre ? ` ${bundle.compradorNombre}` : ''},`,
    '',
    `Tu pago de la orden #${bundle.ordenId} fue aprobado y tus boletos ya están listos.`,
    `Evento: ${eventTitle}`,
    eventDate ? `Fecha: ${eventDate}` : '',
    bundle.event?.ubicacion ? `Ubicación: ${bundle.event.ubicacion}` : '',
    zoneName ? `Zona: ${zoneName}` : '',
    '',
    'Boletos:',
    ...tickets.map((t, i) => {
      const seat = t.seatLabel ? ` · ${t.seatLabel}` : '';
      return `${i + 1}. ${t.codigo}${seat}`;
    }),
    '',
    bundle.event?.instruccionesCanje ? `Instrucciones: ${bundle.event.instruccionesCanje}` : '',
    'Cada QR enlaza a una página web con los datos del boleto (evento, zona, asiento y código).',
    'Adjuntamos y embebemos un QR por boleto para acceso/canje.',
    '',
    '— Ticket Rivals',
  ].filter(Boolean);

  if (!status.canSendEmail) {
    console.warn('[mail] (solo consola) Boletos emitidos para orden', bundle.ordenId, '→', to);
    console.warn(lines.join('\n'));
    return { ok: true, mode: 'console', attempted: tickets.length };
  }

  const qrAttachments = await buildQrAttachments(bundle);
  const byTicketCid = new Map(qrAttachments.map((a) => [a.ticketId, a.cid]));
  const htmlTickets = tickets
    .map((t, i) => {
      const seat = t.seatLabel ? ` · ${escapeHtml(t.seatLabel)}` : '';
      const cid = byTicketCid.get(t.id);
      return `
        <li style="margin-bottom:18px;">
          <div><strong>${i + 1}. ${escapeHtml(t.codigo)}</strong>${seat}</div>
          ${cid ? `<img alt="QR ${escapeHtml(t.codigo)}" src="cid:${cid}" width="180" height="180" style="margin-top:8px;border:1px solid #e5e7eb;border-radius:8px;" />` : ''}
        </li>
      `;
    })
    .join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#111827;">
      <p>Hola${bundle.compradorNombre ? ` ${escapeHtml(bundle.compradorNombre)}` : ''},</p>
      <p>Tu pago de la orden <strong>#${bundle.ordenId}</strong> fue aprobado y tus boletos ya están listos.</p>
      <p>
        <strong>Evento:</strong> ${escapeHtml(eventTitle)}<br/>
        ${eventDate ? `<strong>Fecha:</strong> ${escapeHtml(eventDate)}<br/>` : ''}
        ${bundle.event?.ubicacion ? `<strong>Ubicación:</strong> ${escapeHtml(bundle.event.ubicacion)}<br/>` : ''}
        ${zoneName ? `<strong>Zona:</strong> ${escapeHtml(zoneName)}<br/>` : ''}
      </p>
      <p><strong>Boletos y QR:</strong></p>
      <p style="font-size:13px;color:#4b5563;margin-bottom:12px;">
        Al escanear el QR se abre el boleto en la web con la misma información (evento, asiento, código).
      </p>
      <ol>${htmlTickets}</ol>
      ${
        bundle.event?.instruccionesCanje
          ? `<p><strong>Instrucciones:</strong> ${escapeHtml(bundle.event.instruccionesCanje)}</p>`
          : ''
      }
      <p>— Ticket Rivals</p>
    </div>
  `;

  const transporter = buildTransport();
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || 'noreply@ticketrivals.local';
  const authUser = process.env.SMTP_USER?.trim();
  const info = await transporter.sendMail({
    from,
    to,
    subject: `Ticket Rivals — Tus boletos (${eventTitle})`,
    text: lines.join('\n'),
    html,
    attachments: qrAttachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      encoding: a.encoding,
      contentType: a.contentType,
      cid: a.cid,
    })),
    envelope: authUser ? { from: authUser, to } : undefined,
  });
  console.log('[mail] Boletos enviados. order=', bundle.ordenId, 'to=', to, 'messageId=', info.messageId);
  return { ok: true, mode: 'smtp', sent: tickets.length, messageId: info.messageId };
}

module.exports = {
  sendPasswordResetCode,
  sendPurchaseTicketsEmail,
  notifyEventCancelledPurchasers,
  getEmailDeliveryStatus,
  logEmailConfigOnStartup,
  testSmtpConnection,
  smtpConfigured: smtpHostSet,
};
