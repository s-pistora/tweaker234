import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cssPath = fileURLToPath(new URL('../../src/styles/crt.css', import.meta.url));
const appPath = fileURLToPath(new URL('../../src/App.svelte', import.meta.url));

const cssRaw = readFileSync(cssPath, 'utf8');
// odstranit /* … */ komentáře, ať test neomylem "najde" .crt-glow zmíněné jen v komentáři
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
const appSrc = readFileSync(appPath, 'utf8');

describe('crt.css – .crt-off / prefers-reduced-motion nesmí skrýt reálný text (regrese)', () => {
  it('žádné pravidlo s ".crt-glow"/".crt-glow-amber" v selektoru nenastavuje display:none', () => {
    // hrubý parser pravidel "selektor { tělo }" – stačí pro regresní kontrolu tohoto bugu
    const blocks = css.match(/[^{}]+\{[^{}]*\}/g) ?? [];
    const offenders = blocks.filter((b) => {
      const [selector, body = ''] = b.split(/\{([\s\S]*)/);
      return /\.crt-glow(-amber)?\b/.test(selector) && /display\s*:\s*none/.test(body);
    });
    expect(offenders).toEqual([]);
  });

  it('.crt-off ruší "glow" přes text-shadow (ne přes display)', () => {
    const idx = css.indexOf('.crt-off *');
    expect(idx).toBeGreaterThan(-1);
    const block = css.slice(idx, css.indexOf('}', idx) + 1);
    expect(block).toMatch(/text-shadow\s*:\s*none\s*!important/);
    expect(block).not.toMatch(/display\s*:\s*none/);
  });

  it('prefers-reduced-motion se chová stejně jako .crt-off (ruší i glow, ne jen animace)', () => {
    const mediaIdx = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(mediaIdx).toBeGreaterThan(-1);
    const mediaBlock = css.slice(mediaIdx);
    expect(mediaBlock).toMatch(/\*\s*\{[^}]*text-shadow\s*:\s*none\s*!important/);
    expect(mediaBlock).toMatch(/\*\s*\{[^}]*animation\s*:\s*none\s*!important/);
  });

  it('App.svelte importuje styly relativní cestou ./styles/*, ne ../src/styles/*', () => {
    expect(appSrc).not.toMatch(/\.\.\/src\/styles/);
    expect(appSrc).toMatch(/['"]\.\/styles\/tokens\.css['"]/);
    expect(appSrc).toMatch(/['"]\.\/styles\/crt\.css['"]/);
  });
});
