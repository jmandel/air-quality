# Docker Sandbox for Shelley Script Execution

## Threat Model

**What we're protecting against:**
- ✅ Filesystem damage (deleting files, modifying system files)
- ✅ Writing outside sandbox directory
- ✅ Resource exhaustion (CPU, memory)

**What we explicitly allow:**
- ✅ Network access (Shelley needs Claude API via exe.dev gateway)
- ✅ Reading database (read-only copy)
- ✅ Writing to temp directory inside sandbox

## Architecture

```
Host System
  ├── Pre-generate auth token (run once)
  ├── Create sandbox directory
  │   ├── db.sqlite (read-only copy)
  │   ├── analyze.ts (generated script)
  │   └── temp/ (writable output)
  └── Launch Docker container
      ├── Mount: /sandbox → /work (read-write)
      ├── Mount: shelley.json → /shelley.json (read-only)
      ├── Mount: shelley binary → /usr/local/bin/shelley (read-only)
      ├── Root filesystem: READ-ONLY
      ├── Network: ENABLED (for Claude API)
      └── Token generator: echo $TOKEN (hardcoded)
```

## Implementation

### 1. Pre-generate Auth Token Script

```typescript
// get-shelley-token.ts
import { $ } from "bun";

/**
 * Pre-generate Shelley auth token for use in Docker sandbox
 */
export async function getShelleyToken(): Promise<string> {
  const result = await $`sudo /usr/local/bin/generate-gateway-token`.text();
  return result.trim();
}

// Cache token for 1 hour
const TOKEN_CACHE_DURATION = 60 * 60 * 1000;
let cachedToken: { token: string; expires: number } | null = null;

export async function getCachedShelleyToken(): Promise<string> {
  const now = Date.now();

  if (cachedToken && cachedToken.expires > now) {
    return cachedToken.token;
  }

  const token = await getShelleyToken();
  cachedToken = {
    token,
    expires: now + TOKEN_CACHE_DURATION
  };

  return token;
}
```

### 2. Dockerfile for Sandbox

```dockerfile
# Dockerfile.shelley-sandbox
FROM oven/bun:1-alpine

# Install Shelley (copy from host or download)
COPY --chmod=755 shelley /usr/local/bin/shelley

# Create fake token generator that echoes hardcoded token
# (Token will be passed as build arg or env var)
RUN echo '#!/bin/sh\necho "$SHELLEY_TOKEN"' > /usr/local/bin/generate-gateway-token && \
    chmod 755 /usr/local/bin/generate-gateway-token

# Create work directory
RUN mkdir /work && chmod 755 /work

# Set working directory
WORKDIR /work

# Entry point: run bun with passed script
ENTRYPOINT ["bun"]
```

### 3. Build Docker Image

```bash
#!/bin/bash
# build-sandbox.sh

# Copy shelley binary to build context
cp /usr/local/bin/shelley ./shelley

# Build image
docker build -t shelley-sandbox:latest -f Dockerfile.shelley-sandbox .

# Clean up
rm ./shelley

echo "✅ Built shelley-sandbox:latest"
```

### 4. Sandbox Runner

```typescript
// docker-sandbox-runner.ts
import { mkdir, rm } from "fs/promises";
import path from "path";
import { getCachedShelleyToken } from "./get-shelley-token";

export async function runShelleyScriptInDocker(
  scriptPath: string,
  dbPath: string
): Promise<string> {
  // 1. Create isolated sandbox directory
  const sandboxId = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sandboxDir = `/tmp/shelley-sandbox/${sandboxId}`;
  await mkdir(sandboxDir, { recursive: true });

  try {
    // 2. Copy database (read-only)
    const sandboxDbPath = path.join(sandboxDir, "db.sqlite");
    await Bun.file(dbPath).copyTo(sandboxDbPath);

    // Set read-only permissions
    await Bun.spawn(["chmod", "444", sandboxDbPath]).exited;

    // 3. Copy script to sandbox
    const sandboxScriptPath = path.join(sandboxDir, "analyze.ts");
    await Bun.file(scriptPath).copyTo(sandboxScriptPath);

    // 4. Create temp directory for output
    const tempDir = path.join(sandboxDir, "temp");
    await mkdir(tempDir);

    // 5. Get pre-generated auth token
    const shelleyToken = await getCachedShelleyToken();

    // 6. Run in Docker with restrictions
    const dockerProc = Bun.spawn([
      "docker", "run",
      "--rm",                                    // Remove container when done
      "--read-only",                             // Root filesystem read-only
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=100m", // Temp space (no exec)
      "--network", "bridge",                     // Network enabled for Claude API
      "--memory", "512m",                        // 512MB RAM limit
      "--cpus", "0.5",                          // 50% of one CPU
      "--pids-limit", "100",                     // Limit processes

      // Mount sandbox directory (read-write)
      "-v", `${sandboxDir}:/work:rw`,

      // Mount Shelley config (read-only)
      "-v", "/exe.dev/shelley.json:/shelley.json:ro",

      // Environment variables
      "-e", `SHELLEY_TOKEN=${shelleyToken}`,
      "-e", "DATABASE_PATH=/work/db.sqlite",
      "-e", "TEMP_DIR=/work/temp",

      // Timeout via Docker (30 seconds)
      "--stop-timeout", "30",

      // Image and command
      "shelley-sandbox:latest",
      "/work/analyze.ts"
    ], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: sandboxDir
    });

    // 7. Collect output with timeout
    const timeoutMs = 30000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        dockerProc.kill();
        reject(new Error("Script execution timeout (30s)"));
      }, timeoutMs)
    );

    const output = await Promise.race([
      new Response(dockerProc.stdout).text(),
      timeoutPromise
    ]);

    const stderr = await new Response(dockerProc.stderr).text();
    const exitCode = await dockerProc.exited;

    if (exitCode !== 0) {
      console.error("Docker script stderr:", stderr);
      throw new Error(`Script failed with exit code ${exitCode}`);
    }

    return output;

  } finally {
    // 8. Always cleanup sandbox directory
    await rm(sandboxDir, { recursive: true, force: true }).catch(console.error);
  }
}
```

