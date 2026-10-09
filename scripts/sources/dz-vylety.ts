// Adaptér „Kam vyrazit“: místa pro volný čas z datových sad Karlovarského kraje (datazapad.cz).
//
// Sady jsou na datazapad.cz publikované jako ArcGIS Feature Services. CSV export z Hubu u části
// z nich vrací 404 (vrstva není 0), proto čteme přímo REST API služby:
//   arcgis.com/sharing/rest/content/items/<id>?f=json  → url služby a licence
//   <url>?f=json                                       → id první vrstvy
//   <url>/<vrstva>/query?where=1=1&outFields=*&f=json  → atributy (souřadnice bereme z WGS84 sloupců)
// Názvy sloupců se mezi sadami liší (velikost písmen, zkrácení na 31 znaků), proto se hledají
// přes normalizovaný klíč – viz `field()`.
import type { KategorieId, Misto, SourceEntry } from '../../src/lib/types.ts';

export type Attrs = Record<string, unknown>;

interface SadaCfg {
  itemId: string;
  slug: string;
  title: string;
  kat: KategorieId;
  tagy: (a: Attrs) => string[];
  cisla?: (a: Attrs) => Record<string, number>;
}

const KV_KRAJ = 'CZ041';

const norm = (k: string) => k.toLowerCase().replace(/\s+/g, '_');

