# Bubblewrap Sandbox for Shelley Scripts

## What is Bubblewrap?

Bubblewrap (`bwrap`) is a lightweight setuid sandbox tool that wraps Linux namespaces. It's what Flatpak uses under the hood.

**Key features:**
- Creates isolated filesystem view using bind mounts
- Can make any directory read-only or read-write
- Shares or isolates network as needed
- No daemon required (unlike Docker)
- ~10-50ms startup overhead (vs Docker's ~500ms)
- Used in production by Flatpak, GNOME

## How It Works

```bash
bwrap \
  # Mount system directories (read-only)
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin \

  # Mount sandbox directory (read-write)
  --bind /tmp/sandbox-12345 /work \

  # Mount DB as read-only
  --ro-bind /path/to/data.db /work/db.sqlite \

  # Mount Shelley and config (read-only)
  --ro-bind /usr/local/bin/shelley /usr/local/bin/shelley \
  --ro-bind /exe.dev/shelley.json /shelley.json \

  # Provide /dev, /proc, /tmp
  --dev-bind /dev /dev \
  --proc /proc \
  --tmpfs /tmp \

  # Network access (shared with host)
  --share-net \

  # Security
  --die-with-parent \    # Kill if parent dies
  --new-session \        # New session ID
  --unshare-user \       # User namespace (no real root)

  # Run the command
  ~/.bun/bin/bun /work/analyze.ts
```

**What the script sees:**
- `/work/` - Writable sandbox directory
- `/work/db.sqlite` - Read-only database
- `/usr`, `/lib`, etc. - Read-only system files
- Network access via `--share-net`
- Can't write to system directories
- Can't see host `/home`, `/root`, `/etc` (except what's mounted)

## Installation

```bash
# Ubuntu/Debian
sudo apt install bubblewrap

# Check version
bwrap --version
```

## Implementation

### 1. Core Sandbox Runner

```typescript
// bubblewrap-sandbox.ts
import { mkdir, rm, chmod } from "fs/promises";
import path from "path";

export interface SandboxOptions {
  scriptPath: string;
  dbPath: string;
  timeoutMs?: number;
}

export async function runInBubblewrap(options: SandboxOptions): Promise<string> {
  const { scriptPath, dbPath, timeoutMs = 30000 } = options;

  // 1. Create isolated sandbox directory
  const sandboxId = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sandboxDir = `/tmp/shelley-sandbox/${sandboxId}`;
  await mkdir(sandboxDir, { recursive: true });

  try {
    // 2. Copy script to sandbox
    const sandboxScript = path.join(sandboxDir, "analyze.ts");
    await Bun.file(scriptPath).copyTo(sandboxScript);

    // 3. Copy database (read-only)
    const sandboxDb = path.join(sandboxDir, "db.sqlite");
    await Bun.file(dbPath).copyTo(sandboxDb);
    await chmod(sandboxDb, 0o444); // Read-only

    // 4. Create temp directory for script output
    const tempDir = path.join(sandboxDir, "temp");
    await mkdir(tempDir);

    // 5. Generate fresh Shelley token
    const token = await getShelleyToken();

    // 6. Find bun binary
    const bunPath = `${process.env.HOME}/.bun/bin/bun`;

    // 7. Build bwrap command
    const bwrapArgs = [
      // System directories (read-only)
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/lib", "/lib",
      "--ro-bind", "/lib64", "/lib64",
      "--ro-bind", "/bin", "/bin",

      // Sandbox directory (read-write)
      "--bind", sandboxDir, "/work",

      // Shelley and config (read-only)
      "--ro-bind", "/usr/local/bin/shelley", "/usr/local/bin/shelley",
      "--ro-bind", "/exe.dev/shelley.json", "/shelley.json",

      // System necessities
      "--dev-bind", "/dev", "/dev",
      "--proc", "/proc",
      "--tmpfs", "/tmp",

      // Network (needed for Shelley → Claude)
      "--share-net",

      // Security
      "--die-with-parent",
      "--new-session",
      "--unshare-user",
      "--unshare-pid",

      // Set working directory
      "--chdir", "/work",

      // Command to run
      bunPath,
      "/work/analyze.ts"
    ];

    console.log(`🔒 Running in bubblewrap sandbox: ${sandboxId}`);

    // 8. Run with timeout
    const proc = Bun.spawn(["bwrap", ...bwrapArgs], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        // Minimal environment
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: "/tmp",
        SHELLEY_TOKEN: token,
        DATABASE_PATH: "/work/db.sqlite",
        TEMP_DIR: "/work/temp"
      }
    });

    // Timeout handling
    const timeoutHandle = setTimeout(() => {
      console.log(`⏱️ Timeout reached (${timeoutMs}ms), killing process`);
      proc.kill();
    }, timeoutMs);

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);

    clearTimeout(timeoutHandle);

    if (exitCode !== 0) {
      console.error("Sandbox stderr:", stderr);
      throw new Error(`Script failed with exit code ${exitCode}`);
    }

    console.log(`✅ Sandbox completed: ${exitCode}`);
    return stdout;

  } finally {
    // 9. Always cleanup
    await rm(sandboxDir, { recursive: true, force: true }).catch(console.error);
  }
}

async function getShelleyToken(): Promise<string> {
  const proc = Bun.spawn(["sudo", "/usr/local/bin/generate-gateway-token"], {
    stdout: "pipe"
  });
  const token = await new Response(proc.stdout).text();
  return token.trim();
}
```

