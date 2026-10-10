// Hlavní menu: pět skupin podle toho, co člověk řeší (ne podle datových sad).
// Stejná struktura se použije v liště (rozbalovací panely), v mobilním menu
// i na dlaždicích úvodní stránky.
import type { Mode } from './state.ts';
import type { AreaCode, KategorieId } from './types.ts';

export interface MenuPolozka {
  /** režim, který položka otevře; bez režimu = akce (Zdroje dat) */
  mode?: Mode;
  akce?: 'zdroje';
  label: string;
  /** jedna krátká věta pod názvem */
  popis: string;
}

/**
 * Kam přejít: režim a volitelně obec (předá se parametrem dané části – d=, vd=, zo=, uo=),
 * kategorie a místo „Kam vyrazit“.
 */
export interface Cil {
  mode: Mode;
  obec?: AreaCode | null;
  kat?: KategorieId | null;
  misto?: string | null;
}

export type SkupinaId = 'vzdelani' | 'bydleni' | 'volny-cas' | 'prace' | 'data';

export interface MenuSkupina {
  id: SkupinaId;
  label: string;
  /** jedna věta na dlaždici úvodní stránky */
  veta: string;
  /** SVG path lineární ikony 24×24 */
  ikona: string;
  polozky: MenuPolozka[];
  /** skupina má zkratky do kategorií „Kam vyrazit“ */
  kategorie?: boolean;
}

export const MENU: readonly MenuSkupina[] = [
  {
    id: 'vzdelani',
    label: 'Vzdělání',
    veta: 'Vyberte střední školu podle vzdálenosti a volných míst.',
    ikona: 'M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6',
    polozky: [{ mode: 'skoly', label: 'Kam na střední', popis: 'Obory v okolí, volná místa a loňská obsazenost.' }],
  },
  {
    id: 'bydleni',
    label: 'Bydlení',
    veta: 'Profil vaší obce, srovnání obcí a kam na úřad.',
    ikona: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
    polozky: [
      { mode: 'obec', label: 'Profil obce', popis: 'Vše o jedné obci: čísla, školy, úřady a výlety v okolí.' },
      { mode: 'score', label: 'Kde by se mi žilo', popis: 'Obce seřazené podle toho, na čem vám záleží.' },
      { mode: 'urady', label: 'Úřady', popis: 'Obecní, stavební a živnostenský úřad i matrika.' },
      { mode: 'karta', label: 'Karta obce k tisku', popis: 'Jedna stránka A4 s čísly o obci pro starostu i zastupitele.' },
    ],
  },
  {
    id: 'volny-cas',
    label: 'Volný čas',
    veta: 'Najděte výlet, koupání, sport nebo kulturu ve svém okolí.',
    ikona: 'M3 20h18M4 20l6-10 4 6M12 13l3-4 5 11M16 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    polozky: [{ mode: 'vylety', label: 'Kam vyrazit', popis: 'Přes 800 míst z dat kraje ve 14 kategoriích.' }],
    kategorie: true,
  },
  {
    id: 'prace',
    label: 'Práce a firmy',
    veta: 'Podpora pro podnikání a kam kraj posílá peníze.',
    ikona: 'M3 8h18v12H3zM8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 13h18',
    polozky: [
      { mode: 'podnikani', label: 'Podnikání', popis: 'Kreativci, inkubátory, coworkingy a průmyslové zóny.' },
      { mode: 'penize', label: 'Peníze kraje', popis: 'Projekty, vouchery a strategie kraje.' },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    veta: 'Čísla o obcích, chyby v datech a odkud data máme.',
    ikona: 'M4 20V11M10 20V5M16 20v-7M21 20H3',
    polozky: [
      { mode: 'explore', label: 'Statistika kraje', popis: 'Čísla o ORP a obcích a jejich vývoj v čase.' },
      { mode: 'prokraj', label: 'Pro kraj', popis: 'Kde lidem chybí služby a výhled obsazenosti oborů.' },
      { mode: 'nalezy', label: 'Co jsme našli v datech', popis: 'Chyby a mezery v datech kraje i co je nového.' },
      { akce: 'zdroje', label: 'Zdroje dat', popis: 'Odkud data pocházejí a jak jsou čerstvá.' },
    ],
  },
];

/** Skupina, do které režim patří (pro zvýraznění v liště); 'domu' do žádné. */
export function skupinaRezimu(m: Mode): SkupinaId | null {
  return MENU.find((s) => s.polozky.some((p) => p.mode === m))?.id ?? null;
}

/** Oblíbené kategorie „Kam vyrazit“ na dlaždici úvodní stránky. */
export const OBLIBENE_KATEGORIE: readonly KategorieId[] = [
  'koupani',
  'hrady-zamky',
  'rozhledny',
  'sjezdovky',
  'rodiny',
  'priroda',
];
