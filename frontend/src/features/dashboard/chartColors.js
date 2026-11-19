/**
 * Chart colours, checked with the dataviz palette validator against the white card surface
 * (colour-blind separation and normal-vision distance between neighbouring slices).
 * Every chart also lists its values in a legend, so colour never carries meaning alone.
 */

/** Identity colours (categories, engineers), always assigned in this order. */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

/** The folded "Other" slice: a neutral grey that stays distinct from every series colour. */
export const OTHER = '#c3c2b7';

/** Incident states: blocked reads as trouble. */
export const STATUS_COLORS = { open: '#2a78d6', in_progress: '#1baf7a', blocked: '#e34948' };

/** Priority is ordered, so one blue from light (low) to dark (critical). */
export const PRIORITY_COLORS = {
  low: '#86b6ef', medium: '#5598e7', high: '#256abf', critical: '#104281',
};

/**
 * The first SERIES.length rows as their own slices, the rest folded into "Other".
 * @param {Array<{id: *, label: string, value: number}>} rows - already in display order.
 * @param {number} [total] - the true whole, when `rows` is only part of it (e.g. a top-10 list).
 * @returns {Array<{id: *, label: string, value: number, color: string}>}
 */
export function foldSlices(rows, total) {
  const named = rows.slice(0, SERIES.length).map((row, i) => ({ ...row, color: SERIES[i] }));
  const shown = named.reduce((sum, row) => sum + row.value, 0);
  const rest = (total ?? rows.reduce((sum, row) => sum + row.value, 0)) - shown;
  return rest > 0 ? [...named, {
    id: 'other', label: 'Other', value: rest, color: OTHER,
  }] : named;
}

/**
 * A part's share of the whole as a whole percentage, e.g. "25%".
 * @param {number} value
 * @param {number} total
 * @returns {string}
 */
export function share(value, total) {
  return `${total ? Math.round((value / total) * 100) : 0}%`;
}
