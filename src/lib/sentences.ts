// Sablonove vety (bez AI) popisujici hodnotu ukazatele: srovnani s referenci
// (napr. prumerem CR) a trend za poslednich `trendYears` let. Cisle funkce,
// zadny pristup na DOM/sit. Nikdy neprodukuji text s "NaN"/"Infinity" -
// chybejici/nevalidni vstupy vedou na kratsi (ale smysluplnou) vetu.

import type { IndicatorDef } from './types.ts';

/** Genitivni tvar "na urovni ..." pro zname formy refLabel (jinak beze zmeny). */
const NA_UROVNI_FORMS: Record<string, string> = {
  'průměrem ČR': 'průměru ČR',
  'průměrem kraje': 'průměru kraje',
};

function naUrovniForm(refLabel: string): string {
  return NA_UROVNI_FORMS[refLabel] ?? refLabel;
}

/**
 * Ceske skloneni "procentni bod" pro rozdil v procentnich bodech.
 * 1 -> "procentní bod", 2-4 -> "procentní body", 5+ nebo desetinne cislo -> "procentního bodu".
 */
function pointsPhrase(magnitude: number): string {
  if (!Number.isInteger(magnitude)) return 'procentního bodu';
  if (magnitude === 1) return 'procentní bod';
  if (magnitude >= 2 && magnitude <= 4) return 'procentní body';
  return 'procentního bodu';
}

export function formatValue(v: number | null, def: IndicatorDef): string {
  if (v === null || !Number.isFinite(v)) return 'N/A';
  return new Intl.NumberFormat('cs-CZ', {
    minimumFractionDigits: def.decimals,
    maximumFractionDigits: def.decimals,
  }).format(v);
}

export function describe(
  def: IndicatorDef,
  series: Record<number, number | null>,
  ref: Record<number, number> | undefined,
  year: number,
  refLabel = 'průměrem ČR',
  trendYears = 5,
): string {
  const v = series[year];
  if (v === undefined || v === null) {
    return `Údaj za rok ${year} není k dispozici.`;
  }

  const valueSentence = `${def.label} (${year}): ${formatValue(v, def)} ${def.unit}.`;

  const refValue = ref?.[year];
  if (refValue === undefined || !Number.isFinite(refValue) || refValue === 0) {
    return valueSentence;
  }

  const pctRaw = ((v - refValue) / refValue) * 100;
  let comparisonSentence: string;
  if (Math.abs(pctRaw) < 2) {
    comparisonSentence = `Hodnota je přibližně na úrovni ${naUrovniForm(refLabel)}.`;
  } else {
    const dir = pctRaw < 0 ? 'pod' : 'nad';
    comparisonSentence = `Hodnota je o ${Math.abs(Math.round(pctRaw))} % ${dir} ${refLabel}.`;
  }

  const parts = [valueSentence, comparisonSentence];

  const pastYear = year - trendYears;
  const pastV = series[pastYear];
  const pastRef = ref?.[pastYear];
  if (
    pastV !== undefined &&
    pastV !== null &&
    Number.isFinite(pastV) &&
    pastRef !== undefined &&
    Number.isFinite(pastRef) &&
    pastRef !== 0
  ) {
    const pctPastRaw = ((pastV - pastRef) / pastRef) * 100;
    const magNow = Math.abs(Math.round(pctRaw));
    const magPast = Math.abs(Math.round(pctPastRaw));
    const delta = magPast - magNow;
    if (delta > 0) {
      parts.push(`Rozdíl se za ${trendYears} let zmenšil o ${delta} ${pointsPhrase(delta)}.`);
    } else if (delta < 0) {
      const magnitude = Math.abs(delta);
      parts.push(`Rozdíl se za ${trendYears} let zvětšil o ${magnitude} ${pointsPhrase(magnitude)}.`);
    } else {
      parts.push(`Rozdíl se za ${trendYears} let nezměnil.`);
    }
  }

  return parts.join(' ');
}
