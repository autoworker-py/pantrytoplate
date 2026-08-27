import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore } from './api';

interface User {
  id: string;
  email: string;
  /** the first-run questions have been answered or deliberately skipped */
  onboarded: boolean;
  /** false when the notice has been revised since this person agreed */
  privacyCurrent: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, acceptPrivacyVersion: string) => Promise<void>;
  logout: () => void;
  /** re-read the account after onboarding or accepting a revised notice */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      return;
    }
    const data = await api.get<{ user: User }>('/api/auth/me');
    setUser(data.user);
  }, []);

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    refresh()
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, [refresh]);

  const authenticate = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      const data = await api.post<{ token: string }>(path, body);
      tokenStore.set(data.token);
      // read the account back rather than trusting the sign-in response: it is
      // the one place that knows whether onboarding and consent are current
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: (email, password) => authenticate('/api/auth/login', { email, password }),
      register: (email, password, acceptPrivacyVersion) =>
        authenticate('/api/auth/register', { email, password, acceptPrivacyVersion }),
      logout: () => {
        tokenStore.clear();
        setUser(null);
      },
      refresh,
    }),
    [user, loading, authenticate, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
