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

describe('Timeline – rodič s novým polem let při každé změně roku', () => {
  // Regrese: App při každé změně stavu (i roku, který posunul sám časovač)
  // vytvoří nové pole `years` se stejnými hodnotami. Přehrávání se tím nesmí
  // zastavit po prvním kroku.
  function renderWithParent(values: number[], start: number) {
    const calls: number[] = [];
    const onyear = (y: number) => {
      calls.push(y);
      void utils.rerender({ years: [...values], year: y, onyear });
    };
    const utils = render(Timeline, {
      props: { years: [...values], year: start, onyear },
    });
    return { ...utils, calls };
  }

  it('▶ projede všechny roky až na poslední a tam se zastaví', async () => {
    vi.useFakeTimers();
    const { getByTestId, calls } = renderWithParent([2020, 2021, 2022, 2023], 2020);
    await fireEvent.click(getByTestId('timeline-play'));
    await vi.advanceTimersByTimeAsync(700 * 5);
    expect(calls).toEqual([2021, 2022, 2023]);
    expect(getByTestId('timeline-year').textContent).toBe('2023');
    expect(getByTestId('timeline-play').getAttribute('aria-pressed')).toBe('false');
  });

  it('▶ na posledním roce začne znovu od prvního', async () => {
    vi.useFakeTimers();
    const { getByTestId, calls } = renderWithParent([2020, 2021, 2022, 2023], 2023);
    await fireEvent.click(getByTestId('timeline-play'));
    await vi.advanceTimersByTimeAsync(700 * 5);
    expect(calls).toEqual([2020, 2021, 2022, 2023]);
    expect(getByTestId('timeline-play').getAttribute('aria-pressed')).toBe('false');
  });

  it('posun posuvníku během přehrávání přehrávání zastaví', async () => {
    vi.useFakeTimers();
    const { getByTestId, getByRole, calls } = renderWithParent([2020, 2021, 2022, 2023], 2020);
    await fireEvent.click(getByTestId('timeline-play'));
    await vi.advanceTimersByTimeAsync(700);
    await fireEvent.input(getByRole('slider'), { target: { value: '0' } });
    expect(getByTestId('timeline-play').getAttribute('aria-pressed')).toBe('false');
    await vi.advanceTimersByTimeAsync(700 * 3);
    expect(calls).toEqual([2021, 2020]);
  });

  it('.crt-off (reduced motion): ▶ skočí rovnou na poslední rok', async () => {
    document.documentElement.classList.add('crt-off');
    const { getByTestId, calls } = renderWithParent([2020, 2021, 2022, 2023], 2020);
    await fireEvent.click(getByTestId('timeline-play'));
    expect(calls).toEqual([2023]);
    expect(getByTestId('timeline-play').getAttribute('aria-pressed')).toBe('false');
  });

  it('změna sady let (jiný ukazatel) přehrávání zastaví', async () => {
    vi.useFakeTimers();
    const onyear = vi.fn();
    const { getByTestId, rerender } = render(Timeline, {
      props: { years: [2020, 2021, 2022, 2023], year: 2020, onyear },
    });
    await fireEvent.click(getByTestId('timeline-play'));
    await rerender({ years: [2015, 2016, 2017], year: 2015, onyear });
    expect(getByTestId('timeline-play').getAttribute('aria-pressed')).toBe('false');
    await vi.advanceTimersByTimeAsync(700 * 3);
    expect(onyear).not.toHaveBeenCalled();
  });
});
