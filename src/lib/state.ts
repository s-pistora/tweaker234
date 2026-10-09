// Stav aplikace synchronizovany s `location.hash`.
//
// Format URL: #/{uroven}/{kod}?u=<ukazatel>&r=<rok>&m=<rezim>&w=<id:vaha,...>
//             [&d=<obec domova>&t=<typ>&g=<skupina>&km=<max>&s=<izo skoly>&o=<razeni>]  (rezim skoly)
// `#/` nebo prazdny hash = vychozi stav. Kazda nevalidni cast hashe spadne
// zvlast na svou vychozi hodnotu a cely vysledny stav zustava validni
// (parseHash/toHash nikdy nevyhodi vyjimku) - navic se vrati `invalid:true`.

import { writable } from 'svelte/store';
import { LEVELS, type Level, type AreaCode, type TypStudia } from './types.ts';
import type { Snapshot } from './data/loader.ts';

export type Mode = 'explore' | 'score' | 'skoly';
export const MODES: readonly Mode[] = ['explore', 'score', 'skoly'];

/** Filtry režimu „Kam na střední“. */
export interface SkolyState {
  /** kód obce, kde uživatel bydlí */
  domov: AreaCode | null;
  typ: TypStudia | 'vse';
  /** '' = všechny skupiny oborů */
  skupina: string;
  maxKm: number;
  /** IZO vybrané školy */
  skola: string | null;
  razeni: 'vzdalenost' | 'volno';
}

export const DEFAULT_SKOLY: SkolyState = {
  domov: null,
  typ: 'vse',
  skupina: '',
  maxKm: 25,
  skola: null,
  razeni: 'vzdalenost',
};

export const KM_MIN = 5;
export const KM_MAX = 80;

export interface AppState {
  level: Level;
  area: AreaCode | null;
  indicator: string;
  year: number;
  mode: Mode;
  weights: Record<string, number>;
  /** jen když se režim „Kam na střední“ použil (jinak hash ostatních režimů zůstává beze změny) */
  skoly?: SkolyState;
}

/** Roky (jako cisla), pro ktere existuje alespon jedna nenulova hodnota daneho ukazatele. */
function yearsWithData(snap: Snapshot, level: Level, indicator: string): number[] {
  const file = snap.indicators[level];
  const byArea = file?.values[indicator];
  if (!byArea) return [];
  const years = new Set<number>();
  for (const byYear of Object.values(byArea)) {
    for (const [y, v] of Object.entries(byYear)) {
      if (v !== null) years.add(Number(y));
    }
  }
  return [...years].sort((a, b) => a - b);
}

/** Preferované výchozí ukazatele (v pořadí priority) – použije se první, který na dané úrovni existuje. */
const PREFERRED_DEFAULT_INDICATORS = ['nezamestnanost'];

function defaultIndicatorFor(snap: Snapshot, level: Level): string {
  const file = snap.indicators[level];
  if (!file) return '';
  for (const id of PREFERRED_DEFAULT_INDICATORS) {
    if (id in file.indicators) return id;
  }
  return Object.keys(file.indicators)[0] ?? '';
}

function defaultYearFor(snap: Snapshot, level: Level, indicator: string): number {
  const years = indicator ? yearsWithData(snap, level, indicator) : [];
  return years.length ? years[years.length - 1] : new Date().getFullYear();
}

function defaultState(snap: Snapshot, level: Level = 'kraj'): AppState {
  const indicator = defaultIndicatorFor(snap, level);
  return {
    level,
    area: null,
    indicator,
    year: defaultYearFor(snap, level, indicator),
    mode: 'explore',
    weights: {},
  };
}

function areasAvailable(snap: Snapshot, level: Level): Set<string> {
  const file = snap.indicators[level];
  const set = new Set<string>();
  if (!file) return set;
  for (const byArea of Object.values(file.values)) {
    for (const code of Object.keys(byArea)) set.add(code);
  }
  return set;
}

