"""Turns a photo of a blank fabric product (a cushion) into a shop preview template.

python3 -I scripts/mockups/blank_template.py <blank.jpg> <out dir> <name>
Writes <name>-base.jpg (the photo, the product evened toward white so multiply keeps colours bright),
<name>-overlay.png (the photo, see-through exactly where the product is), <name>-mask.png,
<name>-template.json (corners as fractions TL TR BR BL, curved edges fitted to the outline, blend
multiply) and <name>-check.jpg (outline in red, the picture's edge in blue).
Then draw it with sample pictures (preview_test.ts) and add it to the photo library (export_library.py).

Tuned on the Prodigi linen cushion: a light, textured product on a smooth light backdrop with a
contact shadow. Check <name>-check.jpg before using it on a different kind of photo.
"""
import json
import sys

import cv2
import numpy as np
from scipy.optimize import linprog

src, out, name = sys.argv[1:4]
im = cv2.imread(src)
H, W = im.shape[:2]
g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
bg_level = float(np.median(np.concatenate([g[:80].ravel(), g[-80:].ravel()])))

# 1. The cushion is where the linen weave is. Brightness alone can't tell the fabric from the soft
#    floor shadow beside it (both are mid-grey), but the shadow and the backdrop are smooth and the
#    fabric is full of fine texture: fabric scores 2.2+ on this, shadow and backdrop under 0.8.
hp = g - cv2.GaussianBlur(g, (0, 0), 1.5)
energy = np.sqrt(cv2.GaussianBlur(hp * hp, (0, 0), 2.5))
mask = (energy > 1.3).astype(np.uint8) * 255
mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(mask)
mask = np.where(lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]), 255, 0).astype(np.uint8)
ff = mask.copy()
cv2.floodFill(ff, np.zeros((H + 2, W + 2), np.uint8), (0, 0), 255)
mask = mask | cv2.bitwise_not(ff)
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))

# 2. The bottom: the cushion ends at the dark line where it meets the floor. Per column, find that
#    line (the darkest row just above the mask's bottom) and cut there.
ys, xs = np.nonzero(mask)
smooth = cv2.GaussianBlur(g, (0, 0), 1.5)
cut = np.full(W, H, np.int32)
for x in range(xs.min(), xs.max() + 1):
    col = np.nonzero(mask[:, x])[0]
    if len(col) == 0:
        continue
    lo = max(col.max() - 40, col.min())
    r = lo + int(np.argmin(smooth[lo:col.max() + 1, x]))
    # Only a real contact shadow counts; at the thin corner tips there is none, so keep the column.
    if smooth[r, x] < 150 and r - col.min() > 60:
        cut[x] = r
# Columns without a clear shadow line (the corner tips) take the nearest column's line, so the
# bottom edge runs on without a step.
have = np.nonzero(cut < H)[0]
for x in range(xs.min(), xs.max() + 1):
    if cut[x] == H:
        cut[x] = cut[have[np.argmin(np.abs(have - x))]]
cut = cv2.medianBlur(cut.astype(np.float32).reshape(1, -1), 5).ravel().astype(np.int32)  # one-off columns don't make notches
rows = np.arange(H)[:, None]
mask[rows > cut[None, :]] = 0

# 3. Smooth the outline (no stair steps), then pull it in 4 px: the texture score spreads a few
#    pixels past the true edge, and a hairline of backdrop inside the cut-out would show as a halo.
mask = (cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 2.5) > 127).astype(np.uint8) * 255
mask = cv2.erode(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
soft = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 1.0)  # anti-aliased edge, 0..1

# 4. Corners: start from the outline's extreme points toward each corner of the image.
cs, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = max(cs, key=cv2.contourArea)[:, 0, :].astype(np.float64)
s, dxy = c.sum(1), c[:, 0] - c[:, 1]
tl, br = c[np.argmin(s)], c[np.argmax(s)]
tr, bl = c[np.argmax(dxy)], c[np.argmin(dxy)]
# Push each side out until the whole outline is inside, so the picture covers every bit of the
# cushion (the overlay trims what spills past the outline); a gap would show as bare white fabric.
def line_through(a, b):
    n = np.array([b[1] - a[1], a[0] - b[0]], np.float64)
    n /= np.linalg.norm(n)
    return n, float(n @ a)
