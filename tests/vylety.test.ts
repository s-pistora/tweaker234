import { describe, it, expect } from 'vitest';
import type { Misto } from '../src/lib/types.ts';
import {
  KATEGORIE,
  KATEGORIE_BY_ID,
  bezDiakritiky,
  filtrujMista,
  mistaVDosahu,
  plural,
  pocty,
  projdeTagy,
  tagyMista,
  vetaOMiste,
  type FiltrMist,
} from '../src/lib/vylety.ts';

function misto(p: Partial<Misto>): Misto {
  return {
    id: 'x:1',
    kat: 'rozhledny',
    nazev: 'Místo',
    lon: 12.87,
    lat: 50.23,
    obec: '554961',
    obecNazev: 'Karlovy Vary',
    orp: '4103',
    popis: null,
    web: null,
    tel: null,
    email: null,
    provozovatel: null,
    adresa: null,
    tagy: [],
    vstupne: null,
    cisla: {},
    poznamka: null,
    sourceId: 'dz-x',
    ...p,
  };
}

const KV = { lat: 50.2306, lon: 12.8711 }; // Karlovy Vary
const F: FiltrMist = { kat: null, domov: null, maxKm: 30, tagy: [], vstup: 'vse', q: '' };

const diana = misto({ id: 'r:1', nazev: 'Rozhledna Diana', tagy: ['rozhledna'], vstupne: true, lat: 50.219, lon: 12.872 });
const klinovec = misto({ id: 'r:2', nazev: 'Rozhledna Klínovec', obecNazev: 'Jáchymov', tagy: ['rozhledna'], vstupne: true, lat: 50.396, lon: 12.968 });
const vyhlidka = misto({ id: 'r:3', nazev: 'Vyhlídka Aš', obecNazev: 'Aš', tagy: ['vyhlidka', 'nonstop'], vstupne: false, lat: 50.224, lon: 12.195 });
const vlek = misto({ id: 's:1', kat: 'sjezdovky', nazev: 'Skiareál Klínovec', tagy: ['velky', 'lanovka', 'celorocne'], cisla: { vleky: 8, lanovky: 3, pasy: 2 }, lat: 50.39, lon: 12.96 });
const ALL = [diana, klinovec, vyhlidka, vlek];

