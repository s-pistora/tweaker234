// Adaptér datazapad.cz (ArcGIS Hub, Karlovarský kraj) – Task 4.
//
// Zdroj: https://www.datazapad.cz/api/download/v1/items/<id>/csv?layers=N  (302 -> hub.arcgis.com)
// Pasti: CSV je UTF-8 s BOM, čárkou oddělené; sloupec "Zápis vektorové geometrie" (WKT) má
// lat/lon PROHOZENÉ – nikdy se z něj nečte, vždy se bere ze samostatných WGS84 sloupců.
import Papa from 'papaparse';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { PointFeature, PointLayer, SourceEntry } from '../../src/lib/types.ts';
import type { SourceAdapter, SourceContext, SourceResult } from './types.ts';

/** Identifikátor jednoho staženého CSV souboru (ne nutně finální PointLayer – vouchery a
 *  zdravotnictví-kraj slučují víc těchto podtypů do jedné vrstvy). */
export type DzDatasetId =
  | 'skoly'
  | 'zastavky'
  | 'socialni'
  | 'vch-inovacni'
  | 'vch-kreativni'
  | 'vch-asistencni'
  | 'vch-start2023'
  | 'vch-start2024'
  | 'nemocnice'
  | 'pohotovost'
  | 'zzs';

const KV_KRAJ = 'CZ041';

function num(v: string | undefined): number {
  if (v === undefined || v === '') return Number.NaN;
  const n = Number(v.replace(',', '.').trim());
  return n;
}

function bool(v: string | undefined): boolean {
  return (v ?? '').trim().toLowerCase() === 'true';
}

/** Odstraní BOM a naparsuje CSV se záhlavím (ořezaným – některé exporty mají koncové mezery). */
function parseCsv(text: string): Record<string, string>[] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const res = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return res.data;
}

interface Cols {
  id: string;
  name: (r: Record<string, string>) => string;
  krajCode?: string; // sloupec s kódem kraje, filtruje se na KV_KRAJ
  krajText?: string; // alternativně textový název kraje (ZZS nemá kódy)
  krajTextValue?: string;
  orpCode?: string; // '' pokud dataset kód ORP neobsahuje
  obecCode?: string; // '' pokud dataset kód obce neobsahuje
  lon: string;
  lat: string;
  attrs: (r: Record<string, string>) => Record<string, string | number | boolean>;
}

