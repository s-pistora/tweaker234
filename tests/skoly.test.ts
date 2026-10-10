import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROKY, doplnZastavky, normalizujKod, parseRok, slucRoky, vycistiText } from '../scripts/sources/dz-prijimani.ts';
import {
  agreguj,
  dostupnostObci,
  proZakyZeZs,
  asciiBar,
  filtrujObory,
  naplnenost,
  naplnenostSkoly,
  nazevSkupiny,
  oboryPodleNaplnenosti,
  skupinaZKodu,
  tridaNaplnenosti,
  trend,
  typStudia,
  vetaDoprava,
  vetaNaplnenost,
  vetaTrend,
  vzdalenostKm,
} from '../src/lib/skoly.ts';
import { isOboryFile, type Obor } from '../src/lib/types.ts';

const fixture = (rok: number) => readFileSync(`tests/fixtures/dz-prijimani-${rok}.csv`, 'utf8');

function obor(p: Partial<Obor>): Obor {
  return {
    izo: '1',
    skola: 'Škola',
    web: '',
    obec: 'Cheb',
    kodObce: '554481',
    orp: '4102',
    lat: 50.08,
    lon: 12.37,
    kodOboru: '18-20-M/01',
    nazevOboru: 'Informační technologie',
    skupina: '18',
    typ: 'maturita',
    druh: 'střední s maturitní zkouškou',
    delka: 'čtyřleté',
    forma: 'denní',
    zamer: { 2024: 30, 2025: 30, 2026: 30 },
    prijato2025: 27,
    zastavky500m: 3,
    nejblizsiZastavkaM: 120,
    ...p,
  };
}

describe('dz-prijimani: parsování a sloučení tří roků', () => {
  const radky = ROKY.flatMap((c) => parseRok(fixture(c.rok), c));
  const obory = slucRoky(radky);

  it('každý rok s vlastním záhlavím dá 2 řádky', () => {
    for (const c of ROKY) expect(parseRok(fixture(c.rok), c)).toHaveLength(2);
  });

  it('sloučí roky podle IZO + kódu oboru + formy', () => {
    expect(obory).toHaveLength(2);
    const it = obory.find((o) => o.kodOboru === '18-20-M/01')!;
    expect(it.izo).toBe('600170462');
    expect(it.zamer).toEqual({ 2024: 32, 2025: 62, 2026: 30 });
    expect(it.prijato2025).toBe(37);
    // název z nejnovějšího roku
    expect(it.nazevOboru).toBe('Informační technologie - umělá inteligence');
    expect(it.typ).toBe('maturita');
    expect(it.skupina).toBe('18');
    expect(it.orp).toBe('4102');
    expect(it.lat).toBeGreaterThan(50);
    expect(it.lon).toBeGreaterThan(12);
  });

  it('opraví překlep v kódu oboru, takže se roky spojí', () => {
    expect(normalizujKod(' 23-68/H/01 ')).toBe('23-68-H/01');
    const mech = obory.find((o) => o.kodOboru === '23-68-H/01')!;
    expect(mech.zamer).toEqual({ 2024: 30, 2025: 30, 2026: 30 });
    expect(mech.typ).toBe('vyucni');
  });

  it('výsledek odpovídá kontraktu OboryFile', () => {
    expect(isOboryFile({ updatedAt: 'x', sourceIds: [], obory })).toBe(true);
    expect(isOboryFile({ updatedAt: 'x', sourceIds: [], obory: [{}] })).toBe(false);
  });

  it('doplní zastávky do 500 m a nejbližší vzdálenost', () => {
    const o = [obor({ lat: 50, lon: 12 })];
    const z = (lat: number, lon: number) => ({ id: 'z', name: 'z', lat, lon, obec: '', orp: '', attrs: {} });
    doplnZastavky(o, [z(50.001, 12), z(50.003, 12), z(50.1, 12)]);
    expect(o[0].zastavky500m).toBe(2);
    expect(o[0].nejblizsiZastavkaM).toBeGreaterThan(100);
    expect(o[0].nejblizsiZastavkaM).toBeLessThan(120);
  });
});

