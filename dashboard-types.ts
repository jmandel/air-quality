/**
 * Dashboard Response Schema
 * 
 * This schema defines the structure for dashboard responses from Shelley's analysis scripts.
 * All scripts must output JSON matching this schema to stdout.
 */

export interface DashboardResponse {
  /** Brief summary of the analysis (displayed at top of dashboard) */
  summary: string;
  
  /** Array of dashboard tiles/blocks to display */
  blocks: Array<TextBlock | MetricBlock | ChartBlock>;
}

/**
 * TEXT BLOCK
 * Displays formatted text content with optional title and color variant
 */
export interface TextBlock {
  type: "text";
  
  /** Optional title/heading for the text block */
  title?: string;
  
  /** Main text content (supports markdown) */
  content: string;
  
  /** Visual variant for color coding */
  variant?: "info" | "warning" | "success" | "error";
}

/**
 * METRIC BLOCK
 * Displays a large numeric value with unit, status indicator, and optional trend
 */
export interface MetricBlock {
  type: "metric";
  
  /** Title describing the metric */
  title: string;
  
  /** Numeric value to display */
  value: number;
  
  /** Unit of measurement (e.g., "ppm", "µg/m³", "°C") */
  unit: string;
  
  /** Status level (affects background color) */
  status?: "good" | "warning" | "critical";
  
  /** Optional trend information */
  trend?: {
    /** Direction of change */
    direction: "up" | "down" | "stable";
    
    /** Percentage change (e.g., 15 for +15%) */
    percentage?: number;
    
    /** Time period for comparison (e.g., "vs last hour") */
    period?: string;
  };
}

/**
 * CHART BLOCK
 * Displays a bold line/bar/area chart with one or more data series
 */
export interface ChartBlock {
  type: "chart";
  
  /** Chart title */
  title: string;
  
  /** Type of chart visualization */
  chartType: "line" | "bar" | "area";
  
  /** X-axis configuration */
  xAxis: {
    /** Axis label */
    label: string;
    
    /** Data type (affects formatting) */
    type: "time" | "category";
  };
  
  /** Y-axis configuration */
  yAxis: {
    /** Axis label */
    label: string;
    
    /** Optional unit to display */
    unit?: string;
    
    /** Optional min value for Y-axis */
    min?: number;
    
    /** Optional max value for Y-axis */
    max?: number;
  };
  
  /** One or more data series to plot */
  series: Array<{
    /** Series name (for legend) */
    name: string;
    
    /** Line color (hex code) */
    color?: string;
    
    /** Array of data points */
    data: Array<{
      /** X-axis value (timestamp string for time, category name for category) */
      x: string | number;
      
      /** Y-axis numeric value */
      y: number;
    }>;
  }>;
  
  /** Optional threshold lines/annotations */
  annotations?: Array<{
    type: "threshold";
    
    /** Y-axis value for the line */
    value: number;
    
    /** Label text */
    label: string;
    
    /** Line color (hex code) */
    color?: string;
  }>;
}

// EXAMPLES

export const exampleTextBlock: TextBlock = {
  type: "text",
  title: "Air Quality Status",
  content: "The air quality is **good** right now. All sensors are reporting normal values.",
  variant: "success"
};

export const exampleMetricBlock: MetricBlock = {
  type: "metric",
  title: "Current CO₂",
  value: 450,
  unit: "ppm",
  status: "good",
  trend: {
    direction: "down",
    percentage: 5.2,
    period: "vs 1h ago"
  }
};

export const exampleChartBlock: ChartBlock = {
  type: "chart",
  title: "CO₂ Levels - Last Hour",
  chartType: "line",
  xAxis: {
    label: "Time",
    type: "time"
  },
  yAxis: {
    label: "Concentration",
    unit: "ppm",
    min: 0
  },
  series: [{
    name: "CO₂",
    color: "#3b82f6",
    data: [
      { x: "2025-11-15T20:00:00Z", y: 420 },
      { x: "2025-11-15T20:15:00Z", y: 435 },
      { x: "2025-11-15T20:30:00Z", y: 445 },
      { x: "2025-11-15T20:45:00Z", y: 450 }
    ]
  }],
  annotations: [{
    type: "threshold",
    value: 800,
    label: "Warning threshold",
    color: "#f59e0b"
  }]
};
