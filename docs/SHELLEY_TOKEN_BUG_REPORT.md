# Bug Report: Shelley Token Auto-Refresh Failure

## Summary

Shelley fails to automatically refresh expired authentication tokens, causing all LLM requests to fail with 401 errors until the service is manually restarted.

## Severity

**High** - Causes complete service degradation after 25 hours of uptime. All user interactions fail silently.

## Environment

- **Box**: joshair.exe.dev
- **Service**: Shelley-the-Agent (shelley.service)
- **Binary**: `/usr/local/bin/shelley`
- **Token Generator**: `/usr/local/bin/generate-gateway-token`
- **Token TTL**: 90000 seconds (25 hours)
- **Gateway**: https://exe.dev

## Expected Behavior

When Shelley receives a 401 "token expired" response from the LOM backend:
1. Detect the expired token error
2. Execute the `key_generator` command to obtain a fresh token
3. Retry the failed request with the new token
4. Continue serving requests normally

## Actual Behavior

When the token expires after 25 hours:
1. Shelley receives 401 "token expired" responses
2. **Token is NOT regenerated**
3. Service continues attempting requests with the expired token
4. All LLM requests fail indefinitely
5. Manual service restart is required to recover

## Reproduction Steps

1. Start Shelley service
   ```bash
   sudo systemctl start shelley.service
   ```

2. Wait 25+ hours (until default token TTL expires)

3. Make an LLM request through the Shelley UI at https://NAME.exe.dev:9999/

4. Observe: Request fails with 401 error

5. Check logs:
   ```bash
   sudo journalctl -u shelley.service | grep "token expired"
   ```

6. Observe: Multiple "box key auth failed: token expired" errors, but **no token refresh attempts**

## Evidence from Logs

### Token Generated on Startup (Nov 1, 02:43 UTC)

```
Nov 01 02:43:21 sudo[67]: COMMAND=/usr/local/bin/generate-gateway-token
Nov 01 02:43:21 shelley[56]: level=DEBUG msg="Using key from generator" command="sudo /usr/local/bin/generate-gateway-token"
```

**This was the ONLY token generation event until service restart 2+ days later.**

### Successful Requests (Nov 1, 02:43-02:47 UTC)

```
Nov 01 02:43:57 level=INFO msg="LLM request completed" model=qwen3-coder-fireworks
Nov 01 02:44:00 level=INFO msg="LLM request completed" model=claude-sonnet-4.5
Nov 01 02:44:03 level=INFO msg="LLM request completed" model=claude-sonnet-4.5
... (many successful requests)
```

### Token Expired - First Failures (Nov 2, 20:57 UTC)

**~42 hours after startup, but should have expired at 25 hours based on TTL**

```
Nov 02 20:57:03 level=WARN msg=anthropic_request_failed
    response="box key auth failed: token expired\n"
    status_code=401
    url=https://exe.dev/_/gateway/anthropic/v1/messages

Nov 02 20:57:03 level=ERROR msg="LLM request failed"
    error="status 401 Unauthorized: box key auth failed: token expired\n"

Nov 02 20:57:03 level=ERROR msg="failed to process LLM request"
    conversationID=cN6LLYM
    error="LLM request failed: status 401 Unauthorized: box key auth failed: token expired\n"
```

### Continued Failures - No Token Refresh (Nov 2-3)

```
Nov 02 20:57:19 level=ERROR msg="LLM request failed"
    error="box key auth failed: token expired\n"

Nov 02 21:00:00 level=ERROR msg="LLM request failed" model=qwen3-coder-fireworks
    error="box key auth failed: token expired\n"

Nov 02 21:00:00 level=ERROR msg="LLM request failed" model=claude-sonnet-4.5
    error="box key auth failed: token expired\n"

Nov 02 21:00:32 level=ERROR msg="LLM request failed"
    error="box key auth failed: token expired\n"

Nov 02 21:06:49 level=ERROR msg="LLM request failed"
    error="box key auth failed: token expired\n"

Nov 03 15:30:05 level=ERROR msg="LLM request failed"
    error="box key auth failed: token expired\n"

Nov 03 15:30:15 level=ERROR msg="LLM request failed"
    error="box key auth failed: token expired\n"
```

**Total duration of failures: 18+ hours** (Nov 2 20:57 - Nov 3 15:40)

### Token Refresh Count Analysis

```bash
$ sudo journalctl -u shelley.service --since "2025-11-01" --until "2025-11-03 15:40" | grep "key from generator" | wc -l
1
```

**Result**: Only **1 token generation** in 2+ days of runtime.

## Root Cause Analysis

### Missing Token Refresh Logic

Shelley's code appears to:
1. ✅ Generate token on startup
2. ✅ Use token for API requests
3. ✅ Detect 401 errors from backend
4. ❌ **FAIL to trigger token regeneration on 401**
5. ❌ **No retry logic after token refresh**

### Expected Code Flow (Not Implemented)

```
LLM Request → Use Cached Token → Send to Gateway
                                        ↓
                                   401 Expired?
                                        ↓ Yes
                            Execute key_generator
                                        ↓
                            Update cached token
                                        ↓
                            Retry request
```

### Actual Code Flow (Current Behavior)

```
LLM Request → Use Cached Token → Send to Gateway
                                        ↓
                                   401 Expired?
                                        ↓ Yes
                                Return error to user
                                        ↓
                                Service continues with expired token
```

## Impact Assessment

### User Impact
- **Complete service failure** after 25 hours of uptime
- No visible error message indicating service degradation
- Appears as if all LLM requests are simply failing
- Requires manual intervention (service restart)

### Operational Impact
- Long-running boxes become unusable without restart
- No monitoring or alerting for this failure mode
- Silent degradation - no clear indication to user

