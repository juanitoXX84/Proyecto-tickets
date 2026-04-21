const { randomUUID } = require('crypto');
const { MercadoPagoConfig, Preference, Payment, PaymentRefund } = require('mercadopago');

/** Quita BOM/comillas típicas al pegar desde el panel de Mercado Pago → .env */
function readMercadoAccessToken() {
  let t = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (t == null || t === undefined) return '';
  t = String(t).replace(/^\uFEFF/, '').trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function isConfigured() {
  return Boolean(readMercadoAccessToken());
}

function getClientConfig() {
  const accessToken = readMercadoAccessToken();
  if (!accessToken) {
    throw Object.assign(new Error('MERCADOPAGO_ACCESS_TOKEN no configurado'), { status: 503 });
  }
  // Error común: pegar la Public Key o un token recortado.
  if (looksLikeInvalidServerToken(accessToken)) {
    throw Object.assign(
      new Error(
        'MERCADOPAGO_ACCESS_TOKEN parece inválido o incompleto. Usa el Access Token (no Public Key) desde el panel de Mercado Pago.'
      ),
      { status: 503 }
    );
  }
  return new MercadoPagoConfig({ accessToken });
}

function publicBaseUrl() {
  return (
    process.env.API_PUBLIC_URL?.replace(/\/$/, '') ||
    `http://127.0.0.1:${Number(process.env.PORT) || 3001}`
  );
}

/** MP suele rechazar preferencias si notification_url es http://localhost (políticas). Solo HTTPS público. */
function shouldSendNotificationUrl(base) {
  if (process.env.MERCADOPAGO_FORCE_NOTIFICATION_URL === 'true') return true;
  return /^https:\/\//i.test(String(base || '').trim());
}

function frontendBaseUrl() {
  return process.env.FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:5173';
}

function isPublicHttpUrl(url) {
  const raw = String(url || '').trim();
  if (!/^https?:\/\//i.test(raw)) return false;
  return !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(raw);
}

function webhookPathToken() {
  const t = process.env.MERCADOPAGO_WEBHOOK_TOKEN?.trim();
  if (!t) {
    throw Object.assign(
      new Error('Define MERCADOPAGO_WEBHOOK_TOKEN (cadena secreta larga) para la URL del webhook'),
      { status: 503 }
    );
  }
  return t;
}

/** Moneda del ítem (ISO 4217). Debe coincidir con el país de tu cuenta/credenciales de MP. */
function preferenceCurrencyId() {
  const raw = process.env.MERCADOPAGO_CURRENCY_ID?.trim();
  if (!raw) return 'MXN';
  const c = raw.toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return 'MXN';
  return c;
}

function looksLikeInvalidServerToken(token) {
  const t = String(token || '').trim();
  if (!t) return true;
  // Access tokens válidos suelen ser largos. Un UUID simple casi siempre es clave equivocada.
  const uuidLike = /^APP_(?:USR|TEST)-[0-9a-fA-F-]{30,40}$/.test(t);
  return t.length < 50 || uuidLike;
}

function toPositiveMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function toSafeQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const qty = Math.floor(n);
  if (qty < 1 || qty > 20) return null;
  return qty;
}

function sanitizePayerEmail(email) {
  const raw = String(email || '').trim().toLowerCase();
  if (!raw) return null;
  // Validación básica para no enviar formatos claramente inválidos.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return null;
  return raw.slice(0, 256);
}

/**
 * Por defecto NO enviamos payer.email: Mercado Pago suele mostrar antes tarjeta / otros medios y evita
 * que te obligue a cuenta con saldo insuficiente. Si quieres prellenar correo (a veces ayuda aprobación),
 * pon MERCADOPAGO_CHECKOUT_INCLUDE_PAYER_EMAIL=true en .env.
 */
function checkoutIncludePayerEmail() {
  const v = process.env.MERCADOPAGO_CHECKOUT_INCLUDE_PAYER_EMAIL?.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function checkoutMaxInstallments() {
  const n = Number(process.env.MERCADOPAGO_INSTALLMENTS_MAX ?? 12);
  if (!Number.isFinite(n) || n < 1) return 12;
  return Math.min(24, Math.floor(n));
}

/** El SDK o intermediarios pueden envolver la respuesta REST. */
function unwrapPreferenceCreateResult(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.body && typeof raw.body === 'object') return raw.body;
  if (raw.response && typeof raw.response === 'object') return raw.response;
  return raw;
}

/**
 * MP puede devolver dos URLs:
 * - `init_point`: checkout productivo (cobro real).
 * - `sandbox_init_point`: checkout de simulación.
 *
 * Política actual:
 * - Por defecto priorizamos `init_point` para evitar entrar accidentalmente a modo prueba.
 * - Solo usamos sandbox si el usuario lo fuerza por env (`MERCADOPAGO_CHECKOUT_REDIRECT_URL=sandbox`).
 */
function resolveCheckoutInitPoint(mpResult) {
  const r = unwrapPreferenceCreateResult(mpResult);
  const prod = r.init_point ?? r.initPoint;
  const sandbox = r.sandbox_init_point ?? r.sandboxInitPoint;

  const mode = (
    process.env.MERCADOPAGO_CHECKOUT_REDIRECT_URL || process.env.MERCADOPAGO_CHECKOUT_URL || ''
  )
    .trim()
    .toLowerCase();

  if (mode === 'production' || mode === 'prod' || mode === 'init_point') {
    return prod || null;
  }
  if (mode === 'sandbox' || mode === 'test') {
    return sandbox || prod;
  }

  return prod || sandbox || null;
}

function normalizePaymentId(paymentId) {
  if (paymentId == null) return null;
  const raw = String(paymentId).trim();
  if (!raw) return null;
  const m = raw.match(/(\d+)(?!.*\d)/);
  return m ? m[1] : null;
}

/**
 * @param {object} params
 * @param {number} params.ordenId
 * @param {string} params.tituloItem
 * @param {number} params.unitPrice
 * @param {number} params.cantidad
 * @param {string} params.payerEmail
 * @param {number|null} [params.singleLineTotal] Si viene, un ítem con quantity 1 y este total (mezcla de precios por asiento).
 */
async function createCheckoutPreference({
  ordenId,
  tituloItem,
  unitPrice,
  cantidad,
  payerEmail,
  singleLineTotal = null,
}) {
  const client = getClientConfig();
  const preference = new Preference(client);
  const base = publicBaseUrl();
  const front = frontendBaseUrl();
  const token = webhookPathToken();
  const notificationUrl = `${base}/api/payments/webhook/${encodeURIComponent(token)}`;
  const sendNotify = shouldSendNotificationUrl(base);
  const sendBackUrls = isPublicHttpUrl(front);
  if (!sendNotify && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[mp] notification_url omitida: API_PUBLIC_URL debe ser HTTPS (p. ej. ngrok). Sin eso MP a veces rechaza la preferencia; los webhooks no llegarán hasta configurar una URL pública HTTPS.'
    );
  }
  if (!sendBackUrls && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[mp] back_urls omitidas: FRONTEND_URL no es pública/valida para Mercado Pago. El checkout puede abrirse igual, pero sin redirección automática al volver.'
    );
  }

  if (!Number.isFinite(Number(ordenId)) || Number(ordenId) < 1) {
    throw Object.assign(new Error('ordenId inválido para crear preferencia'), { status: 400 });
  }

  const titleTrim = String(tituloItem || '').trim().slice(0, 256) || 'Entrada';
  const email = sanitizePayerEmail(payerEmail);
  const includePayer = checkoutIncludePayerEmail();

  let items;
  if (singleLineTotal != null) {
    const tot = toPositiveMoney(singleLineTotal);
    if (tot == null) {
      throw Object.assign(new Error('Total inválido para crear preferencia'), { status: 400 });
    }
    items = [
      {
        id: String(ordenId),
        title: titleTrim,
        quantity: 1,
        unit_price: tot,
        currency_id: preferenceCurrencyId(),
      },
    ];
  } else {
    const unit = toPositiveMoney(unitPrice);
    const qty = toSafeQuantity(cantidad);
    if (unit == null) {
      throw Object.assign(new Error('Precio inválido para crear preferencia'), { status: 400 });
    }
    if (qty == null) {
      throw Object.assign(new Error('Cantidad inválida para crear preferencia'), { status: 400 });
    }
    items = [
      {
        id: String(ordenId),
        title: titleTrim,
        quantity: qty,
        unit_price: unit,
        currency_id: preferenceCurrencyId(),
      },
    ];
  }

  /** No incluir la clave `payer` si no hace falta: algunos clientes serializan `undefined` y MP puede preidentificar al comprador. */
  const prefBody = {
    items,
    ...(includePayer && email ? { payer: { email } } : {}),
    payment_methods: {
      installments: checkoutMaxInstallments(),
    },
    external_reference: `tr-${ordenId}`,
    ...(sendNotify ? { notification_url: notificationUrl } : {}),
    ...(sendBackUrls
      ? {
          back_urls: {
            success: `${front}/checkout/retorno?status=success`,
            failure: `${front}/checkout/retorno?status=failure`,
            pending: `${front}/checkout/retorno?status=pending`,
          },
          auto_return: 'approved',
        }
      : {}),
    metadata: {
      orden_id: String(ordenId),
    },
  };

  const result = await preference.create({ body: prefBody });
  const unwrapped = unwrapPreferenceCreateResult(result);
  const prefId = unwrapped.id ?? result.id;
  const initPoint = resolveCheckoutInitPoint(result);
  if (!prefId || !initPoint) {
    throw Object.assign(new Error('Mercado Pago no devolvió init_point'), { status: 502, mp: result });
  }
  return { preferenceId: prefId, initPoint, raw: result };
}

