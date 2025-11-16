#!/bin/bash
# Test 4: Shelley prompt inside bubblewrap

echo "=== Test: Shelley prompt in sandbox ==="

# Get a fresh token
TOKEN=$(sudo /usr/local/bin/generate-gateway-token)
echo "Got token: ${TOKEN:0:20}..."

# Create custom config matching real setup
mkdir -p /tmp/sandbox-work
cat > /tmp/sandbox-work/shelley-config.json << CONFIG
{
  "default_model": "claude-sonnet-4.5",
  "llm_gateway": "https://exe.dev",
  "key_generator": "echo '$TOKEN'"
}
CONFIG

# Test simple prompt
echo ""
echo "--- Running: shelley prompt (test) ---"
timeout 30 bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin \
  --ro-bind /sbin /sbin \
  --ro-bind /etc/resolv.conf /etc/resolv.conf \
  --ro-bind /etc/ssl /etc/ssl \
  --ro-bind /etc/ca-certificates /etc/ca-certificates \
  --ro-bind /tmp/sandbox-work /work \
  --dev-bind /dev /dev \
  --proc /proc \
  --tmpfs /tmp \
  --share-net \
  --die-with-parent \
  /usr/local/bin/shelley -config /work/shelley-config.json prompt "Write a TypeScript one-liner that outputs 'hello sandbox'" 2>&1 | grep -E "(👤|🤖|console\.log)"

echo ""
echo "Exit code: $?"

rm -rf /tmp/sandbox-work
