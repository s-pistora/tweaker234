// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import HowModal from '../../src/components/HowModal.svelte';
import type { IndicatorDef } from '../../src/lib/types.ts';

afterEach(() => cleanup());

const nez: IndicatorDef = {
  id: 'nezamestnanost',
  label: 'Podíl nezaměstnaných',
  unit: '%',
  higherIsBetter: false,
  sourceId: 's',
  decimals: 1,
};
const mzda: IndicatorDef = { id: 'mzda', label: 'Průměrná mzda', unit: 'Kč', higherIsBetter: true, sourceId: 's', decimals: 0 };

describe('HowModal', () => {
  it('zobrazí vzorec, tabulku ukazatelů s roky a rozpad pro vybrané území', () => {
    const { getByText, getByTestId } = render(HowModal, {
      props: {
        indicators: [
          { def: nez, year: 2024, weight: 3 },
          { def: mzda, year: 2023, weight: 1 },
        ],
        selectedName: 'Karlovarský kraj',
        parts: [
          { id: 'nezamestnanost', p: 80, w: 3, value: 4.6, year: 2024 },
        ],
        skipped: [mzda],
        onclose: vi.fn(),
      },
    });
    expect(getByText(/skóre = Σ wᵢ·pᵢ \/ Σ wᵢ/)).toBeTruthy();
    expect(getByText('Rozpad pro: Karlovarský kraj')).toBeTruthy();
    expect(getByTestId('how-skipped').textContent).toContain('Průměrná mzda');
  });

  it('Esc volá onclose', async () => {
    const onclose = vi.fn();
    const { container } = render(HowModal, {
      props: { indicators: [{ def: nez, year: 2024, weight: 1 }], onclose },
    });
    await fireEvent.keyDown(container.querySelector('[role="dialog"]')!, { key: 'Escape' });
    expect(onclose).toHaveBeenCalled();
  });

  it('fokus je uvězněný: Tab na posledním prvku skočí na první, Shift+Tab na prvním na poslední', async () => {
    render(HowModal, {
      props: { indicators: [{ def: nez, year: 2024, weight: 1 }], onclose: vi.fn() },
    });
    const dialog = document.querySelector('[role="dialog"]')!;
    const focusables = [...dialog.querySelectorAll('button, a[href], input, [tabindex]')] as HTMLElement[];
    expect(focusables.length).toBeGreaterThanOrEqual(1);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    // po mountu je fokus na prvním prvku
    expect(document.activeElement).toBe(first);

    last.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
