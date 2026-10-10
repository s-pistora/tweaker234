import { describe, expect, it } from 'vitest';
import { hledej, normalizuj, vytvorIndex, type Polozka } from '../src/lib/hledani.ts';

const P: Polozka[] = [
  { typ: 'Obec', nazev: 'Karlovy Vary', meta: 'ORP Karlovy Vary', cil: { kind: 'obec', kod: '554961' } },
  { typ: 'Obec', nazev: 'Nová Role', meta: 'ORP Karlovy Vary', cil: { kind: 'obec', kod: '555428' } },
  { typ: 'Místo', nazev: 'Hrad Loket', meta: 'Hrady a zámky · Loket', cil: { kind: 'misto', id: 'h:1' } },
  { typ: 'Střední škola', nazev: 'Gymnázium Cheb', meta: 'Cheb', cil: { kind: 'skola', izo: '1' } },
  { typ: 'Střední škola', nazev: 'Gymnázium Cheb', meta: 'Cheb', cil: { kind: 'skola', izo: '1' } },
];

describe('hledání', () => {
  it('normalizuje diakritiku a mezery', () => {
    expect(normalizuj('  Žluťoučký   KŮŇ ')).toBe('zlutoucky kun');
  });
  it('najde bez diakritiky, řadí shodu na začátku názvu dopředu, odstraní duplicity', () => {
    const ix = vytvorIndex(P);
    expect(ix).toHaveLength(4);
    expect(hledej(ix, 'karlovy').map((r) => r.nazev)).toEqual(['Karlovy Vary', 'Nová Role']);
    expect(hledej(ix, 'gymnazium')).toHaveLength(1);
    expect(hledej(ix, 'loket hrad')[0].nazev).toBe('Hrad Loket');
  });
  it('krátký dotaz nic nevrací', () => {
    expect(hledej(vytvorIndex(P), 'k')).toEqual([]);
  });
});
