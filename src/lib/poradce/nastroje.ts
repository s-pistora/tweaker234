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
import {
  POZADAVKY,
  POZADAVKY_BY_ID,
  bodyPozadavku,
  metrika,
  poradi,
  spocitejSkore,
  srovnani,
  textSrovnani,
  vetaPozadavku,
  vytvorKontext,
  type CastSkore,
  type Dulezitost,
  type ZivotKontext,
} from '../zivot.ts';

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
const MAX_LIMIT_ZIVOT = 10;

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
    fn(
      'kde_se_mi_bude_zit',
      '„Kde by se mi dobře žilo?“ – seřadí obce kraje podle požadavků na bydlení (skóre 0–100, 100 = nejlepší obec kraje).',
      obj(
        {
          pozadavky: {
            type: 'array',
            items: { type: 'string', enum: POZADAVKY.map((p) => p.id) },
            description: 'id požadavků, na kterých uživateli záleží',
          },
          velmi_dulezite: idsParam('id (ze stejného výčtu), na kterých záleží nejvíc – dvojnásobná váha'),
          orp: str('jen obce jednoho ORP, např. "Sokolov" (volitelné)'),
          limit: num(`kolik obcí (výchozí 5, max ${MAX_LIMIT_ZIVOT})`),
        },
        ['pozadavky'],
      ),
    ),
    fn(
      'obec_bydleni',
      'Jak se žije v jedné obci: věta ke každému požadavku, srovnání s obcemi kraje a nejbližší místo. Bez požadavků nejbližší základní služby. Ke srovnání obcí volej pro každou.',
      obj(
        {
          obec: str('název nebo kód obce (diakritika nevadí); stejnojmenné obce rozliš parametrem orp'),
          orp: str('ORP obce (volitelné)'),
          pozadavky: idsParam('id požadavků z výčtu u kde_se_mi_bude_zit (volitelné)'),
          velmi_dulezite: idsParam('id s dvojnásobnou váhou (volitelné)'),
        },
        ['obec'],
      ),
    ),
  ];
}

/** Pole id požadavků bez výčtu – výčet je jen jednou (u kde_se_mi_bude_zit), šetří tokeny. */
const idsParam = (description: string) => ({ type: 'array', items: { type: 'string' }, description });

// --- pomocné ---------------------------------------------------------------

function zdroje(ctx: KontextDat, ids: string[]) {
  return ctx.snap.manifest.sources
    .filter((s) => ids.includes(s.id))
    .map((s) => `${s.title} (${s.provider})`);
}

