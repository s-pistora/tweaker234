/*
 * Nástroje AI poradce: jediný způsob, jak se model dostane k datům.
 * Model nevidí nic jiného než to, co mu tyto funkce vrátí (výtah ze Snapshotu aplikace),
 * takže odpovídá jen z otevřených dat, která aplikace načetla.
 */
import type { Snapshot } from '../data/loader.ts';
import type { AreaCode, KategorieId, TypStudia } from '../types.ts';
import {
  SKUPINY,
  TYP_LABEL,
  agreguj,
  filtrujObory,
  naplnenost,
  oboryPodleNaplnenosti,
  vzdalenostKm,
  type Domov,
} from '../skoly.ts';
import { KATEGORIE, KATEGORIE_BY_ID, bezDiakritiky, filtrujMista, stitky, vodaLabel } from '../vylety.ts';

export interface KontextDat {
  snap: Snapshot;
  /** kód obce → název */
  obecNames: Record<AreaCode, string>;
  /** kód obce → těžiště */
  obecCentroidy: Record<AreaCode, Domov>;
}

/** Definice nástroje ve formátu OpenAI-kompatibilního API (Groq). */
export interface NastrojDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const KRAJ_KOD = 'CZ041';
const MAX_LIMIT = 25;

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string, e?: string[]) => (e ? { type: 'string', description, enum: e } : { type: 'string', description });
const num = (description: string) => ({ type: 'number', description });

/** Seznam nástrojů – vrstvy bodů a kategorie míst se berou z načtených dat. */
export function definiceNastroju(ctx: KontextDat): NastrojDef[] {
  const vrstvy = Object.values(ctx.snap.points).map((l) => l.id);
  const fn = (name: string, description: string, parameters: Record<string, unknown>): NastrojDef => ({
    type: 'function',
    function: { name, description, parameters },
  });
  return [
    fn(
      'najdi_obec',
      'Najde obec Karlovarského kraje podle názvu (stačí část, diakritika nevadí). Vrací kódy a názvy.',
      obj({ nazev: str('název nebo část názvu obce') }, ['nazev']),
    ),
    fn(
      'hledej_obory',
      'Obory středních škol otevírané ve školním roce 2026/27: plánovaná místa, loňská obsazenost, vzdálenost od obce, zastávky u školy.',
      obj({
        obec: str('název obce, od které se měří vzdálenost (volitelné)'),
        km: num('max. vzdálenost vzdušnou čarou v km (výchozí 25, jen s obcí)'),
        typ: str('typ studia', ['maturita', 'vyucni', 'vse']),
        skupina: str('kód skupiny oborů (dvojčíslí, např. "18" = Informatika)'),
        hledat: str('text v názvu oboru nebo školy'),
        razeni: str('vzdalenost = od nejbližšího, volno = nejvíc volných míst loni', ['vzdalenost', 'volno']),
        limit: num(`kolik výsledků vrátit (max ${MAX_LIMIT})`),
      }),
    ),
    fn(
      'detail_skoly',
      'Všechny obory jedné střední školy (hledá podle části názvu školy nebo obce školy).',
      obj({ nazev: str('část názvu školy, případně obec') }, ['nazev']),
    ),
    fn(
      'prehled_skol_kraje',
      'Souhrn přijímacího řízení za celý kraj: počet oborů a míst, loňská obsazenost, nejméně a nejvíce obsazené obory.',
      obj({}),
    ),
    fn(
      'hledej_mista',
      `Místa pro volný čas v kraji (kategorie: ${KATEGORIE.map((k) => `${k.id} = ${k.label}`).join(', ')}).`,
      obj({
        kategorie: str('id kategorie', KATEGORIE.map((k) => k.id)),
        obec: str('název obce, od které se měří vzdálenost (volitelné)'),
        km: num('max. vzdálenost vzdušnou čarou v km (výchozí 30, jen s obcí)'),
        hledat: str('text v názvu, obci nebo popisu místa'),
        zdarma: { type: 'boolean', description: 'true = jen místa bez vstupného' },
        limit: num(`kolik výsledků vrátit (max ${MAX_LIMIT})`),
      }),
    ),
    fn(
      'ukazatele',
      'Statistické ukazatele (obyvatelé, věk, nezaměstnanost, mzda, služby…). S obcí vrací údaje obce, bez obce údaje Karlovarského kraje; vždy i srovnání s krajem a ČR, pokud je v datech.',
      obj({ obec: str('název obce (volitelné)') }),
    ),
    fn(
      'hledej_body',
      `Další body v mapě (vrstvy: ${Object.values(ctx.snap.points)
        .map((l) => `${l.id} = ${l.label}`)
        .join(', ')}).`,
      obj(
        {
          vrstva: str('id vrstvy', vrstvy),
          obec: str('název obce (volitelné) – body v obci nebo v okolí'),
          km: num('okruh v km kolem obce (výchozí 5)'),
          hledat: str('text v názvu bodu'),
          limit: num(`kolik výsledků vrátit (max ${MAX_LIMIT})`),
        },
        ['vrstva'],
      ),
    ),
  ];
}

