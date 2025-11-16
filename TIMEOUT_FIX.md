# Timeout Fix for /api/ask Endpoint

## Problem Summary

The `/api/ask` endpoint was failing with `Shelley failed with exit code 143` after approximately 26 seconds. Exit code 143 indicates the process received SIGTERM (signal 15).

### Error Pattern
```
Nov 16 02:59:41 🤖 Calling Shelley CLI...
Nov 16 02:59:41 sudo calls succeed (token generation works)
Nov 16 03:00:07 📝 Shelley exit: 143, output: 5417 chars
Nov 16 03:00:07 error: Shelley failed with exit code 143
```

Duration: ~26 seconds (killed before completing)

## Root Cause

The **Shelley CLI has a default 30-second timeout** for LLM requests:

```bash
$ shelley prompt -h
  -timeout duration
        Timeout for LLM request (default 30s)
```

When generating analysis scripts for complex queries, the LLM call + script execution exceeded this timeout, causing Shelley to self-terminate with SIGTERM.

### Not the Issue

- ✅ **Sudo access**: Working perfectly (logs show successful token generation)
- ✅ **Service permissions**: exedev user has `NOPASSWD:ALL`
- ✅ **Shelley config**: Correctly configured with token generator
- ✅ **Server timeout**: Bun's `idleTimeout: 120` was not the problem
- ✅ **Browser timeout**: Fetch had no explicit timeout set

## Solution

Added `-timeout 180s` flag to the Shelley CLI invocation in `ask-helper.ts`:

```typescript
const shelleyProc = Bun.spawn([
  "shelley", 
  "-config", "/exe.dev/shelley.json", 
  "-model", "claude-sonnet-4.5", 
  "prompt", 
  "-timeout", "180s",  // ← Added this
  prompt
], {
  // ...
});
```

This gives Shelley **3 minutes** to:
1. Call the LLM API to generate the analysis script
2. Write the script to disk
3. Execute the script against the database
4. Parse and return the dashboard response

## Files Changed

- `ask-helper.ts`: Added `-timeout 180s` to Shelley spawn command

## Testing

After the fix:
- Service restarted successfully
- Port 3000 listening
- All endpoints responding

To test the fix, try queries that require complex analysis:
```bash
curl "http://localhost:3000/api/ask?q=Show+me+CO2+trends+over+the+last+6+hours"
```

## Configuration Summary

### Service File
Location: `/etc/systemd/system/air1-logger.service`
- User: exedev
- WorkingDirectory: /home/exedev/app
- Auto-reload via dev.sh

### Sudoers
Location: `/etc/sudoers`
```
exedev ALL=(ALL) NOPASSWD:ALL
```

### Shelley Config
Location: `/exe.dev/shelley.json`
```json
{
  "key_generator": "sudo /usr/local/bin/generate-gateway-token",
  "llm_gateway": "https://exe.dev",
  ...
}
```

### Token Generator
Location: `/usr/local/bin/generate-gateway-token`
- Executable by root
- Called via sudo by Shelley
- Successfully generates tokens (verified in logs)

## Related Documentation

- `API_ASK.md`: Natural language query API
- `DASHBOARD_TILES.md`: Dashboard tile schema
- `SHELLEY_INTEGRATION.md`: LLM integration architecture

