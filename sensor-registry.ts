// Sensor Metadata Registry
// Based on Apollo AIR-1 Air Quality Sensor Analysis Report

export interface ThresholdZone {
  min: number;
  max: number;
  label: string;
  color: 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'blue';
  description?: string;
}

export interface ThresholdLine {
  value: number;
  label: string;
  color: string;
  lineStyle?: 'solid' | 'dashed';
}

export interface SensorMetadata {
  // Display
  displayName: string;
  unit: string;
  unitSymbol?: string; // e.g., "µg/m³", "°C"
  decimalPlaces: number;

  // Chart configuration
  yAxis: {
    min: number;
    max: number;
    suggestedMin?: number; // For low-variance sensors
    suggestedMax?: number;
  };

  // Health thresholds
  zones: ThresholdZone[];
  thresholdLines?: ThresholdLine[];

  // Time preferences
  defaultTimeWindow: number; // hours
  category: 'fast' | 'moderate' | 'slow' | 'leak-detection';

  // Priority
  healthPriority: 'primary' | 'secondary' | 'safety' | 'support';

  // Optional metadata
  description?: string;
  standards?: string[]; // e.g., ["EPA", "WHO", "ASHRAE"]
  defaultVisible?: boolean;
}

export const SENSOR_REGISTRY: Record<string, SensorMetadata> = {
  'co2_ppm': {
    displayName: 'CO₂',
    defaultVisible: true,
    unit: 'ppm',
    decimalPlaces: 0,
    yAxis: { min: 0, max: 2000 },
    defaultTimeWindow: 6,
    category: 'fast',
    healthPriority: 'primary',
    description: 'Carbon dioxide - primary ventilation indicator',
    zones: [
      { min: 0, max: 400, label: 'Excellent', color: 'green', description: 'Outdoor baseline' },
      { min: 400, max: 800, label: 'Good', color: 'green', description: 'Optimal indoor' },
      { min: 800, max: 1000, label: 'Acceptable', color: 'yellow', description: 'Minor ventilation improvement' },
      { min: 1000, max: 1400, label: 'Moderate', color: 'orange', description: 'Increase ventilation' },
      { min: 1400, max: 2000, label: 'Poor', color: 'red', description: 'Ventilation required' },
      { min: 2000, max: Infinity, label: 'Very Poor', color: 'purple', description: 'Immediate action' },
    ],
    thresholdLines: [
      { value: 800, label: '800 ppm (Good limit)', color: '#fbbf24' },
      { value: 1000, label: '1000 ppm (Acceptable limit)', color: '#f97316' },
      { value: 1400, label: '1400 ppm (Poor)', color: '#dc2626' },
    ],
    standards: ['ASHRAE', 'EPA'],
  },

  'pm2_5_ug_m3': {
    displayName: 'PM2.5',
    defaultVisible: true,
    unit: 'µg/m³',
    decimalPlaces: 1,
    yAxis: { min: 0, max: 50, suggestedMax: 25 },
    defaultTimeWindow: 24,
    category: 'moderate',
    healthPriority: 'primary',
    description: 'Particulate matter 2.5 micrometers - respiratory health indicator',
    zones: [
      { min: 0, max: 5, label: 'Excellent', color: 'green', description: 'WHO annual guideline' },
      { min: 5, max: 12, label: 'Good', color: 'green', description: 'EPA Good' },
      { min: 12, max: 35, label: 'Moderate', color: 'yellow', description: 'EPA acceptable' },
      { min: 35, max: 55, label: 'Unhealthy (Sensitive)', color: 'orange' },
      { min: 55, max: 150, label: 'Unhealthy', color: 'red' },
      { min: 150, max: Infinity, label: 'Very Unhealthy', color: 'purple' },
    ],
    thresholdLines: [
      { value: 5, label: 'WHO guideline', color: '#10b981' },
      { value: 12, label: 'EPA Good limit', color: '#fbbf24' },
      { value: 35, label: 'EPA 24h standard', color: '#f97316' },
    ],
    standards: ['WHO', 'EPA'],
  },

  'pm1_ug_m3': {
    displayName: 'PM1.0',
    unit: 'µg/m³',
    decimalPlaces: 1,
    yAxis: { min: 0, max: 25, suggestedMax: 15 },
    defaultTimeWindow: 24,
    category: 'moderate',
    healthPriority: 'secondary',
    description: 'Particulate matter 1.0 micrometers',
    zones: [
      { min: 0, max: 5, label: 'Excellent', color: 'green' },
      { min: 5, max: 10, label: 'Good', color: 'green' },
      { min: 10, max: 20, label: 'Moderate', color: 'yellow' },
      { min: 20, max: Infinity, label: 'Poor', color: 'orange' },
    ],
    thresholdLines: [
      { value: 5, label: 'Excellent limit', color: '#10b981' },
    ],
  },

  'pm4_ug_m3': {
    displayName: 'PM4.0',
    unit: 'µg/m³',
    decimalPlaces: 1,
    yAxis: { min: 0, max: 50 },
    defaultTimeWindow: 24,
    category: 'moderate',
    healthPriority: 'secondary',
    description: 'Particulate matter 4.0 micrometers',
    zones: [
      { min: 0, max: 10, label: 'Excellent', color: 'green' },
      { min: 10, max: 25, label: 'Good', color: 'green' },
      { min: 25, max: 50, label: 'Moderate', color: 'yellow' },
      { min: 50, max: Infinity, label: 'Poor', color: 'orange' },
    ],
  },

  'pm10_ug_m3': {
    displayName: 'PM10',
    unit: 'µg/m³',
    decimalPlaces: 1,
    yAxis: { min: 0, max: 100 },
    defaultTimeWindow: 24,
    category: 'moderate',
    healthPriority: 'secondary',
    description: 'Particulate matter 10 micrometers',
    zones: [
      { min: 0, max: 15, label: 'Excellent', color: 'green', description: 'WHO annual guideline' },
      { min: 15, max: 45, label: 'Good', color: 'green', description: 'WHO 24h guideline' },
      { min: 45, max: 154, label: 'Moderate', color: 'yellow', description: 'EPA moderate' },
      { min: 154, max: Infinity, label: 'Unhealthy', color: 'orange' },
    ],
    thresholdLines: [
      { value: 15, label: 'WHO annual', color: '#10b981' },
      { value: 45, label: 'WHO 24h', color: '#fbbf24' },
    ],
    standards: ['WHO', 'EPA'],
  },

  'sen55_voc_index': {
    displayName: 'VOC Index',
    defaultVisible: true,
    unit: 'index',
    decimalPlaces: 0,
    yAxis: { min: 0, max: 500 },
    defaultTimeWindow: 24,
    category: 'moderate',
    healthPriority: 'secondary',
    description: 'Volatile organic compounds index - chemical exposure indicator',
    zones: [
      { min: 0, max: 50, label: 'Excellent', color: 'green', description: 'Much cleaner than average' },
      { min: 50, max: 100, label: 'Good', color: 'green', description: 'At or below average' },
      { min: 100, max: 200, label: 'Moderate', color: 'yellow', description: 'Slightly elevated' },
      { min: 200, max: 300, label: 'Poor', color: 'orange' },
      { min: 300, max: 400, label: 'Very Poor', color: 'red' },
      { min: 400, max: Infinity, label: 'Hazardous', color: 'purple' },
    ],
    thresholdLines: [
      { value: 100, label: 'Average baseline', color: '#fbbf24' },
      { value: 200, label: 'Elevated', color: '#f97316' },
    ],
  },

  'sen55_nox_index': {
    displayName: 'NOx Index',
    defaultVisible: true,
    unit: 'index',
    decimalPlaces: 0,
    yAxis: { min: 0, max: 500 },
    defaultTimeWindow: 6,
    category: 'fast',
    healthPriority: 'secondary',
    description: 'Nitrogen oxides index',
    zones: [
      { min: 0, max: 100, label: 'Good', color: 'green' },
      { min: 100, max: 200, label: 'Moderate', color: 'yellow' },
      { min: 200, max: 300, label: 'Poor', color: 'orange' },
      { min: 300, max: Infinity, label: 'Unhealthy', color: 'red' },
    ],
    thresholdLines: [
      { value: 100, label: 'Average baseline', color: '#fbbf24' },
    ],
  },

  'sen55_temp_c': {
    displayName: 'Temperature',
    defaultVisible: true,
    unit: '°C',
    decimalPlaces: 1,
    yAxis: { min: 15, max: 30 },
    defaultTimeWindow: 24,
    category: 'moderate',
    healthPriority: 'secondary',
    description: 'Indoor temperature - comfort indicator',
    zones: [
      { min: 0, max: 18, label: 'Cold', color: 'blue' },
      { min: 18, max: 20.5, label: 'Cool', color: 'green' },
      { min: 20.5, max: 25.5, label: 'Optimal', color: 'green', description: 'ASHRAE comfort' },
      { min: 25.5, max: 27, label: 'Warm', color: 'yellow' },
      { min: 27, max: Infinity, label: 'Hot', color: 'orange' },
    ],
    thresholdLines: [
      { value: 20, label: 'Comfort lower', color: '#10b981', lineStyle: 'dashed' },
      { value: 26, label: 'Comfort upper', color: '#10b981', lineStyle: 'dashed' },
    ],
    standards: ['ASHRAE 55'],
  },

  'sen55_humidity_pct': {
    displayName: 'Humidity',
    defaultVisible: true,
    unit: '%',
    decimalPlaces: 1,
    yAxis: { min: 0, max: 100 },
    defaultTimeWindow: 24,
    category: 'moderate',
    healthPriority: 'secondary',
    description: 'Relative humidity - comfort and mold risk indicator',
    zones: [
      { min: 0, max: 30, label: 'Too Dry', color: 'orange', description: 'Respiratory irritation' },
      { min: 30, max: 40, label: 'Good', color: 'green' },
      { min: 40, max: 60, label: 'Optimal', color: 'green', description: 'ASHRAE recommended' },
      { min: 60, max: 70, label: 'Moderate', color: 'yellow', description: 'Mold risk increases' },
      { min: 70, max: 80, label: 'High', color: 'orange', description: 'Mold growth likely' },
      { min: 80, max: Infinity, label: 'Very High', color: 'red', description: 'Condensation risk' },
    ],
    thresholdLines: [
      { value: 30, label: '30% (Lower optimal)', color: '#10b981' },
      { value: 60, label: '60% (Upper optimal)', color: '#10b981' },
      { value: 70, label: '70% (Mold risk)', color: '#dc2626' },
    ],
    standards: ['ASHRAE'],
  },

  'co_ppm': {
    displayName: 'CO',
    unit: 'ppm',
    decimalPlaces: 2,
    yAxis: { min: 0, max: 50 },
    defaultTimeWindow: 24,
    category: 'moderate',
    healthPriority: 'primary',
    description: 'Carbon monoxide - acute toxicity indicator',
    zones: [
      { min: 0, max: 1, label: 'Excellent', color: 'green', description: 'Outdoor/ideal' },
      { min: 1, max: 5, label: 'Good', color: 'green', description: 'Typical indoor' },
      { min: 5, max: 9, label: 'Moderate', color: 'yellow', description: 'EPA 8h max' },
      { min: 9, max: 35, label: 'Elevated', color: 'orange', description: 'EPA 1h max' },
      { min: 35, max: 50, label: 'Unhealthy', color: 'red', description: 'OSHA TWA' },
      { min: 50, max: Infinity, label: 'Dangerous', color: 'purple' },
    ],
    thresholdLines: [
      { value: 9, label: 'EPA 8h limit', color: '#f97316' },
      { value: 35, label: 'EPA 1h limit', color: '#dc2626' },
    ],
    standards: ['EPA', 'WHO', 'OSHA'],
  },

  'ch4_ppm': {
    displayName: 'Methane',
    unit: 'ppm',
    decimalPlaces: 2,
    yAxis: { min: 0, max: 100 },
    defaultTimeWindow: 1,
    category: 'leak-detection',
    healthPriority: 'safety',
    description: 'Methane - leak and explosion hazard detection',
    zones: [
      { min: 0, max: 5, label: 'Normal', color: 'green' },
      { min: 5, max: 1000, label: 'Elevated', color: 'yellow', description: 'Investigate source' },
      { min: 1000, max: 5000, label: 'High', color: 'orange', description: 'NIOSH limit' },
      { min: 5000, max: Infinity, label: 'Dangerous', color: 'red', description: 'Asphyxiation risk' },
    ],
    thresholdLines: [
      { value: 1000, label: 'NIOSH 8h limit', color: '#f97316' },
    ],
    standards: ['NIOSH'],
  },

  'ethanol_ppm': {
    displayName: 'Ethanol',
    unit: 'ppm',
    decimalPlaces: 2,
    yAxis: { min: 0, max: 20 },
    defaultTimeWindow: 6,
    category: 'fast',
    healthPriority: 'support',
    description: 'Ethanol vapor - occupancy and cleaning indicator',
    zones: [
      { min: 0, max: 1, label: 'Low', color: 'green' },
      { min: 1, max: 5, label: 'Normal', color: 'green', description: 'Typical occupancy' },
      { min: 5, max: 100, label: 'Elevated', color: 'yellow' },
      { min: 100, max: Infinity, label: 'High', color: 'orange' },
    ],
    thresholdLines: [
      { value: 5, label: 'Normal upper limit', color: '#fbbf24' },
    ],
  },

  'h2_ppm': {
    displayName: 'Hydrogen',
    unit: 'ppm',
    decimalPlaces: 2,
    yAxis: { min: 0, max: 100 },
    defaultTimeWindow: 1,
    category: 'leak-detection',
    healthPriority: 'safety',
    description: 'Hydrogen - leak and explosion hazard detection',
    zones: [
      { min: 0, max: 10, label: 'Normal', color: 'green' },
      { min: 10, max: 100, label: 'Elevated', color: 'yellow' },
      { min: 100, max: 1000, label: 'High', color: 'orange' },
      { min: 1000, max: Infinity, label: 'Dangerous', color: 'red', description: 'Leak suspected' },
    ],
  },

  'nh3_ppm': {
    displayName: 'Ammonia',
    unit: 'ppm',
    decimalPlaces: 2,
    yAxis: { min: 0, max: 10 },
    defaultTimeWindow: 6,
    category: 'fast',
    healthPriority: 'secondary',
    description: 'Ammonia - odor and irritation indicator',
    zones: [
      { min: 0, max: 0.05, label: 'Excellent', color: 'green' },
      { min: 0.05, max: 1, label: 'Good', color: 'green' },
      { min: 1, max: 1.5, label: 'Odor Threshold', color: 'yellow' },
      { min: 1.5, max: 20, label: 'Moderate', color: 'orange' },
      { min: 20, max: 25, label: 'Unhealthy', color: 'red', description: 'OSHA 8h TWA' },
      { min: 25, max: Infinity, label: 'Very Unhealthy', color: 'purple' },
    ],
    thresholdLines: [
      { value: 1.5, label: 'Odor threshold', color: '#fbbf24' },
      { value: 20, label: 'Irritation begins', color: '#f97316' },
      { value: 25, label: 'OSHA TWA', color: '#dc2626' },
    ],
    standards: ['OSHA'],
  },

  'no2_ppm': {
    displayName: 'NO₂',
    unit: 'ppb',
    decimalPlaces: 0,
    yAxis: { min: 0, max: 500 },
    defaultTimeWindow: 6,
    category: 'fast',
    healthPriority: 'secondary',
    description: 'Nitrogen dioxide - respiratory irritant from combustion',
    zones: [
      { min: 0, max: 53, label: 'Excellent', color: 'green', description: 'EPA annual std' },
      { min: 53, max: 100, label: 'Good', color: 'yellow' },
      { min: 100, max: 200, label: 'Moderate', color: 'orange', description: 'EPA 1h std' },
      { min: 200, max: 500, label: 'Elevated', color: 'orange', description: 'Kitchen peaks' },
      { min: 500, max: 2000, label: 'Unhealthy', color: 'red' },
      { min: 2000, max: Infinity, label: 'Very Unhealthy', color: 'purple' },
    ],
    thresholdLines: [
      { value: 53, label: 'EPA annual', color: '#10b981' },
      { value: 100, label: 'EPA 1h', color: '#f97316' },
    ],
    standards: ['EPA'],
  },

  'dps310_pressure_hpa': {
    displayName: 'Pressure',
    unit: 'hPa',
    decimalPlaces: 1,
    yAxis: { min: 980, max: 1040 },
    defaultTimeWindow: 48,
    category: 'slow',
    healthPriority: 'support',
    description: 'Atmospheric pressure - weather indicator',
    zones: [
      { min: 0, max: 980, label: 'Very Low', color: 'blue' },
      { min: 980, max: 1000, label: 'Low', color: 'green' },
      { min: 1000, max: 1020, label: 'Normal', color: 'green' },
      { min: 1020, max: 1040, label: 'High', color: 'green' },
      { min: 1040, max: Infinity, label: 'Very High', color: 'blue' },
    ],
    thresholdLines: [
      { value: 1013.25, label: 'Sea level standard', color: '#6b7280', lineStyle: 'dashed' },
    ],
  },

  'esp_temp_c': {
    displayName: 'ESP Temperature',
    unit: '°C',
    decimalPlaces: 1,
    yAxis: { min: 20, max: 60 },
    defaultTimeWindow: 24,
    category: 'moderate',
    healthPriority: 'support',
    description: 'ESP32 internal temperature - device health indicator',
    zones: [
      { min: 0, max: 45, label: 'Normal', color: 'green' },
      { min: 45, max: 60, label: 'Warm', color: 'yellow' },
      { min: 60, max: 75, label: 'Hot', color: 'orange' },
      { min: 75, max: Infinity, label: 'Critical', color: 'red' },
    ],
    thresholdLines: [
      { value: 60, label: 'Check ventilation', color: '#f97316' },
    ],
  },

  // Aliases for sensors with different naming schemes
  'co_ppm': {
    displayName: 'CO',
    unit: 'ppm',
    decimalPlaces: 2,
    yAxis: { min: 0, max: 50 },
    defaultTimeWindow: 24,
    category: 'moderate',
    healthPriority: 'primary',
    description: 'Carbon monoxide - acute toxicity indicator',
    zones: [
      { min: 0, max: 1, label: 'Excellent', color: 'green', description: 'Outdoor/ideal' },
      { min: 1, max: 5, label: 'Good', color: 'green', description: 'Typical indoor' },
      { min: 5, max: 9, label: 'Moderate', color: 'yellow', description: 'EPA 8h max' },
      { min: 9, max: 35, label: 'Elevated', color: 'orange', description: 'EPA 1h max' },
      { min: 35, max: 50, label: 'Unhealthy', color: 'red', description: 'OSHA TWA' },
      { min: 50, max: Infinity, label: 'Dangerous', color: 'purple' },
    ],
    thresholdLines: [
      { value: 9, label: 'EPA 8h limit', color: '#f97316' },
      { value: 35, label: 'EPA 1h limit', color: '#dc2626' },
    ],
    standards: ['EPA', 'WHO', 'OSHA'],
  },

  'no2_ppm': {
    displayName: 'NO₂',
    unit: 'ppb',
    decimalPlaces: 0,
    yAxis: { min: 0, max: 500 },
    defaultTimeWindow: 6,
    category: 'fast',
    healthPriority: 'secondary',
    description: 'Nitrogen dioxide - respiratory irritant from combustion',
    zones: [
      { min: 0, max: 53, label: 'Excellent', color: 'green', description: 'EPA annual std' },
      { min: 53, max: 100, label: 'Good', color: 'yellow' },
      { min: 100, max: 200, label: 'Moderate', color: 'orange', description: 'EPA 1h std' },
      { min: 200, max: 500, label: 'Elevated', color: 'orange', description: 'Kitchen peaks' },
      { min: 500, max: 2000, label: 'Unhealthy', color: 'red' },
      { min: 2000, max: Infinity, label: 'Very Unhealthy', color: 'purple' },
    ],
    thresholdLines: [
      { value: 53, label: 'EPA annual', color: '#10b981' },
      { value: 100, label: 'EPA 1h', color: '#f97316' },
    ],
    standards: ['EPA'],
  },
};
