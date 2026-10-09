// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import StatusBar from '../../src/components/StatusBar.svelte';

afterEach(() => cleanup());

describe('StatusBar', () => {
  it('přepínač režimu zobrazuje aktuální režim a volá onmode', async () => {
    const onmode = vi.fn();
    const { getByTestId, rerender } = render(StatusBar, {
      props: {
        updatedAt: '2026-01-01T00:00:00.000Z',
        indicators: [],
        indicator: '',
        years: [],
        year: 2024,
        mode: 'explore' as const,
        onindicator: vi.fn(),
        onyear: vi.fn(),
        onmode,
        onsources: vi.fn(),
      },
    });
    expect(getByTestId('mode-explore').getAttribute('aria-pressed')).toBe('true');
    expect(getByTestId('mode-score').getAttribute('aria-pressed')).toBe('false');
    expect(getByTestId('mode-skoly').textContent).toContain('KAM NA STŘEDNÍ');
    await fireEvent.click(getByTestId('mode-skoly'));
    expect(onmode).toHaveBeenCalledWith('skoly');

    await rerender({
      updatedAt: '2026-01-01T00:00:00.000Z',
      indicators: [],
      indicator: '',
      years: [],
      year: 2024,
      mode: 'score' as const,
      onindicator: vi.fn(),
      onyear: vi.fn(),
      onmode,
      onsources: vi.fn(),
    });
    expect(getByTestId('mode-score').textContent).toContain('KDE BY SE MI DOBŘE ŽILO?');
    expect(getByTestId('mode-score').getAttribute('aria-pressed')).toBe('true');
    expect(getByTestId('mode-explore').getAttribute('aria-pressed')).toBe('false');
  });
});
