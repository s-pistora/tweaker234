// AI poradce: nástroje nad reálnými daty a smyčka volání nástrojů (fetch je podvržený).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../src/lib/data/loader.ts';
import { definiceNastroju, najdiObce, spustNastroj, type KontextDat } from '../src/lib/poradce/nastroje.ts';
import { PoradceChyba, zeptejSe } from '../src/lib/poradce/chat.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), 'utf8'));
const skoly = json('skoly/obory.json');
const vylety = json('vylety/mista.json');
const snap = {
  manifest: json('manifest.json'),
  indicators: { obec: json('indicators/obec.json'), kraj: json('indicators/kraj.json') },
  points: { zdravotnictvi: json('points/zdravotnictvi.json') },
  geo: {},
  skoly,
  vylety,
  updatedAt: '',
} as unknown as Snapshot;
// názvy a těžiště obcí – pro test stačí obce se školou (poloha školy)
const obecNames: Record<string, string> = {};
const obecCentroidy: Record<string, { lat: number; lon: number }> = {};
for (const o of skoly.obory) {
  obecNames[o.kodObce] = o.obec;
  obecCentroidy[o.kodObce] ??= { lat: o.lat, lon: o.lon };
}
const ctx: KontextDat = { snap, obecNames, obecCentroidy };

describe('nástroje poradce', () => {
  it('najde obec bez diakritiky, přesná shoda první', () => {
    expect(najdiObce(ctx, 'sokolov')[0].nazev).toBe('Sokolov');
    expect(najdiObce(ctx, 'neexistujici-obec')).toEqual([]);
  });

  it('hledej_obory: maturitní obory v dosahu, seřazené podle vzdálenosti, se zdroji', () => {
    const r = spustNastroj(ctx, 'hledej_obory', { obec: 'Sokolov', km: 20, typ: 'maturita', limit: 50 }) as {
      obory: { typ: string; km: number }[];
      zdroje: unknown[];
      celkem_nalezeno: number;
    };
    expect(r.obory.length).toBeGreaterThan(0);
    expect(r.obory.length).toBeLessThanOrEqual(25);
    expect(r.obory.every((o) => o.typ === 'maturita' && o.km <= 20)).toBe(true);
    expect(r.obory.map((o) => o.km)).toEqual([...r.obory.map((o) => o.km)].sort((a, b) => a - b));
    expect(r.zdroje.length).toBeGreaterThan(0);
  });

  it('neznámá obec nebo nástroj vrací chybu místo vymyšlených dat', () => {
    expect(spustNastroj(ctx, 'hledej_obory', { obec: 'Praha' })).toHaveProperty('chyba');
    expect(spustNastroj(ctx, 'hledej_mista', { obec: 'Brno' })).toHaveProperty('chyba');
    expect(spustNastroj(ctx, 'smaz_vse', {})).toHaveProperty('chyba');
  });

  it('hledej_mista filtruje kategorii', () => {
    const r = spustNastroj(ctx, 'hledej_mista', { kategorie: 'hrady-zamky' }) as { mista: { kategorie: string }[] };
    expect(r.mista.length).toBeGreaterThan(0);
    expect(new Set(r.mista.map((m) => m.kategorie)).size).toBe(1);
    expect(spustNastroj(ctx, 'hledej_mista', { kategorie: 'hrady' })).toHaveProperty('chyba');
  });

  it('ukazatele: kraj bez obce, obec se srovnáním', () => {
    const kraj = spustNastroj(ctx, 'ukazatele', {}) as { uzemi: string; ukazatele: { ukazatel: string }[] };
    expect(kraj.uzemi).toBe('Karlovarský kraj');
    expect(kraj.ukazatele.some((u) => u.ukazatel === 'Počet obyvatel')).toBe(true);
    const cheb = spustNastroj(ctx, 'ukazatele', { obec: 'Cheb' }) as { uzemi: string; ukazatele: unknown[] };
    expect(cheb.uzemi).toBe('Cheb');
    expect(cheb.ukazatele.length).toBeGreaterThan(0);
  });

  it('definice nástrojů obsahují vrstvy z dat', () => {
    const body = definiceNastroju(ctx).find((d) => d.function.name === 'hledej_body')!;
    expect(JSON.stringify(body.function.parameters)).toContain('zdravotnictvi');
  });
});

describe('smyčka poradce', () => {
  const odpoved = (message: unknown) => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });

  it('spustí nástroj, vrátí výsledek modelu a pak jeho odpověď', async () => {
    const dotazy: { messages: { role: string; content?: string }[] }[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      dotazy.push(JSON.parse(init.body as string));
      return dotazy.length === 1
        ? odpoved({
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 't1', type: 'function', function: { name: 'najdi_obec', arguments: '{"nazev":"Cheb"}' } }],
          })
        : odpoved({ role: 'assistant', content: 'Cheb v datech je.' });
    }) as unknown as typeof fetch;

    const r = await zeptejSe([{ role: 'user', content: 'Je tam Cheb?' }], ctx, f);
    expect(r.odpoved).toBe('Cheb v datech je.');
    expect(dotazy[0].messages[0].role).toBe('system');
    const tool = dotazy[1].messages.find((m) => m.role === 'tool')!;
    expect(JSON.parse(tool.content!).obce[0].nazev).toBe('Cheb');
    expect(r.historie.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });

  it('chybějící proxy (404) a klíč (503) hlásí srozumitelně', async () => {
    const f404 = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(zeptejSe([{ role: 'user', content: 'x' }], ctx, f404)).rejects.toMatchObject({ kod: 'nedostupne' });
    const f503 = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    await expect(zeptejSe([{ role: 'user', content: 'x' }], ctx, f503)).rejects.toBeInstanceOf(PoradceChyba);
  });
});
