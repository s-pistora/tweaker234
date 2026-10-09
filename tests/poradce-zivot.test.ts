// AI poradce – nástroje režimu „Kde by se mi dobře žilo?“ nad reálnými daty (public/data).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../src/lib/data/loader.ts';
import { areaFeatures } from '../src/lib/map/project.ts';
import { centroidy } from '../src/lib/map/centroids.ts';
import { definiceNastroju, spustNastroj, type KontextDat } from '../src/lib/poradce/nastroje.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), 'utf8'));
const manifest = json('manifest.json');
const points: Record<string, unknown> = {};
for (const [id, rel] of Object.entries(manifest.files.points as Record<string, string>)) points[id] = json(rel);
const geo = { 'kv-obce': json('geo/kv-obce.topo.json'), 'kv-orp': json('geo/kv-orp.topo.json') };
const snap = {
  manifest,
  indicators: { obec: json('indicators/obec.json'), kraj: json('indicators/kraj.json') },
  points,
  geo,
  skoly: json('skoly/obory.json'),
  vylety: json('vylety/mista.json'),
  updatedAt: '',
} as unknown as Snapshot;
const features = areaFeatures(snap.geo['kv-obce']);
const ctx: KontextDat = {
  snap,
  obecNames: Object.fromEntries(features.map((f) => [f.properties.code, f.properties.name])),
  obecCentroidy: centroidy(features),
};

type Obec = { obec: string; orp?: string; skore: number; poradi: number; silne: string[]; slabsi?: string };
type Vysledek = { obce: Obec[]; chyba?: string; orp?: string; zdroje: string[] };
const HRADISTE = 'Hradiště';

