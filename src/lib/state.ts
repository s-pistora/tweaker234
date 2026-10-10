// Stav aplikace synchronizovany s `location.hash`.
//
// Format URL: #/{uroven}/{kod}?u=<ukazatel>&r=<rok>&m=<rezim>&w=<id:vaha,...>
//             [&d=<obec domova>&t=<typ>&g=<skupina>&km=<max>&s=<izo skoly>&o=<razeni>&p=<plan>]  (rezim skoly)
//             [&k=<obec>]  (rezim karta = „Karta obce“), [&xt=<tab>&xs=<sluzba>&xkm=<km>]  (rezim prokraj)
//             [&zp=<id:1|2,...>&zo=<obec>&zu=<id pozadavku>]  (rezim score = „Kde by se mi dobře žilo?“)
//             [&ho=<obec>]  (rezim domu = úvodní stránka, karta „Obec v kostce“)
// `#/` nebo prazdny hash = vychozi stav. Kazda nevalidni cast hashe spadne
// zvlast na svou vychozi hodnotu a cely vysledny stav zustava validni
// (parseHash/toHash nikdy nevyhodi vyjimku) - navic se vrati `invalid:true`.

import { writable } from 'svelte/store';
import { LEVELS, KATEGORIE_IDS, type Level, type AreaCode, type TypStudia, type KategorieId } from './types.ts';
import type { Snapshot } from './data/loader.ts';
import { SITUACE } from './urady.ts';
import { DOPORUCENY_VYBER, POZADAVEK_IDS, type Dulezitost } from './zivot.ts';
import { PLAN_MAX, planId } from './planovac.ts';

export type Mode =
  | 'domu'
  | 'obec'
  | 'explore'
  | 'score'
  | 'skoly'
  | 'vylety'
  | 'urady'
  | 'penize'
  | 'podnikani'
  | 'nalezy'
  | 'karta'
  | 'prokraj';
export const MODES: readonly Mode[] = [
  'domu',
  'obec',
  'explore',
  'score',
  'skoly',
  'vylety',
  'urady',
  'penize',
  'podnikani',
  'nalezy',
  'karta',
  'prokraj',
];

/** Úvodní stránka („Co potřebujete vyřešit?“): obec vybraná v rychlém hledání. */
export interface DomuState {
  /** kód obce pro kartu „Obec v kostce“ (sdílený „domov“ pro ostatní části) */
  obec: AreaCode | null;
}

export const DEFAULT_DOMU: DomuState = { obec: null };

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
  /** plán přihlášek: id oborů (`planId` v lib/planovac.ts) v pořadí priority, nejvýš PLAN_MAX */
  plan: string[];
}