const COLS: Record<DzDatasetId, Cols> = {
  skoly: {
    id: 'Objekt ID',
    name: (r) => r['Název'] ?? '',
    krajCode: 'Kód vyššího územně samosprávného celku',
    orpCode: 'Kód obce s rozšířenou působností',
    obecCode: 'Kód obce',
    lon: 'Zeměpisná délka v souřadnicovém systému WGS84',
    lat: 'Zeměpisná šířka v souřadnicovém systému WGS84',
    attrs: (r) => {
      const typy: string[] = [];
      if (bool(r['Mateřská škola'])) typy.push('MŠ');
      if (bool(r['Základní škola'])) typy.push('ZŠ');
      if (bool(r['Střední škola'])) typy.push('SŠ');
      if (bool(r['Vyšší odborná škola'])) typy.push('VOŠ');
      if (bool(r['Základní umělecká škola'])) typy.push('ZUŠ');
      if (bool(r['Dům dětí a mládeže'])) typy.push('DDM');
      if (bool(r['Ostatní'])) typy.push('ostatní');
      return { typ: typy.join(',') };
    },
  },
  zastavky: {
    id: 'Objekt ID',
    name: (r) => r['Název'] ?? '',
    krajCode: 'Kód vyššího územního samosprávného celku dle číselníku ČSÚ',
    orpCode: 'Kód správního obvodu obce s rozšířenou působností dle číselníku',
    obecCode: 'Kód obce dle číselníku ČSÚ',
    lon: 'Zeměpisná délka v souřadnicovém systému WGS84',
    lat: 'Zeměpisná šířka v souřadnicovém systému WGS84',
    attrs: (r) => ({
      cisloZastavky: num(r['Číslo zastávky']),
      stanoviste: num(r['Stanoviště']),
    }),
  },
  socialni: {
    id: 'objekt_id',
    name: (r) => r['poskytovatel_sociální_služby'] ?? '',
    krajCode: 'kód_vyššího_územně_samosprávného_celku',
    orpCode: 'kód_obce_s_rozšířenou_působností',
    obecCode: 'kód_obce',
    lon: 'zeměpisná_délka_v_souřadnicovém_systému_wgs84',
    lat: 'zeměpisná_šířka_v_souřadnicovém_systému_wgs84',
    attrs: (r) => ({ druh: r['druh_sociální_služby'] ?? '' }),
  },
  'vch-inovacni': {
    id: 'Objekt ID',
    name: (r) => r['Název projektu'] || r['Název společnosti'] || '',
    krajCode: 'Kód VÚSC',
    orpCode: 'Kód ORP',
    obecCode: 'Kód obce',
    lon: 'Zeměpisná délka v souřadnicovém systému WGS84',
    lat: 'Zeměpisná šířka v souřadnicovém systému WGS84',
    attrs: (r) => ({
      typ: 'inovacni',
      rok: num(r['Rok podání žádosti']),
      pozadovano: num(r['Požadované finanční prostředky']),
      prideleno: num(r['Přidělený finanční příspěvek']) || 0,
      uspesna: bool(r['Úspěšná žádost']),
    }),
  },
  'vch-kreativni': {
    id: 'Objekt ID',
    name: (r) => r['Název projektu'] || r['Název společnosti'] || '',
    krajCode: 'Kód VÚSC',
    orpCode: 'Kód ORP',
    obecCode: 'Kód obce',
    lon: 'Zeměpisná délka v souřadnicovém systému WGS84',
    lat: 'Zeměpisná šířka v souřadnicovém systému WGS84',
    attrs: (r) => ({
      typ: 'kreativni',
      rok: num(r['Rok podání žádosti']),
      pozadovano: num(r['Požadované finanční prostředky']),
      prideleno: num(r['Přidělený finanční příspěvek']) || 0,
      uspesna: bool(r['Přidělení podpory']),
    }),
  },
  'vch-asistencni': {
    id: 'Objekt ID',
    name: (r) => r['Název projektu'] || r['Název společnosti'] || '',
    krajCode: 'Kód VÚSC',
    orpCode: 'Kód ORP',
    obecCode: 'Kód obce',
    lon: 'Zeměpisná délka v souřadnicovém systému WGS84',
    lat: 'Zeměpisná šířka v souřadnicovém systému WGS84',
    attrs: (r) => ({
      typ: 'asistencni',
      rok: num(r['Rok podání žádosti']),
      pozadovano: num(r['Požadovaný finanční příspěvek']),
      prideleno: num(r['Udělený finanční příspěvek']) || 0,
      uspesna: bool(r['Úspěšný']),
    }),
  },
  'vch-start2023': {
    id: 'Objekt ID',
    name: (r) => r['Název projektu'] || r['Název společnosti'] || '',
    krajCode: 'Kód vyššího územně samosprávného celku',
    orpCode: 'Kód obce s rozšířenou působností',
    obecCode: 'Kód obce',
    lon: 'Zeměpisná délka v souřadnicovém systému WGS84',
    lat: 'Zeměpisná šířka v souřadnicovém systému WGS84',
    attrs: (r) => ({
      typ: 'startovaci',
      rok: num(r['Rok podání žádosti']),
      pozadovano: num(r['Požadovaný finanční příspěvek']),
      prideleno: num(r['Udělený finanční příspěvek']) || 0,
      uspesna: bool(r['Úspěšný']),
    }),
  },
  'vch-start2024': {
    id: 'Objekt ID',
    name: (r) => r['Název projektu'] || r['Název společnosti'] || '',
    krajCode: 'Kód vyššího územně samosprávného celku',
    orpCode: 'Kód obce s rozšířenou působností',
    obecCode: 'Kód obce',
    lon: 'Zeměpisná délka v souřadnicovém systému WGS84',
    lat: 'Zeměpisná šířka v souřadnicovém systému WGS84',
    attrs: (r) => ({
      typ: 'startovaci',
      rok: num(r['Rok podání žádosti']),
      pozadovano: num(r['Požadovaný finanční příspěvek']),
      prideleno: num(r['Udělený finanční příspěvek']) || 0,
      uspesna: bool(r['Úspěšný']),
    }),
  },
  nemocnice: {
    id: 'Objekt ID',
    name: (r) => r['Název nemocnice'] ?? '',
    krajCode: 'Kód vyššího územně samosprávného celku',
    orpCode: 'Kód obce s rozšířenou působností',
    obecCode: 'Kód obce',
    lon: 'Zeměpisná délka v souřadnicovém systému WGS84',
    lat: 'Zeměpisná šířka v souřadnicovém systému WGS84',
    attrs: (r) => ({ typ: 'nemocnice', zrizovatel: r['Zřizovatel nemocnice'] ?? '' }),
  },
  pohotovost: {
    id: 'OBJEKT ID',
    name: (r) => r['Název zařízení pohotovostní služby'] ?? '',
    krajCode: 'Kód vyššího územně samosprávného celku',
    orpCode: 'Kód obce s rozšířenou působností',
    obecCode: 'Kód obce',
    lon: 'Zeměpisná délka v souřadnicovém systému WGS84',
    lat: 'Zeměpisná šířka v souřadnicovém systému WGS84',
    attrs: (r) => ({
      typ: 'pohotovost',
      druh: r['Typ pohotovostní služby'] ?? '',
      cilovaSkupina: r['Cílová skupina'] ?? '',
    }),
  },
  zzs: {
    id: 'objectid',
    name: (r) => r['vyjezdovazakladna'] ?? '',
    krajText: 'kraj',
    krajTextValue: 'Karlovarský',
    // ZZS export nemá kódy ORP/obec – ponecháváme prázdné (viz README/report).
    lon: 'n',
    lat: 'e',
    attrs: (r) => ({
      typ: 'zzs',
      provoznidoba: r['provoznidoba'] ?? '',
      oblastnistredisko: r['oblastnistredisko'] ?? '',
    }),
  },
};

