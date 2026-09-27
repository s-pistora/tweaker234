# KRAJ-TERM

> Kde by se mi dobře žilo? Jak se můj kraj změnil?

Webová „GIS stanice z 90. let“ nad otevřenými daty krajů ČR s detailem **Karlovarského kraje**
až na úroveň ORP a obcí. Hackathon Karlovarského kraje, 2026.

- mapa 14 krajů ČR (hover = náhled, klik / Enter = detail, šipky = pohyb mezi kraji, Esc = zpět),
- přiblížení do Karlovarského kraje: 7 ORP → 134 obcí, vrstvy škol, zdravotnictví, sociálních služeb,
  autobusových zastávek a krajských voucherů,
- detail území s větami „lidskou řečí“ (šablony, bez AI), grafem časové řady a věkovou strukturou,
- režim **„Kde by se mi dobře žilo?“** – vážené skóre podle posuvníků, s vysvětlením výpočtu,
- časová osa (data od roku 2000, kde existují), sdílitelný odkaz (stav je v URL),
- přepínač CRT efektů, respektuje `prefers-reduced-motion`, ovládání klávesnicí.

## Spuštění

```bash
npm install
npm run dev        # http://localhost:5173
```

Další příkazy:

| příkaz | co dělá |
|---|---|
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
Při startu (boot sekvence) se skutečně načítá manifest a všechny soubory snapshotu.

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
