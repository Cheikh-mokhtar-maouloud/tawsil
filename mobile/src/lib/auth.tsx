import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import { registerPushToken } from './push';
import type { User } from './types';

type AuthState = {
  ready: boolean;
  user: User | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const signOut = useCallback(async () => {
    await tokenStore.clear();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const r = await api<{ user: User }>('/auth/me');
    setUser(r.user);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut();
    });
    (async () => {
      try {
        if (await tokenStore.load()) await refresh();
      } catch {
        // الخادم غير متاح أو الجلسة منتهية: نبقى على شاشة الدخول
      } finally {
        setReady(true);
      }
    })();
  }, [refresh, signOut]);

  useEffect(() => {
    if (user) registerPushToken().catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(async (token: string, u: User) => {
    await tokenStore.save(token);
    setUser(u);
  }, []);

  const value = useMemo(() => ({ ready, user, signIn, signOut, setUser, refresh }), [ready, user, signIn, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
