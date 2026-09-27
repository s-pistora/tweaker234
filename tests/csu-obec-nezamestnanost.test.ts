import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildObecNezamestnanostFile, csuObecNezamestnanost, YEAR } from '../scripts/sources/csu-obec-nezamestnanost.ts';

const fx = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

describe('buildObecNezamestnanostFile – ČSÚ 250169 (nad fixture úryvku reálné odpovědi)', () => {
  const file = buildObecNezamestnanostFile(fx('nez-obce-250169-sample.csv'), 2024);

  it('podíl nezaměstnaných obce Karlovy Vary (prosinec 2024, oficiální ukazatel NEZ0004)', () => {
    expect(file.values.nezamestnanost['554961'][2024]).toBeCloseTo(5.376, 3);
  });

  it('uchazeči o zaměstnání (počet, NEZ0007) – bonus vedle povinného podílu', () => {
    expect(file.values.uchazeci['554961'][2024]).toBe(1780);
    expect(file.values.uchazeci['554481'][2024]).toBe(692);
  });

  it('bere prosincovou hodnotu, ne jinou měsíční (fixture obsahuje i červen 4,877 %)', () => {
    expect(file.values.nezamestnanost['554961'][2024]).not.toBeCloseTo(4.877, 2);
  });

  it('level je obec, sourceId je csu-obec-nezamestnanost (samostatný zdroj)', () => {
    expect(file.level).toBe('obec');
    for (const def of Object.values(file.indicators)) expect(def.sourceId).toBe('csu-obec-nezamestnanost');
  });

  it('jiný rok (2023) v této fixture není → prázdný výsledek pro obě obce', () => {
    const f2023 = buildObecNezamestnanostFile(fx('nez-obce-250169-sample.csv'), 2023);
    expect(f2023.values.nezamestnanost['554961']).toBeUndefined();
  });
});

// Živý smoke test – ověří skutečné stažení + rozbalení ZIPu (yauzl) + parsování mimo fixture.
describe.skipIf(!process.env.LIVE)('csuObecNezamestnanost.run – živě proti csu.gov.cz', () => {
  it(`stáhne ZIP, rozbalí CSV a vrátí nezaměstnanost obce Karlovy Vary za rok ${YEAR}`, async () => {
    const result = await csuObecNezamestnanost.run({ rawDir: 'data-raw', now: new Date() });
    expect(result.source.status).toBe('ok');
    expect(result.source.validFor).toBe(String(YEAR));
    const [obec] = result.indicators ?? [];
    const v = obec.values.nezamestnanost['554961']?.[YEAR];
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(20);
  }, 60_000);
});
