# KRAJ-TERM

> Kam na střední? Kde by se mi dobře žilo? Jak se můj kraj změnil?

**Hackathon otevřených dat Karlovarského kraje 2026** (Cheb, 9.–10. 10. 2026), kategorie SŠ.
Živá verze: https://s-pistora.github.io/tweaker234/

## Kam na střední (hlavní soutěžní funkce)

Deváťáci v Karlovarském kraji vybírají střední školu podle letáků a doslechu. Otevřená data kraje
přitom říkají, **kolik míst který obor nabízí, kolik žáků na něj loni opravdu nastoupilo a jak se
nabídka mění**. Režim `[KAM NA STŘEDNÍ]` to ukazuje na jednom místě:

- vyber obec, kde bydlíš (v nabídce nebo kliknutím do mapy), typ studia (maturita / výuční list),
  skupinu oborů a dosah v km,
- mapa obcí je obarvená podle toho, **kolik oborů je odtud v dosahu** – je vidět, kde mají děti
  na výběr a kde ne; školy jsou body barevně podle loňské naplněnosti,
- seznam oborů: vzdálenost, plánovaná místa 2026/27, vývoj od 2024/25, **jak byl obor loni obsazený**
  (přijatí k 30. 9. 2025 / plán 2025/26) a počet autobusových zastávek do 500 m,
- detail školy s větami lidskou řečí („Loni na obor … nastoupilo 14 z 17 plánovaných míst (82 %)…“),
- **přehled pro kraj** (užitek pro veřejnou správu): naplněnost podle skupin oborů a území ORP,
  TOP 10 poloprázdných oborů a TOP 10 oborů, kde zájem převýšil nabídku,
- stav filtrů je v adrese – odkaz jde poslat kamarádovi nebo výchovné poradkyni,
- na mapě je kružnice dosahu kolem bydliště, klik na značku školy otevře její detail.

### Vzhled

Celá aplikace (všechny tři pohledy) je navržená podle brandbooku vycházejícího z Gov.cz design
systému a jednotného vizuálního stylu státu: státní modrá `#00469B`, tmavě modrá `#0C1838`,
ledová `#F2F6FC`, žlutý fokus, písmo Roboto, datová paleta pro grafy, tlačítka a pole vysoká 44 px,
texty „číslo první, vždy se srovnáním“. Logo ani název žádného úřadu nepoužíváme – jde o prototyp.

Vzdálenosti jsou vzdušnou čarou: kraj jízdní řády jako otevřená data nezveřejňuje (proto počítáme
jen zastávky v okolí školy).

### Data pro „Kam na střední“