describe('skoly: pomocné funkce', () => {
  it('skupina a typ studia', () => {
    expect(skupinaZKodu('69-54-E/01')).toBe('69');
    expect(nazevSkupiny('79')).toBe('Gymnázia');
    expect(nazevSkupiny('99')).toBe('Skupina 99');
    expect(typStudia('střední s výučním listem', '')).toBe('vyucni');
    expect(typStudia('', '79-41-K/41')).toBe('maturita');
    expect(typStudia('', '69-54-E/01')).toBe('vyucni');
    expect(typStudia('', 'nesmysl')).toBe('jine');
    // regrese: „bez maturitní zkoušky“ nesmí skončit jako maturita
    expect(typStudia('střední bez maturitní zkoušky', '78-62-C/02')).toBe('jine');
  });

  it('VOŠ a nástavby nejsou pro žáky ze ZŠ', () => {
    expect(proZakyZeZs({ druh: 'vyšší odborné', kodOboru: '53-41-N/11' })).toBe(false);
    expect(proZakyZeZs({ druh: 'nástavbové', kodOboru: '64-41-L/51' })).toBe(false);
    expect(proZakyZeZs({ druh: '', kodOboru: '75-31-N/..' })).toBe(false);
    expect(proZakyZeZs({ druh: 'střední s maturitní zkouškou', kodOboru: '79-41-K/41' })).toBe(true);
    expect(proZakyZeZs({ druh: 'střední s výučním listem', kodOboru: '23-68-H/01' })).toBe(true);
    expect(proZakyZeZs({ druh: 'střední s maturitní zkouškou', kodOboru: '63-41-M/02', forma: 'dálková' })).toBe(false);
  });

  it('úklid názvů z exportu', () => {
    expect(vycistiText('Gymnázium  (""Vzdělání je kompasem života"")')).toBe('Gymnázium („Vzdělání je kompasem života“)');
    expect(vycistiText(' Obchodní akademie ')).toBe('Obchodní akademie');
  });

  it('vzdálenost Cheb – Karlovy Vary je cca 40 km', () => {
    const d = vzdalenostKm(50.0796, 12.3739, 50.2306, 12.8711);
    expect(d).toBeGreaterThan(35);
    expect(d).toBeLessThan(45);
  });

  it('naplněnost a třídy', () => {
    expect(naplnenost(obor({}))).toBeCloseTo(0.9);
    expect(naplnenost(obor({ prijato2025: null }))).toBeNull();
    expect(naplnenost(obor({ zamer: { 2025: 0 } }))).toBeNull();
    expect(tridaNaplnenosti(0.5)).toBe('volno');
    expect(tridaNaplnenosti(0.7)).toBe('ok');
    expect(tridaNaplnenosti(1)).toBe('ok');
    expect(tridaNaplnenosti(1.1)).toBe('pretlak');
    expect(tridaNaplnenosti(null)).toBe('na');
  });

  it('trend záměru', () => {
    expect(trend(obor({ zamer: { 2024: 10, 2025: null, 2026: 20 } }))).toBe(1);
    expect(trend(obor({ zamer: { 2024: 20, 2025: 20, 2026: 10 } }))).toBe(-1);
    expect(trend(obor({ zamer: { 2024: null, 2025: null, 2026: 10 } }))).toBeNull();
  });

  it('ASCII pruh', () => {
    expect(asciiBar(0.5, 4)).toBe('██░░');
    expect(asciiBar(1.5, 4)).toBe('████');
    expect(asciiBar(null, 4)).toBe('····');
  });
});

