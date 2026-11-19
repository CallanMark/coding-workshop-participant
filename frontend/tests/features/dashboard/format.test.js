import { describe, expect, it } from 'vitest';
import { formatAge, formatDuration } from '../../../src/features/dashboard/format';

describe('dashboard formatting', () => {
  it.each([
    [null, '—'],
    [0, '0s'],
    [45, '45s'],
    [3600, '1h'],
    [3660, '1h 1m'],
    [90061, '1d 1h'],
    [86700, '1d'], // 1d 0h 5m: stops at the gap
  ])('shows %s seconds as %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });

  it('shows how long ago, from the API timestamp format', () => {
    const now = Date.parse('2026-11-19T12:00:00Z');
    expect(formatAge('2026-11-17 12:00:00.123456+00:00', now)).toBe('2d ago');
  });
});
