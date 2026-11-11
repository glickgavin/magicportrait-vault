"""Turn a product's three renders into the shop's template assets.

    python3 build_assets.py <renders dir> <product> <out dir>

Reads <product>-base.png, -gloss.png, -mask.png and -base.json; writes
  <product>-base.jpg      the background: the scene, with the print area evened to white (the picture is multiplied onto it)
  <product>-overlay.png   drawn over the picture: everything outside the print area, plus its shine (and a puzzle's cuts)
  <product>-template.json the zone and settings for the template (urls filled in after upload)
"""
import json
import math
import random
import sys

import cv2
import numpy as np
from PIL import Image


def load(path):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    im = im[..., :3][..., ::-1].astype(np.float32)
    return im / (65535.0 if im.max() > 255 else 255.0)


def lum(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def order_quad(pts):
    pts = np.array(pts, dtype=np.float64)
    s = pts.sum(1)
    d = pts[:, 0] - pts[:, 1]
    tl, br = pts[np.argmin(s)], pts[np.argmax(s)]
    tr, bl = pts[np.argmax(d)], pts[np.argmin(d)]
    return [tl, tr, br, bl]


def fit_quad(mask_bin):
    """The print area's four corners from its mask: edges fitted as lines, corners where they meet."""
    cnts, _ = cv2.findContours(mask_bin.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cnts, key=cv2.contourArea)
    peri = cv2.arcLength(c, True)
    for eps in np.linspace(0.01, 0.06, 26):
        ap = cv2.approxPolyDP(c, eps * peri, True)
        if len(ap) == 4:
            break
    rough = order_quad(ap.reshape(-1, 2))
    pts = c.reshape(-1, 2).astype(np.float64)
    lines = []
    for i in range(4):
        a, b = np.array(rough[i]), np.array(rough[(i + 1) % 4])
        ab = b - a
        L = np.linalg.norm(ab)
        t = ((pts - a) @ ab) / (L * L)
        rel = pts - a
        dist = np.abs(ab[0] * rel[:, 1] - ab[1] * rel[:, 0]) / L
        sel = pts[(t > 0.08) & (t < 0.92) & (dist < 4)]
        vx, vy, x0, y0 = cv2.fitLine(sel.astype(np.float32), cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
        lines.append((np.array([x0, y0]), np.array([vx, vy])))
    corners = []
    for i in range(4):
        (p1, d1), (p2, d2) = lines[i - 1], lines[i]
        A = np.array([d1, -d2]).T
        t = np.linalg.solve(A, p2 - p1)
        corners.append(p1 + d1 * t[0])
    return [list(map(float, p)) for p in corners]


def wrap_zone(meta, W, H):
    w = meta["wrap_points"]
    edge_top = (w["left_top"][1] + w["right_top"][1]) / 2
    edge_bottom = (w["left_bottom"][1] + w["right_bottom"][1]) / 2
    bow_top = w["center_top"][1] - edge_top
    bow_bottom = w["center_bottom"][1] - edge_bottom
    curve = (bow_top + bow_bottom) / 2
    top = min(edge_top, w["center_top"][1] - curve)
    bottom = max(edge_bottom, w["center_bottom"][1] - curve)
    return {
        "kind": "wrap",
        "left": round(w["left_mid"][0], 4),
        "right": round(w["right_mid"][0], 4),
        "top": round(top, 4),
        "bottom": round(bottom, 4),
        "curve": round(curve, 4),
        "spread": round(meta["wrap_half_deg"] / 90, 4),
    }


def zone_points(zone, W, H, n=64):
    """Sample the zone's outline in pixels, exactly as lib/shop/template.ts maps it."""
    if zone["kind"] == "corners":
        return np.array([[x * W, y * H] for x, y in zone["points"]], dtype=np.float32)
    half = math.pi / 2 * zone["spread"]
    sinE, cosE = math.sin(half), math.cos(half)
    cx = (zone["left"] + zone["right"]) / 2 * W
    hw = (zone["right"] - zone["left"]) / 2 * W

    def m(u, v):
        t = (u - 0.5) * 2 * half
        x = cx + hw * math.sin(t) / sinE
        bow = ((math.cos(t) - cosE) / (1 - cosE)) * zone["curve"] * H if cosE < 1 else 0
        return [x, zone["top"] * H + bow + v * (zone["bottom"] - zone["top"]) * H]

    outline = [m(i / n, 0) for i in range(n + 1)] + [m(1, j / n) for j in range(n + 1)] + [m(1 - i / n, 1) for i in range(n + 1)] + [m(0, 1 - j / n) for j in range(n + 1)]
    return np.array(outline, dtype=np.float32)


def puzzle_cuts(w, h, cols, rows, seed=11):
    """Classic jigsaw cut lines in picture space, as polylines."""
    rnd = random.Random(seed)
    cw, ch = w / cols, h / rows

    def edge(p0, p1, sign):
        # one side of a piece with a tab, in the edge's own frame
        d = p1 - p0
        L = np.linalg.norm(d)
        u = d / L
        nrm = np.array([-u[1], u[0]]) * sign
        j = lambda: rnd.uniform(-0.04, 0.04)
        prof = [(0, 0), (0.34 + j(), 0.0 + j() * 0.5), (0.40, 0.08), (0.36, 0.20), (0.42 + j(), 0.30), (0.5 + j(), 0.33), (0.58 + j(), 0.30), (0.64, 0.20), (0.60, 0.08), (0.66 + j(), 0.0), (1, 0)]
        pts = np.array([(a * L, b * L) for a, b in prof])
        # smooth with a Catmull-Rom spline
        out = []
        P = np.vstack([pts[0], pts, pts[-1]])
        for i in range(1, len(P) - 2):
            for t in np.linspace(0, 1, 10, endpoint=False):
                t2, t3 = t * t, t * t * t
                q = 0.5 * ((2 * P[i]) + (-P[i - 1] + P[i + 1]) * t + (2 * P[i - 1] - 5 * P[i] + 4 * P[i + 1] - P[i + 2]) * t2 + (-P[i - 1] + 3 * P[i] - 3 * P[i + 1] + P[i + 2]) * t3)
                out.append(p0 + u * q[0] + nrm * q[1])
        out.append(p1)
        return np.array(out)

    lines = []
    for r in range(1, rows):
        for c in range(cols):
            lines.append(edge(np.array([c * cw, r * ch]), np.array([(c + 1) * cw, r * ch]), rnd.choice([-1, 1])))
    for c in range(1, cols):
        for r in range(rows):
            lines.append(edge(np.array([c * cw, r * ch]), np.array([c * cw, (r + 1) * ch]), rnd.choice([-1, 1])))
    return lines


def paint_over(rgba, colour, a):
    """Paint a flat colour with alpha `a` over a straight-alpha RGBA image."""
    A0, C0 = rgba[..., 3], rgba[..., :3]
    A = a + A0 * (1 - a)
    C = (colour * a[..., None] + C0 * (A0 * (1 - a))[..., None]) / np.maximum(A[..., None], 1e-4)
    return np.dstack([C, A])


def main():
    src, name, out = sys.argv[1:4]
    base = load(f"{src}/{name}-base.png")
    gloss = load(f"{src}/{name}-gloss.png")
    maskimg = load(f"{src}/{name}-mask.png")
    meta = json.load(open(f"{src}/{name}-base.json"))
    H, W = base.shape[:2]
    m = np.clip((lum(maskimg) - 0.04) / 0.9, 0, 1)
    binm = m > 0.5
    info = meta["info"]

    # ---- the zone
    if info["kind"] == "wrap":
        zone = wrap_zone(meta, W, H)
    else:
        if info.get("behind_glass"):
            pts = fit_quad(binm)
            pts = [[p[0] / W, p[1] / H] for p in pts]
        else:
            pts = meta["corners"]
        zone = {"kind": "corners", "points": [[round(x, 5), round(y, 5)] for x, y in pts]}
    poly = zone_points(zone, W, H)
    zmask = np.zeros((H, W), np.uint8)
    cv2.fillPoly(zmask, [np.round(poly * 16).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=4)
    cover = float((binm & (zmask > 127)).sum()) / max(1, binm.sum())
    m = m * (zmask.astype(np.float32) / 255)
    binm = m > 0.5

    # ---- background: the scene, with the print area evened to a clean white for multiply
    face_l = lum(base)[binm]
    p97 = float(np.percentile(face_l, 97)) if face_l.size else 1.0
    gain = 0.975 / max(p97, 1e-3)
    neutral = base * gain
    grey = lum(neutral)[..., None]
    neutral = np.clip(grey + (neutral - grey) * 0.35, 0, 1)  # keep only a little of the light's colour on the picture
    m3 = m[..., None]
    bg = base * (1 - m3) + neutral * m3

    # ---- overlay: outside the print area as rendered; inside, only its shine
    g = lum(gloss)
    inside = g[binm]
    # Behind acrylic the whole face carries a faint haze of reflection: keep only the clear highlights.
    floor = float(np.percentile(inside, 45 if info.get("behind_glass") else 30)) if inside.size else 0.0
    a_gloss = np.clip((g - floor) * (1.5 if info.get("behind_glass") else 1.25), 0, 0.85)
    # Drop the faint render noise (invisible, but it makes the file ten times bigger) and soften what's left.
    a_gloss = np.where(a_gloss < 0.035, 0, a_gloss)
    a_gloss = cv2.GaussianBlur(a_gloss.astype(np.float32), (0, 0), 1.2) * m
    a_gloss = np.where(a_gloss < 0.01, 0, a_gloss)
    # Outside the print area the overlay only needs to cover where the warped picture can reach: the zone,
    # grown a few pixels. Everywhere else the background already shows, so the overlay stays clear (small file).
    reach = cv2.dilate((zmask > 0).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(np.float32)
    reach = cv2.GaussianBlur(reach, (5, 5), 0)
    m3 = m[..., None]
    edge = (1 - m) * reach
    alpha = edge + a_gloss
    rgb = (base * edge[..., None] + np.ones_like(base) * a_gloss[..., None]) / np.maximum(alpha[..., None], 1e-4)
    rgba = np.dstack([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)])

    if info.get("puzzle"):
        # Cut lines: a dark groove with a light edge, drawn flat and warped into place.
        pw, ph = 2400, 1800
        cols, rows = 12, 9
        cuts = puzzle_cuts(pw, ph, cols, rows)
        dark = np.zeros((ph, pw), np.uint8)
        light = np.zeros((ph, pw), np.uint8)
        for line in cuts:
            pts = np.round(line * 16).astype(np.int32).reshape(-1, 1, 2)
            cv2.polylines(dark, [pts], False, 255, 3, cv2.LINE_AA, shift=4)
            cv2.polylines(light, [pts + np.array([[[22, 22]]])], False, 255, 2, cv2.LINE_AA, shift=4)
        src_q = np.array([[0, 0], [pw, 0], [pw, ph], [0, ph]], np.float32)
        Hm = cv2.getPerspectiveTransform(src_q, poly[:4])
        d = cv2.warpPerspective(dark, Hm, (W, H), flags=cv2.INTER_AREA).astype(np.float32) / 255 * m
        l = cv2.warpPerspective(light, Hm, (W, H), flags=cv2.INTER_AREA).astype(np.float32) / 255 * m
        for layer, colour, strength in ((l, 1.0, 0.45), (d, 0.06, 0.55)):
            rgba = paint_over(rgba, colour, layer * strength)

    Image.fromarray((np.clip(bg, 0, 1) * 255 + 0.5).astype(np.uint8)).save(f"{out}/{name}-base.jpg", quality=92, subsampling=0, optimize=True)
    ov = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    ov.save(f"{out}/{name}-overlay.png", optimize=True)
    ov.save(f"{out}/{name}-overlay.webp", quality=88, method=6)
    template = {
        "v": 1,
        "background": {"media_id": "", "url": "", "w": W, "h": H},
        "zone": zone,
        "overlay": {"media_id": "", "url": "", "w": W, "h": H},
        "mask": {"kind": "circle" if info.get("mask") == "circle" else "none", "radius": 0},
        "blend": "multiply",
    }
    json.dump(template, open(f"{out}/{name}-template.json", "w"), indent=1)
    print(f"{name}: zone {zone['kind']}, print area covered by the zone {cover:.4f}, face p97 {p97:.3f}")


if __name__ == "__main__":
    main()
