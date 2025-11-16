#!/bin/bash
# Test 1: Basic bubblewrap execution

echo "=== Test 1: Basic echo in sandbox ==="
bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin \
  --proc /proc \
  --dev /dev \
  --tmpfs /tmp \
  --unshare-user \
  --new-session \
  --die-with-parent \
  /bin/echo "Hello from sandbox"

echo ""
echo "=== Test 2: Check /tmp is isolated ==="
touch /tmp/host-file
bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin \
  --proc /proc \
  --dev /dev \
  --tmpfs /tmp \
  --unshare-user \
  /bin/ls /tmp
echo "Should be empty (isolated tmpfs)"

echo ""
echo "=== Test 3: Check filesystem isolation ==="
bwrap \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin \
  --proc /proc \
  --dev /dev \
  --tmpfs /tmp \
  --unshare-user \
  /bin/bash -c "ls /home 2>&1 || echo '/home not visible - GOOD'"

rm /tmp/host-file
