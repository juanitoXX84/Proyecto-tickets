import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../services/api.js';
import { GoogleAuthSection } from '../components/auth/GoogleAuthButton.jsx';
import styles from './Register.module.css';

export function Register() {
  const { user, needsProfile, loading } = useAuth();
  const [googleOk, setGoogleOk] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch('/api/auth/providers');
        if (!cancelled) setGoogleOk(Boolean(data.google));
      } catch {
        if (!cancelled) setGoogleOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-zinc-500">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (user && needsProfile) {
    return <Navigate to="/oauth/acceso" replace />;
  }

  if (user && !needsProfile) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.card}>
          <h1 className={styles.title}>Crear cuenta</h1>
          <p className={styles.intro}>
            Validamos tu identidad con <strong className={styles.introStrong}>Google</strong>. Luego verás la pantalla{' '}
            <strong className={styles.introStrong}>Completar perfil</strong>: ahí eliges una{' '}
            <strong className={styles.introStrong}>contraseña solo para Ticket Rivals</strong> (no es la de Gmail); esa es la
            que usarás si más adelante entras con correo y contraseña en esta web.
          </p>
          {googleOk === false && (
            <div className={styles.warn}>
              Google OAuth no está configurado en el servidor. Revisa <code className={styles.code}>.env</code> y reinicia la
              API.
            </div>
          )}
          <div className={styles.oauthWrap}>
            <GoogleAuthSection actionLabel="Continuar con Google" intent="register" />
          </div>
          <p className={styles.footer}>
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className={styles.footerLink}>
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