function unwrapPaymentCreateResult(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  return raw.body ?? raw.response ?? raw;
}

/**
 * El SDK puede enviar la cabecera `X-Test-Token` en POST /payments (opción `testToken` del cliente Node).
 *
 * Importante: NO usar MERCADOPAGO_CHECKOUT_REDIRECT_URL=sandbox como señal: solo elige sandbox_init_point
 * en Checkout Pro; el Card Brick usa la Public Key y NO debe mezclarse con este criterio o MP responde
 * «Card Token not found» al buscar el token en otro entorno.
 *
 * - MERCADOPAGO_PAYMENT_TEST_TOKEN=false → no enviar cabecera.
 * - MERCADOPAGO_PAYMENT_TEST_TOKEN=true → enviar (tarjetas de prueba cuando MP pida esta cabecera).
 * - Sin override: APP_TEST- o Public Key TEST- (convención MP de credenciales de prueba).
 */
function shouldSendMercadoPaymentTestTokenHeader() {
  const explicit = process.env.MERCADOPAGO_PAYMENT_TEST_TOKEN?.trim().toLowerCase();
  if (explicit === 'false' || explicit === '0' || explicit === 'no') return false;
  if (explicit === 'true' || explicit === '1' || explicit === 'yes') return true;

  const at = readMercadoAccessToken();
  if (/^APP_TEST-/i.test(at)) return true;

  const pk = getPublicKey();
  if (pk && /^TEST-/i.test(pk)) return true;

  return false;
}