/** Naparsuje jeden stažený CSV soubor datazapad.cz a vrátí body filtrované na Karlovarský kraj. */
export function parseDzCsv(text: string, layerId: DzDatasetId): PointFeature[] {
  const cfg = COLS[layerId];
  const rows = parseCsv(text);
  const out: PointFeature[] = [];
  let missingOrp = 0;
  for (const r of rows) {
    if (cfg.krajCode) {
      if (r[cfg.krajCode] !== KV_KRAJ) continue;
    } else if (cfg.krajText) {
      if ((r[cfg.krajText] ?? '').trim() !== cfg.krajTextValue) continue;
    }
    const lon = num(r[cfg.lon]);
    const lat = num(r[cfg.lat]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const orp = cfg.orpCode ? (r[cfg.orpCode] ?? '').trim() : '';
    const obec = cfg.obecCode ? (r[cfg.obecCode] ?? '').trim() : '';
    if (cfg.orpCode && !orp) missingOrp++;
    out.push({
      id: `${layerId}-${r[cfg.id] ?? out.length}`,
      name: cfg.name(r),
      lon,
      lat,
      obec,
      orp,
      attrs: cfg.attrs(r),
    });
  }
  if (missingOrp > 0) {
    console.warn(`[datazapad:${layerId}] ${missingOrp} prvků bez kódu ORP (ponecháno orp='')`);
  }
  return out;
}

async function fetchDzCsv(itemId: string, layers: number, rawDir: string, name: string): Promise<string> {
  const url = `https://www.datazapad.cz/api/download/v1/items/${itemId}/csv?layers=${layers}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url);
    const text = await res.text();
    // ArcGIS Hub cache generuje soubor asynchronně – JSON {"status":"Pending"} znamená "zkus znovu".
    if (text.trimStart().startsWith('{')) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(`${rawDir}/${name}.csv`, text, 'utf8');
    return text;
  }
  throw new Error(`datazapad: ${url} – vyčerpány pokusy o stažení (stále "Pending")`);
}

function makeLayer(id: string, label: string, sourceId: string, validFor: string, features: PointFeature[]): PointLayer {
  return { id, label, sourceId, validFor, features };
}

function simpleAdapter(
  sourceId: string,
  layerId: string,
  label: string,
  itemId: string,
  layers: number,
  dzDataset: DzDatasetId,
  title: string,
  license: string,
): SourceAdapter {
  return {
    id: sourceId,
    async run(ctx: SourceContext): Promise<SourceResult> {
      const text = await fetchDzCsv(itemId, layers, `${ctx.rawDir}/${sourceId}`, dzDataset);
      const features = parseDzCsv(text, dzDataset);
      const validFor = String(ctx.now.getFullYear());
      const source: SourceEntry = {
        id: sourceId,
        provider: 'Karlovarský kraj (datazapad.cz / ArcGIS Hub)',
        title,
        url: `https://www.datazapad.cz/api/download/v1/items/${itemId}/csv?layers=${layers}`,
        license,
        downloadedAt: ctx.now.toISOString(),
        validFor,
        status: 'ok',
      };
      return { source, points: [makeLayer(layerId, label, sourceId, validFor, features)] };
    },
  };
}

