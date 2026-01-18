/**
 * Vega-Lite Response Schema
 * 
 * Scripts output JSON matching this schema, which contains Vega-Lite specs
 * that the frontend renders directly.
 */

export interface VegaLiteResponse {
  /** Brief summary of the analysis */
  summary: string;
  
  /** Array of visualization blocks */
  blocks: VegaBlock[];
}

export interface VegaBlock {
  /** Block type - currently only vega-lite supported */
  type: 'vega-lite' | 'text' | 'metric';
  
  /** Title for the block */
  title?: string;
  
  /** For vega-lite blocks: the full Vega-Lite specification */
  spec?: any;
  
  /** For text blocks: markdown content */
  content?: string;
  
  /** For text blocks: variant styling */
  variant?: 'info' | 'warning' | 'success' | 'error';
  
  /** For metric blocks */
  value?: number;
  unit?: string;
  status?: 'good' | 'warning' | 'critical';
}

// Example Vega-Lite spec for reference
export const exampleVegaLiteSpec = {
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "width": "container",
  "height": 300,
  "data": {
    "values": [
      {"time": "2024-01-01T00:00:00Z", "value": 450},
      {"time": "2024-01-01T01:00:00Z", "value": 480}
    ]
  },
  "mark": {"type": "line", "strokeWidth": 2},
  "encoding": {
    "x": {"field": "time", "type": "temporal", "title": "Time"},
    "y": {"field": "value", "type": "quantitative", "title": "CO₂ (ppm)"}
  }
};
