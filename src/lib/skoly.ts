// Režim „Kam na střední“: čisté funkce nad obory středních škol (bez DOM/sítě).
// Sdílí je datový skript (scripts/sources/dz-prijimani.ts) i frontend.
//
// Naplněnost oboru = nově přijatí k 30. 9. 2025 / záměr přijímaných pro 2025/26.
// Vzdálenosti jsou vzdušnou čarou – jízdní řády kraj jako otevřená data nezveřejňuje.

import type { AreaCode, Obor, TypStudia } from './types.ts';

/** Názvy skupin oborů podle prvního dvojčíslí kódu (Nařízení vlády č. 211/2010 Sb., zkráceno). */
export const SKUPINY: Record<string, string> = {
  '16': 'Ekologie a ochrana prostředí',
  '18': 'Informatika',
  '21': 'Hornictví a hutnictví',
  '23': 'Strojírenství',
  '26': 'Elektrotechnika',
  '28': 'Chemie',
  '29': 'Potravinářství',
  '31': 'Textil a oděvnictví',
  '33': 'Zpracování dřeva',
  '34': 'Polygrafie',
  '36': 'Stavebnictví',
  '37': 'Doprava',
  '39': 'Speciální a interdisciplinární obory',
  '41': 'Zemědělství a lesnictví',
  '43': 'Veterinářství',
  '53': 'Zdravotnictví',
  '61': 'Filozofie a teologie',
  '63': 'Ekonomika a administrativa',
  '64': 'Podnikání',
  '65': 'Gastronomie, hotelnictví, turismus',
  '66': 'Obchod',
  '68': 'Právo a bezpečnost',
  '69': 'Osobní a provozní služby',
  '72': 'Publicistika a knihovnictví',
  '75': 'Pedagogika a sociální péče',
  '78': 'Obecně odborná příprava (lycea)',
  '79': 'Gymnázia',
  '82': 'Umění a užité umění',
};

export function nazevSkupiny(skupina: string): string {
  return SKUPINY[skupina] ?? `Skupina ${skupina}`;
}

/** Skupina oboru = první dvojčíslí kódu ('69-54-E/01' → '69'). */
export function skupinaZKodu(kod: string): string {
  const m = /^(\d{2})/.exec(kod.trim());
  return m ? m[1] : '';
}

/**
 * Typ studia z „Druh vzdělávání“; když chybí nebo je neznámý, podle písmene v kódu oboru
 * (K/L/M = maturita, E/H = výuční list).
 */
export function typStudia(druh: string, kod: string): TypStudia {
  const d = druh.toLowerCase();
  if (d.includes('maturit')) return 'maturita';
  if (d.includes('výuční')) return 'vyucni';
  if (d.includes('nástavb')) return 'maturita';
  const m = /^\d{2}-\d{2}-([A-Z])\//.exec(kod.trim());
  if (m) {
    if ('KLM'.includes(m[1])) return 'maturita';
    if ('EH'.includes(m[1])) return 'vyucni';
  }
  return 'jine';
}

export const TYP_LABEL: Record<TypStudia, string> = {
  maturita: 'maturita',
  vyucni: 'výuční list',
  jine: 'jiné',
};

/** Vzdušná vzdálenost v km (haversine). */
export function vzdalenostKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// --- naplněnost ---------------------------------------------------------------

export type TridaNaplnenosti = 'volno' | 'ok' | 'pretlak' | 'na';

/** Podíl přijatých 2025 vůči záměru 2025/26 (0–∞); null když chybí data nebo je záměr 0. */
export function naplnenost(o: Pick<Obor, 'zamer' | 'prijato2025'>): number | null {
  const z = o.zamer[2025];
  if (o.prijato2025 === null || z === null || z === undefined || z <= 0) return null;
  return o.prijato2025 / z;
}

export function tridaNaplnenosti(n: number | null): TridaNaplnenosti {
  if (n === null) return 'na';
  if (n < 0.7) return 'volno';
  if (n <= 1) return 'ok';
  return 'pretlak';
}

export const TRIDA_LABEL: Record<TridaNaplnenosti, string> = {
  volno: 'hodně volných míst',
  ok: 'skoro plno',
  pretlak: 'přeplněno',
  na: 'bez údaje',
};

