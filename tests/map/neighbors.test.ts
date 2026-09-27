import { describe, it, expect } from 'vitest';
import { neighborInDirection } from '../../src/lib/map/neighbors.ts';

// Souřadnice obrazovky (y roste dolů), zhruba rozmístění krajů ČR.
const c: Record<string, [number, number]> = {
  CZ041: [20, 60], // Karlovarský – nejzápadnější
  CZ042: [90, 30], // Ústecký
  CZ032: [60, 110], // Plzeňský
  CZ010: [160, 70], // Praha
  CZ031: [150, 160], // Jihočeský
};

describe('neighborInDirection', () => {
  it('z CZ041 doleva → null (nejzápadnější)', () => {
    expect(neighborInDirection(c, 'CZ041', 'left')).toBeNull();
  });

  it('z CZ041 doprava → nejbližší centroid v kuželu ±45°', () => {
    // CZ042 (dx 70, dy -30) i CZ010 (dx 140, dy 10) jsou v kuželu; CZ042 je blíž.
    expect(neighborInDirection(c, 'CZ041', 'right')).toBe('CZ042');
  });

  it('mimo kužel se nebere (CZ032 je spíš dolů než doprava)', () => {
    // CZ032: dx 40, dy 50 → úhel > 45° od "doprava"
    expect(neighborInDirection(c, 'CZ041', 'down')).toBe('CZ032');
  });

  it('nahoru / dolů používá souřadnice obrazovky (y dolů)', () => {
    expect(neighborInDirection(c, 'CZ032', 'up')).toBe('CZ041');
    expect(neighborInDirection(c, 'CZ042', 'up')).toBeNull();
  });

  it('neznámé výchozí území → null', () => {
    expect(neighborInDirection(c, 'XX', 'right')).toBeNull();
  });
});
