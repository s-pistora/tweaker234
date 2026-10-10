<script lang="ts">
  import './styles/tokens.css';
  import './styles/crt.css';
  import './styles/print.css';
  import { onDestroy } from 'svelte';
  import Drilldown from './components/Drilldown.svelte';
  import Detail from './components/Detail.svelte';
  import Sources from './components/Sources.svelte';
  import Poradce from './components/Poradce.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import Timeline from './components/Timeline.svelte';
  import Map from './components/Map.svelte';
  import Legend from './components/Legend.svelte';
  import ZivotPanel from './components/zivot/ZivotPanel.svelte';
  import ZivotTop from './components/zivot/ZivotTop.svelte';
  import ZivotDetail from './components/zivot/ZivotDetail.svelte';
  import ZivotVrstvy from './components/zivot/ZivotVrstvy.svelte';
  import { bodyVObci, vrstvyPozadavku } from './lib/zivot-mapa.ts';
  import SkolyFiltr from './components/skoly/SkolyFiltr.svelte';
  import Urady from './components/urady/Urady.svelte';
  import Penize from './components/penize/Penize.svelte';
  import Podnikani from './components/podnikani/Podnikani.svelte';
  import Nalezy from './components/Nalezy.svelte';
  import { vouchery as nactiVouchery, kc } from './lib/penize.ts';
  import Domu, { type Dlazdice } from './components/Domu.svelte';
  import SkolyList from './components/skoly/SkolyList.svelte';
  import Poradny from './components/skoly/Poradny.svelte';
  import StahnoutData from './components/common/StahnoutData.svelte';
  import SkolyMapa, { type MapaSkola } from './components/skoly/SkolyMapa.svelte';
  import SkolaDetail from './components/skoly/SkolaDetail.svelte';
  import Planovac from './components/skoly/Planovac.svelte';
  import KartaObce from './components/obec/KartaObce.svelte';
  import { kartaObce } from './lib/karta.ts';
  import ProKraj from './components/prokraj/ProKraj.svelte';
  import { detiPodleOrp, indexyOrp } from './lib/odhad.ts';
  import { pokryti } from './lib/bilamista.ts';
  import { oboryPlanu, pridej, odeber } from './lib/planovac.ts';
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
    DEFAULT_ZIVOT,
    DEFAULT_URADY,
    DEFAULT_PENIZE,
    DEFAULT_PODNIKANI,
    DEFAULT_PROKRAJ,
    type Mode,
    type SkolyState,
    type VyletyState,
    type ZivotState,
    type UradyState,
    type PenizeState,
    type PodnikaniState,
    type ProKrajState,
  } from './lib/state.ts';
  import {
    DOPORUCENY_VYBER,
    POZADAVKY,
    POZADAVKY_BY_ID,
    bodyPozadavku,
    kratkaHodnota,
    poradi,
    silneStranky,
    spocitejSkore,
    vytvorKontext,
  } from './lib/zivot.ts';
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
  import type { AreaCode, IndicatorDef } from './lib/types.ts';

  /** Kořen dat (relativně k index.html). Koordinátor přepne na 'data' při integraci. */
  const DATA_BASE = 'data';

  // Výchozí stránka je úvod info centra: prázdná adresa → rozcestník.
  if (!location.hash || location.hash === '#' || location.hash === '#/') {
    history.replaceState(null, '', '#/kraj?m=domu');
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

  let skolyTab = $state<'hledat' | 'plan' | 'kraj'>('hledat');

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
  // Aplikace mluví jen o Karlovarském kraji: mapa začíná jeho 7 ORP (mapa krajů ČR
  // se nenabízí; data ČR zůstávají jen jako srovnávací základna v Detailu).
  // Režim „Kde by se mi dobře žilo?“ má vlastní mapu obcí a drill-down nepoužívá.
  $effect(() => {
    if (snap && st.mode === 'explore' && view.level === 'kraj') {
      navigate({ level: 'orp', area: null, orp: null });
    }
  });

  const file = $derived(snap?.indicators[view.level]);
  const years = $derived(yearsWithData(file, st.indicator));
  const target = $derived(detailTarget(view));

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
  // „Kde by se mi žilo“ (score) má vlastní stav (zivot) a level/area ze Statistiky
  // nepoužívá. Při odchodu ze Statistiky si její pohled schováme a při návratu ho
  // obnovíme, ať ho jiné režimy (nebo efekty nad hashem) nepřepíšou.
  let exploreView: View | null = null;
  function setMode(m: Mode) {
    if (m !== st.mode) {
      if (st.mode === 'explore') exploreView = view;
      // „Kde by se mi žilo“ má vlastní stav (zivot) – výběr ze Statistiky ho neovlivní
      if (m === 'explore' && exploreView) navigate(exploreView);
    }
    appState.update((s) => ({
      ...s,
      mode: m,
      skoly: m === 'skoly' ? (s.skoly ?? { ...DEFAULT_SKOLY }) : s.skoly,
      // bydliště zadané v jiném režimu se převezme, ať ho uživatel nevybírá dvakrát
      vylety:
        m === 'vylety'
          ? (s.vylety ?? { ...DEFAULT_VYLETY, tagy: [], domov: s.skoly?.domov ?? null })
          : s.vylety,
      zivot: m === 'score' ? (s.zivot ?? { ...DEFAULT_ZIVOT, pozadavky: { ...DOPORUCENY_VYBER } }) : s.zivot,
      // obec z jiného režimu se převezme i pro úřady
      penize: m === 'penize' ? (s.penize ?? { ...DEFAULT_PENIZE }) : s.penize,
      podnikani: m === 'podnikani' ? (s.podnikani ?? { ...DEFAULT_PODNIKANI }) : s.podnikani,
      obec: m === 'obec' ? (s.obec ?? { kod: s.skoly?.domov ?? s.vylety?.domov ?? s.urady?.obec ?? s.zivot?.obec ?? null }) : s.obec,
      prokraj: m === 'prokraj' ? (s.prokraj ?? { ...DEFAULT_PROKRAJ }) : s.prokraj,
      urady:
        m === 'urady'
          ? (s.urady ?? { ...DEFAULT_URADY, obec: s.skoly?.domov ?? s.vylety?.domov ?? s.zivot?.obec ?? null })
          : s.urady,
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
  /** šedé tečky škol mimo filtr – jen bez zadaného bydliště; s bydlištěm se na mapě ukazuje
   *  výhradně to, co je do zvolené vzdálenosti */
  const mapaOstatni = $derived.by(() => {
    if (domov) return [];
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
  const planObory = $derived(oboryPlanu(sk.plan, obory));
  function togglePlan(id: string) {
    setSkoly({ plan: sk.plan.includes(id) ? odeber(sk.plan, id) : pridej(sk.plan, id) });
  }
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
    { m: 'score', label: 'Kde by se mi žilo' },
    { m: 'urady', label: 'Úřady' },
    { m: 'penize', label: 'Peníze kraje' },
    { m: 'podnikani', label: 'Podnikání' },
  ];
  /** vedlejší menu (vedle Statistiky kraje a Zdrojů dat) */
  const MODE_NAV_DALSI: { m: Mode; label: string }[] = [
    { m: 'obec', label: 'Karta obce' },
    { m: 'prokraj', label: 'Pro kraj' },
  ];

  // --- režim „Podnikání“ ------------------------------------------------------
  const pod = $derived<PodnikaniState>(st.podnikani ?? DEFAULT_PODNIKANI);
  function setPodnikani(patch: Partial<PodnikaniState>) {
    appState.update((s) => ({ ...s, podnikani: { ...(s.podnikani ?? DEFAULT_PODNIKANI), ...patch } }));
  }

  // --- režim „Peníze kraje“ ----------------------------------------------------
  const pe = $derived<PenizeState>(st.penize ?? DEFAULT_PENIZE);
  const penizeVouchery = $derived(nactiVouchery(snap?.points['vouchery']?.features ?? []));
  const dnesIso = new Date().toISOString().slice(0, 10);
  function setPenize(patch: Partial<PenizeState>) {
    appState.update((s) => ({ ...s, penize: { ...(s.penize ?? DEFAULT_PENIZE), ...patch } }));
  }

  /** mobilní menu (do 1000 px šířky) */
  let menuOpen = $state(false);


  // --- režim „Úřady“ ---------------------------------------------------------
  const ur = $derived<UradyState>(st.urady ?? DEFAULT_URADY);
  function setUrady(patch: Partial<UradyState>) {
    appState.update((s) => ({ ...s, urady: { ...(s.urady ?? DEFAULT_URADY), ...patch } }));
  }
  // „Statistika kraje“ (m=explore) není v hlavním menu – odkaz je vedle Zdrojů dat a v patičce.

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

  // --- úvodní stránka info centra ---------------------------------------------
  const domuObec = $derived(st.skoly?.domov ?? st.vylety?.domov ?? st.urady?.obec ?? null);
  function setDomuObec(code: AreaCode | null) {
    appState.update((s) => ({
      ...s,
      skoly: { ...(s.skoly ?? DEFAULT_SKOLY), domov: code, skola: null },
      vylety: { ...(s.vylety ?? DEFAULT_VYLETY), tagy: s.vylety?.tagy ?? [], domov: code, misto: null },
      urady: { ...(s.urady ?? DEFAULT_URADY), obec: code },
    }));
  }
  const pl3 = (n: number, f: [string, string, string]) => (n === 1 ? f[0] : n >= 2 && n <= 4 ? f[1] : f[2]);
  const fmtN = (n: number) => new Intl.NumberFormat('cs-CZ').format(n);
  const domuDlazdice = $derived.by((): Dlazdice[] => {
    if (!snap) return [];
    const stred = domuObec ? (obecCentroidy[domuObec] ?? null) : null;
    const nazev = domuObec ? (obecNames[domuObec] ?? '') : '';
    const kmS = st.skoly?.maxKm ?? DEFAULT_SKOLY.maxKm;
    const kmV = st.vylety?.maxKm ?? DEFAULT_VYLETY.maxKm;
    const oboryV = stred ? filtrujObory(obory, { domov: stred, typ: 'vse', skupina: '', maxKm: kmS }) : null;
    const skolV = oboryV ? new Set(oboryV.map((r) => r.obor.izo)).size : 0;
    const mistaV = stred ? filtrujMista(mista, { kat: null, domov: stred, maxKm: kmV, tagy: [], vstup: 'vse', q: '' }).length : null;
    const urObec = domuObec ? snap.urady?.obce.find((o) => o.kod === domuObec) : undefined;
    const aktualni = snap.penize?.projekty.filter((p) => p.stav === 'probiha') ?? [];
    const vydaje = aktualni.reduce((a, p) => a + (p.vydaje ?? 0), 0);
    const pocetKat = new Set(mista.map((m) => m.kat)).size;
    return [
      {
        mode: 'skoly',
        nazev: 'Kam na střední',
        popis: 'Obory středních škol, počet míst a jak byly loni obsazené. Poradny pro výběr školy.',
        cislo: fmtN(oboryV ? oboryV.length : oboru2026),
        pod: oboryV ? `${pl3(oboryV.length, ['obor', 'obory', 'oborů'])} na ${skolV} ${pl3(skolV, ['škole', 'školách', 'školách'])} do ${kmS} km` : `oborů na ${new Set(obory.map((o) => o.izo)).size} školách`,
        ikona: 'M3 9l9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5M21 9v6',
        barva: '#00469B',
      },
      {
        mode: 'vylety',
        nazev: 'Kam vyrazit',
        popis: 'Hrady, rozhledny, koupání, prameny, památky, regionální dobroty a další tipy na výlet.',
        cislo: fmtN(mistaV ?? mista.length),
        pod: mistaV !== null ? `${pl3(mistaV, ['místo', 'místa', 'míst'])} do ${kmV} km od obce ${nazev}` : `míst v ${pocetKat} kategoriích`,
        ikona: 'M3 20l6-12 4 7 3-4 5 9zM16 6a2 2 0 1 0 0-.01',
        barva: '#00998F',
      },
      {
        mode: 'score',
        nazev: 'Kde by se mi žilo',
        popis: 'Srovnání obcí podle toho, na čem vám záleží – lékař, škola, zastávka, příroda, věk obyvatel.',
        cislo: fmtN(Object.keys(obecNames).length),
        pod: `obcí podle ${POZADAVKY.length} požadavků`,
        ikona: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
        barva: '#462E73',
      },
      {
        mode: 'urady',
        nazev: 'Úřady',
        popis: 'Kam s čím: obecní, stavební a živnostenský úřad, matrika, občanské průkazy. Kontakty a datové schránky.',
        cislo: urObec ? String(2 + urObec.stavebni.length + (urObec.zivnostensky ? 1 : 0) + (urObec.nazev === urObec.orp ? 0 : 1)) : fmtN(snap.urady?.obce.length ?? 0),
        pod: urObec ? `úřadů pro obec ${urObec.nazev}` : 'obcí s příslušnými úřady',
        ikona: 'M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10h20L12 3z',
        barva: '#3771B8',
      },
      {
        mode: 'penize',
        nazev: 'Peníze kraje',
        popis: 'Co kraj buduje, kolik stojí a kolik pokryjí dotace. Vouchery pro firmy a strategie kraje.',
        cislo: kc(vydaje),
        pod: `v ${aktualni.length} běžících projektech`,
        ikona: 'M3 7h18v12H3zM3 11h18M7 15h3',
        barva: '#FFAA00',
      },
      {
        mode: 'podnikani',
        nazev: 'Podnikání',
        popis: 'Grafici, fotografové a řemeslníci z kraje, inkubátory a coworkingy, průmyslové zóny.',
        cislo: fmtN(snap.podnikani?.kreativci.length ?? 0),
        pod: `kreativců a ${snap.podnikani?.infra.length ?? 0} míst pro podnikání`,
        ikona: 'M4 7h16v13H4zM9 7V4h6v3M4 12h16',
        barva: '#680526',
      },
      {
        mode: 'obec',
        nazev: 'Karta obce',
        popis: 'Pro starosty: lidé, služby, školy, peníze a úřady obce na jedné stránce k tisku nebo do PDF.',
        cislo: domuObec ? (obecNames[domuObec] ?? '') : fmtN(Object.keys(obecNames).length),
        pod: domuObec ? 'karta připravená k tisku' : 'karet obcí k tisku',
        ikona: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
        barva: '#00796F',
      },
      {
        mode: 'prokraj',
        nazev: 'Pro kraj',
        popis: 'Kde chybí lékař, školka nebo lékárna a kam ji umístit. Výhled oborů: kde hrozí prázdné lavice.',
        cislo: ziCtx ? fmtN(pokryti(ziCtx, 'lekar', DEFAULT_PROKRAJ.km).mimo) : '–',
        pod: `obyvatel má praktického lékaře dál než ${DEFAULT_PROKRAJ.km} km`,
        ikona: 'M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12zM12 11a2 2 0 1 0 0-.01',
        barva: '#3771B8',
      },
      {
        mode: 'explore',
        nazev: 'Statistika kraje',
        popis: 'Obyvatelé, věk, nezaměstnanost, školy a lékaři v ORP a obcích – s vývojem v čase.',
        cislo: '7',
        pod: 'ORP a 134 obcí v číslech',
        ikona: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
        barva: '#5A6370',
      },
      {
        mode: 'nalezy',
        nazev: 'Co jsme našli v datech',
        popis: 'Chyby, nejednotné formáty a mezery v datech kraje – a jak jsme si s nimi poradili.',
        cislo: String(11 + (snap.urady?.chybyDat.length ?? 0) + (snap.penize?.chybyDat.length ?? 0) + (snap.podnikani?.chybyDat.length ?? 0)),
        pod: 'nálezů pro správce katalogu',
        ikona: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M11 8v4M11 15h.01',
        barva: '#B8860B',
      },
    ];
  });
  const domuSouhrn = $derived({
    sady: snap?.manifest.sources.length ?? 0,
    zaznamy:
      (snap?.skoly?.obory.length ?? 0) +
      mista.length +
      (snap?.urady?.obce.length ?? 0) +
      (snap?.urady?.matriky.length ?? 0) +
      (snap?.penize?.projekty.length ?? 0) +
      (snap?.podnikani ? snap.podnikani.kreativci.length + snap.podnikani.infra.length + snap.podnikani.zony.length : 0),
    nalezy: 11 + (snap?.urady?.chybyDat.length ?? 0) + (snap?.penize?.chybyDat.length ?? 0) + (snap?.podnikani?.chybyDat.length ?? 0),
  });
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
    return [`${n} ${plural(n, j)} do ${vy.maxKm} km`, 'kliknutím ji zvolíte jako výchozí místo'];
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

  // --- režim „Kde by se mi dobře žilo?“ ------------------------------------
  // Vlastní stav (st.zivot) a vlastní mapa všech obcí kraje – nezávisle na drill-downu
  // Statistiky (st.level/st.area). Metriky a percentily se počítají jednou na požadavek
  // (memo v kontextu), přepočet skóre při změně výběru je jen vážený průměr.
  const ZIVOT_DEF: IndicatorDef = {
    id: 'zivot-skore',
    label: 'Skóre',
    unit: '/100',
    higherIsBetter: true,
    sourceId: 'zivot',
    decimals: 0,
  };
  const zi = $derived<ZivotState>(st.zivot ?? DEFAULT_ZIVOT);
  const ziCtx = $derived(snap ? vytvorKontext(snap, obecCentroidy, obecNames) : null);
  const ziSkore = $derived(ziCtx ? spocitejSkore(ziCtx, zi.pozadavky) : {});
  const ziPoradi = $derived(poradi(ziSkore, obecNames));
  const ziRank = $derived(Object.fromEntries(ziPoradi.map((r) => [r.code, r.rank])) as Record<AreaCode, number>);
  const ziValues = $derived(
    Object.fromEntries(obecFeatures.map((f) => [f.properties.code, ziSkore[f.properties.code]?.score ?? null])) as Record<
      AreaCode,
      number | null
    >,
  );
  const ziPocetBodu = $derived(
    ziCtx ? Object.fromEntries(POZADAVKY.map((p) => [p.id, bodyPozadavku(ziCtx, p.id).length])) : {},
  );
  /** obec → název ORP (pro seznam a detail) */
  const ziOrp = $derived(
    Object.fromEntries(
      obecFeatures.map((f) => [f.properties.code, geoIndex.names[geoIndex.obecParent[f.properties.code]] ?? '']),
    ) as Record<AreaCode, string>,
  );
  const ziUkaz = $derived(zi.ukaz ? POZADAVKY_BY_ID[zi.ukaz] : undefined);
  // přiblížená obec: body všech vybraných požadavků (každý jiná barva i tvar), vrstvy jdou skrýt
  /** mapa ukazuje jen vybranou obec bez okolních obcí (tlačítko „Celý kraj“ vrátí celý kraj, detail zůstane) */
  let ziPriblizeno = $state(true);
  let ziSkryte = $state<Set<string>>(new Set());
  /** vybraný bod na mapě: `<vrstva>|<id bodu>` */
  let ziBod = $state<string | null>(null);
  let ziObecPrev: AreaCode | null = null;
  $effect(() => {
    const o = zi.obec;
    if (o === ziObecPrev) return;
    ziObecPrev = o;
    ziPriblizeno = true;
    ziBod = null;
  });
  const ziVrstvy = $derived.by(() => {
    if (!ziCtx || !zi.obec) return [];
    const ids = Object.keys(zi.pozadavky);
    if (zi.ukaz && !ids.includes(zi.ukaz)) ids.push(zi.ukaz);
    const ctx = ziCtx;
    const obec = zi.obec;
    return vrstvyPozadavku(ids).map((v) => ({ ...v, vObci: bodyVObci(ctx, v.id, obec).length }));
  });
  const ziObecSama = $derived(
    zi.obec && ziPriblizeno ? (obecFeatures.find((x) => x.properties.code === zi.obec) ?? null) : null,
  );
  /** jen body, které leží ve vybrané obci */
  const ziObecPoints = $derived.by((): MapPoint[] => {
    if (!ziCtx || !zi.obec) return [];
    const ctx = ziCtx;
    const obec = zi.obec;
    return ziVrstvy
      .filter((v) => !ziSkryte.has(v.id))
      .flatMap((v) =>
        bodyVObci(ctx, v.id, obec).map((b) => ({
          id: `${v.id}|${b.id}`,
          name: b.nazev,
          lon: b.lon,
          lat: b.lat,
          layerLabel: `${v.label}${b.obecNazev ? ` · ${b.obecNazev}` : ''}`,
          provider: b.provider,
          tone: 'phosphor' as const,
          glyph: v.glyph,
          color: v.barva,
        })),
      );
  });
  const ziVybranyBod = $derived.by(() => {
    if (!ziBod || !ziCtx || !zi.obec) return null;
    const i = ziBod.indexOf('|');
    const vrstva = ziBod.slice(0, i);
    const id = ziBod.slice(i + 1);
    const bod = bodyPozadavku(ziCtx, vrstva).find((b) => b.id === id);
    const c = obecCentroidy[zi.obec];
    return bod && c ? { bod, vrstva, km: vzdalenostKm(c.lat, c.lon, bod.lat, bod.lon) } : null;
  });
  function ziToggleVrstva(id: string) {
    const n = new Set(ziSkryte);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    ziSkryte = n;
    if (ziBod?.startsWith(`${id}|`)) ziBod = null;
  }
  const ziPoints = $derived.by((): MapPoint[] => {
    if (zi.obec) return ziObecPoints;
    if (!ziCtx || !ziUkaz) return [];
    const u = ziUkaz;
    return bodyPozadavku(ziCtx, u.id).map((b) => ({
      id: b.id,
      name: b.nazev,
      lon: b.lon,
      lat: b.lat,
      layerLabel: `${u.label}${b.obecNazev ? ` · ${b.obecNazev}` : ''}`,
      provider: b.provider,
      tone: 'phosphor',
      glyph: 'o',
      color: u.barva,
    }));
  });
  const ziVybrano = $derived(Object.keys(zi.pozadavky).length);
  function ziPreview(code: AreaCode): string[] {
    const s = ziSkore[code];
    if (s?.neobydlena) return ['Obec nemá stálé obyvatele, nehodnotíme ji.'];
    if (!ziVybrano) return ['Vyberte, na čem vám záleží.'];
    if (!s || s.score === null) return ['Skóre nelze spočítat, chybí údaje.'];
    return [
      `Skóre ${Math.round(s.score)}/100 · ${ziRank[code]}. z ${ziPoradi.length}`,
      ...silneStranky(s, 2).map((p) => `+ ${POZADAVKY_BY_ID[p.id]?.label}: ${kratkaHodnota(p.id, p.value)}`),
      'kliknutím otevřete detail obce',
    ];
  }
  function setZivot(patch: Partial<ZivotState>) {
    appState.update((s) => ({ ...s, zivot: { ...(s.zivot ?? DEFAULT_ZIVOT), ...patch } }));
  }
  /** detail obce otevřel uživatel (mapa, TOP 10) → fokus do detailu; z odkazu ne */
  let ziFokus = $state(false);
  function openZivotObec(code: AreaCode) {
    ziFokus = true;
    setZivot({ obec: code });
  }

  // --- režim „Karta obce“ ------------------------------------------------------
  const obKod = $derived(st.obec?.kod ?? null);
  const karta = $derived(
    snap && ziCtx && obKod && obecCentroidy[obKod]
      ? kartaObce({ snap, ctx: ziCtx, kod: obKod, orpNazev: ziOrp[obKod] ?? '', obory })
      : null,
  );
  function setObec(kod: AreaCode | null) {
    appState.update((s) => ({ ...s, obec: { kod } }));
  }

  // --- režim „Pro kraj“ --------------------------------------------------------
  const pk = $derived<ProKrajState>(st.prokraj ?? DEFAULT_PROKRAJ);
  function setProKraj(patch: Partial<ProKrajState>) {
    appState.update((s) => ({ ...s, prokraj: { ...(s.prokraj ?? DEFAULT_PROKRAJ), ...patch } }));
  }
  const pkIndexy = $derived(indexyOrp(detiPodleOrp(snap?.indicators.obec, geoIndex.obecParent)));

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
      showToast('Odkaz byl zkopírován. Otevře stránku přesně v podobě, v jaké ji nyní vidíte.');
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
      text: 'Za minutu vám ukážeme, co tu najdete: střední školy, místa na výlet a čísla o obcích. Vše pochází z otevřených dat kraje a státních úřadů.',
    },
    {
      cil: 'nav',
      nadpis: 'Tři části v jednom menu',
      text: 'Kam na střední: obory ve vašem okolí. Kam vyrazit: sjezdovky, koupání, hrady, rozhledny a další. Kde by se mi žilo: srovnání obcí podle toho, na čem vám záleží. Čísla o ORP a obcích najdete ve Statistice kraje vedle Zdrojů dat a v patičce.',
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
      text: 'Vyberte obec, odkud vyrážíte, a jak daleko chcete jet. Každá kategorie má vlastní filtry. U koupání například poslední výsledek kontroly kvality vody od hygieniků.',
    },
    {
      cil: 'mapa',
      nadpis: 'Interaktivní mapa',
      text: 'Kliknutím na obec nastavíte, odkud vyrážíte, kliknutím na značku otevřete detail místa. Na mobilu stačí klepnout.',
    },
    {
      cil: 'list',
      nadpis: 'Seznam a detail místa',
      text: 'Karty řadíme od nejbližší. V detailu najdete web, kontakt, cestu na Mapy.cz a další místa do 5 km.',
    },
    {
      cil: 'zivot-panel',
      pred: () => setMode('score'),
      nadpis: 'Kde by se mi dobře žilo?',
      text: 'Zaškrtněte, na čem vám záleží: zastávka, lékař, škola, bazén, klidná obec… U důležitých věcí zvolte „Velmi důležité“. Tlačítko „Ukázat na mapě“ zobrazí, kde ta místa jsou.',
    },
    {
      cil: 'zivot-mapa',
      nadpis: 'Obce seřazené podle vás',
      text: 'Čím tmavší obec, tím lépe splňuje vaše požadavky. Klikněte na obec a uvidíte, proč vyšla dobře nebo špatně.',
    },
    {
      cil: 'share',
      nadpis: 'Pošlete to dál',
      text: 'Vše, co nastavíte, se ukládá do adresy stránky. Tlačítko Sdílet zkopíruje odkaz, který otevře přesně stejný pohled.',
    },
    {
      cil: 'help',
      nadpis: 'Průvodce kdykoli znovu',
      text: 'Pokud si nebudete jisti, spusťte průvodce tímto tlačítkem. Teď vás vrátíme tam, kde jste začali.',
    },
  ];

  function setSkoly(patch: Partial<SkolyState>) {
    appState.update((s) => ({ ...s, skoly: { ...(s.skoly ?? DEFAULT_SKOLY), ...patch } }));
  }


  let drill = $state<ReturnType<typeof Drilldown> | null>(null);
  let sourcesOpen = $state(false);
  let sourcesTrigger: HTMLElement | null = null;

  function openSources() {
    sourcesTrigger = document.activeElement as HTMLElement | null;
    sourcesOpen = true;
  }
  function closeSources() {
    sourcesOpen = false;
    sourcesTrigger?.focus?.();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !snap || tourOpen) return;
    if (menuOpen) {
      menuOpen = false;
      return;
    }
    if (sourcesOpen) {
      closeSources();
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
    if (st.mode === 'score') {
      // nejdřív zavřít detail obce, pak skrýt body na mapě
      if (zi.obec) setZivot({ obec: null });
      else if (zi.ukaz) setZivot({ ukaz: null });
      return;
    }
    drill?.up();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="shell">
  <header class="topbar">
    <div class="wrap topbar__in">
      <a class="brandmark" href="#/kraj?m=domu" onclick={(e) => { e.preventDefault(); setMode('domu'); menuOpen = false; }} data-testid="brand-home">
        <span class="brandmark__bar" aria-hidden="true"></span>
        <span class="brandmark__txt">Otevřená data<br /><strong>Karlovarského kraje</strong></span>
      </a>
      <div class="tools">
        <button type="button" class="tool" onclick={share} data-tour="share" data-testid="share-btn" aria-label="Sdílet odkaz" title="Sdílet odkaz">
          <Ikona d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" size={18} />
          <span class="tool__t">Sdílet</span>
        </button>
        <button type="button" class="tool" onclick={openTour} data-tour="help" data-testid="tour-btn" aria-label="Průvodce aplikací" title="Průvodce aplikací">
          <Ikona d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" size={18} />
          <span class="tool__t">Průvodce</span>
        </button>
      </div>
      <button
        type="button"
        class="menubtn"
        aria-expanded={menuOpen}
        aria-controls="mainnav"
        onclick={() => (menuOpen = !menuOpen)}
        data-testid="menu-btn"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"
          ><path
            d={menuOpen ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'}
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          /></svg
        >
        <span>{menuOpen ? 'Zavřít' : 'Menu'}</span>
      </button>
      <nav class="mainnav" class:open={menuOpen} id="mainnav" aria-label="Hlavní navigace" data-tour="nav">
        <button
          type="button"
          class="mainnav__mob"
          class:on={st.mode === 'domu'}
          onclick={() => {
            setMode('domu');
            menuOpen = false;
          }}>Úvodní stránka</button
        >
        {#each MODE_NAV as n (n.m)}
          <button
            type="button"
            class:on={st.mode === n.m}
            aria-current={st.mode === n.m ? 'page' : undefined}
            onclick={() => {
              setMode(n.m);
              menuOpen = false;
            }}
            data-testid="mode-{n.m}">{n.label}</button
          >
        {/each}
        <button
          type="button"
          class="mainnav__src"
          class:on={st.mode === 'explore'}
          aria-current={st.mode === 'explore' ? 'page' : undefined}
          onclick={() => {
            setMode('explore');
            menuOpen = false;
          }}
          data-testid="mode-explore">Statistika kraje</button
        >
        {#each MODE_NAV_DALSI as n (n.m)}
          <button
            type="button"
            class="mainnav__src"
            class:on={st.mode === n.m}
            aria-current={st.mode === n.m ? 'page' : undefined}
            onclick={() => {
              setMode(n.m);
              menuOpen = false;
            }}
            data-testid="mode-{n.m}">{n.label}</button
          >
        {/each}
        <button
          type="button"
          class="mainnav__src"
          onclick={() => {
            menuOpen = false;
            openSources();
          }}
          data-testid="sources-btn">Zdroje dat</button
        >
        <button
          type="button"
          class="mainnav__src mainnav__mob"
          onclick={() => {
            menuOpen = false;
            share();
          }}>Sdílet odkaz na tuto stránku</button
        >
        <button
          type="button"
          class="mainnav__src mainnav__mob"
          onclick={() => {
            menuOpen = false;
            openTour();
          }}>Průvodce aplikací</button
        >
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
    <section class="hero" class:noprint={skolyTab === 'plan'}>
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
            <h2 id="start-h">Kde bydlíte?</h2>
            <label for="start-obec">Obec</label>
            <select id="start-obec" bind:value={startObec} data-testid="start-obec">
              <option value="">Vyberte obec</option>
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
            <button type="button" class="start__help" onclick={openTour}>Nevíte, jak začít? Spusťte průvodce</button>
          </form>
        {/if}
      </div>
    </section>

    <main class="wrap main">
      {#if !snap.skoly}
        <p class="state state--err" role="alert">Data o středních školách se nepodařilo načíst.</p>
      {:else}
        <div class="tabs noprint" role="tablist" aria-label="Pohled">
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
            aria-selected={skolyTab === 'plan'}
            class:on={skolyTab === 'plan'}
            onclick={() => (skolyTab = 'plan')}
            data-testid="tab-plan">Můj plán přihlášek{sk.plan.length ? ` (${sk.plan.length})` : ''}</button
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
            <div class="split__list">
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
            <StahnoutData
              nazev={`kam-na-stredni${domovNazev ? `-${domovNazev}` : ''}`}
              pocet={vysledky.length}
              radky={() =>
                vysledky.map((r) => ({
                  skola: r.obor.skola,
                  obec: r.obor.obec,
                  obor: r.obor.nazevOboru,
                  kod_oboru: r.obor.kodOboru,
                  typ: r.obor.typ,
                  delka: r.obor.delka,
                  forma: r.obor.forma,
                  mist_2026_27: r.obor.zamer[2026],
                  mist_2025_26: r.obor.zamer[2025],
                  prijato_2025: r.obor.prijato2025,
                  obsazenost_2025_pct: r.naplnenost === null ? null : Math.round(r.naplnenost * 100),
                  vzdalenost_km: r.km === null ? null : Math.round(r.km * 10) / 10,
                  zastavky_do_500m: r.obor.zastavky500m,
                  web: r.obor.web,
                }))}
              zdroje={snap.manifest.sources
                .filter((x) => x.id.startsWith('dz-prijimani'))
                .map((x) => ({ title: `záměr přijímání ${x.validFor}`, url: x.url }))}
            />
            {#if snap.skoly?.poradny?.length}
              <Poradny poradny={snap.skoly.poradny} {domov} {domovNazev} />
            {/if}
            </div>
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
        {:else if skolyTab === 'plan'}
          <Planovac
            plan={planObory}
            {obory}
            {domov}
            {domovNazev}
            maxKm={sk.maxKm}
            poradny={snap.skoly?.poradny ?? []}
            onchange={(plan) => setSkoly({ plan })}
            onselect={(izo) => setSkoly({ skola: izo })}
          />
        {:else}
          <KrajPrehled obory={obory} names={geoIndex.names} onselect={(izo) => setSkoly({ skola: izo })} />
        {/if}

        {#if vybraneObory.length}
          {#key sk.skola}
            <SkolaDetail
              obory={vybraneObory}
              km={vybranaKm}
              sources={skolySources}
              onclose={() => setSkoly({ skola: null })}
              plan={sk.plan}
              onplan={togglePlan}
            />
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
              Barva značky označuje kategorii. Kliknutím na značku otevřete detail, kliknutím na obec zvolíte, odkud vyrážíte.
            </p>
            <Map
              features={obecFeatures}
              values={vyDosah}
              def={VY_DOSAH_DEF}
              year={null}
              selected={vy.domov}
              preview={vyPreview}
              points={vyPoints}
              selectedPoint={vyHover ?? vy.misto}
              onselect={(code) => setVylety({ domov: code })}
              onpointselect={openMisto}
              circle={vyDomov ? { ...vyDomov, km: vy.maxKm, label: vyDomovNazev } : null}
              jednobarevna
              priblizitNaKruh
              label="Mapa míst pro volný čas v Karlovarském kraji"
              hint="Najeďte na značku nebo obec. Kliknutím na značku otevřete detail místa."
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
          <div class="split__list">
          <MistaList
            vysledky={vyVysledky}
            vybrane={vy.misto}
            maDomov={!!vyDomov}
            razeni={vy.razeni}
            onrazeni={(r) => setVylety({ razeni: r })}
            onselect={openMisto}
            onhover={(id) => (vyHover = id)}
          />
          <StahnoutData
            nazev={`kam-vyrazit-${vyDef.label}${vyDomovNazev ? `-${vyDomovNazev}` : ''}`}
            pocet={vyVysledky.length}
            radky={() =>
              vyVysledky.map((r) => ({
                nazev: r.misto.nazev,
                obec: r.misto.obecNazev,
                adresa: r.misto.adresa,
                stitky: r.misto.tagy.join(', '),
                vstupne: r.misto.vstupne === null ? '' : r.misto.vstupne ? 'placené' : 'zdarma',
                vzdalenost_km: r.km === null ? null : Math.round(r.km * 10) / 10,
                web: r.misto.web,
                telefon: r.misto.tel,
                email: r.misto.email,
                zemepisna_sirka: r.misto.lat,
                zemepisna_delka: r.misto.lon,
              }))}
            zdroje={[...new Set(vyVysledky.map((r) => r.misto.sourceId))]
              .map((id) => snap?.manifest.sources.find((x) => x.id === id))
              .filter((x) => !!x)
              .map((x) => ({ title: x!.title.replace(/ v Karlovarském kraji/, ''), url: x!.url }))}
          />
          </div>
          <section class="mapcard" aria-label="Mapa" data-tour="mapa">
            <h2>Kde to je</h2>
            <p class="mapcard__hint">
              {#if vyDomov}Na mapě jsou jen místa do {vy.maxKm} km od obce {vyDomovNazev}.{:else}Kliknutím na obec zvolíte, odkud
                vyrážíte – mapa pak ukáže jen místa v dosahu.{/if} Kliknutím na značku otevřete detail.
            </p>
            <Map
              features={obecFeatures}
              values={vyDosah}
              def={VY_DOSAH_DEF}
              year={null}
              selected={vy.domov}
              preview={vyPreview}
              points={vyPoints}
              selectedPoint={vyHover ?? vy.misto}
              onselect={(code) => setVylety({ domov: code })}
              onpointselect={openMisto}
              circle={vyDomov ? { ...vyDomov, km: vy.maxKm, label: vyDomovNazev } : null}
              jednobarevna
              priblizitNaKruh
              label="Mapa: {vyDef.label} v Karlovarském kraji"
              hint="Najeďte na obec a uvidíte, kolik míst je odtud v dosahu. Kliknutím na značku otevřete detail."
            />
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
  {:else if st.mode === 'domu'}
    <Domu
      dlazdice={domuDlazdice}
      obce={obecNames}
      obec={domuObec}
      souhrn={domuSouhrn}
      onobec={setDomuObec}
      onmode={setMode}
    />
  {:else if st.mode === 'prokraj'}
    {#if ziCtx}
      <ProKraj
        stav={pk}
        ctx={ziCtx}
        obce={obecFeatures}
        {obory}
        indexy={pkIndexy}
        names={geoIndex.names}
        onchange={setProKraj}
      />
    {/if}
  {:else if st.mode === 'obec'}
    <KartaObce {karta} obce={obecNames} aktualizace={snap.updatedAt} onobec={setObec} />
  {:else if st.mode === 'nalezy'}
    <Nalezy
      automaticke={[
        { sada: 'Úřady', chyby: snap.urady?.chybyDat ?? [] },
        { sada: 'Projekty kraje', chyby: snap.penize?.chybyDat ?? [] },
        { sada: 'Podnikání', chyby: snap.podnikani?.chybyDat ?? [] },
      ]}
      sources={snap.manifest.sources}
      onzdroje={openSources}
    />
  {:else if st.mode === 'podnikani'}
    {#if snap.podnikani}
      <Podnikani data={snap.podnikani} stav={pod} onchange={setPodnikani} />
    {:else}
      <div class="wrap"><p class="state state--err" role="alert">Data o podnikání se nepodařilo načíst.</p></div>
    {/if}
  {:else if st.mode === 'penize'}
    {#if snap.penize}
      <Penize
        data={snap.penize}
        vouchery={penizeVouchery}
        names={geoIndex.names}
        stav={pe}
        dnes={dnesIso}
        onchange={setPenize}
      />
    {:else}
      <div class="wrap"><p class="state state--err" role="alert">Data o penězích kraje se nepodařilo načíst.</p></div>
    {/if}
  {:else if st.mode === 'urady'}
    {#if snap.urady}
      <Urady data={snap.urady} stav={ur} stredy={obecCentroidy} onchange={setUrady} />
    {:else}
      <div class="wrap"><p class="state state--err" role="alert">Data o úřadech se nepodařilo načíst.</p></div>
    {/if}
  {:else if st.mode === 'score'}
    <section class="hero hero--slim">
      <div class="wrap">
        <p class="kicker">Bydlení · Karlovarský kraj</p>
        <h1>Kde by se mi dobře žilo?</h1>
        <p class="perex">
          Vyberte, na čem vám záleží. Mapa obarví všech {obecFeatures.length} obcí kraje podle toho, jak vašim požadavkům
          vyhovují. U každé obce vysvětlíme proč.
        </p>
      </div>
    </section>
    <main class="wrap main zivot">
      <div class="zivot__panel">
        <ZivotPanel
          pozadavky={zi.pozadavky}
          ukaz={zi.ukaz}
          pocetBodu={ziPocetBodu}
          onchange={(p) => setZivot({ pozadavky: p })}
          onukaz={(id) => setZivot({ ukaz: id })}
          ondoporuceny={() => setZivot({ pozadavky: { ...DOPORUCENY_VYBER } })}
        />
      </div>
      <section class="mapcard zivot__map" aria-label="Mapa obcí podle skóre" data-tour="zivot-mapa" data-testid="zivot-mapa">
        <h2>
          {#if ziPoradi.length}
            Nejlépe vychází {obecNames[ziPoradi[0].code] ?? ''} ({Math.round(ziPoradi[0].score)}/100)
          {:else}
            Vyberte, na čem vám záleží
          {/if}
        </h2>
        <p class="mapcard__hint">
          Tmavší obec = lépe splňuje váš výběr ({ziVybrano}&nbsp;{plural(ziVybrano, ['požadavek', 'požadavky', 'požadavků'])}).
          Klikněte na obec a uvidíte proč.
        </p>
        <div class="zivot__mapa">
        {#if zi.obec}
          <div class="zivot__zoom">
            {#if ziPriblizeno}
              <button type="button" onclick={() => (ziPriblizeno = false)} data-testid="zivot-cely-kraj">Celý kraj</button>
            {:else}
              <button type="button" onclick={() => (ziPriblizeno = true)} data-testid="zivot-priblizit">
                Přiblížit {obecNames[zi.obec] ?? 'obec'}
              </button>
            {/if}
          </div>
        {/if}
        <Map
          features={ziObecSama ? [ziObecSama] : obecFeatures}
          fitPad={ziObecSama ? 24 : 8}
          values={ziValues}
          def={ZIVOT_DEF}
          year={null}
          selected={zi.obec}
          preview={ziPreview}
          points={ziPoints}
          onselect={openZivotObec}
          onpointselect={zi.obec ? (id) => (ziBod = id) : undefined}
          selectedPoint={ziBod}
          label="Mapa obcí Karlovarského kraje podle skóre bydlení"
          hint={zi.obec
            ? 'Najeďte na značku a uvidíte, co to je. Kliknutím ji zobrazíte v detailu obce.'
            : 'Najeďte na obec a uvidíte skóre a silné stránky. Kliknutím nebo klávesou Enter otevřete detail.'}
        />
        </div>
        {#if zi.obec}
          <ZivotVrstvy
            vrstvy={ziVrstvy}
            skryte={ziSkryte}
            obecNazev={obecNames[zi.obec] ?? ''}
            ontoggle={ziToggleVrstva}
          />
        {/if}
        <Legend values={obecFeatures.map((f) => ziValues[f.properties.code] ?? null)} def={ZIVOT_DEF} year={null} />
        {#if ziUkaz}
          <p class="zivot__ukaz" data-testid="zivot-ukaz">
            <span class="dot" style="background: {ziUkaz.barva ?? 'var(--brand)'}" aria-hidden="true"></span>
            <span>Na mapě: {ziUkaz.label} ({ziPoints.length})</span>
            <button type="button" onclick={() => setZivot({ ukaz: null })}>Skrýt</button>
          </p>
        {/if}
      </section>
      <div class="zivot__side">
        <p class="sr-only" aria-live="polite">{zi.obec ? `Detail obce ${obecNames[zi.obec] ?? ''}` : ''}</p>
        {#if zi.obec && ziCtx}
          <ZivotDetail
            ctx={ziCtx}
            code={zi.obec}
            name={obecNames[zi.obec] ?? zi.obec}
            orpName={ziOrp[zi.obec] ?? ''}
            skore={ziSkore[zi.obec]}
            rank={ziRank[zi.obec] ?? null}
            celkem={ziPoradi.length}
            vsech={obecFeatures.length}
            fokus={ziFokus}
            pozadavky={Object.keys(zi.pozadavky)}
            vybranyBod={ziVybranyBod}
            onobec={openZivotObec}
            onclose={() => {
              ziFokus = false;
              setZivot({ obec: null });
            }}
          />
        {/if}
        <ZivotTop
          poradi={ziPoradi}
          names={obecNames}
          orp={ziOrp}
          selected={zi.obec}
          onselect={openZivotObec}
        />
      </div>
    </main>
  {:else}
    <section class="hero hero--slim">
      <div class="wrap">
        <p class="kicker">Statistika · Karlovarský kraj</p>
        <h1>Statistika kraje</h1>
        <p class="perex">
          Data Českého statistického úřadu za správní obvody (ORP) a obce kraje a jejich vývoj v čase. Vyberte ukazatel a rok, klikněte na ORP a dál na obce. Srovnáváme vždy s Českem.
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
      <p>
        Čísla o ORP a obcích v čase:
        <button type="button" class="linklike" onclick={() => setMode('explore')} data-testid="footer-explore">Statistika kraje</button>.
        Chyby a mezery v datech kraje:
        <button type="button" class="linklike" onclick={() => setMode('nalezy')} data-testid="footer-nalezy">Co jsme našli v datech</button>.
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
    gap: 8px 16px;
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
    font-size: 0.93rem;
    font-weight: 500;
    min-height: 44px;
    padding: 0 8px;
    white-space: nowrap;
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
  /* na středních šířkách jen ikony, ať se lišta vejde na jeden řádek */
  @media (max-width: 1599px) {
    .tool__t {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .tools .tool {
      padding: 0 10px;
    }
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
  /* „Kde by se mi dobře žilo?“: požadavky | mapa | detail + TOP 10 */
  .zivot {
    display: grid;
    grid-template-columns: minmax(0, 320px) minmax(0, 1fr) minmax(0, 330px);
    grid-template-areas: 'panel map side';
    gap: 24px;
    align-items: start;
  }
  .zivot__panel {
    grid-area: panel;
    min-width: 0;
  }
  .zivot__map {
    grid-area: map;
  }
  .zivot__side {
    grid-area: side;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .zivot__mapa {
    position: relative;
  }
  .zivot__zoom {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 3;
  }
  .zivot__zoom button {
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--bg-panel);
    color: var(--brand);
    font: 500 0.9rem/1 var(--font-display);
    box-shadow: var(--shadow);
    cursor: pointer;
  }
  .zivot__zoom button:hover {
    border-color: var(--brand);
  }
  .zivot__zoom button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .zivot__ukaz {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 10px 0 0;
    font-size: 0.9rem;
    color: var(--brand-dark);
  }
  .zivot__ukaz .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .zivot__ukaz button {
    font: inherit;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: var(--bg-panel);
    color: var(--brand);
    cursor: pointer;
  }
  .zivot__ukaz button:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  @media (max-width: 1240px) {
    .zivot {
      grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
      grid-template-areas:
        'panel map'
        'panel side';
    }
    /* mapa by se při posunu přesouvala přes pravý sloupec pod ní */
    .zivot .zivot__map {
      position: static;
    }
  }
  @media (max-width: 1000px) {
    .zivot {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'map'
        'side'
        'panel';
    }
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
  /* rychlý start „Kde bydlíte?“ – nejkratší cesta k výsledkům */
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
  .split__list {
    min-width: 0;
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
  @media (min-width: 1001px) and (max-width: 1100px) {
    .topbar__in {
      padding-top: 8px;
      padding-bottom: 4px;
    }
    .mainnav {
      order: 4;
      width: 100%;
    }
  }
  .menubtn,
  .mainnav .mainnav__mob {
    display: none;
  }
  /* do 1000 px: menu schované za tlačítkem, po rozbalení svislý seznam */
  @media (max-width: 1000px) {
    .topbar__in {
      flex-wrap: wrap;
      min-height: 64px;
    }
    .menubtn {
      order: 4;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font: inherit;
      font-weight: 500;
      min-height: 44px;
      padding: 0 14px;
      border: 1px solid var(--brand);
      border-radius: 999px;
      background: #fff;
      color: var(--brand);
      cursor: pointer;
    }
    .menubtn[aria-expanded='true'] {
      background: var(--brand);
      color: #fff;
    }
    /* Sdílet a Průvodce jsou na mobilu v menu (s textem) */
    .tools {
      display: none;
    }
    .menubtn {
      margin-left: auto;
    }
    .mainnav .mainnav__mob {
      display: block;
      color: var(--brand);
    }
    .mainnav {
      display: none;
      order: 5;
      width: 100%;
      flex-direction: column;
      gap: 0;
      padding: 6px 0 10px;
      border-top: 1px solid var(--line);
    }
    .mainnav.open {
      display: flex;
    }
    .mainnav button,
    .mainnav .mainnav__src {
      text-align: left;
      min-height: 48px;
      padding: 0 12px;
      font-size: 1.05rem;
      border-bottom: 1px solid var(--line);
      border-left: 4px solid transparent;
    }
    .mainnav button.on {
      border-bottom-color: var(--line);
      border-left-color: var(--brand);
      background: var(--brand-ice);
    }
    .mainnav .mainnav__src {
      font-size: 0.95rem;
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
