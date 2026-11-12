"""Copies the furnished rooms and the studio photos into the app's photo library (Settings › Shop › Photo library).

python3 scripts/mockups/export_library.py <render.sh out dir with rooms> <room_gallery.sh dir> <studio previews dir>
Writes public/shop-library/ (rooms: background, overlay, one photo per sample picture; studio photos) and
lib/shop/photo-library.ts, the list the library page and the template editor read.
"""
import json
import os
import shutil
import sys

from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(REPO, "public", "shop-library")
renders, gallery, studio = sys.argv[1:4]

# Room: (product handle in Shopify, product title, print shape, what the scene shows)
ROOMS = {
    "room-pillow-sofa": ("magic-pillow-with-photo", "Magic Pillow with Photo", "1:1", "On a champagne velvet sofa, a rust cushion behind it, a lamp on the side table and daylight from the window."),
    "room-masterpiece-sideboard": ("masterpiece-copy", "Masterpiece", "2:3", "Above a walnut sideboard with flowers, books and a lit candle."),
    "room-puzzle-table": ("magic-puzzle", "Magic Puzzle", "3:4", "Finished on an oak dining table, upright, with the box lid, a cup of tea, flowers and velvet chairs behind."),
    "room-block-sideboard": ("acrylic-block", "Acrylic Block", "5:7", "Standing on the walnut sideboard by the window, between books with a candle and a vase of flowers."),
    "room-block-desk": ("acrylic-block", "Acrylic Block", "5:7", "On an oak desk with a laptop, a cup of tea, a notebook and a lamp."),
}
# Studio template name: (product handle, product title, sample picture shown on it)
STUDIO = {
    "magic-pillow": ("magic-pillow-with-photo", "Magic Pillow with Photo", "frenchie-journal"),
    "masterpiece": ("masterpiece-copy", "Masterpiece", "admiral-teddy"),
    "magic-puzzle": ("magic-puzzle", "Magic Puzzle", "tommy-boy"),
    "acrylic-block": ("acrylic-block", "Acrylic Block", "cat-plumber"),
    "acrylic-square-block": ("acrylic-square-block", "Acrylic Square Block", "beagle-peg"),
    "magic-mug": ("magic-mug-with-photo-copy-1", "Magic Mug with Photo", "rottweiler-plumber"),
    "magic-xmas-ornaments": ("magic-xmas-ornaments-set-of-3", "Magic Xmas Ornaments", "lamb-plumber"),
    "magic-poster": ("magic-poster", "Magic Poster", "husky-journal"),
    "acrylic-print": ("acrylic-print", "Acrylic Print", "admiral-cat"),
    "acrylic-glass-art": ("acrylic-glass-art", "Acrylic Glass Art", "beagle-peg-2"),
    "magic-portrait-tile": ("magic-portrait-copy", "Magic Portrait Tile", "shepherd-peg"),
}
PICTURES = ["beagle-peg", "shepherd-peg", "beagle-peg-2", "admiral-teddy", "admiral-cat", "tommy-boy", "bartholomew", "husky-journal", "frenchie-journal", "cat-plumber", "lamb-plumber", "rottweiler-plumber"]


def save_jpg(src, dst, px=1200, q=82):
    im = Image.open(src).convert("RGB")
    im.thumbnail((px, px))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, quality=q, optimize=True, progressive=True)
    return im.width, im.height


def rel(path):
    return "/" + os.path.relpath(path, os.path.join(REPO, "public")).replace(os.sep, "/")


shutil.rmtree(OUT, ignore_errors=True)
rooms, shots = [], []
for room, (handle, title, aspect, scene) in ROOMS.items():
    t = json.load(open(f"{renders}/assets/{room}-template.json"))
    d = os.path.join(OUT, "rooms", room)
    bw, bh = save_jpg(f"{renders}/assets/{room}-base.jpg", f"{d}/background.jpg", px=2400, q=88)
    overlay = None
    if os.path.exists(f"{renders}/assets/{room}-overlay.webp"):
        os.makedirs(d, exist_ok=True)
        shutil.copy(f"{renders}/assets/{room}-overlay.webp", f"{d}/overlay.webp")
        ow, oh = Image.open(f"{d}/overlay.webp").size
        overlay = {"src": rel(f"{d}/overlay.webp"), "w": ow, "h": oh}
    photos = []
    for p in PICTURES:
        src = f"{gallery}/{p}/{room}.jpg"
        if os.path.exists(src):
            w, h = save_jpg(src, f"{d}/photos/{p}.jpg")
            photos.append({"picture": p, "src": rel(f"{d}/photos/{p}.jpg"), "w": w, "h": h})
    rooms.append({
        "id": room, "product": handle, "productTitle": title, "printAspect": aspect, "scene": scene,
        "background": {"src": rel(f"{d}/background.jpg"), "w": bw, "h": bh}, "overlay": overlay,
        "zone": t["zone"], "mask": t["mask"], "blend": t["blend"], "photos": photos,
    })
for name, (handle, title, pic) in STUDIO.items():
    w, h = save_jpg(f"{studio}/{name}.jpg", os.path.join(OUT, "studio", f"{name}.jpg"))
    shots.append({"id": name, "product": handle, "productTitle": title, "picture": pic, "src": rel(os.path.join(OUT, "studio", f"{name}.jpg")), "w": w, "h": h})

ts = f'''// Made by scripts/mockups/export_library.py from the mockup renders; don't edit by hand.
// The files are in public/shop-library/. Rooms match Store products by Shopify handle.
import type {{ Template }} from "@/lib/shop/template";

export type LibraryImage = {{ src: string; w: number; h: number }};
export type LibraryRoom = {{
  id: string;
  product: string;
  productTitle: string;
  printAspect: string;
  scene: string;
  background: LibraryImage;
  overlay: LibraryImage | null;
  zone: Template["zone"];
  mask: Template["mask"];
  blend: Template["blend"];
  photos: (LibraryImage & {{ picture: string }})[];
}};
export type LibraryStudioPhoto = LibraryImage & {{ id: string; product: string; productTitle: string; picture: string }};

export const LIBRARY_ROOMS: LibraryRoom[] = {json.dumps(rooms, indent=2)};

export const LIBRARY_STUDIO: LibraryStudioPhoto[] = {json.dumps(shots, indent=2)};

/** "beagle-peg-2" → "Beagle peg 2" */
export function pictureLabel(slug: string): string {{
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}}
'''
open(os.path.join(REPO, "lib", "shop", "photo-library.ts"), "w").write(ts)
total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
print(f"{len(rooms)} rooms, {sum(len(r['photos']) for r in rooms)} room photos, {len(shots)} studio photos, {total / 1e6:.1f} MB")
