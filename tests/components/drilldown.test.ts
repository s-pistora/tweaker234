// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import Drilldown from '../../src/components/Drilldown.svelte';
import type { Snapshot } from '../../src/lib/data/loader.ts';

const fx = (p: string) => JSON.parse(readFileSync(`public/data/_fixtures/${p}`, 'utf8'));
const manifest = fx('manifest.json');
const snap: Snapshot = {
  manifest,
  indicators: { kraj: fx('indicators/kraj.json'), orp: fx('indicators/orp.json'), obec: fx('indicators/obec.json') },
  points: { skoly: fx('points/skoly.json') },
  geo: { kraje: fx('geo/kraje.topo.json'), 'kv-orp': fx('geo/kv-orp.topo.json'), 'kv-obce': fx('geo/kv-obce.topo.json') },
  skoly: null,
    vylety: null,
    urady: null,
    penize: null,
    podnikani: null,
  updatedAt: manifest.updatedAt,
};
const names = { CZ041: 'Karlovarský kraj', '4103': 'Karlovy Vary' };

beforeEach(() => document.documentElement.classList.add('crt-off')); // bez animace
afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('crt-off');
});

describe('Drilldown', () => {
  it('klik na KV → navigace na ORP; jiný kraj → jen výběr', async () => {
    const onnavigate = vi.fn();
    const { container } = render(Drilldown, {
      props: { snap, view: { level: 'kraj', area: null, orp: null }, indicator: 'obyvatele', year: 2024, names, onnavigate },
    });
    await fireEvent.click(container.querySelector('path[data-code="CZ042"]')!);
    expect(onnavigate).toHaveBeenLastCalledWith({ level: 'kraj', area: 'CZ042', orp: null });
    await fireEvent.click(container.querySelector('path[data-code="CZ041"]')!);
    await Promise.resolve();
    expect(onnavigate).toHaveBeenLastCalledWith({ level: 'orp', area: null, orp: null });
    // na úrovni krajů nejsou bodové vrstvy
    expect(container.querySelector('[data-testid="layer-skoly"]')).toBeNull();
  });

  it('obce ORP: jen obce daného ORP, přepínač vrstvy kreslí body, [↑ ÚROVEŇ VÝŠ] jde na ORP', async () => {
    const onnavigate = vi.fn();
    const { container, getByTestId } = render(Drilldown, {
      props: { snap, view: { level: 'obec', area: null, orp: '4103' }, indicator: 'obyvatele', year: 2024, names, onnavigate },
    });
    expect([...container.querySelectorAll('path.area')].map((p) => p.getAttribute('data-code'))).toEqual(['554961', '555215']);
    expect(container.querySelectorAll('[data-pt]')).toHaveLength(0);
    await fireEvent.click(getByTestId('layer-skoly'));
    // ve 4103 je jedna škola (s1)
    expect(container.querySelectorAll('[data-pt]')).toHaveLength(1);
    await fireEvent.click(getByTestId('level-up'));
    expect(onnavigate).toHaveBeenLastCalledWith({ level: 'orp', area: '4103', orp: null });
  });
});
