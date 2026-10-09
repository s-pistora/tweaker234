# TODO pro dalšího Clauda

Stav k 10. 10. 2026. Pracuj **jen na větvi `Stepaisbestcz`** (GitHub nick uživatele). Do `main` ani `cecimilek`
nic nepushuj a nic nemerguj. Cizí větve (`cecimilek`, `smidovoposledníjizda`) stahuj jen na výslovný pokyn.
Uživatel píše česky a chce, aby ses průběžně ptal na podrobnosti.

## Hotovo (pro kontext)

- **Kam vyrazit**: 12 kategorií z 21 sad datazapad.cz (`npm run data:vylety`), kvalita vody z KHS.
- **Kam na střední** (Martin, `cecimilek`): rychlý start „Kde bydlíš?“ v úvodu.
- **Statistika kraje** (dřív Mapa kraje, `m=explore`): mimo hlavní menu, jako odkaz vedle „Zdroje dat“ a v patičce.
  Přehrávání časové osy jede přes všechny roky.
- **Kde by se mi dobře žilo?** (`m=score`): mapa 134 obcí, 27 požadavků (`src/lib/zivot.ts`), panel, TOP 10,
  detail obce. Neobydlené Hradiště (555177) se nehodnotí. URL `zp=id:1|2`, `zo=<obec>`, `zu=<požadavek>`.
- **AI poradce** (Groq, `src/lib/poradce/`): nástroje `kde_se_mi_bude_zit` a `obec_bydleni`. Lokálně potřebuje
  `GROQ_API_KEY` v `.env.local`.
- Průvodce pro nové uživatele (`src/components/Pruvodce.svelte`), tlačítko Sdílet, mobilní menu bez ořezu.
- Testy: `npm test` (372 prošlo), `npm run check` (0 chyb), `npm run build` OK.

## TODO 1 – Kde by se mi žilo: přiblížení obce a nejbližší služby (rozpracováno, NEDOKONČENO)

Úloha byla přerušena kvůli limitu. Nic z ní není ve větvi, začni znovu. Zadání od uživatele, odpovědi už dal:

1. Klik na obec (mapa, TOP 10, odkaz `zo=`) **přiblíží mapu na tu obec**. Na mapě je tlačítko „Celý kraj“
   a zavření detailu (✕/Esc) mapu oddálí. Respektuj `prefers-reduced-motion`.
   `src/components/Map.svelte` už má `zoomTarget` + `onzoomend` (viz `Drilldown.svelte`).
2. V přiblížené obci ukázat body **všech vybraných požadavků** (ne jen jednoho). Každý požadavek má jinou barvu
   i tvar značky a v legendě pod mapou je přepínač, kterým jde vrstvu skrýt (`aria-pressed`) a počet „v obci N“.
   Kreslit jen body ve výřezu + nejbližší bod každého požadavku (zastávek je 1840).
3. Když služba v obci není (např. praktický lékař je o vesnici dál), detail obce ukáže
   **„V obci A není. Nejbližší je v obci B (3,2 km): název, adresa“**. Obec B je tlačítko, které přepne detail
   i mapu na B. Uživatel zvolil **název + adresu místa** a **odkaz na sousední obec**; čáru na mapě nechce.
4. Klik na bod na mapě: v detailu box „Vybrané místo“ s názvem, adresou, obcí, vzdáleností od středu obce a odkazem
   `https://mapy.cz/zakladni?q=<název>&x=<lon>&y=<lat>&z=17`.
5. Čisté funkce (např. `src/lib/zivot-mapa.ts`): body požadavku, nejbližší bod, počet v obci, výřez pro zoom,
   s testy nad `public/data`. App test podle `tests/components/app-zivot.test.ts` (nezapomeň stub `ResizeObserver`).
6. Adresy: `snap.vylety.mista` mají `adresa`. Bodové vrstvy (`snap.points`) mají jen `name`, `obec` a `attrs`,
   proto zkontroluj, co v `attrs` je, a jinak použij název obce.

Postup, který se osvědčil: implementace (případně subagent v worktree **založeném ze `Stepaisbestcz`**, protože
worktree jinak vzniká z `main`), pak revizní subagent, oprava, druhá revize a teprve potom push.

## TODO 2 – další nápady (jen po domluvě s uživatelem)

- AI poradce: odkazy z odpovědí přímo do mapy (např. `#/kraj?m=score&zp=…&zo=…`). Teď chat zobrazuje jen text.
- `src/lib/score.ts`: `score()`, `eligibleIndicators` a `scoreIndicatorYear` už aplikace nepoužívá, jen testy
  a staré odkazy `w=`. Zvážit úklid.
- Uživatel slíbil další vlastní zadání („Něco jiného“), zeptej se ho na něj.

## Užitečné

- Snímky obrazovky: Playwright (`playwright-core`) se systémovým Chrome
  `C:/Program Files/Google/Chrome/Application/chrome.exe`, dev server `npx vite --port 5199`.
  Kontroluj šířky 1366, 820, 390 a 320 px (bez vodorovného posuvu).
- Chyba 503 v konzoli při běhu bez `GROQ_API_KEY` patří AI poradci, není to chyba aplikace.
- `Brandbook ČSÚ.pdf` je v kořeni repa lokálně, ale záměrně není v gitu (8 MB).
