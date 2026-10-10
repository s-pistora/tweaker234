// Režim „Úřady“ – „Kam s tím na úřad?“: příslušné úřady pro obec Karlovarského kraje.
// Zdroj: DATAZÁPAD (Karlovarský kraj) – stavební úřady podle katastrálních území, obecní
// živnostenské úřady podle obcí, matriční úřady, seznam obcí (kontakty obecních úřadů).
// Čisté funkce: převod CSV řádků (datový skript) i výběr úřadů pro obec (frontend).

import type { AreaCode } from './types.ts';

export interface Kontakt {
  /** název úřadu, např. „Stavební úřad Aš“ */
  nazev: string;
  /** kde úřad sídlí / pod koho patří, např. „Městský úřad Aš“ */
  umisteni: string;
  odbor: string;
  adresa: string;
  tel: string;
  email: string;
  web: string;
  datovka: string;
  lat: number | null;
  lon: number | null;
}

export interface StavebniUrad extends Kontakt {
  /** katastrální území obce, pro která je úřad příslušný */
  katastry: string[];
}

export interface Matrika extends Kontakt {
  obec: string;
  dny: string;
  hodiny: string;
}

export interface UradyObce {
  kod: AreaCode;
  nazev: string;
  /** název obce s rozšířenou působností (sídlo ORP) */
  orp: string;
  obecniUrad: Kontakt;
  stavebni: StavebniUrad[];
  zivnostensky: Kontakt | null;
  /** upozornění k datům této obce (chybějící / opravené údaje) */
  poznamky: string[];
}

export interface UradyFile {
  updatedAt: string;
  sourceIds: string[];
  obce: UradyObce[];
  matriky: Matrika[];
  /** chyby nalezené ve zdrojových datech kraje (zpětná vazba pro DATAZÁPAD) */
  chybyDat: string[];
}

export function isUradyFile(x: unknown): x is UradyFile {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.updatedAt === 'string' &&
    Array.isArray(o.sourceIds) &&
    Array.isArray(o.matriky) &&
    Array.isArray(o.obce) &&
    o.obce.every(
      (u) =>
        typeof u === 'object' &&
        u !== null &&
        typeof (u as UradyObce).kod === 'string' &&
        typeof (u as UradyObce).nazev === 'string' &&
        Array.isArray((u as UradyObce).stavebni),
    )
  );
}

// --- převod řádků CSV (datový skript) -------------------------------------------

type Radek = Record<string, string>;

const t = (v: string | undefined) => (v ?? '').trim();

