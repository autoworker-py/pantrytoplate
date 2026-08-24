import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore } from './api';

interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: { id: string; email: string } }>('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const authenticate = useCallback(async (path: string, email: string, password: string) => {
    const data = await api.post<{ token: string; user: User }>(path, { email, password });
    tokenStore.set(data.token);
    setUser(data.user);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: (email, password) => authenticate('/api/auth/login', email, password),
      register: (email, password) => authenticate('/api/auth/register', email, password),
      logout: () => {
        tokenStore.clear();
        setUser(null);
      },
    }),
    [user, loading, authenticate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
