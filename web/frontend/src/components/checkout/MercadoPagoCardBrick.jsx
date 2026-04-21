import { useMemo, useCallback, useRef, useEffect } from 'react';
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react';
import { apiFetch } from '../../services/api.js';
import styles from './MercadoPagoCardBrick.module.css';

/**
 * Última Public Key inicializada en initMercadoPago. Va fuera del componente para sobrevivir al
 * doble montaje de React Strict Mode (si no, el ref se resetea y el SDK puede inicializarse dos veces
 * y MP responde «unauthorized use of live credentials»).
 */
let mercadoPagoSdkLastPublicKey = '';

/**
 * Tarjeta embebida (Checkout Bricks): evita el redirect que prioriza saldo en cuenta MP.
 *
 * Importante: `CardPayment` del SDK reinicializa el brick cuando cambian por referencia
 * `initialization`, `callbacks`, etc. Objetos/inline handlers nuevos cada render rompen el iframe.
 */
export function MercadoPagoCardBrick({
  publicKey,
  amount,
  ordenId,
  payerEmail,
  onApproved,
  onPending,
  onRejected,
}) {
  const onApprovedRef = useRef(onApproved);
  const onPendingRef = useRef(onPending);
  const onRejectedRef = useRef(onRejected);
  useEffect(() => {
    onApprovedRef.current = onApproved;
    onPendingRef.current = onPending;
    onRejectedRef.current = onRejected;
  });

  /** MP redondea en MXN a 2 decimales; evita floats raros. */
  const amtRaw = Number(amount);
  const amt =
    Number.isFinite(amtRaw) && amtRaw > 0 ? Math.round(amtRaw * 100) / 100 : Number.NaN;
  const payerEmailTrim = payerEmail ? String(payerEmail).trim() : '';

  /**
   * Con montos bajos, pedir hasta 12 cuotas hace fallar la API de cuotas de MP:
   * "There is no valid payment type for this amount" / card_payment_brick_initialization_failed.
   * Sin customization de cuotas el brick usa el máximo que MP permita para ese monto.
   */
  const initialization = useMemo(() => {
    const init = { amount: amt };
    if (payerEmailTrim) init.payer = { email: payerEmailTrim };
    return init;
  }, [amt, payerEmailTrim]);

  const handleSubmit = useCallback(async (cardFormData) => {
    try {
      const oid = Number(ordenId);
      const data = await apiFetch('/api/payments/brick-card', {
        method: 'POST',
        body: { ordenId: oid, formData: cardFormData },
      });
      if (data.ok && data.status === 'approved') {
        onApprovedRef.current?.(data);
        return;
      }
      if (data.ok && data.pending) {
        onPendingRef.current?.(data);
        return;
      }
      const msg = data.error || data.status || 'No se pudo completar el pago';
      onRejectedRef.current?.(msg);
      throw new Error(msg);
    } catch (e) {
      const msg = e?.data?.error || e?.message || 'Mercado Pago rechazó el cobro';
      onRejectedRef.current?.(msg);
      throw e;
    }
  }, [ordenId]);

  const handleError = useCallback((err) => {
    console.error('[mp brick]', err);
    const raw = [err?.message, err?.cause].filter(Boolean).join(' — ');
    const norm = String(raw || '').toLowerCase();
    const detail =
      norm.includes('empty_installments') || norm.includes('missing_payment_information')
        ? 'No hay opciones de pago disponibles para este monto. Sube la cantidad o usa un total mayor.'
        : raw || 'Error al cargar el formulario';
    onRejectedRef.current?.(detail);
  }, []);

  const containerId = useMemo(() => `cardPaymentBrick_ord_${ordenId}`, [ordenId]);

  const ready =
    Boolean(publicKey) &&
    ordenId != null &&
    amount != null &&
    Number.isFinite(amt) &&
    amt > 0;

  if (!ready || !publicKey) {
    return null;
  }

  if (mercadoPagoSdkLastPublicKey !== publicKey) {
    initMercadoPago(publicKey, { locale: 'es-MX' });
    mercadoPagoSdkLastPublicKey = publicKey;
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.lead}>
        Ingresa los datos de tu tarjeta abajo. El cobro lo procesa Mercado Pago de forma segura.
      </p>
      <div className={styles.brickBox}>
        <CardPayment
          key={`${containerId}_${publicKey}`}
          id={containerId}
          locale="es-MX"
          initialization={initialization}
          onSubmit={handleSubmit}
          onError={handleError}
        />
      </div>
    </div>
  );
}
