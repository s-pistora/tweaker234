# KRAJ-TERM – Karlovarský kraj v datech

> Kam na střední? Kam vyrazit? Kde by se mi dobře žilo? Kam s tím na úřad?

Webová aplikace nad **otevřenými daty Karlovarského kraje a státních úřadů**. Vzniklo na
**Hackathonu otevřených dat Karlovarského kraje 2026** (Cheb, 9.–10. 10. 2026).

- Živá verze: https://s-pistora.github.io/tweaker234/
- Jde o prototyp, ne o oficiální službu Karlovarského kraje ani jiného úřadu.

---

## Spuštění na vlastním počítači (localhost)

Potřebujete **Node.js 20 nebo novější** (https://nodejs.org) a **git**.

```bash
# 1. stáhnout projekt
git clone https://github.com/s-pistora/tweaker234.git
cd tweaker234

# 2. nainstalovat závislosti (jen poprvé)
npm install

# 3. spustit vývojový server
npm run dev
```

4. V prohlížeči otevřete **http://localhost:5173**.

Všechny příkazy spouštějte v kořenové složce projektu, tedy tam, kde je `package.json`.
Ve složce `public/` jsou jen data. Data jsou v repozitáři už stažená, takže aplikace běží
hned a bez internetu. Server zastavíte klávesami `Ctrl + C`.

### Volitelně: AI poradce

Chat „Zeptat se AI“ vpravo dole funguje jen s klíčem k Groq (zdarma):

1. Klíč získáte na https://console.groq.com/keys.
2. Zkopírujte `.env.example` jako `.env.local` a doplňte `GROQ_API_KEY=váš_klíč`.
3. Znovu spusťte `npm run dev`.

Bez klíče aplikace funguje celá, jen se AI poradce neukáže. Klíč zůstává na vašem počítači
(lokální proxy), do prohlížeče se nedostane.

### Další příkazy

| příkaz | co dělá |
|---|---|
| `npm run build` | sestaví statický web do složky `dist/` |
| `npm run preview` | spustí sestavený web (po `npm run build`) |
| `npm test` | spustí automatické testy |
| `npm run check` | kontrola typů |
| `npm run data:update` | znovu stáhne data ČSÚ, ČÚZK a ÚZIS |
| `npm run data:skoly`, `data:vylety`, `data:urady`, `data:penize`, `data:podnikani` | znovu stáhnou data jednotlivých částí |
| `npm run data:zmeny` | porovná nová data se starými a popíše změny |

---

## Co web obsahuje

### Úvodní stránka

- **Rychlé hledání obce** a karta **„Obec v kostce“**: nejbližší školy, lékař, lékárna, nemocnice,
  zastávky, úřady a tipy na výlet. Odkazy otevřou podrobnosti rovnou pro vybranou obec.
- **Dlaždice pěti oblastí** a ukázkové otázky pro AI poradce.
- **Co je nového v datech**: změny, které denně najde hlídač dat.

### Hlavní menu: 5 oblastí

**Vzdělání**
- **Kam na střední**: obory ve vašem okolí na mapě, kolik míst škola otevírá a jak byl obor loni
  obsazený, zastávky u školy a detail školy.
  - Srovnání až tří oborů vedle sebe.
  - **Plánovač přihlášek**: pořadí oborů, odhad šance, termíny přijímaček, export do kalendáře a tisk.
  - Nejbližší pedagogicko-psychologické poradny.
  - Přehled pro kraj: poloprázdné a přeplněné obory.

**Bydlení**
- **Kde by se mi žilo**: mapa 134 obcí seřazených podle toho, na čem vám záleží.
  - 27 požadavků: zastávka, lékař, škola, bazén, klidná obec, nízká nezaměstnanost…
  - Po kliknutí na obec ukáže, co v ní je a kde je nejbližší služba, když v obci chybí.
- **Úřady**: obecní úřad, matrika, stavební a živnostenský úřad pro každou obec, s kontakty,
  datovou schránkou a rozcestníkem „Stavím / Začínám podnikat / Svatba…“.
- **Moje obec**: vše o jedné obci na jedné stránce.

**Volný čas**
- **Kam vyrazit**: přes 800 míst ve 14 kategoriích.
  - Kategorie: sjezdovky, koupání, bazény, hrady a zámky, rozhledny, muzea, divadla a kina, s dětmi,
    příroda, prameny, sport, pivovary, památky a regionální dobroty.
  - Každá kategorie má mapu, seznam a vlastní filtry. U koupání je kvalita vody z posledního odběru
    hygieniků.
  - **Tip na celý den**: okruh tří míst s trasou v Mapy.cz.

**Práce a firmy**
- **Podnikání**: kreativci, inkubátory a coworkingy, průmyslové zóny.
- **Peníze kraje**: projekty kraje, vouchery pro firmy a strategie kraje.

**Data**
- **Statistika kraje**: čísla ČSÚ za ORP a obce (obyvatelé, věk, nezaměstnanost…) s časovou osou.
- **Pro kraj**: obce, kde lidem chybí služby (bílá místa), a výhled zájmu o obory.
- **Co jsme našli v datech**: chyby a mezery v datech kraje a automatické kontroly kvality.
- **Zdroje dat**: odkud každé číslo pochází, licence a datum stažení.

### Pro všechny části

- **Hledání napříč aplikací**: obec, škola, obor, místo, úřad i kreativec, i bez diakritiky.
- **Průvodce** pro nové uživatele: spustí se při první návštěvě a kdykoli tlačítkem v liště.
- **AI poradce**: odpovídá lidskou řečí, ale jen z dat aplikace (volitelné, viz výše).
- **Sdílet**: vše, co nastavíte, je v adrese stránky, takže odkaz otevře stejný pohled.
- **Karta obce k tisku** (A4 / PDF) pro starosty.
- **Stažení dat jako CSV** u výsledků.
- **Instalace na mobil (PWA)** a provoz bez signálu po první návštěvě.
- **Přístupnost**: ovládání klávesnicí, „Přeskočit na obsah“, respektuje omezení pohybu,
  vzhled podle Gov.cz (státní modrá, písmo Roboto, tlačítka 44 px).

---

## Data

Všechna data pocházejí **od orgánů veřejné správy**. Úplný seznam datových sad s odkazem,
licencí a datem stažení je v [SOURCES.md](SOURCES.md) a v aplikaci pod „Zdroje dat“.

| poskytovatel | co | licence |
|---|---|---|
| Karlovarský kraj (DATAZÁPAD, datazapad.cz) | školy a obory, místa pro volný čas, úřady, projekty, vouchery, podnikání, zastávky | CC0 / CC BY 4.0 dle sady |
| Český statistický úřad | obyvatelé, věk, nezaměstnanost, mzdy | CC BY 4.0 |
| ČÚZK – RÚIAN | hranice ORP a obcí | CC BY 4.0 |
| ÚZIS – registr poskytovatelů zdravotních služeb | lékaři a lékárny | neuvedeno poskytovatelem |
| Krajská hygienická stanice | kvalita vody ke koupání (výtah z webu) | neuvedeno poskytovatelem |

**Omezení:**
- Vzdálenosti jsou vzdušnou čarou, protože kraj nezveřejňuje jízdní řády.
- Kraj nezveřejňuje kalendář akcí ani obsazenost sjezdovek.
- Nezaměstnanost obcí je jen do prosince 2024 (ČSÚ sadu už neaktualizuje).
- Chyby, které jsme v datech našli, popisuje stránka „Co jsme našli v datech“.

**Aktualizace:** hlídač dat (`.github/workflows/hlidac.yml`) každé ráno stáhne data znovu. Při
skutečné změně je po úspěšných testech uloží a web znovu nasadí.

---

## Struktura projektu

```
src/            aplikace (Svelte 5 + TypeScript, vlastní SVG mapy)
  components/   části stránky (menu, mapy, jednotlivé oblasti)
  lib/          výpočty a logika (bez UI) – školy, výlety, bydlení, úřady, AI poradce…
public/data/    stažená data (JSON), aplikace z nich čte
scripts/        stahování a zpracování dat (npm run data:…)
tests/          automatické testy (Vitest)
```

Technologie: Vite, Svelte 5, TypeScript, D3 (d3-geo), topojson, Vitest.
Nasazení: GitHub Actions (`.github/workflows/deploy.yml`) – při pushi na `main` proběhnou
testy a web se publikuje na GitHub Pages.

## Použití AI při vývoji

- **Claude Code (Anthropic)** pomáhal s průzkumem datového katalogu, návrhem a většinou kódu
  a testů. Kód jsme procházeli, testovali a čísla ručně ověřovali proti zdrojovým datům.
- Tým vybral témata a cílové skupiny, kontroloval data a připravil texty, design a prezentaci.
- Věty v aplikaci jsou šablony nad daty. Jedinou AI uvnitř aplikace je volitelný AI poradce.

## Tým

| jméno | role |
|---|---|
| TODO | |
| TODO | |
| TODO | |
| TODO | |
| TODO | |

## Licence

Kód: [MIT](LICENSE). Data: podle licencí poskytovatelů (viz [SOURCES.md](SOURCES.md)).
