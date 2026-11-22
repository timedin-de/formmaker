import { describe, expect, it } from 'vitest';
import { MAX_SCALE_STEPS, scaleStepCount, scaleValues } from './form.model';

describe('scaleValues', () => {
  it('lists the values from min to max in steps', () => {
    expect(scaleValues({ min: 1, max: 5, step: 1 })).toEqual([1, 2, 3, 4, 5]);
    expect(scaleValues({ min: 0, max: 1, step: 0.1 })).toEqual([
      0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1,
    ]);
  });

  it('keeps a range whose max is off the step grid', () => {
    expect(scaleValues({ min: 0, max: 21, step: 2 })).toEqual([
      0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20,
    ]);
  });

  it('allows a one-value scale', () => {
    expect(scaleValues({ min: 3, max: 3, step: 1 })).toEqual([3]);
  });

  it('rejects more than MAX_SCALE_STEPS values', () => {
    expect(scaleValues({ min: 0, max: MAX_SCALE_STEPS, step: 1 })).toBeNull();
  });

  it('rejects a max below min and a non-positive or non-finite bound', () => {
    expect(scaleValues({ min: 5, max: 1, step: 1 })).toBeNull();
    expect(scaleValues({ min: 0, max: 5, step: 0 })).toBeNull();
    expect(scaleValues({ min: 0, max: 5, step: -1 })).toBeNull();
    expect(scaleValues({ min: 0, max: Infinity, step: 1 })).toBeNull();
    expect(scaleValues({ min: NaN, max: 5, step: 1 })).toBeNull();
  });

  it('rejects a step that leaves the value unchanged', () => {
    expect(scaleValues({ min: 1e17, max: 1e17 + 16, step: 1 })).toBeNull();
    expect(scaleValues({ min: 0, max: 0.004, step: 0.001 })).toBeNull();
  });
});

describe('scaleStepCount', () => {
  it('counts the values scaleValues gives, Infinity when there are none', () => {
    expect(scaleStepCount({ min: 0, max: 21, step: 2 })).toBe(11);
    expect(scaleStepCount({ min: 5, max: 1, step: 1 })).toBe(Infinity);
    // Used to count 1 here while the runner looped forever: 1e17 + 1 === 1e17.
    expect(scaleStepCount({ min: 1e17, max: 1e17, step: 1 })).toBe(Infinity);
  });
});
