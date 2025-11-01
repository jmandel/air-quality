#!/bin/bash

# Start bun with watch in the background
/home/exedev/.bun/bin/bun --watch index.ts &

# Watch for changes to sync.tsx and index.html in a loop
# When detected, touch index.ts to trigger bun's reload
while inotifywait -q -e modify,create,delete ~/app/sync.tsx ~/app/index.html 2>/dev/null; do
    echo "🔄 Detected change, triggering reload..."
    touch ~/app/index.ts
    sleep 0.5
done
