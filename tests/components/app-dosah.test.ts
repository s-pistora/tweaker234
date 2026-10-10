// @vitest-environment jsdom
//
// Mapy v běžící aplikaci: s bydlištěm se kreslí jen objekty do zvolené vzdálenosti.
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

import { vzdalenostKm } from '../../src/lib/skoly.ts';
import { areaFeatures } from '../../src/lib/map/project.ts';
import { centroidy } from '../../src/lib/map/centroids.ts';
const pub = (p: string) => JSON.parse(readFileSync(path.join(PUBLIC_DIR, 'data', p), 'utf8'));
const stredy = centroidy(areaFeatures(pub('geo/kv-obce.topo.json')));
const skolaPoloha = new Map<string, { lat: number; lon: number }>(
  pub('skoly/obory.json').obory.map((o: { izo: string; lat: number; lon: number }) => [o.izo, o]),
);
const mistoPoloha = new Map<string, { lat: number; lon: number }>(
  pub('vylety/mista.json').mista.map((m: { id: string; lat: number; lon: number }) => [m.id, m]),
);

describe('App – mapy respektují dosah', () => {
  for (const [obec, km] of [
    ['554481', 10],
    ['560286', 25],
    ['554961', 5],
  ] as const) {
    it(`Kam na střední: obec ${obec}, ${km} km – jen školy v dosahu, žádné šedé tečky`, async () => {
      location.hash = `#/kraj?m=skoly&d=${obec}&km=${km}`;
      render(App);
      await waitFor(() => expect(screen.getByTestId('skoly-mapa')).toBeTruthy(), { timeout: 5000 });
      const mapa = screen.getByTestId('skoly-mapa');
      expect(mapa.querySelectorAll('.tecka')).toHaveLength(0);
      const znacky = [...mapa.querySelectorAll('circle.skola')];
      expect(znacky.length).toBeGreaterThan(0);
      const d = stredy[obec];
      for (const z of znacky) {
        const p = skolaPoloha.get(z.getAttribute('data-izo')!)!;
        expect(vzdalenostKm(d.lat, d.lon, p.lat, p.lon)).toBeLessThanOrEqual(km);
      }
      // počet škol na mapě = počet karet škol v seznamu
      const nadpis = screen.getByTestId('obory-list').querySelector('h2')!.textContent!;
      expect(Number(nadpis.match(/\d+/)![0])).toBe(znacky.length);
      // kružnice dosahu je vykreslená
      expect(mapa.querySelector('.kruh')).toBeTruthy();
    }, 20000);
  }

  it('Kam vyrazit: rozcestník i kategorie – body jen do dosahu', async () => {
    for (const hash of ['#/kraj?m=vylety&vd=554481&vkm=10', '#/kraj?m=vylety&vk=pamatky&vd=560286&vkm=20']) {
      cleanup();
      location.hash = hash;
      const { container } = render(App);
      await waitFor(() => expect(container.querySelector('[data-pt]')).toBeTruthy(), { timeout: 5000 });
      const obec = /vd=(\d+)/.exec(hash)![1];
      const km = Number(/vkm=(\d+)/.exec(hash)![1]);
      const d = stredy[obec];
      const body = [...container.querySelectorAll('[data-pt]')];
      for (const b of body) {
        const p = mistoPoloha.get(b.getAttribute('data-pt')!)!;
        expect(p).toBeTruthy();
        expect(vzdalenostKm(d.lat, d.lon, p.lat, p.lon)).toBeLessThanOrEqual(km);
      }
    }
  }, 30000);
});

describe('App – tlačítka mapy škol', () => {
  it('+ přiblíží, − oddálí, „Celý kraj“ vrátí celý pohled; klik na obec nastaví bydliště', async () => {
    location.hash = '#/kraj?m=skoly';
    render(App);
    await waitFor(() => expect(screen.getByTestId('skoly-mapa')).toBeTruthy(), { timeout: 5000 });
    const svg = screen.getByTestId('skoly-mapa').querySelector('svg')!;
    const sirka = () => Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const cely = sirka();
    await fireEvent.click(screen.getByRole('button', { name: 'Přiblížit' }));
    await waitFor(() => expect(sirka()).toBeLessThan(cely));
    const pri = sirka();
    await fireEvent.click(screen.getByRole('button', { name: 'Oddálit' }));
    await waitFor(() => expect(sirka()).toBeGreaterThan(pri));
    await fireEvent.click(screen.getByRole('button', { name: 'Přiblížit' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Celý kraj' }));
    await waitFor(() => expect(sirka()).toBe(cely));
    // klik na obec = bydliště → kružnice a přiblížení na okolí
    await fireEvent.click(svg.querySelector('path[data-code="554481"]')!);
    await waitFor(() => expect(location.hash).toContain('d=554481'));
    await waitFor(() => expect(svg.querySelector('.kruh')).toBeTruthy());
  }, 20000);
});
