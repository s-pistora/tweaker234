// Režim „Peníze kraje“: co kraj buduje (projekty), komu dává (vouchery pro firmy) a podle čeho
// plánuje (strategické dokumenty). Zdroj: DATAZÁPAD (Karlovarský kraj).
// Čisté funkce – převod CSV (datový skript) i agregace pro frontend.

import type { PointFeature } from './types.ts';

export interface Projekt {
  id: string;
  nazev: string;
  stav: 'probiha' | 'ukonceno';
  popis: string;
  typ: string;
  oblast: string;
  /** operační program / zdroj spolufinancování */
  program: string;
  vyzva: string;
  regCislo: string;
  /** role kraje (např. „partner projektu“); '' = kraj je žadatel */
  role: string;
  vydaje: number | null;
  dotace: number | null;
  /** ISO datum „2024-01-01“ nebo jen rok „2022“ */
  od: string;
  do: string;
  web: string;
}

export interface Strategie {
  id: string;
  nazev: string;
  druh: string;
  legislativa: string;
  od: number | null;
  do: number | null;
  oblasti: string[];
  web: string;
}

export interface PenizeFile {
  updatedAt: string;
  sourceIds: string[];
  projekty: Projekt[];
  strategie: Strategie[];
  /** nesrovnalosti nalezené ve zdrojových datech kraje */
  chybyDat: string[];
}

export function isPenizeFile(x: unknown): x is PenizeFile {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.updatedAt === 'string' &&
    Array.isArray(o.sourceIds) &&
    Array.isArray(o.projekty) &&
    Array.isArray(o.strategie) &&
    o.projekty.every((p) => typeof p === 'object' && p !== null && typeof (p as Projekt).nazev === 'string')
  );
}

// --- převod dat ------------------------------------------------------------------

type Radek = Record<string, string>;
const t = (v: string | undefined) => (v ?? '').replace(/ /g, ' ').trim();

/**
 * Částka v Kč z různých zápisů v datech kraje: „70000000“, „22 804 017,46“,
 * „412536663,15“, „74040869.35“. Prázdné → null.
 */
export function parseCastka(v: string | undefined): number | null {
  let s = t(v).replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** „2024_01_01“ → „2024-01-01“, „2022“ → „2022“. */
export function parseDatum(v: string | undefined): string {
  const s = t(v);
  const m = /^(\d{4})[_\-.](\d{1,2})[_\-.](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return /^\d{4}$/.test(s) ? s : '';
}

function web(v: string | undefined): string {
  const s = t(v);
  return /^https?:\/\//i.test(s) ? s : '';
}

export function projektyAktualni(rows: Radek[]): Projekt[] {
  return rows
    .filter((r) => t(r['Název projektu']))
    .map((r, i) => ({
      id: `a${i + 1}`,
      nazev: t(r['Název projektu']),
      stav: 'probiha' as const,
      popis: t(r['Popis projektu']),
      typ: t(r['Typ projektu']),
      oblast: t(r['Oblast projektu']),
      program: t(r['Spolufinancování']),
      vyzva: t(r['Výzva']),
      regCislo: t(r['Registrační číslo projektu']),
      role: '',
      vydaje: parseCastka(r['Předpokládané výdaje']),
      dotace: parseCastka(r['Předpokládaná celková výše dotace']),
      od: parseDatum(r['Zahájení realizace projektu']),
      do: parseDatum(r['Předpokládané ukončení projektu']),
      web: web(r['Webová stránka s informacemi o projektu']),
    }));
}

/** Ukončené projekty; duplicitní řádky (stejný název i registrační číslo) se sloučí. */
export function projektyUkoncene(rows: Radek[]): { projekty: Projekt[]; duplicit: number } {
  const seen = new Set<string>();
  const out: Projekt[] = [];
  let duplicit = 0;
  rows.forEach((r, i) => {
    const nazev = t(r['Název projektu']);
    if (!nazev) return;
    const klic = `${nazev}|${t(r['Registrační číslo projektu'])}|${t(r['Zahájení realizace projektu'])}`;
    if (seen.has(klic)) {
      duplicit++;
      return;
    }
    seen.add(klic);
    out.push({
      id: `u${i + 1}`,
      nazev,
      stav: 'ukonceno',
      popis: t(r['Cíl projektu']),
      typ: '',
      oblast: t(r['Oblast projektu']),
      program: t(r['Operační program']) || t(r['Spolufinancování']),
      vyzva: '',
      regCislo: t(r['Registrační číslo projektu']),
      role: t(r['Role Karlovarského kraje']),
      vydaje: null,
      dotace: null,
      od: parseDatum(r['Zahájení realizace projektu']),
      do: parseDatum(r['Ukončení realizace projektu']),
      web: web(r['Webová stránka']),
    });
  });
  return { projekty: out, duplicit };
}

export function strategie(rows: Radek[]): Strategie[] {
  return rows
    .filter((r) => t(r['název_dokumentu']))
    .map((r, i) => {
      const od = Number(t(r['rok_zahájení_platnosti']));
      const doo = Number(t(r['rok_ukončení_platnosti']));
      return {
        id: `s${i + 1}`,
        nazev: t(r['název_dokumentu']),
        druh: t(r['druh_dokumentu']),
        legislativa: t(r['výchozí_legislativa']),
        od: Number.isInteger(od) && od > 1900 ? od : null,
        do: Number.isInteger(doo) && doo > 1900 ? doo : null,
        oblasti: t(r['oblast_působnosti'])
          .split(';')
          .map((x) => x.trim())
          .filter(Boolean),
        web: web(r['webová_stránka_karlovarský_kraj']) || web(r['webová_stránka_databáze_strategií_čr']),
      };
    })
    .sort((a, b) => (b.do ?? 0) - (a.do ?? 0) || a.nazev.localeCompare(b.nazev, 'cs'));
}

/** Kontrola konzistence: „aktuální“ projekty s plánovaným koncem v minulosti apod. */
export function kontrolaProjektu(aktualni: Projekt[], dnes: string): string[] {
  const chyby: string[] = [];
  for (const p of aktualni) {
    if (p.do && p.do.length === 10 && p.do < dnes) {
      chyby.push(`Aktuální projekty: „${p.nazev}“ měl skončit ${formatDatum(p.do)}, ale je stále mezi aktuálními.`);
    }
    if (p.vydaje === null) chyby.push(`Aktuální projekty: „${p.nazev}“ nemá uvedené výdaje.`);
  }
  return chyby;
}

// --- výpočty pro UI ---------------------------------------------------------------

export function formatDatum(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : d;
}

/** Krátký zápis peněz: 824 000 000 → „824 mil. Kč“, 1 200 000 000 → „1,2 mld. Kč“. */
export function kc(n: number | null, kratce = true): string {
  if (n === null) return '—';
  const f = (x: number, d: number) => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: d }).format(x);
  if (kratce && n >= 1e9) return `${f(n / 1e9, 1)} mld. Kč`;
  if (kratce && n >= 1e6) return `${f(n / 1e6, n >= 1e8 ? 0 : 1)} mil. Kč`;
  if (kratce && n >= 1e4) return `${f(n / 1e3, 0)} tis. Kč`;
  return `${f(n, 0)} Kč`;
}

