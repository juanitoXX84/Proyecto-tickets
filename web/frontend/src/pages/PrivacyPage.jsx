import { Link } from 'react-router-dom';
import styles from './PrivacyPage.module.css';

export function PrivacyPage() {
  return (
    <article className={styles.article}>
      <p className={styles.back}>
        <Link to="/" className={styles.backLink}>
          ← Inicio
        </Link>
      </p>
      <h1 className={styles.title}>Aviso de privacidad</h1>
      <p className={styles.lead}>
        De conformidad con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)
        y normativa aplicable en México.
      </p>

      <div className={styles.prose}>
        <h2 className={styles.proseH2}>Responsable</h2>
        <p className={styles.proseP}>
          Ticket Rivals, en su carácter de responsable del tratamiento de los datos personales que usted proporcione a
          través de este sitio y servicios asociados.
        </p>

        <h2 className={styles.proseH2Spaced}>Datos que recabamos</h2>
        <p className={styles.proseP}>
          Podemos tratar, entre otros: nombre, apellidos, correo electrónico, datos que nos proporciones al registrarte o
          completar tu perfil, e información técnica necesaria para el funcionamiento del servicio. Si utilizas{' '}
          <strong>inicio de sesión con Google (OAuth)</strong>, Google puede compartir con nosotros datos básicos de tu
          cuenta según los permisos que aceptes en su plataforma. Asimismo, si solicitas{' '}
          <strong>recuperación de contraseña por correo</strong>, usaremos el correo que indiques para enviarte el
          código de verificación.
        </p>

        <h2 className={styles.proseH2Spaced}>Finalidades del tratamiento</h2>
        <p className={styles.proseP}>
          Tratamos tus datos para crear y administrar tu cuenta, permitir el acceso al sitio,{' '}
          <strong>validar y gestionar compras de boletos</strong>, comunicarnos contigo en relación con tu cuenta o tus
          transacciones, cumplir obligaciones legales y mejorar la seguridad del servicio.
        </p>

        <h2 className={styles.proseH2Spaced}>Transferencias</h2>
        <p className={styles.proseP}>
          <strong>No vendemos ni comercializamos tus datos personales a terceros.</strong> Solo compartimos información
          cuando sea necesario para operar el servicio (por ejemplo, proveedores de infraestructura o pasarelas de pago,
          bajo obligaciones de confidencialidad), cuando medie tu consentimiento o cuando una ley lo exija.
        </p>

        <h2 className={styles.proseH2Spaced}>Derechos ARCO y dudas</h2>
        <p className={styles.proseP}>
          Puedes ejercer los derechos de acceso, rectificación, cancelación u oposición, así como revocar el
          consentimiento que nos hayas otorgado, según lo previsto en la LFPDPPP. Para ello, contáctanos a través de los
          medios que Ticket Rivals publique para atención al usuario.
        </p>
      </div>
    </article>
  );
}
