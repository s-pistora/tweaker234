// Stav aplikace synchronizovany s `location.hash`.
//
// Format URL: #/{uroven}/{kod}?u=<ukazatel>&r=<rok>&m=<rezim>&w=<id:vaha,...>
// `#/` nebo prazdny hash = vychozi stav. Kazda nevalidni cast hashe spadne
// zvlast na svou vychozi hodnotu a cely vysledny stav zustava validni
// (parseHash/toHash nikdy nevyhodi vyjimku) - navic se vrati `invalid:true`.

import { writable } from 'svelte/store';
import { LEVELS, type Level, type AreaCode } from './types.ts';
import type { Snapshot } from './data/loader.ts';

export interface AppState {
  level: Level;
  area: AreaCode | null;
  indicator: string;
  year: number;
  mode: 'explore' | 'score';
  weights: Record<string, number>;
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

function defaultIndicatorFor(snap: Snapshot, level: Level): string {
  const file = snap.indicators[level];
  return file ? (Object.keys(file.indicators)[0] ?? '') : '';
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

/** Parsuje `w=id:vaha,id:vaha,...`. Vraci null, pokud format neodpovida (aspon jeden par je poskozeny). */
function parseWeights(raw: string): Record<string, number> | null {
  const result: Record<string, number> = {};
  for (const pair of raw.split(',')) {
    const m = /^([\w-]+):(-?\d+(?:\.\d+)?)$/.exec(pair.trim());
    if (!m) return null;
    const [, id, wRaw] = m;
    const w = Number(wRaw);
    if (!Number.isFinite(w)) return null;
    result[id] = w;
  }
  return result;
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
    if (mParam === 'explore' || mParam === 'score') {
      mode = mParam;
    } else {
      invalid = true;
    }
  }

  let weights: Record<string, number> = {};
  const wParam = params.get('w');
  if (wParam !== null && wParam !== '') {
    const parsed = parseWeights(wParam);
    if (parsed) {
      weights = parsed;
    } else {
      invalid = true;
    }
  }

  return { state: { level, area, indicator, year, mode, weights }, invalid };
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
 * Napoji `appState` na `location.hash`: naparsuje aktualni hash, drzi store a hash v sync
 * (zmeny store -> `history.replaceState`, zmeny hashe zvenku -> `hashchange` -> store).
 * Vraci cistici funkci (odregistruje listenery).
 */
export function initHashSync(snap: Snapshot): () => void {
  const applyFromHash = () => {
    const { state } = parseHash(location.hash, snap);
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
