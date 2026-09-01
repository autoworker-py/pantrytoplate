import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, tokenStore } from './api';

let calls: { method: string; url: string }[] = [];

/** Count only the reads of a path, so a write to the same path is not miscounted. */
const gets = (url: string) => calls.filter((c) => c.method === 'GET' && c.url === url).length;

function jsonResponse(body: unknown) {
  return {
    status: 200,
    ok: true,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  calls = [];
  // re-stubbed per test: afterEach unstubs globals, so a one-time
  // beforeAll stub would vanish after the first case
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  api.invalidate();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string }) => {
      calls.push({ method: init?.method ?? 'GET', url });
      return jsonResponse({ items: ['milk'], call: calls.length });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('response cache', () => {
  it('serves a repeat read from memory instead of the network', async () => {
    await api.get('/api/inventory');
    await api.get('/api/inventory');
    await api.get('/api/inventory');
    // this is the whole point: switching tabs must not refetch what we have
    expect(calls).toHaveLength(1);
  });

  it('keeps different paths apart', async () => {
    await api.get('/api/inventory');
    await api.get('/api/recipes');
    expect(calls).toHaveLength(2);
  });

  it('collapses concurrent reads of the same path into one request', async () => {
    await Promise.all([
      api.get('/api/inventory'),
      api.get('/api/inventory'),
      api.get('/api/inventory'),
    ]);
    expect(calls).toHaveLength(1);
  });

  it('refetches after a write, so a change is never hidden by the cache', async () => {
    await api.get('/api/inventory');
    expect(calls).toHaveLength(1);

    await api.post('/api/inventory', { name: 'eggs' });
    await api.get('/api/inventory');
    // the POST must have emptied the cache, forcing a genuine second read
    expect(gets('/api/inventory')).toBe(2);
  });

  it.each(['patch', 'put', 'delete'] as const)('invalidates after %s too', async (method) => {
    await api.get('/api/inventory');
    if (method === 'delete') await api.delete('/api/inventory/1');
    else await api[method]('/api/inventory/1', { qty: 2 });
    await api.get('/api/inventory');
    expect(gets('/api/inventory')).toBe(2);
  });

  it('empties the cache on sign-out so one account cannot see another', async () => {
    await api.get('/api/inventory');
    tokenStore.clear();
    await api.get('/api/inventory');
    expect(calls).toHaveLength(2);
  });

  it('empties the cache when a new token is stored', async () => {
    await api.get('/api/inventory');
    tokenStore.set('a-different-users-token');
    await api.get('/api/inventory');
    expect(calls).toHaveLength(2);
  });

  it('hands out a copy, so a caller cannot corrupt the cache', async () => {
    const first = await api.get<{ items: string[] }>('/api/inventory');
    first.items.push('tampered');
    const second = await api.get<{ items: string[] }>('/api/inventory');
    expect(second.items).toEqual(['milk']);
  });

  it('getFresh bypasses the cache entirely', async () => {
    await api.get('/api/inventory');
    await api.getFresh('/api/inventory');
    expect(calls).toHaveLength(2);
  });
});

describe('request timeout', () => {
  it('gives up rather than hanging, so a stall cannot freeze the app', async () => {
    vi.useFakeTimers();
    // a request that never answers, but honours cancellation — the situation
    // that left the app showing a blank "Loading…" for iOS's full 60s default
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      ),
    );

    const pending = api.get('/api/auth/me').catch((error) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = (await pending) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('timeout');
    vi.useRealTimers();
  });
});