describe('poradce – kde_se_mi_bude_zit', () => {
  it('lékař + bazén: nejvýš limit obcí, seřazené podle skóre, s větami a bez NaN', () => {
    const r = spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: ['lekar', 'bazen'], limit: 7 }) as Vysledek;
    expect(r.chyba).toBeUndefined();
    expect(r.obce.length).toBeGreaterThan(0);
    expect(r.obce.length).toBeLessThanOrEqual(7);
    const sk = r.obce.map((o) => o.skore);
    expect(sk).toEqual([...sk].sort((a, b) => b - a));
    for (const o of r.obce) {
      expect(o.skore).toBeGreaterThanOrEqual(0);
      expect(o.skore).toBeLessThanOrEqual(100);
      expect(o.orp).toBeTruthy();
      expect(o.silne.length).toBeGreaterThan(0);
      expect(o.slabsi).toBeTruthy();
    }
    expect(JSON.stringify(r)).not.toMatch(/NaN|undefined/);
    expect(r.zdroje.length).toBeGreaterThan(0);
    // jen zdroje použitých požadavků (lékaři + bazény), ne všechny sady výletů
    expect(r.zdroje.length).toBeLessThanOrEqual(3);
  });

  it('limit max 10, výchozí 5; velmi důležité mění pořadí podle váhy', () => {
    const vse = spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: ['zastavka'], limit: 500 }) as Vysledek;
    expect(vse.obce.length).toBe(10);
    const zakl = spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: ['zastavka', 'sjezdovka'] }) as Vysledek;
    expect(zakl.obce.length).toBe(5);
    const vaha = spustNastroj(ctx, 'kde_se_mi_bude_zit', {
      pozadavky: ['zastavka', 'sjezdovka'],
      velmi_dulezite: ['sjezdovka'],
    }) as Vysledek;
    expect(JSON.stringify(vaha)).toContain('velmi důležité');
    // id jen ve velmi_dulezite se nezahodí (sjednocení s váhou 2)
    const jenVelmi = spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: ['zastavka'], velmi_dulezite: ['sjezdovka'] }) as {
      pozadavky: string[];
      obce: Obec[];
    };
    expect(jenVelmi.pozadavky).toEqual(['Autobusová zastávka', 'Sjezdovka (velmi důležité)']);
    expect(jenVelmi.obce.map((o) => o.skore)).toEqual(
      (spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: ['zastavka', 'sjezdovka'], velmi_dulezite: ['sjezdovka'] }) as Vysledek).obce.map(
        (o) => o.skore,
      ),
    );
    // jen velmi_dulezite bez pozadavky stačí
    expect(spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: [], velmi_dulezite: ['lekar'] })).not.toHaveProperty('chyba');
  });

  it('limit jako text a nejednoznačný začátek ORP', () => {
    expect((spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: ['lekar'], limit: '3' }) as Vysledek).obce.length).toBe(3);
    const k = spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: ['lekar'], orp: 'K' }) as { chyba: string };
    expect(k.chyba).toContain('Karlovy Vary');
    expect(k.chyba).toContain('Kraslice');
    expect(k.chyba).toContain('jednoznačné');
    expect((spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: ['lekar'], orp: 'Kras' }) as Vysledek).orp).toBe('Kraslice');
  });

  it('neobydlené Hradiště (555177) se nikdy neobjeví', () => {
    expect(ctx.obecNames['555177']).toBe(HRADISTE);
    for (const p of ['klidna-obec', 'priroda', 'nemocnice', 'blizko-kv']) {
      const r = spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: [p], limit: 10 }) as Vysledek;
      expect(r.obce.some((o) => o.obec === HRADISTE)).toBe(false);
    }
    const kv = spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: ['lekar'], orp: 'karlovy vary', limit: 10 }) as Vysledek;
    expect(kv.orp).toBe('Karlovy Vary');
    expect(kv.obce.every((o) => o.orp === 'Karlovy Vary' && o.obec !== HRADISTE)).toBe(true);
  });

  it('neplatné požadavky nebo ORP → srozumitelná chyba se seznamem', () => {
    const r = spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: ['doktor', 'plavani'] }) as { chyba: string };
    expect(r.chyba).toContain('doktor, plavani');
    expect(r.chyba).toContain('výčtu');
    expect(spustNastroj(ctx, 'kde_se_mi_bude_zit', {})).toHaveProperty('chyba');
    const orp = spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: ['lekar'], orp: 'Praha' }) as { chyba: string };
    expect(orp.chyba).toContain('Sokolov');
    const cast = spustNastroj(ctx, 'kde_se_mi_bude_zit', { pozadavky: ['lekar', 'doktor'] }) as { nezname_pozadavky: string };
    expect(cast.nezname_pozadavky).toContain('doktor');
  });
});