### Frequency
- **Guaranteed** to occur every 25 hours of uptime
- Affects all Shelley instances running > 25 hours
- Current instance had been failing for 18+ hours before discovery

## Proposed Solution

### Option 1: Token Refresh on 401 (Recommended)

Add retry logic to LLM request handler:

```go
func (s *Server) makeLLMRequest(ctx context.Context, req *LLMRequest) (*LLMResponse, error) {
    resp, err := s.sendRequestWithToken(ctx, req)

    // If token expired, refresh and retry
    if err != nil && isTokenExpiredError(err) {
        log.Warn("Token expired, refreshing...")

        newToken, err := s.refreshToken()
        if err != nil {
            return nil, fmt.Errorf("failed to refresh token: %w", err)
        }

        s.token = newToken
        log.Info("Token refreshed successfully")

        // Retry with new token
        return s.sendRequestWithToken(ctx, req)
    }

    return resp, err
}

func isTokenExpiredError(err error) bool {
    return strings.Contains(err.Error(), "token expired") ||
           strings.Contains(err.Error(), "401 Unauthorized")
}

func (s *Server) refreshToken() (string, error) {
    cmd := exec.Command("sudo", "/usr/local/bin/generate-gateway-token")
    output, err := cmd.Output()
    if err != nil {
        return "", err
    }
    return strings.TrimSpace(string(output)), nil
}
```

### Option 2: Proactive Token Refresh

Refresh token before expiration:

```go
func (s *Server) startTokenRefreshLoop() {
    // Refresh token every 20 hours (before 25 hour expiration)
    ticker := time.NewTicker(20 * time.Hour)

    go func() {
        for range ticker.C {
            token, err := s.refreshToken()
            if err != nil {
                log.Error("Failed to proactively refresh token: %w", err)
                continue
            }
            s.token = token
            log.Info("Proactively refreshed token")
        }
    }()
}
```

### Option 3: Parse Token TTL and Schedule Refresh

Most robust solution - parse the token to determine exact expiration:

```go
func (s *Server) scheduleTokenRefresh(token string) {
    // Decode token payload
    parts := strings.Split(token, ".")
    if len(parts) < 1 {
        return
    }

    payload, err := base64.RawStdEncoding.DecodeString(parts[0])
    if err != nil {
        log.Warn("Failed to decode token payload: %v", err)
        return
    }

    var claim struct {
        CreatedAt  time.Time `json:"created_at"`
        TTLSeconds int       `json:"ttl_seconds"`
    }

    if err := json.Unmarshal(payload, &claim); err != nil {
        log.Warn("Failed to parse token claim: %v", err)
        return
    }

    expiresAt := claim.CreatedAt.Add(time.Duration(claim.TTLSeconds) * time.Second)
    refreshAt := expiresAt.Add(-1 * time.Hour) // Refresh 1 hour before expiration

    time.AfterFunc(time.Until(refreshAt), func() {
        newToken, err := s.refreshToken()
        if err != nil {
            log.Error("Failed to refresh token: %v", err)
            return
        }
        s.token = newToken
        log.Info("Token refreshed successfully before expiration")

        // Schedule next refresh
        s.scheduleTokenRefresh(newToken)
    })
}
```

## Testing Strategy

### Test Case 1: Expired Token Recovery

1. Start Shelley with a token that expires in 1 minute
   ```bash
   # Modify config temporarily
   "key_generator": "sudo /usr/local/bin/generate-gateway-token -ttl_seconds 60"
   ```

2. Wait for token to expire

3. Make LLM request

4. Verify token is automatically refreshed

5. Verify request succeeds

### Test Case 2: Multiple Concurrent Requests After Expiration

1. Expire token as above

2. Make 10 concurrent LLM requests

3. Verify token is refreshed only once

4. Verify all requests succeed (with appropriate retry)

### Test Case 3: Token Generation Failure

1. Make key_generator command fail (e.g., remove sudo access)

2. Trigger token expiration

3. Verify appropriate error is returned to user

4. Verify service doesn't crash

## Workaround (Current)

Until fixed, operators must:

```bash
# Monitor for token expiration errors
sudo journalctl -u shelley.service -f | grep "token expired"

# Restart service when detected
sudo systemctl restart shelley.service
```

Or schedule automatic restarts:

```bash
# Add to crontab - restart every 20 hours
0 */20 * * * /usr/bin/systemctl restart shelley.service
```

## Additional Notes

### Why Token Didn't Expire at Expected Time

Token should have expired at: **Nov 1 02:43 + 25 hours = Nov 2 03:43 UTC**

But first failure was at: **Nov 2 20:57 UTC** (~42 hours after start)

**Possible explanations:**
1. Backend may have been lenient with expiration checking
2. No requests were made between 03:43-20:57 (so no detection until later)
3. Backend clock skew or grace period

### Related Issues

- Database migration issue with "error" message type (separate bug)
- Service doesn't log token payload or expiration time (debugging difficulty)

## Files for Reference

- Service definition: `/etc/systemd/system/shelley.service`
- Config: `/exe.dev/shelley.json`
- Token generator: `/usr/local/bin/generate-gateway-token`
- Shelley binary: `/usr/local/bin/shelley`
- Database: `/home/exedev/.shelley/shelley.db`

## Conclusion

This is a critical bug that causes guaranteed service failure after 25 hours of uptime. The fix is straightforward - add token refresh logic when receiving 401 errors. Recommend implementing **Option 1** (reactive refresh on 401) as minimum fix, with **Option 3** (scheduled refresh) as ideal long-term solution.

---

**Reported**: 2025-11-03
**Discovered by**: Analysis of service logs after manual intervention
**Status**: Confirmed with log evidence
**Priority**: High - affects all long-running instances
