import styles from './PaymentTrustBadges.module.css';

/** Sellos de confianza junto al checkout (Mercado Pago, Visa, Mastercard + escudo). */
export function PaymentTrustBadges() {
  return (
    <div className={styles.wrap} aria-label="Métodos de pago y seguridad">
      <div className={styles.secureRow}>
        <svg
          className={styles.shieldIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <span>Pago protegido y cifrado</span>
      </div>

      <div className={styles.logosRow}>
        <div className={styles.logoMp} title="Mercado Pago">
          <span className={styles.logoMpText}>Mercado Pago</span>
        </div>

        <div className={styles.logoVisa} title="Visa">
          <span className={styles.srOnly}>Visa</span>
          <span className={styles.visaWord}>VISA</span>
        </div>

        <div className={styles.logoMc} title="Mastercard">
          <span className={styles.srOnly}>Mastercard</span>
          <svg viewBox="0 0 48 32" className="h-7 w-11" aria-hidden>
            <circle cx="18" cy="16" r="12" fill="#EB001B" />
            <circle cx="30" cy="16" r="12" fill="#F79E1B" />
          </svg>
        </div>
      </div>
    </div>
  );
}
