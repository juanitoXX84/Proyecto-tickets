import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal.jsx';
import { GoogleAuthSection } from '../components/auth/GoogleAuthButton.jsx';
import { PasswordInput } from '../components/forms/PasswordInput.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../services/api.js';
import { safeNextPath } from '../utils/safeNextPath.js';
import styles from './Login.module.css';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetBanner, setResetBanner] = useState(null);
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next') || '/');

  useEffect(() => {
    if (params.get('error') === 'suspended') {
      setError(
        'Tu cuenta está suspendida. Si crees que es un error, contacta al soporte de Ticket Rivals.'
      );
    }
  }, [params]);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setResetBanner(null);
    setSubmitting(true);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      const session = await loginWithToken(data.token);
      if (session?.needsProfile) {
        navigate('/oauth/acceso', { replace: true });
        return;
      }
      navigate(next);
    } catch (err) {
      setError(err.data?.error || err.message || 'Error al iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.card}>
          <h1 className={styles.title}>Iniciar sesión</h1>
          <p className={styles.subtitle}>
            ¿No tienes cuenta?{' '}
            <Link to="/registro" className={styles.link}>
              Regístrate
            </Link>
          </p>
          <div className={styles.googleHint}>
            <p className={styles.googleHintTitle}>¿Cuenta creada con Google?</p>
            <p className={styles.googleHintBody}>
              La contraseña de Gmail no sirve en este formulario. Usa la que definiste al completar el perfil, o{' '}
              <button type="button" onClick={() => setForgotOpen(true)} className={styles.inlineBtn}>
                recupérala con un código por correo
              </button>
              . También puedes entrar con <strong className={styles.strong}>Continuar con Google</strong> y cambiar la
              clave en <strong className={styles.strong}>Editar perfil</strong>.
            </p>
          </div>
          <form onSubmit={onSubmit} className={styles.form}>
            {resetBanner && <div className={styles.bannerOk}>{resetBanner}</div>}
            {error && <div className={styles.bannerErr}>{error}</div>}
            <div>
              <label className={styles.label}>Correo electrónico</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                autoComplete="email"
              />
            </div>
            <div>
              <div className={styles.labelRow}>
                <label className={styles.label}>Contraseña</label>
                <button type="button" onClick={() => setForgotOpen(true)} className={styles.linkSmall}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                autoComplete="current-password"
                required
              />
            </div>
            <button type="submit" disabled={submitting} className={styles.submit}>
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          <GoogleAuthSection actionLabel="Continuar con Google" intent="login" />
        </div>
      </div>

      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        onSuccess={(msg) => setResetBanner(msg)}
      />
    </div>
  );
}