quad = [tl, tr, br, bl]
centre = np.mean(quad, 0)
lines = []
for i in range(4):
    n, d0 = line_through(quad[i], quad[(i + 1) % 4])
    if n @ centre > d0:
        n, d0 = -n, -d0
    lines.append((n, max(d0, float((c @ n).max())) + 2))
def meet(l1, l2):
    return np.linalg.solve(np.array([l1[0], l2[0]]), np.array([l1[1], l2[1]]))
corners = [meet(lines[3], lines[0]), meet(lines[0], lines[1]), meet(lines[1], lines[2]), meet(lines[2], lines[3])]
points = [[round(float(x) / W, 5), round(float(y) / H, 5)] for x, y in corners]

# 4b. Curved edges: bend each edge in as far as it goes while still covering the whole cushion, so
#     the picture's edges follow the cushion's (top of the picture = top of the cushion) instead of
#     being trimmed. Same maths as zoneMapper in lib/shop/template.ts.
def homography(q):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = q
    dx1, dx2, dx3 = x1 - x2, x3 - x2, x0 - x1 + x2 - x3
    dy1, dy2, dy3 = y1 - y2, y3 - y2, y0 - y1 + y2 - y3
    gg = hh = 0.0
    if abs(dx3) > 1e-12 or abs(dy3) > 1e-12:
        den = dx1 * dy2 - dx2 * dy1
        gg, hh = (dx3 * dy2 - dx2 * dy3) / den, (dx1 * dy3 - dx3 * dy1) / den
    a_, b_, c_ = x1 - x0 + gg * x1, x3 - x0 + hh * x3, x0
    d_, e_, f_ = y1 - y0 + gg * y1, y3 - y0 + hh * y3, y0
    return lambda u, v: ((a_ * u + b_ * v + c_) / (gg * u + hh * v + 1), (d_ * u + e_ * v + f_) / (gg * u + hh * v + 1))

flat = homography([(x * W, y * H) for x, y in points])

def bend_at(e, t):
    n = len(e) + 1; h = 1 / n; p = [0, *e, 0]
    slope = lambda i: 0 if i in (0, n) else (p[i + 1] - p[i - 1]) / (2 * h)
    i = min(n - 1, max(0, int(np.floor(t * n)))); s_ = t * n - i; s2, s3 = s_ * s_, s_ * s_ * s_
    return (2 * s3 - 3 * s2 + 1) * p[i] + (s3 - 2 * s2 + s_) * h * slope(i) + (-2 * s3 + 3 * s2) * p[i + 1] + (s3 - s2) * h * slope(i + 1)

def mapper(bend):
    def m(u, v):
        x, y = flat(u, v)
        return (x + (bend_at(bend["left"], v) * (1 - u) ** 2 - bend_at(bend["right"], v) * u * u) * W,
                y + (bend_at(bend["top"], u) * (1 - v) ** 2 - bend_at(bend["bottom"], u) * v * v) * H)
    return m

def outline(bend, n=240):
    m, t = mapper(bend), np.linspace(0, 1, n)
    return np.array([m(s_, 0) for s_ in t] + [m(1, s_) for s_ in t] + [m(s_, 1) for s_ in t[::-1]] + [m(0, s_) for s_ in t[::-1]])

def uncovered(bend):
    zone = np.zeros((H, W), np.uint8)
    cv2.fillPoly(zone, [np.round(outline(bend)).astype(np.int32).reshape(-1, 1, 2)], 255)
    return int(((mask > 0) & (zone == 0)).sum())

# Room between each straight edge and the cushion's outline, along the edge (in pixels).
def room(side, t):
    if side == "top":
        x, y = flat(t, 0); col = np.nonzero(mask[:, int(round(x))])[0]; return (col.min() - y) / H
    if side == "bottom":
        x, y = flat(t, 1); col = np.nonzero(mask[:, int(round(x))])[0]; return (y - col.max()) / H
    if side == "left":
        x, y = flat(0, t); row = np.nonzero(mask[int(round(y))])[0]; return (row.min() - x) / W
    x, y = flat(1, t); row = np.nonzero(mask[int(round(y))])[0]; return (x - row.max()) / W

