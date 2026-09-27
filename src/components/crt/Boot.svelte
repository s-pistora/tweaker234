<script lang="ts">
  /**
   * Boot – boot sekvence svázaná s reálným načtením dat.
   *
   * `load(onStep)` provede skutečné načítání (Task 10: `loadSnapshot`); pokaždé,
   * když zavolá `onStep({label, status})`, přidá se řádek
   * `NAČÍTÁM <label>… OK|STALE|FAIL → SNAPSHOT`.
   *
   * `ondone()` se zavolá:
   *  - jakmile promise z `load()` doběhne (nejdřív ale po `minMs`, nejpozději
   *    po `maxMs` ~3s), nebo
   *  - okamžitě po Esc / kliku na [PŘESKOČIT] – načítání pak POKRAČUJE NA
   *    POZADÍ (promise se nezruší, `onStep` může dál aktualizovat stav).
   *
   * Opakovaná návštěva (sessionStorage) zkrátí minimální dobu zobrazení.
   */
  type Status = 'ok' | 'stale' | 'fail';
  interface StepResult {
    label: string;
    status: Status;
  }

  interface Props {
    load: (onStep: (s: StepResult) => void) => Promise<unknown>;
    ondone?: () => void;
    /** nejpozdější okamžik pro automatické dokončení, ms (výchozí 3000) */
    maxMs?: number;
    /** minimální doba zobrazení, ms; není-li zadáno, určí se dle sessionStorage */
    minMs?: number;
  }

  const { load, ondone, maxMs = 3000, minMs }: Props = $props();

  const SESSION_KEY = 'kraj-term:boot-seen';
  const MIN_FIRST_VISIT = 400;
  const MIN_REPEAT_VISIT = 80;

  function seenBefore(): boolean {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  }

  function markSeen(): void {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* sessionStorage nedostupný – bez dopadu na funkčnost */
    }
  }

  const effectiveMinMs = $derived(minMs ?? (seenBefore() ? MIN_REPEAT_VISIT : MIN_FIRST_VISIT));

  function statusSuffix(status: Status): string {
    if (status === 'ok') return 'OK';
    if (status === 'stale') return 'STALE';
    return 'FAIL → SNAPSHOT';
  }

  let lines = $state<string[]>([]);
  let done = false;

  function onStep(s: StepResult): void {
    lines = [...lines, `NAČÍTÁM ${s.label}… ${statusSuffix(s.status)}`];
  }

  function finish(): void {
    if (done) return;
    done = true;
    markSeen();
    ondone?.();
  }

  function skip(): void {
    finish();
    // Záměrně nic neruší – `load()` doběhne na pozadí a jeho onStep
    // volání se dál promítnou do `lines` (i když už nejsou zobrazená).
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') skip();
  }

  $effect(() => {
    let minElapsed = false;
    let loadFinished = false;
    let cancelled = false;

    const tryFinish = () => {
      if (minElapsed && loadFinished) finish();
    };

    const minTimer = setTimeout(() => {
      minElapsed = true;
      tryFinish();
    }, effectiveMinMs);

    const maxTimer = setTimeout(() => {
      finish();
    }, maxMs);

    load(onStep).then(
      () => {
        if (cancelled) return;
        loadFinished = true;
        tryFinish();
      },
      () => {
        if (cancelled) return;
        loadFinished = true;
        tryFinish();
      },
    );

    return () => {
      // Pouze zrušíme naše vlastní časovače – `load()` samotný běží dál.
      cancelled = true;
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="boot crt-screen" data-testid="boot" role="status" aria-live="polite">
  <pre class="boot__lines">{lines.join('\n')}</pre>
  <button type="button" class="boot__skip" data-testid="boot-skip" onclick={skip}>
    [PŘESKOČIT]
  </button>
</div>

<style>
  .boot {
    padding: 16px;
    font-family: var(--font-mono);
    color: var(--phosphor-80);
  }

  .boot__lines {
    margin: 0 0 12px 0;
    white-space: pre-wrap;
    font-family: var(--font-mono);
  }

  .boot__skip {
    background: var(--bg-panel);
    color: var(--amber);
    border: 1px solid var(--amber-dim);
    padding: 4px 10px;
    cursor: pointer;
    font-family: var(--font-mono);
  }

  .boot__skip:hover {
    border-color: var(--amber);
  }
</style>
