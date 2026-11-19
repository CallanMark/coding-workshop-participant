import { describe, expect, it } from 'vitest';
import {
  OTHER, SERIES, foldSlices, share,
} from '../../../src/features/dashboard/chartColors';

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i, label: `C${i}`, value: 1 }));

describe('chart helpers', () => {
  it('colours slices in the fixed series order', () => {
    expect(foldSlices(rows(3)).map((s) => s.color)).toEqual(SERIES.slice(0, 3));
  });

  it('folds everything past the palette into a grey Other slice', () => {
    const slices = foldSlices(rows(8));
    expect(slices).toHaveLength(SERIES.length + 1);
    expect(slices.at(-1)).toEqual({
      id: 'other', label: 'Other', value: 3, color: OTHER,
    });
  });

  it('counts the part of a known total that the rows do not cover as Other', () => {
    expect(foldSlices(rows(2), 5).at(-1).value).toBe(3);
    expect(foldSlices(rows(2), 2).map((s) => s.label)).toEqual(['C0', 'C1']);
  });

  it('shows a share as a whole percentage, 0% of nothing', () => {
    expect(share(1, 3)).toBe('33%');
    expect(share(0, 0)).toBe('0%');
  });
});
