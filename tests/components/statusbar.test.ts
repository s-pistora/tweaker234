// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import StatusBar from '../../src/components/StatusBar.svelte';

afterEach(() => cleanup());

const def = (id: string, label: string) => ({ id, label, unit: '%', higherIsBetter: true, sourceId: 's', decimals: 1 });

describe('StatusBar', () => {
  it('výběr ukazatele volá onindicator, datum aktualizace je česky', async () => {
    const onindicator = vi.fn();
    const { getByTestId, getByText } = render(StatusBar, {
      props: {
        updatedAt: '2026-01-01T00:00:00.000Z',
        indicators: [def('a', 'Ukazatel A'), def('b', 'Ukazatel B')],
        indicator: 'a',
        years: [2023, 2024],
        year: 2024,
        onindicator,
        onyear: vi.fn(),
      },
    });
    expect(getByTestId('updated-at').textContent).toContain('1. ledna 2026');
    expect(getByText('Rok')).toBeTruthy();
    await fireEvent.change(getByTestId('indicator-select'), { target: { value: 'b' } });
    expect(onindicator).toHaveBeenCalledWith('b');
  });
});
