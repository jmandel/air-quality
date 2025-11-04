#!/bin/bash

# Start bun with watch in the background
/home/exedev/.bun/bin/bun --watch index.ts &

# Watch for changes to frontend assets in a loop
# When detected, touch index.ts to trigger bun's reload
while inotifywait -q -e modify,create,delete \
    ~/app/index.html \
    ~/app/upload.html \
    ~/app/viewer.ts \
    ~/app/uploader.ts 2>/dev/null; do
    echo "🔄 Detected change, triggering reload..."
    touch ~/app/index.ts
    sleep 0.5
done
