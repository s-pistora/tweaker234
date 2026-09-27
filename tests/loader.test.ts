import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadSnapshot } from '../src/lib/data/loader.ts';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

/** fetchImpl, ktery cte soubory z public/ pres node:fs; `fail` = mnozina cest, ktere maji vratit 404. */
function fetchFromPublic(fail: Set<string> = new Set()): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (fail.has(url)) {
      return new Response('not found', { status: 404 });
    }
    const full = path.join(PUBLIC_DIR, url);
    if (!existsSync(full)) {
      return new Response('not found', { status: 404 });
    }
    return new Response(readFileSync(full, 'utf8'), { status: 200 });
  }) as unknown as typeof fetch;
}

/** fetchImpl nad synteticky sestavenou mapou cesta -> JSON (bez pristupu na disk). */
function fetchFromMap(map: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!(url in map)) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(map[url]), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('loadSnapshot', () => {
  it('nacte snapshot z fixtures a zavola onStep pro kazdy soubor', async () => {
    const steps: { label: string; status: string }[] = [];
    const snap = await loadSnapshot((s) => steps.push(s), 'data/_fixtures', fetchFromPublic());

    expect(snap.updatedAt).toBe('2026-09-27T00:00:00.000Z');
    expect(snap.manifest.updatedAt).toBe(snap.updatedAt);
    expect(snap.indicators.kraj?.level).toBe('kraj');
    expect(snap.indicators.orp?.level).toBe('orp');
    expect(snap.indicators.obec?.level).toBe('obec');
    expect(snap.points.skoly?.id).toBe('skoly');
    expect(snap.geo.kraje?.type).toBe('Topology');
    expect(snap.geo['kv-orp']?.type).toBe('Topology');
    expect(snap.geo['kv-obce']?.type).toBe('Topology');

    expect(steps).toContainEqual({ label: 'MANIFEST', status: 'ok' });
    expect(steps.some((s) => s.label === 'UKAZATELE KRAJ' && s.status === 'ok')).toBe(true);
    expect(steps.some((s) => s.label === 'BODY SKOLY' && s.status === 'ok')).toBe(true);
    expect(steps.some((s) => s.label === 'HRANICE KRAJE' && s.status === 'ok')).toBe(true);
    expect(steps.every((s) => s.status === 'ok')).toBe(true);
  });

  it('vypadek jednoho souboru -> status fail, zbytek snapshotu se nacte', async () => {
    const steps: { label: string; status: string }[] = [];
    const failing = new Set(['data/_fixtures/points/skoly.json']);
    const snap = await loadSnapshot((s) => steps.push(s), 'data/_fixtures', fetchFromPublic(failing));

    expect(snap.points.skoly).toBeUndefined();
    expect(snap.indicators.kraj).toBeDefined();
    expect(snap.indicators.orp).toBeDefined();
    expect(snap.geo.kraje).toBeDefined();

    const failStep = steps.find((s) => s.label === 'BODY SKOLY');
    expect(failStep?.status).toBe('fail');
    expect(steps.filter((s) => s.status === 'fail')).toHaveLength(1);
  });

  it('selhani manifestu vyhodi chybu (loader jinak nikdy nevyhazuje)', async () => {
    await expect(
      loadSnapshot(undefined, 'data/neexistujici-slozka', fetchFromPublic()),
    ).rejects.toThrow();
  });

  it('zdroj se stavem stale v manifestu -> krok ma status stale', async () => {
    const manifest = {
      updatedAt: '2026-01-01T00:00:00.000Z',
      sources: [
        {
          id: 'src-stale',
          provider: 'Test',
          title: 'Test zdroj',
          url: 'about:blank',
          license: 'n/a',
          downloadedAt: '2026-01-01T00:00:00.000Z',
          validFor: '2024',
          status: 'stale',
        },
      ],
      files: {
        indicators: { kraj: 'indicators/kraj.json' },
        points: {},
        geo: {},
      },
    };
    const indicatorFile = {
      level: 'kraj',
      indicators: {
        x: { id: 'x', label: 'X', unit: 'u', higherIsBetter: true, sourceId: 'src-stale', decimals: 0 },
      },
      values: { x: { CZ041: { 2024: 1 } } },
    };
    const map: Record<string, unknown> = {
      'stale-base/manifest.json': manifest,
      'stale-base/indicators/kraj.json': indicatorFile,
    };
    const steps: { label: string; status: string }[] = [];
    const snap = await loadSnapshot((s) => steps.push(s), 'stale-base', fetchFromMap(map));

    expect(snap.indicators.kraj).toBeDefined();
    const step = steps.find((s) => s.label === 'UKAZATELE KRAJ');
    expect(step?.status).toBe('stale');
  });
});
