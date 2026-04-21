const express = require('express');
const crypto = require('crypto');
const { processPaymentNotification } = require('../services/paymentWebhookProcessor');

const router = express.Router({ mergeParams: true });

function timingSafeEqualStr(a, b) {
  try {
    const ba = Buffer.from(String(a), 'utf8');
    const bb = Buffer.from(String(b), 'utf8');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function isPaymentTopic(topic) {
  return String(topic || '').toLowerCase() === 'payment';
}

function bodyLooksLikePaymentNotification(raw) {
  const t = String(raw.type || raw.topic || '').toLowerCase();
  if (t === 'payment') return true;
  const a = String(raw.action || '').toLowerCase();
  return a === 'payment.created' || a === 'payment.updated' || a.startsWith('payment.');
}

function extractPaymentId(req) {
  const q = req.query || {};
  if (isPaymentTopic(q.topic) && q.id != null) {
    return String(q.id);
  }
  if (isPaymentTopic(q.topic) && q.resource != null) {
    return String(q.resource);
  }
  let raw = req.body;
  if (Buffer.isBuffer(raw)) {
    try {
      raw = JSON.parse(raw.toString('utf8') || '{}');
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  if (isPaymentTopic(raw.topic) && raw.resource != null) {
    return String(raw.resource);
  }
  if (raw.data && raw.data.id != null && bodyLooksLikePaymentNotification(raw)) {
    return String(raw.data.id);
  }
  if (raw.id != null && bodyLooksLikePaymentNotification(raw)) {
    return String(raw.id);
  }
  return null;
}

router.all('/:token', async (req, res) => {
  const expected = process.env.MERCADOPAGO_WEBHOOK_TOKEN?.trim();
  if (!expected || !timingSafeEqualStr(req.params.token, expected)) {
    return res.status(403).send('forbidden');
  }

  const paymentId = extractPaymentId(req);
  if (!paymentId) {
    return res.status(200).send('ok');
  }

  try {
    await processPaymentNotification(paymentId);
  } catch (e) {
    console.error('[mp-webhook]', paymentId, e.message || e);
    return res.status(500).send('retry');
  }
  return res.status(200).send('ok');
});

module.exports = router;