# Each edge's curve points: as far in as they can go with the curve staying outside the outline
# everywhere (a linear programme: the curve is linear in its points). The top gets more points
# because that's where heads are; the folded bottom-right corner limits the right side anyway.
STOPS = {"top": 7, "right": 5, "bottom": 3, "left": 5}
ts = np.linspace(0.02, 0.98, 97)
bend = {}
for side in ("top", "right", "bottom", "left"):
    k = STOPS[side]
    basis = np.array([[bend_at(list(np.eye(k)[j]), t) for j in range(k)] for t in ts])
    slack = 2 / (H if side in ("top", "bottom") else W)
    limit = np.array([room(side, t) for t in ts]) - slack
    r = linprog(-basis.sum(0), A_ub=basis, b_ub=limit, bounds=[(-0.1, 0.2)] * k, method="highs")
    bend[side] = [round(float(v), 4) if abs(v) >= 0.0005 else 0.0 for v in r.x]
    fit = basis @ r.x
    print(side.ljust(6), "points", bend[side], "| room px", " ".join(f"{int(v * (H if side in ('top','bottom') else W)):4d}" for v in limit[::8] + slack),
          "| left uncovered px", " ".join(f"{int((l - f) * (H if side in ('top','bottom') else W)):4d}" for l, f in zip(limit[::8], fit[::8])))
print("bend", bend, "uncovered px", uncovered(bend))

# 5. Background: the cushion evened toward white, keeping the linen weave and the shading.
#    Multiply darkens a picture by the fabric's grey, so a 222-grey cushion would dull every colour.
inside = g[mask > 0]
ref = float(np.percentile(inside, 97))
lift = np.clip(g / ref, 0, 1) ** 0.65 * 255  # 0.65 lifts the mid-greys most and keeps the folds
k = (lift / np.maximum(g, 1))[..., None]
evened = np.clip(im.astype(np.float32) * k, 0, 255)
a = soft[..., None]
base = (evened * a + im.astype(np.float32) * (1 - a)).astype(np.uint8)
cv2.imwrite(f"{out}/{name}-base.jpg", base, [cv2.IMWRITE_JPEG_QUALITY, 92])

# 6. Overlay: the same photo, see-through where the cushion is, so wherever the curved picture still
#    reaches past the outline (the corner tips, the folded corner) it is trimmed to the real edge.
rgba = cv2.cvtColor(base, cv2.COLOR_BGR2BGRA)
rgba[..., 3] = np.round((1 - soft) * 255).astype(np.uint8)
cv2.imwrite(f"{out}/{name}-overlay.png", rgba, [cv2.IMWRITE_PNG_COMPRESSION, 9])
cv2.imwrite(f"{out}/{name}-mask.png", mask)

template = {
    "v": 1,
    "background": {"media_id": "", "url": "", "w": W, "h": H},
    "zone": {"kind": "corners", "points": points, **({"bend": bend} if any(any(v) for v in bend.values()) else {})},
    "overlay": {"media_id": "", "url": "", "w": W, "h": H},
    "mask": {"kind": "none", "radius": 0},
    "blend": "multiply",
}
json.dump(template, open(f"{out}/{name}-template.json", "w"), indent=1)

chk = base.copy()
cv2.drawContours(chk, [c.astype(np.int32).reshape(-1, 1, 2)], -1, (0, 0, 255), 3)
cv2.polylines(chk, [np.round(outline(bend)).astype(np.int32).reshape(-1, 1, 2)], True, (255, 120, 0), 2)
for p in corners:
    cv2.circle(chk, tuple(int(v) for v in p), 14, (255, 120, 0), -1)
cv2.imwrite(f"{out}/{name}-check.jpg", cv2.resize(chk, (1000, 1000), interpolation=cv2.INTER_AREA))
print("corners px", [tuple(int(v) for v in p) for p in corners])
print("corners", points)
print("cushion grey before/after: median", int(np.median(inside)), "->", int(np.median(cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)[mask > 0])),
      "p5", int(np.percentile(inside, 5)), "->", int(np.percentile(cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)[mask > 0], 5)))
print("see-through share of overlay", round(float((rgba[..., 3] < 250).mean()), 3))
