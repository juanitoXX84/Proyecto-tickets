import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, getToken, setToken } from '../services/api.js';

const AuthContext = createContext(null);

/** Evita que una /me antigua (p. ej. con token previo) pise el estado tras OAuth. */
const OAUTH_SETUP_PENDING_KEY = 'tr_google_oauth_setup_pending';

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadSessionSeq = useRef(0);

  /**
   * oauthNeedsProfileHint: '1' | '0' | null — si viene del redirect de Google (#needsProfile=),
   * tiene prioridad sobre /me (evita que un /me incorrecto cierre el flujo de completar perfil).
   */
  const loadSession = useCallback(async (oauthNeedsProfileHint = null) => {
    const seq = ++loadSessionSeq.current;
    setLoading(true);
    try {
      const token = getToken();
      if (!token) {
        if (seq !== loadSessionSeq.current) return null;
        setUser(null);
        setNeedsProfile(false);
        return { user: null, needsProfile: false };
      }
      const data = await apiFetch('/api/auth/me');
      if (seq !== loadSessionSeq.current) return null;
      setUser(data.user);
      let np = data.needsProfile === true || data.needsProfile === 1 || data.needsProfile === '1';
      if (oauthNeedsProfileHint === '1') np = true;
      if (oauthNeedsProfileHint === '0') np = false;
      setNeedsProfile(np);
      return { user: data.user, needsProfile: np };
    } catch {
      if (seq !== loadSessionSeq.current) return null;
      setToken(null);
      setUser(null);
      setNeedsProfile(false);
      return null;
    } finally {
      if (seq === loadSessionSeq.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const refresh = useCallback(() => loadSession(null), [loadSession]);

  const loginWithToken = useCallback(
    async (token, oauthNeedsProfileHint = null) => {
      setToken(token);
      return loadSession(oauthNeedsProfileHint);
    },
    [loadSession]
  );

  /**
   * Tras cerrar sesión navega al inicio (`/`) salvo que indiques otra ruta (p. ej. `/registro` al cambiar cuenta).
   */
  const logout = useCallback(
    async (redirectTo = '/') => {
      try {
        sessionStorage.removeItem(OAUTH_SETUP_PENDING_KEY);
      } catch {
        /* ignore */
      }
      try {
        await apiFetch('/api/auth/logout', { method: 'POST', body: {} });
      } catch {
        /* ignorar: igual limpiamos el cliente */
      }
      setToken(null);
      setUser(null);
      setNeedsProfile(false);
      navigate(redirectTo || '/', { replace: true });
    },
    [navigate]
  );

  const value = useMemo(
    () => ({
      user,
      needsProfile,
      loading,
      isAuthenticated: Boolean(user),
      refresh,
      loginWithToken,
      logout,
    }),
    [user, needsProfile, loading, refresh, loginWithToken, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
