import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './AuthCallback.module.css';

const TOKEN_KEY = 'tr_oauth_token_pending';
const NP_KEY = 'tr_oauth_np_pending';
const HANDLING_KEY = 'tr_oauth_handling';

/** Persiste token del hash en sessionStorage antes de cualquier async (Strict Mode ejecuta el efecto 2 veces). */
function syncHashToSessionStorage() {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash || '';
  if (!hash.startsWith('#')) return;
  const hp = new URLSearchParams(hash.slice(1));
  const t = hp.get('token');
  if (t) {
    const prev = sessionStorage.getItem(TOKEN_KEY);
    sessionStorage.setItem(TOKEN_KEY, t);
    if (prev !== t) {
      sessionStorage.removeItem(HANDLING_KEY);
    }
    const np = hp.get('needsProfile');
    if (np === '1' || np === '0') sessionStorage.setItem(NP_KEY, np);
    else sessionStorage.removeItem(NP_KEY);
  }
}

export function AuthCallback() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    syncHashToSessionStorage();

    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      setError('No se recibió token de Google');
      return;
    }

    if (sessionStorage.getItem(HANDLING_KEY) === '1') {
      return;
    }
    sessionStorage.setItem(HANDLING_KEY, '1');

    const npStored = sessionStorage.getItem(NP_KEY);
    const needsProfileHint = npStored === '1' || npStored === '0' ? npStored : null;

    let cancelled = false;

    (async () => {
      try {
        const session = await loginWithToken(token, needsProfileHint);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(NP_KEY);
        sessionStorage.removeItem(HANDLING_KEY);
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        if (needsProfileHint === '1' || session?.needsProfile) {
          try {
            sessionStorage.setItem('tr_google_oauth_setup_pending', '1');
          } catch {
            /* ignore */
          }
        } else {
          try {
            sessionStorage.removeItem('tr_google_oauth_setup_pending');
          } catch {
            /* ignore */
          }
        }
        // Tras validar con Google siempre pasamos por la pantalla de acceso/perfil; si ya está todo listo, redirige al inicio.
        navigate('/oauth/acceso', { replace: true });
      } catch {
        sessionStorage.removeItem(HANDLING_KEY);
        if (!cancelled) setError('No se pudo validar la sesión');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loginWithToken, navigate]);

  if (error) {
    return (
      <div className={styles.errorScreen}>
        <p className={styles.errorText}>{error}</p>
        <button type="button" onClick={() => navigate('/login')} className={styles.errorBtn}>
          Volver al login
        </button>
      </div>
    );
  }

  return (
    <div className={styles.loadingScreen}>
      <span className={styles.spinner} />
      <p className={styles.loadingText}>Completando inicio de sesión…</p>
    </div>
  );
}
