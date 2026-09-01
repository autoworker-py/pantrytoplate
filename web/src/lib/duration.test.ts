import { describe, expect, it } from 'vitest';
import { describeDuration, formatClock, parseDuration } from './duration';

describe('parseDuration', () => {
  it('reads plain digits', () => {
    expect(parseDuration('Simmer 18 minutes')).toBe(18 * 60);
    expect(parseDuration('Rest 5 minutes')).toBe(5 * 60);
    expect(parseDuration('Blanch for 45 seconds')).toBe(45);
    expect(parseDuration('Bake 1 hour')).toBe(3600);
  });

  it('reads numbers written as words', () => {
    // the reported bug: a spelled-out step offered no timer at all
    expect(parseDuration('Cook for thirty-five minutes')).toBe(35 * 60);
    expect(parseDuration('Cook for thirty five minutes')).toBe(35 * 60);
    expect(parseDuration('Simmer twenty minutes')).toBe(20 * 60);
    expect(parseDuration('Rest for five minutes')).toBe(5 * 60);
    expect(parseDuration('Leave for ninety seconds')).toBe(90);
    expect(parseDuration('Bake for one hour')).toBe(3600);
  });

  it('treats an article as one', () => {
    expect(parseDuration('Rest for a minute')).toBe(60);
    expect(parseDuration('Bake for an hour')).toBe(3600);
  });

  it('handles the fractional hours people actually write', () => {
    expect(parseDuration('Chill for half an hour')).toBe(1800);
    expect(parseDuration('Roast for an hour and a half')).toBe(5400);
    expect(parseDuration('Prove for a quarter of an hour')).toBe(900);
  });

  it('times the upper bound of a range so the cook is never cut short', () => {
    expect(parseDuration('Bake 10-12 minutes')).toBe(12 * 60);
    expect(parseDuration('Bake 10 to 12 minutes')).toBe(12 * 60);
    expect(parseDuration('Grill four or five minutes')).toBe(5 * 60);
    expect(parseDuration('Bake ten–twelve minutes')).toBe(12 * 60);
  });

  it('joins the parts of one duration', () => {
    expect(parseDuration('Roast 1 hour 30 minutes')).toBe(5400);
    expect(parseDuration('Roast 1 hour and 30 minutes')).toBe(5400);
    expect(parseDuration('Roast two hours and forty minutes')).toBe(2 * 3600 + 40 * 60);
  });

  it('does not add two separate durations together', () => {
    // one step, two unrelated waits: timing 25 minutes would ruin the dish
    expect(parseDuration('Bake 20 minutes, then rest 5 minutes')).toBe(20 * 60);
    expect(parseDuration('Fry 3 minutes per side, then drain 2 minutes')).toBe(3 * 60);
  });

  it('refuses to invent a duration', () => {
    expect(parseDuration('Season generously with salt')).toBeNull();
    expect(parseDuration('Serve immediately')).toBeNull();
    expect(parseDuration('Add 2 cups of flour')).toBeNull();
    // a clock time is not a duration, and a bad compound is refused
    // rather than quietly downgraded to the first number it recognises
    expect(parseDuration('Chill until five thirty minutes')).toBeNull();
  });

  it('accepts abbreviations and mixed case', () => {
    expect(parseDuration('SIMMER 15 MINS')).toBe(15 * 60);
    expect(parseDuration('Rest 30 sec')).toBe(30);
    expect(parseDuration('Bake 2 hrs')).toBe(2 * 3600);
  });
});

describe('formatClock', () => {
  it('shows minutes and seconds below an hour', () => {
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(9)).toBe('0:09');
  });

  it('shows hours when there are any', () => {
    expect(formatClock(5400)).toBe('1:30:00');
  });

  it('never shows a negative clock', () => {
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('describeDuration', () => {
  it('names the duration the way the button reads', () => {
    expect(describeDuration(35 * 60)).toBe('35 minute');
    expect(describeDuration(3600)).toBe('1 hour');
    expect(describeDuration(5400)).toBe('1h 30m');
    expect(describeDuration(45)).toBe('45 second');
  });
});
