# Full Shelley Logging Implementation

## Summary

Implemented complete visibility into Shelley's execution by streaming ALL output from both stdout and stderr with zero filtering.

## Changes (Commit: 9bade6a)

### Added `-debug` Flag
The `-debug` flag causes Shelley to output detailed structured logs

### Concurrent Stream Reading

Read both stdout AND stderr concurrently with Promise.race - reads from whichever stream has data available, properly interleaves output.

### Zero Filtering

REMOVED all filtering:
- inConversation tracking
- Created conversation detection
- Emoji-only line filtering
- Structured log filtering

NOW streams everything except empty lines

## Benefits

- Complete transparency - see every step
- Better debugging - identify failures  
- Configuration visibility - verify gateway/models/keys
- Performance insight - see timing
- Educational - understand the system
- Trust - verify sandboxed execution

## Testing

curl -N "http://localhost:3000/api/ask/stream?q=test"

Shows migration logs, gateway config, conversation creation, prompts, responses, tool calls, and script execution.