/** Hodnota prvního sloupce, jehož normalizovaný název je přesně `exact` nebo začíná některým z `prefixes`. */
export function field(a: Attrs, exact: string[], prefixes: string[] = []): unknown {
  const keys = Object.keys(a);
  for (const e of exact) {
    const k = keys.find((x) => norm(x) === e);
    if (k !== undefined && a[k] !== null && a[k] !== '') return a[k];
  }
  for (const p of prefixes) {
    const k = keys.find((x) => norm(x).startsWith(p));
    if (k !== undefined && a[k] !== null && a[k] !== '') return a[k];
  }
  return null;
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

export function bool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  const s = str(v)?.toLowerCase();
  if (s === 'true' || s === 'ano') return true;
  if (s === 'false' || s === 'ne') return false;
  return null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** kód obce/ORP – v sadách bývá Double (554961.0) */
function code(v: unknown): string | null {
  const n = num(v);
  return n === null ? null : String(Math.round(n));
}

const b = (a: Attrs, ...names: string[]) => bool(field(a, names.map(norm)));
const t = (a: Attrs, ...names: string[]) => (str(field(a, names.map(norm))) ?? '').toLowerCase();

/** Vstupné: boolean sloupec, nebo text „zpoplatněný / volný / dobrovolné“. */
export function vstupne(a: Attrs): boolean | null {
  const flag = bool(field(a, ['vstupné', 'vstupní_poplatek']));
  if (flag !== null) return flag;
  const txt = t(a, 'vstup');
  if (!txt) return null;
  if (/zpoplatn|poplatek/.test(txt)) return true;
  if (/volný|zdarma|dobrovoln/.test(txt)) return false;
  return null;
}

export const SADY: SadaCfg[] = [
  {
    itemId: 'd130e2d3a13d4ca39b16761d2131619b',
    slug: 'vleky',
    title: 'Lyžařské vleky a lanovky v Karlovarském kraji',
    kat: 'sjezdovky',
    cisla: (a) => ({
      vleky: num(field(a, ['počet_vleků'])) ?? 0,
      lanovky: num(field(a, ['počet_lanovek'])) ?? 0,
      pasy: num(field(a, [], ['počet_pásů'])) ?? 0,
    }),
    tagy: (a) => {
      const vleky = num(field(a, ['počet_vleků'])) ?? 0;
      const lanovky = num(field(a, ['počet_lanovek'])) ?? 0;
      const pasy = num(field(a, [], ['počet_pásů'])) ?? 0;
      const n = vleky + lanovky;
      const out = [n >= 6 ? 'velky' : n >= 3 ? 'stredni' : 'maly'];
      if (lanovky > 0) out.push('lanovka');
      if (pasy > 0) out.push('pas');
      out.push(/let|celoro|mimo zimní/.test(t(a, 'poznámka')) ? 'celorocne' : 'zima');
      return out;
    },
  },
  {
    itemId: '239805159c8649609d1bd40a30439623',
    slug: 'koupaci-mista-2026',
    title: 'Koupací místa s kontrolou kvality vody v roce 2026 v Karlovarském kraji',
    kat: 'koupani',
    tagy: (a) => {
      const spec = t(a, 'specifikace_místa');
      return [/bez provozovatele/.test(spec) ? 'bez-provozovatele' : 's-provozovatelem'];
    },
  },
  {
    itemId: '98d26c1b1c8f4bd49850af82a19a7f58',
    slug: 'aquaparky',
    title: 'Aquaparky, koupaliště a bazény v Karlovarském kraji',
    kat: 'bazeny',
    tagy: (a) =>
      [b(a, 'aquapark') && 'aquapark', b(a, 'bazén') && 'bazen', b(a, 'koupaliště') && 'koupaliste'].filter(
        (x): x is string => !!x,
      ),
  },
  {
    itemId: 'c3a42c283f0649248326a0bbd7dc5cc3',
    slug: 'hrady',
    title: 'Hrady a jejich zříceniny v Karlovarském kraji',
    kat: 'hrady-zamky',
    tagy: (a) => {
      const out: string[] = [];
      if (b(a, 'hrad')) out.push('hrad');
      if (b(a, 'zámek')) out.push('zamek');
      if (b(a, 'tvrz')) out.push('tvrz');
      if (b(a, 'zřícenina')) out.push('zricenina');
      if (b(a, 'přístupné')) out.push('pristupne');
      if (/kulturní památka/.test(t(a, 'památková_ochrana'))) out.push('pamatka');
      return out;
    },
  },
  {
    itemId: '464108d64a93430083119bfb0845af3c',
    slug: 'zamky',
    title: 'Zámky v Karlovarském kraji',
    kat: 'hrady-zamky',
    tagy: (a) => {
      const out = ['zamek'];
      if (b(a, 'zřícenina')) out.push('zricenina');
      if (b(a, 'přístupné')) out.push('pristupne');
      if (/^kulturní památka/.test(t(a, 'památková_ochrana'))) out.push('pamatka');
      return out;
    },
  },
  {
    itemId: '2fe4d27ac10341f6bd2b4ea6380a2599',
    slug: 'rozhledny',
    title: 'Rozhledny v Karlovarském kraji',
    kat: 'rozhledny',
    cisla: (a) => {
      const v = num(field(a, ['vznik']));
      return v === null ? ({} as Record<string, number>) : { vznik: v };
    },
    tagy: (a) => {
      const out: string[] = [];
      if (b(a, 'rozhledna')) out.push('rozhledna');
      if (b(a, 'vyhlídková_věž')) out.push('vez');
      if (b(a, 'vyhlídka')) out.push('vyhlidka');
      if (/kdykoli|zdarma$|volně/.test(t(a, 'přístup'))) out.push('nonstop');
      return out;
    },
  },
  {
    itemId: '5aa3b9fe8da6474786ff2b9c81b006cb',
    slug: 'muzea',
    title: 'Muzea a galerie v Karlovarském kraji',
    kat: 'muzea',
    tagy: (a) => [b(a, 'muzeum') && 'muzeum', b(a, 'galerie') && 'galerie'].filter((x): x is string => !!x),
  },
  {
    itemId: '6be3423787fd4c1fa19a70b025e2eb64',
    slug: 'skanzeny',
    title: 'Muzea v přírodě a skanzeny v Karlovarském kraji',
    kat: 'muzea',
    tagy: () => ['skanzen'],
  },
  {
    itemId: '805a0267da9e45eea0c20a2e3123189f',
    slug: 'divadla',
    title: 'Divadla v Karlovarském kraji',
    kat: 'kultura',
    tagy: () => ['divadlo'],
  },
  {
    itemId: '94c4d284041c4412af231e96fe66cf6b',
    slug: 'kina',
    title: 'Kina a kinosály v Karlovarském kraji',
    kat: 'kultura',
    tagy: (a) => (b(a, 'letní_kino') ? ['kino', 'letni-kino'] : ['kino']),
  },
  {
    itemId: 'c548528f8601499d894cc7556e679de6',
    slug: 'kulturni-domy',
    title: 'Kulturní domy a centra v Karlovarském kraji',
    kat: 'kultura',
    tagy: () => ['kulturni-dum'],
  },
  {
    itemId: '52658b60dacf474f80cf5bb7c8004cc6',
    slug: 'zoo',
    title: 'ZOO a zooparky v Karlovarském kraji',
    kat: 'rodiny',
    tagy: (a) => ['zvirata', ...(b(a, 'obora') ? ['obora'] : [])],
  },
  {
    itemId: '90441fa783444e1ead5ad71464504d6a',
    slug: 'lanova-centra',
    title: 'Lanová a zábavní centra v Karlovarském kraji',
    kat: 'rodiny',
    tagy: (a) => {
      const typ = t(a, 'typ_centra');
      const out: string[] = [];
      if (/lanov/.test(typ)) out.push('lanove');
      if (/zábavní|trampol|dětsk/.test(typ) || !out.length) out.push('zabavni');
      if (/krytý|vnitřní|herna|dětské zábavní centrum/.test(typ)) out.push('pod-strechou');
      return out;
    },
  },
  {
    itemId: '5e900a28dedd446aa8ae18d49ac88d70',
    slug: 'agroturistika',
    title: 'Agroturistické destinace v Karlovarském kraji',
    kat: 'rodiny',
    tagy: (a) => {
      const out = ['farma'];
      if (b(a, 'minizoo')) out.push('zvirata');
      if (b(a, 'hipoturistika')) out.push('kone');
      return out;
    },
  },
  {
    itemId: '037f7b55d2d34fa88fd63bf2d2903839',
    slug: 'prirodni-pozoruhodnosti',
    title: 'Přírodní pozoruhodnosti v Karlovarském kraji',
    kat: 'priroda',
    tagy: (a) => {
      const pam = t(a, 'památka');
      const out = ['pozoruhodnost'];
      if (/přírodní|rezervace|evropsky/.test(pam)) out.push('chranene');
      return out;
    },
  },
  {
    itemId: '8ae1f28fc17f4918a0dba74bb11797ff',
    slug: 'botanicke-zahrady',
    title: 'Botanické zahrady a arboreta v Karlovarském kraji',
    kat: 'priroda',
    tagy: (a) => [b(a, 'botanická_zahrada') && 'zahrada', b(a, 'arboretum') && 'arboretum'].filter((x): x is string => !!x),
  },
  {
    itemId: '92327bf761e14d3c8cd169b7d65fa418',
    slug: 'prameny',
    title: 'Přístupné prameny v Karlovarském kraji',
    kat: 'prameny',
    tagy: (a) => {
      const typ = t(a, 'typ');
      const dost = t(a, 'dostupnost_vody');
      const out: string[] = [];
      if (/minerální/.test(typ)) out.push('mineralni');
      if (/radioaktivní/.test(typ)) out.push('radioaktivni');
      if (/pitelný/.test(t(a, 'zdroj'))) out.push('pitny');
      if (/dobře dostupná|tekoucí/.test(dost)) out.push('tece');
      else if (/nedostupná/.test(dost)) out.push('sucho');
      else if (dost) out.push('slabe');
      if (/obec|zastavěné/.test(t(a, 'přístupnost'))) out.push('ve-meste');
      return out;
    },
  },
  {
    itemId: '4ce7c8a0d4604d76965b2e3753288ef9',
    slug: 'sportoviste',
    title: 'Sportovní areály a haly v Karlovarském kraji',
    kat: 'sport',
    tagy: (a) => {
      const typ = t(a, 'typ');
      const out: string[] = [];
      if (/zimní stadion/.test(typ)) out.push('led');
      if (b(a, 'sportovní_hala') || /hala/.test(typ)) out.push('hala');
      if (b(a, 'sportovní_areál_centrum') || b(a, 'stadion') || /areál|stadion/.test(typ)) out.push('areal');
      return [...new Set(out.length ? out : ['areal'])];
    },
  },
  {
    itemId: '58bc30d273d84926bc4e817aabca9321',
    slug: 'golf',
    title: 'Golfová hřiště v Karlovarském kraji',
    kat: 'sport',
    tagy: () => ['golf'],
  },
  {
    itemId: '1233e8ab25e64a859ad3c88d51f0fdb8',
    slug: 'jezdectvi',
    title: 'Jezdectví v Karlovarském kraji',
    kat: 'sport',
    tagy: () => ['kone'],
  },
  {
    itemId: '0ddb05a36f0c4b319975df6a4b1ed90e',
    slug: 'pivovary',
    title: 'Pivovarnictví v Karlovarském kraji',
    kat: 'pivovary',
    tagy: (a) => {
      const out: string[] = [];
      if (b(a, 'pivovar')) out.push('pivovar');
      if (b(a, 'minipivovar')) out.push('minipivovar');
      if (b(a, 'létající_pivovar')) out.push('letajici');
      return out;
    },
  },
];

/** Normalizuje jeden záznam sady na `Misto`; null = mimo kraj nebo bez souřadnic. */
export function toMisto(a: Attrs, cfg: SadaCfg, index: number): Misto | null {
  const kraj = str(field(a, [], ['kód_vyššího']));
  if (kraj !== null && kraj !== KV_KRAJ) return null;
  const lon = num(field(a, ['x'], ['zeměpisná_délka', 'x_zeměpisná']));
  const lat = num(field(a, ['y'], ['zeměpisná_šířka', 'y_zeměpisná']));
  if (lon === null || lat === null || lon < 11.5 || lon > 14 || lat < 49.5 || lat > 51) return null;

  const nazev = str(field(a, ['název', 'název_pivovaru'], ['název_agrotur'])) ?? '';
  if (!nazev) return null;
  const obecNazev = str(field(a, ['název_obce'])) ?? '';
  const adresaTxt = str(field(a, [], ['adresa']));
  const ulice = str(field(a, ['název_ulice']));
  const cp = str(field(a, ['číslo_domovní', 'číšlo_domovní']));
  const co = str(field(a, ['číslo_orientační']));
  const psc = str(field(a, ['poštovní_směrovací_číslo']));
  const slozena = [
    [ulice, [cp, co].filter(Boolean).join('/')].filter(Boolean).join(' '),
    [psc, obecNazev].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  const web = str(field(a, [], ['webová_stránka', 'jiná_webová']));
  return {
    id: `${cfg.slug}:${str(field(a, ['objectid'])) ?? index}`,
    kat: cfg.kat,
    nazev,
    lon,
    lat,
    obec: code(field(a, ['kód_obce'])),
    obecNazev,
    orp: code(field(a, [], ['kód_obce_s_rozšířenou'])),
    popis: str(field(a, ['popis', 'popis_služeb', 'typ_atraktivity', 'typ_centra', 'typ'])),
    web: web && /^https?:\/\//.test(web) ? web : null,
    tel: str(field(a, [], ['telefon']))?.replace(/^tel:/, '') ?? null,
    email: str(field(a, [], ['kontaktní_e']))?.replace(/^mailto:/, '') ?? null,
    provozovatel: str(field(a, ['provozovatel', 'název_provozovatele', 'název_organizace_správce', 'správa'])),
    adresa: adresaTxt ?? (slozena || null),
    tagy: cfg.tagy(a),
    vstupne: vstupne(a),
    cisla: cfg.cisla?.(a) ?? {},
    poznamka: str(field(a, ['poznámka', 'přístup', 'provoz', 'přístupné', 'poznámka_otevírací_doba', 'vstup'])),
    sourceId: `dz-${cfg.slug}`,
  };
}

// --- stahování ----------------------------------------------------------------

interface ItemInfo {
  url: string;
  licenseInfo?: string;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** Licence z popisu položky (HTML) – hledá CC0 / CC BY 4.0. */
export function licence(info: string | undefined): string {
  const s = (info ?? '').replace(/<[^>]+>/g, ' ');
  if (/CC0/i.test(s)) return 'CC0 1.0';
  if (/CC[ -]?BY[ -]?4\.0|Creative Commons Uveďte původ 4\.0/i.test(s)) return 'CC BY 4.0';
  return 'neuvedeno poskytovatelem';
}

export async function stahniSadu(cfg: SadaCfg, now: Date): Promise<{ mista: Misto[]; source: SourceEntry }> {
  const item = (await getJson(`https://www.arcgis.com/sharing/rest/content/items/${cfg.itemId}?f=json`)) as ItemInfo;
  if (!item.url) throw new Error(`${cfg.slug}: položka nemá URL služby`);
  const svc = (await getJson(`${item.url}?f=json`)) as { layers?: { id: number }[] };
  const layer = svc.layers?.[0]?.id ?? 0;
  const q = (await getJson(
    `${item.url}/${layer}/query?where=1%3D1&outFields=*&outSR=4326&f=json&resultRecordCount=2000`,
  )) as { features?: { attributes: Attrs }[] };
  const feats = q.features ?? [];
  if (!feats.length) throw new Error(`${cfg.slug}: služba nevrátila žádné záznamy`);
  const mista = feats.map((f, i) => toMisto(f.attributes, cfg, i)).filter((m): m is Misto => m !== null);
  return {
    mista,
    source: {
      id: `dz-${cfg.slug}`,
      provider: 'Karlovarský kraj (datazapad.cz / ArcGIS Hub)',
      title: cfg.title,
      url: `https://www.datazapad.cz/datasets/${cfg.itemId}`,
      license: licence(item.licenseInfo),
      downloadedAt: now.toISOString(),
      validFor: `stav k ${now.toISOString().slice(0, 10)}`,
      status: 'ok',
    },
  };
}
