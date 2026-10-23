import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5193').trim().replace(/\/swagger\/index\.html\/?$/i, '').replace(/\/+$/, '');
const ACCESS_KEY = 'mindmatch.access';
const REFRESH_KEY = 'mindmatch.refresh';
let refreshTask: Promise<string | null> | null = null;
let refreshEpoch = -1;
const tokenCache = new Map<string, string | null>();
const tokenReads = new Map<string, Promise<string | null>>();
let tokenGeneration = 0;
let sessionEpoch = 0;
let tokenWriteTask: Promise<void> = Promise.resolve();
const expiryListeners = new Set<() => void>();
const accessListeners = new Set<(token: string | null) => void>();
export function onAccessTokenChanged(listener: (token: string | null) => void) {
  accessListeners.add(listener);
  return () => { accessListeners.delete(listener); };
}
export function onSessionExpired(listener: () => void) {
  expiryListeners.add(listener);
  return () => { expiryListeners.delete(listener); };
}

export async function expireSession(expectedEpoch = sessionEpoch) {
  if (expectedEpoch !== sessionEpoch) return;
  const clearing = sessionTokens.clear();
  expiryListeners.forEach(listener => listener());
  await clearing;
}

export function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const payload = body as Record<string, unknown>;
  if (payload.errors && typeof payload.errors === 'object') {
    const details = Object.values(payload.errors).flat().filter((value): value is string => typeof value === 'string');
    if (details.length) return details.join('\n');
  }
  for (const key of ['message', 'detail', 'title']) {
    if (typeof payload[key] === 'string' && payload[key]) return payload[key] as string;
  }
  return fallback;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiError'; }
}

async function readToken(key: string): Promise<string | null> {
  if (tokenCache.has(key)) return tokenCache.get(key) ?? null;
  const inFlight = tokenReads.get(key);
  if (inFlight) return inFlight;
  const generation = tokenGeneration;
  const read = (Platform.OS === 'web'
    ? Promise.resolve(typeof localStorage === 'undefined' ? null : localStorage.getItem(key))
    : SecureStore.getItemAsync(key)).then(value => {
      if (generation !== tokenGeneration) return tokenCache.get(key) ?? null;
      tokenCache.set(key, value);
      return value;
    }).finally(() => { if (tokenReads.get(key) === read) tokenReads.delete(key); });
  tokenReads.set(key, read);
  return read;
}

function writeTokens(access: string | null, refresh: string | null) {
  const generation = ++tokenGeneration;
  tokenReads.clear();
  tokenCache.set(ACCESS_KEY, access);
  tokenCache.set(REFRESH_KEY, refresh);
  accessListeners.forEach(listener => listener(access));
  const write = tokenWriteTask.catch(() => {}).then(async () => {
    for (const [key, value] of [[ACCESS_KEY, access], [REFRESH_KEY, refresh]] as const) {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }
      } else if (value === null) await SecureStore.deleteItemAsync(key);
      else await SecureStore.setItemAsync(key, value);
    }
  }).catch(error => {
    if (generation === tokenGeneration) {
      tokenCache.set(ACCESS_KEY, null);
      tokenCache.set(REFRESH_KEY, null);
      accessListeners.forEach(listener => listener(null));
    }
    throw error;
  });
  tokenWriteTask = write;
  return write;
}

export const sessionTokens = {
  version() { return sessionEpoch; },
  access: () => readToken(ACCESS_KEY),
  refresh: () => readToken(REFRESH_KEY),
  save(access: string, refresh: string, rotating = false) {
    if (!rotating) sessionEpoch++;
    return writeTokens(access, refresh);
  },
  clear() { sessionEpoch++; return writeTokens(null, null); },
};

