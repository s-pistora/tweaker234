// DATOVÝ KONTRAKT – sdílený mezi pipeline (scripts/) a frontendem (src/).
// Měnit smí jen koordinátor.

export type Level = 'kraj' | 'orp' | 'obec';

/** kraj: NUTS3 'CZ041'; orp: ČSÚ kód '4103'; obec: kód obce '554961' */
export type AreaCode = string;

export interface IndicatorDef {
  id: string;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  sourceId: string;
  decimals: number;
}

export interface IndicatorFile {
  level: Level;
  indicators: Record<string, IndicatorDef>;
  /** values[indikátor][kódÚzemí][rok] */
  values: Record<string, Record<AreaCode, Record<number, number | null>>>;
  /** hodnota / průměr ČR: national[indikátor][rok] */
  national?: Record<string, Record<number, number>>;
  /** průměr Karlovarského kraje (pro orp/obec): regional[indikátor][rok] */
  regional?: Record<string, Record<number, number>>;
}

export interface PointFeature {
  id: string;
  name: string;
  lon: number;
  lat: number;
  obec: AreaCode;
  orp: AreaCode;
  attrs: Record<string, string | number | boolean>;
}

export interface PointLayer {
  id: string;
  label: string;
  sourceId: string;
  validFor: string;
  features: PointFeature[];
}

export interface SourceEntry {
  id: string;
  provider: string;
  title: string;
  url: string;
  license: string;
  /** ISO datum stažení */
  downloadedAt: string;
  /** rok / období platnosti dat, např. "2024" nebo "2026-09" */
  validFor: string;
  status: 'ok' | 'stale';
  note?: string;
}

/** Vlastnosti prvků v TopoJSON objektu `areas`. */
export interface AreaProps {
  code: AreaCode;
  name: string;
  parent?: AreaCode;
}

export const LEVELS: readonly Level[] = ['kraj', 'orp', 'obec'];

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export function isIndicatorDef(x: unknown): x is IndicatorDef {
  return (
    isObj(x) &&
    typeof x.id === 'string' &&
    typeof x.label === 'string' &&
    typeof x.unit === 'string' &&
    typeof x.higherIsBetter === 'boolean' &&
    typeof x.sourceId === 'string' &&
    typeof x.decimals === 'number'
  );
}

export function isIndicatorFile(x: unknown): x is IndicatorFile {
  if (!isObj(x) || !LEVELS.includes(x.level as Level)) return false;
  if (!isObj(x.indicators) || !isObj(x.values)) return false;
  if (!Object.values(x.indicators).every(isIndicatorDef)) return false;
  for (const [ind, byArea] of Object.entries(x.values)) {
    if (!(ind in x.indicators) || !isObj(byArea)) return false;
    for (const byYear of Object.values(byArea)) {
      if (!isObj(byYear)) return false;
      for (const [y, v] of Object.entries(byYear)) {
        if (!/^\d{4}$/.test(y)) return false;
        if (v !== null && typeof v !== 'number') return false;
      }
    }
  }
  return true;
}

export function isSourceEntry(x: unknown): x is SourceEntry {
  return (
    isObj(x) &&
    ['id', 'provider', 'title', 'url', 'license', 'downloadedAt', 'validFor'].every(
      (k) => typeof x[k] === 'string',
    ) &&
    (x.status === 'ok' || x.status === 'stale')
  );
}

export function isPointLayer(x: unknown): x is PointLayer {
  return (
    isObj(x) &&
    typeof x.id === 'string' &&
    typeof x.label === 'string' &&
    typeof x.sourceId === 'string' &&
    typeof x.validFor === 'string' &&
    Array.isArray(x.features) &&
    x.features.every(
      (f) =>
        isObj(f) &&
        typeof f.id === 'string' &&
        typeof f.name === 'string' &&
        Number.isFinite(f.lon) &&
        Number.isFinite(f.lat) &&
        typeof f.obec === 'string' &&
        typeof f.orp === 'string',
    )
  );
}

// --- režim „Kam na střední“ -------------------------------------------------

/** Typ studia odvozený z „Druh vzdělávání“ (fallback: písmeno v kódu oboru). */
export type TypStudia = 'maturita' | 'vyucni' | 'jine';

/** Školní roky záměrů přijímání, klíč = rok začátku (2024 = 2024/2025). */
export const ROKY_ZAMERU = [2024, 2025, 2026] as const;

/** Jeden obor jedné střední školy, sloučený přes záměry 2024/25–2026/27. */
export interface Obor {
  /** IZO ředitelství (= „Identifikační znak organizace“) */
  izo: string;
  skola: string;
  web: string;
  obec: string;
  kodObce: AreaCode;
  orp: AreaCode;
  lon: number;
  lat: number;
  kodOboru: string;
  nazevOboru: string;
  /** první dvojčíslí kódu oboru, např. '18' */
  skupina: string;
  typ: TypStudia;
  /** původní text „Druh vzdělávání“ */
  druh: string;
  delka: string;
  forma: string;
  /** záměr počtu přijímaných uchazečů podle roku začátku školního roku; null = obor ten rok nebyl */
  zamer: Record<number, number | null>;
  /** nově přijatí k 30. 9. 2025 (ze sady 2026/27); null = neuvedeno */
  prijato2025: number | null;
  /** počet autobusových zastávek do 500 m od školy */
  zastavky500m: number;
  /** vzdálenost k nejbližší zastávce v metrech; null = neznámá */
  nejblizsiZastavkaM: number | null;
}

