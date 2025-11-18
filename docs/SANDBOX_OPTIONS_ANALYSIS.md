# Sandbox Options Analysis

## Goal
Execute AI-generated TypeScript scripts safely:
- ✅ Allow network access (needed for Shelley → Claude API)
- ✅ Allow reading database (read-only copy)
- ❌ Prevent filesystem damage outside sandbox
- ❌ Prevent resource exhaustion

## Current Execution Model

```typescript
// What we do now (UNSAFE):
const analyzeProc = Bun.spawn([bun, "analyze.ts"], {
  cwd: tempDir,
  env: process.env  // Has all secrets!
});
// Script can: delete files, read /etc/passwd, exhaust CPU, etc.
```

## Option 1: chroot (Simplest)

### How it works
```bash
# Create minimal root
mkdir -p /tmp/sandbox/bin /tmp/sandbox/lib /tmp/sandbox/work
cp -r /lib/* /tmp/sandbox/lib/
cp ~/.bun/bin/bun /tmp/sandbox/bin/

# chroot and run
sudo chroot /tmp/sandbox /bin/bun /work/analyze.ts
```

### Pros
- ✅ Very simple, no Docker needed
- ✅ Fast (no container overhead)
- ✅ Script sees `/` as sandbox root, can't escape
- ✅ Low resource overhead

### Cons
- ❌ Requires sudo/root
- ❌ Doesn't isolate processes (can see/kill host processes)
- ❌ Doesn't limit resources (CPU, memory)
- ❌ Shares kernel with host
- ❌ Network namespacing not automatic
- ❌ Need to copy all dependencies

### Verdict
**Not recommended** - too weak, requires root, no resource limits

---

## Option 2: unshare + bind mounts (Linux namespaces)

### How it works
```bash
unshare --user --mount --pid --net --fork --map-root-user \
  bash -c "
    mount --bind /tmp/sandbox /tmp/sandbox
    mount --bind -o ro /path/to/db.sqlite /tmp/sandbox/db.sqlite
    cd /tmp/sandbox
    bun analyze.ts
  "
```

### Pros
- ✅ No root needed (user namespaces)
- ✅ Process isolation (PID namespace)
- ✅ Network isolation possible
- ✅ Fast, native Linux feature
- ✅ Can combine with overlay filesystem

### Cons
- ❌ Linux-only
- ❌ Complex to set up correctly
- ❌ No built-in resource limits (need separate cgroups)
- ❌ Tricky to get bind mounts right
- ❌ Need to handle network namespace carefully (if allowing network)

### Verdict
**Possible but complex** - good isolation, but manual resource management

---

## Option 3: Bubblewrap (namespace wrapper)

Bubblewrap is a setuid wrapper around Linux namespaces, designed for sandboxing.

### How it works
```bash
bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin \
  --bind /tmp/sandbox /work \
  --ro-bind /path/to/db.sqlite /work/db.sqlite \
  --dev-bind /dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --share-net \
  --die-with-parent \
  --new-session \
  ~/.bun/bin/bun /work/analyze.ts
```

### Pros
- ✅ Strong filesystem isolation
- ✅ No need to copy system files (ro-bind)
- ✅ Network can be shared (--share-net) or isolated
- ✅ Dies with parent process
- ✅ Relatively simple to use
- ✅ Used by Flatpak, battle-tested

### Cons
- ❌ Linux-only
- ❌ Still need separate tooling for resource limits (ulimit, systemd-run)
- ❌ Need to install bubblewrap package
- ❌ Complex bind mount setup

### Verdict
**Good option** - If Linux-only is acceptable, this is clean

---

## Option 4: Docker with base image (No custom build)

### How it works
```typescript
docker run --rm \
  --read-only \                          // Root FS read-only
  --tmpfs /tmp \                         // Temp space
  --network bridge \                     // Network enabled
  --memory 512m --cpus 0.5 \            // Resource limits
  -v /tmp/sandbox:/work:rw \            // Sandbox dir
  -v /path/to/db.sqlite:/work/db.sqlite:ro \
  -v ~/.bun/bin/bun:/usr/local/bin/bun:ro \
  -v /exe.dev/shelley.json:/shelley.json:ro \
  -v /usr/local/bin/shelley:/usr/local/bin/shelley:ro \
  -e SHELLEY_TOKEN="$(sudo generate-gateway-token)" \
  ubuntu:22.04 \
  /usr/local/bin/bun /work/analyze.ts
```

### Pros
- ✅ No custom Docker build needed
- ✅ Strong isolation (containers)
- ✅ Built-in resource limits
- ✅ Read-only root filesystem
- ✅ Network enabled for Shelley
- ✅ Cross-platform (works on macOS too)
- ✅ Token generated fresh each run

### Cons
- ❌ ~500ms startup overhead per execution
- ❌ Requires Docker daemon running
- ❌ More complex than bubblewrap
- ❌ Need to mount multiple files/dirs

### Verdict
**Best balance** - Strong isolation, built-in limits, no custom build

---

## Option 5: OverlayFS + chroot/namespace

### How it works
```bash
# Create overlay
mkdir -p /tmp/sandbox/{lower,upper,work,merged}
mount -t overlay overlay \
  -o lowerdir=/,upperdir=/tmp/sandbox/upper,workdir=/tmp/sandbox/work \
  /tmp/sandbox/merged

# Run in overlay
unshare --user --mount --pid \
  chroot /tmp/sandbox/merged /usr/bin/bun /work/analyze.ts

# Cleanup - all writes went to upper, lower is unchanged
umount /tmp/sandbox/merged
rm -rf /tmp/sandbox
```