| datová sada (DATAZÁPAD, Karlovarský kraj) | odkaz | licence |
|---|---|---|
| Záměr počtu přijímaných uchazečů SŠ pro školní rok 2024/2025 | [CSV](https://www.datazapad.cz/api/download/v1/items/6f9302623bcd4a72af2ac674c3b46adf/csv?layers=0) | CC0 1.0 |
| Záměr počtu přijímaných uchazečů SŠ pro školní rok 2025/2026 | [CSV](https://www.datazapad.cz/api/download/v1/items/b69266abf22c4baa9fabeb437449c1e8/csv?layers=0) | CC0 1.0 |
| Záměr počtu přijímaných uchazečů SŠ pro školní rok 2026/2027 (vč. nově přijatých k 30. 9. 2025) | [CSV](https://www.datazapad.cz/api/download/v1/items/9332e5a45e0d4dd999bef99a6f51fd40/csv?layers=0) | CC0 1.0 |
| Autobusové zastávky v Karlovarském kraji | [CSV](https://www.datazapad.cz/api/download/v1/items/979283f4b7ec4b778b8eed7aab6917c3/csv?layers=0) | CC BY 4.0 |
| Hranice obcí a ORP – ČÚZK RÚIAN | viz [SOURCES.md](SOURCES.md) | CC BY 4.0 |

Pro žáky ze ZŠ ukazujeme jen obory, kam se po 9. třídě opravdu hlásí: sada obsahuje i vyšší
odborné školy, nástavbové a dálkové studium – ty z výběru i ze součtů vyřazujeme.

Úpravy dat: tři ročníky mají každý jiné záhlaví (např. překlep „Froma vzdělávání“) – sjednocujeme
je a spojujeme podle IZO školy + kódu oboru + formy; opravujeme překlep v kódu oboru `23-68/H/01`
a zdvojené uvozovky v názvech.
Naplněnost = nově přijatí k 30. 9. 2025 ÷ záměr 2025/26. Aktualizace: `npm run data:skoly`.

## Použití AI

- **Claude Code (Anthropic)** – průzkum datového katalogu, návrh a plán funkce, většina kódu režimu
  „Kam na střední“ (datový adaptér, výpočty, komponenty) a testy. Kód jsme procházeli, testovali
  a čísla ručně ověřovali proti CSV a webům škol.
- Tým: výběr tématu a cílové skupiny, kontrola dat, texty v aplikaci, design, prezentace.
- Aplikace sama AI nepoužívá – všechny věty jsou šablony nad daty.

## Co vzniklo před hackathonem a co během něj

Upřímně: základ aplikace **KRAJ-TERM** (mapa krajů/ORP/obcí, datová pipeline ČSÚ/ČÚZK/DATAZÁPAD,
režim „Kde by se mi dobře žilo?“, původně v retro CRT vzhledu) napsal člen týmu před akcí (commity z 27.–28. 9. 2026).
**Během hackathonu (9.–10. 10. 2026)** vznikl režim **„Kam na střední“** – nová data záměrů
přijímání SŠ, výpočty naplněnosti, mapa dostupnosti, seznam, detail školy a přehled pro kraj
a nový vzhled celé aplikace podle brandbooku (viz historie commitů od 9. 10. 2026).

## Tým

| jméno | role |
|---|---|
| TODO | |
| TODO | |
| TODO | |
| TODO | |
| TODO | |

## Původní funkce KRAJ-TERM

Webová mapa nad otevřenými daty krajů ČR s detailem **Karlovarského kraje**
až na úroveň ORP a obcí. Hackathon Karlovarského kraje, 2026.

- mapa 14 krajů ČR (hover = náhled, klik / Enter = detail, šipky = pohyb mezi kraji, Esc = zpět),
- přiblížení do Karlovarského kraje: 7 ORP → 134 obcí, vrstvy škol, zdravotnictví, sociálních služeb,
  autobusových zastávek a krajských voucherů,
- detail území s větami „lidskou řečí“ (šablony, bez AI), grafem časové řady a věkovou strukturou,
- režim **„Kde by se mi dobře žilo?“** – vážené skóre podle posuvníků, s vysvětlením výpočtu,
- časová osa (data od roku 2000, kde existují), sdílitelný odkaz (stav je v URL),
- respektuje `prefers-reduced-motion`, ovládání klávesnicí.

## Spuštění

```bash
npm install
npm run dev        # http://localhost:5173
```

Další příkazy:

| příkaz | co dělá |
|---|---|
| `npm run data:skoly` | stáhne záměry přijímání SŠ (3 roky) a zapíše `public/data/skoly/obory.json` |
| `npm run data:update` | stáhne data z oficiálních zdrojů, zvaliduje je a zapíše snapshot do `public/data/` + `SOURCES.md` |
| `npm test` | testy (Vitest) |
| `npm run build` | statický build do `dist/` (lze nasadit na GitHub Pages / Netlify / jakýkoli statický hosting) |

## Data

Všechna čísla pocházejí **výhradně od orgánů veřejné správy** – seznam datových sad s URL, licencí,
datem stažení a rokem platnosti je v [SOURCES.md](SOURCES.md) a v aplikaci pod tlačítkem `[ZDROJE]`.

| poskytovatel | co | licence |
|---|---|---|
| Český statistický úřad (DataStat API, databáze KROK, číselníky) | obyvatelstvo, věková struktura, přírůstek, nezaměstnanost, mzdy | CC BY 4.0 |
| Karlovarský kraj (datazapad.cz, NKOD) | školy, sociální služby, zastávky, vouchery, nemocnice/pohotovost/ZZS | CC0 / CC BY 4.0 dle sady |
| ÚZIS – Národní registr poskytovatelů zdravotních služeb | místa poskytování zdravotní péče | neuvedeno poskytovatelem |
| ČÚZK – RÚIAN | hranice krajů, ORP a obcí | CC BY 4.0 |

### Jak se data aktualizují

1. `npm run data:update` spustí adaptéry v `scripts/sources/`, každý stáhne svůj zdroj do `data-raw/`.
2. Data se sloučí, body z krajských registrů se přiřadí obcím (kód obce / bodový dotaz nad hranicemi
   ČÚZK) a dopočtou se ukazatele na 1000 obyvatel.
3. **Validace**: počty území (14 krajů, 7 ORP, 134 obcí) a křížová kontrola počtu obyvatel
   a nezaměstnanosti proti druhému zdroji ČSÚ (KROK), tolerance 0,5 %. Při chybě se nic nezapíše.
4. Když některý zdroj nejde stáhnout, zůstane jeho poslední platná verze a v aplikaci je označen `STALE`.

Snapshot v `public/data/` je zároveň **offline záloha** – aplikace běží i bez připojení k API.
Při startu se načítá manifest a všechny soubory snapshotu.

### Známá omezení dat

- Průměrná mzda existuje oficiálně jen za kraje – na úrovni ORP/obcí se nezobrazuje.
- Mzda nemá druhý nezávislý zdroj pro křížovou kontrolu (KROK obsahuje jen mzdy ve stavebnictví).
- Nezaměstnanost obcí: poslední vydání ČSÚ (sada 250169) je za prosinec 2024, sada se už neaktualizuje.
- Kraj nezveřejňuje přidělené dotace ani jízdní řády – náhradou jsou vouchery a hustota zastávek.
- Počty zařízení jsou stav registru ke dni stažení, děleny počtem obyvatel k 31. 12. posledního roku ČSÚ.

## Architektura

```
scripts/            datový pipeline (Node + TypeScript)
  sources/          adaptéry jednotlivých zdrojů
  pipeline/         slučování, odvozené ukazatele, prostorové přiřazení, atomický zápis
  update-data.ts    orchestrace
public/data/        snapshot (manifest.json, indicators/, points/, geo/)
src/                frontend (Svelte 5 + D3, vlastní SVG mapa)
docs/superpowers/   návrh (spec) a implementační plán
```

Stack: Vite, Svelte 5, TypeScript, D3 (d3-geo), topojson-client, mapshaper, Vitest.

Nasazení: GitHub Actions (`.github/workflows/deploy.yml`) – při pushi na `main` testy, build
a publikace na GitHub Pages. Žádné API klíče ani tajemství se nepoužívají (`.env.example` je prázdný).

## Licence

Kód: [MIT](LICENSE). Data: podle licencí poskytovatelů (viz výše a [SOURCES.md](SOURCES.md)).

*Prototyp z Hackathonu otevřených dat Karlovarského kraje 2026. Nejde o oficiální službu
Karlovarského kraje ani KIC KK.*
