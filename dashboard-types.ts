// Dashboard response schema for Shelley to follow

export interface DashboardResponse {
  summary: string;           // Brief text summary of the answer
  blocks: DashboardBlock[];  // Array of visualization blocks
  metadata?: {
    queriedAt: string;
    dataRange?: {
      start: string;
      end: string;
    };
    sensors?: string[];
  };
}

export type DashboardBlock = 
  | TextBlock 
  | MetricBlock 
  | ChartBlock;

export interface TextBlock {
  type: 'text';
  title?: string;
  content: string;           // Markdown supported
  variant?: 'info' | 'warning' | 'success' | 'error';
}

export interface MetricBlock {
  type: 'metric';
  title: string;
  value: number;
  unit: string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage?: number;
    period?: string;          // e.g., "vs 1h ago"
  };
  status?: 'good' | 'warning' | 'critical';
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

export interface ChartBlock {
  type: 'chart';
  title: string;
  chartType: 'line' | 'bar' | 'area';
  xAxis: {
    label: string;
    type: 'time' | 'category' | 'number';
  };
  yAxis: {
    label: string;
    unit?: string;
    min?: number;
    max?: number;
  };
  series: ChartSeries[];
  annotations?: ChartAnnotation[];
}

export interface ChartSeries {
  name: string;
  color?: string;
  data: Array<{
    x: string | number;      // timestamp or category
    y: number;
  }>;
}

export interface ChartAnnotation {
  type: 'threshold' | 'range' | 'point';
  value?: number;            // for threshold
  yMin?: number;             // for range
  yMax?: number;
  label: string;
  color?: string;
}

// Example response for documentation:
export const EXAMPLE_RESPONSE: DashboardResponse = {
  summary: "CO₂ levels have been elevated over the past hour, averaging 1050 ppm.",
  blocks: [
    {
      type: 'metric',
      title: 'Current CO₂',
      value: 1120,
      unit: 'ppm',
      status: 'warning',
      trend: {
        direction: 'up',
        percentage: 8,
        period: 'vs 1h ago'
      }
    },
    {
      type: 'chart',
      title: 'CO₂ Levels - Last Hour',
      chartType: 'line',
      xAxis: { label: 'Time', type: 'time' },
      yAxis: { label: 'CO₂', unit: 'ppm', min: 400, max: 1500 },
      series: [{
        name: 'CO₂',
        color: '#3b82f6',
        data: [
          { x: '2025-11-15T20:00:00Z', y: 1020 },
          { x: '2025-11-15T20:30:00Z', y: 1080 },
          { x: '2025-11-15T21:00:00Z', y: 1120 }
        ]
      }],
      annotations: [
        { type: 'threshold', value: 1000, label: 'Good limit', color: '#f59e0b' }
      ]
    },
    {
      type: 'text',
      title: 'Recommendation',
      content: 'Consider increasing ventilation to reduce CO₂ levels.',
      variant: 'warning'
    }
  ]
};
