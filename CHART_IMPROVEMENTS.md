# Chart Improvements Summary

## Changes Made (Nov 16, 2025)

### 1. Fixed Schema Duplication
**Commit:** `276889c` - DRY: Insert dashboard schema programmatically from dashboard-types.ts

- Removed ~70 lines of hardcoded schema duplication in `ask-stream-route.ts`
- Now uses imported `dashboardTypesSource` via text import
- Single source of truth in `dashboard-types.ts`

### 2. Made Charts Punchier
**Commit:** `7f33b87` - Make charts punchier: thicker lines, bigger labels, threshold annotations, no animations

#### Visual Improvements:
- **Thicker lines**: borderWidth increased to 3px (was 1px default)
- **Bigger axis labels**: Size 16pt, bold, bright white (#f8fafc)
- **Better tick labels**: Size 13pt, medium weight, lighter grey (#cbd5e1)
- **No animations**: Instant rendering with `animation: false`
- **Cleaner lines**: No point dots by default (show on hover: pointHoverRadius: 6)
- **Less smoothing**: tension reduced to 0.2 for sharper, punchier look

#### Threshold Annotations Added:
- Added chartjs-plugin-annotation library
- Threshold lines now render as dashed horizontal lines with labels
- Example: "Warning Threshold" at 800ppm, "Critical Threshold" at 1000ppm
- Labels have colored backgrounds matching line colors

#### Code Changes:
- **ask.html**: Added `<script>` tag for chartjs-plugin-annotation CDN
- **ask.ts**: Completely rewrote `renderChart()` function to:
  - Build annotations object from `block.annotations` array
  - Configure plugin options with proper styling
  - Enhance all font sizes, weights, and colors
  - Remove animations
  - Improve grid colors to match dark theme

### 3. Cleaned Up
**Commit:** `1c90f32` - Remove obsolete test/mock files

- Removed `mock-analyze-template.ts`
- Removed `test-lookup.ts`
- Removed backup files (`*.bak`)

## Before vs After

### Before:
- Thin lines (1px)
- Small grey axis labels (~10pt)
- No threshold indicators
- Animated transitions
- Cluttered with point dots

### After:
- Thick bold lines (3px)
- Large bright axis labels (16pt bold)
- Threshold annotations with labeled dashed lines
- Instant rendering (no animations)
- Clean lines (dots only on hover)

## Testing

Charts now properly render:
1. ✅ Threshold annotations from `annotations` field in ChartBlock
2. ✅ Bold, readable axis labels
3. ✅ Thick, punchy line styling
4. ✅ No distracting animations
5. ✅ Better dark theme integration

## Schema Interface

The `ChartBlock` interface in `dashboard-types.ts` already supported annotations:

```typescript
interface ChartBlock {
  // ...
  annotations?: Array<{
    type: "threshold";
    value: number;
    label: string;
    color?: string;
  }>;
}
```

This was always part of the schema, but the frontend wasn't rendering them until now.
