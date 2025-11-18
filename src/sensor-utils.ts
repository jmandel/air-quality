// Sensor utility functions
import { SENSOR_REGISTRY, SensorMetadata, ThresholdZone } from './sensor-registry';

/**
 * Get sensor metadata from registry, or create fallback for unknown sensors
 */
export function getSensorMetadata(sensorId: string): SensorMetadata {
  return SENSOR_REGISTRY[sensorId] || createFallbackMetadata(sensorId);
}

/**
 * Create fallback metadata for sensors not in registry
 */
function createFallbackMetadata(sensorId: string): SensorMetadata {
  return {
    displayName: prettyId(sensorId),
    unit: '',
    decimalPlaces: 2,
    yAxis: { min: 0, max: 100 },
    defaultTimeWindow: 6,
    category: 'moderate',
    healthPriority: 'support',
    zones: [],
  };
}

/**
 * Get the current zone for a given value
 */
export function getCurrentZone(value: number, metadata: SensorMetadata): ThresholdZone | null {
  for (const zone of metadata.zones) {
    if (value >= zone.min && value < zone.max) {
      return zone;
    }
  }
  return null;
}

/**
 * Convert zone color name to hex color
 * Using brighter, more saturated colors for better visibility
 */
export function getZoneColor(color: string): string {
  const colorMap: Record<string, string> = {
    green: '#22c55e',   // Brighter green
    yellow: '#fbbf24',  // Keep yellow
    orange: '#fb923c',  // Brighter orange
    red: '#ef4444',     // Brighter red
    purple: '#a855f7',  // Keep purple
    blue: '#3b82f6',    // Keep blue
  };
  return colorMap[color] || '#6b7280';
}

/**
 * Pretty-print sensor ID for display
 */
export function prettyId(id: string): string {
  return id
    .replace(/^sensor-/, '')
    .replace(/_weight_concentration$/, '')
    .replace(/__/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\bco2\b/i, 'CO₂')
    .replace(/\bpm\b/i, 'PM')
    .replace(/\bvoc\b/i, 'VOC')
    .replace(/\bnox\b/i, 'NOx')
    .replace(/\bno2\b/i, 'NO₂')
    .trim();
}

/**
 * Get all sensors grouped by health priority
 */
export function groupSensorsByPriority(sensorIds: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {
    primary: [],
    secondary: [],
    safety: [],
    support: [],
  };

  for (const sensorId of sensorIds) {
    const metadata = getSensorMetadata(sensorId);
    groups[metadata.healthPriority].push(sensorId);
  }

  return groups;
}

/**
 * Get suggested time window for a sensor
 */
export function getSuggestedTimeWindow(sensorId: string): number {
  const metadata = getSensorMetadata(sensorId);
  return metadata.defaultTimeWindow;
}

/**
 * Check if a value is in a dangerous zone
 */
export function isValueDangerous(value: number, metadata: SensorMetadata): boolean {
  const zone = getCurrentZone(value, metadata);
  return zone ? ['red', 'purple'].includes(zone.color) : false;
}

/**
 * Check if a value is in a warning zone
 */
export function isValueWarning(value: number, metadata: SensorMetadata): boolean {
  const zone = getCurrentZone(value, metadata);
  return zone ? zone.color === 'orange' : false;
}

/**
 * Get formatted value with unit
 */
export function formatValue(value: number, metadata: SensorMetadata): string {
  return `${value.toFixed(metadata.decimalPlaces)} ${metadata.unit}`;
}
