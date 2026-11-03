#!/usr/bin/env bash
# Builds (unless --no-build) and starts the production server on :3100 for e2e (stable, unlike dev mode).
cd "$(dirname "$0")/.."
PIDF=/tmp/vault-dev.pid
if [ -f "$PIDF" ]; then kill "$(cat "$PIDF")" 2>/dev/null || true; fi
# Free the port even if another server (e.g. a dev server) holds it.
for p in $(ps -eo pid,args | grep -E "next (dev|start) -p 3100|next-server" | grep -v grep | awk '{print $1}'); do kill "$p" 2>/dev/null || true; done
sleep 1
node scripts/local-env.mjs 3100 > .env.local
if [ "${1:-}" != "--no-build" ]; then pnpm build > /tmp/vault-build.log 2>&1 || { tail -40 /tmp/vault-build.log; exit 1; }; fi
nohup pnpm start -p 3100 > /tmp/vault-dev.log 2>&1 &
echo $! > "$PIDF"
for _ in $(seq 1 60); do curl -sf localhost:3100/api/health >/dev/null && { echo "prod server up"; exit 0; }; sleep 1; done
echo "server failed"; tail -30 /tmp/vault-dev.log; exit 1
