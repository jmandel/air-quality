# Dashboard Response Schema

## Overview

The `/api/ask` endpoint can return structured dashboard responses that the web UI renders as interactive visualizations. Shelley is instructed to write responses following this TypeScript interface.

## DashboardResponse Interface

```typescript
interface DashboardResponse {
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
```

## Block Types

### TextBlock
Plain text content with optional styling.

```typescript
interface TextBlock {
  type: 'text';
  title?: string;
  content: string;           // Markdown supported
  variant?: 'info' | 'warning' | 'success' | 'error';
}
```

**Example:**
```json
{
  "type": "text",
  "title": "Recommendation",
  "content": "Consider increasing ventilation to reduce CO₂ levels.",
  "variant": "warning"
}
```

### MetricBlock
Big number display with trend indicators.

```typescript
interface MetricBlock {
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
```

**Example:**
```json
{
  "type": "metric",
  "title": "Current CO₂",
  "value": 1120,
  "unit": "ppm",
  "status": "warning",
  "trend": {
    "direction": "up",
    "percentage": 8,
    "period": "vs 1h ago"
  }
}
```

### ChartBlock
Time series or categorical charts with annotations.

```typescript
interface ChartBlock {
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

interface ChartSeries {
  name: string;
  color?: string;
  data: Array<{
    x: string | number;      // timestamp or category
    y: number;
  }>;
}

interface ChartAnnotation {
  type: 'threshold' | 'range' | 'point';
  value?: number;            // for threshold
  yMin?: number;             // for range
  yMax?: number;
  label: string;
  color?: string;
}
```

**Example:**
```json
{
  "type": "chart",
  "title": "CO₂ Levels - Last Hour",
  "chartType": "line",
  "xAxis": { "label": "Time", "type": "time" },
  "yAxis": { "label": "CO₂", "unit": "ppm", "min": 400, "max": 1500 },
  "series": [{
    "name": "CO₂",
    "color": "#3b82f6",
    "data": [
      { "x": "2025-11-15T20:00:00Z", "y": 1020 },
      { "x": "2025-11-15T20:30:00Z", "y": 1080 },
      { "x": "2025-11-15T21:00:00Z", "y": 1120 }
    ]
  }],
  "annotations": [
    { "type": "threshold", "value": 1000, "label": "Good limit", "color": "#f59e0b" }
  ]
}
```

## Complete Example Response

```json
{
  "summary": "CO₂ levels have been elevated over the past hour, averaging 1050 ppm.",
  "blocks": [
    {
      "type": "metric",
      "title": "Current CO₂",
      "value": 1120,
      "unit": "ppm",
      "status": "warning",
      "trend": {
        "direction": "up",
        "percentage": 8,
        "period": "vs 1h ago"
      }
    },
    {
      "type": "chart",
      "title": "CO₂ Levels - Last Hour",
      "chartType": "line",
      "xAxis": { "label": "Time", "type": "time" },
      "yAxis": { "label": "CO₂", "unit": "ppm", "min": 400, "max": 1500 },
      "series": [{
        "name": "CO₂",
        "color": "#3b82f6",
        "data": [
          { "x": "2025-11-15T20:00:00Z", "y": 1020 },
          { "x": "2025-11-15T20:30:00Z", "y": 1080 },
          { "x": "2025-11-15T21:00:00Z", "y": 1120 }
        ]
      }],
      "annotations": [
        { "type": "threshold", "value": 1000, "label": "Good limit", "color": "#f59e0b" }
      ]
    },
    {
      "type": "text",
      "title": "Recommendation",
      "content": "Consider increasing ventilation to reduce CO₂ levels.",
      "variant": "warning"
    }
  ],
  "metadata": {
    "queriedAt": "2025-11-15T21:00:00Z",
    "dataRange": {
      "start": "2025-11-15T20:00:00Z",
      "end": "2025-11-15T21:00:00Z"
    },
    "sensors": ["co2_ppm"]
  }
}
```

## Shelley Instructions

When Shelley processes a query, it receives these instructions:

1. **Temp Directory**: A temp directory path where it can write files
2. **Response File**: Must write `response.json` with the DashboardResponse schema
3. **Database Access**: Path to SQLite database with air quality data
4. **Schema Documentation**: Complete TypeScript interface definitions
5. **Example Response**: A working example to follow

The prompt includes:
- Database schema information
- Sensor list with names and units
- Instructions to query actual data (not placeholders)
- Timestamp format requirements (ISO 8601)
- Status thresholds (good/warning/critical)

## UI Rendering

The `/ask.html` page renders the response:

### Metric Cards
- Large numeric value with unit
- Color-coded status (green/yellow/red)
- Trend arrows (↑↓→) with percentage
- Grid layout, responsive

### Charts
- Chart.js powered visualizations
- Time series support with date formatting
- Multiple series with custom colors
- Threshold annotations as dashed lines
- Hover tooltips with values
- Full-width display

### Text Blocks
- Color-coded left border by variant
- Full-width display
- Supports longer explanations

## Status Thresholds

Recommended thresholds for air quality sensors:

| Sensor | Good | Warning | Critical |
|--------|------|---------|----------|
| CO₂ | < 800 ppm | 800-1000 ppm | > 1000 ppm |
| PM2.5 | < 12 µg/m³ | 12-35 µg/m³ | > 35 µg/m³ |
| VOC Index | < 100 | 100-250 | > 250 |
| Temperature | 20-24°C | 24-28°C or < 18°C | > 28°C or < 18°C |

## Colors

Standard color palette:

- **Good/Success**: `#22c55e` (green)
- **Warning**: `#f59e0b` (amber)
- **Critical/Error**: `#ef4444` (red)
- **Info/Accent**: `#3b82f6` (blue)
- **Neutral**: `#94a3b8` (gray)

## Future Enhancements

- Table blocks for tabular data
- Heatmap blocks for temporal patterns
- Gauge/radial charts for single metrics
- Comparison blocks (before/after, target vs actual)
- Alert/notification blocks with actions
- Export capabilities (PDF, PNG, CSV)
