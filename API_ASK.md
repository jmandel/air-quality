# `/api/ask` - Natural Language Query Endpoint

## Overview

The `/api/ask` endpoint allows you to ask questions about your air quality data in natural language. It uses Shelley (an LLM agent) to process queries and provide insights.

## Endpoint

**GET** `/api/ask?q=your_question`

## Parameters

- `q` or `query` (required): Your question in natural language

## Example Requests

```bash
# Simple query
curl "http://air443.exe.dev:3000/api/ask?q=What+is+the+current+CO2+level?"

# Complex query
curl "http://air443.exe.dev:3000/api/ask?q=What+was+the+average+PM2.5+over+the+last+hour?"

# Analysis query
curl "http://air443.exe.dev:3000/api/ask?q=Is+the+air+quality+good+right+now?"
```

## Response Format

### Success Response

```json
{
  "question": "What is 2 plus 2?",
  "answer": "4",
  "conversationId": "cEHMCLS",
  "timestamp": "2025-11-15T21:57:21.977Z"
}
```

### Error Response

```json
{
  "error": "Missing query parameter. Use ?q=your_question"
}
```

HTTP status codes:
- `200`: Success
- `400`: Bad request (missing query parameter)
- `500`: Server error

## Implementation Details

### Current Status

- ✅ Endpoint functional
- ⚠️ Currently uses "predictable" test model (returns placeholder responses)
- 🚧 TODO: Integrate with Shelley web server API for full LLM access

### How It Works

1. Receives natural language question via query parameter
2. Spawns Shelley CLI process to handle the query
3. Parses Shelley's response
4. Returns answer with conversation ID for tracking

### Shelley Integration

The endpoint calls Shelley CLI:
```bash
shelley -model predictable -db /home/exedev/app/airq-ask.db prompt "your question"
```

- Creates a conversation in the database
- Returns conversation ID for follow-up queries
- Parses emoji-prefixed output (🤖 for assistant responses)

## Future Enhancements

1. **Full LLM Access**: Switch from "predictable" model to Claude/GPT via Shelley web API
2. **Context Awareness**: Inject current air quality data into prompts
3. **Conversation Continuity**: Support follow-up questions using conversation ID
4. **Streaming Responses**: Return answers as they're generated (SSE)
5. **Database Queries**: Allow Shelley to query the readings database directly

## Example Use Cases

### Current Conditions
```
?q=What's the air quality like right now?
?q=Should I open the windows?
?q=Is the CO2 level too high?
```

### Historical Analysis
```
?q=What was the peak PM2.5 today?
?q=How has the temperature changed over the past hour?
?q=When was the last time CO2 exceeded 1000 ppm?
```

### Comparisons
```
?q=Is the air quality better now than this morning?
?q=Compare today's VOC levels to yesterday
```

### Recommendations
```
?q=Do I need to run the air purifier?
?q=When should I ventilate the room?
```

## Integration with Web UI

The `/api/ask` endpoint can be called from the viewer to add natural language query capabilities:

```javascript
async function askQuestion(query) {
  const response = await fetch(`/api/ask?q=${encodeURIComponent(query)}`);
  const data = await response.json();
  return data.answer;
}
```

## Notes

- Each query creates a new conversation (conversation IDs not yet reused for follow-ups)
- Responses are cached in `/home/exedev/app/airq-ask.db`
- The predictable model is a placeholder - responses will improve once integrated with real LLM
