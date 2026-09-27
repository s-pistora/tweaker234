# KRAJ-TERM – design spec (2026-09-27)
_(Po schválení se tento spec zkopíruje do `docs/superpowers/specs/2026-09-27-kraj-term-design.md` a commitne.)_

## Context
24h hackathon pořádaný **Karlovarským krajem** (CZ041; 7 ORP, 134 obcí). Zadání: udělat z otevřených dat něco,
co dává smysl lidem. Odpověď: webová „GIS stanice z 90. let“ na zeleném CRT monitoru, která odpovídá na
„Kde by se mi dobře žilo?“ a „Jak se můj kraj změnil?“. Jádrem je drill-down do KV kraje (ORP → obce) s daty
kraje a jeho organizací. Tým = uživatel + Claude (subagenti), čas běží od teď, hosting zatím žádný.

**Úspěch** = na demu porota uvidí: boot sekvenci s reálným načtením dat → mapu ČR → přiblížení do KV kraje
s krajskými daty (školy, lékaři, soc. služby, zastávky, vouchery) → srozumitelné věty a zdroje u každého čísla.
Priorita: funkční > vizuální dojem > rozsah.

## Rozhodnutí
| Téma | Rozhodnutí |
|---|---|
| Publikum | porota hackathonu (wow + viditelná práce s krajskými daty) |
| Architektura | **A**: build-time pipeline → JSON snapshot + manifest → statický web; **C (bonus)**: živá kontrola aktuálnosti z prohlížeče (DataStat má CORS `*`) |
| Stack | Vite + Svelte 5 + TypeScript + D3 + topojson-client, Vitest, mapshaper (Node) |
| Spuštění | `npm install && npm run dev`; `npm run data:update`; statický build → GH Pages/Netlify později |
| Jazyk UI | česky, terminálový styl (`> DOTAZ UZEMI=CZ041 …`, `NAČÍTÁM DATA… OK`) |
| Skóre „Kde by se mi dobře žilo?“ | na obou úrovních (kraje ČR i ORP/obce KV), jedna generická funkce |
| Nezaměstnanost obcí | povoleno 2023 (jediná oficiální), zřetelně označit rokem |
| Mzda pod krajem | neexistuje oficiálně → nezobrazovat |

## Ověřené zdroje (requesty provedeny 2026-09-27)
**Geodata – ČÚZK RÚIAN SHP** `https://services.cuzk.gov.cz/shp/stat/epsg-5514/1.zip` (251 MB, denně, S-JTSK,
DBF CP1250; vrstvy `VUSC_P`, `ORP_P`, `OBCE_P`; lze číst jen potřebné položky zipu přes HTTP Range). CC BY 4.0.
KV: VUSC 51 / CZ041; ORP RÚIAN 507 Aš, 515 Cheb, 523 Mar. Lázně, 531 KV, 540 Ostrov, 663 Kraslice, 671 Sokolov.

**Číselníky ČSÚ** `https://apl2.czso.cz/iSMS/do_cis_export?kodcis={100|65|43}&typdat=0&cisjaz=203&format=2&separator=%2C`;
vazba obec→ORP `kodcis=43&typdat=1&cisvaz=65_1182`. Převod RÚIAN↔ČSÚ přes sloupec `kod_ruian`
(ORP 531↔4103, kraj 51↔3051/CZ041; obec kód shodný).

**ČSÚ DataStat** `https://data.csu.gov.cz/api/dotaz/v1/data/sady/{sada}/vlastni?format=CSV&kodCiselniku=true&…`
(CORS `*`). Sady: PORKR01 (obyvatelé krajů 2000–2025), OBY01B (pohyb do ORP), OBY01B01 (ORP→obec, dim Uz45B),
OBY02E (věkové skupiny `VEKC,VEK014,VEK1564,VEK65AV`, do obce), PORKR02/03/04 (přírůstky na 1000, průměrný věk,
index stáří), NEZ01 (podíl nezaměstnaných, kraj, posl. 2024), MZDR (mzda, kraj, `ZJIST=2`). ČSÚ ORP KV = 4101–4107.
Ukázka: KV obyvatelé 2024 = 293 195, 2025 = 292 027; nezam. 2024 = 4,85 %; mzda 2024 = 39 257 Kč.

**KROK** `https://opendata.czso.cz/data/od_krok01/krok_data_{2000..2025}.csv` + `krok_uzemi.csv`, `krok_ukaz.csv`
(kraj/okres/ORP; vlastní kódy, KV kraj 0410) → časové řady + **druhý zdroj pro kontrolu**.
**ČSÚ 250169** nezaměstnaní dle obcí (posl. 2023 data), **ČSÚ 130141** pohyb obyvatel obcí (2024). Licence ČSÚ CC BY 4.0.

