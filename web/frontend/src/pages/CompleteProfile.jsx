import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CountryCombobox } from '../components/forms/CountryCombobox.jsx';
import { PasswordInput } from '../components/forms/PasswordInput.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../services/api.js';
import styles from './CompleteProfile.module.css';

const OAUTH_SETUP_PENDING_KEY = 'tr_google_oauth_setup_pending';

function pendingOAuthSetup() {
  try {
    return sessionStorage.getItem(OAUTH_SETUP_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function CompleteProfile() {
  const { user, needsProfile, loading, loginWithToken, logout } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [pais, setPais] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSwitchAccount, setConfirmSwitchAccount] = useState(false);

  const canAccessSetup = needsProfile || pendingOAuthSetup();

  useEffect(() => {
    if (!confirmSwitchAccount) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setConfirmSwitchAccount(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmSwitchAccount]);

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <span className={styles.spinner} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/registro" replace />;
  }

  if (!canAccessSetup) {
    return <Navigate to="/" replace />;
  }

  async function goStep2() {
    setError(null);
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== password2) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/auth/set-oauth-password', { method: 'POST', body: { password } });
      setStep(2);
    } catch (err) {
      setError(err.data?.error || err.message || 'No se pudo guardar la contraseña');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitDatos(e) {
    e.preventDefault();
    setError(null);
    if (!pais.trim()) {
      setError('Selecciona un país');
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch('/api/auth/complete-profile', {
        method: 'POST',
        body: { nombre, apellido, telefono, pais, password },
      });
      try {
        sessionStorage.removeItem(OAUTH_SETUP_PENDING_KEY);
      } catch {
        /* ignore */
      }
      await loginWithToken(data.token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.data?.error || err.message || 'No se pudo guardar');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.card}>
          <p className={styles.step}>{step === 1 ? 'Paso 1 de 2' : 'Paso 2 de 2'}</p>

          {step === 1 && (
            <>
              <h1 className={styles.title}>Acceso con correo: define tu contraseña</h1>
              <p className={styles.lead}>
                Acabas de validar tu cuenta con Google (<span className={styles.email}>{user.email}</span>). Define primero
                la clave que usarás <strong className={styles.strong}>solo en Ticket Rivals</strong> para entrar con correo
                y contraseña cuando quieras. <strong>No es</strong> la contraseña de Gmail.
              </p>

              <div className={styles.box}>
                {error && <div className={styles.bannerErr}>{error}</div>}
                <div>
                  <label className={styles.label}>Nueva contraseña (mín. 6)</label>
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={styles.input}
                    autoComplete="new-password"
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <label className={styles.label}>Repetir nueva contraseña</label>
                  <PasswordInput
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    className={styles.input}
                    autoComplete="new-password"
                    required
                    minLength={6}
                  />
                </div>
                <button type="button" onClick={() => void goStep2()} disabled={submitting} className={styles.btnPrimary}>
                  {submitting ? 'Guardando contraseña…' : 'Continuar'}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className={styles.title}>Tus datos</h1>
              <p className={styles.lead}>
                Último paso: confirma nombre, contacto y país. Luego entrarás al inicio con tu cuenta lista.
              </p>
              <form onSubmit={onSubmitDatos} className={styles.form}>
                {error && <div className={styles.bannerErr}>{error}</div>}
                <div className={styles.grid2}>
                  <div>
                    <label className={styles.label}>Nombre *</label>
                    <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={styles.input} />
                  </div>
                  <div>
                    <label className={styles.label}>Apellido *</label>
                    <input
                      required
                      value={apellido}
                      onChange={(e) => setApellido(e.target.value)}
                      className={styles.input}
                    />
                  </div>
                </div>
                <div>
                  <label className={styles.label}>Teléfono *</label>
                  <input
                    required
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className={styles.input}
                    autoComplete="tel"
                  />
                </div>
                <CountryCombobox
                  label="País *"
                  value={pais}
                  onChange={setPais}
                  disabled={submitting}
                  placeholder="Selecciona tu país"
                />
                <div className={styles.btnRow}>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep(1);
                    }}
                    className={styles.btnBack}
                  >
                    ← Cambiar contraseña
                  </button>
                  <button type="submit" disabled={submitting} className={styles.btnSubmit}>
                    {submitting ? 'Guardando…' : 'Guardar y continuar'}
                  </button>
                </div>
              </form>
            </>
          )}

          <p className={styles.switchWrap}>
            <button type="button" onClick={() => setConfirmSwitchAccount(true)} className={styles.switchBtn}>
              Cerrar sesión y usar otra cuenta
            </button>
          </p>
        </div>
      </div>

      {confirmSwitchAccount && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="switch-account-title"
          onClick={() => setConfirmSwitchAccount(false)}
        >
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 id="switch-account-title" className={styles.modalTitle}>
              ¿Cerrar sesión?
            </h2>
            <p className={styles.modalText}>Se cerrará tu sesión actual y podrás registrarte o entrar con otra cuenta.</p>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setConfirmSwitchAccount(false)} className={styles.btnGhost}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmSwitchAccount(false);
                  logout('/registro');
                }}
                className={styles.btnModalPrimary}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
