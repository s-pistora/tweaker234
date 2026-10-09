<script lang="ts">
  import './styles/tokens.css';
  import './styles/crt.css';
  import { onDestroy } from 'svelte';
  import Drilldown from './components/Drilldown.svelte';
  import Detail from './components/Detail.svelte';
  import Sources from './components/Sources.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import Timeline from './components/Timeline.svelte';
  import Map from './components/Map.svelte';
  import Legend from './components/Legend.svelte';
  import WeightPanel from './components/WeightPanel.svelte';
  import HowModal, { type HowPart } from './components/HowModal.svelte';
  import SkolyFiltr from './components/skoly/SkolyFiltr.svelte';
  import OboryList from './components/skoly/OboryList.svelte';
  import SkolaDetail from './components/skoly/SkolaDetail.svelte';
  import KrajPrehled from './components/skoly/KrajPrehled.svelte';
  import type { MapPoint } from './components/Map.svelte';
  import { loadSnapshot, type Snapshot, type OnStep } from './lib/data/loader.ts';
  import { appState, initHashSync, linkInvalid, DEFAULT_SKOLY, type Mode, type SkolyState } from './lib/state.ts';
  import { centroidy } from './lib/map/centroids.ts';
  import {
    TRIDA_LABEL,
    agreguj,
    dostupnostObci,
    filtrujObory,
    naplnenostSkoly,
    procenta,
    skolyZVysledku,
    tridaNaplnenosti,
    vzdalenostKm,
    type TridaNaplnenosti,
  } from './lib/skoly.ts';
  import type { Glyph, Tone } from './lib/map/pointStyle.ts';
  import { areaFeatures } from './lib/map/project.ts';
  import { fitIndicator, yearsWithData } from './lib/map/values.ts';
  import { resolveView, detailTarget, type View } from './lib/map/drill.ts';
  import { eligibleIndicators, score, scoreIndicatorYear } from './lib/score.ts';
  import type { AreaCode, IndicatorDef } from './lib/types.ts';

  /** Kořen dat (relativně k index.html). Koordinátor přepne na 'data' při integraci. */
  const DATA_BASE = 'data';

  // „Kam na střední“ je výchozí stránka: prázdná adresa → rovnou tento režim.
  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    history.replaceState(null, '', '#/kraj?m=skoly');
  }

  let snap = $state<Snapshot | null>(null);
  let loadError = $state<string | null>(null);
  let snapPromise: Promise<Snapshot> | null = null;
  let stopSync: (() => void) | null = null;

  function load(onStep: OnStep): Promise<Snapshot> {
    snapPromise ??= loadSnapshot(onStep, DATA_BASE).then(
      (s) => {
        stopSync = initHashSync(s);
        snap = s;
        return s;
      },
      (e: unknown) => {
        loadError = e instanceof Error ? e.message : String(e);
        throw e;
      },
    );
    return snapPromise;
  }

  onDestroy(() => stopSync?.());

  load(() => {}).catch(() => {});

  let skolyTab = $state<'hledat' | 'kraj'>('hledat');

  const st = $derived($appState);

  // Varovani "neplatny odkaz" (viz review finding #1) - amber, dismissible; znovu se
  // ukaze pri kazdem prechodu na (dalsi) nevalidni hash.
  let linkWarningDismissed = $state(false);
  $effect(() => {
    if ($linkInvalid) linkWarningDismissed = false;
  });

  /** kód → název a obec → ORP ze všech geodat */
  const geoIndex = $derived.by(() => {
    const names: Record<AreaCode, string> = {};
    const obecParent: Record<AreaCode, AreaCode> = {};
    for (const g of ['kraje', 'kv-orp', 'kv-obce'] as const) {
      for (const f of areaFeatures(snap?.geo[g])) {
        names[f.properties.code] = f.properties.name;
        if (g === 'kv-obce' && f.properties.parent) obecParent[f.properties.code] = f.properties.parent;
      }
    }
    return { names, obecParent };
  });

  // Drill-down: ORP, jehož obce se zobrazují, když na úrovni 'obec' není vybraná obec.
  let localOrp = $state<AreaCode | null>(null);
  const view = $derived<View>(
    resolveView(st.level, st.area, localOrp, (c) => geoIndex.obecParent[c] ?? null),
  );
  // hash `#/obec` bez obce a bez známého ORP → spadne na mapu ORP
  $effect(() => {
    if (snap && view.level !== st.level) navigate(view);
  });

  const file = $derived(snap?.indicators[view.level]);
  const years = $derived(yearsWithData(file, st.indicator));
  const target = $derived(detailTarget(view));

  // --- režim „Kde by se mi dobře žilo?“ (Task 16) -------------------------
  const SCORE_DEF: IndicatorDef = {
    id: 'score',
    label: 'Skóre',
    unit: '/100',
    higherIsBetter: true,
    sourceId: 'score',
    decimals: 0,
  };

  const eligible = $derived(file ? eligibleIndicators(file) : []);
  const eligibleIds = $derived(new Set(eligible.map((d) => d.id)));
  /** váhy z appState omezené na ukazatele způsobilé pro skóre (obrana proti ručně upravenému URL) */
  const scoreWeights = $derived(
    Object.fromEntries(Object.entries(st.weights).filter(([id]) => eligibleIds.has(id))),
  );
  const totalWeight = $derived(Object.values(scoreWeights).reduce((a, b) => a + b, 0));
  const scores = $derived(file && totalWeight > 0 ? score(file, st.year, scoreWeights) : {});
  const scoreValues = $derived(
    Object.fromEntries(Object.entries(scores).map(([code, s]) => [code, s.score])) as Record<
      AreaCode,
      number | null
    >,
  );

  const scoreFeatures = $derived.by(() => {
    if (!snap) return [];
    if (view.level === 'kraj') return areaFeatures(snap.geo.kraje);
    if (view.level === 'orp') return areaFeatures(snap.geo['kv-orp']);
    return areaFeatures(snap.geo['kv-obce'], view.orp);
  });
  /** skóre omezené na území aktuálně zobrazená na mapě (např. jen obce vybraného ORP) */
  const scoresInView = $derived.by(() => {
    const codes = new Set(scoreFeatures.map((f) => f.properties.code));
    return Object.fromEntries(Object.entries(scores).filter(([code]) => codes.has(code)));
  });

  function scorePreview(code: AreaCode): string[] {
    const s = scores[code];
    if (!s || s.score === null) return ['SKÓRE: N/A'];
    return [`SKÓRE ${Math.round(s.score)}/100`];
  }

  function setWeight(id: string, w: number) {
    appState.update((s) => {
      const weights = { ...s.weights };
      if (w > 0) weights[id] = w;
      else delete weights[id];
      return { ...s, weights };
    });
  }
  function selectScoreArea(code: AreaCode) {
    appState.update((s) => ({ ...s, area: code }));
  }

  /** rozpad skóre vybraného území obohacený o hodnotu/rok každé části - pro HowModal */
  const selectedParts = $derived.by((): HowPart[] => {
    if (!file || !view.area) return [];
    const s = scores[view.area];
    if (!s) return [];
    return s.parts.map((p) => {
      const y = scoreIndicatorYear(file, p.id);
      const v = y !== null ? (file.values[p.id]?.[view.area as AreaCode]?.[y] ?? null) : null;
      return { ...p, value: v, year: y };
    });
  });
  const selectedSkippedDefs = $derived.by((): IndicatorDef[] => {
    if (!file || !view.area) return [];
    const s = scores[view.area];
    if (!s) return [];
    return s.skipped.map((id) => file.indicators[id]).filter((d): d is IndicatorDef => !!d);
  });
  const howIndicators = $derived.by(() => {
    if (!file) return [];
    return Object.entries(scoreWeights)
      .filter(([id, w]) => w > 0 && id in file.indicators)
      .map(([id, weight]) => ({ def: file.indicators[id], year: scoreIndicatorYear(file, id), weight }));
  });

  /** poslední ukazatel zvolený uživatelem – při návratu na úroveň, kde existuje, se obnoví */
  let preferredIndicator: string | null = null;

  function navigate(v: View) {
    localOrp = v.orp;
    const f = snap?.indicators[v.level];
    appState.update((s) => ({
      ...s,
      level: v.level,
      area: v.area,
      ...fitIndicator(f, f && preferredIndicator && preferredIndicator in f.indicators ? preferredIndicator : s.indicator, s.year),
    }));
  }
  function setIndicator(id: string) {
    preferredIndicator = id;
    appState.update((s) => ({ ...s, ...fitIndicator(file, id, s.year) }));
  }
  function setYear(y: number) {
    appState.update((s) => ({ ...s, year: y }));
  }
  function setMode(m: Mode) {
    appState.update((s) => ({ ...s, mode: m, skoly: m === 'skoly' ? (s.skoly ?? { ...DEFAULT_SKOLY }) : s.skoly }));
  }

  // --- režim „Kam na střední“ ---------------------------------------------
  const sk = $derived<SkolyState>(st.skoly ?? DEFAULT_SKOLY);
  const obory = $derived(snap?.skoly?.obory ?? []);
  const obecFeatures = $derived(snap ? areaFeatures(snap.geo['kv-obce']) : []);
  const obecCentroidy = $derived(centroidy(obecFeatures));
  const obecNames = $derived(
    Object.fromEntries(obecFeatures.map((f) => [f.properties.code, f.properties.name])) as Record<AreaCode, string>,
  );
  const domov = $derived(sk.domov ? (obecCentroidy[sk.domov] ?? null) : null);
  const skupinyOboru = $derived([...new Set(obory.map((o) => o.skupina))].sort());
  const vysledky = $derived(
    filtrujObory(obory, { domov, typ: sk.typ, skupina: sk.skupina, maxKm: sk.maxKm }, sk.razeni),
  );
  const dostupnost = $derived(
    dostupnostObci(obory, obecCentroidy, { typ: sk.typ, skupina: sk.skupina, maxKm: sk.maxKm }),
  );
  const DOSTUPNOST_DEF: IndicatorDef = {
    id: 'dostupnost',
    label: 'Obory v dosahu',
    unit: 'počet',
    higherIsBetter: true,
    sourceId: 'dz-prijimani-2026',
    decimals: 0,
  };
  const TRIDA_STYLE: Record<TridaNaplnenosti, { tone: Tone; glyph: Glyph }> = {
    volno: { tone: 'phosphor', glyph: 'o' },
    ok: { tone: 'phosphor', glyph: 'square' },
    pretlak: { tone: 'amber', glyph: 'triangle' },
    na: { tone: 'amber', glyph: 'x' },
  };
  const skolaPoints = $derived.by((): MapPoint[] =>
    skolyZVysledku(vysledky).map((s) => {
      const n = naplnenostSkoly(obory.filter((o) => o.izo === s.izo));
      const t = tridaNaplnenosti(n);
      return {
        id: `skola:${s.izo}:${s.lat}`,
        name: s.skola,
        lon: s.lon,
        lat: s.lat,
        layerLabel: `Střední škola · loni ${procenta(n)} (${TRIDA_LABEL[t]})`,
        provider: 'Karlovarský kraj (datazapad.cz)',
        validFor: '2025/26–2026/27',
        ...TRIDA_STYLE[t],
      };
    }),
  );
  const vybraneObory = $derived(sk.skola ? obory.filter((o) => o.izo === sk.skola) : []);
  const vybranaKm = $derived(
    domov && vybraneObory[0] ? vzdalenostKm(domov.lat, domov.lon, vybraneObory[0].lat, vybraneObory[0].lon) : null,
  );
  const skolySources = $derived(
    snap ? snap.manifest.sources.filter((x) => snap?.skoly?.sourceIds.includes(x.id)) : [],
  );

  const krajCelkem = $derived(agreguj(obory, () => 'kraj', () => 'Karlovarský kraj')[0] ?? null);
  const oboru2026 = $derived(obory.filter((o) => (o.zamer[2026] ?? 0) > 0).length);
  const fmtCs = (n: number) => new Intl.NumberFormat('cs-CZ').format(n);
  const domovNazev = $derived(sk.domov ? (obecNames[sk.domov] ?? '') : '');

  const MODE_NAV: { m: Mode; label: string }[] = [
    { m: 'skoly', label: 'Kam na střední' },
    { m: 'explore', label: 'Mapa kraje' },
    { m: 'score', label: 'Kde by se mi žilo' },
  ];

  function setSkoly(patch: Partial<SkolyState>) {
    appState.update((s) => ({ ...s, skoly: { ...(s.skoly ?? DEFAULT_SKOLY), ...patch } }));
  }
  function dostupnostPreview(code: AreaCode): string[] {
    const n = dostupnost[code] ?? 0;
    return [`${n} ${n === 1 ? 'obor' : n >= 2 && n <= 4 ? 'obory' : 'oborů'} do ${sk.maxKm} km`, 'klik = tady bydlím'];
  }

  let drill = $state<ReturnType<typeof Drilldown> | null>(null);
  let sourcesOpen = $state(false);
  let sourcesTrigger: HTMLElement | null = null;
  let howOpen = $state(false);
  let howTrigger: HTMLElement | null = null;

  function openSources() {
    sourcesTrigger = document.activeElement as HTMLElement | null;
    sourcesOpen = true;
  }
  function closeSources() {
    sourcesOpen = false;
    sourcesTrigger?.focus?.();
  }
  function openHow() {
    howTrigger = document.activeElement as HTMLElement | null;
    howOpen = true;
  }
  function closeHow() {
    howOpen = false;
    howTrigger?.focus?.();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !snap) return;
    if (sourcesOpen) {
      closeSources();
      return;
    }
    if (howOpen) {
      closeHow();
      return;
    }
    if (st.mode === 'skoly') {
      if (sk.skola) setSkoly({ skola: null });
      return;
    }
    drill?.up();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="shell">
  <header class="topbar">
    <div class="wrap topbar__in">
      <a class="brandmark" href="#/kraj?m=skoly" onclick={(e) => { e.preventDefault(); setMode('skoly'); }}>
        <span class="brandmark__bar" aria-hidden="true"></span>
        <span class="brandmark__txt">Otevřená data<br /><strong>Karlovarského kraje</strong></span>
      </a>
      <nav class="mainnav" aria-label="Hlavní navigace">
        {#each MODE_NAV as n (n.m)}
          <button
            type="button"
            class:on={st.mode === n.m}
            aria-current={st.mode === n.m ? 'page' : undefined}
            onclick={() => setMode(n.m)}
            data-testid="mode-{n.m}">{n.label}</button
          >
        {/each}
        <button type="button" class="mainnav__src" onclick={openSources} data-testid="sources-btn">Zdroje dat</button>
      </nav>
    </div>
  </header>

  {#if $linkInvalid && !linkWarningDismissed}
    <div class="wrap">
      <p class="notice" role="alert" data-testid="link-invalid">
        Odkaz obsahoval neplatné údaje, zobrazujeme výchozí pohled.
        <button type="button" aria-label="Zavřít upozornění" onclick={() => (linkWarningDismissed = true)}>✕</button>
      </p>
    </div>
  {/if}

  {#if loadError}
    <div class="wrap"><p class="state state--err" role="alert">Data se nepodařilo načíst ({loadError}). Zkuste stránku obnovit.</p></div>
  {:else if !snap}
    <div class="wrap"><p class="state" role="status">Načítáme data…</p></div>
  {:else if st.mode === 'skoly'}
    <section class="hero">
      <div class="wrap">
        <p class="kicker">Střední školy · přijímací řízení 2026/27</p>
        <h1>Kam na střední?</h1>
        <p class="perex">
          Najděte obory ve svém okolí. U každého ukazujeme, kolik míst škola otevírá a jak byl obor
          obsazený loni.
        </p>
        {#if krajCelkem}
          <div class="kpis">
            <div class="kpi">
              <span class="kpi__label">Obory pro 2026/27</span>
              <span class="kpi__value">{fmtCs(oboru2026)}</span>
              <span class="kpi__note">na {fmtCs(new Set(obory.map((o) => o.izo)).size)} středních školách v kraji</span>
            </div>
            <div class="kpi">
              <span class="kpi__label">Místa v 1. ročnících</span>
              <span class="kpi__value">{fmtCs(krajCelkem.zamer2026)}</span>
              <span class="kpi__note">plán škol na 2026/27</span>
            </div>
            <div class="kpi">
              <span class="kpi__label">Loňská obsazenost</span>
              <span class="kpi__value">{procenta(krajCelkem.naplnenost).replace('.', ',')}</span>
              <span class="kpi__note">{fmtCs(krajCelkem.prijato2025)} žáků na {fmtCs(krajCelkem.zamer2025)} míst (2025)</span>
            </div>
            <div class="kpi">
              <span class="kpi__label">Volná místa loni</span>
              <span class="kpi__value">{fmtCs(Math.max(0, krajCelkem.zamer2025 - krajCelkem.prijato2025))}</span>
              <span class="kpi__note">zůstalo po přijímačkách neobsazeno</span>
            </div>
          </div>
        {/if}
      </div>
    </section>

    <main class="wrap main">
      {#if !snap.skoly}
        <p class="state state--err" role="alert">Data o středních školách se nepodařilo načíst.</p>
      {:else}
        <div class="tabs" role="tablist" aria-label="Pohled">
          <button
            type="button"
            role="tab"
            aria-selected={skolyTab === 'hledat'}
            class:on={skolyTab === 'hledat'}
            onclick={() => (skolyTab = 'hledat')}
            data-testid="tab-hledat">Najít školu</button
          >
          <button
            type="button"
            role="tab"
            aria-selected={skolyTab === 'kraj'}
            class:on={skolyTab === 'kraj'}
            onclick={() => (skolyTab = 'kraj')}
            data-testid="tab-kraj">Přehled pro kraj</button
          >
        </div>

        {#if skolyTab === 'hledat'}
          <SkolyFiltr filtr={sk} obce={obecNames} skupiny={skupinyOboru} onchange={setSkoly} />
          <div class="grid">
            <OboryList
              {vysledky}
              vybrana={sk.skola}
              maDomov={!!domov}
              {domovNazev}
              maxKm={sk.maxKm}
              razeni={sk.razeni}
              onrazeni={(r) => setSkoly({ razeni: r })}
              onselect={(izo) => setSkoly({ skola: izo })}
            />
            <section class="mapcard" aria-label="Mapa">
              <h2>Kolik oborů je v dosahu</h2>
              <p class="mapcard__hint">
                Tmavší obec = víc oborů do {sk.maxKm} km. Kliknutím na obec nastavíte, kde bydlíte.
              </p>
              <Map
                features={obecFeatures}
                values={dostupnost}
                def={DOSTUPNOST_DEF}
                year={2026}
                selected={sk.domov}
                preview={dostupnostPreview}
                points={skolaPoints}
                onselect={(code) => setSkoly({ domov: code, skola: null })}
                label="Mapa obcí Karlovarského kraje podle počtu oborů v dosahu"
                hint="Najeďte na obec a uvidíte, kolik oborů je odtud v dosahu. Kliknutím ji vyberete jako bydliště."
              />
              <Legend
                values={obecFeatures.map((f) => dostupnost[f.properties.code] ?? null)}
                def={DOSTUPNOST_DEF}
                year={2026}
              />
              <ul class="maplegend" aria-label="Značky škol">
                <li><span class="g g--volno">○</span> loni hodně volných míst</li>
                <li><span class="g g--ok">□</span> loni skoro plno</li>
                <li><span class="g g--pretlak">▲</span> loni přeplněno</li>
              </ul>
            </section>
          </div>
        {:else}
          <KrajPrehled obory={obory} names={geoIndex.names} onselect={(izo) => setSkoly({ skola: izo })} />
        {/if}

        {#if vybraneObory.length}
          {#key sk.skola}
            <SkolaDetail obory={vybraneObory} km={vybranaKm} sources={skolySources} onclose={() => setSkoly({ skola: null })} />
          {/key}
        {/if}
      {/if}
    </main>
  {:else}
    <section class="hero hero--slim">
      <div class="wrap">
        <p class="kicker">Karlovarský kraj v číslech</p>
        <h1>{st.mode === 'score' ? 'Kde by se mi dobře žilo?' : 'Mapa kraje'}</h1>
        <p class="perex">
          {st.mode === 'score'
            ? 'Nastavte, na čem vám záleží, a mapa seřadí území podle skóre. U každého výsledku vysvětlujeme, jak vzniklo.'
            : 'Vyberte ukazatel a rok. Klikněte na Karlovarský kraj a dál na jednotlivá ORP a obce.'}
        </p>
        <StatusBar
          updatedAt={snap.updatedAt}
          indicators={Object.values(file?.indicators ?? {})}
          indicator={st.indicator}
          {years}
          year={st.year}
          onindicator={setIndicator}
          onyear={setYear}
        />
      </div>
    </section>
    <main class="wrap main layout">
      <section class="map-col" aria-label="Mapa">
        {#if st.mode === 'explore'}
          <Drilldown
            bind:this={drill}
            {snap}
            {view}
            indicator={st.indicator}
            year={st.year}
            names={geoIndex.names}
            onnavigate={navigate}
          />
          <Timeline {years} year={st.year} onyear={setYear} />
        {:else}
          <WeightPanel
            indicators={eligible}
            weights={scoreWeights}
            names={geoIndex.names}
            scores={scoresInView}
            selected={view.area}
            onweight={setWeight}
            onselect={selectScoreArea}
            onhow={openHow}
          />
          {#if totalWeight > 0}
            <div class="ascii-panel">
              <Map
                features={scoreFeatures}
                values={scoreValues}
                def={SCORE_DEF}
                year={st.year}
                selected={view.area}
                preview={scorePreview}
                onselect={selectScoreArea}
                label="Mapa skóre"
              />
              <Legend
                values={scoreFeatures.map((f) => scoreValues[f.properties.code] ?? null)}
                def={SCORE_DEF}
                year={st.year}
              />
            </div>
          {:else}
            <div class="ascii-panel">
              <h2 class="ascii-panel__title">Nastavte, na čem vám záleží</h2>
              <p>Posuňte aspoň jeden posuvník výš než 0. Teprve pak má obarvení mapy smysl.</p>
            </div>
          {/if}
        {/if}
      </section>
      <section class="panel-col" aria-label="Detail území">
        <p class="sr-only" aria-live="polite">
          {target ? `Detail: ${geoIndex.names[target.code] ?? target.code}` : ''}
        </p>
        {#if target}
          {#key `${target.level}:${target.code}`}
            <Detail
              {snap}
              level={target.level}
              code={target.code}
              name={geoIndex.names[target.code] ?? target.code}
              indicator={st.indicator}
              year={st.year}
            />
          {/key}
        {:else}
          <div class="ascii-panel">
            <h2 class="ascii-panel__title">Vyberte území na mapě</h2>
            <p>
              Klikněte na kraj (nebo Tab a Enter, šipky přeskakují mezi sousedy). Karlovarský kraj jde
              rozkliknout na ORP a obce. Klávesa Esc vrací o úroveň výš.
            </p>
          </div>
        {/if}
      </section>
    </main>
    {#if howOpen}
      <HowModal
        indicators={howIndicators}
        selectedName={view.area ? (geoIndex.names[view.area] ?? view.area) : null}
        parts={selectedParts}
        skipped={selectedSkippedDefs}
        onclose={closeHow}
      />
    {/if}
  {/if}

  <footer class="footer">
    <div class="wrap footer__in">
      <p>
        <strong>Prototyp z Hackathonu otevřených dat Karlovarského kraje 2026.</strong> Nejde o oficiální
        službu Karlovarského kraje ani jiného úřadu.
      </p>
      <p>
        Data: Karlovarský kraj (DATAZÁPAD), Český statistický úřad, ČÚZK, ÚZIS – podrobně v
        <button type="button" class="linklike" onclick={openSources}>Zdrojích dat</button>. Vzdálenosti vzdušnou čarou.
      </p>
    </div>
  </footer>

  {#if sourcesOpen && snap}
    <Sources sources={snap.manifest.sources} updatedAt={snap.updatedAt} onclose={closeSources} />
  {/if}
</div>

<style>
  .shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .wrap {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 24px;
    box-sizing: border-box;
  }
  /* horní lišta */
  .topbar {
    background: #fff;
    border-bottom: 1px solid var(--line);
  }
  .topbar__in {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 24px;
    min-height: 72px;
  }
  .brandmark {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    color: var(--brand-dark);
  }
  .brandmark:visited {
    color: var(--brand-dark);
  }
  .brandmark__bar {
    width: 8px;
    height: 40px;
    background: var(--brand);
    border-radius: 2px;
  }
  .brandmark__txt {
    font-size: 0.9rem;
    line-height: 1.25;
  }
  .brandmark__txt strong {
    font-size: 1.05rem;
  }
  .mainnav {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .mainnav button {
    font: inherit;
    font-weight: 500;
    min-height: 44px;
    padding: 0 14px;
    border: 0;
    border-bottom: 3px solid transparent;
    background: none;
    color: var(--brand-dark);
    cursor: pointer;
  }
  .mainnav button:hover {
    color: var(--brand);
  }
  .mainnav button.on {
    color: var(--brand);
    border-bottom-color: var(--brand);
  }
  .mainnav .mainnav__src {
    color: var(--text-muted);
  }
  /* úvodní pruh */
  .hero {
    background: var(--brand-ice);
    border-bottom: 1px solid var(--line);
    padding: 32px 0 28px;
  }
  .hero--slim {
    padding-bottom: 20px;
  }
  .kicker {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--brand);
  }
  .hero h1 {
    font-size: clamp(2rem, 4.5vw, 2.5rem);
    line-height: 1.2;
    font-weight: 700;
    margin: 6px 0 8px;
  }
  .perex {
    margin: 0 0 20px;
    max-width: 68ch;
    font-size: 1.15rem;
    line-height: 1.5;
    color: var(--text);
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
  .kpi {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .kpi__label {
    font-weight: 500;
    color: var(--brand);
    font-size: 0.95rem;
  }
  .kpi__value {
    font-size: 2.25rem;
    line-height: 1.15;
    font-weight: 700;
    color: var(--brand-dark);
  }
  .kpi__note {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  /* obsah */
  .main {
    padding-top: 24px;
    padding-bottom: 48px;
    flex: 1;
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 20px;
  }
  .tabs button {
    font: inherit;
    font-weight: 500;
    min-height: 44px;
    padding: 0 16px;
    border: 0;
    border-bottom: 3px solid transparent;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    margin-bottom: -1px;
  }
  .tabs button.on {
    color: var(--brand);
    border-bottom-color: var(--brand);
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: 24px;
    align-items: start;
    margin-top: 24px;
  }
  .mapcard {
    position: sticky;
    top: 16px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 18px 20px;
    min-width: 0;
  }
  .mapcard h2 {
    margin: 0 0 4px;
    font-size: 1.25rem;
  }
  .mapcard__hint {
    margin: 0 0 12px;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .maplegend {
    list-style: none;
    padding: 0;
    margin: 10px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .g {
    font-weight: 900;
  }
  .g--volno,
  .g--ok {
    color: var(--brand-dark);
  }
  .g--pretlak {
    color: var(--data-6);
  }
  .state {
    margin: 32px 0;
    padding: 20px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
  }
  .state--err {
    color: var(--error);
    border-color: var(--error);
  }
  .notice {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin: 16px 0 0;
    padding: 10px 14px;
    border-left: 4px solid var(--accent);
    background: #fff8e6;
    color: var(--brand-dark);
  }
  .notice button {
    font: inherit;
    background: none;
    border: 0;
    cursor: pointer;
    min-width: 44px;
    min-height: 44px;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 24px;
    align-items: start;
  }
  .map-col,
  .panel-col {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .footer {
    background: var(--brand-dark);
    color: #dbe5f3;
    padding: 24px 0;
    font-size: 0.88rem;
  }
  .footer p {
    margin: 4px 0;
    max-width: 90ch;
  }
  .footer strong {
    color: #fff;
  }
  .linklike {
    font: inherit;
    background: none;
    border: 0;
    padding: 0;
    color: #fff;
    text-decoration: underline;
    cursor: pointer;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (max-width: 1000px) {
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .grid,
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .mapcard {
      position: static;
      order: -1;
    }
  }
  @media (max-width: 560px) {
    .wrap {
      padding: 0 16px;
    }
    .kpi__value {
      font-size: 1.75rem;
    }
    .hero {
      padding: 24px 0 20px;
    }
  }
</style>
