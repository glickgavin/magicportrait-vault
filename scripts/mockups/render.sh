#!/bin/bash
# Studio preview templates for the shop (docs/shop.md › Studio templates).
#   BLENDER_PY=<python with bpy> scripts/mockups/render.sh <out dir> <res> <samples> [products...]
# Renders each product three times (base, gloss, mask), builds its background, overlay and template,
# and draws a check preview with a made-up picture through lib/shop/preview.ts.
# Names starting room- are the furnished rooms in rooms.py (scanned furniture from MOCKUP_ASSETS, see fetch_assets.sh).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
OUT=$1; RES=${2:-1200}; SPP=${3:-64}; shift 3 || true
PY=${BLENDER_PY:-python3}
ALL="acrylic-block acrylic-square-block magic-poster acrylic-print acrylic-glass-art masterpiece magic-portrait-tile magic-pillow magic-mug magic-xmas-ornaments magic-puzzle"
LIST=${*:-$ALL}
declare -A ASPECT=( [room-pillow-sofa]=1x1 [room-masterpiece-sideboard]=2x3 [room-masterpiece-sofa]=2x3 [room-puzzle-table]=3x4 [room-block-sideboard]=5x7 [room-block-desk]=5x7 [acrylic-block]=5x7 [acrylic-square-block]=1x1 [magic-poster]=3x4 [acrylic-print]=3x4 [acrylic-glass-art]=2x3 [masterpiece]=2x3 [magic-portrait-tile]=1x1 [magic-pillow]=1x1 [magic-mug]=1x1 [magic-xmas-ornaments]=1x1 [magic-puzzle]=4x3 )
mkdir -p "$OUT/renders" "$OUT/assets" "$OUT/previews"
for p in $LIST; do
  for pass in base gloss mask; do
    S=$SPP; [ "$pass" = gloss ] && S=$(( SPP / 2 )); [ "$pass" = mask ] && S=24
    case "$p:$pass" in room-pillow-*:gloss) S=8;; esac  # a linen face has no shine: the gloss pass only needs to be black
    SCRIPT="$HERE/scenes.py"; case "$p" in room-*) SCRIPT="$HERE/rooms.py";; esac
    "$PY" "$SCRIPT" "$p" "$pass" "$RES" "$S" "$OUT/renders/$p-$pass.png" > "$OUT/renders/$p-$pass.log" 2>&1
  done
  python3 "$HERE/build_assets.py" "$OUT/renders" "$p" "$OUT/assets"
done
ESBUILD=$(ls -d "$REPO"/node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild | head -1)
"$ESBUILD" "$HERE/preview_test.ts" --bundle --platform=node --format=esm --outfile="$HERE/.preview_test.mjs" --log-level=warning
ITEMS=""; for p in $LIST; do ITEMS="$ITEMS $p:${ASPECT[$p]}"; done
node "$HERE/.preview_test.mjs" "$OUT/assets" "$OUT/previews" "${PIC:-$REPO/public/fixtures/portraits/pet-1.jpg}" "$RES" $ITEMS
