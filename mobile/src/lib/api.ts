import { create, isAxiosError, type AxiosError } from 'axios';
import { API_URL, REQUEST_TIMEOUT_MS } from './config';
import { getToken } from './storage';

/**
 * The shared axios instance, deliberately the same shape as
 * frontend/utils/api.ts so the two clients behave alike.
 *
 * Two differences from the web version, both forced by the platform:
 *
 *   1. Reading the token is **async**. `localStorage.getItem` is synchronous;
 *      the keychain is not. So the request interceptor is an async function,
 *      which axios supports — it awaits a promise returned from it.
 *
 *   2. There is no global `logout()` redirect to call on a 401. The web
 *      interceptor reaches for `window.location`; here, navigation belongs to
 *      the router and auth state belongs to a context. The interceptor
 *      therefore does nothing but tag the error, and `AuthProvider`
 *      subscribes to that tag.
 */
const api = create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Callbacks run when the API says our token is no longer good. */
const unauthorizedHandlers = new Set<() => void>();

export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // `/auth/*` is exempt so the login screen can render its own message for a
    // bad password instead of being logged out mid-login — the same exemption
    // the web client makes.
    const url = error.config?.url ?? '';
    if (error.response?.status === 401 && !url.startsWith('/auth/')) {
      unauthorizedHandlers.forEach((handler) => handler());
    }
    return Promise.reject(error);
  },
);

/**
 * A message worth showing a person, out of whatever the API or the network
 * produced.
 *
 * The backend speaks three dialects of failure: express-validator returns
 * `{ errors: [{ msg }] }`, the controllers return `{ error }`, and a request
 * that never arrived has neither. The third case is the one that matters most
 * on a phone, because it is the normal state in a lift or a tunnel.
 */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!isAxiosError(error)) return fallback;

  const data = error.response?.data as
    | { error?: string; errors?: { msg?: string }[] }
    | undefined;

  if (data?.errors?.length) {
    return data.errors.map((e) => e.msg).filter(Boolean).join('\n') || fallback;
  }
  if (data?.error) return data.error;

  if (error.code === 'ECONNABORTED') {
    return 'The server took too long to answer. It may be waking up — try again.';
  }
  if (!error.response) {
    return `Could not reach the server at ${API_URL}.\n\nIf you are pointing at a local backend, remember the phone cannot see your Mac's localhost — see src/lib/config.ts.`;
  }
  return fallback;
}

export default api;
