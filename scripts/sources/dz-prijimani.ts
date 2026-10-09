// Adaptér „Záměr počtu přijímaných uchazečů středních škol v Karlovarském kraji“ (datazapad.cz)
// pro režim „Kam na střední“. Tři sady (2024/25, 2025/26, 2026/27) mají každá jiné záhlaví
// (IZO vs. „Identifikační znak organizace“, překlep „Froma vzdělávání“, koncové mezery u souřadnic –
// ty řeší ořez v parseCsv), proto má každý rok vlastní mapování sloupců.
//
// Sloučení: klíč = IZO + kód oboru + forma vzdělávání. Údaje o škole (název, adresa, souřadnice)
// se berou z nejnovějšího roku, kde obor je. „Nově přijatí k 30.9.2025“ obsahuje jen sada 2026/27.
import type { Obor, PointFeature, SourceEntry } from '../../src/lib/types.ts';
import { skupinaZKodu, typStudia, vzdalenostKm } from '../../src/lib/skoly.ts';
import { fetchDzCsv, parseCsv } from './datazapad.ts';

interface RokCfg {
  rok: number;
  itemId: string;
  layers: number;
  title: string;
  izo: string;
  zamer: string;
  prijato?: string;
  forma: string;
  web: string;
  orp: string;
  kraj: string;
}

const KV_KRAJ = 'CZ041';

export const ROKY: RokCfg[] = [
  {
    rok: 2024,
    itemId: '6f9302623bcd4a72af2ac674c3b46adf',
    layers: 0,
    title: 'Záměr počtu přijímaných uchazečů středních škol v Karlovarském kraji pro školní rok 2024/2025',
    izo: 'IZO ředitelství',
    zamer: 'Záměr počtu přijímaných uchazečů',
    forma: 'Forma vzdělávání',
    web: 'Webová stránka',
    orp: 'Kód ORP',
    kraj: 'Kód VÚSC',
  },
  {
    rok: 2025,
    itemId: 'b69266abf22c4baa9fabeb437449c1e8',
    layers: 0,
    title: 'Záměr počtu přijímaných uchazečů středních škol v Karlovarském kraji pro školní rok 2025/2026',
    izo: 'IZO ředitelství',
    zamer: 'Záměr počtu přijímaných uchazečů',
    forma: 'Froma vzdělávání',
    web: 'Webová stránka školy',
    orp: 'Kód ORP',
    kraj: 'Kód VÚSC',
  },
  {
    rok: 2026,
    itemId: '9332e5a45e0d4dd999bef99a6f51fd40',
    layers: 0,
    title: 'Záměr počtu přijímaných uchazečů středních škol v Karlovarském kraji pro školní rok 2026/2027',
    izo: 'Identifikační znak organizace',
    zamer: 'Předběžný záměr počtu přijímaných uchazečů 2026/2027',
    prijato: 'Nově přijatí k 30.9.2025',
    forma: 'Forma vzdělávání',
    web: 'Webové stránky školy',
    orp: 'Kód obce s rozšířenou působností',
    kraj: 'Kód vyššího územně samosprávného celku',
  },
];

