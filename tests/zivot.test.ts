import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  POZADAVKY,
  bodyPozadavku,
  metrika,
  percentily,
  poradi,
  spocitejSkore,
  vetaPozadavku,
  vytvorKontext,
  kratkaHodnota,
  srovnani,
  textSrovnani,
} from '../src/lib/zivot.ts';
import { vzdalenostKm } from '../src/lib/skoly.ts';
import { areaFeatures } from '../src/lib/map/project.ts';
import { centroidy } from '../src/lib/map/centroids.ts';
import type { Snapshot } from '../src/lib/data/loader.ts';
import type { IndicatorFile, Misto, PointFeature } from '../src/lib/types.ts';

// Tři obce na rovnoběžce 50° (1° délky ≈ 71,5 km): A (12,0), B (12,1), C (12,5).
const OBCE = {
  A: { lat: 50, lon: 12.0 },
  B: { lat: 50, lon: 12.1 },
  C: { lat: 50, lon: 12.5 },
};
const NAMES = { A: 'Alfa', B: 'Beta', C: 'Gama' };

const pt = (id: string, lon: number, attrs: PointFeature['attrs'] = {}): PointFeature => ({
  id,
  name: id,
  lon,
  lat: 50,
  obec: 'A',
  orp: 'X',
  attrs,
});

const obecFile: IndicatorFile = {
  level: 'obec',
  indicators: {
    podil_0_14: { id: 'podil_0_14', label: 'Podíl dětí', unit: '%', higherIsBetter: true, sourceId: 'x', decimals: 1 },
    nezamestnanost: { id: 'nezamestnanost', label: 'Nezam.', unit: '%', higherIsBetter: false, sourceId: 'x', decimals: 2 },
  },
  values: {
    // starší rok má víc obcí, použije se ale poslední rok s daty (2025)
    podil_0_14: { A: { 2024: 10, 2025: 16.24 }, B: { 2024: 12, 2025: 14 }, C: { 2024: 20 } },
    nezamestnanost: { A: { 2024: 2 }, B: { 2024: 4 }, C: { 2024: 6 } },
  },
  regional: {},
  national: {},
} as unknown as IndicatorFile;

function snap(): Snapshot {
  return {
    manifest: { updatedAt: 'x', sources: [], files: { indicators: {}, points: {}, geo: {} } },
    indicators: { obec: obecFile },
    points: {
      zastavky: { id: 'zastavky', label: 'Z', sourceId: 'z', validFor: '2026', features: [pt('z1', 12.0), pt('z2', 12.005), pt('z3', 12.1)] },
      zdravotnictvi: {
        id: 'zdravotnictvi',
        label: 'Z',
        sourceId: 'z',
        validFor: '2026',
        features: [pt('l1', 12.12, { typ: 'Lékárna' }), pt('o1', 12.0, { typ: 'Oční optika' })],
      },
    },
    geo: {},
    skoly: null,
    vylety: {
      updatedAt: 'x',
      sourceIds: [],
      mista: [
        { id: 'k1', kat: 'koupani', nazev: 'Čistá', lon: 12.5, lat: 50, voda: { trida: 'vhodna' } },
        { id: 'k2', kat: 'koupani', nazev: 'Špinavá', lon: 12.0, lat: 50, voda: { trida: 'nevhodna' } },
      ] as unknown as Misto[],
    },
    updatedAt: 'x',
  } as unknown as Snapshot;
}

const ctx = () => vytvorKontext(snap(), OBCE, NAMES);

describe('zivot – metriky', () => {
  it('nejbližší bod: vzdálenost od středu obce k nejbližšímu bodu podle filtru (optika není lékárna)', () => {
    const m = metrika(ctx(), 'lekarna').values;
    expect(m.A).toBeCloseTo(vzdalenostKm(50, 12, 50, 12.12), 6);
    expect(m.B).toBeCloseTo(vzdalenostKm(50, 12.1, 50, 12.12), 6);
    expect(m.B).toBeLessThan(2);
  });

  it('koupání bere jen vodu vhodnou ke koupání', () => {
    const c = ctx();
    expect(bodyPozadavku(c, 'koupani').map((b) => b.id)).toEqual(['k1']);
    expect(metrika(c, 'koupani').values.C).toBeCloseTo(0, 6);
  });

  it('počet bodů do R km', () => {
    expect(metrika(ctx(), 'zastavka').values).toEqual({ A: 2, B: 1, C: 0 });
  });

  it('ukazatel obce v posledním roce s daty; obec bez hodnoty = null', () => {
    const m = metrika(ctx(), 'mlada-obec');
    expect(m.rok).toBe(2025);
    expect(m.values).toEqual({ A: 16.24, B: 14, C: null });
  });

  it('bez dat (vrstva chybí) → všude null', () => {
    expect(Object.values(metrika(ctx(), 'nemocnice').values).every((v) => v === null)).toBe(true);
  });

  it('percentil respektuje směr (nižší nezaměstnanost = lepší)', () => {
    expect(percentily(ctx(), 'nezamestnanost')).toEqual({ A: 100, B: 50, C: 0 });
  });

  it('memo: metrika se počítá jednou', () => {
    const c = ctx();
    expect(metrika(c, 'zastavka')).toBe(metrika(c, 'zastavka'));
  });
});

