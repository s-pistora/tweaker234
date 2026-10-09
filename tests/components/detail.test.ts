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
  skoly: null,
    vylety: null,
  updatedAt: manifest.updatedAt,
};

afterEach(() => cleanup());

describe('Detail', () => {
  it('hlavička dotazu, řádek na ukazatel se zdrojem a věta vs ČR', () => {
    const { container, getByTestId } = render(Detail, {
      props: { snap, level: 'kraj', code: 'CZ041', name: 'Karlovarský', indicator: 'nezamestnanost', year: 2024 },
    });
    expect(container.textContent).toContain('Karlovarský');
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
    const row = [...container.querySelectorAll('tbody tr')].find((r) => r.textContent?.toLowerCase().includes('školy'))!;
    expect(row.textContent).toContain('N/A');
    expect(row.textContent).toContain('Údaj za rok 2024 není k dispozici.');
  });

  it('ORP: věta i vs průměr kraje (relativní ukazatel)', () => {
    const { getByTestId } = render(Detail, {
      props: { snap, level: 'orp', code: '4103', name: 'KV', indicator: 'skoly', year: 2024 },
    });
    expect(getByTestId('typewriter').getAttribute('aria-label')).toContain('průměrem kraje');
  });

  it('absolutní počet (obyvatelé) se s ČR ani krajem nesrovnává – jen hodnota a vývoj', () => {
    const { getByTestId } = render(Detail, {
      props: { snap, level: 'orp', code: '4103', name: 'KV', indicator: 'obyvatele', year: 2024 },
    });
    const veta = getByTestId('typewriter').getAttribute('aria-label') ?? '';
    expect(veta).toContain('Počet obyvatel');
    expect(veta).not.toContain('průměrem');
  });

  it('chybějící `national` u ORP/obce (např. absolutní počty bez srovnání s ČR) nespadne, jen vynechá větu vs ČR', () => {
    const orpNoNational = { ...fx('indicators/orp.json') };
    delete orpNoNational.national; // simuluje budoucí snapshot bez `national` pro tyto ukazatele
    const snapNoNational: Snapshot = {
      ...snap,
      indicators: { ...snap.indicators, orp: orpNoNational },
    };
    const { getByTestId, container } = render(Detail, {
      props: { snap: snapNoNational, level: 'orp', code: '4103', name: 'KV', indicator: 'skoly', year: 2024 },
    });
    // pořád se vykreslí (nespadlo) a věta se vůči kraji pořád ukáže (`regional` zůstal)
    expect(container.querySelector('.rows')).toBeTruthy();
    expect(getByTestId('typewriter').getAttribute('aria-label')).toContain('průměrem kraje');
    expect(getByTestId('typewriter').getAttribute('aria-label')).not.toContain('ČR');
  });
});

describe('Detail – obec nezaměstnanost (prosincová hodnota vs roční průměr kraje/ČR)', () => {
  it('sourceId csu-obec-nezamestnanost -> věta má poznámku o rozdílných obdobích (review finding #8)', () => {
    const obecNez = {
      ...fx('indicators/obec.json'),
      indicators: {
        ...fx('indicators/obec.json').indicators,
        nezamestnanost: {
          id: 'nezamestnanost',
          label: 'Podíl nezaměstnaných osob (obec, prosinec)',
          unit: '%',
          higherIsBetter: false,
          sourceId: 'csu-obec-nezamestnanost',
          decimals: 1,
        },
      },
      values: {
        ...fx('indicators/obec.json').values,
        nezamestnanost: { '554961': { 2024: 5 } },
      },
      national: { nezamestnanost: { 2024: 4 } },
      regional: { ...fx('indicators/obec.json').regional, nezamestnanost: { 2024: 4.5 } },
    };
    const snapNez: Snapshot = { ...snap, indicators: { ...snap.indicators, obec: obecNez } };
    const { getByTestId } = render(Detail, {
      props: { snap: snapNez, level: 'obec', code: '554961', name: 'Karlovy Vary', indicator: 'nezamestnanost', year: 2024 },
    });
    expect(getByTestId('typewriter').getAttribute('aria-label')).toContain(
      '(obec: stav k prosinci, kraj/ČR: roční průměr)',
    );
  });

  it('jiny sourceId (ne csu-obec-nezamestnanost) -> zadna poznamka', () => {
    // vychozi fixture "obyvatele" ma sourceId "fixture" - poznamka se nesmi objevit
    const { getByTestId } = render(Detail, {
      props: { snap, level: 'obec', code: '554961', name: 'Karlovy Vary', indicator: 'obyvatele', year: 2024 },
    });
    expect(getByTestId('typewriter').getAttribute('aria-label')).not.toContain('roční průměr');
  });
});

describe('Sources', () => {
  it('tabulka zdrojů, starší zdroj zvýrazněný, zavření', async () => {
    const onclose = vi.fn();
    const sources = [...manifest.sources, { ...manifest.sources[0], id: 'x', provider: 'ČSÚ', status: 'stale' }];
    const { container, getByText } = render(Sources, { props: { sources, updatedAt: manifest.updatedAt, onclose } });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(sources.length);
    expect(getByText('Starší').classList.contains('stale')).toBe(true);
    await fireEvent.click(getByText('Zavřít'));
    expect(onclose).toHaveBeenCalled();
  });
});
