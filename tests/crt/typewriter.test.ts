// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/svelte';
import Typewriter from '../../src/components/crt/Typewriter.svelte';

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('crt-off');
  vi.unstubAllGlobals();
});

describe('Typewriter', () => {
  it('po keydown zobrazí celý text okamžitě a zavolá ondone', async () => {
    const ondone = vi.fn();
    render(Typewriter, { props: { text: 'AHOJ SVĚTE', speed: 5000, ondone } });
    const el = screen.getByTestId('typewriter');

    // před dokončením ještě není celý text vypsaný
    expect(el.textContent).not.toBe('AHOJ SVĚTE');

    await fireEvent.keyDown(el, { key: 'Escape' });

    expect(el.textContent).toBe('AHOJ SVĚTE');
    expect(ondone).toHaveBeenCalledTimes(1);
  });

  it('klik na text dokončí zobrazení okamžitě', async () => {
    const ondone = vi.fn();
    render(Typewriter, { props: { text: 'KLIK', speed: 5000, ondone } });
    const el = screen.getByTestId('typewriter');

    await fireEvent.click(el);

    expect(el.textContent).toBe('KLIK');
    expect(ondone).toHaveBeenCalledTimes(1);
  });

  it('s prefers-reduced-motion zobrazí text hned bez animace', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );

    const ondone = vi.fn();
    render(Typewriter, { props: { text: 'DATA', speed: 5000, ondone } });
    const el = screen.getByTestId('typewriter');

    expect(el.textContent).toBe('DATA');
    expect(ondone).toHaveBeenCalledTimes(1);
  });

  it('s .crt-off na <html> zobrazí text hned', () => {
    document.documentElement.classList.add('crt-off');

    render(Typewriter, { props: { text: 'BEZ EFEKTU', speed: 5000 } });
    const el = screen.getByTestId('typewriter');

    expect(el.textContent).toBe('BEZ EFEKTU');
  });

  it('aria-label je vždy plný text (i před dokončením)', () => {
    render(Typewriter, { props: { text: 'PLNÝ TEXT PRO ČTEČKU', speed: 5000 } });
    const el = screen.getByTestId('typewriter');

    expect(el.getAttribute('aria-label')).toBe('PLNÝ TEXT PRO ČTEČKU');
  });
});