describe('skoly: filtrování a agregace', () => {
  const domov = { lat: 50.08, lon: 12.37 };
  const obory = [
    obor({ izo: 'a', nazevOboru: 'Blízko', lat: 50.081, lon: 12.37 }),
    obor({ izo: 'b', nazevOboru: 'Daleko', lat: 50.23, lon: 12.87, prijato2025: 10 }),
    obor({ izo: 'c', nazevOboru: 'Zavřený', zamer: { 2024: 10, 2025: 10, 2026: 0 } }),
    obor({ izo: 'd', nazevOboru: 'Učňák', typ: 'vyucni', skupina: '23' }),
  ];

  it('filtruje podle vzdálenosti, typu a vynechá obory bez míst 2026/27', () => {
    const v = filtrujObory(obory, { domov, typ: 'maturita', skupina: '', maxKm: 10 });
    expect(v.map((r) => r.obor.nazevOboru)).toEqual(['Blízko']);
    const vse = filtrujObory(obory, { domov, typ: 'vse', skupina: '', maxKm: 100 });
    expect(vse.map((r) => r.obor.nazevOboru)).toEqual(['Učňák', 'Blízko', 'Daleko']);
    const sk = filtrujObory(obory, { domov: null, typ: 'vse', skupina: '23', maxKm: 1 });
    expect(sk.map((r) => r.obor.nazevOboru)).toEqual(['Učňák']);
    expect(sk[0].km).toBeNull();
  });

  it('dostupnost obcí počítá jen otevírané obory v dosahu', () => {
    const d = dostupnostObci(obory, { doma: domov, daleko: { lat: 49, lon: 14 } }, { typ: 'vse', skupina: '', maxKm: 10 });
    expect(d).toEqual({ doma: 2, daleko: 0 });
  });

  it('řazení podle volných míst dá nejméně naplněný první', () => {
    const v = filtrujObory(obory, { domov, typ: 'vse', skupina: '', maxKm: 100 }, 'volno');
    expect(v[0].obor.nazevOboru).toBe('Daleko');
  });

  it('agregace po skupinách a TOP seznamy', () => {
    const a = agreguj(obory, (o) => o.skupina, nazevSkupiny);
    const it = a.find((x) => x.klic === '18')!;
    expect(it.zamer2025).toBe(30 + 30 + 10);
    expect(it.prijato2025).toBe(27 + 10 + 27);
    expect(it.zamer2026).toBe(60);
    expect(oboryPodleNaplnenosti(obory, 'nejmene', 1)[0].nazevOboru).toBe('Daleko');
    expect(oboryPodleNaplnenosti(obory, 'nejmene', 10, 50)).toHaveLength(0);
    expect(naplnenostSkoly(obory)).toBeCloseTo((27 + 10 + 27 + 27) / (30 + 30 + 10 + 30));
  });
});

describe('skoly: věty', () => {
  it('naplněnost lidskou řečí, bez NaN', () => {
    expect(vetaNaplnenost(obor({}))).toBe(
      'Loni na obor Informační technologie nastoupilo 27 z 30 plánovaných míst (90 %) – byl skoro plný.',
    );
    expect(vetaNaplnenost(obor({ prijato2025: 33 }))).toContain('je o něj zájem');
    expect(vetaNaplnenost(obor({ prijato2025: 3 }))).toContain('volných míst');
    expect(vetaNaplnenost(obor({ zamer: { 2024: null, 2025: null, 2026: 10 } }))).toContain('neotevíral');
    expect(vetaNaplnenost(obor({ prijato2025: null }))).toContain('chybí údaj');
  });

  it('trend a doprava', () => {
    expect(vetaTrend(obor({ zamer: { 2024: 32, 2025: 62, 2026: 30 } }))).toBe(
      'Plánovaná místa klesají: 32 → 30 (2024/25 → 2026/27).',
    );
    expect(vetaTrend(obor({}))).toContain('nemění');
    expect(vetaDoprava(obor({}))).toBe('Do 500 m od školy jsou 3 autobusové zastávky (nejbližší 120 m).');
    expect(vetaDoprava(obor({ zastavky500m: 0, nejblizsiZastavkaM: 900 }))).toContain('900 m');
    expect(vetaDoprava(obor({ nejblizsiZastavkaM: null }))).toContain('není známa');
  });
});

describe('srovnání oborů', () => {
  it('přepíná výběr a hlídá maximum tří oborů', async () => {
    const { prepniPorovnani, klicOboru } = await import('../src/lib/skoly.ts');
    expect(klicOboru({ izo: '1', kodOboru: '79-41-K/41', forma: 'denní' })).toBe('1|79-41-K/41|denní');
    let v: string[] = [];
    for (const k of ['a', 'b', 'c']) v = prepniPorovnani(v, k).vyber;
    expect(v).toEqual(['a', 'b', 'c']);
    const r = prepniPorovnani(v, 'd');
    expect(r).toEqual({ vyber: ['a', 'b', 'c'], plno: true });
    expect(prepniPorovnani(v, 'b').vyber).toEqual(['a', 'c']);
  });
});