const dzSkoly = simpleAdapter(
  'dz-skoly',
  'skoly',
  'Školy a školská zařízení do stupně VOŠ',
  '11796bcb67ee47bd8d38c0ec271b2787',
  3,
  'skoly',
  'Seznam škol a školských zařízení do stupně VOŠ v Karlovarském kraji',
  'CC0 1.0',
);

const dzSocialni = simpleAdapter(
  'dz-socialni',
  'socialni',
  'Poskytovatelé sociálních služeb',
  '8a71d71444f14acd8d43023ce9c3fb95',
  0,
  'socialni',
  'Poskytovatelé sociálních služeb v Karlovarském kraji',
  'CC0 1.0',
);

const dzZastavky = simpleAdapter(
  'dz-zastavky',
  'zastavky',
  'Autobusové zastávky',
  '979283f4b7ec4b778b8eed7aab6917c3',
  0,
  'zastavky',
  'Autobusové zastávky v Karlovarském kraji',
  'CC BY 4.0',
);

interface VoucherSub {
  itemId: string;
  layers: number;
  dzDataset: DzDatasetId;
  title: string;
}

const VOUCHER_SUBS: VoucherSub[] = [
  { itemId: 'b59dc439b86147e4aefba8d94fc6aa9e', layers: 3, dzDataset: 'vch-inovacni', title: 'Inovační vouchery 2020 - 2022' },
  { itemId: '387d1403bddb48b09ba4e3cd3b7894f8', layers: 0, dzDataset: 'vch-kreativni', title: 'Kreativní vouchery 2020 - 2022' },
  { itemId: '6cd2b71c45184327aab9375661268f5d', layers: 3, dzDataset: 'vch-asistencni', title: 'Asistenční vouchery 2020 - 2022 v Karlovarském kraji' },
  { itemId: '7974da466d594bdea7953f3542ef5ca9', layers: 3, dzDataset: 'vch-start2023', title: 'Startovací vouchery v Karlovarském kraji v roce 2023' },
  { itemId: '2ec6469e9f76487f8325504d8313a5f3', layers: 3, dzDataset: 'vch-start2024', title: 'Startovací vouchery v Karlovarském kraji v roce 2024' },
];

/**
 * Rozsah let udelovani vouchery ("2012" nebo "2012–2024") z attrs.rok napric prvky.
 * Fallback na `fallback` (rok stazeni), kdyz zadny prvek platny rok nema.
 */
export function voucherYearRange(features: PointFeature[], fallback: string): string {
  const roky = features
    .map((f) => f.attrs.rok)
    .filter((y): y is number => typeof y === 'number' && Number.isInteger(y) && y > 1900);
  if (!roky.length) return fallback;
  const min = Math.min(...roky);
  const max = Math.max(...roky);
  return min === max ? String(min) : `${min}–${max}`;
}