/** Formato devuelto por Card Payment Brick vía onSubmit (a veces anidado en `formData`). */
function normalizeCardBrickFormData(raw) {
  if (raw == null || typeof raw !== 'object') return {};
  let fd = raw;
  if (fd.formData && typeof fd.formData === 'object') {
    fd = fd.formData;
  }
  return fd;
}

/** Public Key del panel MP (segura para el frontend). Sin esto no hay Card Payment Brick embebido. */
function getPublicKey() {
  let k = process.env.MERCADOPAGO_PUBLIC_KEY;
  if (k == null || k === undefined) return null;
  k = String(k).replace(/^\uFEFF/, '').trim();
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  return k || null;
}

function buildPayerFromCardForm(formData, fallbackEmail) {
  const p = formData?.payer || {};
  const email = String(p.email || fallbackEmail || '').trim();
  const payer = { email };
  const id = p.identification;
  if (id && id.type && id.number != null && String(id.number).trim() !== '') {
    payer.identification = {
      type: String(id.type),
      number: String(id.number).replace(/\s/g, ''),
    };
  }
  const fn = p.firstName ?? p.first_name;
  const ln = p.lastName ?? p.last_name;
  if (fn) payer.first_name = String(fn).trim().slice(0, 256);
  if (ln) payer.last_name = String(ln).trim().slice(0, 256);
  return payer;
}

