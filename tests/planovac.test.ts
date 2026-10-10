import { describe, it, expect } from 'vitest';
import {
  PLAN_MAX,
  TERMINY_2027,
  datumTerminu,
  icsText,
  maJpz,
  oboryPlanu,
  odeber,
  planDoIcs,
  planId,
  posun,
  pridej,
  sanceOboru,
  terminyProPlan,
  zalohaPlanu,
} from '../src/lib/planovac.ts';
import type { Obor } from '../src/lib/types.ts';

function obor(p: Partial<Obor> & { izo: string; kodOboru: string }): Obor {
  return {
    skola: `Škola ${p.izo}, příspěvková organizace`,
    web: '',
    obec: 'Cheb',
    kodObce: '554481',
    orp: '4102',
    lon: 12.37,
    lat: 50.08,
    nazevOboru: `Obor ${p.kodOboru}`,
    skupina: p.kodOboru.slice(0, 2),
    typ: 'maturita',
    druh: 'střední s maturitní zkouškou',
    delka: 'čtyřleté',
    forma: 'denní',
    zamer: { 2024: 30, 2025: 30, 2026: 30 },
    prijato2025: 30,
    zastavky500m: 2,
    nejblizsiZastavkaM: 100,
    ...p,
  };
}

const plny = obor({ izo: '1', kodOboru: '18-20-M/01', prijato2025: 40 });
const skoroPlny = obor({ izo: '2', kodOboru: '18-20-M/01', prijato2025: 28 });
const volny = obor({ izo: '3', kodOboru: '18-20-M/01', prijato2025: 10 });
const daleko = obor({ izo: '4', kodOboru: '18-20-M/01', prijato2025: 5, lat: 50.4, lon: 13.1 });
const vyucni = obor({ izo: '5', kodOboru: '23-51-H/01', typ: 'vyucni', prijato2025: 30 });
const gympl8 = obor({ izo: '6', kodOboru: '79-41-K/81', delka: 'osmileté' });
const domov = { lat: 50.08, lon: 12.37 };

describe('plán – úpravy', () => {
  it('id obsahuje IZO, kód oboru i formu', () => {
    expect(planId(plny)).toBe('1_18-20-M/01_d');
    expect(planId({ ...plny, forma: 'ostatní' })).toBe('1_18-20-M/01_o');
  });
  it('přidá nejvýš PLAN_MAX oborů bez duplicit', () => {
    let p: string[] = [];
    for (const o of [plny, plny, skoroPlny, volny, daleko]) p = pridej(p, planId(o));
    expect(p).toHaveLength(PLAN_MAX);
    expect(new Set(p).size).toBe(p.length);
  });
  it('posun a odebrání', () => {
    const p = [planId(plny), planId(skoroPlny), planId(volny)];
    expect(posun(p, planId(volny), -1)).toEqual([planId(plny), planId(volny), planId(skoroPlny)]);
    expect(posun(p, planId(plny), -1)).toEqual(p);
    expect(odeber(p, planId(skoroPlny))).toEqual([planId(plny), planId(volny)]);
  });
  it('oboryPlanu drží pořadí a vynechá neznámé id', () => {
    expect(oboryPlanu([planId(volny), 'x', planId(plny)], [plny, volny]).map((o) => o.izo)).toEqual(['3', '1']);
  });
});

describe('šance a záloha', () => {
  it('šance podle loňské obsazenosti', () => {
    expect(sanceOboru(plny).trida).toBe('pretlak');
    expect(sanceOboru(skoroPlny).trida).toBe('ok');
    expect(sanceOboru(volny).veta).toContain('20 z 30');
    expect(sanceOboru(obor({ izo: '9', kodOboru: '18-20-M/01', prijato2025: null })).trida).toBe('na');
  });
  it('plán bez volných míst → upozornění a alternativy v dosahu', () => {
    const r = zalohaPlanu([plny, skoroPlny], [plny, skoroPlny, volny, daleko, vyucni], domov, 25);
    expect(r.upozorneni.join(' ')).toMatch(/volná místa/);
    expect(r.alternativy.map((a) => a.obor.izo)).toEqual(['3']);
  });
  it('plán s jistotou → bez alternativ', () => {
    const r = zalohaPlanu([plny, volny, skoroPlny], [plny, skoroPlny, volny, daleko], domov, 80);
    expect(r.alternativy).toHaveLength(0);
    expect(r.upozorneni).toHaveLength(0);
  });
});

describe('termíny', () => {
  it('jednotná zkouška jen u maturitních oborů mimo skupinu 82', () => {
    expect(maJpz(plny)).toBe(true);
    expect(maJpz(vyucni)).toBe(false);
    expect(maJpz(obor({ izo: '7', kodOboru: '82-41-M/01' }))).toBe(false);
  });
  it('výuční list → bez termínů JPZ; 8leté gymnázium → víceleté termíny', () => {
    expect(terminyProPlan([vyucni]).map((t) => t.id)).toEqual(['prihlasky', 'skolni']);
    const ids = terminyProPlan([gympl8]).map((t) => t.id);
    expect(ids).toContain('jpzv-1');
    expect(ids).not.toContain('jpz4-1');
    expect(ids).toContain('jpz-nahradni');
  });
  it('datum česky', () => {
    expect(datumTerminu({ od: '2027-04-12', do: '2027-04-12' })).toBe('12. dubna 2027');
    expect(datumTerminu({ od: '2027-02-01', do: '2027-02-20' })).toBe('1.–20. února 2027');
    expect(datumTerminu({ od: '2027-03-15', do: '2027-04-23' })).toBe('15. března – 23. dubna 2027');
  });
});

describe('iCalendar', () => {
  const ics = planDoIcs([plny, volny], TERMINY_2027, new Date('2026-10-10T12:00:00Z'));
  it('platná struktura s CRLF a událostí za každý termín', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(TERMINY_2027.length);
    expect(ics).toContain('DTSTAMP:20261010T120000Z');
  });
  it('celodenní událost končí den po posledním dni', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20270201\r\nDTEND;VALUE=DATE:20270221');
  });
  it('řádky mají nejvýš 75 oktetů', () => {
    const enc = new TextEncoder();
    for (const r of ics.split('\r\n')) expect(enc.encode(r).length).toBeLessThanOrEqual(75);
  });
  it('escapuje speciální znaky', () => {
    expect(icsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
});