### 2. Integration with ask-helper.ts

```typescript
// In ask-helper.ts
import { runInBubblewrap } from "./bubblewrap-sandbox";

export async function askQuestion(question: string): Promise<DashboardResponse> {
  // ... generate script with Shelley ...

  // Run in sandbox instead of directly
  const jsonOutput = await runInBubblewrap({
    scriptPath: analyzePath,
    dbPath: "./data.db",
    timeoutMs: 30000
  });

  return JSON.parse(jsonOutput);
}
```

## Resource Limits with systemd-run

Bubblewrap doesn't have built-in CPU/memory limits, but you can combine it with `systemd-run`:

```typescript
// Optional: Add resource limits
const systemdArgs = [
  "systemd-run",
  "--user",           // User session
  "--scope",          // Create transient scope
  "--quiet",
  "-p", "MemoryMax=512M",      // 512MB RAM limit
  "-p", "CPUQuota=50%",        // 50% CPU limit
  "--",
  "bwrap",
  ...bwrapArgs
];

const proc = Bun.spawn(systemdArgs, { ... });
```

Or use `ulimit`:

```typescript
const proc = Bun.spawn(["bwrap", ...bwrapArgs], {
  env: { ...env },
  // This doesn't work directly in Bun.spawn, but you can wrap:
  // bash -c "ulimit -v 524288 && bwrap ..."
});
```

## What Gets Isolated

### Filesystem

```
Inside sandbox:
  /usr → Host /usr (read-only)
  /lib → Host /lib (read-only)
  /work → /tmp/sandbox-xyz (read-write)
  /work/db.sqlite → Read-only copy
  /tmp → tmpfs (isolated)

  CANNOT access:
    - Host /home
    - Host /root
    - Host /etc (except what's explicitly mounted)
    - Any file outside mounted paths
```

### Processes

```
--unshare-pid creates new PID namespace
Script sees:
  - Only its own processes
  - Cannot see host processes
  - Cannot kill host processes
  - PID 1 inside sandbox is the script itself
```

### Network

```
--share-net keeps host network stack
Script can:
  ✅ Access exe.dev (for Shelley → Claude)
  ✅ Make any network connection

To block network: use --unshare-net instead
```

### User

```
--unshare-user creates user namespace
Script runs as UID 0 inside sandbox, but:
  - Has no real root privileges
  - Cannot access host files outside mounts
  - Cannot escalate privileges
```

