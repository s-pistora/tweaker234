// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import Boot from '../../src/components/crt/Boot.svelte';

type Status = 'ok' | 'stale' | 'fail';
type OnStep = (s: { label: string; status: Status }) => void;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  try {
    sessionStorage.clear();
  } catch {
    /* noop */
  }
  vi.useRealTimers();
});

describe('Boot', () => {
  it('každý onStep vytvoří řádek ve formátu NAČÍTÁM <label>… OK|STALE|FAIL → SNAPSHOT', async () => {
    const { promise } = deferred<unknown>();
    let captured: OnStep | undefined;
    const load = vi.fn((onStep: OnStep) => {
      captured = onStep;
      return promise;
    });

    render(Boot, { props: { load, ondone: vi.fn(), maxMs: 10_000, minMs: 10_000 } });

    captured!({ label: 'MANIFEST', status: 'ok' });
    captured!({ label: 'GEODATA KRAJŮ', status: 'stale' });
    captured!({ label: 'BODOVÉ VRSTVY', status: 'fail' });
    await tick();

    const el = screen.getByTestId('boot');
    expect(el.textContent).toContain('NAČÍTÁM MANIFEST… OK');
    expect(el.textContent).toContain('NAČÍTÁM GEODATA KRAJŮ… STALE');
    expect(el.textContent).toContain('NAČÍTÁM BODOVÉ VRSTVY… FAIL → SNAPSHOT');
  });

  it('Esc dokončí boot okamžitě, i když load ještě neskončil', async () => {
    const { promise } = deferred<unknown>();
    const load = vi.fn(() => promise);
    const ondone = vi.fn();

    render(Boot, { props: { load, ondone, maxMs: 10_000, minMs: 10_000 } });
    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(ondone).toHaveBeenCalledTimes(1);
  });

  it('klik na [PŘESKOČIT] dokončí boot okamžitě', async () => {
    const { promise } = deferred<unknown>();
    const load = vi.fn(() => promise);
    const ondone = vi.fn();

    render(Boot, { props: { load, ondone, maxMs: 10_000, minMs: 10_000 } });
    await fireEvent.click(screen.getByTestId('boot-skip'));

    expect(ondone).toHaveBeenCalledTimes(1);
  });

  it('po přeskočení se data dál dotahují na pozadí (load se nezruší) a ondone je idempotentní', async () => {
    const { promise, resolve } = deferred<unknown>();
    let captured: OnStep | undefined;
    const load = vi.fn((onStep: OnStep) => {
      captured = onStep;
      return promise;
    });
    const ondone = vi.fn();

    render(Boot, { props: { load, ondone, maxMs: 10_000, minMs: 10_000 } });
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(ondone).toHaveBeenCalledTimes(1);

    // Načítání pokračuje na pozadí – onStep i po přeskočení dál aktualizuje stav.
    captured!({ label: 'ZASTÁVKY', status: 'ok' });
    await tick();
    expect(screen.getByTestId('boot').textContent).toContain('NAČÍTÁM ZASTÁVKY… OK');

    resolve(undefined);
    await promise;
    await tick();

    // ondone se nezavolal podruhé, když load doběhl po přeskočení.
    expect(ondone).toHaveBeenCalledTimes(1);
  });

  it('i když load nikdy neskončí, ondone se zavolá nejpozději po maxMs (výchozí ~3s)', async () => {
    vi.useFakeTimers();
    const load = vi.fn(() => new Promise(() => {}));
    const ondone = vi.fn();

    render(Boot, { props: { load, ondone, maxMs: 3000, minMs: 0 } });
    await vi.advanceTimersByTimeAsync(3000);

    expect(ondone).toHaveBeenCalledTimes(1);
  });

  it('sessionStorage: opakovaná návštěva zkrátí minimální dobu zobrazení', async () => {
    sessionStorage.setItem('kraj-term:boot-seen', '1');
    vi.useFakeTimers();
    const load = vi.fn(() => Promise.resolve());
    const ondone = vi.fn();

    render(Boot, { props: { load, ondone, maxMs: 3000 } });
    await vi.advanceTimersByTimeAsync(100);

    expect(ondone).toHaveBeenCalledTimes(1);
  });

  it('sessionStorage: první návštěva používá delší minimální dobu (~400ms)', async () => {
    vi.useFakeTimers();
    const load = vi.fn(() => Promise.resolve());
    const ondone = vi.fn();

    render(Boot, { props: { load, ondone, maxMs: 3000 } });
    await vi.advanceTimersByTimeAsync(100);
    expect(ondone).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(ondone).toHaveBeenCalledTimes(1);
  });
});
