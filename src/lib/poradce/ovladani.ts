// Ovládání AI poradce z jiných částí aplikace (úvodní stránka, karta obce):
// otevřít chat s předvyplněnou otázkou. Poradce.svelte otázku převezme, chat otevře
// a otázku rovnou odešle (když poradce běží), jinak ji jen vloží do pole.
import { writable } from 'svelte/store';

/** true = poradce je na tomto webu k dispozici (běží proxy) – jen pak se ukazují tlačítka „Zeptat se AI“ */
export const poradceDostupny = writable(false);

/** čekající otázka; `n` odliší stejnou otázku položenou znovu */
export const poradceDotaz = writable<{ text: string; n: number } | null>(null);

let n = 0;
/** Otevře AI poradce a položí otázku. */
export function zeptejSePoradce(text: string): void {
  poradceDotaz.set({ text, n: ++n });
}
