// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import WeightPanel from '../../src/components/WeightPanel.svelte';
import { eligibleIndicators } from '../../src/lib/score.ts';
import type { IndicatorFile } from '../../src/lib/types.ts';

const file: IndicatorFile = {
  level: 'kraj',
  indicators: {
    obyvatele: {
      id: 'obyvatele',
      label: 'Počet obyvatel',
      unit: 'osoby',
      higherIsBetter: true,
      sourceId: 's',
      decimals: 0,
    },
    nezamestnanost: {
      id: 'nezamestnanost',
      label: 'Podíl nezaměstnaných',
      unit: '%',
      higherIsBetter: false,
      sourceId: 's',
      decimals: 1,
    },
    mzda: { id: 'mzda', label: 'Průměrná mzda', unit: 'Kč', higherIsBetter: true, sourceId: 's', decimals: 0 },
  },
  values: {},
};

const names = { CZ041: 'Karlovarský kraj', CZ042: 'Ústecký kraj' };

afterEach(() => cleanup());

describe('WeightPanel', () => {
  it('vykreslí jeden posuvník na každý způsobilý ukazatel a vyloučí "obyvatele"', () => {
    const indicators = eligibleIndicators(file);
    expect(indicators.map((d) => d.id)).toEqual(['nezamestnanost', 'mzda']);

    const { container } = render(WeightPanel, {
      props: {
        indicators,
        weights: {},
        names,
        scores: {},
        onweight: vi.fn(),
        onselect: vi.fn(),
        onhow: vi.fn(),
      },
    });
    const sliders = container.querySelectorAll('input[type="range"]');
    expect(sliders).toHaveLength(2);
    // výchozí hodnota je 0 pro všechny
    expect([...sliders].map((s) => (s as HTMLInputElement).value)).toEqual(['0', '0']);
    expect(container.querySelector('[data-testid="weight-obyvatele"]')).toBeNull();
  });

  it('posun posuvníku volá onweight; TOP 5 zobrazí žebříček a klik volá onselect', async () => {
    const onweight = vi.fn();
    const onselect = vi.fn();
    const indicators = eligibleIndicators(file);
    const scores = {
      CZ041: { score: 80, parts: [], skipped: [] },
      CZ042: { score: 40, parts: [], skipped: [] },
    };
    const { container, getByTestId } = render(WeightPanel, {
      props: { indicators, weights: { nezamestnanost: 3 }, names, scores, onweight, onselect, onhow: vi.fn() },
    });
    const slider = container.querySelector('input[aria-label="Váha: Podíl nezaměstnaných"]')!;
    await fireEvent.input(slider, { target: { value: '5' } });
    expect(onweight).toHaveBeenCalledWith('nezamestnanost', 5);

    expect(getByTestId('top5-CZ041').textContent?.replace(/\s+/g, ' ')).toContain('1. Karlovarský kraj 80 ze 100');
    expect(getByTestId('top5-CZ042').textContent?.replace(/\s+/g, ' ')).toContain('2. Ústecký kraj 40 ze 100');
    await fireEvent.click(getByTestId('top5-CZ041'));
    expect(onselect).toHaveBeenCalledWith('CZ041');
  });

  it('bez žádné váhy zobrazí výzvu místo žebříčku', () => {
    const indicators = eligibleIndicators(file);
    const { getByText } = render(WeightPanel, {
      props: { indicators, weights: {}, names, scores: {}, onweight: vi.fn(), onselect: vi.fn(), onhow: vi.fn() },
    });
    expect(getByText(/Nastavte alespoň jednu váhu/)).toBeTruthy();
  });
});