/** Limit výsledků; model občas pošle číslo jako text („3“). */
function limit(v: unknown, vychozi: number, max = MAX_LIMIT): number {
  const x = typeof v === 'string' && v.trim() ? Number(v) : v;
  const n = typeof x === 'number' && Number.isFinite(x) ? Math.floor(x) : vychozi;
  return Math.max(1, Math.min(max, n));
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
export function najdiObce(ctx: KontextDat, nazev: string, max = 5): { kod: AreaCode; nazev: string }[] {
  const q = bezDiakritiky(nazev.trim());
  if (!q) return [];
  const all = Object.entries(ctx.obecNames).map(([kod, n]) => ({ kod, nazev: n, k: bezDiakritiky(n) }));
  const rank = (k: string) => (k === q ? 0 : k.startsWith(q) ? 1 : k.includes(q) ? 2 : 3);
  return all
    .filter((o) => rank(o.k) < 3)
    .sort((a, b) => rank(a.k) - rank(b.k) || a.nazev.localeCompare(b.nazev, 'cs'))
    .slice(0, max)
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

// --- „Kde by se mi dobře žilo?“ ------------------------------------------------

const ZAKLADNI_SLUZBY = ['zastavka', 'lekar', 'lekarna', 'zakladni-skola', 'materska-skola', 'nemocnice'];
const NEOBYDLENA = 'Obec nemá stálé obyvatele, nehodnotíme ji.';

/** Kontext výpočtu je drahý (vzdálenosti obcí ke všem bodům) – jeden na snapshot a sadu obcí. */
const zivotMemo = new WeakMap<Snapshot, { obce: KontextDat['obecCentroidy']; zc: ZivotKontext }>();
function zivotKontext(ctx: KontextDat): ZivotKontext {
  const hit = zivotMemo.get(ctx.snap);
  if (hit && hit.obce === ctx.obecCentroidy) return hit.zc;
  const zc = vytvorKontext(ctx.snap, ctx.obecCentroidy, ctx.obecNames);
  zivotMemo.set(ctx.snap, { obce: ctx.obecCentroidy, zc });
  return zc;
}

type GeoProps = { code?: string; name?: string; parent?: string };
function geoProps(ctx: KontextDat, id: 'kv-obce' | 'kv-orp'): GeoProps[] {
  const topo = ctx.snap.geo[id] as { objects?: Record<string, { geometries?: { properties?: GeoProps }[] }> } | undefined;
  return (topo?.objects?.areas?.geometries ?? []).map((g) => g.properties ?? {});
}
/** kód obce → název ORP (z geodat; bez nich prázdné). */
function orpObci(ctx: KontextDat): Record<AreaCode, string> {
  const orp = Object.fromEntries(geoProps(ctx, 'kv-orp').map((p) => [p.code, p.name ?? '']));
  const out: Record<AreaCode, string> = {};
  for (const p of geoProps(ctx, 'kv-obce')) if (p.code && p.parent && orp[p.parent]) out[p.code] = orp[p.parent];
  return out;
}

/** Platná id požadavků z argumentu; neznámá zvlášť. */
function idsZArg(v: unknown): { ok: string[]; nezname: string[] } {
  const arr: unknown[] = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const ids = [...new Set(arr.map(text).filter(Boolean))];
  return { ok: ids.filter((id) => id in POZADAVKY_BY_ID), nezname: ids.filter((id) => !(id in POZADAVKY_BY_ID)) };
}
/** Výběr požadavků: pozadavky ∪ velmi_dulezite, velmi důležité s váhou 2. */
function vyberZArg(a: Record<string, unknown>): { vybrane: Record<string, Dulezitost>; nezname: string[] } {
  const zakl = idsZArg(a.pozadavky);
  const velmi = idsZArg(a.velmi_dulezite);
  const vybrane: Record<string, Dulezitost> = {};
  for (const id of zakl.ok) vybrane[id] = 1;
  for (const id of velmi.ok) vybrane[id] = 2;
  return { vybrane, nezname: [...new Set([...zakl.nezname, ...velmi.nezname])] };
}
const bezPozadavku = (nezname: string[]) => ({
  chyba: `Žádný platný požadavek${nezname.length ? ` (neznámá id: ${nezname.join(', ')})` : ''}. Platná id jsou ve výčtu parametru pozadavky nástroje kde_se_mi_bude_zit.`,
});
const neznameText = (n: string[]) => (n.length ? `${n.join(', ')} – neznámé, vynechány` : null);
const nazevVahy = (vybrane: Record<string, Dulezitost>) =>
  Object.keys(vybrane).map((id) => `${POZADAVKY_BY_ID[id].label}${vybrane[id] === 2 ? ' (velmi důležité)' : ''}`);

/** ORP podle názvu (bez diakritiky, i „ORP X“): přesná shoda, jinak jediný začátek názvu. */
function najdiOrp(orpy: Record<AreaCode, string>, v: unknown): { orp: string } | { chyba: string } {
  const q = bezDiakritiky(text(v).replace(/^orp\s+/i, ''));
  const nazvy = [...new Set(Object.values(orpy))].sort((x, y) => x.localeCompare(y, 'cs'));
  const presne = nazvy.find((n) => bezDiakritiky(n) === q);
  if (presne) return { orp: presne };
  const zacatek = q ? nazvy.filter((n) => bezDiakritiky(n).startsWith(q)) : [];
  if (zacatek.length === 1) return { orp: zacatek[0] };
  if (zacatek.length > 1) return { chyba: `ORP „${text(v)}“ není jednoznačné: ${zacatek.join(', ')}.` };
  return { chyba: `ORP „${text(v)}“ v kraji není. ORP kraje: ${nazvy.join(', ')}.` };
}

type ObecVen = { kod: AreaCode; nazev: string; orp: string | null };
/**
 * Obec pro obec_bydleni: kód obce, „Název (ORP)“ nebo název (+ volitelné orp).
 * Stejnojmenné obce (2× Chodov, 2× Březová) se rozliší ORP nebo kódem.
 */
function obecProBydleni(ctx: KontextDat, orpy: Record<AreaCode, string>, a: Record<string, unknown>): ObecVen | { chyba: string; kandidati?: ObecVen[] } {
  let dotaz = text(a.obec);
  if (!dotaz) return { chyba: 'Zadejte název obce.' };
  const ven = (kod: AreaCode): ObecVen => ({ kod, nazev: ctx.obecNames[kod], orp: orpy[kod] ?? null });
  if (dotaz in ctx.obecNames) return ven(dotaz);
  let orpArg = text(a.orp);
  const zav = /^(.+?)\s*\((.+)\)$/.exec(dotaz);
  if (zav) {
    dotaz = zav[1];
    orpArg ||= zav[2].replace(/^(orp|okres)\s+/i, '');
  }
  let kandidati = najdiObce(ctx, dotaz, Infinity).map((o) => ven(o.kod));
  if (!kandidati.length) return nenalezenaObec(dotaz);
  if (orpArg) {
    const o = najdiOrp(orpy, orpArg);
    if ('chyba' in o) return o;
    kandidati = kandidati.filter((k) => k.orp === o.orp);
    if (!kandidati.length) return { chyba: `Obec „${dotaz}“ v ORP ${o.orp} není.` };
  }
  const q = bezDiakritiky(dotaz);
  const presne = kandidati.filter((o) => bezDiakritiky(o.nazev) === q);
  if (presne.length === 1) return presne[0];
  if (!presne.length && kandidati.length === 1) return kandidati[0];
  return {
    chyba: `„${text(a.obec)}“ odpovídá více obcím – zavolej znovu s kódem obce (pole kod) nebo s orp.`,
    kandidati: (presne.length ? presne : kandidati).slice(0, 8),
  };
}

function zdrojePozadavku(ctx: KontextDat, ids: string[]) {
  const src = new Set<string>();
  for (const id of ids) {
    const m = POZADAVKY_BY_ID[id].metrika;
    if (m.druh === 'nejblizsi' || m.druh === 'pocet') {
      if ('vrstva' in m.vyber) {
        const s = ctx.snap.points[m.vyber.vrstva]?.sourceId;
        if (s) src.add(s);
      } else {
        // jen sady kategorií požadavku (celé výlety mají přes 20 zdrojů)
        const kat = m.vyber.kat;
        for (const x of ctx.snap.vylety?.mista ?? []) if (kat.includes(x.kat)) src.add(x.sourceId);
      }
    } else if (m.druh === 'ukazatel' || m.druh === 'velikost') {
      const s = ctx.snap.indicators.obec?.indicators[m.druh === 'ukazatel' ? m.ukazatel : 'obyvatele']?.sourceId;
      if (s) src.add(s);
    }
  }
  return zdroje(ctx, [...src]);
}

const veta = (zc: ZivotKontext, code: AreaCode, c: CastSkore) => vetaPozadavku(zc, c.id, code, c.value);

function kdeSeMiBudeZit(ctx: KontextDat, a: Record<string, unknown>) {
  const { vybrane, nezname } = vyberZArg(a);
  const ok = Object.keys(vybrane);
  if (!ok.length) return bezPozadavku(nezname);
  const zc = zivotKontext(ctx);
  const orpy = orpObci(ctx);
  let orp: string | null = null;
  if (text(a.orp)) {
    const o = najdiOrp(orpy, a.orp);
    if ('chyba' in o) return o;
    orp = o.orp;
  }
  const skore = spocitejSkore(zc, vybrane);
  const vsechny = poradi(skore, ctx.obecNames);
  return {
    pozadavky: nazevVahy(vybrane),
    nezname_pozadavky: neznameText(nezname),
    orp,
    hodnoceno_obci: vsechny.length,
    obce: vsechny
      .filter((r) => !orp || orpy[r.code] === orp)
      .slice(0, limit(a.limit, 5, MAX_LIMIT_ZIVOT))
      .map((r) => {
        const s = skore[r.code];
        // nejsilnější 2 a nejslabší 1 (u jediného požadavku jen silná stránka)
        const serazene = [...s.parts].sort((x, y) => y.percentile - x.percentile || y.weight - x.weight);
        const slaba = serazene.length >= 2 ? serazene[serazene.length - 1] : null;
        return {
          obec: ctx.obecNames[r.code] ?? r.code,
          kod: r.code,
          orp: orpy[r.code] ?? null,
          skore: Math.round(r.score),
          poradi: r.rank,
          silne: (slaba ? serazene.slice(0, -1) : serazene).slice(0, 2).map((c) => veta(zc, r.code, c)),
          slabsi: slaba ? veta(zc, r.code, slaba) : null,
          chybi_udaj: s.skipped.map((id) => POZADAVKY_BY_ID[id].label),
        };
      }),
    poznamka: 'skore 100 = nejlepší obec kraje; poradi = pořadí v kraji; obce bez stálých obyvatel se nehodnotí; km vzdušnou čarou od středu obce.',
    zdroje: zdrojePozadavku(ctx, ok),
  };
}

/** Nejbližší bod požadavku k obci, „název (obec)“. */
function nejblizsiBod(zc: ZivotKontext, id: string, code: AreaCode): string | null {
  const c = zc.obce[code];
  if (!c) return null;
  let best: { d: number; nazev: string } | null = null;
  for (const b of bodyPozadavku(zc, id)) {
    const d = vzdalenostKm(c.lat, c.lon, b.lat, b.lon);
    if (!best || d < best.d) best = { d, nazev: b.obecNazev ? `${b.nazev} (${b.obecNazev})` : b.nazev };
  }
  return best ? zkrat(best.nazev, 90) : null;
}

function obecBydleni(ctx: KontextDat, a: Record<string, unknown>) {
  const orpy = orpObci(ctx);
  const obec = obecProBydleni(ctx, orpy, a);
  if ('chyba' in obec) return obec;
  const zc = zivotKontext(ctx);
  const orp = obec.orp;
  if (zc.neobydlene.has(obec.kod)) return { obec: obec.nazev, kod: obec.kod, orp, poznamka: NEOBYDLENA };
  const { vybrane, nezname } = vyberZArg(a);
  const ok = Object.keys(vybrane);
  if (!ok.length && nezname.length) return bezPozadavku(nezname);
  const ids = ok.length ? ok : ZAKLADNI_SLUZBY;
  // se zadanými požadavky i celkové skóre a pořadí obce v kraji (stejné váhy jako v aplikaci)
  const vsechny = ok.length ? poradi(spocitejSkore(zc, vybrane), ctx.obecNames) : [];
  const moje = vsechny.find((r) => r.code === obec.kod);
  return {
    obec: obec.nazev,
    kod: obec.kod,
    orp,
    velmi_dulezite: ok.filter((id) => vybrane[id] === 2).map((id) => POZADAVKY_BY_ID[id].label),
    skore: moje ? Math.round(moje.score) : null,
    poradi: moje ? `${moje.rank}. z ${vsechny.length}` : null,
    nezname_pozadavky: neznameText(nezname),
    pozadavky: ids.map((id) => {
      const p = POZADAVKY_BY_ID[id];
      const v = metrika(zc, id).values[obec.kod];
      if (v === null || v === undefined) return { pozadavek: p.label, veta: 'Údaj chybí.' };
      const s = srovnani(zc, id, obec.kod);
      return {
        pozadavek: p.label,
        veta: vetaPozadavku(zc, id, obec.kod, v),
        srovnani: s ? textSrovnani(s) : null,
        nejblizsi: p.metrika.druh === 'nejblizsi' ? nejblizsiBod(zc, id, obec.kod) : null,
      };
    }),
    poznamka: 'srovnani = s ostatními obcemi kraje; km vzdušnou čarou od středu obce.',
    zdroje: zdrojePozadavku(ctx, ids),
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
    case 'kde_se_mi_bude_zit':
      return kdeSeMiBudeZit(ctx, a);
    case 'obec_bydleni':
      return obecBydleni(ctx, a);
    default:
      return { chyba: `Nástroj „${nazev}“ neexistuje.` };
  }
}

/** Skupiny oborů pro systémový pokyn (kód → název). */
export const SKUPINY_TEXT = Object.entries(SKUPINY)
  .map(([k, v]) => `${k} ${v}`)
  .join(', ');