## Testing the Sandbox

```typescript
// test-bubblewrap.ts

// Test 1: Normal execution
await testNormalExecution();

// Test 2: Cannot write outside sandbox
await testFilesystemIsolation();

// Test 3: Cannot read /etc/shadow
await testSecretAccess();

// Test 4: Network works
await testNetworkAccess();

// Test 5: Timeout works
await testTimeout();

async function testFilesystemIsolation() {
  const script = `
import { writeFileSync } from "fs";
try {
  writeFileSync("/etc/evil", "hacked");
  console.log("FAIL: Wrote to /etc");
} catch (e) {
  console.log("PASS: Cannot write to /etc");
}
`;
  await Bun.write("/tmp/test-script.ts", script);
  const result = await runInBubblewrap({
    scriptPath: "/tmp/test-script.ts",
    dbPath: "./data.db"
  });
  console.assert(result.includes("PASS"), "Filesystem isolation failed!");
}

async function testSecretAccess() {
  const script = `
import { readFileSync } from "fs";
try {
  const shadow = readFileSync("/etc/shadow", "utf-8");
  console.log("FAIL: Read /etc/shadow");
} catch (e) {
  console.log("PASS: Cannot read /etc/shadow");
}
`;
  await Bun.write("/tmp/test-script.ts", script);
  const result = await runInBubblewrap({
    scriptPath: "/tmp/test-script.ts",
    dbPath: "./data.db"
  });
  console.assert(result.includes("PASS"), "Secret access failed!");
}
```

## Comparison: Bubblewrap vs Docker

| Feature | Bubblewrap | Docker |
|---------|-----------|--------|
| Startup time | ~10-50ms | ~500ms |
| Memory overhead | ~5MB | ~50MB |
| Daemon required | No | Yes |
| Resource limits | Via systemd-run | Built-in |
| Cross-platform | No (Linux only) | Yes |
| Complexity | Low | Medium |
| Isolation strength | Strong | Very strong |
| Network control | Simple flags | Full control |

## Installation & Setup

```bash
# Install
sudo apt install bubblewrap

# Optional: systemd for resource limits
# (Usually already installed)

# Test it works
bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --proc /proc \
  --dev /dev \
  --tmpfs /tmp \
  --unshare-user \
  --new-session \
  /bin/echo "Hello from sandbox"
```

## Advantages for Your Use Case

1. **No Docker daemon** - One less service to manage
2. **Fast** - 10-50ms overhead vs Docker's 500ms
3. **Simple** - Just mount what you need
4. **Battle-tested** - Used by Flatpak in production
5. **Network easy** - Just `--share-net` for Shelley access
6. **Cleanup automatic** - No containers to prune

## Recommended Approach

```typescript
// Production usage:
export async function runShelleyScript(
  scriptPath: string
): Promise<DashboardResponse> {

  const output = await runInBubblewrap({
    scriptPath,
    dbPath: process.env.DATABASE_PATH || "./data.db",
    timeoutMs: 30000
  });

  return JSON.parse(output);
}
```

## Want to try it?

1. Install: `sudo apt install bubblewrap`
2. Test basic isolation:
   ```bash
   bwrap --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
     --proc /proc --dev /dev --tmpfs /tmp --unshare-user \
     /bin/ls /tmp  # Should be empty
   ```
3. Test with Shelley:
   ```bash
   bwrap --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
     --ro-bind /usr/local/bin/shelley /usr/local/bin/shelley \
     --ro-bind /exe.dev/shelley.json /shelley.json \
     --proc /proc --dev /dev --tmpfs /tmp --share-net --unshare-user \
     --setenv SHELLEY_TOKEN "$(sudo /usr/local/bin/generate-gateway-token)" \
     /usr/local/bin/shelley -config /shelley.json whoami
   ```

If those work, I can implement the full TypeScript wrapper.
