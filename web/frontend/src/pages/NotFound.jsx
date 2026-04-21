import { Link } from 'react-router-dom';
import styles from './NotFound.module.css';

export function NotFound() {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Página no encontrada</h1>
      <p className={styles.subtitle}>La ruta no existe o cambió.</p>
      <Link to="/" className={styles.link}>
        Volver al inicio
      </Link>
    </div>
  );
}
