// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Timeline from '../../src/components/Timeline.svelte';

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('crt-off');
  vi.useRealTimers();
});

describe('Timeline', () => {
  it('posuvník je nastaven na index aktuálního roku a je klávesnicově dostupný (native range)', () => {
    const { getByRole } = render(Timeline, {
      props: { years: [2020, 2021, 2022, 2023, 2024], year: 2022, onyear: vi.fn() },
    });
    const slider = getByRole('slider') as HTMLInputElement;
    expect(slider.tagName).toBe('INPUT');
    expect(slider.getAttribute('type')).toBe('range');
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('4');
    expect(slider.value).toBe('2');
    expect(slider.getAttribute('aria-label')).toBeTruthy();
  });

  it('posun posuvníku volá onyear se správným rokem', async () => {
    const onyear = vi.fn();
    const { getByRole } = render(Timeline, {
      props: { years: [2020, 2021, 2022], year: 2020, onyear },
    });
    const slider = getByRole('slider');
    await fireEvent.input(slider, { target: { value: '2' } });
    expect(onyear).toHaveBeenCalledWith(2022);
  });

  it('▶ přehraje 700 ms/rok od aktuálního roku po poslední a zastaví se (nesmyčkuje)', async () => {
    vi.useFakeTimers();
    const onyear = vi.fn();
    const { getByTestId } = render(Timeline, {
      props: { years: [2020, 2021, 2022], year: 2020, onyear },
    });
    const playBtn = getByTestId('timeline-play');
    expect(playBtn.textContent).toContain('▶');
    await fireEvent.click(playBtn);
    expect(playBtn.getAttribute('aria-pressed')).toBe('true');
    expect(playBtn.textContent).toContain('❚❚');

    await vi.advanceTimersByTimeAsync(700);
    expect(onyear).toHaveBeenNthCalledWith(1, 2021);
    await vi.advanceTimersByTimeAsync(700);
    expect(onyear).toHaveBeenNthCalledWith(2, 2022);

    // po dosažení posledního roku se přehrávání samo zastaví (nepokračuje na 2020)
    await vi.advanceTimersByTimeAsync(700);
    expect(onyear).toHaveBeenCalledTimes(2);
    expect(getByTestId('timeline-play').getAttribute('aria-pressed')).toBe('false');
  });

  it('.crt-off (reduced motion): ▶ jen skočí na poslední rok, bez animace', async () => {
    document.documentElement.classList.add('crt-off');
    const onyear = vi.fn();
    const { getByTestId } = render(Timeline, {
      props: { years: [2020, 2021, 2022], year: 2020, onyear },
    });
    await fireEvent.click(getByTestId('timeline-play'));
    expect(onyear).toHaveBeenCalledTimes(1);
    expect(onyear).toHaveBeenCalledWith(2022);
    expect(getByTestId('timeline-play').getAttribute('aria-pressed')).toBe('false');
  });

  it('druhý klik na ▶ (nyní ❚❚) přehrávání zastaví', async () => {
    vi.useFakeTimers();
    const onyear = vi.fn();
    const { getByTestId } = render(Timeline, {
      props: { years: [2020, 2021, 2022, 2023], year: 2020, onyear },
    });
    await fireEvent.click(getByTestId('timeline-play'));
    await vi.advanceTimersByTimeAsync(700);
    expect(onyear).toHaveBeenCalledTimes(1);
    await fireEvent.click(getByTestId('timeline-play'));
    await vi.advanceTimersByTimeAsync(1400);
    expect(onyear).toHaveBeenCalledTimes(1); // žádné další volání po zastavení
  });
});
