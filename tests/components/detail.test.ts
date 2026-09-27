// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import Detail from '../../src/components/Detail.svelte';
import Sources from '../../src/components/Sources.svelte';
import type { Snapshot } from '../../src/lib/data/loader.ts';

const fx = (p: string) => JSON.parse(readFileSync(`public/data/_fixtures/${p}`, 'utf8'));
const manifest = fx('manifest.json');
const snap: Snapshot = {
  manifest,
  indicators: { kraj: fx('indicators/kraj.json'), orp: fx('indicators/orp.json'), obec: fx('indicators/obec.json') },
  points: {},
  geo: {},
  updatedAt: manifest.updatedAt,
};

afterEach(() => cleanup());

describe('Detail', () => {
  it('hlavička dotazu, řádek na ukazatel se zdrojem a věta vs ČR', () => {
    const { container, getByTestId } = render(Detail, {
      props: { snap, level: 'kraj', code: 'CZ041', name: 'Karlovarský', indicator: 'nezamestnanost', year: 2024 },
    });
    expect(container.textContent).toContain('> DOTAZ UZEMI=CZ041 UKAZATEL=nezamestnanost ROK=2024');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(container.querySelector('.src a')?.textContent).toBe('FIKTIVNÍ TESTOVACÍ DATA');
    // screen reader dostane plnou větu přes aria-label Typewriteru
    expect(getByTestId('typewriter').getAttribute('aria-label')).toBe(
      'Podíl nezaměstnaných (2024): 4,6 %. Hodnota je o 21 % nad průměrem ČR.',
    );
  });

  it('chybějící hodnota → N/A s důvodem', () => {
    const { container } = render(Detail, {
      props: { snap, level: 'obec', code: '555215', name: 'Nejdek', indicator: 'skoly', year: 2024 },
    });
    const row = [...container.querySelectorAll('tbody tr')].find((r) => r.textContent?.includes('ŠKOLY'))!;
    expect(row.textContent).toContain('N/A');
    expect(row.textContent).toContain('Údaj za rok 2024 není k dispozici.');
  });

  it('ORP: věta i vs průměr kraje', () => {
    const { getByTestId } = render(Detail, {
      props: { snap, level: 'orp', code: '4103', name: 'KV', indicator: 'obyvatele', year: 2024 },
    });
    expect(getByTestId('typewriter').getAttribute('aria-label')).toContain('průměrem kraje');
  });
});

describe('Sources', () => {
  it('tabulka zdrojů, STALE amber, zavření', async () => {
    const onclose = vi.fn();
    const sources = [...manifest.sources, { ...manifest.sources[0], id: 'x', provider: 'ČSÚ', status: 'stale' }];
    const { container, getByText } = render(Sources, { props: { sources, updatedAt: manifest.updatedAt, onclose } });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(getByText('STALE').classList.contains('stale')).toBe(true);
    await fireEvent.click(getByText('[ZAVŘÍT ✕]'));
    expect(onclose).toHaveBeenCalled();
  });
});
