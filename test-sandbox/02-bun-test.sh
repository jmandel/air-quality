#!/bin/bash
# Test 2: Run Bun inside bubblewrap

echo "=== Test: Simple Bun script in sandbox ==="

# Create work dir first
mkdir -p /tmp/sandbox-work

# Create test script IN the work dir
cat > /tmp/sandbox-work/script.ts << 'SCRIPT'
console.log("Hello from Bun in sandbox!");
console.log("Process ID:", process.pid);
console.log("Working directory:", process.cwd());
SCRIPT

# Find bun
BUN_DIR="$HOME/.bun"

# Run in sandbox with /proc
bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin \
  --ro-bind /sbin /sbin \
  --ro-bind "$BUN_DIR" /bun \
  --bind /tmp/sandbox-work /work \
  --dev-bind /dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --die-with-parent \
  --chdir /work \
  /bun/bin/bun /work/script.ts 2>&1

echo "Exit code: $?"

rm -rf /tmp/sandbox-work
