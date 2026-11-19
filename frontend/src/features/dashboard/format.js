/**
 * Formatting for dashboard numbers: durations from the server's median seconds, and how long ago something was.
 */

const UNITS = [['d', 86400], ['h', 3600], ['m', 60]];

/**
 * A duration in its two largest units, e.g. 90061 → "1d 1h", 3600 → "1h", 45 → "45s".
 * @param {number|null} seconds - null means nothing to measure.
 * @returns {string} "—" for null.
 */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const parts = [];
  let rest = Math.round(seconds);
  UNITS.forEach(([unit, size]) => {
    const amount = Math.floor(rest / size);
    rest -= amount * size;
    if (amount && parts.length < 2) parts.push(`${amount}${unit}`);
    else if (parts.length === 1) parts.push(null); // a gap (e.g. 1d 0h 5m) stops at the larger unit
  });
  return parts.filter(Boolean).join(' ');
}

/**
 * How long ago a timestamp was, e.g. "3d ago".
 * @param {string} iso
 * @param {number} [now] - for tests.
 * @returns {string}
 */
export function formatAge(iso, now = Date.now()) {
  // The API sends "2026-11-15 14:56:51+00:00"; a T instead of the space parses in every browser.
  return `${formatDuration((now - new Date(iso.replace(' ', 'T')).getTime()) / 1000)} ago`;
}
