// Kvantilová klasifikace hodnot do 5 tříd (0..4) pro kartogram.
// Třída se určuje podle pořadí (počtu hodnot ostře menších), takže shodné
// hodnoty dostanou vždy stejnou třídu. null / nekonečné → null (vzor N/A).

export type ClassIdx = 0 | 1 | 2 | 3 | 4;
export const CLASS_COUNT = 5;

function finite(values: readonly (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function classOfSorted(sorted: number[], v: number): ClassIdx {
  const n = sorted.length;
  if (n === 0) return 2;
  let less = 0;
  while (less < n && sorted[less] < v) less++;
  return Math.min(CLASS_COUNT - 1, Math.floor((less * CLASS_COUNT) / n)) as ClassIdx;
}

export function quantileClass(
  values: readonly (number | null | undefined)[],
  v: number | null | undefined,
): ClassIdx | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const sorted = finite(values).sort((a, b) => a - b);
  return classOfSorted(sorted, v);
}

/** Rozsah hodnot (min–max) v každé z 5 tříd; neobsazená třída → null. */
export function classRanges(
  values: readonly (number | null | undefined)[],
): ({ min: number; max: number } | null)[] {
  const sorted = finite(values).sort((a, b) => a - b);
  const out: ({ min: number; max: number } | null)[] = Array(CLASS_COUNT).fill(null);
  for (const v of sorted) {
    const c = classOfSorted(sorted, v);
    const r = out[c];
    if (!r) out[c] = { min: v, max: v };
    else {
      r.min = Math.min(r.min, v);
      r.max = Math.max(r.max, v);
    }
  }
  return out;
}