/**
 * Pago con tarjeta desde Card Payment Brick (PCI en MP; solo llega el token al backend).
 */
function shouldAttachPaymentNotificationUrl() {
  const v = process.env.MERCADOPAGO_PAYMENT_NOTIFICATION_URL?.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  return true;
}

async function createPaymentFromCardForm({
  ordenId,
  ordenTotal,
  formData,
  payerEmailFallback,
  mpPreferenceId = null,
}) {
  const fd = normalizeCardBrickFormData(formData || {});
  const token = fd.token ?? fd.card_token ?? fd.cardToken;
  if (!token || typeof token !== 'string') {
    throw Object.assign(new Error('Token de tarjeta ausente'), { status: 400 });
  }
  const pmId = fd.payment_method_id || fd.paymentMethodId;
  if (!pmId) {
    throw Object.assign(new Error('payment_method_id ausente'), { status: 400 });
  }

  const installments = Math.min(24, Math.max(1, Number(fd.installments) || 1));
  const amount = Math.round(Number(ordenTotal) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error('Monto de orden inválido'), { status: 400 });
  }

  const client = getClientConfig();
  const paymentApi = new Payment(client);
  const base = publicBaseUrl();
  const notifyPath = `${base}/api/payments/webhook/${encodeURIComponent(webhookPathToken())}`;
  const sendNotify = shouldSendNotificationUrl(base);

  const metadata = { orden_id: String(ordenId) };
  if (mpPreferenceId != null && String(mpPreferenceId).trim() !== '') {
    metadata.mp_preference_id = String(mpPreferenceId).trim();
  }

  const body = {
    transaction_amount: amount,
    token,
    description: `Ticket Rivals · orden ${ordenId}`,
    installments,
    payment_method_id: String(pmId),
    payer: buildPayerFromCardForm(fd, payerEmailFallback),
    external_reference: `tr-${ordenId}`,
    metadata,
    binary_mode: false,
  };

  const rawSt = process.env.MERCADOPAGO_PAYMENT_STATEMENT_DESCRIPTOR;
  const st = rawSt != null ? String(rawSt).trim().toLowerCase() : '';
  if (st === 'off' || st === 'false' || st === '0') {
    /* omitido: en cuentas de prueba MX a veces rechaza el descriptor */
  } else if (rawSt != null && String(rawSt).trim() !== '') {
    body.statement_descriptor = String(rawSt).trim().slice(0, 22);
  } else {
    body.statement_descriptor = 'TICKETRIVALS';
  }

  const issuerRaw = fd.issuer_id ?? fd.issuerId;
  if (issuerRaw != null && issuerRaw !== '') {
    const n = Number(issuerRaw);
    if (Number.isFinite(n) && n > 0) body.issuer_id = n;
  }

  const optRaw = fd.payment_method_option_id ?? fd.paymentMethodOptionId;
  if (optRaw != null && String(optRaw).trim() !== '') {
    body.payment_method_option_id = String(optRaw);
  }

  if (sendNotify && shouldAttachPaymentNotificationUrl()) {
    body.notification_url = notifyPath;
  }

  /** Obligatorio según MP para POST /v1/payments (documentación Card Brick → envío al servidor). */
  const requestOptions = { idempotencyKey: randomUUID() };
  if (shouldSendMercadoPaymentTestTokenHeader()) {
    requestOptions.testToken = true;
  }
  const rawResult = await paymentApi.create({
    body,
    requestOptions,
  });
  return unwrapPaymentCreateResult(rawResult);
}

async function fetchPayment(paymentId) {
  const normalizedId = normalizePaymentId(paymentId);
  if (!normalizedId) {
    throw Object.assign(new Error('paymentId inválido'), { status: 400 });
  }
  const client = getClientConfig();
  const payment = new Payment(client);
  return payment.get({ id: normalizedId });
}

