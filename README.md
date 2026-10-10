# KRAJ-TERM

> Kam na střední? Kam vyrazit? Kde by se mi dobře žilo? Jak se můj kraj změnil?

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

## Kam vyrazit

Jedna stránka s menu kategorií (rozcestník) a z ní podstránky. Každá kategorie má **interaktivní mapu,
seznam, detail místa a filtry přímo pro danou kategorii**. Vše je jen z Karlovarského kraje.

| kategorie | filtry navíc ke vzdálenosti a hledání |
|---|---|
| Sjezdovky a vleky | velikost areálu (počet vleků a lanovek), lanovka, pás pro začátečníky, provoz jen v zimě / i mimo zimu |
| Koupání v přírodě | **kvalita vody z posledního odběru** (výtah ze stránek Krajské hygienické stanice), s provozovatelem / volná příroda |
| Bazény a aquaparky | aquapark / bazén / koupaliště, vstupné |
| Hrady a zámky | hrad / zámek / zřícenina / tvrz, přístupné veřejnosti, kulturní památka, vstupné |
| Rozhledny | rozhledna / vyhlídková věž / vyhlídka, volně přístupná, vstupné |
| Muzea a galerie | muzeum / galerie / skanzen, vstupné |
| Divadla a kina | divadlo / kino / letní kino / kulturní dům |
| S dětmi | zvířata, lanové a zábavní centrum, farma, koně, pod střechou, vstupné |
| Příroda | přírodní pozoruhodnost / botanická zahrada / arboretum, chráněné území |
| Prameny | kolik vody teče, minerální / radioaktivní, pitný, v obci |
| Sport | hala, areál, zimní stadion, golf, jezdectví |
| Pivovary | pivovar / minipivovar |

- **Odkud vyrážíte + jak daleko**: obec z nabídky nebo kliknutím do mapy. Mapa obcí je obarvená podle
  počtu míst v dosahu, kolem bydliště je kružnice dosahu, seznam se řadí od nejbližšího.
- **Detail místa**: věta lidskou řečí, popis, provoz, web, kontakt, odkaz na plánování cesty
  (Mapy.cz) a co dalšího je do 5 km.
- Stav (kategorie, filtry, vybrané místo) je v adrese a tlačítko **Sdílet** zkopíruje odkaz.
- **Průvodce** pro nové uživatele: při první návštěvě (a kdykoli tlačítkem v liště) projde krok po
  kroku menu, rozcestník, filtry, mapu a seznam. Pak vrátí stránku tam, kde uživatel byl.
- „Mapa kraje“ a „Kde by se mi žilo“ ukazují jen Karlovarský kraj (7 ORP → 134 obcí). Data za Česko
  zůstávají jen jako srovnávací základna v detailu území.

### Data pro „Kam vyrazit“

21 datových sad Karlovarského kraje z DATAZÁPADU (630 míst, licence CC BY 4.0). Sady čteme přes REST
API jejich ArcGIS služeb, protože CSV export z Hubu u části sad vrací 404. Konkrétní seznam je
v [SOURCES.md](SOURCES.md) a v aplikaci pod „Zdroje dat“.

Kvalitu vody kraj jako otevřená data nezveřejňuje. Sada koupacích míst ale u každého místa odkazuje
na stránku Krajské hygienické stanice. Z ní bereme poslední hodnocení (ikona v tabulce odběrů). Když
má místo víc odběrných míst, platí nejhorší výsledek. Licence webu KHS není uvedena, proto u každého
údaje odkazujeme přímo na zdrojovou stránku.

Kraj nezveřejňuje kalendář akcí ani obsazenost sjezdovek. Místo toho ukazujeme místa, kde se akce
konají (divadla, kina, kulturní domy), a velikost areálů. Aktualizace: `npm run data:vylety`.

## Památky a historie (kategorie v „Kam vyrazit“)

140 památek z 6 sad DATAZÁPAD: památky UNESCO (6), národní kulturní památky (15), náboženské (27),
archeologické (69), hornické a technické (22), vojenské a pietní (11). Stejné místo uvedené ve více
sadách (např. klášter Teplá je NKP i církevní památka) se sloučí do jednoho se všemi štítky.
Filtry: druh památky, přístupné / prohlídky, vstupné. Součást `npm run data:vylety`.

## Regionální dobroty (kategorie v „Kam vyrazit“)

156 oceněných výrobků ze soutěže **Dobroty Karlovarského kraje** (2017–2026) sloučených do 39 výrobců:
kde je najdete, co vyrábějí (maso, mléčné výrobky, pečivo, nápoje, ovoce a med), kolikrát a kdy uspěli
a jestli vyhráli svou kategorii. Data: DATAZÁPAD, sada „Dobroty Karlovarského kraje“ (CC0),
součást `npm run data:vylety`.

## Peníze kraje – „Co kraj buduje a komu dává“

- **Projekty kraje:** 6 běžících projektů s rozpočtem, dotací, termínem a průběhem v čase
  (např. Karlovarské inovační centrum 635 mil. Kč), 17 dokončených projektů jako časová osa.
