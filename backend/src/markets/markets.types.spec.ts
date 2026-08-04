import { downsample } from './markets.types';

describe('downsample', () => {
  it('returns nothing for no buckets', () => {
    expect(downsample([1, 2, 3], 0)).toEqual([]);
  });

  it('leaves a series shorter than the target alone', () => {
    expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it('produces exactly the requested number of buckets', () => {
    const values = Array.from({ length: 168 }, (_, i) => i);
    expect(downsample(values, 48)).toHaveLength(48);
  });

  it('averages within each bucket', () => {
    expect(downsample([0, 2, 4, 6], 2)).toEqual([1, 5]);
  });

  it('keeps the shape: a rising series stays rising', () => {
    const values = Array.from({ length: 168 }, (_, i) => i);
    const out = downsample(values, 48);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThan(out[i - 1]);
    }
  });

  it('never returns an empty bucket, which would be NaN', () => {
    const out = downsample([1, 2, 3, 4, 5], 4);
    expect(out.every(Number.isFinite)).toBe(true);
  });

  it('copies rather than aliasing the input', () => {
    const values = [1, 2, 3];
    const out = downsample(values, 10);
    out[0] = 99;
    expect(values[0]).toBe(1);
  });
});
