// Automatické kontroly kvality dat nad načteným snapshotem – doplňují ruční nálezy (lib/nalezy.ts)
// o konkrétní záznamy, které nesedí: polohy mimo obec, duplicity, nečekaná čísla, chybějící údaje.

import type { Obor, PointLayer } from './types.ts';
import type { Nalez } from './nalezy.ts';
import type { ObecLocator } from './map/locate.ts';

const SADA_SKOLY = 'Záměr počtu přijímaných uchazečů SŠ';
/** kolik příkladů vypsat do textu nálezu */
const PRIKLADU = 3;

const pl = (n: number, f: [string, string, string]) => (n === 1 ? f[0] : n >= 2 && n <= 4 ? f[1] : f[2]);
const kratce = (s: string) => s.replace(/,?\s*příspěvková organizace$/i, '');
function priklady(xs: string[]): string {
  const u = [...new Set(xs)];
  const zbyva = u.length - PRIKLADU;
  return u.slice(0, PRIKLADU).join('; ') + (zbyva > 0 ? ` a ${zbyva} ${pl(zbyva, ['další', 'další', 'dalších'])}` : '');
}

/** Odchylka ~250 m ve stupních – hranice obcí v geodatech jsou zjednodušené. */
const TOLERANCE = [0, 0.0035, -0.0035];

/**
 * Leží bod v obci `obec`, nebo aspoň do ~250 m od ní? Body těsně u hranice (zastávka
 * na kraji obce) by se jinak kvůli zjednodušeným hranicím hlásily jako chyba.
 * Vrací obec, kde bod opravdu leží, nebo null = v pořádku / mimo kraj.
 */
function jinaObec(locate: ObecLocator, lon: number, lat: number, obec: string): { obec: string } | 'mimo' | null {
  const stred = locate(lon, lat);
  if (stred?.obec === obec) return null;
  for (const dx of TOLERANCE) for (const dy of TOLERANCE) if (locate(lon + dx * 1.5, lat + dy)?.obec === obec) return null;
  return stred ? { obec: stred.obec } : 'mimo';
}

/** Škola, jejíž souřadnice leží v jiné obci, než uvádí kód obce (nebo mimo kraj). */
export function oboryMimoObec(obory: Obor[], locate: ObecLocator, names: Record<string, string>): Nalez | null {
  const skoly = new Map<string, Obor>();
  for (const o of obory) if (!skoly.has(o.izo)) skoly.set(o.izo, o);
  const spatne: string[] = [];
  for (const o of skoly.values()) {
    const loc = jinaObec(locate, o.lon, o.lat, o.kodObce);
    if (loc === 'mimo') spatne.push(`${kratce(o.skola)} (souřadnice mimo kraj)`);
    else if (loc) spatne.push(`${kratce(o.skola)} – uvedena obec ${o.obec}, poloha v obci ${names[loc.obec] ?? loc.obec}`);
  }
  if (!spatne.length) return null;
  return {
    sada: SADA_SKOLY,
    co: `U ${spatne.length} ${pl(spatne.length, ['školy', 'škol', 'škol'])} neleží souřadnice v obci, kterou uvádí kód obce: ${priklady(spatne)}.`,
    reseni: 'Vzdálenosti počítáme ze souřadnic; obec v textu necháváme podle datové sady.',
    zavaznost: 'nesoulad',
  };
}

/** Stejná škola, obor a forma vícekrát v jednom ročníku. */
export function duplicitniObory(obory: Obor[]): Nalez | null {
  const n = new Map<string, Obor[]>();
  for (const o of obory) {
    const k = `${o.izo}|${o.kodOboru}|${o.forma}|${o.delka}`;
    n.set(k, [...(n.get(k) ?? []), o]);
  }
  const dup = [...n.values()].filter((g) => g.length > 1);
  if (!dup.length) return null;
  return {
    sada: SADA_SKOLY,
    co: `${dup.length} ${pl(dup.length, ['obor je', 'obory jsou', 'oborů je'])} u stejné školy ve stejné formě a délce uveden vícekrát: ${priklady(dup.map((g) => `${g[0].nazevOboru} (${kratce(g[0].skola)})`))}.`,
    reseni: 'Záznamy zobrazujeme odděleně, jak jsou v datech.',
    zavaznost: 'chyba',
  };
}

