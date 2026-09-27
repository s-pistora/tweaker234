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
    const btn = getByTestId('mode-toggle');
    expect(btn.textContent).toContain('PRŮZKUM');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    await fireEvent.click(btn);
    expect(onmode).toHaveBeenCalled();

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
    expect(getByTestId('mode-toggle').textContent).toContain('KDE BY SE MI DOBŘE ŽILO?');
    expect(getByTestId('mode-toggle').getAttribute('aria-pressed')).toBe('true');
  });
});
