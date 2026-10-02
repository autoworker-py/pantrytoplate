import { describe, expect, it } from 'vitest';
import { fastingState, span } from './fasting';

const at = (hours: number, minutes = 0) => new Date(2026, 9, 2, hours, minutes);

describe('the fasting clock, 16:8 eating from noon', () => {
  it('is fasting before the window, since the last one closed', () => {
    const state = fastingState('16:8', '12:00', at(10));
    expect(state.phase).toBe('fasting');
    expect(state.since).toEqual(new Date(2026, 9, 1, 20, 0));
    expect(state.until).toEqual(at(12));
  });

  it('is the eating window from noon to eight', () => {
    expect(fastingState('16:8', '12:00', at(13))).toEqual({ phase: 'eating', since: at(12), until: at(20) });
  });

  it('is fasting again after eight, until noon tomorrow', () => {
    const state = fastingState('16:8', '12:00', at(21, 30));
    expect(state).toEqual({ phase: 'fasting', since: at(20), until: new Date(2026, 9, 3, 12, 0) });
  });

  it('says a span in hours and minutes', () => {
    expect(span((13 * 60 + 20) * 60_000)).toBe('13:20');
    expect(span(-5)).toBe('0:00');
  });
});
