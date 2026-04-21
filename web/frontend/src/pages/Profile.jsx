import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CountryCombobox } from '../components/forms/CountryCombobox.jsx';
import { PasswordInput } from '../components/forms/PasswordInput.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../services/api.js';
import styles from './Profile.module.css';

export function Profile() {
  const { user, needsProfile, loading, refresh } = useAuth();
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [pais, setPais] = useState('');
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [pwError, setPwError] = useState(null);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setNombre(user.nombre || '');
      setApellido(user.apellido || '');
      setTelefono(user.telefono || '');
      setPais(user.pais || '');
    }
  }, [user]);

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <span className={styles.spinner} />
      </div>
    );
  }

  if (!user || needsProfile) {
    return <Navigate to="/login" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!pais.trim()) {
      setError('Selecciona un país');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/user/profile', {
        method: 'PATCH',
        body: { nombre, apellido, telefono, pais },
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err.data?.error || err.message || 'No se pudo guardar');
    } finally {
      setSubmitting(false);
    }
  }

  async function onPasswordSubmit(e) {
    e.preventDefault();
    setPwError(null);
    setPwSaved(false);
    if (newPassword.length < 6) {
      setPwError('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newPassword !== newPassword2) {
      setPwError('Las contraseñas nuevas no coinciden');
      return;
    }
    setPwSubmitting(true);
    try {
      await apiFetch('/api/user/password', {
        method: 'PATCH',
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setNewPassword2('');
      setPwSaved(true);
    } catch (err) {
      setPwError(err.data?.error || err.message || 'No se pudo cambiar la contraseña');
    } finally {
      setPwSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <p className={styles.kicker}>Cuenta</p>
      <h1 className={styles.title}>Tu perfil</h1>
      <p className={styles.lead}>
        El correo proviene de Google y no se puede cambiar aquí: <span className={styles.email}>{user.email}</span>
      </p>

      <form onSubmit={onSubmit} className={styles.form}>
        {error && <div className={styles.bannerErr}>{error}</div>}
        {saved && <div className={styles.bannerOk}>Cambios guardados.</div>}
        <div className={styles.grid2}>
          <div>
            <label className={styles.label}>Nombre</label>
            <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={styles.input} />
          </div>
          <div>
            <label className={styles.label}>Apellido</label>
            <input required value={apellido} onChange={(e) => setApellido(e.target.value)} className={styles.input} />
          </div>
        </div>
        <div>
          <label className={styles.label}>Teléfono</label>
          <input
            required
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className={styles.input}
            autoComplete="tel"
          />
        </div>
        <CountryCombobox
          label="País"
          value={pais}
          onChange={setPais}
          disabled={submitting}
          placeholder="Selecciona tu país"
        />
        <button type="submit" disabled={submitting} className={styles.btnPrimary}>
          {submitting ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      <h2 className={styles.sectionTitle}>Contraseña para entrar con correo</h2>
      <p className={styles.sectionLead}>
        Si entraste con Google, esta es la misma clave que definiste al completar el perfil (no es la de Gmail).
      </p>
      <form onSubmit={onPasswordSubmit} className={styles.form}>
        {pwError && <div className={styles.bannerErr}>{pwError}</div>}
        {pwSaved && <div className={styles.bannerOk}>Contraseña actualizada.</div>}
        <div>
          <label className={styles.label}>Contraseña actual</label>
          <PasswordInput
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={styles.input}
            autoComplete="current-password"
            required
          />
        </div>
        <div>
          <label className={styles.label}>Nueva contraseña (mín. 6)</label>
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={styles.input}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>
        <div>
          <label className={styles.label}>Repetir nueva contraseña</label>
          <PasswordInput
            value={newPassword2}
            onChange={(e) => setNewPassword2(e.target.value)}
            className={styles.input}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>
        <button type="submit" disabled={pwSubmitting} className={styles.btnSecondary}>
          {pwSubmitting ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
      </form>

      <p className={styles.footer}>
        <Link to="/" className={styles.footerLink}>
          ← Volver al inicio
        </Link>
      </p>
    </div>
  );
}