export const DEFAULT_SKOLY: SkolyState = {
  domov: null,
  typ: 'vse',
  skupina: '',
  maxKm: 25,
  skola: null,
  razeni: 'vzdalenost',
  plan: [],
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

/** Režim „Úřady“ – „Kam s tím na úřad?“ */
export interface UradyState {
  /** kód obce, pro kterou se hledají úřady */
  obec: AreaCode | null;
  /** id životní situace (`SITUACE` v lib/urady.ts); '' = žádná */
  situace: string;
}

export const DEFAULT_URADY: UradyState = { obec: null, situace: '' };

/** Režim „Peníze kraje“. */
export interface PenizeState {
  tab: 'projekty' | 'vouchery' | 'strategie';
  /** filtr voucherů podle typu ('' = všechny) */
  typ: string;
  /** filtr voucherů podle ORP (kód, '' = celý kraj) */
  orp: string;
}

export const DEFAULT_PENIZE: PenizeState = { tab: 'projekty', typ: '', orp: '' };
const PENIZE_TABY: PenizeState['tab'][] = ['projekty', 'vouchery', 'strategie'];
const VOUCHER_TYPY = ['inovacni', 'kreativni', 'asistencni', 'startovaci'];

/** Režim „Podnikání“. */
export interface PodnikaniState {
  tab: 'kreativci' | 'centra' | 'zony';
  /** obor kreativců ('' = všechny) */
  obor: string;
  q: string;
}

export const DEFAULT_PODNIKANI: PodnikaniState = { tab: 'kreativci', obor: '', q: '' };
const PODNIKANI_TABY: PodnikaniState['tab'][] = ['kreativci', 'centra', 'zony'];

/** Režim „Karta obce“ – přehled jedné obce pro starostu (k tisku). */
export interface KartaState {
  kod: AreaCode | null;
}

export const DEFAULT_KARTA: KartaState = { kod: null };

/** Režim „Pro kraj“ – bílá místa a výhled oborů. */
export interface ProKrajState {
  tab: 'bila' | 'vyhled';
  /** id služby pro bílá místa (`SLUZBY` v lib/bilamista.ts) */
  sluzba: string;
  /** hranice dostupnosti v km */
  km: number;
}

export const DEFAULT_PROKRAJ: ProKrajState = { tab: 'bila', sluzba: 'lekar', km: 5 };
const PROKRAJ_TABY: ProKrajState['tab'][] = ['bila', 'vyhled'];
export const PROKRAJ_KM_MIN = 1;
export const PROKRAJ_KM_MAX = 30;

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
  /** jen když se režim „Úřady“ použil */
  urady?: UradyState;
  /** jen když se režim „Peníze kraje“ použil */
  penize?: PenizeState;
  /** jen když se režim „Podnikání“ použil */
  podnikani?: PodnikaniState;
  /** jen když se režim „Karta obce“ použil */
  karta?: KartaState;
  /** jen když se režim „Pro kraj“ použil */
  prokraj?: ProKrajState;
  /** jen když se na úvodní stránce vybrala obec (nebo je otevřená úvodní stránka) */
  domu?: DomuState;
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
  const ur = parseUrady(params, snap);
  if (ur.used || mode === 'urady') state.urady = ur.state;
  if (ur.invalid) invalid = true;
  const pe = parsePenize(params);
  if (pe.used || mode === 'penize') state.penize = pe.state;
  if (pe.invalid) invalid = true;
  const po = parsePodnikani(params, snap);
  if (po.used || mode === 'podnikani') state.podnikani = po.state;
  if (po.invalid) invalid = true;
  const ka = parseKarta(params, snap);
  if (ka.used || mode === 'karta') state.karta = ka.state;
  if (ka.invalid) invalid = true;
  const pk = parseProKraj(params);
  if (pk.used || mode === 'prokraj') state.prokraj = pk.state;
  if (pk.invalid) invalid = true;
  // úvodní stránka: ho=<obec> (karta „Obec v kostce“)
  const ho = params.get('ho');
  if (ho !== null || mode === 'domu') {
    state.domu = { ...DEFAULT_DOMU };
    if (ho !== null) {
      if (areasAvailable(snap, 'obec').has(ho)) state.domu.obec = ho;
      else invalid = true;
    }
  }
  return { state, invalid };
}

/** Parametr režimu „Karta obce“: k=<kód obce>. */
function parseKarta(params: URLSearchParams, snap: Snapshot): { state: KartaState; used: boolean; invalid: boolean } {
  const st: KartaState = { ...DEFAULT_KARTA };
  const k = params.get('k');
  if (k === null) return { state: st, used: false, invalid: false };
  if (areasAvailable(snap, 'obec').has(k)) return { state: { kod: k }, used: true, invalid: false };
  return { state: st, used: true, invalid: true };
}

/** Parametry režimu „Pro kraj“: xt=<tab>, xs=<služba>, xkm=<km>. Služba se ověřuje až v UI (seznam služeb). */
function parseProKraj(params: URLSearchParams): { state: ProKrajState; used: boolean; invalid: boolean } {
  const st: ProKrajState = { ...DEFAULT_PROKRAJ };
  let used = false;
  let invalid = false;
  const xt = params.get('xt');
  if (xt !== null) {
    used = true;
    if ((PROKRAJ_TABY as string[]).includes(xt)) st.tab = xt as ProKrajState['tab'];
    else invalid = true;
  }
  const xs = params.get('xs');
  if (xs !== null) {
    used = true;
    if (/^[a-z0-9-]{1,40}$/.test(xs)) st.sluzba = xs;
    else invalid = true;
  }
  const xkm = params.get('xkm');
  if (xkm !== null) {
    used = true;
    const n = Number(xkm);
    if (Number.isInteger(n) && n >= PROKRAJ_KM_MIN && n <= PROKRAJ_KM_MAX) st.km = n;
    else invalid = true;
  }
  return { state: st, used, invalid };
}