**Karlovarský kraj** (92 sad v NKOD, IČO 70891168) přes ArcGIS Hub
`https://www.datazapad.cz/api/download/v1/items/<id>/{csv|geojson}?layers=N` (302 → hub.arcgis.com, CORS `*`):
školy do VOŠ `11796bcb67ee47bd8d38c0ec271b2787` L3 (269, CC0); poskytovatelé soc. služeb
`8a71d71444f14acd8d43023ce9c3fb95` L0 (220, CC0, filtrovat CZ041); autobusové zastávky
`979283f4b7ec4b778b8eed7aab6917c3` L0 (1840, CC BY 4.0); vouchery inovační `b59dc439…`, kreativní `387d1403…`,
asistenční `6cd2b71c…`, startovací `7974da46…`/`2ec6469e…` (Kč žádané/přidělené, CC BY 4.0); projekty kraje
`3f9c9a95…`, `59e91375…`; nemocnice, pohotovost, ZZS, pobytová péče pro seniory. Plná ID doplní agent Data kraje
z NKOD. Pasti: WKT má prohozené lat/lon → brát sloupce WGS84; UTF-8 s BOM.
**ÚZIS NRPZS** `https://nrpzs.uzis.cz/res/file/export/export-2026-09.csv` (1380 míst v KV; ORPKod, GPS; `;`,
cp1250; **bez CORS** → jen pipeline; URL obsahuje měsíc → sestavovat dynamicky s fallbackem na předchozí měsíc).
Neexistují otevřeně: přidělené krajské dotace, linky/jízdní řády → náhrada vouchery a hustotou zastávek.
Licence NRPZS/MŠMT neověřeny → ověří agent Data kraje; když nelze, uvést „neuvedeno poskytovatelem“.

## Architektura
```
scripts/
  update-data.ts            orchestrace: fetch → data-raw/ → transform → validate → public/data/
  sources/<zdroj>.ts        adaptér: fetch() + transform() → Indicator[] | PointLayer | Geo
  codes.ts                  převodník RÚIAN↔ČSÚ z číselníků
  validate.ts               počty území (14/7/134), klíčová čísla, cross-check vs KROK (tolerance 0,5 %)
  sources-md.ts             manifest.json → SOURCES.md
public/data/
  manifest.json             [{id, poskytovatel, url, licence, stazeno, rokPlatnosti, stav: ok|stale}]
  geo/kraje.topo.json, geo/kv-orp.topo.json, geo/kv-obce.topo.json
  indicators/{kraj|orp|obec}.json
  points/{skoly|zdravotnictvi|socialni|zastavky|vouchery}.json
  _fixtures/                malá ukázková data dle kontraktu (pro frontend a testy)
src/
  lib/types.ts              DATOVÝ KONTRAKT (sdílený)
  lib/data/                 loader snapshotu (+ bonus live check)
  lib/state.ts              {uroven, uzemi, ukazatel, rok, vahy, rezim} ↔ URL hash
  lib/score.ts              vážené skóre (čistá funkce)
  lib/sentences.ts          šablonové věty (čistá funkce)
  components/               Map, Tooltip, Detail, Timeline, WeightPanel, Sources, Legend
  components/crt/           AsciiPanel, Typewriter, Boot, CrtToggle
  styles/tokens.css, crt.css
```

### Datový kontrakt (`src/lib/types.ts`)
```ts
type Level = 'kraj' | 'orp' | 'obec';
type AreaCode = string;              // kraj: NUTS3 'CZ041'; orp: ČSÚ '4103'; obec: '554961'
interface IndicatorDef { id: string; label: string; unit: string; higherIsBetter: boolean;
  sourceId: string; decimals: number; }
interface IndicatorFile { level: Level; indicators: Record<string, IndicatorDef>;
  values: Record<string /*indId*/, Record<AreaCode, Record<number /*rok*/, number | null>>>;
  national?: Record<string, Record<number, number>>;   // průměr/hodnota ČR pro porovnání
  regional?: Record<string, Record<number, number>>; } // průměr KV kraje (pro orp/obec)
interface PointFeature { id: string; name: string; lon: number; lat: number; obec: AreaCode;
  orp: AreaCode; attrs: Record<string, string | number | boolean>; }
interface PointLayer { id: string; label: string; sourceId: string; validFor: string; features: PointFeature[]; }
interface SourceEntry { id: string; provider: string; title: string; url: string; license: string;
  downloadedAt: string; validFor: string; status: 'ok' | 'stale'; note?: string; }
```
Geo: TopoJSON objekt `areas`, vlastnosti `{code: AreaCode, name, parent?: AreaCode}` (kódy už převedené na ČSÚ/NUTS3).

