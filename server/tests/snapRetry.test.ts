/** The photo reader waits and tries again when Google says it is busy, as Google asks. */
import { describe, expect, it } from 'vitest';
import { RetryableError, withRetries } from '../src/services/snap.js';

describe('trying again after a busy answer', () => {
  it('waits 1, 2 and 4 seconds between tries, then succeeds', async () => {
    const waits: number[] = [];
    let tries = 0;
    const result = await withRetries(async () => {
      tries += 1;
      if (tries < 4) throw new RetryableError(503);
      return 'read';
    }, [1000, 2000, 4000, 8000], async (ms) => { waits.push(ms); });
    expect(result).toBe('read');
    expect(tries).toBe(4);
    expect(waits).toEqual([1000, 2000, 4000]);
  });

  it('gives up after the last wait', async () => {
    let tries = 0;
    await expect(withRetries(async () => { tries += 1; throw new RetryableError(503); }, [1000, 2000, 4000, 8000], async () => undefined)).rejects.toBeInstanceOf(RetryableError);
    expect(tries).toBe(5);
  });

  it('does not retry a request that was simply wrong', async () => {
    let tries = 0;
    await expect(withRetries(async () => { tries += 1; throw new Error('bad request'); }, [1000], async () => undefined)).rejects.toThrow('bad request');
    expect(tries).toBe(1);
  });
});
