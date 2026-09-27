# Zdroje dat

Soubor je generovaný příkazem `npm run data:update` z `public/data/manifest.json` (poslední běh: 2026-09-27T21:55:41.229Z). Neupravujte ručně.

| Poskytovatel | Datová sada | URL | Licence | Staženo | Platnost | Stav |
|---|---|---|---|---|---|---|
| Český statistický úřad | ČSÚ DataStat – obyvatelstvo, nezaměstnanost, mzdy (kraje, ORP a obce KV kraje) | <https://data.csu.gov.cz/api/dotaz/v1/data/sady/PORKR01/vlastni> | CC BY 4.0 | 2026-09-27 | 2025 | ok |
| Český statistický úřad (KROK) | KROK – krajská a okresní data (obyvatelé, nezaměstnanost, mzda – doplňkový zdroj a cross-check) | <https://opendata.czso.cz/data/od_krok01/krok_data_2025.csv> | CC BY 4.0 | 2026-09-27 | 2025 | ok |
| Karlovarský kraj (datazapad.cz / ArcGIS Hub) | Seznam škol a školských zařízení do stupně VOŠ v Karlovarském kraji | <https://www.datazapad.cz/api/download/v1/items/11796bcb67ee47bd8d38c0ec271b2787/csv?layers=3> | CC0 1.0 | 2026-09-27 | 2026 | ok |
| Karlovarský kraj (datazapad.cz / ArcGIS Hub) | Poskytovatelé sociálních služeb v Karlovarském kraji | <https://www.datazapad.cz/api/download/v1/items/8a71d71444f14acd8d43023ce9c3fb95/csv?layers=0> | CC0 1.0 | 2026-09-27 | 2026 | ok |
| Karlovarský kraj (datazapad.cz / ArcGIS Hub) | Autobusové zastávky v Karlovarském kraji | <https://www.datazapad.cz/api/download/v1/items/979283f4b7ec4b778b8eed7aab6917c3/csv?layers=0> | CC BY 4.0 | 2026-09-27 | 2026 | ok |
| Karlovarský kraj (datazapad.cz / ArcGIS Hub) | Vouchery Karlovarského kraje (inovační, kreativní, asistenční, startovací 2023/2024) | <https://www.datazapad.cz/api/download/v1/items/b59dc439b86147e4aefba8d94fc6aa9e/csv?layers=3> | CC BY 4.0 | 2026-09-27 | 2026 | ok |
| Karlovarský kraj (datazapad.cz / ArcGIS Hub) | Zdravotnictví Karlovarského kraje (nemocnice, pohotovost, výjezdové základny ZZS) | <https://www.datazapad.cz/api/download/v1/items/03dbe5719ab64960ae70ee90af4790c6/csv?layers=3> | CC BY 4.0 | 2026-09-27 | 2026 | ok |
| ÚZIS ČR – Národní registr poskytovatelů zdravotních služeb (NRPZS) | Národní registr poskytovatelů zdravotních služeb – místa poskytování | <https://nrpzs.uzis.cz/res/file/export/export-2026-09.csv> | neuvedeno poskytovatelem | 2026-09-27 | 2026-09 | ok |
| Český úřad zeměměřický a katastrální (ČÚZK) | RÚIAN – hranice krajů, ORP a obcí (SHP, EPSG:5514) | <https://services.cuzk.gov.cz/shp/stat/epsg-5514/1.zip> | CC BY 4.0 | 2026-09-27 | 2026-09-27 | ok |

### Poznámky ke zdrojům