### Pros
- ✅ Perfect copy-on-write - entire filesystem available
- ✅ All writes go to upper layer (temp)
- ✅ Original system completely unchanged
- ✅ No need to copy files or bind mount

### Cons
- ❌ Requires root for mount (or user namespaces)
- ❌ Still need separate resource limits
- ❌ Cleanup can be tricky if mounts fail
- ❌ Complexity of managing layers

### Verdict
**Elegant but complex** - Great isolation, but mount management is tricky

---

## Comparison Matrix

| Feature | chroot | unshare | bubblewrap | Docker | OverlayFS |
|---------|--------|---------|------------|--------|-----------|
| No root needed | ❌ | ✅ | ✅ | ⚠️* | ❌ |
| Filesystem isolation | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Process isolation | ❌ | ✅ | ✅ | ✅ | ⚠️ |
| Resource limits | ❌ | ❌ | ❌ | ✅ | ❌ |
| Network control | ❌ | ✅ | ✅ | ✅ | ⚠️ |
| Cross-platform | ⚠️ | ❌ | ❌ | ✅ | ❌ |
| Setup complexity | Low | High | Med | Med | High |
| Startup overhead | ~0ms | ~10ms | ~10ms | ~500ms | ~50ms |
| Maintenance | Low | High | Low | Med | Med |

\* Docker daemon typically needs root, but rootless mode exists

---

## Recommended Approach

### Primary: Docker (No Custom Build)

**Why:**
1. Built-in resource limits (memory, CPU)
2. Strong isolation without complexity
3. Works cross-platform
4. No custom build - just mount what you need
5. Battle-tested, well-understood

**Implementation:**
```typescript
async function runInDockerSandbox(scriptPath: string, dbPath: string) {
  // 1. Generate token fresh (short-lived)
  const token = await getShelleyToken();

  // 2. Create temp sandbox dir
  const sandboxDir = `/tmp/sandbox-${Date.now()}`;
  await mkdir(sandboxDir);

  // 3. Copy script and DB
  await Bun.file(scriptPath).copyTo(`${sandboxDir}/analyze.ts`);
  await Bun.file(dbPath).copyTo(`${sandboxDir}/db.sqlite`);
  await Bun.spawn(["chmod", "444", `${sandboxDir}/db.sqlite`]).exited;

  // 4. Run in Docker (no custom image!)
  const proc = Bun.spawn([
    "docker", "run", "--rm",
    "--read-only",
    "--tmpfs", "/tmp",
    "--network", "bridge",
    "--memory", "512m",
    "--cpus", "0.5",
    "-v", `${sandboxDir}:/work:rw`,
    "-v", `${bunPath}:/usr/local/bin/bun:ro`,
    "-v", "/exe.dev/shelley.json:/shelley.json:ro`,
    "-v", "/usr/local/bin/shelley:/usr/local/bin/shelley:ro`,
    "-e", `SHELLEY_TOKEN=${token}`,
    "-w", "/work",
    "ubuntu:22.04",
    "/usr/local/bin/bun", "/work/analyze.ts"
  ], { stdout: "pipe", stderr: "pipe" });

  const output = await new Response(proc.stdout).text();
  await rm(sandboxDir, { recursive: true });
  return output;
}
```

### Fallback: Bubblewrap (Linux-only)

If Docker isn't available, use bubblewrap for Linux systems:

```typescript
async function runInBubblewrapSandbox(scriptPath: string, dbPath: string) {
  const token = await getShelleyToken();
  const sandboxDir = `/tmp/sandbox-${Date.now()}`;

  const proc = Bun.spawn([
    "bwrap",
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--bind", sandboxDir, "/work",
    "--ro-bind", dbPath, "/work/db.sqlite",
    "--ro-bind", "/exe.dev/shelley.json", "/shelley.json",
    "--share-net",
    "--die-with-parent",
    "--new-session",
    bunPath, scriptPath
  ], {
    env: { SHELLEY_TOKEN: token },
    stdout: "pipe"
  });

  return await new Response(proc.stdout).text();
}
```

---

## Questions to Decide

1. **Is ~500ms Docker overhead acceptable?**
   - If yes → Docker is cleanest
   - If no → Bubblewrap (Linux) or accept less isolation

2. **Do you need cross-platform support?**
   - If yes → Docker only option
   - If no → Bubblewrap is simpler

3. **Is Docker daemon already running?**
   - If yes → Docker has no extra cost
   - If no → Need to start it (or use bubblewrap)

4. **Do you trust AI not to be actively malicious?**
   - If yes → Lighter sandbox (bubblewrap) may suffice
   - If no → Need strongest isolation (Docker)

---

## My Recommendation

**Go with Docker + base ubuntu image:**

1. Mount what you need (no custom build)
2. Generate token fresh each run (pass as env var)
3. Use read-only root FS
4. Built-in resource limits
5. Clean, well-understood, battle-tested

The 500ms overhead is negligible for async "ask" queries, and you get maximum isolation with minimum complexity.

**Prototype:**
```bash
# Test it works:
docker run --rm \
  -v ~/.bun/bin/bun:/usr/local/bin/bun:ro \
  -v /usr/local/bin/shelley:/usr/local/bin/shelley:ro \
  -v /exe.dev/shelley.json:/shelley.json:ro \
  -e SHELLEY_TOKEN="$(sudo /usr/local/bin/generate-gateway-token)" \
  --network bridge \
  ubuntu:22.04 \
  /usr/local/bin/shelley -config /shelley.json whoami
```

If that works, we can build the TypeScript wrapper around it.

**Want to try the prototype first?**
