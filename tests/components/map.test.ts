// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import Map from '../../src/components/Map.svelte';
import { areaFeatures } from '../../src/lib/map/project.ts';
import { valuesFor } from '../../src/lib/map/values.ts';
import type { IndicatorFile } from '../../src/lib/types.ts';

const fx = (p: string) => JSON.parse(readFileSync(`public/data/_fixtures/${p}`, 'utf8'));
const kraje = fx('geo/kraje.topo.json');
const krajFile = fx('indicators/kraj.json') as IndicatorFile;

afterEach(() => cleanup());

function setup(extra: Record<string, unknown> = {}) {
  const features = areaFeatures(kraje);
  const def = krajFile.indicators.nezamestnanost;
  return render(Map, {
    props: { features, values: valuesFor(krajFile, 'nezamestnanost', 2024), def, year: 2024, ...extra },
  });
}

describe('Map', () => {
  it('vykreslí jednu cestu na území s aria-label z fixtures', () => {
    const { container } = setup();
    const paths = container.querySelectorAll('path.area');
    expect(paths).toHaveLength(3);
    const labels = [...paths].map((p) => p.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Karlovarský kraj (fixture): 4,6 (2024)',
      'Ústecký kraj (fixture): 5,2 (2024)',
      'Plzeňský kraj (fixture): N/A (2024)',
    ]);
    for (const p of paths) {
      expect(p.getAttribute('role')).toBe('button');
      expect(p.getAttribute('tabindex')).toBe('0');
    }
    // chybějící hodnota → vzor N/A
    expect(paths[2].getAttribute('fill')).toBe('url(#pna)');
  });

  it('bez vlastního `preview`: chybějící hodnota → tooltip "N/A PRO ROK <rok>"', async () => {
    // Plzeňský kraj (CZ032) nemá v roce 2024 hodnotu nezaměstnanosti.
    const { container, getByTestId } = setup();
    const cz032 = container.querySelector('path[data-code="CZ032"]')!;
    await fireEvent.mouseEnter(cz032);
    expect(getByTestId('map-tooltip').textContent).toContain('N/A PRO ROK 2024');
  });

  it('klik i Enter volají onselect; hover plní aria-live náhled', async () => {
    const onselect = vi.fn();
    const { container, getByTestId } = setup({ onselect, preview: (c: string) => [`řádek ${c}`] });
    const kv = container.querySelector('path[data-code="CZ041"]')!;
    await fireEvent.mouseEnter(kv);
    const tip = getByTestId('map-tooltip');
    expect(tip.getAttribute('aria-live')).toBe('polite');
    expect(tip.textContent).toContain('řádek CZ041');
    await fireEvent.click(kv);
    await fireEvent.keyDown(kv, { key: 'Enter' });
    expect(onselect).toHaveBeenCalledTimes(2);
    expect(onselect).toHaveBeenCalledWith('CZ041');
  });

  it('šipka doprava přesune fokus na souseda', async () => {
    const { container } = setup();
    const kv = container.querySelector('path[data-code="CZ041"]') as SVGPathElement;
    kv.focus();
    await fireEvent.keyDown(kv, { key: 'ArrowRight' });
    const active = document.activeElement as Element;
    expect(active.getAttribute('data-code')).not.toBe('CZ041');
    expect(active.getAttribute('data-code')).toMatch(/^CZ0(42|32)$/);
  });

  it('zoomTarget bez animace (reduced motion) hned volá onzoomend', async () => {
    document.documentElement.classList.add('crt-off');
    const onzoomend = vi.fn();
    setup({ zoomTarget: 'CZ041', onzoomend });
    await Promise.resolve();
    expect(onzoomend).toHaveBeenCalledTimes(1);
    document.documentElement.classList.remove('crt-off');
  });
});
