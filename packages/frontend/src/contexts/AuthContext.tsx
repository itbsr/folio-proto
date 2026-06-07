import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@my-app/shared';
import client from '../lib/hc';

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.api.auth.me.$get()
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setUser(data.user as User))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await client.api.auth.login.$post({ json: { email, password } });
    if (!res.ok) {
      const data = await res.json() as { error: string };
      throw new Error(data.error);
    }
    const data = await res.json() as { user: User };
    setUser(data.user);
  };

  const logout = async () => {
    await client.api.auth.logout.$post();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