/** Vývoj záměru mezi prvním a posledním rokem, kdy obor existoval: -1 / 0 / 1, null = méně než 2 roky. */
export function trend(o: Pick<Obor, 'zamer'>): -1 | 0 | 1 | null {
  const roky = Object.keys(o.zamer)
    .map(Number)
    .sort((a, b) => a - b)
    .filter((r) => typeof o.zamer[r] === 'number');
  if (roky.length < 2) return null;
  const a = o.zamer[roky[0]] as number;
  const b = o.zamer[roky[roky.length - 1]] as number;
  return b > a ? 1 : b < a ? -1 : 0;
}

export const TREND_CHAR = { '1': '↗', '0': '→', '-1': '↘' } as const;

export function trendChar(t: -1 | 0 | 1 | null): string {
  return t === null ? '·' : TREND_CHAR[String(t) as '1' | '0' | '-1'];
}

/** ASCII pruh pro podíl 0–1 (přetlak se ořízne na plný pruh). */
export function asciiBar(podil: number | null, sirka = 10): string {
  if (podil === null || !Number.isFinite(podil)) return '·'.repeat(sirka);
  const plne = Math.round(Math.max(0, Math.min(1, podil)) * sirka);
  return '█'.repeat(plne) + '░'.repeat(sirka - plne);
}

export function procenta(podil: number | null): string {
  return podil === null ? 'N/A' : `${Math.round(podil * 100)} %`;
}

// --- filtrování ---------------------------------------------------------------

export interface Domov {
  lat: number;
  lon: number;
}

export interface Filtr {
  domov: Domov | null;
  typ: TypStudia | 'vse';
  /** '' = všechny skupiny */
  skupina: string;
  maxKm: number;
}

export type Razeni = 'vzdalenost' | 'volno';

export interface OborVysledek {
  obor: Obor;
  /** null = není zadán domov */
  km: number | null;
  naplnenost: number | null;
}

/** Obory, které se otevírají v 2026/27 (záměr > 0), vyfiltrované a seřazené. */
export function filtrujObory(obory: Obor[], f: Filtr, razeni: Razeni = 'vzdalenost'): OborVysledek[] {
  const out: OborVysledek[] = [];
  for (const o of obory) {
    if (!((o.zamer[2026] ?? 0) > 0)) continue;
    if (f.typ !== 'vse' && o.typ !== f.typ) continue;
    if (f.skupina && o.skupina !== f.skupina) continue;
    const km = f.domov ? vzdalenostKm(f.domov.lat, f.domov.lon, o.lat, o.lon) : null;
    if (km !== null && km > f.maxKm) continue;
    out.push({ obor: o, km, naplnenost: naplnenost(o) });
  }
  const volnoKey = (r: OborVysledek) => (r.naplnenost === null ? Infinity : r.naplnenost);
  out.sort((a, b) => {
    if (razeni === 'volno') {
      const d = volnoKey(a) - volnoKey(b);
      if (d !== 0) return d;
    }
    const k = (a.km ?? 0) - (b.km ?? 0);
    if (k !== 0) return k;
    return a.obor.skola.localeCompare(b.obor.skola, 'cs') || a.obor.nazevOboru.localeCompare(b.obor.nazevOboru, 'cs');
  });
  return out;
}

/** Školy (unikátní IZO) z výsledků – pro body na mapě. */
export function skolyZVysledku(v: OborVysledek[]): Obor[] {
  const seen = new Map<string, Obor>();
  for (const r of v) if (!seen.has(r.obor.izo)) seen.set(r.obor.izo, r.obor);
  return [...seen.values()];
}

/** Celková naplněnost školy (součet přijatých / součet záměrů 2025 přes obory s oběma údaji). */
export function naplnenostSkoly(obory: Obor[]): number | null {
  let p = 0;
  let z = 0;
  for (const o of obory) {
    if (naplnenost(o) === null) continue;
    p += o.prijato2025 as number;
    z += o.zamer[2025] as number;
  }
  return z > 0 ? p / z : null;
}

// --- přehled pro kraj -------------------------------------------------------

export interface Agregace {
  klic: string;
  nazev: string;
  zamer2025: number;
  prijato2025: number;
  zamer2026: number;
  naplnenost: number | null;
  pocetOboru: number;
}

