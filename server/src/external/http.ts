import { env } from '../env.js';

export type ExternalOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'offline' | 'timeout' | 'not_found' | 'rate_limited' | 'error'; message: string };

/**
 * Every outbound call goes through here: bounded by a timeout, never throws,
 * and reports a reason the UI can turn into "add it manually instead".
 */
export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<ExternalOutcome<T>> {
  if (env.offlineMode) {
    return { ok: false, reason: 'offline', message: 'OFFLINE_MODE is enabled; external lookups are disabled.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.externalTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (response.status === 404) {
      return { ok: false, reason: 'not_found', message: 'Not found in the external catalog.' };
    }
    if (response.status === 429) {
      return { ok: false, reason: 'rate_limited', message: 'External API rate limit reached. Try again later.' };
    }
    if (!response.ok) {
      return { ok: false, reason: 'error', message: `External API returned ${response.status}.` };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      reason: aborted ? 'timeout' : 'error',
      message: aborted
        ? 'External API did not respond in time.'
        : `External API unreachable: ${(error as Error).message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
