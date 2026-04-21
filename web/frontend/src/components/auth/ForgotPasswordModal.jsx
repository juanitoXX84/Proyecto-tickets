import { useEffect, useState } from 'react';
import { PasswordInput } from '../forms/PasswordInput.jsx';
import { apiFetch } from '../../services/api.js';

/**
 * 1) Correo → envía código
 * 2) Solo código → valida y obtiene resetToken
 * 3) Nueva contraseña (usa resetToken)
 */
export function ForgotPasswordModal({ open, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [emailSetupHint, setEmailSetupHint] = useState(null);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setEmail('');
      setCode('');
      setResetToken('');
      setNewPassword('');
      setNewPassword2('');
      setInfo(null);
      setError(null);
      setEmailSetupHint(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(`/api/auth/providers?t=${Date.now()}`);
        if (cancelled || !data.passwordResetEmail) return;
        const pr = data.passwordResetEmail;
        if (!pr.canSendEmail && pr.hint) {
          setEmailSetupHint(pr.hint);
        }
      } catch {
        /* ignorar */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function sendCode(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSending(true);
    try {
      const data = await apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setInfo(data.message);
      setStep(2);
    } catch (err) {
      setError(err.data?.error || err.message || 'No se pudo enviar la solicitud');
    } finally {
      setSending(false);
    }
  }

  async function resendCode() {
    setError(null);
    setSending(true);
    try {
      const data = await apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setInfo(data.message);
    } catch (err) {
      setError(err.data?.error || err.message || 'No se pudo reenviar');
    } finally {
      setSending(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError('El código debe ser de 6 dígitos');
      return;
    }
    setSending(true);
    try {
      const data = await apiFetch('/api/auth/verify-reset-code', {
        method: 'POST',
        body: { email, code: code.trim() },
      });
      setResetToken(data.resetToken);
      setInfo(null);
      setStep(3);
    } catch (err) {
      setError(err.data?.error || err.message || 'Código incorrecto o expirado');
    } finally {
      setSending(false);
    }
  }

  async function submitNewPassword(e) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newPassword !== newPassword2) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setSending(true);
    try {
      const data = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: { resetToken, newPassword },
      });
      onSuccess?.(data.message || 'Contraseña actualizada.');
      onClose();
    } catch (err) {
      setError(err.data?.error || err.message || 'No se pudo cambiar la contraseña');
    } finally {
      setSending(false);
    }
  }

  function goBackToEmail() {
    setStep(1);
    setError(null);
    setCode('');
    setResetToken('');
    setNewPassword('');
    setNewPassword2('');
    setInfo(null);
  }

  /** Tras validar el código ya no sirve; hay que pedir uno nuevo. */
  function goBackFromPasswordStep() {
    setStep(1);
    setError(null);
    setCode('');
    setResetToken('');
    setNewPassword('');
    setNewPassword2('');
    setInfo('Solicita un nuevo código: el anterior ya se usó al verificar.');
  }

  const title =
    step === 1 ? 'Recuperar contraseña' : step === 2 ? 'Código de verificación' : 'Nueva contraseña';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-password-title"
        className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          aria-label="Cerrar"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 id="forgot-password-title" className="pr-10 font-display text-xl font-extrabold text-zinc-900">
          {title}
        </h2>

        {step === 1 ? (
          <p className="mt-2 text-sm text-zinc-600">
            Te enviaremos un código de 6 dígitos a tu correo (válido 15 minutos).
          </p>
        ) : null}
        {step === 2 ? (
          <p className="mt-2 text-sm text-zinc-600">
            Introduce el código que enviamos a <span className="font-medium text-zinc-800">{email}</span>.
          </p>
        ) : null}
        {step === 3 ? (
          <p className="mt-2 text-sm text-zinc-600">
            Elige la contraseña que usarás en Ticket Rivals con tu correo (no es la de Gmail).
          </p>
        ) : null}

        {emailSetupHint ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p className="font-semibold text-amber-900">Correo no configurado en el servidor</p>
            <p className="mt-1 leading-relaxed">{emailSetupHint}</p>
          </div>
        ) : null}

        {info ? (
          <p className="mt-3 rounded-lg border border-brand-100 bg-brand-50/90 px-3 py-2 text-sm text-zinc-800">
            {info}
          </p>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        ) : null}

        {step === 1 ? (
          <form onSubmit={sendCode} className="mt-6 space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-medium text-zinc-700">
                Correo electrónico
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                autoComplete="email"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 sm:px-5"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={sending}
                className="rounded-full bg-brand-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-brand-700 disabled:opacity-50 sm:px-5"
              >
                {sending ? 'Enviando…' : 'Enviar código'}
              </button>
            </div>
          </form>
        ) : null}

        {step === 2 ? (
          <form onSubmit={submitCode} className="mt-6 space-y-4">
            <div>
              <label htmlFor="forgot-code" className="block text-sm font-medium text-zinc-700">
                Código de 6 dígitos
              </label>
              <input
                id="forgot-code"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 font-mono text-lg tracking-[0.3em] text-zinc-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                placeholder="000000"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between sm:gap-3">
              <button
                type="button"
                onClick={goBackToEmail}
                className="order-2 rounded-full border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 sm:order-1 sm:px-4"
              >
                ← Cambiar correo
              </button>
              <button
                type="button"
                onClick={() => void resendCode()}
                disabled={sending}
                className="order-3 text-sm font-semibold text-brand-700 hover:underline disabled:opacity-50 sm:order-2"
              >
                Reenviar código
              </button>
              <button
                type="submit"
                disabled={sending}
                className="order-1 rounded-full bg-brand-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-brand-700 disabled:opacity-50 sm:order-3 sm:ml-auto sm:px-6"
              >
                {sending ? 'Comprobando…' : 'Continuar'}
              </button>
            </div>
          </form>
        ) : null}

        {step === 3 ? (
          <form onSubmit={submitNewPassword} className="mt-6 space-y-4">
            <div>
              <label htmlFor="forgot-np1" className="block text-sm font-medium text-zinc-700">
                Nueva contraseña (mín. 6)
              </label>
              <PasswordInput
                id="forgot-np1"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                autoComplete="new-password"
                required
                minLength={6}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="forgot-np2" className="block text-sm font-medium text-zinc-700">
                Repetir nueva contraseña
              </label>
              <PasswordInput
                id="forgot-np2"
                value={newPassword2}
                onChange={(e) => setNewPassword2(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={goBackFromPasswordStep}
                className="order-2 rounded-full border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 sm:order-1 sm:px-4"
              >
                ← Atrás
              </button>
              <button
                type="submit"
                disabled={sending}
                className="order-1 rounded-full bg-brand-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-brand-700 disabled:opacity-50 sm:order-2 sm:px-8"
              >
                {sending ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