- **Vouchery pro firmy:** 341 žádostí 2012–2024, 200 podpořených, 24,2 mil. Kč – podle let, typu
  (inovační, kreativní, asistenční, startovací) a ORP, seznam podpořených projektů.
- **Strategie kraje:** 59 strategických dokumentů s platností a oblastmi, filtr „platí letos“.

Data (DATAZÁPAD): aktuální a ukončené projekty kraje, seznam strategických dokumentů, vouchery.
Aktualizace: `npm run data:penize`.

**Nalezené nesrovnalosti v datech:** částky ve třech různých formátech, data někdy jen jako rok,
duplicitní řádky v ukončených projektech, 3 „aktuální“ projekty s plánovaným koncem v minulosti,
2 aktuální projekty bez uvedených výdajů.

## Úřady – „Kam s tím na úřad?“

Vyberete obec a aplikace ukáže **příslušné úřady s kontakty**: obecní úřad, úřad obce s rozšířenou
působností (občanky, pasy), matriku s úředními hodinami, stavební úřad (podle katastrálního území)
a živnostenský úřad – s telefonem, e-mailem, datovou schránkou (tlačítko Kopírovat) a odkazem na Mapy.cz.
Rozcestník životních situací („Stavím“, „Začínám podnikat“, „Svatba, narození, úmrtí“, „Občanka nebo pas“,
„Trvalý pobyt a poplatky“) zvýrazní správný úřad. Obec se převezme z ostatních režimů.

Data (DATAZÁPAD, CC0): stavební úřady podle katastrálních území, obecní živnostenské úřady podle obcí,
matriční úřady, seznam obcí Karlovarského kraje. Aktualizace: `npm run data:urady`.

**Chyby nalezené v datech kraje** (aplikace s nimi počítá a ukazuje upozornění):
- živnostenské úřady: Otovice mají neexistující kód obce `574317` (správně `537969`),
- živnostenské úřady: kód `560383` je uveden 2× – u Chodova (u Sokolova) i Chodova (u Bečova),
- stavební úřady: chybí katastrální území obce Chodov (u Bečova),
- matriky: data neobsahují matriční obvody (kterou matriku obec používá), názvy jen „Městský Úřad“ bez obce.

## Použití AI

- **Claude Code (Anthropic)** – průzkum datového katalogu, návrh a plán funkce, většina kódu režimu
  „Kam na střední“ (datový adaptér, výpočty, komponenty) a testy. Kód jsme procházeli, testovali
  a čísla ručně ověřovali proti CSV a webům škol.
- Tým: výběr tématu a cílové skupiny, kontrola dat, texty v aplikaci, design, prezentace.
- Věty v aplikaci jsou šablony nad daty. Jedinou AI v aplikaci je volitelný **AI poradce** (Groq) – viz níže.

## Co vzniklo před hackathonem a co během něj

Upřímně: základ aplikace **KRAJ-TERM** (mapa krajů/ORP/obcí, datová pipeline ČSÚ/ČÚZK/DATAZÁPAD,
režim „Kde by se mi dobře žilo?“, původně v retro CRT vzhledu) napsal člen týmu před akcí (commity z 27.–28. 9. 2026).
**Během hackathonu (9.–10. 10. 2026)** vznikl režim **„Kam na střední“** – nová data záměrů
přijímání SŠ, výpočty naplněnosti, mapa dostupnosti, seznam, detail školy a přehled pro kraj,
nový vzhled celé aplikace podle brandbooku, režim **„Kam vyrazit“** (12 kategorií z 21 sad kraje,
kvalita vody z KHS), průvodce pro nové uživatele a omezení map jen na Karlovarský kraj
(viz historie commitů od 9. 10. 2026).

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

### AI poradce (lokálně)

Plovoucí chat vpravo dole odpovídá lidskou řečí, ale **jen z dat, která aplikace načetla**: model (Groq,
výchozí `openai/gpt-oss-120b`) nevidí nic jiného než výsledky nástrojů v `src/lib/poradce/nastroje.ts`
(obory SŠ, místa pro výlety, ukazatele obcí, body v mapě) a má pokyn říct „tohle v datech nemám“.

1. Klíč zdarma z https://console.groq.com/keys
2. `cp .env.example .env.local` a doplnit `GROQ_API_KEY=…` (`.env.local` je v `.gitignore`)
3. `npm run dev` – klíč drží jen lokální proxy `/api/poradce` (`vite-plugin-poradce.ts`), do prohlížeče
   ani do buildu se nedostane

Na statickém webu (GitHub Pages) proxy není, takže se poradce vůbec nezobrazí.

Další příkazy:

| příkaz | co dělá |
|---|---|
| `npm run data:skoly` | stáhne záměry přijímání SŠ (3 roky) a zapíše `public/data/skoly/obory.json` |
| `npm run data:vylety` | stáhne místa pro volný čas (21 sad DATAZÁPAD) a kvalitu vody (KHS), zapíše `public/data/vylety/mista.json` a `SOURCES.md` |
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
