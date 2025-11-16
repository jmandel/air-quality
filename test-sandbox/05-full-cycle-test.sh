#!/bin/bash
# Test 5: Full cycle - Shelley generates script, script accesses DB

echo "=== Test: Full cycle with DB access ==="

# Get a fresh token
TOKEN=$(sudo /usr/local/bin/generate-gateway-token)
echo "Got token: ${TOKEN:0:20}..."

# Create work dir
mkdir -p /tmp/sandbox-work

# Copy database (read-only)
cp /home/exedev/app/db.sqlite /tmp/sandbox-work/db.sqlite
chmod 444 /tmp/sandbox-work/db.sqlite

# Create custom config
cat > /tmp/sandbox-work/shelley-config.json << CONFIG
{
  "default_model": "claude-sonnet-4.5",
  "llm_gateway": "https://exe.dev",
  "key_generator": "echo '$TOKEN'"
}
CONFIG

# Create the prompt for Shelley
PROMPT="Write a TypeScript script called analyze.ts that:
1. Imports Database from 'bun:sqlite'
2. Opens /work/db.sqlite
3. Queries: SELECT COUNT(*) as count FROM sensors
4. Outputs JSON: {\"sensor_count\": <number>}
5. Use console.log() for the JSON output only"

echo ""
echo "--- Step 1: Generate script with Shelley ---"
timeout 60 bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin \
  --ro-bind /sbin /sbin \
  --ro-bind /etc/resolv.conf /etc/resolv.conf \
  --ro-bind /etc/ssl /etc/ssl \
  --ro-bind /etc/ca-certificates /etc/ca-certificates \
  --bind /tmp/sandbox-work /work \
  --dev-bind /dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --share-net \
  --die-with-parent \
  --chdir /work \
  /usr/local/bin/shelley -config /work/shelley-config.json prompt "$PROMPT" 2>&1 | grep -v "^time=" | head -30

# Check if analyze.ts was created
if [ -f /tmp/sandbox-work/analyze.ts ]; then
  echo ""
  echo "--- Generated script: ---"
  cat /tmp/sandbox-work/analyze.ts
  
  echo ""
  echo "--- Step 2: Run generated script in sandbox ---"
  
  BUN_DIR="$HOME/.bun"
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
    /bun/bin/bun /work/analyze.ts 2>&1
else
  echo "ERROR: analyze.ts not created"
fi

rm -rf /tmp/sandbox-work
