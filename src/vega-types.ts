/**
 * Vega-Lite Response Schema
 * 
 * Scripts output a single Vega-Lite specification.
 * Use vconcat/hconcat for multiple views, text marks for labels/metrics.
 */

export interface VegaLiteSpec {
  $schema?: string;
  title?: string | { text: string; subtitle?: string };
  description?: string;
  width?: number | "container";
  height?: number | "container";
  data?: any;
  mark?: any;
  encoding?: any;
  layer?: any[];
  vconcat?: any[];
  hconcat?: any[];
  concat?: any[];
  config?: any;
  [key: string]: any;
}
