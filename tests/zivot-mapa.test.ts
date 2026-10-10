// „Kde by se mi žilo“ – vybraná obec: vrstvy, body v obci, nejbližší služba (reálná data public/data).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../src/lib/data/loader.ts';
import { areaFeatures } from '../src/lib/map/project.ts';
import { centroidy } from '../src/lib/map/centroids.ts';
import { vytvorKontext, bodyPozadavku } from '../src/lib/zivot.ts';
import {
  bodyVObci,
  chybejiciVObci,
  mapyCzOdkaz,
  nejblizsiBod,
  vrstvyPozadavku,
} from '../src/lib/zivot-mapa.ts';

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
const ctx = vytvorKontext(real, centroidy(feats), names);
const kod = (n: string) => feats.find((f) => f.properties.name === n)!.properties.code;
const CHEB = kod('Cheb');

describe('zivot-mapa', () => {
  it('vrstvy: jen požadavky s body, každá jiná dvojice barva + tvar', () => {
    const ids = ['zastavka', 'mlada-obec', 'lekar', 'lekarna', 'zubar', 'koupani', 'sport', 'bazen', 'deti'];
    const v = vrstvyPozadavku(ids);
    expect(v.map((x) => x.id)).not.toContain('mlada-obec');
    expect(v).toHaveLength(8);
    expect(new Set(v.map((x) => `${x.barva}|${x.glyph}`)).size).toBe(8);
    expect(new Set(v.slice(0, 6).map((x) => x.barva)).size).toBe(6);
    expect(new Set(v.slice(0, 6).map((x) => x.glyph)).size).toBe(6);
  });

  it('body mají kód obce a body v obci leží v obci', () => {
    const v = bodyVObci(ctx, 'lekarna', CHEB);
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((b) => b.obec === CHEB)).toBe(true);
    // místa pro volný čas nesou adresu
    expect(bodyPozadavku(ctx, 'koupani').some((b) => b.adresa)).toBe(true);
  });

  it('nejbližší bod je opravdu nejbližší', () => {
    const n = nejblizsiBod(ctx, 'nemocnice', CHEB)!;
    expect(n.km).toBeGreaterThanOrEqual(0);
    const c = ctx.obce[CHEB];
    for (const b of bodyPozadavku(ctx, 'nemocnice')) {
      const dx = Math.hypot(b.lat - c.lat, (b.lon - c.lon) * Math.cos((c.lat * Math.PI) / 180));
      const dn = Math.hypot(n.bod.lat - c.lat, (n.bod.lon - c.lon) * Math.cos((c.lat * Math.PI) / 180));
      expect(dn).toBeLessThanOrEqual(dx + 1e-9);
    }
  });

  it('chybějící služba v malé obci odkazuje na jinou obec', () => {
    // obec, kde není nemocnice, ale je v kraji jinde
    const mala = Object.keys(ctx.obce).find((c) => bodyVObci(ctx, 'nemocnice', c).length === 0)!;
    const ch = chybejiciVObci(ctx, ['nemocnice', 'mlada-obec'], mala);
    expect(ch.map((x) => x.id)).toEqual(['nemocnice']);
    const n = ch[0].nejblizsi!;
    expect(n.obec).not.toBe(mala);
    expect(n.obecNazev).toBeTruthy();
    expect(n.km).toBeGreaterThan(0);
    // Cheb nemocnici má → nechybí
    expect(chybejiciVObci(ctx, ['nemocnice'], CHEB)).toEqual([]);
  });

  it('odkaz na Mapy.cz', () => {
    expect(mapyCzOdkaz({ nazev: 'Lékárna U Anděla', lat: 50.08, lon: 12.37 })).toBe(
      'https://mapy.cz/zakladni?q=L%C3%A9k%C3%A1rna%20U%20And%C4%9Bla&x=12.37&y=50.08&z=17',
    );
  });
});