function int(v: string | undefined): number | null {
  const s = (v ?? '').trim();
  if (s === '') return null;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function num(v: string | undefined): number {
  const s = (v ?? '').trim();
  return s === '' ? Number.NaN : Number(s.replace(',', '.'));
}

/** '23-68/H/01' (překlep v datech) → '23-68-H/01'; ořez mezer. */
/** Úklid textu z exportu: zdvojené uvozovky a mezery, rovné uvozovky → české „…“. */
export function vycistiText(s: string): string {
  let t = s.replace(/"{2,}/g, '"').replace(/\s{2,}/g, ' ').trim();
  let open = true;
  t = t.replace(/"/g, () => {
    const q = open ? '„' : '“';
    open = !open;
    return q;
  });
  return t;
}

export function normalizujKod(kod: string): string {
  return kod.trim().replace(/^(\d{2}-\d{2})\/([A-Z])\//, '$1-$2/');
}

export interface RadekRoku {
  rok: number;
  klic: string;
  zamer: number | null;
  prijato: number | null;
  zaklad: Omit<Obor, 'zamer' | 'prijato2025' | 'zastavky500m' | 'nejblizsiZastavkaM'>;
}

/** Naparsuje CSV jednoho roku; řádky mimo Karlovarský kraj nebo bez souřadnic přeskočí. */
export function parseRok(text: string, cfg: RokCfg): RadekRoku[] {
  const out: RadekRoku[] = [];
  for (const r of parseCsv(text)) {
    const kraj = (r[cfg.kraj] ?? '').trim();
    if (kraj && kraj !== KV_KRAJ) continue;
    const lon = num(r['Zeměpisná délka v souřadnicovém systému WGS84']);
    const lat = num(r['Zeměpisná šířka v souřadnicovém systému WGS84']);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const izo = (r[cfg.izo] ?? '').trim();
    const kodOboru = normalizujKod(r['Kód oboru'] ?? '');
    if (!izo || !kodOboru) continue;
    const forma = (r[cfg.forma] ?? '').trim();
    const druh = (r['Druh vzdělávání'] ?? '').trim();
    out.push({
      rok: cfg.rok,
      klic: `${izo}|${kodOboru}|${forma}`,
      zamer: int(r[cfg.zamer]),
      prijato: cfg.prijato ? int(r[cfg.prijato]) : null,
      zaklad: {
        izo,
        skola: vycistiText(r['Název školy'] ?? ''),
        web: (r[cfg.web] ?? '').trim(),
        obec: (r['Název obce'] ?? '').trim(),
        kodObce: (r['Kód obce'] ?? '').trim(),
        orp: (r[cfg.orp] ?? '').trim(),
        lon,
        lat,
        kodOboru,
        nazevOboru: vycistiText(r['Název oboru'] ?? ''),
        skupina: skupinaZKodu(kodOboru),
        typ: typStudia(druh, kodOboru),
        druh,
        delka: (r['Délka vzdělávání'] ?? '').trim(),
        forma,
      },
    });
  }
  return out;
}

/** Sloučí řádky všech roků do oborů. Při duplicitním klíči v jednom roce se záměry sčítají. */
export function slucRoky(radky: RadekRoku[]): Obor[] {
  const m = new Map<string, Obor & { _rok: number }>();
  for (const r of [...radky].sort((a, b) => a.rok - b.rok)) {
    let o = m.get(r.klic);
    if (!o) {
      o = { ...r.zaklad, zamer: {}, prijato2025: null, zastavky500m: 0, nejblizsiZastavkaM: null, _rok: r.rok };
      for (const c of ROKY) o.zamer[c.rok] = null;
      m.set(r.klic, o);
    } else if (r.rok >= o._rok) {
      Object.assign(o, r.zaklad, { _rok: r.rok });
    }
    if (r.zamer !== null) o.zamer[r.rok] = (o.zamer[r.rok] ?? 0) + r.zamer;
    if (r.rok === 2026 && r.prijato !== null) o.prijato2025 = (o.prijato2025 ?? 0) + r.prijato;
  }
  return [...m.values()].map(({ _rok, ...o }) => o);
}

/** Doplní ke každému oboru počet zastávek do 500 m a vzdálenost k nejbližší (v metrech). */
export function doplnZastavky(obory: Obor[], zastavky: PointFeature[]): void {
  const cache = new Map<string, { n: number; min: number | null }>();
  for (const o of obory) {
    const k = `${o.lat},${o.lon}`;
    let c = cache.get(k);
    if (!c) {
      let n = 0;
      let min = Infinity;
      for (const z of zastavky) {
        const m = vzdalenostKm(o.lat, o.lon, z.lat, z.lon) * 1000;
        if (m <= 500) n++;
        if (m < min) min = m;
      }
      c = { n, min: Number.isFinite(min) ? Math.round(min) : null };
      cache.set(k, c);
    }
    o.zastavky500m = c.n;
    o.nejblizsiZastavkaM = c.min;
  }
}

export function zdrojRoku(cfg: RokCfg, now: Date): SourceEntry {
  return {
    id: `dz-prijimani-${cfg.rok}`,
    provider: 'Karlovarský kraj (datazapad.cz / ArcGIS Hub)',
    title: cfg.title,
    url: `https://www.datazapad.cz/api/download/v1/items/${cfg.itemId}/csv?layers=${cfg.layers}`,
    license: 'CC0 1.0',
    downloadedAt: now.toISOString(),
    validFor: `${cfg.rok}/${cfg.rok + 1}`,
    status: 'ok',
  };
}

/** Stáhne všechny tři roky (surová CSV uloží do `rawDir`). */
export async function stahniRoky(rawDir: string): Promise<RadekRoku[]> {
  const out: RadekRoku[] = [];
  for (const cfg of ROKY) {
    const text = await fetchDzCsv(cfg.itemId, cfg.layers, rawDir, `prijimani-${cfg.rok}`);
    const radky = parseRok(text, cfg);
    if (radky.length === 0) throw new Error(`dz-prijimani ${cfg.rok}: žádné řádky – změnilo se záhlaví?`);
    out.push(...radky);
  }
  return out;
}
