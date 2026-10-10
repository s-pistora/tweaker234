// @vitest-environment jsdom
//
// Režim „Úřady“ na celé aplikaci nad reálným snapshotem public/data:
// přechod z menu, převzetí obce z „Kam na střední“, výběr situace, karty úřadů, odkaz.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/svelte';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import App from '../../src/App.svelte';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

function fetchFromPublic(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const full = path.join(PUBLIC_DIR, String(input).replace(/^\.\//, ''));
    if (!existsSync(full)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(full, 'utf8'), { status: 200 });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  document.documentElement.classList.add('crt-off');
  vi.stubGlobal('fetch', fetchFromPublic());
  // jsdom nemá ResizeObserver (mapa škol jím měří svou velikost)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('crt-off');
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('App – Úřady', () => {
  it('menu → převezme obec z Kam na střední → situace zvýrazní stavební úřad', async () => {
    location.hash = '#/kraj?m=skoly&d=537969';
    render(App);
    await waitFor(() => expect(screen.getByTestId('skoly-filtr')).toBeTruthy(), { timeout: 5000 });

    await fireEvent.click(screen.getByTestId('mode-urady'));
    expect(location.hash).toContain('m=urady');
    expect(location.hash).toContain('uo=537969');
    expect((screen.getByTestId('urady-obec') as HTMLSelectElement).value).toBe('537969');

    const karty = screen.getByTestId('urady-karty');
    expect(screen.getByTestId('urad-obecni').textContent).toContain('Obecní úřad Otovice');
    expect(screen.getByTestId('urad-orp').textContent).toContain('Magistrát města Karlovy Vary');
    expect(screen.getByTestId('urad-stavebni').textContent).toContain('Otovice u Karlových Var');
    expect(screen.getByTestId('urad-zivnostensky').textContent).toContain('Obecní živnostenský úřad Karlovy Vary');
    expect(screen.getByTestId('urad-matrika')).toBeTruthy();
    expect(karty.textContent).not.toMatch(/undefined|NaN/);

    await fireEvent.click(screen.getByTestId('situace-stavba'));
    expect(location.hash).toContain('us=stavba');
    expect(screen.getByTestId('urad-stavebni').classList.contains('hl')).toBe(true);
    expect(screen.getByTestId('situace-proc').textContent).toContain('katastrálního území');
  }, 20000);

  it('odkaz přímo na obec bez stavebního úřadu v datech ukáže upozornění', async () => {
    location.hash = '#/kraj?m=urady&uo=578011';
    render(App);
    await waitFor(() => expect(screen.getByTestId('urady-karty')).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByTestId('urad-stavebni')).toBeNull();
    expect(document.body.textContent).toContain('Stavební úřad pro tuto obec v datech kraje chybí.');
    expect(screen.queryByTestId('link-invalid')).toBeNull();
  }, 20000);
});
