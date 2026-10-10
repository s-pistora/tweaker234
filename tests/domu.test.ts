// Úvodní stránka: rychlé hledání obce a „Obec v kostce“ (reálná data public/data).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../src/lib/data/loader.ts';
import { areaFeatures } from '../src/lib/map/project.ts';
import { centroidy } from '../src/lib/map/centroids.ts';
import { vytvorKontext } from '../src/lib/zivot.ts';
import { hledejObce, obecVKostce, otazkaOObci, tipyNaVylet, VYLET_KM, type Blizko } from '../src/lib/domu.ts';
import { MENU, skupinaRezimu } from '../src/lib/menu.ts';
import { MODES } from '../src/lib/state.ts';

const pub = (p: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), 'public/data', p), 'utf8'));
const manifest = pub('manifest.json');
const real = {
  manifest,
  indicators: { obec: pub('indicators/obec.json') },
  points: Object.fromEntries(Object.entries(manifest.files.points).map(([id, p]) => [id, pub(p as string)])),
  geo: { 'kv-obce': pub('geo/kv-obce.topo.json') },
  skoly: null,
  vylety: pub('vylety/mista.json'),
  urady: pub('urady/urady.json'),
  updatedAt: manifest.updatedAt,
} as unknown as Snapshot;
const feats = areaFeatures(real.geo['kv-obce']);
const names = Object.fromEntries(feats.map((f) => [f.properties.code, f.properties.name]));
const stredy = centroidy(feats);
const ctx = vytvorKontext(real, stredy, names);
const kod = (n: string) => feats.find((f) => f.properties.name === n)!.properties.code;
const KV = '554961';

const ok = (b: Blizko | null) => {
  expect(b).not.toBeNull();
  expect(b!.nazev.length).toBeGreaterThan(2);
  expect(Number.isFinite(b!.km)).toBe(true);
  expect(b!.km).toBeGreaterThanOrEqual(0);
};

describe('domu – hledání obce', () => {
  it('bez diakritiky a velikosti písmen, nejdřív začátek názvu', () => {
    const r = hledejObce(names, 'karl');
    expect(r[0]).toEqual({ code: KV, nazev: 'Karlovy Vary' });
    expect(hledejObce(names, 'CHEB')[0].nazev).toBe('Cheb');
    // „mar“ najde Mariánské Lázně (začátek) dřív než obce, kde je „mar“ uvnitř
    const m = hledejObce(names, 'marian');
    expect(m[0].nazev).toBe('Mariánské Lázně');
    // slovo uvnitř názvu: „lazne“ najde Mariánské i Františkovy Lázně
    const l = hledejObce(names, 'lazne').map((x) => x.nazev);
    expect(l).toEqual(expect.arrayContaining(['Mariánské Lázně', 'Františkovy Lázně']));
    expect(hledejObce(names, '   ')).toEqual([]);
    expect(hledejObce(names, 'a', 5)).toHaveLength(5);
    expect(Object.keys(names)).toHaveLength(134);
  });
});

describe('domu – obec v kostce', () => {
  it('Karlovy Vary: školy, zastávky, lékař, lékárna, nemocnice a úřady přímo v obci', () => {
    const o = obecVKostce(ctx, KV)!;
    expect(o.nazev).toBe('Karlovy Vary');
    for (const b of [o.ms, o.zs, o.ss, o.lekar, o.lekarna, o.nemocnice]) ok(b);
    expect(o.ms!.vObci && o.zs!.vObci && o.ss!.vObci).toBe(true);
    expect(o.nemocnice!.nazev).toMatch(/Nemocnice/);
    expect(o.nemocnice!.km).toBeLessThan(5);
    expect(o.zastavky).toBeGreaterThan(3);
    expect(o.urady!.obec.obecniUrad.nazev).toMatch(/Magistrát/);
    expect(o.urady!.obec.stavebni.length).toBeGreaterThan(0);
    expect(o.urady!.matrika?.vObci).toBe(true);
    // tipy na výlet: nejvýš 3, seřazené, do 15 km, různé kategorie
    expect(o.vylety).toHaveLength(3);
    expect(o.vylety.every((t) => t.km <= VYLET_KM && t.katLabel && t.nazev)).toBe(true);
    expect(o.vylety.map((t) => t.km)).toEqual([...o.vylety.map((t) => t.km)].sort((a, b) => a - b));
    expect(new Set(o.vylety.map((t) => t.kat)).size).toBe(3);
    expect(JSON.stringify(o)).not.toMatch(/NaN|undefined/);
    // memo: stejný objekt
    expect(obecVKostce(ctx, KV)).toBe(o);
  });

  it('malá obec: služby jinde s obcí a vzdáleností, matrika nejbližší', () => {
    const code = kod('Otovice');
    const o = obecVKostce(ctx, code)!;
    for (const b of [o.ms, o.zs, o.ss, o.lekar, o.lekarna, o.nemocnice]) ok(b);
    // nemocnice v Otovicích není → leží jinde a karta to ví
    expect(o.nemocnice!.vObci).toBe(false);
    expect(o.nemocnice!.obecNazev).not.toBe('Otovice');
    expect(o.nemocnice!.km).toBeGreaterThan(0);
    expect(o.zastavky).not.toBeNull();
    expect(o.urady!.obec.nazev).toBe('Otovice');
    expect(o.urady!.orp?.nazev).toMatch(/Karlovy Vary/);
    expect(o.urady!.matrika).not.toBeNull();
    expect(JSON.stringify(o)).not.toMatch(/NaN|undefined/);
  });

  it('neznámá obec → null; otázka pro AI', () => {
    expect(obecVKostce(ctx, '000000')).toBeNull();
    expect(otazkaOObci('Cheb')).toBe('Jak se žije v obci Cheb? Co je tam blízko?');
  });

  it('tipy na výlet: mimo dosah nic, kategorie se doplní, když dojdou', () => {
    const mista = real.vylety!.mista;
    expect(tipyNaVylet(mista, { lat: 0, lon: 0 })).toEqual([]);
    const m = mista.find((x) => x.kat === 'muzea')!;
    const jen = mista.filter((x) => x.kat === m.kat);
    const t = tipyNaVylet(jen, m, 80, 3);
    expect(t).toHaveLength(3);
    expect(t[0].id).toBe(m.id);
  });
});

describe('menu', () => {
  it('pět skupin, každý režim kromě úvodní stránky právě v jedné skupině', () => {
    expect(MENU).toHaveLength(5);
    for (const m of MODES) {
      const n = MENU.flatMap((s) => s.polozky).filter((p) => p.mode === m).length;
      expect(n).toBe(m === 'domu' ? 0 : 1);
    }
    expect(skupinaRezimu('urady')).toBe('bydleni');
    expect(skupinaRezimu('domu')).toBeNull();
  });
});
