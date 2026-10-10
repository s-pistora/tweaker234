// „Výhled oborů“: hrubý odhad, které obory budou za rok poloprázdné a kde bude míst málo.
//
// Odhad = loňští přijatí (k 30. 9. 2025) × index vývoje počtu dětí 0–14 let v ORP školy
// (lineární trend 2020–2025 z ČSÚ), porovnaný s plánem míst na 2026/27. Data o přijímání
// jsou jen za jeden rok, proto to není předpověď – jen upozornění, kam se podívat.

import type { AreaCode, IndicatorFile, Obor } from './types.ts';
import { nazevSkupiny } from './skoly.ts';

/** Počet dětí 0–14 let v obci v roce (obyvatelé × podíl 0–14); null když chybí údaj. */
export function deti(file: IndicatorFile | undefined, kod: AreaCode, rok: number): number | null {
  const o = file?.values.obyvatele?.[kod]?.[rok];
  const p = file?.values.podil_0_14?.[kod]?.[rok];
  if (typeof o !== 'number' || typeof p !== 'number' || !Number.isFinite(o) || !Number.isFinite(p)) return null;
  return (o * p) / 100;
}

/** Součet dětí podle ORP a roku (jen roky, kde mají údaj všechny obce ORP). */
export function detiPodleOrp(
  file: IndicatorFile | undefined,
  obecOrp: Record<AreaCode, AreaCode>,
): Record<AreaCode, Record<number, number>> {
  const roky = new Set<number>();
  for (const byYear of Object.values(file?.values.podil_0_14 ?? {})) for (const r of Object.keys(byYear)) roky.add(Number(r));
  const out: Record<AreaCode, Record<number, number>> = {};
  const chybi = new Set<string>();
  for (const [kod, orp] of Object.entries(obecOrp)) {
    if (!orp) continue;
    out[orp] ??= {};
    for (const rok of roky) {
      const d = deti(file, kod, rok);
      if (d === null) chybi.add(`${orp}:${rok}`);
      else out[orp][rok] = (out[orp][rok] ?? 0) + d;
    }
  }
  for (const k of chybi) {
    const [orp, rok] = k.split(':');
    delete out[orp]?.[Number(rok)];
  }
  return out;
}

/**
 * Roční relativní změna z lineárního trendu řady (sklon / průměr), např. -0,02 = −2 % ročně.
 * Méně než 3 roky → null.
 */
export function rocniZmena(rada: Record<number, number>): number | null {
  const body = Object.entries(rada).map(([r, v]) => [Number(r), v] as const);
  if (body.length < 3) return null;
  const n = body.length;
  const mx = body.reduce((a, b) => a + b[0], 0) / n;
  const my = body.reduce((a, b) => a + b[1], 0) / n;
  if (my <= 0) return null;
  let num = 0;
  let den = 0;
  for (const [x, y] of body) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den > 0 ? num / den / my : null;
}

/** Index poptávky po roce: 1 + roční změna počtu dětí v ORP (bez údaje 1). */
export function indexyOrp(detiOrp: Record<AreaCode, Record<number, number>>): Record<AreaCode, number> {
  const out: Record<AreaCode, number> = {};
  for (const [orp, rada] of Object.entries(detiOrp)) out[orp] = 1 + (rocniZmena(rada) ?? 0);
  return out;
}

export type TridaVyhledu = 'poloprazdny' | 'ok' | 'pretlak';

export const TRIDA_VYHLEDU: Record<TridaVyhledu, string> = {
  poloprazdny: 'hrozí poloprázdný obor',
  ok: 'nabídka odpovídá zájmu',
  pretlak: 'hrozí nedostatek míst',
};

export interface OdhadOboru {
  obor: Obor;
  /** odhad zájmu 2026/27 (žáků) */
  odhad: number;
  mist: number;
  /** odhad / místa */
  pomer: number;
  trida: TridaVyhledu;
  index: number;
}

export function tridaVyhledu(pomer: number): TridaVyhledu {
  if (pomer < 0.7) return 'poloprazdny';
  if (pomer > 1) return 'pretlak';
  return 'ok';
}

/** Odhad pro obory otevírané v 2026/27 s loňským údajem o přijatých. */
export function vyhledOboru(obory: Obor[], indexy: Record<AreaCode, number>): OdhadOboru[] {
  const out: OdhadOboru[] = [];
  for (const o of obory) {
    const mist = o.zamer[2026] ?? 0;
    if (mist <= 0 || o.prijato2025 === null) continue;
    const index = indexy[o.orp] ?? 1;
    const odhad = o.prijato2025 * index;
    const pomer = odhad / mist;
    out.push({ obor: o, odhad, mist, pomer, trida: tridaVyhledu(pomer), index });
  }
  return out;
}

export interface SouhrnVyhledu {
  klic: string;
  nazev: string;
  mist: number;
  odhad: number;
  pomer: number;
  trida: TridaVyhledu;
  oboru: number;
}

/** Součty podle skupiny oborů nebo ORP, seřazené od nejhoršího nesouladu (|pomer − 1|). */
export function souhrnVyhledu(v: OdhadOboru[], podle: 'skupina' | 'orp', names: Record<AreaCode, string> = {}): SouhrnVyhledu[] {
  const m = new Map<string, SouhrnVyhledu>();
  for (const x of v) {
    const klic = podle === 'skupina' ? x.obor.skupina : x.obor.orp;
    const g = m.get(klic) ?? {
      klic,
      nazev: podle === 'skupina' ? nazevSkupiny(klic) : (names[klic] ?? klic),
      mist: 0,
      odhad: 0,
      pomer: 0,
      trida: 'ok' as TridaVyhledu,
      oboru: 0,
    };
    g.mist += x.mist;
    g.odhad += x.odhad;
    g.oboru++;
    m.set(klic, g);
  }
  const out = [...m.values()].map((g) => {
    const pomer = g.mist > 0 ? g.odhad / g.mist : 0;
    return { ...g, pomer, trida: tridaVyhledu(pomer) };
  });
  return out.sort((a, b) => Math.abs(b.pomer - 1) - Math.abs(a.pomer - 1));
}

/** Nejrizikovější obory dané třídy (poloprázdné od nejnižšího poměru, přetlak od nejvyššího). */
export function rizikoveObory(v: OdhadOboru[], trida: 'poloprazdny' | 'pretlak', n = 10, minMist = 10): OdhadOboru[] {
  return v
    .filter((x) => x.trida === trida && x.mist >= minMist)
    .sort((a, b) => (trida === 'poloprazdny' ? a.pomer - b.pomer : b.pomer - a.pomer))
    .slice(0, n);
}