/**
 * Parsuje `w=id:vaha,id:vaha,...`. Vaha musi byt cele cislo 0-5 (jinak se jen zahodi tenhle
 * jeden par a `invalid` se nastavi na true, aby ostatni platne vahy zustaly pouzitelne).
 */
function parseWeights(raw: string): { weights: Record<string, number>; invalid: boolean } {
  const result: Record<string, number> = {};
  let invalid = false;
  for (const pair of raw.split(',')) {
    const m = /^([\w-]+):(-?\d+(?:\.\d+)?)$/.exec(pair.trim());
    if (!m) {
      invalid = true;
      continue;
    }
    const [, id, wRaw] = m;
    const w = Number(wRaw);
    if (!Number.isInteger(w) || w < 0 || w > 5) {
      invalid = true;
      continue;
    }
    result[id] = w;
  }
  return { weights: result, invalid };
}

export function parseHash(hash: string, snap: Snapshot): { state: AppState; invalid: boolean } {
  const clean = hash.startsWith('#') ? hash.slice(1) : hash;
  if (clean === '' || clean === '/') {
    return { state: defaultState(snap, 'kraj'), invalid: false };
  }

  const m = /^\/([^/?]+)(?:\/([^?]+))?(?:\?(.*))?$/.exec(clean);
  if (!m) {
    return { state: defaultState(snap, 'kraj'), invalid: true };
  }
  const [, levelRaw, areaRaw, query] = m;

  let invalid = false;

  let level: Level = 'kraj';
  if ((LEVELS as readonly string[]).includes(levelRaw)) {
    level = levelRaw as Level;
  } else {
    invalid = true;
  }

  const available = areasAvailable(snap, level);
  let area: AreaCode | null = null;
  if (areaRaw !== undefined) {
    const decoded = decodeURIComponent(areaRaw);
    if (available.has(decoded)) {
      area = decoded;
    } else {
      invalid = true;
    }
  }

  const params = new URLSearchParams(query ?? '');

  const defaultIndicator = defaultIndicatorFor(snap, level);
  let indicator = defaultIndicator;
  const uParam = params.get('u');
  if (uParam !== null) {
    const file = snap.indicators[level];
    if (file && uParam in file.indicators) {
      indicator = uParam;
    } else {
      invalid = true;
    }
  }

  const availableYears = indicator ? yearsWithData(snap, level, indicator) : [];
  const defaultYear = defaultYearFor(snap, level, indicator);
  let year = defaultYear;
  const rParam = params.get('r');
  if (rParam !== null) {
    const y = Number(rParam);
    if (Number.isInteger(y) && availableYears.includes(y)) {
      year = y;
    } else {
      invalid = true;
    }
  }

  let mode: AppState['mode'] = 'explore';
  const mParam = params.get('m');
  if (mParam !== null) {
    if ((MODES as readonly string[]).includes(mParam)) {
      mode = mParam as Mode;
    } else {
      invalid = true;
    }
  }

  let weights: Record<string, number> = {};
  const wParam = params.get('w');
  if (wParam !== null && wParam !== '') {
    const { weights: parsed, invalid: wInvalid } = parseWeights(wParam);
    weights = parsed;
    if (wInvalid) invalid = true;
  }

  const state: AppState = { level, area, indicator, year, mode, weights };
  const sk = parseSkoly(params, snap);
  if (sk.used || mode === 'skoly') state.skoly = sk.state;
  if (sk.invalid) invalid = true;
  return { state, invalid };
}

