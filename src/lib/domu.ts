/*
 * Úvodní stránka: rychlé hledání obce a karta „Obec v kostce“ – co je v okolí
 * (školy, zastávky, lékař, lékárna, nemocnice, úřady, tipy na výlet).
 * Žádné statistiky, jen praktické okolí. Čisté funkce nad ZivotKontext
 * (body a jejich memo sdílí s „Kde by se mi žilo“); testy nad public/data.
 */
import type { AreaCode, KategorieId, Misto } from './types.ts';
import { vzdalenostKm } from './skoly.ts';
import { KATEGORIE_BY_ID, bezDiakritiky } from './vylety.ts';
import { bodyPozadavku, type ZivotKontext } from './zivot.ts';
import { nejblizsiBod } from './zivot-mapa.ts';
import { matrikaProObec, uradOrp, type Kontakt, type MatrikaVyber, type UradyObce } from './urady.ts';

// --- rychlé hledání obce ----------------------------------------------------------

export interface NalezObce {
  code: AreaCode;
  nazev: string;
}

/**
 * Obce podle zadaného textu, bez ohledu na diakritiku a velikost písmen.
 * Pořadí: název začíná dotazem → některé slovo názvu začíná dotazem → dotaz je uvnitř názvu;
 * v rámci skupiny abecedně.
 */
export function hledejObce(names: Record<AreaCode, string>, dotaz: string, limit = 8): NalezObce[] {
  const q = bezDiakritiky(dotaz.trim());
  if (!q) return [];
  const out: { code: AreaCode; nazev: string; rank: number }[] = [];
  for (const [code, nazev] of Object.entries(names)) {
    const n = bezDiakritiky(nazev);
    let rank = -1;
    if (n.startsWith(q)) rank = 0;
    else if (n.split(/[\s\-(]+/).some((w) => w.startsWith(q))) rank = 1;
    else if (n.includes(q)) rank = 2;
    if (rank >= 0) out.push({ code, nazev, rank });
  }
  return out
    .sort((a, b) => a.rank - b.rank || a.nazev.localeCompare(b.nazev, 'cs'))
    .slice(0, limit)
    .map(({ code, nazev }) => ({ code, nazev }));
}

// --- obec v kostce ----------------------------------------------------------------

/** Nejbližší služba: název, kde leží a jak daleko (vzdušnou čarou od středu obce). */
export interface Blizko {
  nazev: string;
  /** název obce, kde služba je ('' = neznámé) */
  obecNazev: string;
  km: number;
  /** služba leží přímo ve vybrané obci */
  vObci: boolean;
}

export interface TipNaVylet {
  id: string;
  nazev: string;
  kat: KategorieId;
  katLabel: string;
  obecNazev: string;
  km: number;
}

export interface UradyVKostce {
  obec: UradyObce;
  /** úřad obce s rozšířenou působností */
  orp: Kontakt | null;
  matrika: MatrikaVyber | null;
}

export interface ObecVKostce {
  code: AreaCode;
  nazev: string;
  ms: Blizko | null;
  zs: Blizko | null;
  ss: Blizko | null;
  /** počet autobusových zastávek do 1 km od středu obce; null = data o zastávkách chybí */
  zastavky: number | null;
  lekar: Blizko | null;
  lekarna: Blizko | null;
  nemocnice: Blizko | null;
  urady: UradyVKostce | null;
  /** nejbližší místa pro výlet do `VYLET_KM` (různé kategorie, nejvýš 3) */
  vylety: TipNaVylet[];
}

export const ZASTAVKY_KM = 1;
export const VYLET_KM = 15;

function blizko(ctx: ZivotKontext, id: string, code: AreaCode): Blizko | null {
  const n = nejblizsiBod(ctx, id, code);
  if (!n || !Number.isFinite(n.km)) return null;
  const obec = n.bod.obec;
  return {
    nazev: n.bod.nazev,
    obecNazev: (obec && ctx.names[obec]) || n.bod.obecNazev || '',
    km: n.km,
    vObci: obec === code,
  };
}

/**
 * Nejbližší místa pro výlet do `maxKm` od středu obce. Aby karta nebyla jen „tři muzea
 * v centru“, bere se nejdřív nejbližší místo z každé kategorie; teprve když kategorie
 * dojdou, doplní se další nejbližší.
 */
export function tipyNaVylet(
  mista: readonly Misto[],
  stred: { lat: number; lon: number },
  maxKm = VYLET_KM,
  n = 3,
): TipNaVylet[] {
  const blizka = mista
    .map((m) => ({ m, km: vzdalenostKm(stred.lat, stred.lon, m.lat, m.lon) }))
    .filter((x) => Number.isFinite(x.km) && x.km <= maxKm)
    .sort((a, b) => a.km - b.km || a.m.nazev.localeCompare(b.m.nazev, 'cs'));
  const vybrane: typeof blizka = [];
  const kat = new Set<string>();
  for (const x of blizka) {
    if (vybrane.length >= n) break;
    if (kat.has(x.m.kat)) continue;
    kat.add(x.m.kat);
    vybrane.push(x);
  }
  for (const x of blizka) {
    if (vybrane.length >= n) break;
    if (!vybrane.includes(x)) vybrane.push(x);
  }
  return vybrane
    .sort((a, b) => a.km - b.km)
    .map(({ m, km }) => ({
      id: m.id,
      nazev: m.nazev,
      kat: m.kat,
      katLabel: KATEGORIE_BY_ID[m.kat]?.label ?? '',
      obecNazev: m.obecNazev,
      km,
    }));
}

/** Úřady pro obec – stejný výběr, jaký ukazuje část „Úřady“. */
export function uradyObce(ctx: ZivotKontext, code: AreaCode): UradyVKostce | null {
  const data = ctx.snap.urady;
  const obec = data?.obce.find((o) => o.kod === code);
  if (!data || !obec) return null;
  return {
    obec,
    orp: uradOrp(obec, data.obce),
    matrika: matrikaProObec(obec.nazev, ctx.obce[code] ?? null, data.matriky),
  };
}

const memo = new WeakMap<ZivotKontext, Map<AreaCode, ObecVKostce | null>>();

/** Praktické okolí obce (memo podle kontextu = podle snapshotu); null = obec neznáme. */
export function obecVKostce(ctx: ZivotKontext, code: AreaCode): ObecVKostce | null {
  let m = memo.get(ctx);
  if (!m) memo.set(ctx, (m = new Map()));
  if (m.has(code)) return m.get(code) ?? null;
  const stred = ctx.obce[code];
  let out: ObecVKostce | null = null;
  if (stred) {
    const zastavky = bodyPozadavku(ctx, 'zastavka');
    out = {
      code,
      nazev: ctx.names[code] ?? code,
      ms: blizko(ctx, 'materska-skola', code),
      zs: blizko(ctx, 'zakladni-skola', code),
      ss: blizko(ctx, 'stredni-skola', code),
      zastavky: zastavky.length
        ? zastavky.filter((b) => vzdalenostKm(stred.lat, stred.lon, b.lat, b.lon) <= ZASTAVKY_KM).length
        : null,
      lekar: blizko(ctx, 'lekar', code),
      lekarna: blizko(ctx, 'lekarna', code),
      nemocnice: blizko(ctx, 'nemocnice', code),
      urady: uradyObce(ctx, code),
      vylety: tipyNaVylet(ctx.snap.vylety?.mista ?? [], stred),
    };
  }
  m.set(code, out);
  return out;
}

/** Otázka pro AI poradce o obci. */
export function otazkaOObci(nazev: string): string {
  return `Jak se žije v obci ${nazev}? Co je tam blízko?`;
}
