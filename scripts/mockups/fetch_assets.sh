#!/bin/bash
# Downloads the scanned furniture, textures and light maps the furnished rooms use (rooms.py) into
# $MOCKUP_ASSETS (default scripts/mockups/.assets, which git ignores). Licences: scripts/mockups/ASSETS.md.
#   scripts/mockups/fetch_assets.sh [dir]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR=${1:-${MOCKUP_ASSETS:-$HERE/.assets}}
mkdir -p "$DIR/glb" "$DIR/tex" "$DIR/hdri"
K=https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models
for m in GlamVelvetSofa SheenChair DiffuseTransmissionPlant GlassVaseFlowers DiffuseTransmissionTeacup; do
  [ -s "$DIR/glb/$m.glb" ] || curl -fsSL -o "$DIR/glb/$m.glb" "$K/$m/glTF-Binary/$m.glb"
  curl -fsSL -o "$DIR/glb/$m.LICENSE.md" "$K/$m/LICENSE.md"
done
T=https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures
for t in hardwood2_diffuse.jpg hardwood2_bump.jpg hardwood2_roughness.jpg; do
  [ -s "$DIR/tex/$t" ] || curl -fsSL -o "$DIR/tex/$t" "$T/$t"
done
echo "assets in $DIR"