/** Parametry režimu „Kam na střední“; každá nevalidní hodnota spadne na výchozí. */
function parseSkoly(params: URLSearchParams, snap: Snapshot): { state: SkolyState; used: boolean; invalid: boolean } {
  const st: SkolyState = { ...DEFAULT_SKOLY };
  let used = false;
  let invalid = false;
  const obory = snap.skoly?.obory ?? [];

  const d = params.get('d');
  if (d !== null) {
    used = true;
    if (areasAvailable(snap, 'obec').has(d) || obory.some((o) => o.kodObce === d)) st.domov = d;
    else invalid = true;
  }
  const t = params.get('t');
  if (t !== null) {
    used = true;
    if (t === 'vse' || t === 'maturita' || t === 'vyucni' || t === 'jine') st.typ = t;
    else invalid = true;
  }
  const g = params.get('g');
  if (g !== null) {
    used = true;
    if (g === '' || obory.some((o) => o.skupina === g)) st.skupina = g;
    else invalid = true;
  }
  const km = params.get('km');
  if (km !== null) {
    used = true;
    const n = Number(km);
    if (Number.isInteger(n) && n >= KM_MIN && n <= KM_MAX) st.maxKm = n;
    else invalid = true;
  }
  const sk = params.get('s');
  if (sk !== null) {
    used = true;
    if (obory.some((o) => o.izo === sk)) st.skola = sk;
    else invalid = true;
  }
  const o = params.get('o');
  if (o !== null) {
    used = true;
    if (o === 'vzdalenost' || o === 'volno') st.razeni = o;
    else invalid = true;
  }
  return { state: st, used, invalid };
}

export function toHash(state: AppState): string {
  const area = state.area ? `/${state.area}` : '';
  const parts: string[] = [];
  if (state.indicator) parts.push(`u=${state.indicator}`);
  if (Number.isFinite(state.year)) parts.push(`r=${state.year}`);
  parts.push(`m=${state.mode}`);
  const wEntries = Object.entries(state.weights);
  if (wEntries.length) {
    parts.push(`w=${wEntries.map(([id, w]) => `${id}:${w}`).join(',')}`);
  }
  if (state.skoly) {
    const k = state.skoly;
    if (k.domov) parts.push(`d=${k.domov}`);
    parts.push(`t=${k.typ}`);
    if (k.skupina) parts.push(`g=${k.skupina}`);
    parts.push(`km=${k.maxKm}`);
    if (k.skola) parts.push(`s=${k.skola}`);
    if (k.razeni !== DEFAULT_SKOLY.razeni) parts.push(`o=${k.razeni}`);
  }
  const query = parts.length ? `?${parts.join('&')}` : '';
  return `#/${state.level}${area}${query}`;
}

const PLACEHOLDER_STATE: AppState = {
  level: 'kraj',
  area: null,
  indicator: '',
  year: 0,
  mode: 'explore',
  weights: {},
};

/** Svelte store se stavem aplikace. Realna pocatecni hodnota se nastavi az v `initHashSync`. */
export const appState = writable<AppState>(PLACEHOLDER_STATE);

/**
 * true, kdyz posledni naparsovany hash (pri startu nebo pri `hashchange`) mel nejakou
 * nevalidni cast (viz `parseHash().invalid`) – App.svelte na to ukazuje varovnou hlasku.
 */
export const linkInvalid = writable<boolean>(false);

/**
 * Napoji `appState` na `location.hash`: naparsuje aktualni hash, drzi store a hash v sync
 * (zmeny store -> `history.replaceState`, zmeny hashe zvenku -> `hashchange` -> store).
 * Vraci cistici funkci (odregistruje listenery).
 */
export function initHashSync(snap: Snapshot): () => void {
  const applyFromHash = () => {
    const { state, invalid } = parseHash(location.hash, snap);
    linkInvalid.set(invalid);
    appState.set(state);
  };

  applyFromHash();

  const onHashChange = () => applyFromHash();
  window.addEventListener('hashchange', onHashChange);

  const unsubscribe = appState.subscribe((state) => {
    const hash = toHash(state);
    if (location.hash !== hash) {
      history.replaceState(null, '', hash);
    }
  });

  return () => {
    window.removeEventListener('hashchange', onHashChange);
    unsubscribe();
  };
}
