#!/bin/bash
# Development mode with auto-reload
cd /home/exedev/app
exec ~/.bun/bin/bun --watch src/index.ts
