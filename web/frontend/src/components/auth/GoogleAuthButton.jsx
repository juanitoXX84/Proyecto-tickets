/**
 * OAuth Google: el servidor usa prompt=select_account para que siempre aparezca
 * el selector de cuenta de Google (útil tras cerrar sesión o cambiar de usuario).
 * intent: login | register (solo informativo en la URL; el flujo backend es el mismo).
 */
export function GoogleAuthSection({ actionLabel = 'Continuar con Google', intent }) {
  const googleHref =
    intent != null
      ? `/api/auth/google?${new URLSearchParams({ intent: String(intent) }).toString()}`
      : '/api/auth/google';

  return (
    <>
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200" />
        </div>
        <div className="relative flex justify-center text-xs font-semibold uppercase tracking-wide">
          <span className="bg-white px-3 text-zinc-400">o continúa con</span>
        </div>
      </div>
      <a
        href={googleHref}
        className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-zinc-200 bg-white py-3 text-sm font-bold text-zinc-800 hover:border-brand-300 hover:bg-brand-50/50"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {actionLabel}
      </a>
      <p className="mt-3 text-center text-xs text-zinc-500">
        Se abrirá Google para que elijas la cuenta. Si el correo ya existe en Ticket Rivals, entrarás; si no,
        crearemos la cuenta y te pediremos completar el perfil.
      </p>
    </>
  );
}