- **ČSÚ DataStat – obyvatelstvo, nezaměstnanost, mzdy (kraje, ORP a obce KV kraje)** (`csu-datastat`): Sady PORKR01/02/03/04, OBY02E, OBY01B, OBY01B01 (2015–2025), NEZ01 (jen 2024 – jediný rok s krajovým rozpadem), MZDR se ZJIST=2 "pracovištní metoda" (výchozí ZJIST=1 nemá krajová data).
- **KROK – krajská a okresní data (obyvatelé, nezaměstnanost, mzda – doplňkový zdroj a cross-check)** (`krok`): Roky 2000–2025. Ukazatel mzda (kód 111211) je v KROK dostupný jen pro stavební podniky se sídlem na území s 50+ zaměstnanci – užší definice než ČSÚ DataStat MZDR, cross-check proto u mzdy očekává vyšší odchylku (viz report). Doplněny chybějící roky do krajských ukazatelů ČSÚ DataStat: obyvatele 2000–2014 (15 roků); nezamestnanost 2005–2025 (20 roků).
- **Autobusové zastávky v Karlovarském kraji** (`dz-zastavky`): Pipeline: vrstva zastavky – obec/ORP doplněny prostorovým přiřazením k hranicím obcí RÚIAN u 7 z 1840 bodů.
- **Vouchery Karlovarského kraje (inovační, kreativní, asistenční, startovací 2023/2024)** (`dz-vouchery`): Inovační vouchery 2020 - 2022: https://www.datazapad.cz/api/download/v1/items/b59dc439b86147e4aefba8d94fc6aa9e/csv?layers=3 (CC BY 4.0) | Kreativní vouchery 2020 - 2022: https://www.datazapad.cz/api/download/v1/items/387d1403bddb48b09ba4e3cd3b7894f8/csv?layers=0 (CC BY 4.0) | Asistenční vouchery 2020 - 2022 v Karlovarském kraji: https://www.datazapad.cz/api/download/v1/items/6cd2b71c45184327aab9375661268f5d/csv?layers=3 (CC BY 4.0) | Startovací vouchery v Karlovarském kraji v roce 2023: https://www.datazapad.cz/api/download/v1/items/7974da466d594bdea7953f3542ef5ca9/csv?layers=3 (CC BY 4.0) | Startovací vouchery v Karlovarském kraji v roce 2024: https://www.datazapad.cz/api/download/v1/items/2ec6469e9f76487f8325504d8313a5f3/csv?layers=3 (CC BY 4.0) Pipeline: vrstva vouchery – obec/ORP doplněny prostorovým přiřazením k hranicím obcí RÚIAN u 5 z 341 bodů.
- **Zdravotnictví Karlovarského kraje (nemocnice, pohotovost, výjezdové základny ZZS)** (`dz-zdravotnictvi-kraj`): Nemocnice v Karlovarském kraji: https://www.datazapad.cz/api/download/v1/items/03dbe5719ab64960ae70ee90af4790c6/csv?layers=3 (CC BY 4.0) | Lékařská a lékárenská pohotovostní služba v Karlovarském kraji: https://www.datazapad.cz/api/download/v1/items/72aa9de6abc94f949f3959e70e0d241d/csv?layers=0 (CC0 1.0) | Výjezdové základny zdravotnické záchranné služby v Karlovarském kraji: https://www.datazapad.cz/api/download/v1/items/4d7d80fc1d5f4f6bbb61a10b26d2a2aa/csv?layers=0 (CC0 1.0) | ZZS export neobsahuje kódy ORP/obce, orp i obec proto ponechány jako "". Pipeline: vrstva zdravotnictvi-kraj – obec/ORP doplněny prostorovým přiřazením k hranicím obcí RÚIAN u 13 z 33 bodů.
- **Národní registr poskytovatelů zdravotních služeb – místa poskytování** (`nrpzs`): Licence nenalezena na nrpzs.uzis.cz ani v NKOD (SPARQL data.gov.cz) – ověřeno 2026-09-27. Export neobsahuje ČSÚ kód obce (jen RÚIAN kód adresního místa a textový název), proto pole obec u prvků zůstává prázdné; agregace na úroveň obce tedy není z tohoto zdroje možná. Pipeline: vrstva zdravotnictvi – obec/ORP doplněny prostorovým přiřazením k hranicím obcí RÚIAN u 1377 z 1377 bodů.

## Licence

- Data Českého statistického úřadu (ČSÚ): CC BY 4.0, podmínky užití: <https://csu.gov.cz/podminky_pro_vyuzivani_a_dalsi_zverejnovani_statistickych_udaju_csu>. Zdroj: Český statistický úřad.
- Hranice území (RÚIAN): © ČÚZK, CC BY 4.0.
- Hodnoty z Karlovarského kraje: CC0/CC BY 4.0 (podle datové sady, portál datazapad.cz):
  - Seznam škol a školských zařízení do stupně VOŠ v Karlovarském kraji: CC0 1.0
  - Poskytovatelé sociálních služeb v Karlovarském kraji: CC0 1.0
  - Autobusové zastávky v Karlovarském kraji: CC BY 4.0
  - Vouchery Karlovarského kraje (inovační, kreativní, asistenční, startovací 2023/2024): CC BY 4.0
  - Zdravotnictví Karlovarského kraje (nemocnice, pohotovost, výjezdové základny ZZS): CC BY 4.0
- ÚZIS ČR – Národní registr poskytovatelů zdravotních služeb (NRPZS): licence dle poskytovatele – „neuvedeno poskytovatelem“.
