// @vitest-environment jsdom
//
// Regrese: HowModal dřív zavíralo Esc lokálně (volalo `onclose()`), ale
// událost NEzastavilo, takže probublala až na globální `onKey` v App.svelte.
// Ten viděl `howOpen` už `false` (lokální handler ho stihl vypnout dřív, ve
// stejném synchronním průchodu) a spadl na `drill.up()` - omylem šel o úroveň
// výš, i když uživatel jen zavíral modál. Oprava: Esc řeší VÝHRADNĚ App
// (stejně jako u Sources.svelte); tenhle test to ověřuje na celé aplikaci.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/svelte';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import App from '../../src/App.svelte';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

function fetchFromPublic(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    // App čte DATA_BASE='data'; test běží nad malými fixtures.
    const url = String(input).replace(/^(\.\/)?data\//, 'data/_fixtures/');
    const full = path.join(PUBLIC_DIR, url);
    if (!existsSync(full)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(full, 'utf8'), { status: 200 });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  document.documentElement.classList.add('crt-off'); // bez animace zoomu
  sessionStorage.setItem('kraj-term:boot-seen', '1'); // kratší minimální doba boot sekvence
  vi.stubGlobal('fetch', fetchFromPublic());
});
afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('crt-off');
  sessionStorage.clear();
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('App – Esc s otevřeným HowModal', () => {
  it('zavře modál, ale NEPROVEDE o úroveň výš (drill.up race)', async () => {
    location.hash = '#/kraj?m=explore'; // výchozí stránka je „Kam na střední“ (bez boot sekvence)
    const { container } = render(App);

    await fireEvent.click(screen.getByTestId('boot-skip'));
    await waitFor(() => expect(screen.getByTestId('mode-score')).toBeTruthy());

    // z kraje do ORP (klik na Karlovarský kraj) - odsud je kam jít "o úroveň výš"
    await fireEvent.click(container.querySelector('path[data-code="CZ041"]')!);
    await waitFor(() => expect(container.querySelector('[data-testid="level-up"]')).toBeTruthy());

    // přepnout do režimu skóre a otevřít "Jak se to počítá?"
    await fireEvent.click(screen.getByTestId('mode-score'));
    await fireEvent.click(screen.getByTestId('how-btn'));
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Esc vyvolaný UVNITŘ dialogu - probublá až na window, kde ho zachytí App
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // pořád v režimu skóre - Esc modál zavřel a nic víc nezměnil
    expect(screen.getByTestId('mode-score').getAttribute('aria-pressed')).toBe('true');

    // návrat do průzkumu potvrdí, že mapa pořád je na úrovni ORP (kdyby Esc
    // omylem zavolal drill.up(), byli bychom zpět na úrovni krajů a tlačítko
    // [↑ ÚROVEŇ VÝŠ] by chybělo)
    await fireEvent.click(screen.getByTestId('mode-explore'));
    expect(container.querySelector('[data-testid="level-up"]')).toBeTruthy();
  });
});
