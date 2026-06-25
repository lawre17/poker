import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  apiFetch,
  clearToken,
  getToken,
  setToken as persistToken,
} from './client';

export interface User {
  id: number;
  name: string;
  email: string;
  coins: number;
  wins: number;
  losses: number;
}

interface AuthResponse {
  token: string;
  user: User;
}

interface MeResponse {
  user: User;
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Boot: load a stored token and validate it.
  useEffect(() => {
    let active = true;
    (async () => {
      const stored = await getToken();
      if (!active) return;
      if (!stored) {
        setLoading(false);
        return;
      }
      try {
        const me = await apiFetch<MeResponse>('/me', { token: stored });
        if (!active) return;
        setTokenState(stored);
        setUser(me.user);
      } catch {
        // Token invalid/expired — clear it.
        await clearToken();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const applyAuth = useCallback(async (res: AuthResponse) => {
    await persistToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiFetch<AuthResponse>('/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      await applyAuth(res);
    },
    [applyAuth]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await apiFetch<AuthResponse>('/register', {
        method: 'POST',
        body: { name, email, password },
        auth: false,
      });
      await applyAuth(res);
    },
    [applyAuth]
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>('/logout', { method: 'POST' });
    } catch {
      /* best-effort; clear locally regardless */
    }
    await clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    try {
      const me = await apiFetch<MeResponse>('/me');
      setUser(me.user);
    } catch {
      /* leave existing user in place */
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{ token, user, loading, login, register, logout, refreshMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