/** Parametry režimu „Podnikání“: kt=<tab>, ko=<obor>, kq=<hledání>. */
function parsePodnikani(params: URLSearchParams, snap: Snapshot): { state: PodnikaniState; used: boolean; invalid: boolean } {
  const st: PodnikaniState = { ...DEFAULT_PODNIKANI };
  let used = false;
  let invalid = false;
  const kt = params.get('kt');
  if (kt !== null) {
    used = true;
    if ((PODNIKANI_TABY as string[]).includes(kt)) st.tab = kt as PodnikaniState['tab'];
    else invalid = true;
  }
  const ko = params.get('ko');
  if (ko !== null) {
    used = true;
    if (ko === '' || !snap.podnikani || snap.podnikani.kreativci.some((k) => k.obory.includes(ko))) st.obor = ko;
    else invalid = true;
  }
  const kq = params.get('kq');
  if (kq !== null) {
    used = true;
    st.q = kq.slice(0, 80);
  }
  return { state: st, used, invalid };
}

/** Parametry režimu „Peníze kraje“: pt=<tab>, pv=<typ voucheru>, po=<kód ORP>. */
function parsePenize(params: URLSearchParams): { state: PenizeState; used: boolean; invalid: boolean } {
  const st: PenizeState = { ...DEFAULT_PENIZE };
  let used = false;
  let invalid = false;
  const pt = params.get('pt');
  if (pt !== null) {
    used = true;
    if ((PENIZE_TABY as string[]).includes(pt)) st.tab = pt as PenizeState['tab'];
    else invalid = true;
  }
  const pv = params.get('pv');
  if (pv !== null) {
    used = true;
    if (pv === '' || VOUCHER_TYPY.includes(pv)) st.typ = pv;
    else invalid = true;
  }
  const po = params.get('po');
  if (po !== null) {
    used = true;
    if (/^\d{4}$/.test(po) || po === '') st.orp = po;
    else invalid = true;
  }
  return { state: st, used, invalid };
}

/** Parametry režimu „Úřady“: uo=<kód obce>, us=<situace>. */
function parseUrady(params: URLSearchParams, snap: Snapshot): { state: UradyState; used: boolean; invalid: boolean } {
  const st: UradyState = { ...DEFAULT_URADY };
  let used = false;
  let invalid = false;
  const uo = params.get('uo');
  if (uo !== null) {
    used = true;
    if (snap.urady?.obce.some((o) => o.kod === uo) || areasAvailable(snap, 'obec').has(uo)) st.obec = uo;
    else invalid = true;
  }
  const us = params.get('us');
  if (us !== null) {
    used = true;
    if (us === '' || SITUACE.some((x) => x.id === us)) st.situace = us;
    else invalid = true;
  }
  return { state: st, used, invalid };
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
  const p = params.get('p');
  if (p !== null) {
    used = true;
    const plan: string[] = [];
    for (const id of p.split(',').filter(Boolean)) {
      if (plan.length < PLAN_MAX && !plan.includes(id) && obory.some((x) => planId(x) === id)) plan.push(id);
      else invalid = true;
    }
    st.plan = plan;
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
    if (k.plan?.length) parts.push(`p=${k.plan.map(encodeURIComponent).join(',')}`);
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
  if (state.podnikani) {
    const p = state.podnikani;
    if (p.tab !== DEFAULT_PODNIKANI.tab) parts.push(`kt=${p.tab}`);
    if (p.obor) parts.push(`ko=${encodeURIComponent(p.obor)}`);
    if (p.q) parts.push(`kq=${encodeURIComponent(p.q)}`);
  }
  if (state.penize) {
    const p = state.penize;
    if (p.tab !== DEFAULT_PENIZE.tab) parts.push(`pt=${p.tab}`);
    if (p.typ) parts.push(`pv=${p.typ}`);
    if (p.orp) parts.push(`po=${p.orp}`);
  }
  if (state.urady) {
    const u = state.urady;
    if (u.obec) parts.push(`uo=${u.obec}`);
    if (u.situace) parts.push(`us=${u.situace}`);
  }
  if (state.karta?.kod) parts.push(`k=${state.karta.kod}`);
  if (state.prokraj) {
    const x = state.prokraj;
    if (x.tab !== DEFAULT_PROKRAJ.tab) parts.push(`xt=${x.tab}`);
    if (x.sluzba !== DEFAULT_PROKRAJ.sluzba) parts.push(`xs=${x.sluzba}`);
    if (x.km !== DEFAULT_PROKRAJ.km) parts.push(`xkm=${x.km}`);
  }
  if (state.domu?.obec) parts.push(`ho=${state.domu.obec}`);
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
