// @vitest-environment jsdom
//
// Regrese: Esc řeší VÝHRADNĚ globální `onKey` v App.svelte. V režimu „Kde by se
// mi dobře žilo?“ zavře detail obce, ale nesmí spadnout na `drill.up()` mapy kraje
// (dřív se to stalo u modálu HowModal) – režim skóre má vlastní stav a drill-down
// Statistiky nesmí měnit.
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

describe('App – Esc s otevřeným detailem obce v režimu skóre', () => {
  it('zavře detail, ale NEPROVEDE o úroveň výš v mapě kraje', async () => {
    location.hash = '#/kraj?m=explore'; // výchozí stránka je „Kam na střední“ (bez boot sekvence)
    const { container } = render(App);

    // mapa ČR se nenabízí – starý odkaz na kraje otevře rovnou ORP Karlovarského kraje
    await waitFor(() => expect(container.querySelector('path[data-code="4103"]')).toBeTruthy());
    expect(container.querySelector('path[data-code="CZ041"]')).toBeNull();

    // z ORP do obcí (klik na ORP Karlovy Vary) - odsud je kam jít "o úroveň výš"
    await fireEvent.click(container.querySelector('path[data-code="4103"]')!);
    await waitFor(() => expect(container.querySelector('[data-testid="level-up"]')).toBeTruthy());

    // přepnout do režimu skóre a otevřít detail obce kliknutím do jeho mapy
    await fireEvent.click(screen.getByTestId('mode-score'));
    const obec = screen.getByTestId('zivot-mapa').querySelector('path[data-code]')!;
    await fireEvent.click(obec);
    expect(screen.getByTestId('zivot-detail')).toBeTruthy();

    // Esc vyvolaný UVNITŘ detailu - probublá až na window, kde ho zachytí App
    await fireEvent.keyDown(screen.getByTestId('zivot-detail'), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('zivot-detail')).toBeNull());
    // pořád v režimu skóre - Esc detail zavřel a nic víc nezměnil
    expect(screen.getByTestId('mode-score').getAttribute('aria-current')).toBe('page');

    // návrat do průzkumu potvrdí, že mapa pořád je na úrovni obcí (kdyby Esc
    // omylem zavolal drill.up(), byli bychom zpět na úrovni ORP a tlačítko
    // [↑ ÚROVEŇ VÝŠ] by chybělo)
    await fireEvent.click(screen.getByTestId('mode-explore'));
    expect(container.querySelector('[data-testid="level-up"]')).toBeTruthy();
  });
});
