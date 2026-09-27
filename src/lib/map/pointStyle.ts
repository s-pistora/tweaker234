// Vzhled znacek bodovych vrstev: >=6 vzajemne odlisnych kombinaci tón×glyf, aby i pri
// vsech 6 vrstvach snapshotu naraz (skoly, socialni, zastavky, vouchery,
// zdravotnictvi-kraj, zdravotnictvi) slo vizualne rozlisit, ktery bod patri ke ktere
// vrstve (viz review finding #3 - puvodne jen 4 kombinace tón×glyf na 6 vrstev).
export type Tone = 'amber' | 'phosphor';
export type Glyph = 'x' | '+' | 'o' | 'square' | 'diamond' | 'triangle';

export interface PointStyle {
  tone: Tone;
  glyph: Glyph;
}

const STYLES: readonly PointStyle[] = [
  { tone: 'amber', glyph: 'x' },
  { tone: 'phosphor', glyph: '+' },
  { tone: 'amber', glyph: 'o' },
  { tone: 'phosphor', glyph: 'square' },
  { tone: 'amber', glyph: 'diamond' },
  { tone: 'phosphor', glyph: 'triangle' },
];

/** Vzhled znacky vrstvy podle poradi (cyklicky, kdyby vrstev bylo vic nez stylu). */
export function styleOf(i: number): PointStyle {
  return STYLES[i % STYLES.length];
}

/** Znak glyfu pro legendu prepinacu vrstev i tooltip bodu na mape. */
export const GLYPH_CHAR: Record<Glyph, string> = {
  x: '×',
  '+': '+',
  o: '○',
  square: '□',
  diamond: '◇',
  triangle: '▲',
};
