import { Link } from 'react-router-dom';
import styles from './TermsPage.module.css';

export function TermsPage() {
  return (
    <article className={styles.article}>
      <p className={styles.back}>
        <Link to="/" className={styles.backLink}>
          ← Inicio
        </Link>
      </p>
      <h1 className={styles.title}>Términos y condiciones</h1>
      <p className={styles.lead}>Última actualización: abril de 2026</p>

      <div className={styles.prose}>
        <h2 className={styles.proseH2}>1. Compra de boletos</h2>
        <p className={styles.proseP}>
          Al adquirir boletos a través de Ticket Rivals aceptas que la transacción queda sujeta a la disponibilidad
          publicada en el momento de la compra, a los precios y condiciones del evento indicados en la plataforma y a
          cualquier límite de boletos por persona o por transacción que aplique. Los datos que proporciones deben ser
          veraces para poder validar tu compra y, en su caso, emitir o canjear entradas.
        </p>

        <h2 className={styles.proseH2Spaced}>2. Cancelación o cambios del evento</h2>
        <p className={styles.proseP}>
          Si un evento se cancela, pospone o modifica de forma sustancial (fecha, lugar o contenido), las políticas de
          reembolso, cambio de fecha o alternativas aplicarán según lo comunicado por el organizador y la normativa
          aplicable. Ticket Rivals puede actuar como intermediario de la venta; en caso de duda, conserva la
          confirmación de tu compra y revisa los avisos oficiales del evento.
        </p>

        <h2 className={styles.proseH2Spaced}>3. Reventa no autorizada</h2>
        <p className={styles.proseP}>
          Queda prohibida la reventa de boletos fuera de los canales autorizados por el organizador o por Ticket
          Rivals, así como su uso con fines comerciales no permitidos. Nos reservamos el derecho de invalidar
          entradas que se detecten en reventa no autorizada o que vulneren estas condiciones, sin perjuicio de las
          acciones legales que correspondan.
        </p>
      </div>
    </article>
  );
}
