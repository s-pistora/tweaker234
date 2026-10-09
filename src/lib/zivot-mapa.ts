/*
 * „Kde by se mi dobře žilo?“ – mapa přiblížené obce: vrstvy bodů vybraných požadavků
 * (každá jiná barva i tvar), body ve výřezu, nejbližší služba mimo obec a odkaz na Mapy.cz.
 * Čisté funkce nad ZivotKontext (testy nad public/data).
 */
import type { AreaCode } from './types.ts';
import type { AreaFeature } from './map/project.ts';
import type { Glyph } from './map/pointStyle.ts';
import { vzdalenostKm } from './skoly.ts';
import { POZADAVKY_BY_ID, bodyPozadavku, type BodZivota, type ZivotKontext } from './zivot.ts';

/** Barvy vrstev (datová paleta brandbooku bez světle modré, která na mapě zaniká). */
const BARVY = ['var(--data-1)', 'var(--data-2)', 'var(--data-3)', 'var(--data-4)', 'var(--data-6)', 'var(--brand-mid)'];
const TVARY: Glyph[] = ['dot', 'block', 'triangle', 'gem', '+', 'x'];

export interface Vrstva {
  id: string;
  label: string;
  barva: string;
  glyph: Glyph;
}

/** Požadavek má body na mapě (nejbližší / počet bodů), ne jen ukazatel obce. */
export function maBody(id: string): boolean {
  const d = POZADAVKY_BY_ID[id]?.metrika.druh;
  return d === 'nejblizsi' || d === 'pocet';
}

/**
 * Vrstvy pro vybrané požadavky (v pořadí výběru). Barva i tvar se liší u každé vrstvy;
 * po vyčerpání šesti barev se tvar posune, takže dvojice barva + tvar se neopakuje.
 */
export function vrstvyPozadavku(ids: readonly string[]): Vrstva[] {
  return ids.filter(maBody).map((id, i) => ({
    id,
    label: POZADAVKY_BY_ID[id].label,
    barva: BARVY[i % BARVY.length],
    glyph: TVARY[(i + Math.floor(i / BARVY.length)) % TVARY.length],
  }));
}

/** Body požadavku, které leží v obci (podle kódu obce v datech). */
export function bodyVObci(ctx: ZivotKontext, id: string, code: AreaCode): BodZivota[] {
  return bodyPozadavku(ctx, id).filter((b) => b.obec === code);
}

export interface NejblizsiBod {
  bod: BodZivota;
  /** km vzdušnou čarou od středu obce */
  km: number;
}

/** Nejbližší bod požadavku ke středu obce; null = požadavek nemá body nebo obec neznáme. */
export function nejblizsiBod(ctx: ZivotKontext, id: string, code: AreaCode): NejblizsiBod | null {
  const c = ctx.obce[code];
  if (!c) return null;
  let best: NejblizsiBod | null = null;
  for (const b of bodyPozadavku(ctx, id)) {
    const km = vzdalenostKm(c.lat, c.lon, b.lat, b.lon);
    if (!best || km < best.km) best = { bod: b, km };
  }
  return best;
}

export interface ChybiVObci {
  id: string;
  label: string;
  /** nejbližší místo jinde; null = v kraji žádné */
  nejblizsi: (NejblizsiBod & { obec: AreaCode | null; obecNazev: string }) | null;
}

/** Vybrané požadavky s body, které v obci nemají ani jeden bod – a kde je nejbližší. */
export function chybejiciVObci(ctx: ZivotKontext, ids: readonly string[], code: AreaCode): ChybiVObci[] {
  return ids
    .filter((id) => maBody(id) && bodyVObci(ctx, id, code).length === 0)
    .map((id) => {
      const n = nejblizsiBod(ctx, id, code);
      return {
        id,
        label: POZADAVKY_BY_ID[id].label,
        nejblizsi: n
          ? { ...n, obec: n.bod.obec, obecNazev: (n.bod.obec && ctx.names[n.bod.obec]) || n.bod.obecNazev }
          : null,
      };
    });
}

/** [[lonMin, latMin], [lonMax, latMax]] */
export type Vyrez = [[number, number], [number, number]];

/** Výřez obce s rezervou (podíl šířky/výšky na každou stranu) – přiblížená mapa ukazuje i okolí. */
export function vyrezObce(feature: AreaFeature, rezerva = 0.35): Vyrez {
  // přímo ze souřadnic: geoBounds z d3 vrací při opačném pořadí vrcholů celý glóbus
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const projdi = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as [number, number];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    } else if (Array.isArray(c)) c.forEach(projdi);
  };
  const g = feature.geometry as { coordinates?: unknown } | null;
  projdi(g?.coordinates);
  const dx = (x1 - x0) * rezerva;
  const dy = (y1 - y0) * rezerva;
  return [
    [x0 - dx, y0 - dy],
    [x1 + dx, y1 + dy],
  ];
}

export function veVyrezu(b: { lat: number; lon: number }, v: Vyrez): boolean {
  return b.lon >= v[0][0] && b.lon <= v[1][0] && b.lat >= v[0][1] && b.lat <= v[1][1];
}

/**
 * Body vrstvy pro přiblíženou obec: jen ty ve výřezu (zastávek je přes 1800)
 * a vždy i nejbližší bod, i když leží mimo výřez.
 */
export function bodyProMapu(ctx: ZivotKontext, id: string, code: AreaCode, v: Vyrez): BodZivota[] {
  const out = bodyPozadavku(ctx, id).filter((b) => veVyrezu(b, v));
  const n = nejblizsiBod(ctx, id, code);
  if (n && !out.some((b) => b.id === n.bod.id)) out.push(n.bod);
  return out;
}

/** Odkaz na místo v Mapy.cz. */
export function mapyCzOdkaz(b: { nazev: string; lat: number; lon: number }): string {
  const q = encodeURIComponent(b.nazev);
  return `https://mapy.cz/zakladni?q=${q}&x=${b.lon}&y=${b.lat}&z=17`;
}
