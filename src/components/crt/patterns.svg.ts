/**
 * Výplně kartogramu (5 kvantilových tříd + N/A) – plné odstíny státní modré
 * od ledové po tmavě modrou (sekvenční škála z palety brandbooku). N/A = světle šedá
 * s jemným šrafováním, aby „chybí údaj“ nešlo splést s nejnižší třídou.
 *
 * Použití: vlož výsledný řetězec dovnitř `<svg><defs>…</defs></svg>` a
 * odkazuj na vzory jako `fill="url(#p0)"` … `fill="url(#pna)"`.
 */
const SCALE = ['#e3edf8', '#9ec8e9', '#5b93cf', '#00469b', '#0c1838'];

export function patternDefs(): string {
  const solid = SCALE.map(
    (c, i) => `
    <pattern id="p${i}" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" style="fill: ${c}" />
    </pattern>`,
  ).join('');
  return `${solid}
    <pattern id="pna" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" style="fill: #f3f4f6" />
      <line x1="0" y1="0" x2="0" y2="8" style="stroke: #c9ced6; stroke-width: 1.5" />
    </pattern>
  `;
}