export interface OboryFile {
  /** ISO čas vytvoření */
  updatedAt: string;
  sourceIds: string[];
  obory: Obor[];
}

export function isOboryFile(x: unknown): x is OboryFile {
  return (
    isObj(x) &&
    typeof x.updatedAt === 'string' &&
    Array.isArray(x.sourceIds) &&
    Array.isArray(x.obory) &&
    x.obory.every(
      (o) =>
        isObj(o) &&
        typeof o.izo === 'string' &&
        typeof o.kodOboru === 'string' &&
        typeof o.nazevOboru === 'string' &&
        Number.isFinite(o.lon) &&
        Number.isFinite(o.lat) &&
        isObj(o.zamer),
    )
  );
}

// --- „Kam vyrazit“: místa pro volný čas z datových sad kraje ----------------

export const KATEGORIE_IDS = [
  'sjezdovky',
  'koupani',
  'bazeny',
  'hrady-zamky',
  'rozhledny',
  'muzea',
  'kultura',
  'rodiny',
  'priroda',
  'prameny',
  'sport',
  'pivovary',
] as const;
export type KategorieId = (typeof KATEGORIE_IDS)[number];

/** Třída posledního hodnocení kvality vody (KHS Karlovarského kraje). */
export type KvalitaVody = 'vhodna' | 'mirne' | 'zhorsena' | 'nevhodna' | 'nebezpecna' | 'na';

export interface Misto {
  /** unikátní napříč kategoriemi, např. 'sjezdovky:3' */
  id: string;
  kat: KategorieId;
  nazev: string;
  lon: number;
  lat: number;
  /** kód obce (ČSÚ); null = v sadě chybí */
  obec: AreaCode | null;
  obecNazev: string;
  orp: AreaCode | null;
  popis: string | null;
  web: string | null;
  tel: string | null;
  email: string | null;
  provozovatel: string | null;
  adresa: string | null;
  /** příznaky pro filtry kategorie (id tagů definuje src/lib/vylety.ts) */
  tagy: string[];
  /** true = vstupné se platí, false = zdarma, null = neuvedeno */
  vstupne: boolean | null;
  /** číselné údaje (např. počet vleků, rok vzniku) */
  cisla: Record<string, number>;
  /** poznámka ze sady (provoz, přístup) */
  poznamka: string | null;
  sourceId: string;
  /** jen koupací místa: poslední hodnocení vody */
  voda?: { trida: KvalitaVody; datum: string | null; poznamka: string | null; zdroj: string };
}

export interface MistaFile {
  updatedAt: string;
  sourceIds: string[];
  mista: Misto[];
}

export function isMistaFile(x: unknown): x is MistaFile {
  return (
    isObj(x) &&
    typeof x.updatedAt === 'string' &&
    Array.isArray(x.sourceIds) &&
    Array.isArray(x.mista) &&
    x.mista.every(
      (m) =>
        isObj(m) &&
        typeof m.id === 'string' &&
        typeof m.nazev === 'string' &&
        (KATEGORIE_IDS as readonly unknown[]).includes(m.kat) &&
        Number.isFinite(m.lon) &&
        Number.isFinite(m.lat) &&
        Array.isArray(m.tagy),
    )
  );
}

/** public/data/manifest.json – vstupní bod snapshotu. */
export interface Manifest {
  /** ISO čas posledního běhu pipeline */
  updatedAt: string;
  sources: SourceEntry[];
  /** relativní cesty (vůči public/data/) k souborům snapshotu */
  files: {
    indicators: Partial<Record<Level, string>>;
    points: Record<string, string>;
    geo: Partial<Record<'kraje' | 'kv-orp' | 'kv-obce', string>>;
    /** obory středních škol (režim „Kam na střední“), volitelné */
    skoly?: string;
    /** místa pro volný čas (režim „Kam vyrazit“), volitelné */
    vylety?: string;
    /** příslušné úřady obcí (režim „Úřady“), volitelné */
    urady?: string;
  };
}

export function isManifest(x: unknown): x is Manifest {
  return (
    isObj(x) &&
    typeof x.updatedAt === 'string' &&
    Array.isArray(x.sources) &&
    x.sources.every(isSourceEntry) &&
    isObj(x.files) &&
    isObj(x.files.indicators) &&
    isObj(x.files.points) &&
    isObj(x.files.geo) &&
    (x.files.skoly === undefined || typeof x.files.skoly === 'string') &&
    (x.files.vylety === undefined || typeof x.files.vylety === 'string') &&
    (x.files.urady === undefined || typeof x.files.urady === 'string')
  );
}