describe('zivot – skóre', () => {
  it('prázdný výběr → skóre null u všech obcí', () => {
    const s = spocitejSkore(ctx(), {});
    expect(Object.values(s).every((x) => x.score === null)).toBe(true);
    expect(poradi(s)).toEqual([]);
  });

  it('váhy: velmi důležité má dvojnásobnou váhu', () => {
    const c = ctx();
    // zastávka: A 100, B 50, C 0 · nezaměstnanost: A 100, B 50, C 0
    expect(spocitejSkore(c, { zastavka: 1, nezamestnanost: 1 }).B.score).toBeCloseTo(50);
    // mladá obec: A 100, B 0 (C chybí)
    const s = spocitejSkore(c, { 'mlada-obec': 2, nezamestnanost: 1 });
    expect(s.B.score).toBeCloseTo((0 * 2 + 50 * 1) / 3);
    expect(s.B.parts.find((p) => p.id === 'mlada-obec')?.weight).toBe(2);
  });

  it('chybějící hodnota → požadavek přeskočen a váhy renormalizovány', () => {
    const s = spocitejSkore(ctx(), { 'mlada-obec': 2, nezamestnanost: 1 });
    expect(s.C.skipped).toEqual(['mlada-obec']);
    expect(s.C.parts.map((p) => p.id)).toEqual(['nezamestnanost']);
    expect(s.C.score).toBe(0);
  });

  it('jen požadavky bez dat → skóre null, vše ve skipped', () => {
    const s = spocitejSkore(ctx(), { nemocnice: 1 });
    expect(s.A.score).toBeNull();
    expect(s.A.skipped).toEqual(['nemocnice']);
  });

  it('pořadí: od nejvyššího skóre, shodné zaokrouhlené skóre = shodné místo', () => {
    const p = poradi(spocitejSkore(ctx(), { zastavka: 1 }), NAMES);
    expect(p.map((r) => [r.code, r.rank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
    ]);
  });
});

describe('zivot – věty', () => {
  it('česky, s desetinnou čárkou, bez NaN', () => {
    const c = ctx();
    expect(vetaPozadavku(c, 'lekarna', 'B', 1.43)).toBe('Nejbližší lékárna je 1,4 km od středu obce.');
    expect(vetaPozadavku(c, 'zastavka', 'A', 2)).toBe('Do 1 km od středu obce jsou 2 autobusové zastávky.');
    expect(vetaPozadavku(c, 'zastavka', 'A', 6)).toBe('Do 1 km od středu obce je 6 autobusových zastávek.');
    expect(vetaPozadavku(c, 'zastavka', 'C', 0)).toMatch(/není žádná/);
    expect(vetaPozadavku(c, 'mlada-obec', 'A', 16.24)).toBe('Podíl dětí 0–14 let je 16,2 % (2025).');
    expect(vetaPozadavku(c, 'blizko-kv', '554961', 0)).toMatch(/přímo Karlovy Vary/);
    expect(vetaPozadavku(c, 'lekarna', 'A', Number.NaN)).toBe('');
  });
});

describe('zivot – reálná data public/data', () => {
  const pub = (p: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), 'public/data', p), 'utf8'));
  const manifest = pub('manifest.json');
  const real = {
    manifest,
    indicators: { obec: pub('indicators/obec.json') },
    points: Object.fromEntries(Object.entries(manifest.files.points).map(([id, p]) => [id, pub(p as string)])),
    geo: { 'kv-obce': pub('geo/kv-obce.topo.json') },
    skoly: null,
    vylety: pub('vylety/mista.json'),
    updatedAt: manifest.updatedAt,
  } as unknown as Snapshot;
  const feats = areaFeatures(real.geo['kv-obce']);
  const names = Object.fromEntries(feats.map((f) => [f.properties.code, f.properties.name]));

  it('každý požadavek má údaj aspoň pro 130 ze 134 obcí', () => {
    const c = vytvorKontext(real, centroidy(feats), names);
    expect(Object.keys(c.obce)).toHaveLength(134);
    for (const p of POZADAVKY) {
      const n = Object.values(metrika(c, p.id).values).filter((v) => v !== null).length;
      expect(n, p.id).toBeGreaterThanOrEqual(130);
    }
  });

  it('obec bez obyvatel (vojenský újezd Hradiště 555177) se nehodnotí ani neřadí', () => {
    const c = vytvorKontext(real, centroidy(feats), names);
    expect(c.neobydlene.has('555177')).toBe(true);
    for (const id of ['klidna-obec', 'nezamestnanost']) {
      const s = spocitejSkore(c, { [id]: 1 });
      expect(s['555177']).toEqual({ score: null, parts: [], skipped: [], neobydlena: true });
      const p = poradi(s, names);
      expect(p.map((r) => r.code)).not.toContain('555177');
      expect(p.length).toBe(133);
    }
    // pořadí ve výchozím výběru také bez neobydlené obce
    expect(poradi(spocitejSkore(c, { zastavka: 1, nezamestnanost: 1 })).map((r) => r.code)).not.toContain('555177');
  });

  it('shoda na nejhorší hodnotě: obec bez zastávky není „lépe než X %“', () => {
    const c = vytvorKontext(real, centroidy(feats), names);
    const nula = Object.entries(metrika(c, 'zastavka').values).find(([, v]) => v === 0)![0];
    const s = srovnani(c, 'zastavka', nula)!;
    expect(s.horsich).toBe(0);
    expect(textSrovnani(s)).toMatch(/^nejslabší v kraji \(spolu s \d+ dalšími obcemi\)$/);
  });
});