/** Jak daleko je projekt v čase (0–1); null když chybí přesná data. */
export function prubeh(p: Pick<Projekt, 'od' | 'do'>, dnes: string): number | null {
  const od = p.od.length === 4 ? `${p.od}-01-01` : p.od;
  const doo = p.do.length === 4 ? `${p.do}-12-31` : p.do;
  if (!od || !doo) return null;
  const a = Date.parse(od);
  const b = Date.parse(doo);
  const c = Date.parse(dnes);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.max(0, Math.min(1, (c - a) / (b - a)));
}

export function platiVRoce(s: Pick<Strategie, 'od' | 'do'>, rok: number): boolean {
  return (s.od === null || s.od <= rok) && (s.do === null || s.do >= rok);
}

// --- vouchery ---------------------------------------------------------------------

export type VoucherTyp = 'inovacni' | 'kreativni' | 'asistencni' | 'startovaci';

export const VOUCHER_TYP: Record<VoucherTyp, { nazev: string; popis: string }> = {
  inovacni: { nazev: 'Inovační vouchery', popis: 'nákup služeb od výzkumných organizací' },
  kreativni: { nazev: 'Kreativní vouchery', popis: 'spolupráce s kreativci – design, marketing, web' },
  asistencni: { nazev: 'Asistenční vouchery', popis: 'odborné poradenství pro firmy' },
  startovaci: { nazev: 'Startovací vouchery', popis: 'podpora začínajících podnikatelů' },
};

export interface Voucher {
  id: string;
  nazev: string;
  typ: VoucherTyp;
  rok: number | null;
  pozadovano: number;
  prideleno: number;
  uspesna: boolean;
  obec: string;
  orp: string;
}

export function vouchery(features: PointFeature[]): Voucher[] {
  return features.map((f) => {
    const a = f.attrs;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    return {
      id: f.id,
      nazev: f.name,
      typ: (String(a.typ) as VoucherTyp) in VOUCHER_TYP ? (String(a.typ) as VoucherTyp) : 'inovacni',
      rok: typeof a.rok === 'number' && Number.isFinite(a.rok) ? a.rok : null,
      pozadovano: num(a.pozadovano),
      prideleno: num(a.prideleno),
      uspesna: a.uspesna === true,
      obec: f.obec,
      orp: f.orp,
    };
  });
}

export interface VoucherSouhrn {
  zadosti: number;
  uspesne: number;
  prideleno: number;
  pozadovano: number;
}

export function souhrn(v: Voucher[]): VoucherSouhrn {
  return {
    zadosti: v.length,
    uspesne: v.filter((x) => x.uspesna).length,
    prideleno: v.reduce((s, x) => s + (x.uspesna ? x.prideleno : 0), 0),
    pozadovano: v.reduce((s, x) => s + x.pozadovano, 0),
  };
}

/** Přidělené částky a počty úspěšných žádostí podle klíče (rok, typ, ORP…), seřazené podle klíče. */
export function podle<K extends string | number>(v: Voucher[], klic: (x: Voucher) => K | null): { klic: K; prideleno: number; pocet: number }[] {
  const m = new Map<K, { klic: K; prideleno: number; pocet: number }>();
  for (const x of v) {
    if (!x.uspesna) continue;
    const k = klic(x);
    if (k === null || k === '') continue;
    const g = m.get(k) ?? { klic: k, prideleno: 0, pocet: 0 };
    g.prideleno += x.prideleno;
    g.pocet++;
    m.set(k, g);
  }
  return [...m.values()];
}
