import { describe, it, expect } from 'vitest';
import { quantileClass, classRanges } from '../../src/lib/map/classify.ts';

const fourteen = [12, 3, 7, 1, 14, 9, 5, 11, 2, 8, 13, 4, 10, 6];

describe('quantileClass', () => {
  it('rozdělí 14 hodnot do 5 tříd (každá třída použita, monotónně)', () => {
    const classes = [...fourteen].sort((a, b) => a - b).map((v) => quantileClass(fourteen, v));
    expect(new Set(classes)).toEqual(new Set([0, 1, 2, 3, 4]));
    for (let i = 1; i < classes.length; i++) {
      expect(classes[i]!).toBeGreaterThanOrEqual(classes[i - 1]!);
    }
    expect(quantileClass(fourteen, 1)).toBe(0);
    expect(quantileClass(fourteen, 14)).toBe(4);
  });

  it('null → null (vzor N/A)', () => {
    expect(quantileClass(fourteen, null)).toBeNull();
    expect(quantileClass([1, null, 3], null)).toBeNull();
  });

  it('ignoruje null v seznamu hodnot a nevrací NaN', () => {
    expect(quantileClass([null, 5, null, 10], 10)).toBe(2);
    expect(quantileClass([null, null], 3)).toBe(2);
    expect(quantileClass([], 3)).toBe(2);
  });

  it('shodné hodnoty dostanou stejnou třídu', () => {
    expect(quantileClass([4, 4, 4, 4, 4, 4], 4)).toBe(quantileClass([4, 4, 4, 4, 4, 4], 4));
    const vals = [1, 2, 2, 2, 3];
    expect(quantileClass(vals, 2)).toBe(quantileClass(vals, 2));
  });
});

describe('classRanges', () => {
  it('vrátí min/max pro každou obsazenou třídu', () => {
    const r = classRanges(fourteen);
    expect(r).toHaveLength(5);
    expect(r[0]).toEqual({ min: 1, max: 3 });
    expect(r[4]).toEqual({ min: 13, max: 14 });
  });
  it('neobsazená třída → null', () => {
    const r = classRanges([1, 2]);
    expect(r.filter((x) => x === null).length).toBe(3);
  });
});