### Ukazatele
- **Kraje** (časové řady od 2000 kde existují): obyvatelé, přírůstek celkový na 1000, podíl 0–14 a 65+,
  průměrný věk, index stáří, podíl nezaměstnaných, průměrná mzda.
- **ORP/obce KV**: obyvatelé, věková struktura, přírůstek; školy, soc. služby, zdravotnická místa, zastávky
  na 1000 obyv.; vouchery Kč/obyv.; nezaměstnanost (2023, označeno).

### Skóre (`score.ts`)
`skóre(území) = Σ wᵢ · pᵢ / Σ wᵢ` přes ukazatele s hodnotou; `pᵢ` = percentil (0–100) v rámci úrovně,
invertovaný pro `higherIsBetter=false`; chybějící hodnota → ukazatel vynechán, váhy renormalizovány a uvedeno.
Modál „Jak se to počítá?“ ukáže vzorec a rozpad pro vybrané území.

### Věty (`sentences.ts`)
Šablony s pravidly: rozdíl vs ČR (|Δ| < 2 % → „přibližně na úrovni“), trend za n let v p. b./%, zaokrouhlení
dle `decimals`, chybějící data → „Údaj za rok X není k dispozici.“ Bez AI.

### Interakce
Hover → zvýraznění + náhled (název, 2–3 čísla s rokem); klik → detail + radarový zoom (viewBox 600 ms);
mobil: 1. tap náhled, 2. tap detail; klávesnice: šipky = nejbližší soused podle centroidu ve směru, Enter =
detail, Esc = o úroveň výš. Drill-down jen KV (kraj → 7 ORP → obce ORP), přepínatelné bodové vrstvy.
Ostatní kraje: detail z ČSÚ. Výběr ukazatele obarvuje mapu (5 kvantilových tříd), porovnání s ČR (a s KV).
URL: `#/{uroven}/{kod}?u=<ukazatel>&r=<rok>&m=<rezim>&w=<id:váha,…>`.

### Retro design
Tokeny v `tokens.css` (bg `#0a0f0a`, fosfor `#33ff66` ve 4 jasech, amber `#ffb000` jen akcent/varování);
VT323 (nadpisy/čísla) + IBM Plex Mono (text). CRT: scanlines, vinětace, zakřivení rámu, flicker ≤ 3 %;
`.crt-off` vše vypne, stejně `prefers-reduced-motion`; přepínač v liště (localStorage). Kartogram = SVG
patterns (prázdná → řídké body → husté body → šrafování → plná). ASCII panely, typewriter (přeskočitelný),
boot sekvence svázaná s reálnými requesty (≤ ~3 s, Esc/[PŘESKOČIT]). Zvuky WebAudio, default OFF (bonus).
Přístupnost: kontrast ≥ 7:1, `role="button"`, `aria-label`, focus ring amber, `aria-live` pro náhled/detail,
screen reader dostane plný text bez typewriteru. Layout: desktop mapa 60 % + panel; mobil stack, bez h-scrollu.

### Chyby
Pipeline: selhání zdroje → ponechat poslední snapshot, `status: stale`; selhání validace → exit 1, nic nezapsat.
Frontend: `N/A` s důvodem; live check selže → tichý log, jede snapshot. UI: „Data aktualizována: <datum>“.

### Testy (Vitest, TDD)
Adaptéry nad zachycenými ukázkovými odpověďmi (fixtures z ověřených requestů), `codes.ts`, agregace bodů na
ORP/obec, `score.ts`, `sentences.ts` (tabulka případů), URL round-trip, `validate.ts`. Smoke build. Ruční ověření
screenshotem (claude-in-chrome) na desktopu a mobilní šířce.

## MVP vs bonus
- **MVP**: pipeline (ČSÚ + krajská data + geodata + manifest/SOURCES.md), mapa krajů s hover/klik/klávesnicí,
  detail s větami a zdroji, drill-down KV (ORP/obce + bodové vrstvy), retro design + boot + CRT toggle, README.
- **Bonus** (v pořadí): URL stav → „Kde by se mi dobře žilo?“ → časová osa s animací → live check aktuálnosti
  (C) → GitHub Action cron + nasazení → zvuky.

---