describe('zivot – srovnání s ostatními obcemi', () => {
  it('podíl obcí, které jsou na tom striktně hůř', () => {
    const c = ctx();
    expect(srovnani(c, 'zastavka', 'B')).toEqual({ horsich: 1, lepsich: 1, shodnych: 0, celkem: 3 });
    expect(textSrovnani(srovnani(c, 'zastavka', 'B')!)).toBe('lépe než 50 % obcí');
    expect(textSrovnani(srovnani(c, 'zastavka', 'A')!)).toBe('nejlépe v kraji');
    expect(srovnani(c, 'mlada-obec', 'C')).toBeNull();
  });

  it('shody na okrajích', () => {
    expect(textSrovnani({ horsich: 0, lepsich: 5, shodnych: 28, celkem: 34 })).toBe(
      'nejslabší v kraji (spolu s 28 dalšími obcemi)',
    );
    expect(textSrovnani({ horsich: 4, lepsich: 0, shodnych: 1, celkem: 6 })).toBe('nejlépe v kraji (spolu s 1 další obcí)');
    expect(textSrovnani({ horsich: 3, lepsich: 2, shodnych: 0, celkem: 6 })).toBe('lépe než 60 % obcí');
    // shoda uprostřed se nepočítá jako „hůř“
    expect(textSrovnani({ horsich: 2, lepsich: 2, shodnych: 2, celkem: 7 })).toBe('lépe než 33 % obcí');
  });
});

describe('zivot – krátká hodnota do náhledu', () => {
  it('správné tvary 1 / 2–4 / 5+ a okruh', () => {
    expect(kratkaHodnota('zastavka', 1)).toBe('1 zastávka do 1 km');
    expect(kratkaHodnota('zastavka', 3)).toBe('3 zastávky do 1 km');
    expect(kratkaHodnota('zastavka', 6)).toBe('6 zastávek do 1 km');
    expect(kratkaHodnota('priroda', 1)).toBe('1 místo do 5 km');
    expect(kratkaHodnota('pamatky', 12)).toBe('12 míst do 10 km');
    expect(kratkaHodnota('lekarna', 2.44)).toBe('2,4 km');
  });

  it('záporné číslo s typografickým minus, jako ve větách', () => {
    expect(kratkaHodnota('obec-roste', -3.24)).toBe('−3,2 na 1000 obyv.');
    expect(vetaPozadavku(ctx(), 'obec-roste', 'A', -3.24)).toMatch(/je −3,2 na 1000 obyvatel/);
  });
});
