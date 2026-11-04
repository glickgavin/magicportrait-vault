#!/usr/bin/env bash
# Starts (or restarts) the dev server on :3100 in the background for e2e and screenshots.
cd "$(dirname "$0")/.."
PIDF=/tmp/vault-dev.pid
if [ -f "$PIDF" ]; then kill "$(cat "$PIDF")" 2>/dev/null || true; fi
for p in $(ps -eo pid,args | grep -E "next (dev|start) -p 3100|next-server" | grep -v grep | awk '{print $1}'); do kill "$p" 2>/dev/null || true; done
sleep 1
nohup pnpm dev -p 3100 > /tmp/vault-dev.log 2>&1 &
echo $! > "$PIDF"
for _ in $(seq 1 90); do curl -sf localhost:3100/api/health >/dev/null && { echo "dev server up"; exit 0; }; sleep 1; done
echo "dev server failed"; tail -30 /tmp/vault-dev.log; exit 1
