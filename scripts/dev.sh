#!/bin/bash

# Start bun with watch in the background
BUN=/home/exedev/.bun/bin/bun
APP_DIR=/home/exedev/app

$BUN --watch "$APP_DIR/src/index.ts" &

# Watch for changes to frontend assets in a loop
# When detected, touch the entrypoint to trigger bun's reload
while inotifywait -q -r -e modify,create,delete "$APP_DIR/src" 2>/dev/null; do
    echo "🔄 Detected change, triggering reload..."
    touch "$APP_DIR/src/index.ts"
    sleep 0.5
done
