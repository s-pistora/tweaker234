import type { IndicatorFile, PointLayer, SourceEntry } from '../../src/lib/types.ts';

export interface GeoOutput {
  /** název souboru v public/data/geo/, např. 'kraje.topo.json' */
  file: string;
  /** TopoJSON s objektem `areas` (vlastnosti AreaProps) */
  topology: unknown;
}

export interface SourceResult {
  source: SourceEntry;
  indicators?: IndicatorFile[];
  points?: PointLayer[];
  geo?: GeoOutput[];
}

export interface SourceContext {
  /** adresář pro surová stažená data (data-raw/<id>/) */
  rawDir: string;
  now: Date;
}

export interface SourceAdapter {
  id: string;
  run(ctx: SourceContext): Promise<SourceResult>;
}
