import { describe, it, expect } from 'vitest';
import {
  matriky,
  matrikaProObec,
  obecniUrady,
  slozUrady,
  stavebniPodleObci,
  uradOrp,
  uredniHodiny,
  vycistiKontakt,
  zivnostenskeRadky,
  isUradyFile,
} from '../src/lib/urady.ts';

const obceRows: Record<string, string>[] = [
  { kod: '554961', nazev: 'Karlovy Vary', nazevuradu: 'Magistrát města', ulice: 'Moskevská 21', psc: '361 20', posta: 'Karlovy Vary', telefonobce: '353118111', datovka: 'a89bwi8', mail: 'posta@mmkv.cz', wwwstranky: 'www.mmkv.cz', orp: 'Magistrát města|Karlovy Vary' },
  { kod: '537969', nazev: 'Otovice', nazevuradu: 'Obecní úřad', ulice: 'Hroznětínská 130', psc: '362 32', posta: 'Otovice', telefonobce: '353 566 866', datovka: '32vb7g2', mail: 'obecniurad@otovice.cz', wwwstranky: 'www.otovice.cz', orp: 'Magistrát města|Karlovy Vary' },
  { kod: '560383', nazev: 'Chodov (u Sokolova)', nazevuradu: 'Městský úřad', ulice: 'Komenského 1077', psc: '357 35', posta: 'Chodov', orp: 'Městský úřad|Sokolov' },
  { kod: '578011', nazev: 'Chodov (u Bečova)', nazevuradu: 'Obecní úřad', ulice: 'Chodov 23', psc: '364 64', posta: 'Bečov nad Teplou', orp: 'Magistrát města|Karlovy Vary' },
];

const stav = (ku: string, kodObce: string, urad: string) => ({
  'název_katastrálního_území': ku,
  'kód_obce_katastráního_území': kodObce,
  'stavební_úřad': urad,
  'umístění_stavebního_úřadu': 'Magistrát města Karlovy Vary',
  'název_odboru': 'Stavební úřad',
  'sídlo': 'Moskevská 2035/21, 36001 Karlovy Vary',
  'id_datové_schránky': 'a89bwi8',
  'webová_stránka': 'https://www.mmkv.cz',
  'zeměpisná_šířka_v_souřadnicovém_systému_WGS84': '50.23',
  'zeměpisná_délka_v_souřadnicovém_systému_WGS84': '12.87',
});

const zivno = (obec: string, kod: string, urad: string, orp: string) => ({
  obec,
  'kód': kod,
  'živnostenský_úřad': urad,
  'sídlo_úřadu': `Městský úřad ${orp}`,
  'název_odboru': 'Obecní živnostenský úřad',
  'sídlo': `${orp}`,
  'telefonní_kontakt': 'tel:+420353152691',
  'kontaktní_email': 'mailto:zivno@example.cz',
  'název_obce_s_rozšířenou_působností': orp,
});

describe('urady: převod dat kraje', () => {
  const obce = obecniUrady(obceRows);
  const st = stavebniPodleObci([
    stav('Karlovy Vary', '554961', 'Stavební úřad Karlovy Vary'),
    stav('Rybáře', '554961', 'Stavební úřad Karlovy Vary'),
    stav('Otovice u Karlových Var', '537969', 'Stavební úřad Karlovy Vary'),
    stav('Dolní Chodov', '560383', 'Stavební úřad Chodov'),
  ]);
  // chyby jako v reálných datech: Otovice se špatným kódem, Chodov u Bečova s kódem Chodova u Sokolova
  const zi = zivnostenskeRadky([
    zivno('Karlovy Vary', '554961', 'Obecní živnostenský úřad Karlovy Vary', 'Karlovy Vary'),
    zivno('Otovice', '574317', 'Obecní živnostenský úřad Karlovy Vary', 'Karlovy Vary'),
    zivno('Chodov', '560383', 'Obecní živnostenský úřad Karlovy Vary', 'Karlovy Vary'),
    zivno('Chodov', '560383', 'Obecní živnostenský úřad Sokolov', 'Sokolov'),
  ]);
  const { obce: vys, chyby } = slozUrady(obce, st, zi);
  const najdi = (n: string) => vys.find((o) => o.nazev === n)!;

  it('obecní úřad: název, adresa, web a ORP ze seznamu obcí', () => {
    const o = najdi('Otovice');
    expect(o.obecniUrad.nazev).toBe('Obecní úřad Otovice');
    expect(o.obecniUrad.adresa).toBe('Hroznětínská 130, 362 32 Otovice');
    expect(o.obecniUrad.web).toBe('https://www.otovice.cz');
    expect(o.orp).toBe('Karlovy Vary');
    expect(uradOrp(o, vys)?.nazev).toBe('Magistrát města Karlovy Vary');
  });

  it('stavební úřad seskupený podle úřadu se seznamem katastrů', () => {
    expect(najdi('Karlovy Vary').stavebni).toHaveLength(1);
    expect(najdi('Karlovy Vary').stavebni[0].katastry).toEqual(['Karlovy Vary', 'Rybáře']);
  });

  it('živnostenský úřad: špatný kód obce spáruje podle názvu, duplicitní kód podle ORP', () => {
    expect(najdi('Otovice').zivnostensky?.nazev).toBe('Obecní živnostenský úřad Karlovy Vary');
    expect(najdi('Otovice').poznamky.join(' ')).toContain('chybným kódem');
    expect(najdi('Chodov (u Sokolova)').zivnostensky?.nazev).toBe('Obecní živnostenský úřad Sokolov');
    expect(najdi('Chodov (u Bečova)').zivnostensky?.nazev).toBe('Obecní živnostenský úřad Karlovy Vary');
  });

  it('chybějící údaje se poctivě hlásí obci i v seznamu chyb dat', () => {
    expect(najdi('Chodov (u Bečova)').stavebni).toEqual([]);
    expect(najdi('Chodov (u Bečova)').poznamky).toContain('Stavební úřad pro tuto obec v datech kraje chybí.');
    expect(chyby.some((c) => c.includes('574317'))).toBe(true);
    expect(chyby.some((c) => c.includes('560383') && c.includes('2×'))).toBe(true);
    expect(chyby.some((c) => c.includes('Chodov (u Bečova)'))).toBe(true);
    expect(isUradyFile({ updatedAt: 'x', sourceIds: [], obce: vys, matriky: [], chybyDat: chyby })).toBe(true);
  });
});