/** Přijatých výrazně víc, než byl záměr – buď chyba v čísle, nebo škola záměr překročila. */
export function prijatoNadZamer(obory: Obor[], nasobek = 2): Nalez | null {
  const x = obory.filter((o) => {
    const z = o.zamer[2025];
    return o.prijato2025 !== null && z !== null && z !== undefined && z > 0 && o.prijato2025 > nasobek * z;
  });
  if (!x.length) return null;
  return {
    sada: SADA_SKOLY,
    co: `U ${x.length} ${pl(x.length, ['oboru', 'oborů', 'oborů'])} je přijatých víc než ${nasobek}× záměr: ${priklady(x.map((o) => `${o.nazevOboru}, ${kratce(o.skola)} – ${o.prijato2025} přijatých na ${o.zamer[2025]} míst`))}.`,
    reseni: 'Obsazenost zobrazujeme s upozorněním „velký zájem“; číslo neměníme.',
    zavaznost: 'nesoulad',
  };
}

/** Obory, které mají loni přijaté žáky, ale záměr na loňský rok chybí (nelze spočítat obsazenost). */
export function prijatoBezZameru(obory: Obor[]): Nalez | null {
  const x = obory.filter((o) => (o.prijato2025 ?? 0) > 0 && !((o.zamer[2025] ?? 0) > 0));
  if (!x.length) return null;
  return {
    sada: SADA_SKOLY,
    co: `${x.length} ${pl(x.length, ['obor má', 'obory mají', 'oborů má'])} přijaté žáky k 30. 9. 2025, ale chybí záměr pro 2025/26: ${priklady(x.map((o) => `${o.nazevOboru} (${kratce(o.skola)})`))}.`,
    reseni: 'Obsazenost u nich ukazujeme jako „nelze spočítat“.',
    zavaznost: 'chybi',
  };
}

/** Školy bez webu. */
export function skolyBezWebu(obory: Obor[]): Nalez | null {
  const bez = [...new Map(obory.filter((o) => !o.web.trim()).map((o) => [o.izo, o])).values()];
  if (!bez.length) return null;
  return {
    sada: SADA_SKOLY,
    co: `${bez.length} ${pl(bez.length, ['škola nemá', 'školy nemají', 'škol nemá'])} vyplněný web: ${priklady(bez.map((o) => kratce(o.skola)))}.`,
    reseni: 'Odkaz na web u nich nezobrazujeme.',
    zavaznost: 'chybi',
  };
}

/** Body bodové vrstvy, jejichž poloha leží v jiné obci, než uvádí vrstva. */
export function bodyMimoObec(layer: PointLayer, locate: ObecLocator, names: Record<string, string>): Nalez | null {
  const spatne: string[] = [];
  for (const f of layer.features) {
    if (!f.obec) continue;
    const loc = jinaObec(locate, f.lon, f.lat, f.obec);
    if (loc && loc !== 'mimo') spatne.push(`${f.name} (uvedeno ${names[f.obec] ?? f.obec}, poloha ${names[loc.obec] ?? loc.obec})`);
  }
  if (!spatne.length) return null;
  return {
    sada: layer.label,
    co: `${spatne.length} z ${layer.features.length} ${pl(layer.features.length, ['záznamu', 'záznamů', 'záznamů'])} má souřadnice v jiné obci, než uvádí kód obce: ${priklady(spatne)}.`,
    reseni: 'Pro mapu a vzdálenosti používáme souřadnice. Body do ~250 m od hranice obce nehlásíme (hranice jsou zjednodušené).',
    zavaznost: 'nesoulad',
  };
}

export interface VstupKontrol {
  obory: Obor[];
  vrstvy: PointLayer[];
  locate: ObecLocator | null;
  names: Record<string, string>;
}

/** Všechny automatické kontroly; vrací jen nálezy, které něco našly. */
export function automatickeKontroly({ obory, vrstvy, locate, names }: VstupKontrol): Nalez[] {
  const out: (Nalez | null)[] = [duplicitniObory(obory), prijatoNadZamer(obory), prijatoBezZameru(obory), skolyBezWebu(obory)];
  if (locate) {
    out.push(oboryMimoObec(obory, locate, names));
    for (const v of vrstvy) out.push(bodyMimoObec(v, locate, names));
  }
  return out.filter((n): n is Nalez => n !== null);
}
