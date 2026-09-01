import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { sessionStore, shouldEndSession } from './session';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

const user = { id: 'u1', email: 'a@b.c', onboarded: true, privacyCurrent: true };

describe('shouldEndSession', () => {
  it('ends the session when the server rejects the token', () => {
    expect(shouldEndSession(new ApiError(401, 'unauthorized', 'nope'))).toBe(true);
  });

  it('does NOT end the session when the server was unreachable', () => {
    // the reported bug: opening the app without signal logged you out
    expect(shouldEndSession(new ApiError(0, 'network_error', 'offline'))).toBe(false);
  });

  it('does NOT end the session when the request timed out', () => {
    expect(shouldEndSession(new ApiError(0, 'timeout', 'too slow'))).toBe(false);
  });

  it('does NOT end the session when the server itself is broken', () => {
    expect(shouldEndSession(new ApiError(500, 'server_error', 'boom'))).toBe(false);
    expect(shouldEndSession(new ApiError(502, 'bad_gateway', 'boom'))).toBe(false);
  });

  it('does NOT end the session for an unknown failure', () => {
    expect(shouldEndSession(new Error('something odd'))).toBe(false);
    expect(shouldEndSession(undefined)).toBe(false);
  });
});

describe('sessionStore', () => {
  it('round-trips the account so the app can open without the network', () => {
    sessionStore.set(user);
    expect(sessionStore.get()).toEqual(user);
  });

  it('returns nothing when there is no cached account', () => {
    expect(sessionStore.get()).toBeNull();
  });

  it('refuses a corrupt or half-written record rather than booting on it', () => {
    localStorage.setItem('pantry.user', '{not json');
    expect(sessionStore.get()).toBeNull();
    localStorage.setItem('pantry.user', JSON.stringify({ email: 'no id' }));
    expect(sessionStore.get()).toBeNull();
  });

  it('normalises the gate flags, so a missing one never reads as permission', () => {
    localStorage.setItem('pantry.user', JSON.stringify({ id: 'u1', email: 'a@b.c' }));
    expect(sessionStore.get()).toEqual({
      id: 'u1',
      email: 'a@b.c',
      onboarded: false,
      privacyCurrent: false,
    });
  });

  it('clears', () => {
    sessionStore.set(user);
    sessionStore.clear();
    expect(sessionStore.get()).toBeNull();
  });
});