/** Součty po skupinách (podle `klicOf`) přes obory s údajem o naplněnosti; seřazeno od nejnižší naplněnosti. */
export function agreguj(
  obory: Obor[],
  klicOf: (o: Obor) => string,
  nazevOf: (klic: string) => string,
): Agregace[] {
  const m = new Map<string, Agregace>();
  for (const o of obory) {
    const k = klicOf(o);
    if (!k) continue;
    let a = m.get(k);
    if (!a) {
      a = { klic: k, nazev: nazevOf(k), zamer2025: 0, prijato2025: 0, zamer2026: 0, naplnenost: null, pocetOboru: 0 };
      m.set(k, a);
    }
    a.zamer2026 += o.zamer[2026] ?? 0;
    if (naplnenost(o) !== null) {
      a.zamer2025 += o.zamer[2025] as number;
      a.prijato2025 += o.prijato2025 as number;
      a.pocetOboru++;
    }
  }
  const out = [...m.values()].map((a) => ({ ...a, naplnenost: a.zamer2025 > 0 ? a.prijato2025 / a.zamer2025 : null }));
  return out.sort((a, b) => (a.naplnenost ?? Infinity) - (b.naplnenost ?? Infinity));
}

/** Obory s údajem o naplněnosti a aspoň `minZamer` plánovanými místy (aby 1 z 2 nebylo „50 %“). */
export function oboryPodleNaplnenosti(obory: Obor[], smer: 'nejmene' | 'nejvice', n = 10, minZamer = 10): Obor[] {
  const s = obory.filter((o) => naplnenost(o) !== null && (o.zamer[2025] as number) >= minZamer);
  s.sort((a, b) => (naplnenost(a) as number) - (naplnenost(b) as number));
  if (smer === 'nejvice') s.reverse();
  return s.slice(0, n);
}

// --- věty lidskou řečí -------------------------------------------------------

function mist(n: number): string {
  if (n === 1) return 'místo';
  if (n >= 2 && n <= 4) return 'místa';
  return 'míst';
}

export function vetaNaplnenost(o: Obor): string {
  const n = naplnenost(o);
  if (n === null) {
    if ((o.zamer[2025] ?? null) === null) return `Obor ${o.nazevOboru} loni neotevíral – o naplněnosti nejsou údaje.`;
    return `U oboru ${o.nazevOboru} chybí údaj o loni přijatých žácích.`;
  }
  const z = o.zamer[2025] as number;
  const zaver =
    n > 1 ? 'přijali víc žáků, než plánovali – je o něj zájem.' : n < 0.7 ? 'zůstala spousta volných míst.' : 'byl skoro plný.';
  return `Loni na obor ${o.nazevOboru} nastoupilo ${o.prijato2025} z ${z} plánovaných ${mist(z)} (${procenta(n)}) – ${zaver}`;
}

export function vetaTrend(o: Obor): string | null {
  const t = trend(o);
  const z26 = o.zamer[2026];
  if (t === null || z26 === null || z26 === undefined) return null;
  const prvni = Object.keys(o.zamer)
    .map(Number)
    .sort((a, b) => a - b)
    .find((r) => typeof o.zamer[r] === 'number') as number;
  const z0 = o.zamer[prvni] as number;
  if (t === 0) return `Plánovaný počet míst se od ${prvni}/${String(prvni + 1).slice(2)} nemění (${z26}).`;
  return `Plánovaná místa ${t > 0 ? 'rostou' : 'klesají'}: ${z0} → ${z26} (${prvni}/${String(prvni + 1).slice(2)} → 2026/27).`;
}

export function vetaDoprava(o: Pick<Obor, 'zastavky500m' | 'nejblizsiZastavkaM'>): string {
  if (o.nejblizsiZastavkaM === null) return 'Poloha nejbližší autobusové zastávky není známa.';
  if (o.zastavky500m === 0) return `Nejbližší autobusová zastávka je ${Math.round(o.nejblizsiZastavkaM)} m vzdušnou čarou.`;
  const n = o.zastavky500m;
  const kolik =
    n === 1 ? 'je 1 autobusová zastávka' : n <= 4 ? `jsou ${n} autobusové zastávky` : `je ${n} autobusových zastávek`;
  return `Do 500 m od školy ${kolik} (nejbližší ${Math.round(o.nejblizsiZastavkaM)} m).`;
}

/** Kód obce → [lat, lon] centroidu se počítá ve frontendu z geodat; tady jen typ pro přehlednost. */
export type CentroidyObci = Record<AreaCode, Domov>;
