import { describe, expect, it } from 'vitest';
import { FORCE_REFRESH_LABEL, nextRefreshValue } from './refreshLabel';

describe('nextRefreshValue', () => {
  it('is an exact integer string, not floating-point arithmetic', () => {
    // Date.now() * 1e6 lands past Number.MAX_SAFE_INTEGER, so it is a float
    // dressed up as a nanosecond timestamp.
    const value = nextRefreshValue();
    expect(value).toMatch(/^\d+$/);
    expect(value).toBe(String(BigInt(value)));
  });

  it('never repeats, even within one millisecond', () => {
    const values = new Set(Array.from({ length: 500 }, () => nextRefreshValue()));
    expect(values.size).toBe(500);
  });

  it('keeps the nanosecond shape upstream writes', () => {
    expect(nextRefreshValue()).toHaveLength(String(Date.now()).length + 6);
  });
});

describe('FORCE_REFRESH_LABEL', () => {
  it('is the label kubernetes-nmstate watches', () => {
    expect(FORCE_REFRESH_LABEL).toBe('nmstate.io/force-nns-refresh');
  });
});