// --- pomocné ---------------------------------------------------------------

function zdroje(ctx: KontextDat, ids: string[]) {
  return ctx.snap.manifest.sources
    .filter((s) => ids.includes(s.id))
    .map((s) => `${s.title} (${s.provider})`);
}

function limit(v: unknown, vychozi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : vychozi;
  return Math.max(1, Math.min(MAX_LIMIT, n));
}

const zaokr = (n: number | null, des = 1) => (n === null ? null : Math.round(n * 10 ** des) / 10 ** des);
const pct = (p: number | null) => (p === null ? null : `${Math.round(p * 100)} %`);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const zkrat = (s: string | null, n: number) => (s && s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

/** Odstraní prázdné hodnoty (null, '', []) – menší výsledek = méně tokenů. */
export function kompakt(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(kompakt);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const c = kompakt(x);
      if (c === null || c === undefined || c === '' || (Array.isArray(c) && !c.length)) continue;
      out[k] = c;
    }
    return out;
  }
  return v;
}

/** Najde obce podle názvu: přesná shoda (bez diakritiky) první, pak začátek, pak výskyt. */
export function najdiObce(ctx: KontextDat, nazev: string): { kod: AreaCode; nazev: string }[] {
  const q = bezDiakritiky(nazev.trim());
  if (!q) return [];
  const all = Object.entries(ctx.obecNames).map(([kod, n]) => ({ kod, nazev: n, k: bezDiakritiky(n) }));
  const rank = (k: string) => (k === q ? 0 : k.startsWith(q) ? 1 : k.includes(q) ? 2 : 3);
  return all
    .filter((o) => rank(o.k) < 3)
    .sort((a, b) => rank(a.k) - rank(b.k) || a.nazev.localeCompare(b.nazev, 'cs'))
    .slice(0, 5)
    .map(({ kod, nazev: n }) => ({ kod, nazev: n }));
}

type Obec = { kod: AreaCode; nazev: string; domov: Domov };
/** Obec z argumentu: undefined = nezadána, null = zadána, ale nenalezena. */
function obecZArg(ctx: KontextDat, v: unknown): Obec | null | undefined {
  const t = text(v);
  if (!t) return undefined;
  const o = najdiObce(ctx, t)[0];
  const domov = o ? ctx.obecCentroidy[o.kod] : undefined;
  return o && domov ? { ...o, domov } : null;
}

const nenalezenaObec = (v: unknown) => ({
  chyba: `Obec „${text(v)}“ v datech Karlovarského kraje není. Zkuste nástroj najdi_obec.`,
});

// --- nástroje ----------------------------------------------------------------

function hledejObory(ctx: KontextDat, a: Record<string, unknown>) {
  const sk = ctx.snap.skoly;
  if (!sk) return { chyba: 'Data o středních školách se nenačetla.' };
  const obec = obecZArg(ctx, a.obec);
  if (obec === null) return nenalezenaObec(a.obec);
  const typ = (['maturita', 'vyucni'] as string[]).includes(text(a.typ)) ? (text(a.typ) as TypStudia) : 'vse';
  if (text(a.skupina) && !(text(a.skupina) in SKUPINY)) return { chyba: `Skupina oborů „${text(a.skupina)}“ v datech není.` };
  const skupina = text(a.skupina);
  const km = typeof a.km === 'number' && a.km > 0 ? a.km : 25;
  const q = bezDiakritiky(text(a.hledat));
  const vysledky = filtrujObory(
    sk.obory,
    { domov: obec?.domov ?? null, typ, skupina, maxKm: km },
    a.razeni === 'volno' ? 'volno' : 'vzdalenost',
  ).filter((r) => !q || bezDiakritiky(`${r.obor.nazevOboru} ${r.obor.skola} ${r.obor.obec}`).includes(q));
  return {
    od_obce: obec ? obec.nazev : null,
    max_km: obec ? km : null,
    celkem_nalezeno: vysledky.length,
    obory: vysledky.slice(0, limit(a.limit, 8)).map((r) => oborVen(r.obor, r.km)),
    poznamka: 'km vzdušnou čarou; obsazenost_loni = prijato_2025 (k 30. 9. 2025) / plan_2025_26; neuvedeno = obor loni nebyl nebo chybí údaj.',
    zdroje: zdroje(ctx, sk.sourceIds),
  };
}

