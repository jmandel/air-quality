# Shelley Script Sandbox Design

## Security Goals

1. **Read-only database access** - Scripts can query data but cannot modify it
2. **Isolated filesystem** - Scripts only access a temporary directory
3. **No network access** - Scripts cannot make external requests
4. **Resource limits** - CPU, memory, and execution time constraints
5. **No sensitive env vars** - Scripts don't see secrets or credentials

## Current Risks ⚠️

```typescript
// CURRENT UNSAFE IMPLEMENTATION
const analyzeProc = Bun.spawn([bun, analyzePath], {
  cwd: tempDir,
  env: process.env  // ❌ Exposes all secrets!
});
```

**Problems:**
- Script has full filesystem access
- Sees all environment variables (API keys, passwords, etc.)
- Can make network requests
- No resource limits
- Can access and modify the real database

## Proposed Architecture

```
┌─────────────────────────────────────────────────────┐
│ ask-helper.ts (Trusted Code)                        │
│                                                      │
│  1. Create isolated sandbox directory               │
│  2. Copy DB to read-only location                   │
│  3. Run script with strict isolation                │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ Sandbox Container                             │  │
│  │                                               │  │
│  │  /sandbox/                                    │  │
│  │    ├── db.sqlite (read-only copy)            │  │
│  │    ├── temp/     (writable temp space)       │  │
│  │    └── analyze.ts (generated script)         │  │
│  │                                               │  │
│  │  Restrictions:                                │  │
│  │    • No network access (--allow-net blocked) │  │
│  │    • Limited filesystem (--allow-read=...)   │  │
│  │    • No env vars except PATH, NODE_ENV       │  │
│  │    • 30s timeout, 512MB RAM limit            │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Implementation Options

### Option 1: Deno Runtime (Recommended)

Deno has built-in permission system:

```typescript
import { exec } from "bun";

const denoProc = Bun.spawn([
  "deno", "run",
  "--allow-read=/sandbox/db.sqlite,/sandbox/temp",
  "--allow-write=/sandbox/temp",
  "--no-prompt",
  "--quiet",
  analyzePath
], {
  cwd: sandboxDir,
  env: {
    PATH: "/usr/bin:/bin",
    NODE_ENV: "production",
    DATABASE_PATH: "/sandbox/db.sqlite"
  },
  timeout: 30000  // 30 second timeout
});
```

**Pros:**
- ✅ Fine-grained permission system
- ✅ No network access by default
- ✅ TypeScript native
- ✅ Simple to configure

**Cons:**
- ❌ Requires Deno installed
- ❌ Different runtime than Bun

### Option 2: Bun with Bubblewrap

Use Bubblewrap (Linux namespace isolation):

```typescript
const bwrapProc = Bun.spawn([
  "bwrap",
  "--ro-bind", "/usr", "/usr",
  "--ro-bind", "/lib", "/lib",
  "--ro-bind", "/lib64", "/lib64",
  "--ro-bind", sandboxDbPath, "/db.sqlite",
  "--bind", tempDir, "/temp",
  "--tmpfs", "/tmp",
  "--unshare-net",  // No network
  "--die-with-parent",
  "--new-session",
  bun, analyzePath
], {
  cwd: "/temp",
  env: {
    PATH: "/usr/bin:/bin",
    DATABASE_PATH: "/db.sqlite"
  }
});
```

**Pros:**
- ✅ Same Bun runtime
- ✅ Strong kernel-level isolation
- ✅ No network access

**Cons:**
- ❌ Linux-only
- ❌ Requires bubblewrap installed

### Option 3: Docker Container

```bash
docker run --rm \
  --network none \
  --read-only \
  --tmpfs /tmp \
  --memory=512m \
  --cpus=0.5 \
  -v "$sandboxDbPath:/db.sqlite:ro" \
  -v "$scriptPath:/analyze.ts:ro" \
  -v "$tempDir:/temp:rw" \
  oven/bun:latest \
  bun /analyze.ts
```

**Pros:**
- ✅ Complete isolation
- ✅ Resource limits built-in
- ✅ Cross-platform (if Docker available)

**Cons:**
- ❌ Slower startup (container overhead)
- ❌ Requires Docker daemon

## Recommended Approach: Hybrid

1. **Primary: Deno with strict permissions** (fast, secure, simple)
2. **Fallback: Bun with manual restrictions** (if Deno unavailable)
3. **Future: Docker for production** (maximum security)

## Database Isolation

```typescript
async function createReadOnlyDbCopy(originalDb: string, sandboxDir: string): Promise<string> {
  const dbCopy = path.join(sandboxDir, "db.sqlite");

  // Copy database file
  await Bun.file(originalDb).copyTo(dbCopy);

  // Set read-only permissions
  await Bun.spawn(["chmod", "444", dbCopy]).exited;

  // Verify it's read-only
  const stat = await Bun.file(dbCopy).stat();
  if ((stat.mode & 0o222) !== 0) {
    throw new Error("Failed to create read-only DB copy");
  }

  return dbCopy;
}
```

## Environment Variable Sanitization

```typescript
const SAFE_ENV_VARS = ["PATH", "HOME", "USER", "LANG", "TZ"];

