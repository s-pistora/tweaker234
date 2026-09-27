import { describe, it, expect } from 'vitest';
import { zoomViewBox, easeInOut } from '../../src/lib/map/zoom.ts';

type VB = [number, number, number, number];
const from: VB = [0, 0, 100, 100];
const to: VB = [20, 40, 10, 20];

describe('zoomViewBox', () => {
  it('t=0 → from', () => expect(zoomViewBox(from, to, 0)).toEqual(from));
  it('t=1 → to', () => expect(zoomViewBox(from, to, 1)).toEqual(to));
  it('t=0.5 → přesně mezi (ease-in-out je symetrický)', () => {
    expect(zoomViewBox(from, to, 0.5)).toEqual([10, 20, 55, 60]);
  });
  it('t mimo [0,1] se ořízne', () => {
    expect(zoomViewBox(from, to, -1)).toEqual(from);
    expect(zoomViewBox(from, to, 2)).toEqual(to);
  });
  it('ease-in-out: pomalý začátek i konec', () => {
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
  });
});
