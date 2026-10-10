// @vitest-environment jsdom
//
// Přístupnost: v každé části aplikace mají ovládací prvky přístupný název a ID se neopakují.
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

function nazev(el: Element): string {
  const aria = el.getAttribute('aria-label') ?? '';
  const by = (el.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .map((id) => (id ? (document.getElementById(id)?.textContent ?? '') : ''))
    .join(' ');
  const title = el.getAttribute('title') ?? '';
  const labels = 'labels' in el ? [...((el as HTMLInputElement).labels ?? [])].map((l) => l.textContent).join(' ') : '';
  const text = el.textContent ?? '';
  return (aria + by + title + labels + text).trim();
}

function problemy(): string[] {
  const out: string[] = [];
  for (const b of document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="radio"]')) {
    if (!nazev(b)) out.push(`bez názvu: ${b.outerHTML.slice(0, 120)}`);
  }
  for (const i of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
    if (!nazev(i) && !i.getAttribute('placeholder')) out.push(`pole bez labelu: ${i.outerHTML.slice(0, 120)}`);
  }
  const ids = new Map<string, number>();
  for (const e of document.querySelectorAll('[id]')) ids.set(e.id, (ids.get(e.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) out.push(`duplicitní id: ${id} (${n}×)`);
  for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) out.push(`obrázek bez alt: ${img.outerHTML.slice(0, 80)}`);
  return out;
}

const STRANKY = [
  '#/kraj?m=domu',
  '#/kraj?m=obec&d=560537&vd=560537&uo=560537',
  '#/kraj?m=skoly&d=554481',
  '#/kraj?m=vylety&vd=554481',
  '#/kraj?m=vylety&vk=hrady-zamky&vd=554481',
  '#/kraj?m=score',
  '#/kraj?m=urady&uo=554481',
  '#/kraj?m=penize',
  '#/kraj?m=podnikani',
  '#/kraj?m=nalezy',
  '#/kraj?m=explore',
];

describe('Přístupnost – všechny části aplikace', () => {
  for (const hash of STRANKY) {
    it(`${hash}: ovládací prvky mají název, pole label, id jsou jedinečná`, async () => {
      location.hash = hash;
      render(App);
      await waitFor(() => expect(document.querySelector('[data-testid="brand-home"]')).toBeTruthy(), { timeout: 5000 });
      await waitFor(() => expect(document.querySelectorAll('main button, main a').length).toBeGreaterThan(0), { timeout: 5000 });
      expect(problemy()).toEqual([]);
      expect(document.querySelector('a.skiplink')).toBeTruthy();
    }, 20000);
  }
});
