// Vzhled bodovych vrstev - musi rozlisit vsech 6 vrstev snapshotu (review finding #3:
// puvodne jen 4 kombinace tón×glyf na 6 vrstev, dve dvojice vypadaly stejne).
import { describe, it, expect } from 'vitest';
import { styleOf, GLYPH_CHAR } from '../../src/lib/map/pointStyle.ts';

const LAYER_IDS = ['skoly', 'socialni', 'zastavky', 'vouchery', 'zdravotnictvi-kraj', 'zdravotnictvi'];

describe('styleOf', () => {
  it('6 vrstev snapshotu dostane 6 vzajemne odlisnych kombinaci tón+glyf', () => {
    const styles = LAYER_IDS.map((_, i) => styleOf(i));
    const keys = styles.map((s) => `${s.tone}:${s.glyph}`);
    expect(new Set(keys).size).toBe(6);
  });

  it('kazdy glyf ma znak v GLYPH_CHAR (pro legendu i tooltip)', () => {
    for (let i = 0; i < LAYER_IDS.length; i++) {
      const { glyph } = styleOf(i);
      expect(typeof GLYPH_CHAR[glyph]).toBe('string');
      expect(GLYPH_CHAR[glyph].length).toBeGreaterThan(0);
    }
  });

  it('cykluje pro vic vrstev nez stylu (deterministicky, ne undefined)', () => {
    const s = styleOf(6);
    expect(s).toEqual(styleOf(0));
  });
});