describe('urady: matrika', () => {
  const m = matriky([
    { nazev_uradu: 'Újezdní úřad Hradiště', nazev_obce: 'Karlovy Vary', n: '50.2266', e: '12.8357', uredni_dny: 'PO+ST', uredni_hodiny: '8.00-12.00' },
    { nazev_uradu: 'Magistrát města', nazev_obce: 'Karlovy Vary', n: '50.2306', e: '12.8711', uredni_dny: 'PO+ST', uredni_hodiny: '8.00-17.00' },
    { nazev_uradu: 'Městský Úřad', nazev_obce: 'Chodov', n: '50.2412', e: '12.7472', uredni_dny: 'PO+ST', uredni_hodiny: '8.00-17.00' },
    { nazev_uradu: 'Obecní Úřad', nazev_obce: 'Sadov', n: '50.2690', e: '12.8970', uredni_dny: 'PO+ST', uredni_hodiny: '8.00-17.00' },
  ]);

  it('názvy doplní obec a sjednotí velikost písmen, vojenský újezd nechá', () => {
    expect(m.map((x) => x.nazev)).toEqual(['Újezdní úřad Hradiště', 'Magistrát města Karlovy Vary', 'Městský úřad Chodov', 'Obecní úřad Sadov']);
  });

  it('matrika v obci má přednost (ne vojenský újezd), jinak nejbližší', () => {
    expect(matrikaProObec('Karlovy Vary', { lat: 50.23, lon: 12.87 }, m)?.matrika.nazev).toBe('Magistrát města Karlovy Vary');
    const ot = matrikaProObec('Otovice', { lat: 50.2445, lon: 12.8836 }, m)!;
    expect(ot.vObci).toBe(false);
    expect(ot.km).toBeGreaterThan(0);
  });

  it('Chodov u Bečova nedostane matriku Chodova u Sokolova (jiné místo)', () => {
    const r = matrikaProObec('Chodov (u Bečova)', { lat: 50.07, lon: 12.95 }, m)!;
    expect(r.vObci).toBe(false);
    expect(matrikaProObec('Chodov (u Sokolova)', { lat: 50.24, lon: 12.75 }, m)?.matrika.nazev).toBe('Městský úřad Chodov');
  });
});

describe('urady: formátování', () => {
  it('úřední hodiny po dnech v obou formátech dat', () => {
    expect(uredniHodiny('PO+ST', '8.00-12.00 13.00-17.00')).toEqual(['po, st: 8.00–12.00, 13.00–17.00']);
    expect(uredniHodiny('PO-PÁ', 'PO+ST 8.00-11.30 12.00-17.00 ÚT+ČT 8.00-11.30 12.00-15.00 PÁ 8.00-12.00')).toEqual([
      'po, st: 8.00–11.30, 12.00–17.00',
      'út, čt: 8.00–11.30, 12.00–15.00',
      'pá: 8.00–12.00',
    ]);
    expect(uredniHodiny('PO+ST', '')).toEqual(['po, st']);
  });

  it('telefon a e-mail bez prefixů', () => {
    expect(vycistiKontakt('tel:+420353152691')).toBe('+420 353 152 691');
    expect(vycistiKontakt('353566866')).toBe('353 566 866');
    expect(vycistiKontakt('mailto:a@b.cz')).toBe('a@b.cz');
  });
});
