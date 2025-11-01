#!/bin/bash
# Watch script that restarts bun when any TypeScript/TSX/HTML files change

exec /home/exedev/.bun/bin/bun --watch index.ts
