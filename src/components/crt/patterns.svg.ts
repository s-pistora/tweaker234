/**
 * Kartogramové vzory pro mapu (5 kvantilových tříd + N/A).
 *
 * Barvy nesou informaci jasem a texturou (ne odstínem) – čitelné i pro
 * barvoslepé uživatele. `p0`..`p4` = fosforová zelená, rostoucí hustota/jas
 * od prázdné (p0) po plnou při 60 % jasu (p4). `pna` = řídké ambrové křížky
 * pro "údaj není k dispozici".
 *
 * Použití: vlož výsledný řetězec dovnitř `<svg><defs>…</defs></svg>` a
 * odkazuj na vzory jako `fill="url(#p0)"` … `fill="url(#pna)"`.
 */
export function patternDefs(): string {
  return `
    <pattern id="p0" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="transparent" />
    </pattern>

    <pattern id="p1" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="transparent" />
      <circle cx="4" cy="4" r="0.6" style="fill: var(--phosphor-100, #33ff66)" />
    </pattern>

    <pattern id="p2" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="transparent" />
      <circle cx="1.5" cy="1.5" r="0.9" style="fill: var(--phosphor-100, #33ff66)" />
      <circle cx="4.5" cy="4.5" r="0.9" style="fill: var(--phosphor-100, #33ff66)" />
    </pattern>

    <pattern id="p3" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="transparent" />
      <line x1="0" y1="0" x2="0" y2="6" style="stroke: var(--phosphor-100, #33ff66); stroke-width: 2.4" />
    </pattern>

    <pattern id="p4" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" style="fill: var(--phosphor-100, #33ff66); fill-opacity: 0.6" />
    </pattern>

    <pattern id="pna" width="10" height="10" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="transparent" />
      <path
        d="M2,2 L4,4 M4,2 L2,4 M6,6 L8,8 M8,6 L6,8"
        style="stroke: var(--amber, #ffb000); stroke-width: 0.8; fill: none"
      />
    </pattern>
  `;
}
