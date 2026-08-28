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
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
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

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