function getSafeEnv(): Record<string, string> {
  return {
    PATH: "/usr/bin:/bin",
    NODE_ENV: "production",
    // NO: API_KEYS, PASSWORDS, TOKENS, etc.
  };
}
```

## Resource Limits

```typescript
interface ResourceLimits {
  timeout: number;      // 30 seconds max
  memory: number;       // 512MB max
  cpuPercent: number;   // 50% of one core
}

async function runWithLimits(proc: Subprocess, limits: ResourceLimits) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => {
      proc.kill();
      reject(new Error("Script timeout"));
    }, limits.timeout)
  );

  return Promise.race([proc.exited, timeoutPromise]);
}
```

## Testing Strategy

1. **Test: File access beyond sandbox** - Should fail
2. **Test: Network requests** - Should fail
3. **Test: Database writes** - Should fail (read-only)
4. **Test: Excessive CPU** - Should timeout
5. **Test: Excessive memory** - Should be killed
6. **Test: Environment variable leakage** - Should not see secrets

## Migration Plan

1. ✅ **Phase 1**: Add read-only DB copy (low risk)
2. ✅ **Phase 2**: Sanitize environment variables
3. ✅ **Phase 3**: Add timeout limits
4. ⏳ **Phase 4**: Implement Deno sandbox (or Bubblewrap)
5. ⏳ **Phase 5**: Add resource monitoring and limits
6. ⏳ **Phase 6**: Comprehensive security audit

## Example: Secure Script Runner

```typescript
// sandbox-runner.ts
export async function runShelleyScriptSandboxed(
  scriptPath: string,
  question: string
): Promise<DashboardResponse> {

  // 1. Create isolated directory
  const sandboxId = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sandboxDir = `/tmp/shelley-sandbox/${sandboxId}`;
  await mkdir(sandboxDir, { recursive: true });

  try {
    // 2. Copy database (read-only)
    const dbPath = await createReadOnlyDbCopy(DATABASE_FILE, sandboxDir);

    // 3. Copy script to sandbox
    const sandboxScript = path.join(sandboxDir, "analyze.ts");
    await Bun.file(scriptPath).copyTo(sandboxScript);

    // 4. Create temp directory for script output
    const tempDir = path.join(sandboxDir, "temp");
    await mkdir(tempDir);

    // 5. Run with Deno (sandboxed)
    const proc = Bun.spawn([
      "deno", "run",
      `--allow-read=${dbPath},${tempDir}`,
      `--allow-write=${tempDir}`,
      "--no-prompt",
      sandboxScript
    ], {
      cwd: tempDir,
      env: {
        PATH: "/usr/bin:/bin",
        DATABASE_PATH: dbPath,
        TEMP_DIR: tempDir
      },
      timeout: 30000,
      stdout: "pipe",
      stderr: "pipe"
    });

    // 6. Collect output with timeout
    const output = await Promise.race([
      new Response(proc.stdout).text(),
      new Promise((_, reject) =>
        setTimeout(() => {
          proc.kill();
          reject(new Error("Script timeout (30s)"));
        }, 30000)
      )
    ]);

    // 7. Parse and validate response
    const response = JSON.parse(output as string);
    return validateDashboardResponse(response);

  } finally {
    // 8. Clean up sandbox (always)
    await rm(sandboxDir, { recursive: true, force: true });
  }
}
```

## Security Checklist

Before deploying sandbox:

- [ ] Database is truly read-only (chmod 444)
- [ ] No network access (test with curl/fetch)
- [ ] No parent filesystem access (test with readFile("/etc/passwd"))
- [ ] Environment vars sanitized (no API keys visible)
- [ ] Timeout enforced (test with infinite loop)
- [ ] Memory limits work (test with large array allocation)
- [ ] Sandbox cleanup happens (test /tmp doesn't fill up)
- [ ] Error handling doesn't leak paths (sanitize error messages)

## Monitoring

Log all sandbox executions:

```typescript
{
  timestamp: "2025-11-15T12:00:00Z",
  sandbox_id: "sandbox-1731682800-abc123",
  question: "What is the current CO2 level?",
  execution_time_ms: 1234,
  memory_used_mb: 45,
  exit_code: 0,
  violations: []  // Any sandbox escape attempts
}
```

## Future Enhancements

1. **WebAssembly sandbox** - Compile scripts to WASM for ultimate isolation
2. **Multiple isolation layers** - Combine Deno + Docker for defense in depth
3. **Static analysis** - Scan generated scripts before execution
4. **Allowlist patterns** - Only permit known-safe database queries