function cislo(v: string | undefined): number | null {
  const n = Number(t(v).replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** „mailto:x@y.cz“ → „x@y.cz“, „tel:+420…“ → „+420 …“ (čitelně po trojicích). */
export function vycistiKontakt(v: string): string {
  const s = v.trim().replace(/^mailto:/i, '').replace(/^tel:/i, '');
  const m = /^(\+420)?\s*(\d{3})\s*(\d{3})\s*(\d{3})$/.exec(s.replace(/\s+/g, ''));
  if (m) return `${m[1] ? '+420 ' : ''}${m[2]} ${m[3]} ${m[4]}`;
  return s;
}

function web(v: string | undefined): string {
  const s = t(v);
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** Stavební úřady podle katastrálních území → pro každou obec seskupené podle úřadu. */
export function stavebniPodleObci(rows: Radek[]): Map<AreaCode, StavebniUrad[]> {
  const out = new Map<AreaCode, StavebniUrad[]>();
  for (const r of rows) {
    const kod = t(r['kód_obce_katastráního_území']) || t(r['kód_obce_katastrálního_území']);
    const nazev = t(r['stavební_úřad']);
    if (!kod || !nazev) continue;
    const list = out.get(kod) ?? [];
    let u = list.find((x) => x.nazev === nazev);
    if (!u) {
      u = {
        nazev,
        umisteni: t(r['umístění_stavebního_úřadu']),
        odbor: t(r['název_odboru']),
        adresa: t(r['sídlo']),
        tel: '',
        email: '',
        web: web(r['webová_stránka']),
        datovka: t(r['id_datové_schránky']),
        lat: cislo(r['zeměpisná_šířka_v_souřadnicovém_systému_WGS84']),
        lon: cislo(r['zeměpisná_délka_v_souřadnicovém_systému_WGS84']),
        katastry: [],
      };
      list.push(u);
    }
    const ku = t(r['název_katastrálního_území']);
    if (ku && !u.katastry.includes(ku)) u.katastry.push(ku);
    out.set(kod, list);
  }
  for (const list of out.values()) for (const u of list) u.katastry.sort((a, b) => a.localeCompare(b, 'cs'));
  return out;
}

export interface ZivnoRadek {
  kod: AreaCode;
  obec: string;
  /** ORP, kde úřad sídlí */
  orp: string;
  kontakt: Kontakt;
}

export function zivnostenskeRadky(rows: Radek[]): ZivnoRadek[] {
  const out: ZivnoRadek[] = [];
  for (const r of rows) {
    const kod = t(r['kód']);
    const nazev = t(r['živnostenský_úřad']);
    if (!kod || !nazev) continue;
    out.push({ kod, obec: t(r['obec']), orp: t(r['název_obce_s_rozšířenou_působností']), kontakt: {
      nazev,
      umisteni: t(r['sídlo_úřadu']),
      odbor: t(r['název_odboru']),
      adresa: t(r['sídlo']),
      tel: vycistiKontakt(t(r['telefonní_kontakt']) || t(r['telefonní_kontakt_městský_úřad'])),
      email: vycistiKontakt(t(r['kontaktní_email'])),
      web: web(r['webová_stránka']),
      datovka: t(r['id_datové_schránky']),
      lat: cislo(r['y_zeměpisná_šířka_v_souřadnicovém_systému_WGS84']),
      lon: cislo(r['x_zeměpisná_délka_v_souřadnicovém_systému_WGS84']),
    } });
  }
  return out;
}

/** „Chodov (u Bečova)“ → „Chodov“ */
const zakladNazvu = (n: string) => n.replace(/\s*\(.*\)\s*$/, '').trim();

/** Seznam obcí → obecní úřad (kontakty) a název ORP. */
export function obecniUrady(rows: Radek[]): Map<AreaCode, { urad: Kontakt; orp: string }> {
  const out = new Map<AreaCode, { urad: Kontakt; orp: string }>();
  for (const r of rows) {
    const kod = t(r['kod']);
    const obec = t(r['nazev']);
    if (!kod || !obec) continue;
    const typ = t(r['nazevuradu']) || 'Obecní úřad';
    const psc = t(r['psc']);
    const posta = t(r['posta']);
    out.set(kod, {
      urad: {
        nazev: `${typ} ${obec}`,
        umisteni: obec,
        odbor: '',
        adresa: [t(r['ulice']), [psc, posta].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        tel: vycistiKontakt(t(r['telefonobce'])),
        email: t(r['mail']),
        web: web(r['wwwstranky']),
        datovka: t(r['datovka']),
        lat: null,
        lon: null,
      },
      // „Magistrát města|Karlovy Vary“ → „Karlovy Vary“
      orp: t(r['orp']).split('|').pop()?.trim() ?? '',
    });
  }
  return out;
}

export function matriky(rows: Radek[]): Matrika[] {
  return rows
    .filter((r) => t(r['nazev_uradu']))
    .map((r) => {
      const psc = t(r['psc']);
      const obec = t(r['nazev_obce']);
      const raw = t(r['nazev_uradu']);
      // v datech jen „Městský Úřad“ bez obce → „Městský úřad Cheb“; vojenský újezd nechat
      const typ = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      return {
        nazev: /újezd/i.test(raw) ? raw : `${typ} ${obec}`,
        umisteni: obec,
        odbor: 'Matrika',
        adresa: [t(r['nazev_ulice']), [psc.replace(/^(\d{3})(\d{2})$/, '$1 $2'), obec].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', '),
        tel: vycistiKontakt(t(r['telefon'])),
        email: t(r['e_podatelna']),
        web: '',
        datovka: '',
        lat: cislo(r['n']),
        lon: cislo(r['e']),
        obec,
        dny: t(r['uredni_dny']),
        hodiny: t(r['uredni_hodiny']),
      };
    });
}

/**
 * Sloučí všechny zdroje do záznamu pro každou obec ze seznamu obcí.
 * Živnostenské úřady: v datech kraje jsou chyby v kódech obcí (duplicitní / špatný kód),
 * proto se při neshodě páruje i podle názvu obce a ORP. Nalezené chyby se vrací v `chyby`.
 */
export function slozUrady(
  obce: Map<AreaCode, { urad: Kontakt; orp: string }>,
  stavebni: Map<AreaCode, StavebniUrad[]>,
  zivno: ZivnoRadek[],
): { obce: UradyObce[]; chyby: string[] } {
  const chyby: string[] = [];
  const kody = new Set(obce.keys());
  for (const z of zivno) {
    if (!kody.has(z.kod)) chyby.push(`Živnostenské úřady: obec ${z.obec} má neexistující kód obce ${z.kod}.`);
  }
  const dup = new Map<string, number>();
  for (const z of zivno) dup.set(z.kod, (dup.get(z.kod) ?? 0) + 1);
  for (const [kod, n] of dup) if (n > 1) chyby.push(`Živnostenské úřady: kód obce ${kod} je uveden ${n}× (u různých obcí).`);

  const vysledek = [...obce.entries()].map(([kod, o]): UradyObce => {
    const nazev = o.urad.umisteni;
    const poznamky: string[] = [];
    const kandidati = zivno.filter((z) => z.kod === kod);
    let z = kandidati.find((c) => c.orp === o.orp) ?? (kandidati.length === 1 ? kandidati[0] : undefined);
    if (!z || z.obec !== zakladNazvu(nazev)) {
      const podleNazvu = zivno.find((c) => c.obec === zakladNazvu(nazev) && c.orp === o.orp);
      if (podleNazvu && podleNazvu !== z) {
        z = podleNazvu;
        poznamky.push('Živnostenský úřad je v datech kraje uveden s chybným kódem obce – spárovali jsme ho podle názvu obce.');
      }
    }
    const st = stavebni.get(kod) ?? [];
    if (!st.length) {
      poznamky.push('Stavební úřad pro tuto obec v datech kraje chybí.');
      chyby.push(`Stavební úřady: chybí katastrální území obce ${nazev} (${kod}).`);
    }
    if (!z) chyby.push(`Živnostenské úřady: chybí obec ${nazev} (${kod}).`);
    return { kod, nazev, orp: o.orp, obecniUrad: o.urad, stavebni: st, zivnostensky: z?.kontakt ?? null, poznamky };
  });
  return { obce: vysledek.sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs')), chyby };
}

// --- výběr pro obec (frontend) -------------------------------------------------

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface MatrikaVyber {
  matrika: Matrika;
  /** matrika sídlí přímo v obci */
  vObci: boolean;
  /** vzdušná vzdálenost od středu obce v km (null = neznámá poloha) */
  km: number | null;
}

/**
 * Matrika pro obec: data neobsahují matriční obvody, takže vybíráme matriku v obci,
 * jinak nejbližší (vzdušně od středu obce). UI na to upozorní.
 */
export function matrikaProObec(
  nazevObce: string,
  stred: { lat: number; lon: number } | null,
  list: Matrika[],
): MatrikaVyber | null {
  // matrika v obci: stejný název (bez upřesnění v závorce), ne vojenský újezd, a když známe
  // polohu, tak opravdu blízko (dva Chodovy v kraji)
  const zaklad = nazevObce.replace(/\s*\(.*\)\s*$/, '').trim();
  const v = list.find(
    (m) =>
      m.obec === zaklad &&
      !/újezd/i.test(m.nazev) &&
      (!stred || m.lat === null || m.lon === null || km(stred, { lat: m.lat, lon: m.lon }) <= 6),
  );
  if (v) return { matrika: v, vObci: true, km: 0 };
  if (!stred) return null;
  let best: MatrikaVyber | null = null;
  for (const m of list) {
    if (m.lat === null || m.lon === null) continue;
    const d = km(stred, { lat: m.lat, lon: m.lon });
    if (!best || d < (best.km ?? Infinity)) best = { matrika: m, vObci: false, km: d };
  }
  return best;
}

const DNY: Record<string, string> = { PO: 'po', ÚT: 'út', ST: 'st', ČT: 'čt', PÁ: 'pá' };
const dny = (d: string) =>
  d
    .split('+')
    .map((x) => x.split('-').map((y) => DNY[y.trim()] ?? y.trim().toLowerCase()).join('–'))
    .join(', ');

/**
 * Úřední hodiny matriky jako řádky „po, st: 8.00–12.00, 13.00–17.00“.
 * V datech jsou dva formáty: dny zvlášť + jen časy, nebo dny přímo v textu hodin.
 */
export function uredniHodiny(denText: string, hodiny: string): string[] {
  const DEN = /^(?:PO|ÚT|ST|ČT|PÁ)(?:[+-](?:PO|ÚT|ST|ČT|PÁ))*$/u;
  const skupiny: { den: string; casy: string[] }[] = [];
  for (const tok of hodiny.split(/\s+/).filter(Boolean)) {
    if (DEN.test(tok)) skupiny.push({ den: tok, casy: [] });
    else {
      if (!skupiny.length) skupiny.push({ den: denText, casy: [] });
      skupiny[skupiny.length - 1].casy.push(tok.replace('-', '–'));
    }
  }
  const out = skupiny
    .filter((g) => g.casy.length)
    .map((g) => `${g.den ? `${dny(g.den)}: ` : ''}${g.casy.join(', ')}`);
  if (!out.length && denText) out.push(dny(denText));
  return out;
}

/** Úřad obce s rozšířenou působností = obecní úřad sídla ORP. */
export function uradOrp(obec: UradyObce, vsechny: UradyObce[]): Kontakt | null {
  return vsechny.find((o) => o.nazev === obec.orp)?.obecniUrad ?? null;
}

// --- životní situace ----------------------------------------------------------

export type UradTyp = 'obecni' | 'stavebni' | 'zivnostensky' | 'matrika' | 'orp';

export interface Situace {
  id: string;
  nazev: string;
  priklady: string;
  urad: UradTyp;
  /** krátké vysvětlení, proč právě tento úřad */
  proc: string;
}

export const SITUACE: Situace[] = [
  {
    id: 'stavba',
    nazev: 'Stavím nebo rekonstruuji',
    priklady: 'stavba domu, přístavba, demolice, změna užívání',
    urad: 'stavebni',
    proc: 'Stavební úřad je příslušný podle katastrálního území, kde stavba stojí.',
  },
  {
    id: 'podnikani',
    nazev: 'Začínám podnikat',
    priklady: 'ohlášení živnosti, změna údajů, přerušení živnosti',
    urad: 'zivnostensky',
    proc: 'Živnost můžete ohlásit na kterémkoli živnostenském úřadě – tady je ten pro vaši obec.',
  },
  {
    id: 'matrika',
    nazev: 'Svatba, narození, úmrtí',
    priklady: 'oddací, rodný a úmrtní list, změna jména',
    urad: 'matrika',
    proc: 'Matriční události vyřizuje matriční úřad.',
  },
  {
    id: 'doklady',
    nazev: 'Občanský průkaz nebo pas',
    priklady: 'nový občanský průkaz, cestovní pas',
    urad: 'orp',
    proc: 'Občanské průkazy a pasy vydávají úřady obcí s rozšířenou působností – nejblíž máte tento.',
  },
  {
    id: 'obec',
    nazev: 'Trvalý pobyt a poplatky',
    priklady: 'přihlášení k trvalému pobytu, poplatek za odpad, za psa',
    urad: 'obecni',
    proc: 'Trvalý pobyt a místní poplatky vyřizuje obecní úřad obce, kde bydlíte.',
  },
];

export const URAD_NAZEV: Record<UradTyp, string> = {
  obecni: 'Obecní úřad',
  stavebni: 'Stavební úřad',
  zivnostensky: 'Živnostenský úřad',
  matrika: 'Matrika',
  orp: 'Úřad obce s rozšířenou působností',
};

/** Odkaz do Mapy.cz na souřadnice nebo hledání adresy. */
export function odkazMapy(k: Pick<Kontakt, 'lat' | 'lon' | 'adresa' | 'nazev'>): string {
  if (k.lat !== null && k.lon !== null) {
    return `https://mapy.cz/zakladni?source=coor&id=${k.lon}%2C${k.lat}&x=${k.lon}&y=${k.lat}&z=17`;
  }
  return `https://mapy.cz/zakladni?q=${encodeURIComponent(k.adresa || k.nazev)}`;
}
