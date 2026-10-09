<script lang="ts">
  import './styles/tokens.css';
  import './styles/crt.css';
  import { onDestroy } from 'svelte';
  import Drilldown from './components/Drilldown.svelte';
  import Detail from './components/Detail.svelte';
  import Sources from './components/Sources.svelte';
  import Poradce from './components/Poradce.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import Timeline from './components/Timeline.svelte';
  import Map from './components/Map.svelte';
  import Legend from './components/Legend.svelte';
  import WeightPanel from './components/WeightPanel.svelte';
  import HowModal, { type HowPart } from './components/HowModal.svelte';
  import SkolyFiltr from './components/skoly/SkolyFiltr.svelte';
  import SkolyList from './components/skoly/SkolyList.svelte';
  import SkolyMapa, { type MapaSkola } from './components/skoly/SkolyMapa.svelte';
  import SkolaDetail from './components/skoly/SkolaDetail.svelte';
  import KrajPrehled from './components/skoly/KrajPrehled.svelte';
  import VyletyHub from './components/vylety/VyletyHub.svelte';
  import VyletyFiltr from './components/vylety/VyletyFiltr.svelte';
  import MistaList from './components/vylety/MistaList.svelte';
  import MistoDetail from './components/vylety/MistoDetail.svelte';
  import Ikona from './components/vylety/Ikona.svelte';
  import Pruvodce, { type KrokPruvodce } from './components/Pruvodce.svelte';
  import type { MapPoint } from './components/Map.svelte';
  import { loadSnapshot, type Snapshot, type OnStep } from './lib/data/loader.ts';
  import {
    appState,
    initHashSync,
    linkInvalid,
    DEFAULT_SKOLY,
    DEFAULT_VYLETY,
    type Mode,
    type SkolyState,
    type VyletyState,
  } from './lib/state.ts';
  import {
    KATEGORIE,
    KATEGORIE_BY_ID,
    filtrujMista,
    mistaVDosahu,
    plural,
    pocty,
    type FiltrMist,
  } from './lib/vylety.ts';
  import type { KategorieId } from './lib/types.ts';
  import { centroidy } from './lib/map/centroids.ts';
  import {
    TRIDA_LABEL,
    agreguj,
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
  // Aplikace mluví jen o Karlovarském kraji: mapa i skóre začínají jeho 7 ORP (mapa krajů ČR
  // se nenabízí; data ČR zůstávají jen jako srovnávací základna v Detailu).
  $effect(() => {
    if (snap && (st.mode === 'explore' || st.mode === 'score') && view.level === 'kraj') {
      navigate({ level: 'orp', area: null, orp: null });
    }
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
    appState.update((s) => ({
      ...s,
      mode: m,
      skoly: m === 'skoly' ? (s.skoly ?? { ...DEFAULT_SKOLY }) : s.skoly,
      // bydliště zadané v jiném režimu se převezme, ať ho uživatel nevybírá dvakrát
      vylety:
        m === 'vylety'
          ? (s.vylety ?? { ...DEFAULT_VYLETY, tagy: [], domov: s.skoly?.domov ?? null })
          : s.vylety,
    }));
    toTop();
  }
  function toTop() {
    try {
      if (!navigator.userAgent.includes('jsdom')) window.scrollTo({ top: 0 });
    } catch {
      /* testovací prostředí */
    }
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

  // rychlý start v úvodu: výběr obce → filtr bydliště + posun na výsledky
  let startObec = $state('');
  $effect(() => {
    startObec = sk.domov ?? '';
  });
  function najdiSkoly() {
    if (!startObec) return;
    skolyTab = 'hledat';
    setSkoly({ domov: startObec, skola: null });
    requestAnimationFrame(() => {
      try {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        document.getElementById('skoly-vysledky')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      } catch {
        /* testovací prostředí */
      }
    });
  }
  const skupinyOboru = $derived([...new Set(obory.map((o) => o.skupina))].sort());
  const vysledky = $derived(
    filtrujObory(obory, { domov, typ: sk.typ, skupina: sk.skupina, maxKm: sk.maxKm }, sk.razeni),
  );
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
  const skolVDosahu = $derived(mapaSkoly.length);
  const mapaOstatni = $derived.by(() => {
    const v = new Set(mapaSkoly.map((s) => s.izo));
    const seen = new Set<string>();
    return obory
      .filter((o) => !v.has(o.izo) && !seen.has(o.izo) && seen.add(o.izo))
      .map((o) => ({ izo: o.izo, lat: o.lat, lon: o.lon }));
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
    { m: 'vylety', label: 'Kam vyrazit' },
    { m: 'explore', label: 'Mapa kraje' },
    { m: 'score', label: 'Kde by se mi žilo' },
  ];

  // --- režim „Kam vyrazit“ -------------------------------------------------
  const vy = $derived<VyletyState>(st.vylety ?? DEFAULT_VYLETY);
  const mista = $derived(snap?.vylety?.mista ?? []);
  const vyDomov = $derived(vy.domov ? (obecCentroidy[vy.domov] ?? null) : null);
  const vyDomovNazev = $derived(vy.domov ? (obecNames[vy.domov] ?? '') : '');
  const vyDef = $derived(vy.kat ? KATEGORIE_BY_ID[vy.kat] : undefined);
  const vyFiltr = $derived<FiltrMist>({
    kat: vy.kat,
    domov: vyDomov,
    maxKm: vy.maxKm,
    tagy: vy.tagy,
    vstup: vy.vstup,
    q: vy.q,
  });
  /** výsledky podle filtrů kategorie, ale bez omezení vzdáleností (pro barvení mapy) */
  const vyBezDosahu = $derived(filtrujMista(mista, { ...vyFiltr, domov: null }, 'nazev').map((r) => r.misto));
  const vyVysledky = $derived(filtrujMista(mista, vyFiltr, vy.razeni));
  const vyDosah = $derived(mistaVDosahu(vyBezDosahu, obecCentroidy, vy.maxKm));
  const vyPocty = $derived(pocty(mista));
  const vyPoctyVDosahu = $derived(vyDomov ? pocty(filtrujMista(mista, { ...vyFiltr, kat: null, tagy: [], vstup: 'vse', q: '' }).map((r) => r.misto)) : null);
  const vyMisto = $derived(vy.misto ? (mista.find((m) => m.id === vy.misto) ?? null) : null);
  const vyMistoKm = $derived(
    vyMisto && vyDomov ? (vyVysledky.find((r) => r.misto.id === vyMisto.id)?.km ?? vzdalenostKm(vyDomov.lat, vyDomov.lon, vyMisto.lat, vyMisto.lon)) : null,
  );
  let vyHover = $state<string | null>(null);
  const vyPoints = $derived.by((): MapPoint[] =>
    vyVysledky.map(({ misto: m }) => {
      const d = KATEGORIE_BY_ID[m.kat];
      return {
        id: m.id,
        name: m.nazev,
        lon: m.lon,
        lat: m.lat,
        layerLabel: `${d.label}${m.obecNazev ? ` · ${m.obecNazev}` : ''}`,
        provider: 'Karlovarský kraj (datazapad.cz)',
        tone: 'phosphor',
        glyph: 'o',
        color: d.barva,
      };
    }),
  );
  const VY_DOSAH_DEF = $derived<IndicatorDef>({
    id: 'vylety-dosah',
    label: vyDef ? `${vyDef.label} v dosahu` : 'Míst v dosahu',
    unit: 'počet',
    higherIsBetter: true,
    sourceId: 'datazapad',
    decimals: 0,
  });
  function vyPreview(code: AreaCode): string[] {
    const n = vyDosah[code] ?? 0;
    const j = vyDef?.jednotky ?? (['místo', 'místa', 'míst'] as [string, string, string]);
    return [`${n} ${plural(n, j)} do ${vy.maxKm} km`, 'klik = odsud vyrážím'];
  }
  function setVylety(patch: Partial<VyletyState>) {
    appState.update((s) => ({ ...s, vylety: { ...(s.vylety ?? DEFAULT_VYLETY), ...patch } }));
  }
  function openKat(k: KategorieId | null) {
    setVylety({ kat: k, tagy: [], vstup: 'vse', q: '', misto: null });
    toTop();
  }
  function openMisto(id: string) {
    const m = mista.find((x) => x.id === id);
    if (!m) return;
    // klik v rozcestníku nebo „V okolí“ na místo jiné kategorie → přepnout i kategorii
    if (vy.kat && m.kat !== vy.kat) setVylety({ kat: m.kat, tagy: [], vstup: 'vse', q: '', misto: id });
    else setVylety({ misto: id });
  }
  const vySources = $derived(snap ? snap.manifest.sources : []);

  // --- sdílení odkazu --------------------------------------------------------
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function showToast(t: string) {
    toast = t;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3000);
  }
  async function share() {
    const url = location.href;
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: document.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast('Odkaz je zkopírovaný. Otevře stránku přesně tak, jak ji vidíte.');
    } catch {
      showToast('Odkaz zkopírujte z adresního řádku – obsahuje vše, co jste nastavili.');
    }
  }

  // --- průvodce pro nové uživatele -------------------------------------------
  const TOUR_KEY = 'kk-pruvodce-v1';
  let tourOpen = $state(false);
  let tourHash = '';
  function openTour() {
    tourHash = location.hash;
    tourOpen = true;
  }
  function closeTour() {
    tourOpen = false;
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch {
      /* soukromé okno */
    }
    // průvodce byl jen ukázka – vrátit stránku tam, kde uživatel byl
    if (tourHash && location.hash !== tourHash) {
      history.replaceState(null, '', tourHash);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    toTop();
  }
  let tourChecked = false;
  $effect(() => {
    if (!snap || tourChecked) return;
    tourChecked = true;
    let seen = true;
    try {
      seen = localStorage.getItem(TOUR_KEY) === '1';
    } catch {
      seen = true;
    }
    if (!seen && !navigator.userAgent.includes('jsdom')) openTour();
  });
  const KROKY: KrokPruvodce[] = [
    {
      nadpis: 'Vítejte! Tohle je Karlovarský kraj v datech',
      text: 'Za minutu vám ukážeme, co tu najdete: střední školy, místa na výlet a čísla o obcích. Všechno pochází z otevřených dat kraje a státních úřadů.',
    },
    {
      cil: 'nav',
      nadpis: 'Čtyři části v jednom menu',
      text: 'Kam na střední: obory ve vašem okolí. Kam vyrazit: sjezdovky, koupání, hrady, rozhledny a další. Mapa kraje: čísla o ORP a obcích. Kde by se mi žilo: srovnání podle toho, na čem vám záleží.',
    },
    {
      cil: 'hub',
      pred: () => {
        setMode('vylety');
        setVylety({ kat: null, misto: null });
      },
      nadpis: 'Kam vyrazit: vyberte kategorii',
      text: 'Každá dlaždice je samostatná stránka s mapou, seznamem a filtry. Číslo ukazuje, kolik míst v kategorii je.',
    },
    {
      cil: 'filtr',
      pred: () => openKat('koupani'),
      nadpis: 'Filtry přímo pro kategorii',
      text: 'Vyberte obec, odkud vyrážíte, a jak daleko chcete jet. Každá kategorie má vlastní filtry. U koupání třeba poslední výsledek kontroly kvality vody od hygieniků.',
    },
    {
      cil: 'mapa',
      nadpis: 'Interaktivní mapa',
      text: 'Tmavší obec = víc míst v dosahu. Klik na obec nastaví, odkud vyrážíte, klik na značku otevře detail místa. Na mobilu stačí klepnout.',
    },
    {
      cil: 'list',
      nadpis: 'Seznam a detail místa',
      text: 'Karty řadíme od nejbližší. V detailu najdete web, kontakt, cestu na Mapy.cz a co dalšího je do 5 km.',
    },
    {
      cil: 'share',
      nadpis: 'Pošlete to dál',
      text: 'Vše, co nastavíte, je uložené v adrese stránky. Tlačítko Sdílet zkopíruje odkaz, který otevře přesně stejný pohled.',
    },
    {
      cil: 'help',
      nadpis: 'Průvodce kdykoli znovu',
      text: 'Když si nebudete jistí, spusťte průvodce tímto tlačítkem. Teď vás vrátíme tam, kde jste začali.',
    },
  ];

  function setSkoly(patch: Partial<SkolyState>) {
    appState.update((s) => ({ ...s, skoly: { ...(s.skoly ?? DEFAULT_SKOLY), ...patch } }));
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
    if (e.key !== 'Escape' || !snap || tourOpen) return;
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
    if (st.mode === 'vylety') {
      if (vy.misto) setVylety({ misto: null });
      else if (vy.kat) openKat(null);
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
      <div class="tools">
        <button type="button" class="tool" onclick={share} data-tour="share" data-testid="share-btn">
          <Ikona d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" size={18} />
          <span>Sdílet</span>
        </button>
        <button type="button" class="tool" onclick={openTour} data-tour="help" data-testid="tour-btn">
          <Ikona d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" size={18} />
          <span>Průvodce</span>
        </button>
      </div>
      <nav class="mainnav" aria-label="Hlavní navigace" data-tour="nav">
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

  {#if toast}
    <div class="toast" role="status" aria-live="polite">{toast}</div>
  {/if}

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
        {#if snap.skoly}
          <form class="start" aria-labelledby="start-h" data-testid="skoly-start" onsubmit={(e) => { e.preventDefault(); najdiSkoly(); }}>
            <p class="start__kicker">Rychlý start</p>
            <h2 id="start-h">Kde bydlíš?</h2>
            <label for="start-obec">Obec</label>
            <select id="start-obec" bind:value={startObec} data-testid="start-obec">
              <option value="">Vyber obec</option>
              {#each Object.entries(obecNames).sort((a, b) => a[1].localeCompare(b[1], 'cs')) as [code, name] (code)}
                <option value={code}>{name}</option>
              {/each}
            </select>
            <small>
              {#if startObec && startObec === sk.domov}
                Do {sk.maxKm} km {skolVDosahu === 1 ? 'je' : skolVDosahu >= 2 && skolVDosahu <= 4 ? 'jsou' : 'je'}
                <strong>{skolVDosahu} {skolVDosahu === 1 ? 'škola' : skolVDosahu >= 2 && skolVDosahu <= 4 ? 'školy' : 'škol'}</strong>.
              {:else}
                Ukážeme školy do {sk.maxKm} km, seřazené od nejbližší.
              {/if}
            </small>
            <button type="submit" class="start__btn" disabled={!startObec} data-testid="start-go">Najít školy v okolí</button>
            <button type="button" class="start__help" onclick={openTour}>Nevíš, jak začít? Spustit průvodce</button>
          </form>
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
          <div class="split" id="skoly-vysledky">
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
  {:else if st.mode === 'vylety'}
    <section class="hero" class:hero--slim={!!vyDef}>
      <div class="wrap">
        {#if vyDef}
          <button type="button" class="back" onclick={() => openKat(null)} data-testid="vylety-back">← Všechny kategorie</button>
          <div class="kathead">
            <span class="kathead__ico" style="--c: {vyDef.barva}"><Ikona d={vyDef.ikona} size={30} /></span>
            <div>
              <p class="kicker">Kam vyrazit · Karlovarský kraj</p>
              <h1>
                {vyVysledky.length}
                {plural(vyVysledky.length, vyDef.jednotky)}{#if vyDomov}&nbsp;do {vy.maxKm} km od obce {vyDomovNazev}{:else}&nbsp;v kraji{/if}
              </h1>
            </div>
          </div>
          <p class="perex">{vyDef.perex}</p>
          <nav class="katnav" aria-label="Kategorie">
            {#each KATEGORIE as k (k.id)}
              <button
                type="button"
                class:on={k.id === vy.kat}
                aria-current={k.id === vy.kat ? 'page' : undefined}
                onclick={() => openKat(k.id)}>{k.label}</button
              >
            {/each}
          </nav>
        {:else}
          <p class="kicker">Volný čas · Karlovarský kraj</p>
          <h1>Kam vyrazit?</h1>
          <p class="perex">
            {mista.length} míst z otevřených dat kraje, od sjezdovek po minerální prameny. Vyberte kategorii,
            nebo nejdřív zadejte, odkud vyrážíte. Spočítáme, co máte v dosahu.
          </p>
          <div class="hubbar">
            <div class="hubbar__f">
              <label for="h-domov">Odkud vyrážíte?</label>
              <select
                id="h-domov"
                value={vy.domov ?? ''}
                onchange={(e) => setVylety({ domov: e.currentTarget.value || null })}
                data-testid="hub-domov"
              >
                <option value="">Celý kraj</option>
                {#each Object.entries(obecNames).sort((a, b) => a[1].localeCompare(b[1], 'cs')) as [code, name] (code)}
                  <option value={code}>{name}</option>
                {/each}
              </select>
            </div>
            <div class="hubbar__f">
              <label for="h-km">Jak daleko?</label>
              <div class="hubbar__range">
                <input
                  id="h-km"
                  type="range"
                  min="5"
                  max="80"
                  step="5"
                  value={vy.maxKm}
                  disabled={!vy.domov}
                  oninput={(e) => setVylety({ maxKm: Number(e.currentTarget.value) })}
                  aria-valuetext="{vy.maxKm} km"
                />
                <output for="h-km">{vy.maxKm} km</output>
              </div>
            </div>
            <div class="hubbar__f hubbar__f--q">
              <label for="h-q">Hledat místo</label>
              <input
                id="h-q"
                type="search"
                placeholder="např. Klínovec, Loket, Soos"
                value={vy.q}
                oninput={(e) => setVylety({ q: e.currentTarget.value })}
                data-testid="hub-q"
              />
            </div>
          </div>
        {/if}
      </div>
    </section>

    <main class="wrap main">
      {#if !snap.vylety}
        <p class="state state--err" role="alert">Data o místech pro volný čas se nepodařilo načíst.</p>
      {:else if !vyDef}
        <div class="grid grid--hub">
          <div class="hubcol">
            {#if vy.q.trim()}
              <MistaList
                vysledky={vyVysledky}
                vybrane={vy.misto}
                maDomov={!!vyDomov}
                razeni={vy.razeni}
                onrazeni={(r) => setVylety({ razeni: r })}
                onselect={openMisto}
                onhover={(id) => (vyHover = id)}
              />
            {/if}
            <VyletyHub pocty={vyPocty} vDosahu={vyPoctyVDosahu} maxKm={vy.maxKm} domovNazev={vyDomovNazev} onkat={(k) => openKat(k)} />
          </div>
          <section class="mapcard" aria-label="Mapa míst" data-tour="mapa-hub">
            <h2>Všechna místa na mapě</h2>
            <p class="mapcard__hint">
              Barva značky = kategorie. Klikněte na značku pro detail, na obec pro nastavení, odkud vyrážíte.
            </p>
            <Map
              features={obecFeatures}
              values={vyDosah}
              def={VY_DOSAH_DEF}
              year={2026}
              selected={vy.domov}
              preview={vyPreview}
              points={vyPoints}
              selectedPoint={vyHover ?? vy.misto}
              onselect={(code) => setVylety({ domov: code })}
              onpointselect={openMisto}
              circle={vyDomov ? { ...vyDomov, km: vy.maxKm, label: vyDomovNazev } : null}
              label="Mapa míst pro volný čas v Karlovarském kraji"
              hint="Najeďte na značku nebo obec. Klik na značku otevře detail místa."
            />
            <ul class="katlegend" aria-label="Barvy kategorií">
              {#each KATEGORIE as k (k.id)}
                <li><span class="dot" style="background: {k.barva}"></span>{k.label}</li>
              {/each}
            </ul>
          </section>
        </div>
      {:else}
        <VyletyFiltr filtr={vy} def={vyDef} obce={obecNames} pocet={vyVysledky.length} onchange={setVylety} />
        <div class="grid">
          <MistaList
            vysledky={vyVysledky}
            vybrane={vy.misto}
            maDomov={!!vyDomov}
            razeni={vy.razeni}
            onrazeni={(r) => setVylety({ razeni: r })}
            onselect={openMisto}
            onhover={(id) => (vyHover = id)}
          />
          <section class="mapcard" aria-label="Mapa" data-tour="mapa">
            <h2>Kde to je</h2>
            <p class="mapcard__hint">
              Tmavší obec = víc míst{vyDomov ? '' : ' (podle filtrů)'} do {vy.maxKm} km. Klikněte na obec, odkud vyrážíte,
              nebo na značku místa.
            </p>
            <Map
              features={obecFeatures}
              values={vyDosah}
              def={VY_DOSAH_DEF}
              year={2026}
              selected={vy.domov}
              preview={vyPreview}
              points={vyPoints}
              selectedPoint={vyHover ?? vy.misto}
              onselect={(code) => setVylety({ domov: code })}
              onpointselect={openMisto}
              circle={vyDomov ? { ...vyDomov, km: vy.maxKm, label: vyDomovNazev } : null}
              label="Mapa: {vyDef.label} v Karlovarském kraji"
              hint="Najeďte na obec a uvidíte, kolik míst je odtud v dosahu. Klik na značku otevře detail."
            />
            <Legend values={obecFeatures.map((f) => vyDosah[f.properties.code] ?? null)} def={VY_DOSAH_DEF} year={2026} />
          </section>
        </div>
      {/if}
      {#if vyMisto}
        <MistoDetail
          misto={vyMisto}
          km={vyMistoKm}
          domovNazev={vyDomovNazev}
          vsechna={mista}
          source={vySources.find((s) => s.id === vyMisto.sourceId)}
          vodaSource={vySources.find((s) => s.id === 'khs-koupani')}
          onclose={() => setVylety({ misto: null })}
          onselect={openMisto}
        />
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
            : 'Vyberte ukazatel a rok. Klikněte na ORP (správní obvod) a dál na jednotlivé obce. Číslo vždy srovnáváme s průměrem Česka.'}
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
            <h2 class="ascii-panel__title">Vyberte ORP nebo obec na mapě</h2>
            <p>
              Klikněte na ORP (nebo Tab a Enter, šipky přeskakují mezi sousedy). Pak uvidíte jeho obce.
              Klávesa Esc vrací o úroveň výš.
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
        Data: Karlovarský kraj (DATAZÁPAD), Krajská hygienická stanice, Český statistický úřad, ČÚZK, ÚZIS – podrobně v
        <button type="button" class="linklike" onclick={openSources}>Zdrojích dat</button>. Vzdálenosti vzdušnou čarou.
      </p>
    </div>
  </footer>

  {#if tourOpen && snap}
    <Pruvodce kroky={KROKY} onclose={closeTour} />
  {/if}

  {#if sourcesOpen && snap}
    <Sources sources={snap.manifest.sources} updatedAt={snap.updatedAt} onclose={closeSources} />
  {/if}

  {#if snap}
    <Poradce ctx={{ snap, obecNames, obecCentroidy }} />
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
  .mainnav button:focus-visible,
  .tool:focus-visible,
  .back:focus-visible,
  .katnav button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  /* nástroje v liště: Sdílet, Průvodce */
  .tools {
    display: flex;
    gap: 6px;
    order: 3;
  }
  .tool {
    font: inherit;
    font-size: 0.9rem;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: #fff;
    color: var(--brand);
    cursor: pointer;
  }
  .tool:hover {
    border-color: var(--brand);
    background: #e3edf8;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    z-index: 60;
    max-width: calc(100vw - 32px);
    padding: 12px 18px;
    border-radius: 6px;
    background: var(--brand-dark);
    color: #fff;
    box-shadow: 0 8px 24px rgba(12, 24, 56, 0.3);
  }
  /* „Kam vyrazit“ */
  .back {
    font: inherit;
    font-weight: 500;
    background: none;
    border: 0;
    padding: 0;
    min-height: 44px;
    color: var(--brand);
    cursor: pointer;
    text-decoration: underline;
  }
  .kathead {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .kathead__ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    color: var(--c);
    background: #fff;
    border: 2px solid color-mix(in srgb, var(--c) 30%, #fff);
  }
  .katnav {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: thin;
  }
  .katnav button {
    font: inherit;
    font-size: 0.9rem;
    white-space: nowrap;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--line-strong);
    background: #fff;
    color: var(--brand-dark);
    cursor: pointer;
  }
  .katnav button.on {
    background: var(--brand-dark);
    border-color: var(--brand-dark);
    color: #fff;
  }
  .hubbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.3fr);
    gap: 16px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: 16px 20px;
    box-shadow: var(--shadow);
  }
  .hubbar__f {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .hubbar label {
    font-weight: 500;
    color: var(--brand-dark);
  }
  .hubbar select,
  .hubbar input[type='search'] {
    font: inherit;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid #8a94a3;
    border-radius: 4px;
    background: #fff;
    color: var(--text);
    width: 100%;
    box-sizing: border-box;
  }
  .hubbar__range {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
  }
  .hubbar__range input {
    flex: 1;
    min-width: 0;
    accent-color: var(--brand);
  }
  .hubbar output {
    font-weight: 700;
    color: var(--brand);
    min-width: 3.5em;
    text-align: right;
  }
  /* „Kam vyrazit“: seznam vlevo, mapa vpravo (lepí se při posunu) */
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
  .grid--hub {
    margin-top: 0;
  }
  .hubcol {
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-width: 0;
  }
  .katlegend {
    list-style: none;
    padding: 0;
    margin: 10px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  .katlegend .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 5px;
    vertical-align: -1px;
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
    grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
    gap: 32px;
    align-items: center;
  }
  /* rychlý start „Kde bydlíš?“ – nejkratší cesta k výsledkům */
  .start {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #fff;
    border: 1px solid var(--line);
    border-top: 4px solid var(--brand);
    border-radius: 12px;
    padding: 18px 20px 14px;
    box-shadow: var(--shadow);
  }
  .start__kicker {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--brand);
  }
  .start h2 {
    margin: 0 0 6px;
    font-size: 1.5rem;
    color: var(--brand-dark);
  }
  .start label {
    font-weight: 500;
    color: var(--brand-dark);
  }
  .start select {
    font: inherit;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid #8a94a3;
    border-radius: 4px;
    background: #fff;
    color: var(--text);
    width: 100%;
  }
  .start small {
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .start small strong {
    color: var(--brand);
  }
  .start__btn {
    font: inherit;
    font-weight: 500;
    min-height: 44px;
    margin-top: 6px;
    border: 0;
    border-radius: 4px;
    background: var(--brand);
    color: #fff;
    cursor: pointer;
  }
  .start__btn:hover:not(:disabled) {
    background: var(--brand-hover);
  }
  .start__btn:disabled {
    background: #e5e8ec;
    color: #6b7380;
    cursor: not-allowed;
  }
  .start__btn:focus-visible,
  .start__help:focus-visible,
  .start select:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .start__help {
    font: inherit;
    font-size: 0.88rem;
    min-height: 40px;
    background: none;
    border: 0;
    color: var(--brand);
    text-decoration: underline;
    cursor: pointer;
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
  @media (max-width: 1100px) {
    .topbar__in {
      padding-top: 8px;
      padding-bottom: 4px;
    }
    .mainnav {
      order: 4;
      width: 100%;
    }
  }
  @media (max-width: 1000px) {
    .hero__grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
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
    .hubbar {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .hubbar__f--q {
      grid-column: 1 / -1;
    }
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .mapcard {
      position: static;
      order: -1;
    }
    .grid,
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
    .kpis {
      gap: 10px;
    }
    .kpi {
      padding: 12px 14px;
    }
    .tools {
      order: 2;
      gap: 4px;
    }
    .tool {
      padding: 0 10px;
      min-height: 40px;
      font-size: 0.85rem;
    }
    /* na úzké obrazovce jen text (ikona bez textu by u důležité akce nebyla srozumitelná) */
    .tool :global(svg) {
      display: none;
    }
    .grid--hub .mapcard {
      order: 1;
    }
    .brandmark__bar {
      height: 32px;
    }
    .brandmark__txt {
      font-size: 0.8rem;
    }
    .brandmark__txt strong {
      font-size: 0.95rem;
    }
    .hubbar {
      grid-template-columns: minmax(0, 1fr);
      padding: 14px;
    }
    .kathead__ico {
      width: 48px;
      height: 48px;
    }
    .main {
      padding-top: 16px;
    }
    .mapcard {
      padding: 14px;
    }
    .perex {
      font-size: 1.02rem;
    }
  }
  @media (max-width: 340px) {
    .brandmark__txt {
      font-size: 0.72rem;
    }
    .tool {
      padding: 0 8px;
    }
  }
</style>