describe('poradce – obec_bydleni', () => {
  type Detail = { obec: string; pozadavky: { pozadavek: string; veta: string; srovnani?: string; nejblizsi?: string }[] };

  it('karlovy vary bez diakritiky: výchozí základní služby s větami a srovnáním', () => {
    const r = spustNastroj(ctx, 'obec_bydleni', { obec: 'karlovy vary' }) as Detail;
    expect(r.obec).toBe('Karlovy Vary');
    expect(r.pozadavky.length).toBe(6);
    for (const p of r.pozadavky) {
      expect(p.veta).toMatch(/\.$/);
      expect(p.srovnani).toBeTruthy();
    }
    expect(r.pozadavky.find((p) => p.pozadavek === 'Praktický lékař')?.nejblizsi).toBeTruthy();
    expect(JSON.stringify(r)).not.toMatch(/NaN|undefined/);
  });

  it('se zadanými požadavky vrací skóre a pořadí v kraji', () => {
    const r = spustNastroj(ctx, 'obec_bydleni', { obec: 'Cheb', pozadavky: ['bazen', 'mesto'] }) as Detail & { skore: number; poradi: string };
    expect(r.pozadavky.map((p) => p.pozadavek)).toEqual(['Bazén nebo aquapark', 'Město s vybaveností']);
    expect(r.skore).toBeGreaterThan(0);
    expect(r.poradi).toMatch(/^\d+\. z \d+$/);
  });

  it('neobydlená obec má poznámku jako v aplikaci', () => {
    const r = spustNastroj(ctx, 'obec_bydleni', { obec: 'Hradiště' }) as { poznamka: string; pozadavky?: unknown };
    expect(r.poznamka).toBe('Obec nemá stálé obyvatele, nehodnotíme ji.');
    expect(r.pozadavky).toBeUndefined();
  });

  it('nejednoznačný název vrací kandidáty, neznámá obec chybu', () => {
    const r = spustNastroj(ctx, 'obec_bydleni', { obec: 'lazne' }) as { chyba: string; kandidati: { kod: string; nazev: string; orp: string }[] };
    expect(r.chyba).toBeTruthy();
    expect(r.kandidati.length).toBeGreaterThan(1);
    expect(r.kandidati.every((k) => k.kod in ctx.obecNames && k.nazev && k.orp)).toBe(true);
    expect(spustNastroj(ctx, 'obec_bydleni', { obec: 'Brno' })).toHaveProperty('chyba');
    expect(spustNastroj(ctx, 'obec_bydleni', { obec: 'Cheb', pozadavky: ['xyz'] })).toHaveProperty('chyba');
  });

  it('stejnojmenné obce (2× Chodov): kandidáti s kódem a ORP, výběr kódem, orp i „Název (ORP)“', () => {
    const r = spustNastroj(ctx, 'obec_bydleni', { obec: 'Chodov' }) as { chyba: string; kandidati: { kod: string; orp: string }[] };
    expect(r.chyba).toBeTruthy();
    expect(r.kandidati.map((k) => k.kod).sort()).toEqual(['560383', '578011']);
    const orpMesta = r.kandidati.find((k) => k.kod === '560383')!.orp;
    const kodem = spustNastroj(ctx, 'obec_bydleni', { obec: '560383' }) as { obec: string; kod: string };
    expect(kodem).toMatchObject({ obec: 'Chodov', kod: '560383' });
    const sOrp = spustNastroj(ctx, 'obec_bydleni', { obec: 'chodov', orp: orpMesta }) as { kod: string };
    expect(sOrp.kod).toBe('560383');
    const zavorka = spustNastroj(ctx, 'obec_bydleni', { obec: `Chodov (${orpMesta})` }) as { kod: string };
    expect(zavorka.kod).toBe('560383');
    const druhy = r.kandidati.find((k) => k.kod === '578011')!.orp;
    expect((spustNastroj(ctx, 'obec_bydleni', { obec: `Chodov (ORP ${druhy})` }) as { kod: string }).kod).toBe('578011');
    // Březová také 2×
    expect((spustNastroj(ctx, 'obec_bydleni', { obec: 'Brezova' }) as { kandidati: unknown[] }).kandidati.length).toBe(2);
  });

  it('obec_bydleni: velmi_dulezite mění skóre jako v aplikaci', () => {
    const a = spustNastroj(ctx, 'obec_bydleni', { obec: 'Cheb', pozadavky: ['sjezdovka', 'mesto'] }) as { skore: number };
    const b = spustNastroj(ctx, 'obec_bydleni', { obec: 'Cheb', pozadavky: ['mesto'], velmi_dulezite: ['sjezdovka'] }) as {
      skore: number;
      velmi_dulezite: string[];
      pozadavky: unknown[];
    };
    expect(b.velmi_dulezite).toEqual(['Sjezdovka']);
    expect(b.pozadavky.length).toBe(2);
    expect(b.skore).not.toBe(a.skore);
  });

  it('definice nástrojů obsahují id požadavků jako enum', () => {
    const d = definiceNastroju(ctx).find((x) => x.function.name === 'kde_se_mi_bude_zit')!;
    expect(JSON.stringify(d.function.parameters)).toContain('"bazen"');
    expect(definiceNastroju(ctx).some((x) => x.function.name === 'obec_bydleni')).toBe(true);
    // výčet id jen jednou – definice se posílají s každým dotazem (limit tokenů Groq)
    const vse = JSON.stringify(definiceNastroju(ctx));
    expect(vse.split('"klidna-obec"').length - 1).toBe(1);
    expect(vse.length).toBeLessThan(6500);
  });
});
