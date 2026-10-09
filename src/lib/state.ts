// Stav aplikace synchronizovany s `location.hash`.
//
// Format URL: #/{uroven}/{kod}?u=<ukazatel>&r=<rok>&m=<rezim>&w=<id:vaha,...>
//             [&d=<obec domova>&t=<typ>&g=<skupina>&km=<max>&s=<izo skoly>&o=<razeni>]  (rezim skoly)
//             [&zp=<id:1|2,...>&zo=<obec>&zu=<id pozadavku>]  (rezim score = „Kde by se mi dobře žilo?“)
// `#/` nebo prazdny hash = vychozi stav. Kazda nevalidni cast hashe spadne
// zvlast na svou vychozi hodnotu a cely vysledny stav zustava validni
// (parseHash/toHash nikdy nevyhodi vyjimku) - navic se vrati `invalid:true`.

import { writable } from 'svelte/store';
import { LEVELS, KATEGORIE_IDS, type Level, type AreaCode, type TypStudia, type KategorieId } from './types.ts';
import type { Snapshot } from './data/loader.ts';
import { DOPORUCENY_VYBER, POZADAVEK_IDS, type Dulezitost } from './zivot.ts';

export type Mode = 'explore' | 'score' | 'skoly' | 'vylety';
export const MODES: readonly Mode[] = ['explore', 'score', 'skoly', 'vylety'];

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

/** Filtry režimu „Kam vyrazit“. */
export interface VyletyState {
  /** null = rozcestník kategorií */
  kat: KategorieId | null;
  domov: AreaCode | null;
  maxKm: number;
  /** zvolené volby filtrů kategorie */
  tagy: string[];
  vstup: 'vse' | 'zdarma' | 'placene';
  /** id vybraného místa (detail) */
  misto: string | null;
  q: string;
  razeni: 'vzdalenost' | 'nazev';
}

export const DEFAULT_VYLETY: VyletyState = {
  kat: null,
  domov: null,
  maxKm: 30,
  tagy: [],
  vstup: 'vse',
  misto: null,
  q: '',
  razeni: 'vzdalenost',
};

/** Režim „Kde by se mi dobře žilo?“ – vlastní stav, nezávislý na drill-downu Statistiky. */
export interface ZivotState {
  /** zvolené požadavky (id z `POZADAVKY`) s důležitostí 1 = důležité, 2 = velmi důležité */
  pozadavky: Record<string, Dulezitost>;
  /** obec otevřená v detailu */
  obec: AreaCode | null;
  /** požadavek, jehož body se ukazují na mapě */
  ukaz: string | null;
}