// Revoke the captured session even after local credentials have been cleared.
// This operation must never inherit a newer account's access token.
export async function revokeRefreshToken(refreshToken: string, accessToken: string | null) {
  if (!accessToken) return;
  const response = await fetch(`${API_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok && response.status !== 401) throw new ApiError('Sunucudaki oturum kapatılamadı.', response.status);
}

export async function refreshAccessToken(rejectedToken?: string, expectedEpoch = sessionEpoch): Promise<string | null> {
  if (expectedEpoch !== sessionEpoch) throw new ApiError('Oturum değişti. Tekrar dene.', 499);
  const current = await sessionTokens.access();
  if (expectedEpoch !== sessionEpoch) throw new ApiError('Oturum değişti. Tekrar dene.', 499);
  if (rejectedToken && current && current !== rejectedToken) return current;
  if (!refreshTask || refreshEpoch !== expectedEpoch) {
    refreshEpoch = expectedEpoch;
    const task = (async () => {
      const refreshToken = await sessionTokens.refresh();
      if (expectedEpoch !== sessionEpoch) throw new ApiError('Oturum değişti. Tekrar dene.', 499);
      if (!refreshToken) return null;
      const generation = tokenGeneration;
      try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }), signal: AbortSignal.timeout(15000) });
        if (!response.ok) {
          if (generation !== tokenGeneration) return null;
          if ([400, 401, 403].includes(response.status)) { await expireSession(expectedEpoch); return null; }
          throw new ApiError('Oturum şu anda yenilenemiyor. Tekrar dene.', response.status);
        }
        const auth = await response.json();
        if (generation !== tokenGeneration) return null;
        if (typeof auth.accessToken !== 'string' || typeof auth.refreshToken !== 'string') throw new ApiError('Oturum yanıtı okunamadı.', 502);
        await sessionTokens.save(auth.accessToken, auth.refreshToken, true);
        return auth.accessToken as string;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('Oturum yenilemek için sunucuya bağlanılamadı. Tekrar dene.', 0);
      }
    })();
    const tracked = task.finally(() => { if (refreshTask === tracked) refreshTask = null; });
    refreshTask = tracked;
  }
  return refreshTask;
}

export async function freshAccessToken() {
  const epoch = sessionEpoch;
  const access = await sessionTokens.access();
  if (epoch !== sessionEpoch) throw new ApiError('Oturum değişti. Tekrar dene.', 499);
  if (!access) return null;
  let expiresAt: number | undefined;
  try {
    const payload = access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    expiresAt = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).exp;
  } catch { return access; }
  const next = typeof expiresAt === 'number' && expiresAt * 1000 <= Date.now() + 30_000
    ? await refreshAccessToken(access, epoch) : access;
  if (epoch !== sessionEpoch) throw new ApiError('Oturum değişti. Tekrar dene.', 499);
  return next;
}

export async function api<T>(path: string, options: RequestInit = {}, allowRefresh = true): Promise<T> {
  const epoch = sessionEpoch;
  const headers = new Headers(options.headers || {});
  const access = await sessionTokens.access();
  if (epoch !== sessionEpoch) throw new ApiError('Oturum değişti. Tekrar dene.', 499);
  if (access) headers.set('Authorization', `Bearer ${access}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response: Response;
  const isFileUpload = options.body instanceof FormData;
  try { response = await fetch(`${API_URL}${path}`, { ...options, headers, signal: options.signal || AbortSignal.timeout(isFileUpload ? 120000 : 20000) }); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'Sunucu zaman aşımına uğradı.' : 'Sunucuya bağlanılamadı. Biraz sonra tekrar dene.', 0);
  }
  if (epoch !== sessionEpoch) throw new ApiError('Oturum değişti. Tekrar dene.', 499);
  if (response.status === 401 && allowRefresh && access) {
    const next = await refreshAccessToken(access, epoch);
    if (epoch !== sessionEpoch) throw new ApiError('Oturum değişti. Tekrar dene.', 499);
    if (next) return api<T>(path, options, false);
    await expireSession(epoch);
    throw new ApiError('Oturum yenilenemedi. Yeniden giriş yapıp tekrar dene.', 401);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401 && access && (!path.startsWith('/api/auth/') || path === '/api/auth/me')) await expireSession(epoch);
    const message = apiErrorMessage(body, `İstek başarısız (${response.status})`);
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (epoch !== sessionEpoch) throw new ApiError('Oturum değişti. Tekrar dene.', 499);
  if (!text.trim()) return undefined as T;
  try { return JSON.parse(text) as T; }
  catch { throw new ApiError('Sunucudan beklenmeyen bir yanıt alındı.', 502); }
}

export const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

