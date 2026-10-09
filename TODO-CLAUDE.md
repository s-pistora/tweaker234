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

## TODO 1 – Kde by se mi žilo: přiblížení obce a nejbližší služby – HOTOVO (10. 10.)

- Klik na obec přiblíží mapu (`Map.svelte` prop `zoomTo`), tlačítko „Celý kraj“ / „Přiblížit …“, zavření detailu oddálí.
- Body všech vybraných požadavků (barva + plný tvar podle pořadí, `src/lib/zivot-mapa.ts`), legenda
  `ZivotVrstvy.svelte` s `aria-pressed` a „v obci N“; kreslí se jen výřez obce + nejbližší bod.
- Detail: „Co v obci není“ (nejbližší v obci B jako tlačítko, název + adresa) a „Vybrané místo“ po kliku na značku
  (odkaz na Mapy.cz). Bodové vrstvy adresu nemají → ukazuje se obec.
- Testy: `tests/zivot-mapa.test.ts`, nový případ v `tests/components/app-zivot.test.ts`.
- Známé: na mobilu (≤1000 px) překrývá detail mapu, přiblížení je vidět až po posunutí; nejbližší bod mimo výřez
  se kreslí, ale je mimo zobrazenou oblast (informace je v detailu).

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