/** Obor pro model – jen pole, která potřebuje k odpovědi (limit tokenů bezplatného Groq). */
function oborVen(o: NonNullable<Snapshot['skoly']>['obory'][number], km: number | null, sWebem = false) {
  return {
    skola: o.skola,
    obec_skoly: o.obec,
    obor: o.nazevOboru,
    typ: TYP_LABEL[o.typ],
    forma: /denn/i.test(o.forma) ? null : o.forma,
    km: zaokr(km),
    mista_2026_27: o.zamer[2026] ?? null,
    plan_2025_26: o.zamer[2025] ?? null,
    prijato_2025: o.prijato2025,
    obsazenost_loni: pct(naplnenost(o)) ?? 'neuvedeno',
    zastavky_500m: o.zastavky500m,
    web: sWebem ? o.web || null : null,
  };
}

function detailSkoly(ctx: KontextDat, a: Record<string, unknown>) {
  const sk = ctx.snap.skoly;
  if (!sk) return { chyba: 'Data o středních školách se nenačetla.' };
  const q = bezDiakritiky(text(a.nazev));
  if (!q) return { chyba: 'Zadejte název školy.' };
  const shoda = sk.obory.filter((o) => bezDiakritiky(`${o.skola} ${o.obec}`).includes(q));
  const skoly = [...new Set(shoda.map((o) => o.izo))];
  if (!skoly.length) return { chyba: `Škola „${text(a.nazev)}“ v datech není.` };
  return {
    pocet_nalezenych_skol: skoly.length,
    skoly: skoly.slice(0, 3).map((izo) => {
      const ob = shoda.filter((o) => o.izo === izo);
      return {
        skola: ob[0].skola,
        obec: ob[0].obec,
        web: ob[0].web || null,
        zastavky_do_500_m: ob[0].zastavky500m,
        obory: ob.map((o) => oborVen(o, null, true)),
      };
    }),
    zdroje: zdroje(ctx, sk.sourceIds),
  };
}

function prehledSkolKraje(ctx: KontextDat) {
  const sk = ctx.snap.skoly;
  if (!sk) return { chyba: 'Data o středních školách se nenačetla.' };
  const kraj = agreguj(sk.obory, () => 'kraj', () => 'Karlovarský kraj')[0] ?? null;
  const otevirane = sk.obory.filter((o) => (o.zamer[2026] ?? 0) > 0);
  const kratce = (o: (typeof sk.obory)[number]) => ({
    skola: o.skola,
    obor: o.nazevOboru,
    obsazenost_loni: pct(naplnenost(o)),
    prijato: o.prijato2025,
    plan_2025_26: o.zamer[2025] ?? null,
  });
  return {
    oboru_2026_27: otevirane.length,
    skol_2026_27: new Set(otevirane.map((o) => o.izo)).size,
    souhrn_kraje: kraj,
    nejmene_obsazene_loni: oboryPodleNaplnenosti(sk.obory, 'nejmene', 6).map(kratce),
    nejvice_obsazene_loni: oboryPodleNaplnenosti(sk.obory, 'nejvice', 6).map(kratce),
    zdroje: zdroje(ctx, sk.sourceIds),
  };
}

function hledejMista(ctx: KontextDat, a: Record<string, unknown>) {
  const vy = ctx.snap.vylety;
  if (!vy) return { chyba: 'Data o místech pro volný čas se nenačetla.' };
  const obec = obecZArg(ctx, a.obec);
  if (obec === null) return nenalezenaObec(a.obec);
  if (text(a.kategorie) && !(text(a.kategorie) in KATEGORIE_BY_ID)) return { chyba: `Kategorie „${text(a.kategorie)}“ v datech není.` };
  const kat = text(a.kategorie) ? (text(a.kategorie) as KategorieId) : null;
  const km = typeof a.km === 'number' && a.km > 0 ? a.km : 30;
  const vysledky = filtrujMista(vy.mista, {
    kat,
    domov: obec?.domov ?? null,
    maxKm: km,
    tagy: [],
    vstup: a.zdarma === true ? 'zdarma' : 'vse',
    q: text(a.hledat),
  });
  return {
    od_obce: obec ? obec.nazev : null,
    max_km: obec ? km : null,
    celkem_nalezeno: vysledky.length,
    mista: vysledky.slice(0, limit(a.limit, 8)).map(({ misto: m, km: d }) => ({
      nazev: m.nazev,
      kategorie: KATEGORIE_BY_ID[m.kat]?.label ?? m.kat,
      obec: m.obecNazev || null,
      km: zaokr(d),
      popis: zkrat(m.popis, 160),
      stitky: stitky(m),
      vstupne: m.vstupne === null ? 'neuvedeno' : m.vstupne ? 'placené' : 'zdarma',
      provoz_poznamka: zkrat(m.poznamka, 120),
      kvalita_vody: m.voda ? { hodnoceni: vodaLabel(m.voda.trida), datum: m.voda.datum, zdroj: m.voda.zdroj } : undefined,
      web: m.web,
    })),
    poznamka: 'Vzdálenosti jsou vzdušnou čarou.',
    zdroje: zdroje(ctx, vy.sourceIds),
  };
}

