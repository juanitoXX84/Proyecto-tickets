import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './CheckoutReturn.module.css';

export function CheckoutReturn() {
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const status = params.get('status') || '';

  let title = 'Resultado del pago';
  let message = 'Gracias por usar Ticket Rivals.';
  let tone = 'zinc';

  if (status === 'success') {
    title = 'Pago recibido';
    message =
      'Si Mercado Pago aprobó el cobro, en unos segundos deberías ver tus boletos en Mis compras. Si no aparecen, espera la notificación del webhook o revisa el estado del pago en tu cuenta de Mercado Pago.';
    tone = 'emerald';
  } else if (status === 'pending') {
    title = 'Pago pendiente';
    message =
      'Tu pago está en revisión. Cuando Mercado Pago lo confirme, los boletos aparecerán en Mis compras.';
    tone = 'amber';
  } else if (status === 'failure') {
    title = 'No se completó el pago';
    message = 'Puedes volver al evento e intentar de nuevo.';
    tone = 'red';
  }

  const boxClass =
    tone === 'emerald'
      ? styles.cardEmerald
      : tone === 'amber'
        ? styles.cardAmber
        : tone === 'red'
          ? styles.cardRed
          : styles.cardZinc;

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <span className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.card} ${boxClass}`}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          {user && user.rol !== 'admin' && user.rol !== 'organizador' && (
            <Link to="/mis-compras" className={styles.btnPrimary}>
              Ir a mis compras
            </Link>
          )}
          <Link to="/" className={styles.btnSecondary}>
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
