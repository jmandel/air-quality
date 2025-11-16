#!/bin/bash
# Test 3: Run Shelley inside bubblewrap

echo "=== Test: Shelley in sandbox ==="

# Get a fresh token
TOKEN=$(sudo /usr/local/bin/generate-gateway-token)
echo "Got token: ${TOKEN:0:20}..."

# Create custom config with embedded token
mkdir -p /tmp/sandbox-work
cat > /tmp/sandbox-work/shelley-config.json << CONFIG
{
  "gateway": {
    "url": "https://exe.dev/gateway",
    "getToken": "echo '$TOKEN'"
  }
}
CONFIG

# Test simple shelley command
echo ""
echo "--- Running: shelley whoami ---"
bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin \
  --ro-bind /sbin /sbin \
  --ro-bind /tmp/sandbox-work /work \
  --dev-bind /dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --share-net \
  --die-with-parent \
  /usr/local/bin/shelley -config /work/shelley-config.json whoami 2>&1

echo ""
echo "Exit code: $?"

rm -rf /tmp/sandbox-work
