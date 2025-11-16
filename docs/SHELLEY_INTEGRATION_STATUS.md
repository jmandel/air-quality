# Shelley Integration Status

## Current State: Smart Mock Implementation

The `/api/ask` endpoint is currently using an **intelligent mock system** that demonstrates the full architecture that will be used when Shelley LLM integration is available.

### Architecture (Ready for Full Shelley)

```
User Question
    ↓
/api/ask endpoint
    ↓
askShelley() helper
    ↓
Creates temp directory
    ↓
Crafts comprehensive prompt:
  - Database schema
  - All 23 sensors with units/thresholds
  - TypeScript interfaces
  - Example SQL queries
  - Current time context
  - Instructions to write analyze.ts
    ↓
[CURRENTLY: Smart mock generates analyze.ts]
[FUTURE: Shelley CLI generates analyze.ts]
    ↓
Execute analyze.ts with Bun
    ↓
Parse JSON output → Dashboard tiles
    ↓
Frontend renders tiles
```

### What Works Now

✅ **Smart keyword detection** - Understands questions about CO₂, PM2.5, temperature, humidity, VOC, etc.
✅ **Dynamic script generation** - Creates custom analyze.ts for each sensor type
✅ **Real database queries** - Pulls actual live data
✅ **Dashboard rendering** - All 3 tile types (metric, chart, text)
✅ **Status coloring** - Green/yellow/red based on actual thresholds
✅ **Chart.js visualizations** - Time-series with threshold annotations
✅ **Full TypeScript pipeline** - Type-safe from API to frontend

### Example Questions That Work

- "What is the current CO₂ level?"
- "Show me PM2.5"
- "How is the temperature?"
- "Check humidity levels"
- "What's the VOC index?"
- "Is the air quality good?"

Each returns a custom dashboard with:
1. **Metric tile** - Current value with status color
2. **Chart tile** - Time series graph with thresholds
3. **Text tile** - Interpretation and recommendations

### Shelley Integration Requirements

To enable full Shelley integration, one of these is needed:

**Option 1: API Keys**
```bash
# Add to environment
export ANTHROPIC_API_KEY="sk-ant-..."
# or
export OPENAI_API_KEY="sk-..."
# or
export FIREWORKS_API_KEY="..."
```

**Option 2: LLM Gateway**
The system is configured to use the exe.dev LLM gateway at `/exe.dev/shelley.json`:
```json
{
  "default_model": "claude-sonnet-4.5",
  "key_generator": "sudo /usr/local/bin/generate-gateway-token",
  "llm_gateway": "https://exe.dev"
}
```

This should work but requires proper gateway configuration.

### Why Shelley Will Make This Better

The current mock can only:
- Recognize ~6 sensor keywords
- Generate single-sensor dashboards
- Use hardcoded SQL patterns

**With full Shelley LLM:**
- ✅ **Natural language understanding** - "Is my air quality getting better?" 
- ✅ **Multi-sensor analysis** - "Compare CO₂, PM2.5, and VOC"
- ✅ **Time-based queries** - "What was the peak CO₂ today?"
- ✅ **Trend analysis** - "Is temperature increasing over the past hour?"
- ✅ **Custom calculations** - "Show me average PM2.5 by hour"
- ✅ **Smart thresholds** - Context-aware status assessment
- ✅ **Better text summaries** - Actual AI-written interpretations

### Code Ready for Shelley

The complete prompt is in `ask-helper.ts`:
- 6,366 characters of detailed instructions
- Complete database schema
- All 23 sensors with ranges/thresholds
- Full TypeScript interfaces
- SQL query examples
- Color palette
- Critical rules (JSON-only stdout)

Just needs the model to support file creation.

### Testing Shelley CLI

```bash
# Check available models
shelley models

# Test with predictable model (doesn't write files)
shelley -model predictable prompt "Write a file"

# When API keys available:
shelley -model claude-sonnet-4.5 prompt "Write analyze.ts..."
```

### Current Workaround

The mock template in `ask-helper.ts` manually generates `analyze.ts` scripts based on keyword detection. This demonstrates the exact same flow that Shelley will use, just without the AI intelligence.

### Next Steps

1. ✅ Mock system working (demonstrates full architecture)
2. ⏳ Get LLM gateway or API keys working
3. ⏳ Test Shelley CLI file creation
4. ⏳ Switch from mock to real Shelley calls
5. ⏳ Test complex multi-sensor queries

**The foundation is complete - just needs LLM API access to unlock full potential!**
