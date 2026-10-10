import { describe, expect, it } from 'vitest';
import { mapyTrasa, naplanujDen } from '../src/lib/den.ts';
import type { Misto } from '../src/lib/types.ts';

const m = (id: string, kat: Misto['kat'], lat: number, lon: number): Misto => ({
  id, kat, nazev: id, lat, lon, obec: null, obecNazev: '', orp: null, popis: null, web: null, tel: null, email: null,
  provozovatel: null, adresa: null, tagy: [], vstupne: null, cisla: {}, poznamka: null, sourceId: 'x',
});
const DOMA = { lat: 50.08, lon: 12.37 };
const MISTA = [
  m('Hrad', 'hrady-zamky', 50.079, 12.373),
  m('Muzeum', 'muzea', 50.081, 12.37),
  m('Rozhledna', 'rozhledny', 50.1, 12.4),
  m('Daleká rozhledna', 'rozhledny', 50.4, 13.0),
  m('Pivovar', 'pivovary', 50.12, 12.43),
  m('Sjezdovka', 'sjezdovky', 50.08, 12.37),
];

describe('naplánujte mi den', () => {
  it('vybere po jedné zastávce do každé části dne, jen v dosahu', () => {
    const d = naplanujDen(MISTA, DOMA, 20)!;
    expect(d.zastavky.map((z) => z.cas)).toEqual(['Dopoledne', 'Odpoledne', 'Na závěr']);
    expect(d.zastavky[1].misto.nazev).toBe('Rozhledna');
    expect(d.zastavky.some((z) => z.misto.kat === 'sjezdovky')).toBe(false);
    expect(d.celkemKm).toBeGreaterThan(0);
  });
  it('jiná varianta dá jiné dopoledne, stejná varianta stejný den', () => {
    const a = naplanujDen(MISTA, DOMA, 20, 0)!;
    const b = naplanujDen(MISTA, DOMA, 20, 1)!;
    expect(a.zastavky[0].misto.id).not.toBe(b.zastavky[0].misto.id);
    expect(naplanujDen(MISTA, DOMA, 20, 1)).toEqual(b);
  });
  it('bez míst v dosahu vrátí null', () => {
    expect(naplanujDen(MISTA, { lat: 49, lon: 15 }, 10)).toBeNull();
  });
  it('odkaz na Mapy.cz vede okruhem z domova zpět', () => {
    const u = new URL(mapyTrasa(DOMA, [{ lat: 50.1, lon: 12.4 }]));
    expect(u.hostname).toBe('mapy.cz');
    expect(u.searchParams.get('start')).toBe(u.searchParams.get('end'));
    expect(u.searchParams.get('waypoints')).toBe('12.40000,50.10000');
  });
});
