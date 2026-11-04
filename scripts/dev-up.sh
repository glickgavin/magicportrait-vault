#!/usr/bin/env bash
# Brings up the local build environment (cloud session): Docker, the local Supabase stack, .env.local.
set -euo pipefail
cd "$(dirname "$0")/.."
if ! docker info >/dev/null 2>&1; then
  (dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi
ok=0
for attempt in 1 2 3; do
  if pnpm exec supabase start --exclude imgproxy,vector,logflare,studio,realtime,edge-runtime,supavisor,postgres-meta >/tmp/supabase-start.log 2>&1; then ok=1; break; fi
  sleep 15
done
[ "$ok" = 1 ] || { tail -20 /tmp/supabase-start.log; exit 1; }
node scripts/local-env.mjs 3100 > .env.local
echo "local stack up; .env.local written"