describe('kategorie', () => {
  it('každá kategorie má unikátní id, ikonu a aspoň jednu skupinu filtrů; tagy voleb jsou v rámci kategorie unikátní', () => {
    expect(new Set(KATEGORIE.map((k) => k.id)).size).toBe(KATEGORIE.length);
    for (const k of KATEGORIE) {
      expect(k.ikona).toMatch(/^M/);
      expect(k.filtry.length).toBeGreaterThan(0);
      const tags = k.filtry.flatMap((g) => g.volby.map((v) => v.tag));
      expect(new Set(tags).size).toBe(tags.length);
      for (const t of tags) expect(t).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('filtrujMista', () => {
  it('bez filtrů vrátí vše seřazené podle názvu', () => {
    expect(filtrujMista(ALL, F).map((r) => r.misto.id)).toEqual(['r:1', 'r:2', 's:1', 'r:3']);
  });
  it('kategorie + vzdálenost: jen rozhledny do 10 km od Karlových Varů, km vyplněné', () => {
    const r = filtrujMista(ALL, { ...F, kat: 'rozhledny', domov: KV, maxKm: 10 });
    expect(r.map((x) => x.misto.id)).toEqual(['r:1']);
    expect(r[0].km).toBeLessThan(2);
  });
  it('řazení od nejbližšího', () => {
    const r = filtrujMista(ALL, { ...F, kat: 'rozhledny', domov: KV, maxKm: 80 });
    expect(r.map((x) => x.misto.id)).toEqual(['r:1', 'r:2', 'r:3']);
  });
  it('tagy: uvnitř skupiny NEBO, mezi skupinami A', () => {
    const typ = filtrujMista(ALL, { ...F, kat: 'rozhledny', tagy: ['rozhledna', 'vyhlidka'] });
    expect(typ).toHaveLength(3);
    const aNonstop = filtrujMista(ALL, { ...F, kat: 'rozhledny', tagy: ['rozhledna', 'nonstop'] });
    expect(aNonstop).toHaveLength(0);
  });
  it('vstupné zdarma / placené (neuvedené se nepočítá ani k jednomu)', () => {
    expect(filtrujMista(ALL, { ...F, kat: 'rozhledny', vstup: 'zdarma' }).map((r) => r.misto.id)).toEqual(['r:3']);
    expect(filtrujMista(ALL, { ...F, kat: 'rozhledny', vstup: 'placene' })).toHaveLength(2);
    expect(filtrujMista([misto({ vstupne: null })], { ...F, vstup: 'zdarma' })).toHaveLength(0);
  });
  it('hledání ignoruje diakritiku a velikost písmen, hledá i v obci', () => {
    expect(filtrujMista(ALL, { ...F, q: 'klinovec' })).toHaveLength(2);
    expect(filtrujMista(ALL, { ...F, q: 'JACHYMOV' }).map((r) => r.misto.id)).toEqual(['r:2']);
    expect(bezDiakritiky('Žluťoučký kůň')).toBe('zlutoucky kun');
  });
});

describe('kvalita vody', () => {
  const koup = (trida: NonNullable<Misto['voda']>['trida']) =>
    misto({ kat: 'koupani', tagy: ['s-provozovatelem'], voda: { trida, datum: '2026-08-18', poznamka: null, zdroj: 'https://khskv.cz' } });
  it('odvozený tag podle poslední třídy', () => {
    expect(tagyMista(koup('vhodna'))).toContain('voda-ok');
    expect(tagyMista(koup('mirne'))).toContain('voda-ok');
    expect(tagyMista(koup('zhorsena'))).toContain('voda-zhorsena');
    expect(tagyMista(koup('nebezpecna'))).toContain('voda-zakaz');
    expect(tagyMista(misto({ kat: 'koupani' }))).toContain('voda-na');
  });
  it('filtr „vhodná ke koupání“ vyřadí zákaz', () => {
    const def = KATEGORIE_BY_ID.koupani;
    expect(projdeTagy(koup('vhodna'), def, ['voda-ok'])).toBe(true);
    expect(projdeTagy(koup('nevhodna'), def, ['voda-ok'])).toBe(false);
  });
  it('věta uvede datum a výsledek odběru', () => {
    expect(vetaOMiste(koup('nebezpecna'), null, '')).toContain('Poslední odběr (18. 8. 2026): voda nebezpečná');
  });
});

describe('pomocné', () => {
  it('mistaVDosahu počítá místa do vzdálenosti od centroidu obce', () => {
    const d = mistaVDosahu([diana, klinovec, vyhlidka], { kv: KV, as: { lat: 50.224, lon: 12.195 } }, 25);
    expect(d.kv).toBe(2);
    expect(d.as).toBe(1);
  });
  it('pocty po kategoriích (i nulové)', () => {
    const p = pocty(ALL);
    expect(p.rozhledny).toBe(3);
    expect(p.sjezdovky).toBe(1);
    expect(p.pivovary).toBe(0);
  });
  it('plural', () => {
    expect(plural(1, ['vlek', 'vleky', 'vleků'])).toBe('vlek');
    expect(plural(3, ['vlek', 'vleky', 'vleků'])).toBe('vleky');
    expect(plural(0, ['vlek', 'vleky', 'vleků'])).toBe('vleků');
    expect(plural(12, ['vlek', 'vleky', 'vleků'])).toBe('vleků');
  });
  it('věta o sjezdovce se vzdáleností', () => {
    const v = vetaOMiste(vlek, 18.4, 'Karlovy Vary');
    expect(v).toContain('18 km vzdušnou čarou od obce Karlovy Vary');
    expect(v).toContain('8 vleků, 3 lanovky, 2 pásy pro začátečníky');
  });
});
