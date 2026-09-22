import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { onUnauthorized } from './api';
import { clearToken, getToken, setToken } from './storage';
import type { LoginResponse, User } from '../types/api';

/**
 * Who is signed in, and how that survives the app being closed.
 *
 * `loading` is not boilerplate: on launch the token lives in the keychain and
 * reading it is asynchronous, so for the first frames the app genuinely does
 * not know whether it has a session. Rendering the login screen during that
 * gap would flash it at an already-signed-in user on every cold start.
 */
interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  // Restore a session, if the keychain still holds a usable token. The token
  // is a 7-day JWT, so this asks the server rather than trusting it blindly.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const { data } = await api.get<{ user: User }>('/auth/profile');
        if (!cancelled) setUser(data.user ?? null);
      } catch {
        // An expired or rejected token is not an error worth showing anyone;
        // it just means the person signs in again.
        if (!cancelled) await clearToken();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 on any non-auth call means the token died mid-session.
  useEffect(() => onUnauthorized(() => void signOut()), [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
    await setToken(data.token);
    setUser(data.user);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
