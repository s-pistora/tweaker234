import { describe, it, expect } from 'vitest';
import { renderSourcesMd } from '../scripts/sources-md.ts';
import type { Manifest, SourceEntry } from '../src/lib/types.ts';

const src = (over: Partial<SourceEntry>): SourceEntry => ({
  id: 'csu-datastat',
  provider: 'Český statistický úřad',
  title: 'ČSÚ DataStat – obyvatelstvo',
  url: 'https://data.csu.gov.cz/api/dotaz/v1/data/sady/PORKR01/vlastni',
  license: 'CC BY 4.0',
  downloadedAt: '2026-09-27T21:00:00.000Z',
  validFor: '2025',
  status: 'ok',
  ...over,
});

const manifest = (sources: SourceEntry[]): Manifest => ({
  updatedAt: '2026-09-27T21:05:00.000Z',
  sources,
  files: { indicators: {}, points: {}, geo: {} },
});

describe('renderSourcesMd', () => {
  const md = renderSourcesMd(
    manifest([
      src({}),
      src({
        id: 'dz-skoly', provider: 'Karlovarský kraj (datazapad.cz / ArcGIS Hub)', title: 'Školy | KV',
        url: 'https://www.datazapad.cz/x', license: 'CC0 1.0', validFor: '2026', status: 'stale', note: 'HTTP 500',
      }),
      src({ id: 'nrpzs', provider: 'ÚZIS ČR – NRPZS', title: 'NRPZS', url: 'https://nrpzs.uzis.cz/x', license: 'neuvedeno poskytovatelem', validFor: '2026-09' }),
    ]),
  );

  it('obsahuje tabulku s poskytovatelem, datovou sadou, URL, licencí, datem stažení, platností a stavem', () => {
    expect(md).toContain('| Poskytovatel | Datová sada | URL | Licence | Staženo | Platnost | Stav |');
    expect(md).toContain('| Český statistický úřad | ČSÚ DataStat – obyvatelstvo | <https://data.csu.gov.cz/api/dotaz/v1/data/sady/PORKR01/vlastni> | CC BY 4.0 | 2026-09-27 | 2025 | ok |');
    // svislítko v buňce je escapované, stale zdroj má poznámku
    expect(md).toContain('Školy \\| KV');
    expect(md).toMatch(/\| 2026 \| stale – HTTP 500 \|/);
    expect(md).toContain('2026-09');
  });

  it('sekce Licence jen pro přítomné poskytovatele', () => {
    expect(md).toContain('## Licence');
    expect(md).toContain('https://csu.gov.cz/podminky_pro_vyuzivani_a_dalsi_zverejnovani_statistickych_udaju_csu');
    expect(md).toContain('Hodnoty z Karlovarského kraje: CC0/CC BY 4.0');
    expect(md).toContain('ÚZIS');
    expect(md).not.toContain('ČÚZK');
    expect(md).toContain('2026-09-27T21:05:00.000Z');
  });

  it('bez zdrojů Karlovarského kraje hlášku o CC0/CC BY 4.0 neobsahuje', () => {
    const md2 = renderSourcesMd(
      manifest([src({}), src({ id: 'cuzk', provider: 'Český úřad zeměměřický a katastrální (ČÚZK)', title: 'RÚIAN' })]),
    );
    expect(md2).not.toContain('Hodnoty z Karlovarského kraje');
    expect(md2).toContain('ČÚZK');
    expect(md2).not.toContain('ÚZIS');
  });
});