function ukazatele(ctx: KontextDat, a: Record<string, unknown>) {
  const obec = obecZArg(ctx, a.obec);
  if (obec === null) return nenalezenaObec(a.obec);
  const file = obec ? ctx.snap.indicators.obec : ctx.snap.indicators.kraj;
  if (!file) return { chyba: 'Ukazatele se nenačetly.' };
  const kod = obec ? obec.kod : KRAJ_KOD;
  const posledni = (r: Record<number, number | null> | undefined) => {
    const roky = Object.entries(r ?? {})
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([y]) => Number(y))
      .sort((x, y) => y - x);
    return roky[0] ?? null;
  };
  const out = Object.values(file.indicators).flatMap((d) => {
    const rok = posledni(file.values[d.id]?.[kod]);
    if (rok === null) return [];
    return [
      {
        ukazatel: d.label,
        jednotka: d.unit,
        rok,
        hodnota: zaokr(file.values[d.id][kod][rok] ?? null, d.decimals),
        prumer_kraje: obec ? zaokr(file.regional?.[d.id]?.[rok] ?? null, d.decimals) : undefined,
        hodnota_cr: zaokr(file.national?.[d.id]?.[rok] ?? null, d.decimals),
      },
    ];
  });
  return {
    uzemi: obec ? obec.nazev : 'Karlovarský kraj',
    ukazatele: out,
    zdroje: zdroje(ctx, [...new Set(Object.values(file.indicators).map((d) => d.sourceId))]),
  };
}

function hledejBody(ctx: KontextDat, a: Record<string, unknown>) {
  const vrstva = ctx.snap.points[text(a.vrstva)];
  if (!vrstva) return { chyba: `Vrstva „${text(a.vrstva)}“ v datech není.` };
  const obec = obecZArg(ctx, a.obec);
  if (obec === null) return nenalezenaObec(a.obec);
  const km = typeof a.km === 'number' && a.km > 0 ? a.km : 5;
  const q = bezDiakritiky(text(a.hledat));
  const body = vrstva.features
    .map((f) => ({ f, km: obec ? vzdalenostKm(obec.domov.lat, obec.domov.lon, f.lat, f.lon) : null }))
    .filter(({ f, km: d }) => (!obec || f.obec === obec.kod || (d !== null && d <= km)) && (!q || bezDiakritiky(f.name).includes(q)))
    .sort((x, y) => (x.km ?? 0) - (y.km ?? 0) || x.f.name.localeCompare(y.f.name, 'cs'));
  return {
    vrstva: vrstva.label,
    platnost: vrstva.validFor,
    od_obce: obec ? obec.nazev : null,
    celkem_nalezeno: body.length,
    body: body.slice(0, limit(a.limit, 8)).map(({ f, km: d }) => ({
      nazev: f.name,
      obec: ctx.obecNames[f.obec] ?? null,
      km: zaokr(d),
      udaje: f.attrs,
    })),
    zdroje: zdroje(ctx, [vrstva.sourceId]),
  };
}

/** Spustí nástroj podle jména; neznámý nástroj nebo chybné argumenty vrací `{ chyba }`. */
export function spustNastroj(ctx: KontextDat, nazev: string, argumenty: unknown): unknown {
  return kompakt(spust(ctx, nazev, argumenty));
}

function spust(ctx: KontextDat, nazev: string, argumenty: unknown): unknown {
  const a = argumenty && typeof argumenty === 'object' ? (argumenty as Record<string, unknown>) : {};
  switch (nazev) {
    case 'najdi_obec': {
      const obce = najdiObce(ctx, text(a.nazev));
      return obce.length ? { obce } : { chyba: `Obec „${text(a.nazev)}“ v datech Karlovarského kraje není.` };
    }
    case 'hledej_obory':
      return hledejObory(ctx, a);
    case 'detail_skoly':
      return detailSkoly(ctx, a);
    case 'prehled_skol_kraje':
      return prehledSkolKraje(ctx);
    case 'hledej_mista':
      return hledejMista(ctx, a);
    case 'ukazatele':
      return ukazatele(ctx, a);
    case 'hledej_body':
      return hledejBody(ctx, a);
    default:
      return { chyba: `Nástroj „${nazev}“ neexistuje.` };
  }
}

/** Skupiny oborů pro systémový pokyn (kód → název). */
export const SKUPINY_TEXT = Object.entries(SKUPINY)
  .map(([k, v]) => `${k} ${v}`)
  .join(', ');
