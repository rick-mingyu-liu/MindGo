import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Token storage.
 *
 * The web frontend keeps the JWT in `localStorage`. React Native has no such
 * thing — there is no DOM — so the mobile equivalent is the OS keychain
 * (iOS) or keystore (Android), which `expo-secure-store` wraps. This is the
 * first place the platform forces a real decision rather than a port.
 *
 * `expo-secure-store` has no web implementation at all, so `npm run web`
 * would throw on the first call. The fallback below keeps the web target
 * usable for quick iteration; it is deliberately *not* secure, and web is not
 * a shipping target for this app.
 */
const KEY = 'mindgo.token';

const webStore = {
  getItem: (k: string) => {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      /* private mode, blocked storage — treat as no storage */
    }
  },
  removeItem: (k: string) => {
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {
      /* as above */
    }
  },
};

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') return webStore.getItem(KEY);
  return SecureStore.getItemAsync(KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return webStore.setItem(KEY, token);
  await SecureStore.setItemAsync(KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') return webStore.removeItem(KEY);
  await SecureStore.deleteItemAsync(KEY);
}
