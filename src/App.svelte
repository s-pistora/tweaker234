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
  import SkolyList from './components/skoly/SkolyList.svelte';
  import SkolyMapa, { type MapaSkola } from './components/skoly/SkolyMapa.svelte';
  import KrajSilueta from './components/skoly/KrajSilueta.svelte';
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
    proZakyZeZs,
    filtrujObory,
    naplnenostSkoly,
    procenta,
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
  /** jen obory pro žáky ze ZŠ (bez VOŠ a nástaveb, které sada také obsahuje) */
  const obory = $derived((snap?.skoly?.obory ?? []).filter(proZakyZeZs));
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
  let zvyraznena = $state<string | null>(null);
  const orpFeatures = $derived(snap ? areaFeatures(snap.geo['kv-orp']) : []);
  /** školy ve výsledcích pro mapu: místa a obsazenost jen z oborů odpovídajících filtru */
  const mapaSkoly = $derived.by((): MapaSkola[] => {
    const m = new globalThis.Map<string, { o: (typeof vysledky)[number]['obor'][]; mist: number }>();
    for (const r of vysledky) {
      const g = m.get(r.obor.izo) ?? { o: [], mist: 0 };
      g.o.push(r.obor);
      g.mist += r.obor.zamer[2026] ?? 0;
      m.set(r.obor.izo, g);
    }
    return [...m.entries()].map(([izo, g]) => {
      const podil = naplnenostSkoly(g.o);
      return {
        izo,
        nazev: g.o[0].skola,
        obec: g.o[0].obec,
        lat: g.o[0].lat,
        lon: g.o[0].lon,
        mist: g.mist,
        oboru: g.o.length,
        trida: tridaNaplnenosti(podil),
        podil,
      };
    });
  });
  const mapaOstatni = $derived.by(() => {
    const v = new Set(mapaSkoly.map((s) => s.izo));
    const seen = new Set<string>();
    return obory
      .filter((o) => !v.has(o.izo) && !seen.has(o.izo) && seen.add(o.izo))
      .map((o) => ({ izo: o.izo, lat: o.lat, lon: o.lon }));
  });
  const siluetaSkoly = $derived.by(() => {
    const m = new globalThis.Map<string, { lat: number; lon: number; mist: number }>();
    for (const o of obory) {
      const g = m.get(o.izo) ?? { lat: o.lat, lon: o.lon, mist: 0 };
      g.mist += o.zamer[2026] ?? 0;
      m.set(o.izo, g);
    }
    return [...m.values()];
  });

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
      <div class="wrap hero__grid">
        <div>
          <p class="kicker">Střední školy · přijímací řízení 2026/27</p>
          <h1>Kam na střední?</h1>
          <p class="perex">
            Najděte obory ve svém okolí. U každého ukazujeme, kolik míst škola otevírá a jak byl obor
            obsazený loni – podle otevřených dat Karlovarského kraje.
          </p>
          {#if krajCelkem}
            <div class="kpis">
              <div class="kpi">
                <span class="kpi__value">{fmtCs(oboru2026)}</span>
                <span class="kpi__label">oborů na {fmtCs(new Set(obory.map((o) => o.izo)).size)} školách</span>
              </div>
              <div class="kpi">
                <span class="kpi__value">{fmtCs(krajCelkem.zamer2026)}</span>
                <span class="kpi__label">míst v prvních ročnících 2026/27</span>
              </div>
              <div class="kpi">
                <span class="kpi__value">{procenta(krajCelkem.naplnenost)}</span>
                <span class="kpi__label">míst bylo loni obsazeno ({fmtCs(krajCelkem.prijato2025)} z {fmtCs(krajCelkem.zamer2025)})</span>
              </div>
              <div class="kpi kpi--accent">
                <span class="kpi__value">{fmtCs(Math.max(0, krajCelkem.zamer2025 - krajCelkem.prijato2025))}</span>
                <span class="kpi__label">míst zůstalo loni volných</span>
              </div>
            </div>
          {/if}
        </div>
        <div class="hero__art">
          <KrajSilueta orp={orpFeatures} skoly={siluetaSkoly} />
        </div>
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
          <div class="split">
            <SkolyList
              {vysledky}
              vybrana={sk.skola}
              {zvyraznena}
              maDomov={!!domov}
              {domovNazev}
              maxKm={sk.maxKm}
              razeni={sk.razeni}
              onrazeni={(r) => setSkoly({ razeni: r })}
              onselect={(izo) => setSkoly({ skola: izo })}
              onhover={(izo) => (zvyraznena = izo)}
            />
            <div class="split__map">
              <SkolyMapa
                obce={obecFeatures}
                orp={orpFeatures}
                {dostupnost}
                maxKm={sk.maxKm}
                domov={sk.domov}
                kruh={domov ? { ...domov, km: sk.maxKm } : null}
                skoly={mapaSkoly}
                ostatni={mapaOstatni}
                vybrana={sk.skola}
                {zvyraznena}
                onobec={(code) => setSkoly({ domov: code, skola: null })}
                onskola={(izo) => setSkoly({ skola: izo })}
                onhover={(izo) => (zvyraznena = izo)}
              />
            </div>
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
  .hero__grid {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 4fr);
    gap: 32px;
    align-items: center;
  }
  .hero__art {
    max-width: 440px;
    justify-self: end;
    width: 100%;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(12, 24, 56, 0.04);
  }
  .kpi {
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-left: 1px solid var(--line);
  }
  .kpi:first-child {
    border-left: 0;
  }
  .kpi__value {
    font-size: 2rem;
    line-height: 1.1;
    font-weight: 700;
    color: var(--brand-dark);
    letter-spacing: -0.02em;
  }
  .kpi--accent .kpi__value {
    color: var(--st-volno);
  }
  .kpi__label {
    font-size: 0.85rem;
    line-height: 1.35;
    color: var(--text-muted);
  }
  .split {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: 24px;
    align-items: start;
    margin-top: 24px;
  }
  .split__map {
    position: sticky;
    top: 16px;
    height: calc(100vh - 32px);
    min-height: 480px;
    max-height: 860px;
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
    .hero__grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .hero__art {
      display: none;
    }
    .split {
      grid-template-columns: minmax(0, 1fr);
    }
    .split__map {
      position: static;
      order: -1;
      height: min(70vw, 460px);
      min-height: 340px;
    }
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .kpi:nth-child(3) {
      border-left: 0;
    }
    .kpi:nth-child(n + 3) {
      border-top: 1px solid var(--line);
    }
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 560px) {
    .wrap {
      padding: 0 16px;
    }
    .topbar__in {
      min-height: 0;
      padding-top: 10px;
    }
    .mainnav {
      flex-wrap: nowrap;
      overflow-x: auto;
      width: 100%;
      margin: 0 -8px;
      scrollbar-width: none;
    }
    .mainnav button {
      white-space: nowrap;
      padding: 0 10px;
    }
    .kpi__value {
      font-size: 1.75rem;
    }
    .hero {
      padding: 24px 0 20px;
    }
  }
</style>
