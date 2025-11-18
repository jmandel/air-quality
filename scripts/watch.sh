#!/bin/bash
# Watch script that restarts bun when any TypeScript/TSX/HTML files change

cd "$(dirname "$0")/.." || exit 1

exec /home/exedev/.bun/bin/bun --watch src/index.ts