/** Výchozí stav: doporučený výběr (zastávka, lékař, ZŠ, nezaměstnanost), ať mapa není prázdná. */
export const DEFAULT_ZIVOT: ZivotState = {
  pozadavky: { ...DOPORUCENY_VYBER },
  obec: null,
  ukaz: null,
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
  /** jen když se režim „Kam vyrazit“ použil */
  vylety?: VyletyState;
  /** jen když se režim „Kde by se mi dobře žilo?“ použil */
  zivot?: ZivotState;
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
  const vy = parseVylety(params, snap);
  if (vy.used || mode === 'vylety') state.vylety = vy.state;
  if (vy.invalid) invalid = true;
  const zi = parseZivot(params, snap);
  if (zi.used || mode === 'score') state.zivot = zi.state;
  if (zi.invalid) invalid = true;
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

/** Parametry režimu „Kam vyrazit“ (prefix v, aby se nepletly s „Kam na střední“). */
function parseVylety(params: URLSearchParams, snap: Snapshot): { state: VyletyState; used: boolean; invalid: boolean } {
  const st: VyletyState = { ...DEFAULT_VYLETY, tagy: [] };
  let used = false;
  let invalid = false;
  const mista = snap.vylety?.mista ?? [];

  const k = params.get('vk');
  if (k !== null) {
    used = true;
    if ((KATEGORIE_IDS as readonly string[]).includes(k)) st.kat = k as KategorieId;
    else invalid = true;
  }
  const d = params.get('vd');
  if (d !== null) {
    used = true;
    if (areasAvailable(snap, 'obec').has(d) || mista.some((m) => m.obec === d)) st.domov = d;
    else invalid = true;
  }
  const km = params.get('vkm');
  if (km !== null) {
    used = true;
    const n = Number(km);
    if (Number.isInteger(n) && n >= KM_MIN && n <= KM_MAX) st.maxKm = n;
    else invalid = true;
  }
  const f = params.get('vf');
  if (f !== null && f !== '') {
    used = true;
    for (const tag of f.split(',')) {
      if (/^[a-z0-9-]+$/.test(tag)) st.tagy.push(tag);
      else invalid = true;
    }
  }
  const v = params.get('vv');
  if (v !== null) {
    used = true;
    if (v === 'vse' || v === 'zdarma' || v === 'placene') st.vstup = v;
    else invalid = true;
  }
  const p = params.get('vp');
  if (p !== null) {
    used = true;
    if (mista.some((m) => m.id === p)) st.misto = p;
    else invalid = true;
  }
  const q = params.get('vq');
  if (q !== null) {
    used = true;
    st.q = q.slice(0, 80);
  }
  const o = params.get('vo');
  if (o !== null) {
    used = true;
    if (o === 'vzdalenost' || o === 'nazev') st.razeni = o;
    else invalid = true;
  }
  return { state: st, used, invalid };
}

/**
 * Parametry režimu „Kde by se mi dobře žilo?“ (prefix z). `zp` chybí → doporučený výběr;
 * `zp=` (prázdné) = uživatel vše zrušil. Neznámý požadavek nebo důležitost se zahodí zvlášť.
 */
function parseZivot(params: URLSearchParams, snap: Snapshot): { state: ZivotState; used: boolean; invalid: boolean } {
  const st: ZivotState = { ...DEFAULT_ZIVOT, pozadavky: { ...DEFAULT_ZIVOT.pozadavky } };
  let used = false;
  let invalid = false;

  const zp = params.get('zp');
  if (zp !== null) {
    used = true;
    st.pozadavky = {};
    if (zp !== '') {
      for (const pair of zp.split(',')) {
        const m = /^([a-z0-9-]+):([12])$/.exec(pair.trim());
        if (m && POZADAVEK_IDS.includes(m[1])) st.pozadavky[m[1]] = Number(m[2]) as Dulezitost;
        else invalid = true;
      }
    }
  }
  const zo = params.get('zo');
  if (zo !== null) {
    used = true;
    if (areasAvailable(snap, 'obec').has(zo)) st.obec = zo;
    else invalid = true;
  }
  const zu = params.get('zu');
  if (zu !== null) {
    used = true;
    if (POZADAVEK_IDS.includes(zu)) st.ukaz = zu;
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
  if (state.vylety) {
    const v = state.vylety;
    if (v.kat) parts.push(`vk=${v.kat}`);
    if (v.domov) parts.push(`vd=${v.domov}`);
    if (v.maxKm !== DEFAULT_VYLETY.maxKm) parts.push(`vkm=${v.maxKm}`);
    if (v.tagy.length) parts.push(`vf=${v.tagy.join(',')}`);
    if (v.vstup !== 'vse') parts.push(`vv=${v.vstup}`);
    if (v.misto) parts.push(`vp=${encodeURIComponent(v.misto)}`);
    if (v.q) parts.push(`vq=${encodeURIComponent(v.q)}`);
    if (v.razeni !== DEFAULT_VYLETY.razeni) parts.push(`vo=${v.razeni}`);
  }
  if (state.zivot) {
    const z = state.zivot;
    // zp vždy (i prázdné), aby „Zrušit vše“ přežilo obnovení stránky
    parts.push(`zp=${Object.entries(z.pozadavky).map(([id, w]) => `${id}:${w}`).join(',')}`);
    if (z.obec) parts.push(`zo=${z.obec}`);
    if (z.ukaz) parts.push(`zu=${z.ukaz}`);
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
