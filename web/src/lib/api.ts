/**
 * Tiny typed fetch wrapper.
 *
 * On the web the dev server proxies /api to the backend and production serves
 * both from one origin, so the base is empty. In the native build the frontend
 * lives inside the app bundle and there is no origin to fall back on, so
 * VITE_API_URL is baked in at build time — see web/.env.production.
 */
const BASE = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'pantry.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    invalidateCache();
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    invalidateCache();
  },
};

/*
 * How long to wait before giving up on a request.
 *
 * There was no limit at all, which meant iOS decided for us: URLSession waits
 * sixty seconds by default. A stalled request on app launch therefore showed a
 * blank screen for a full minute. Ten seconds is far longer than a healthy
 * request needs and short enough that a stall is reported while the person is
 * still looking at the screen.
 */
const TIMEOUT_MS = 10_000;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  const controller = new AbortController();
  const expiry = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new ApiError(
        0,
        'timeout',
        `The server took too long to answer${BASE ? ` at ${BASE}` : ''}. Check your connection and try again.`,
      );
    }
    /*
     * fetch only rejects when the request never completed: no network, DNS
     * failure, the server refusing the connection, or CORS blocking it. Saying
     * "something went wrong" for all of that sent us hunting a login bug when
     * the real answer was a header. Name it as a connection problem, and say
     * where it was trying to reach.
     */
    throw new ApiError(
      0,
      'network_error',
      `Could not reach the server${BASE ? ` at ${BASE}` : ''}. Check your connection and try again.`,
    );
  } finally {
    clearTimeout(expiry);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: { error?: string; message?: string; details?: unknown } = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    // an HTML error page from a proxy is not JSON; do not let the parse failure
    // masquerade as whatever the request was trying to do
    throw new ApiError(
      response.status,
      'bad_response',
      `The server replied with something unexpected (${response.status}).`,
    );
  }

  if (!response.ok) {
    if (response.status === 401) tokenStore.clear();
    throw new ApiError(
      response.status,
      payload.error ?? 'error',
      payload.message ?? 'Request failed.',
      payload.details,
    );
  }
  return payload as T;
}


/*
 * Response cache.
 *
 * Every screen refetched everything on mount, so switching tabs re-requested
 * data that had not changed — on a phone, on cellular, against a server in
 * Oregon, that is a visible wait each time for an answer we already had.
 *
 * Reads are served from memory and revalidated behind the scenes. Two rules
 * keep that honest: any write empties the cache, and so does any change of
 * token. The second matters most — a cache that outlived a sign-out would show
 * one account's pantry to the next person to log in.
 */
const FRESH_MS = 15_000;   // serve from memory, do not even revalidate
const STALE_MS = 5 * 60_000; // serve from memory, but refresh in the background

type Entry = { data: unknown; at: number };
const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

/** Hand out a copy: a caller mutating its result must not corrupt the cache. */
function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

export function invalidateCache(): void {
  cache.clear();
  inFlight.clear();
}

async function cachedGet<T>(path: string): Promise<T> {
  const entry = cache.get(path);
  const age = entry ? Date.now() - entry.at : Infinity;

  if (entry && age < STALE_MS) {
    if (age >= FRESH_MS && !inFlight.has(path)) {
      // refresh for the next visit; a failure here must stay silent because
      // the caller already has a usable answer
      const refresh = request<T>('GET', path)
        .then((fresh) => {
          cache.set(path, { data: fresh, at: Date.now() });
          return fresh as unknown;
        })
        .catch(() => entry.data)
        .finally(() => inFlight.delete(path));
      inFlight.set(path, refresh);
    }
    return clone(entry.data) as T;
  }

  // collapse duplicate concurrent requests for the same thing
  const existing = inFlight.get(path);
  if (existing) return clone(await existing) as T;

  const pending = request<T>('GET', path)
    .then((data) => {
      cache.set(path, { data, at: Date.now() });
      return data as unknown;
    })
    .finally(() => inFlight.delete(path));
  inFlight.set(path, pending);
  return clone(await pending) as T;
}

/** Anything that changes server state makes every cached read suspect. */
async function mutate<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await request<T>(method, path, body);
  } finally {
    invalidateCache();
  }
}

export const api = {
  get: <T>(path: string) => cachedGet<T>(path),
  /** Bypasses the cache for a read that must be current. */
  getFresh: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => mutate<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => mutate<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => mutate<T>('PUT', path, body),
  delete: <T>(path: string) => mutate<T>('DELETE', path),
  invalidate: invalidateCache,
};