async function createRefund(mpPaymentId, body = {}) {
  const normalizedId = normalizePaymentId(mpPaymentId);
  if (!normalizedId) {
    throw Object.assign(new Error('mpPaymentId inválido para refund'), { status: 400 });
  }
  const client = getClientConfig();
  const refund = new PaymentRefund(client);
  return refund.create({ payment_id: normalizedId, body });
}

/**
 * Textos en inglés que devuelve MP (preferencia o cobro); los pasamos a instrucciones claras en español.
 */
function friendlyMercadoCredentialOrPaymentError(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Mercado Pago rechazó el cobro';
  const lower = s.toLowerCase();
  if (/invalid[_\s]access[_\s]token|access[_\s]token[_\s]invalid|invalid[_\s]credential/i.test(s)) {
    return (
      'Mercado Pago rechazó el Access Token del servidor (variable MERCADOPAGO_ACCESS_TOKEN en web/.env). Comprueba que sea la línea «Access Token» completa del mismo bloque que la Public Key (prueba o producción), sin comillas ni espacios al final, guarda .env y reinicia el backend.'
    );
  }
  if (lower.includes('unauthorized use of live credentials')) {
    return 'Compra cancelada por tarjetas de prueba.';
  }
  if (/card[_\s]token[_\s]not[_\s]found|token[_\s]not[_\s]found/i.test(lower)) {
    return (
      'Mercado Pago no encontró el token de la tarjeta al crear el cobro. Suele ocurrir si el POST lleva la cabecera X-Test-Token pero el token se generó en otro entorno: prueba MERCADOPAGO_PAYMENT_TEST_TOKEN=false (o elimínala del .env), reinicia el backend y vuelve a cargar el checkout. Si antes tenías «unauthorized use of live credentials», entonces MERCADOPAGO_PAYMENT_TEST_TOKEN=true puede ser necesario; elige el modo que coincida con tu par Public Key + Access Token del panel.'
    );
  }
  if (lower.includes('unauthorized use of test credentials')) {
    return (
      'Mercado Pago bloqueó el cobro: las claves de prueba no pueden usarse para este tipo de operación. ' +
      'Revisa que MERCADOPAGO_PUBLIC_KEY y MERCADOPAGO_ACCESS_TOKEN correspondan al mismo entorno en el panel.'
    );
  }
  return s;
}

function describePreferenceCreateError(err) {
  let msg = err?.message || '';
  if (!msg && Array.isArray(err?.cause)) {
    msg = err.cause.map((c) => c?.description || c?.message || '').filter(Boolean).join('. ');
  }
  if (!msg) msg = String(err || '');
  if (/policy returned UNAUTHORIZED|UNAUTHORIZED/i.test(msg)) {
    const configuredToken = readMercadoAccessToken();
    const likelyBadToken = looksLikeInvalidServerToken(configuredToken);
    return {
      error:
        'Mercado Pago rechazó crear el cobro por políticas de la cuenta o credenciales inválidas.',
      hint:
        likelyBadToken
          ? 'Tu MERCADOPAGO_ACCESS_TOKEN parece ser Public Key o un valor recortado. Copia el Access Token completo (línea "Access Token" en Credenciales de prueba), guarda .env y reinicia backend.'
          : 'Revisa: (1) Access Token de prueba copiado completo en .env y backend reiniciado. (2) API_PUBLIC_URL debe ser tu URL HTTPS de ngrok (no http://localhost); si MP rechazaba por notification_url insegura, prueba de nuevo tras el último cambio del servidor. (3) Misma aplicación “Checkout Pro” en el panel. Si sigue igual, contacta soporte MP con el detalle técnico.',
      technical: msg,
    };
  }
  return {
    error: friendlyMercadoCredentialOrPaymentError(msg) || 'No se pudo crear la preferencia en Mercado Pago',
    hint: null,
    technical: msg,
  };
}

module.exports = {
  isConfigured,
  createCheckoutPreference,
  createPaymentFromCardForm,
  fetchPayment,
  createRefund,
  normalizePaymentId,
  publicBaseUrl,
  webhookPathToken,
  preferenceCurrencyId,
  describePreferenceCreateError,
  friendlyMercadoCredentialOrPaymentError,
  readMercadoAccessToken,
  shouldSendNotificationUrl,
  getPublicKey,
};
