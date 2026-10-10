/*
 * Úvodní stránka: rychlé hledání obce a karta „Obec v kostce“ – co je v okolí
 * (školy, zastávky, lékař, lékárna, nemocnice, úřady, tipy na výlet).
 * Žádné statistiky, jen praktické okolí. Čisté funkce nad ZivotKontext
 * (body a jejich memo sdílí s „Kde by se mi žilo“); testy nad public/data.
 */
import type { AreaCode, KategorieId, Misto } from './types.ts';
import { vzdalenostKm } from './skoly.ts';
import { KATEGORIE_BY_ID, bezDiakritiky } from './vylety.ts';
import { bodyPozadavku, type BodZivota, type ZivotKontext } from './zivot.ts';
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
  /** obec bez stálých obyvatel (vojenský újezd) – služby se neukazují */
  neobydlena: boolean;
  /** odkud se měří vzdálenosti (viz `stredObce`) */
  stred: StredObce;
  ms: Blizko | null;
  zs: Blizko | null;
  ss: Blizko | null;
  /**
   * autobusové zastávky v obci nebo do `ZASTAVKY_KM` od jejího středu;
   * null = data o zastávkách chybí
   */
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

export interface StredObce {
  lat: number;
  lon: number;
  /** odkud bod je: sídlo matriky v obci, průměr zastávek obce, nebo těžiště území */
  zdroj: 'matrika' | 'zastavky' | 'teziste';
}

/**
 * Reprezentativní „střed obce“ – místo, kde lidé opravdu bydlí. Těžiště území bývá
 * u rozlehlých obcí v lese (Aš, Sokolov, Kraslice), proto přednostně:
 * 1. sídlo matričního úřadu přímo v obci (radnice), 2. průměr zastávek ležících v obci,
 * 3. těžiště území. null = obec neznáme.
 */
export function stredObce(ctx: ZivotKontext, code: AreaCode): StredObce | null {
  const t = ctx.obce[code];
  if (!t) return null;
  const nazev = ctx.snap.urady?.obce.find((o) => o.kod === code)?.nazev ?? ctx.names[code] ?? '';
  const m = ctx.snap.urady ? matrikaProObec(nazev, t, ctx.snap.urady.matriky) : null;
  if (m?.vObci && m.matrika.lat !== null && m.matrika.lon !== null) {
    return { lat: m.matrika.lat, lon: m.matrika.lon, zdroj: 'matrika' };
  }
  const z = bodyPozadavku(ctx, 'zastavka').filter((b) => b.obec === code);
  if (z.length) {
    return {
      lat: z.reduce((s, b) => s + b.lat, 0) / z.length,
      lon: z.reduce((s, b) => s + b.lon, 0) / z.length,
      zdroj: 'zastavky',
    };
  }
  return { lat: t.lat, lon: t.lon, zdroj: 'teziste' };
}

/** Nejbližší bod požadavku ke středu obce. */
function blizko(ctx: ZivotKontext, id: string, code: AreaCode, stred: { lat: number; lon: number }): Blizko | null {
  let best: { b: BodZivota; km: number } | null = null;
  for (const b of bodyPozadavku(ctx, id)) {
    const km = vzdalenostKm(stred.lat, stred.lon, b.lat, b.lon);
    if (Number.isFinite(km) && (!best || km < best.km)) best = { b, km };
  }
  if (!best) return null;
  const obec = best.b.obec;
  return {
    nazev: best.b.nazev,
    obecNazev: (obec && ctx.names[obec]) || best.b.obecNazev || '',
    km: best.km,
    vObci: obec === code,
  };
}

/**
 * Jednoznačné názvy obcí: když se název opakuje (Chodov, Březová), doplní se ORP –
 * „Chodov (ORP Sokolov)“. `orp` = kód obce → název ORP.
 */
export function jednoznacneNazvy(
  names: Record<AreaCode, string>,
  orp: Record<AreaCode, string>,
): Record<AreaCode, string> {
  const pocet = new Map<string, number>();
  for (const n of Object.values(names)) pocet.set(n, (pocet.get(n) ?? 0) + 1);
  return Object.fromEntries(
    Object.entries(names).map(([code, n]) => [code, (pocet.get(n) ?? 0) > 1 && orp[code] ? `${n} (ORP ${orp[code]})` : n]),
  );
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

/** Úřady pro obec – stejný výběr, jaký ukazuje část „Úřady“ (vzdálenost matriky od `stred`). */
export function uradyObce(ctx: ZivotKontext, code: AreaCode, stred?: { lat: number; lon: number } | null): UradyVKostce | null {
  const data = ctx.snap.urady;
  const obec = data?.obce.find((o) => o.kod === code);
  if (!data || !obec) return null;
  const t = ctx.obce[code] ?? null;
  // matrika v obci se pozná podle těžiště (jako v části Úřady), vzdálenost jinam od středu obce
  const m = matrikaProObec(obec.nazev, t, data.matriky);
  return {
    obec,
    orp: uradOrp(obec, data.obce),
    matrika: m && !m.vObci && stred ? matrikaProObec(obec.nazev, stred, data.matriky) : m,
  };
}

const memo = new WeakMap<ZivotKontext, Map<AreaCode, ObecVKostce | null>>();

/**
 * Praktické okolí obce (memo podle kontextu = podle snapshotu); null = obec neznáme.
 * Všechny vzdálenosti se měří od jednoho bodu – `stredObce`.
 */
export function obecVKostce(ctx: ZivotKontext, code: AreaCode): ObecVKostce | null {
  let m = memo.get(ctx);
  if (!m) memo.set(ctx, (m = new Map()));
  if (m.has(code)) return m.get(code) ?? null;
  const stred = stredObce(ctx, code);
  let out: ObecVKostce | null = null;
  if (stred) {
    const neobydlena = ctx.neobydlene.has(code);
    const zastavky = bodyPozadavku(ctx, 'zastavka');
    const sluzba = (id: string) => (neobydlena ? null : blizko(ctx, id, code, stred));
    out = {
      code,
      nazev: ctx.names[code] ?? code,
      neobydlena,
      stred,
      ms: sluzba('materska-skola'),
      zs: sluzba('zakladni-skola'),
      ss: sluzba('stredni-skola'),
      zastavky:
        neobydlena || !zastavky.length
          ? null
          : zastavky.filter((b) => b.obec === code || vzdalenostKm(stred.lat, stred.lon, b.lat, b.lon) <= ZASTAVKY_KM)
              .length,
      lekar: sluzba('lekar'),
      lekarna: sluzba('lekarna'),
      nemocnice: sluzba('nemocnice'),
      urady: uradyObce(ctx, code, stred),
      vylety: neobydlena ? [] : tipyNaVylet(ctx.snap.vylety?.mista ?? [], stred),
    };
  }
  m.set(code, out);
  return out;
}

/** Otázka pro AI poradce o obci. */
export function otazkaOObci(nazev: string): string {
  return `Jak se žije v obci ${nazev}? Co je tam blízko?`;
}