const dzVouchery: SourceAdapter = {
  id: 'dz-vouchery',
  async run(ctx: SourceContext): Promise<SourceResult> {
    const validFor = String(ctx.now.getFullYear());
    const allFeatures: PointFeature[] = [];
    for (const sub of VOUCHER_SUBS) {
      const text = await fetchDzCsv(sub.itemId, sub.layers, `${ctx.rawDir}/dz-vouchery`, sub.dzDataset);
      allFeatures.push(...parseDzCsv(text, sub.dzDataset));
    }
    // Vrstva sama je "platna" pro roky udeleni vouchery (data), ne pro rok stazeni registru
    // (viz review finding #5) - zdrojovy zaznam (SourceEntry) si download-rok ponechava.
    const layerValidFor = voucherYearRange(allFeatures, validFor);
    const primary = VOUCHER_SUBS[0]!;
    const source: SourceEntry = {
      id: 'dz-vouchery',
      provider: 'Karlovarský kraj (datazapad.cz / ArcGIS Hub)',
      title: 'Vouchery Karlovarského kraje (inovační, kreativní, asistenční, startovací 2023/2024)',
      url: `https://www.datazapad.cz/api/download/v1/items/${primary.itemId}/csv?layers=${primary.layers}`,
      license: 'CC BY 4.0',
      downloadedAt: ctx.now.toISOString(),
      validFor,
      status: 'ok',
      note: VOUCHER_SUBS.map(
        (s) => `${s.title}: https://www.datazapad.cz/api/download/v1/items/${s.itemId}/csv?layers=${s.layers} (CC BY 4.0)`,
      ).join(' | '),
    };
    return { source, points: [makeLayer('vouchery', 'Vouchery', 'dz-vouchery', layerValidFor, allFeatures)] };
  },
};

interface HealthSub {
  itemId: string;
  layers: number;
  dzDataset: DzDatasetId;
  title: string;
  license: string;
}

const HEALTH_SUBS: HealthSub[] = [
  { itemId: '03dbe5719ab64960ae70ee90af4790c6', layers: 3, dzDataset: 'nemocnice', title: 'Nemocnice v Karlovarském kraji', license: 'CC BY 4.0' },
  { itemId: '72aa9de6abc94f949f3959e70e0d241d', layers: 0, dzDataset: 'pohotovost', title: 'Lékařská a lékárenská pohotovostní služba v Karlovarském kraji', license: 'CC0 1.0' },
  { itemId: '4d7d80fc1d5f4f6bbb61a10b26d2a2aa', layers: 0, dzDataset: 'zzs', title: 'Výjezdové základny zdravotnické záchranné služby v Karlovarském kraji', license: 'CC0 1.0' },
];

const dzZdravotnictviKraj: SourceAdapter = {
  id: 'dz-zdravotnictvi-kraj',
  async run(ctx: SourceContext): Promise<SourceResult> {
    const validFor = String(ctx.now.getFullYear());
    const allFeatures: PointFeature[] = [];
    for (const sub of HEALTH_SUBS) {
      const text = await fetchDzCsv(sub.itemId, sub.layers, `${ctx.rawDir}/dz-zdravotnictvi-kraj`, sub.dzDataset);
      allFeatures.push(...parseDzCsv(text, sub.dzDataset));
    }
    const primary = HEALTH_SUBS[0]!;
    const source: SourceEntry = {
      id: 'dz-zdravotnictvi-kraj',
      provider: 'Karlovarský kraj (datazapad.cz / ArcGIS Hub)',
      title: 'Zdravotnictví Karlovarského kraje (nemocnice, pohotovost, výjezdové základny ZZS)',
      url: `https://www.datazapad.cz/api/download/v1/items/${primary.itemId}/csv?layers=${primary.layers}`,
      license: 'CC BY 4.0',
      downloadedAt: ctx.now.toISOString(),
      validFor,
      status: 'ok',
      note: HEALTH_SUBS.map(
        (s) => `${s.title}: https://www.datazapad.cz/api/download/v1/items/${s.itemId}/csv?layers=${s.layers} (${s.license})`,
      ).join(' | ') + ' | ZZS export neobsahuje kódy ORP/obce, orp i obec proto ponechány jako "".',
    };
    return { source, points: [makeLayer('zdravotnictvi-kraj', 'Zdravotnictví kraje', 'dz-zdravotnictvi-kraj', validFor, allFeatures)] };
  },
};

export const datazapadAdapters: SourceAdapter[] = [dzSkoly, dzSocialni, dzZastavky, dzVouchery, dzZdravotnictviKraj];
