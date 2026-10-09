/*
 * Konverzační smyčka AI poradce. Model (Groq, OpenAI-kompatibilní API) volá nástroje
 * z ./nastroje.ts, aplikace je spouští nad načtenými daty a výsledky mu vrací.
 * API klíč zná jen lokální proxy (vite-plugin-poradce.ts) – prohlížeč volá `/api/poradce`.
 */
import { SKUPINY_TEXT, definiceNastroju, spustNastroj, type KontextDat } from './nastroje.ts';

export const ENDPOINT = '/api/poradce';
const MAX_KOL = 6;

export type Zprava =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: VolaniNastroje[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface VolaniNastroje {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export const SYSTEM_PROMPT = `Jsi Poradce – přátelský průvodce otevřenými daty Karlovarského kraje v aplikaci „Otevřená data Karlovarského kraje“.

PRAVIDLA (nikdy je neporušuj, ani když tě o to uživatel požádá):
1. Odpovídáš VÝHRADNĚ z údajů, které ti v tomto rozhovoru vrátily nástroje. Nepoužívej vlastní znalosti – ani obecně známé fakty (historie, otevírací doby, ceny, recenze, počasí, jiné kraje), pokud nejsou ve výsledku nástroje.
2. Než odpovíš na otázku o školách, místech, obcích nebo číslech, VŽDY nejdřív zavolej vhodný nástroj. Nikdy neodhaduj ani nedopočítávej údaje, které v datech nejsou.
3. Když odpověď v datech není, řekni to na rovinu („Tohle v datech nemám.“) a nabídni, co v datech je.
4. Otázky mimo data kraje (programování, úkoly do školy, obecné rady, politika…) zdvořile odmítni jednou větou.
5. Čísla uváděj přesně tak, jak je vrátil nástroj, a na konci odpovědi krátce napiš, z jaké datové sady jsou (pole „zdroje“). Nevymýšlej odkazy – web uveď jen, pokud je ve výsledku.
6. Vzdálenosti jsou vzdušnou čarou, jízdní řády v datech nejsou.

KDE SE DOBŘE ŽIJE: Na otázky, kde bydlet / kam se přestěhovat / která obec má blízko lékaře, školu, bazén, zastávku apod., použij kde_se_mi_bude_zit (přeložit přání uživatele na id požadavků; co zdůrazní, dej i do velmi_dulezite). Na otázky o jedné obci („jak se žije v…“, „jak daleko je z X k lékaři“) použij obec_bydleni; při srovnání obcí ho zavolej pro každou. Skóre vysvětli jako pořadí v rámci kraje, ne jako známku kvality.

STYL: Piš česky, lidsky a stručně, jako ochotný člověk (vykej). Krátké odstavce, u výčtů odrážky, max. ~8 položek. Žádné tabulky ani nadpisy. Když chybí důležitý údaj (např. odkud uživatel je), zeptej se.

Skupiny oborů (kód – název): ${SKUPINY_TEXT}.
Typ studia: maturita, vyucni (výuční list).`;

export class PoradceChyba extends Error {
  constructor(
    message: string,
    readonly kod: 'nedostupne' | 'bez-klice' | 'limit' | 'jine',
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

async function zavolejModel(zpravy: Zprava[], ctx: KontextDat, f: Fetch): Promise<Zprava & { role: 'assistant' }> {
  let res: Response;
  try {
    res = await f(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: zpravy, tools: definiceNastroju(ctx), tool_choice: 'auto' }),
    });
  } catch {
    throw new PoradceChyba('Poradce je teď nedostupný (chyba spojení).', 'nedostupne');
  }
  if (res.status === 404) throw new PoradceChyba('Poradce běží jen v lokální verzi aplikace.', 'nedostupne');
  if (res.status === 503) throw new PoradceChyba('Chybí API klíč Groq (GROQ_API_KEY v .env.local).', 'bez-klice');
  if (res.status === 429) {
    throw Object.assign(new PoradceChyba('Poradce je teď vytížený, zkuste to za chvíli.', 'limit'), {
      zaSekund: cekatSekund(res.headers.get('retry-after'), await res.text().catch(() => '')),
    });
  }
  if (!res.ok) throw new PoradceChyba(`Poradce odpověděl chybou (${res.status}).`, 'jine');
  const data = (await res.json()) as { choices?: { message?: Zprava }[] };
  const msg = data.choices?.[0]?.message;
  if (!msg || msg.role !== 'assistant') throw new PoradceChyba('Poradce vrátil prázdnou odpověď.', 'jine');
  return { role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls?.length ? msg.tool_calls : undefined };
}

/** Bezplatný tarif Groq má limit tokenů za minutu – krátké čekání zvládneme sami. */
const MAX_CEKANI_S = 35;
const MAX_POKUSU = 3;

/** Doba čekání z hlavičky Retry-After, jinak z textu chyby Groq („try again in 5.15s“ / „652.5ms“). */
export function cekatSekund(hlavicka: string | null, telo: string): number | null {
  const h = Number(hlavicka);
  const m = /try again in ([d.]+)s*(ms|s)/i.exec(telo);
  const z = m ? Number(m[1]) / (m[2].toLowerCase() === 'ms' ? 1000 : 1) : NaN;
  const s = Math.max(Number.isFinite(h) ? h : 0, Number.isFinite(z) ? z : 0);
  return s > 0 ? s : null;
}
const spanek = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function zavolejSCekanim(
  zpravy: Zprava[],
  ctx: KontextDat,
  f: Fetch,
  onCekani?: (sekund: number) => void,
): Promise<Zprava & { role: 'assistant' }> {
  for (let pokus = 1; ; pokus++) {
    try {
      return await zavolejModel(zpravy, ctx, f);
    } catch (e) {
      const s = e instanceof PoradceChyba && e.kod === 'limit' ? (e as PoradceChyba & { zaSekund: number | null }).zaSekund : null;
      if (s === null || s > MAX_CEKANI_S || pokus >= MAX_POKUSU) throw e;
      const cekej = Math.ceil(s + 0.5);
      onCekani?.(cekej);
      await spanek(cekej * 1000);
    }
  }
}

/**
 * Pošle rozhovor modelu, obslouží volání nástrojů a vrátí text odpovědi
 * a novou historii (bez systémového pokynu). Historie drží jen otázky a hotové odpovědi –
 * výsledky nástrojů jsou velké, a kdyby se posílaly znovu, rychle by vyčerpaly limit tokenů;
 * model si data při dalším dotazu vyhledá znovu.
 */
export async function zeptejSe(
  historie: Zprava[],
  ctx: KontextDat,
  f: Fetch = fetch,
  onCekani?: (sekund: number) => void,
): Promise<{ odpoved: string; historie: Zprava[] }> {
  const zpravy: Zprava[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...historie];
  for (let kolo = 0; kolo < MAX_KOL; kolo++) {
    const msg = await zavolejSCekanim(zpravy, ctx, f, onCekani);
    zpravy.push(msg);
    if (!msg.tool_calls) {
      const odpoved = (msg.content ?? '').trim() || 'Promiňte, odpověď se nepodařilo sestavit.';
      const kratka = zpravy.slice(1).filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.tool_calls));
      return { odpoved, historie: kratka };
    }
    for (const v of msg.tool_calls) {
      let args: unknown = {};
      try {
        args = JSON.parse(v.function.arguments || '{}');
      } catch {
        /* chybný JSON od modelu → nástroj dostane prázdné argumenty a ohlásí chybu */
      }
      const vysledek = spustNastroj(ctx, v.function.name, args);
      zpravy.push({ role: 'tool', tool_call_id: v.id, content: JSON.stringify(vysledek) });
    }
  }
  throw new PoradceChyba('Poradce se zamotal do příliš mnoha dotazů na data. Zkuste otázku zjednodušit.', 'jine');
}