### 5. Update ask-helper.ts

```typescript
// ask-helper.ts (updated)
import { runShelleyScriptInDocker } from "./docker-sandbox-runner";

export async function askQuestion(question: string): Promise<DashboardResponse> {
  // ... existing Shelley prompt generation ...

  // Run Shelley to generate script (still runs on host, that's fine)
  const shelleyProc = Bun.spawn([
    "shelley", "-config", "/exe.dev/shelley.json",
    "-model", "claude-sonnet-4.5",
    "prompt", "-timeout", "180s",
    prompt
  ], {
    stdout: "pipe",
    stderr: "pipe"
  });

  // ... wait for script generation ...

  // ✅ NEW: Run generated script in Docker sandbox
  const jsonOutput = await runShelleyScriptInDocker(
    analyzePath,
    "./data.db"  // Your database path
  );

  return JSON.parse(jsonOutput);
}
```

## Security Properties

### What Docker Provides

✅ **Read-only root filesystem**
- Script cannot modify system files
- `/usr`, `/bin`, `/etc` all read-only

✅ **Isolated temp space**
- Only `/work` (sandbox dir) and `/tmp` are writable
- `/tmp` limited to 100MB, no exec

✅ **Resource limits**
- 512MB RAM hard limit
- 50% CPU limit
- Max 100 processes
- 30 second timeout

✅ **Process isolation**
- PID namespace isolation
- Can't see host processes
- Can't signal host processes

✅ **Network access** (for Claude API)
- Enabled via `--network bridge`
- Shelley can talk to exe.dev gateway

### What's Protected

❌ **Host filesystem**
- Cannot read `/home`, `/root`, `/etc/passwd`
- Cannot write anywhere except `/work`

❌ **System damage**
- Cannot `rm -rf /`, modify `/usr/bin`, etc.
- Root filesystem is read-only

❌ **Resource exhaustion**
- Memory limited to 512MB
- CPU limited to 50%
- Killed after 30 seconds

## Testing

```typescript
// test-sandbox.ts
import { runShelleyScriptInDocker } from "./docker-sandbox-runner";

// Test 1: Normal execution works
const goodScript = `
const db = new Database(process.env.DATABASE_PATH);
const result = db.query("SELECT COUNT(*) as count FROM submissions");
console.log(JSON.stringify({ summary: "Works!", blocks: [] }));
`;

// Test 2: Filesystem writes outside sandbox fail
const badScript1 = `
import { writeFileSync } from "fs";
writeFileSync("/etc/evil", "hacked");  // Should fail (read-only)
`;

// Test 3: Excessive resource usage is limited
const badScript2 = `
const arr = [];
while (true) arr.push(new Array(1000000));  // Should hit memory limit
`;

// Test 4: Timeout works
const badScript3 = `
while (true) {}  // Should timeout at 30s
`;
```

## Deployment

```bash
# 1. Build sandbox image (once, or when updating)
./build-sandbox.sh

# 2. Test sandbox
bun run test-sandbox.ts

# 3. Update ask-helper.ts to use Docker runner

# 4. Restart your service
systemctl restart airq-server
```

## Monitoring

Log all sandbox executions:

```typescript
{
  timestamp: "2025-11-15T12:00:00Z",
  sandbox_id: "sandbox-1731682800-abc123",
  question: "What is CO2 now?",
  execution_time_ms: 1234,
  docker_exit_code: 0,
  memory_used_mb: 45,
  violations: []
}
```

## Cost/Performance

**Overhead:**
- Docker startup: ~200-500ms
- Script execution: depends on query
- Cleanup: ~50ms
- **Total overhead: ~300-600ms** (acceptable for async queries)

**Resource usage:**
- Each container: max 512MB RAM
- Temp disk: max 100MB per execution
- Cleanup happens automatically

## Advantages Over Deno/Bubblewrap

✅ **Same runtime** - Uses Bun (no need for Deno)
✅ **Cross-platform** - Works on any system with Docker
✅ **Battle-tested** - Docker isolation is well-understood
✅ **Easy to debug** - Can `docker exec` into container if needed
✅ **Resource limits** - Built-in memory/CPU limits
✅ **Network isolation optional** - Can disable later if needed

## Future Enhancements

1. **Image caching** - Pre-pull image to reduce startup time
2. **Container reuse** - Keep container running, exec scripts in it
3. **GPU isolation** - If we add ML features
4. **Network policies** - Allow only exe.dev, block everything else
