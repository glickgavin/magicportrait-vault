#!/bin/bash
# Draws every room template with every sample picture, through the shop's own preview routine.
#   scripts/mockups/room_gallery.sh <render.sh out dir> <out dir> <width> [pictures...]
# Pictures default to public/shop-samples/scenes/*.jpg. Writes <out>/<picture>/<room>.jpg.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
SRC=$1; OUT=$2; WIDTH=${3:-1200}; shift 3 || true
PICS=("$@"); [ ${#PICS[@]} -gt 0 ] || PICS=("$REPO"/public/shop-samples/scenes/*.jpg)
declare -A ASPECT=( [room-pillow-sofa]=1x1 [room-masterpiece-sideboard]=2x3 [room-puzzle-table]=3x4 [room-block-sideboard]=5x7 [room-block-desk]=5x7 )
ITEMS=""; for t in "$SRC"/assets/room-*-template.json; do n=$(basename "$t" -template.json); ITEMS="$ITEMS $n:${ASPECT[$n]:-1x1}"; done
ESBUILD=$(ls -d "$REPO"/node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild | head -1)
"$ESBUILD" "$HERE/preview_test.ts" --bundle --platform=node --format=esm --outfile="$HERE/.preview_test.mjs" --log-level=warning
for pic in "${PICS[@]}"; do
  name=$(basename "$pic" | sed 's/\.[a-z]*$//')
  mkdir -p "$OUT/$name"
  node "$HERE/.preview_test.mjs" "$SRC/assets" "$OUT/$name" "$pic" "$WIDTH" $ITEMS > /dev/null
done
echo "gallery: ${#PICS[@]} pictures x$(echo $ITEMS | wc -w) rooms in $OUT"
