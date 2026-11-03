"""SVG drawing primitives for the theme card artwork (1500 x 2100 canvas)."""
import math, random

W, H = 1500, 2100


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def g(inner, tx=0, ty=0, rot=0, s=1, opacity=1, extra=""):
    t = f"translate({f(tx)} {f(ty)})"
    if rot:
        t += f" rotate({f(rot)})"
    if s != 1:
        t += f" scale({f(s)})"
    op = f' opacity="{opacity}"' if opacity != 1 else ""
    return f'<g transform="{t}"{op} {extra}>{inner}</g>'


# ---------- simple shapes ----------

def paw(cx, cy, s, fill, rot=0, opacity=1):
    pad = ("M -0.30 0.34 C -0.46 0.34 -0.46 0.10 -0.30 -0.02 C -0.16 -0.13 0.16 -0.13 0.30 -0.02 "
           "C 0.46 0.10 0.46 0.34 0.30 0.34 C 0.16 0.34 0.08 0.27 0 0.27 C -0.08 0.27 -0.16 0.34 -0.30 0.34 Z")
    toes = "".join(
        f'<ellipse cx="{x}" cy="{y}" rx="0.125" ry="0.165" transform="rotate({r} {x} {y})"/>'
        for x, y, r in [(-0.40, -0.24, -25), (-0.145, -0.44, -8), (0.145, -0.44, 8), (0.40, -0.24, 25)])
    return g(f'<g fill="{fill}"><path d="{pad}"/>{toes}</g>', cx, cy, rot, s, opacity)


def bone(cx, cy, length, thick, fill, rot=0, opacity=1, stroke=None, sw=0):
    r = thick * 0.62
    L = length / 2 - r * 0.8
    parts = (f'<rect x="{f(-L)}" y="{f(-thick/2)}" width="{f(2*L)}" height="{f(thick)}"/>' +
             "".join(f'<circle cx="{f(sx*L)}" cy="{f(sy*r*0.62)}" r="{f(r)}"/>' for sx in (-1, 1) for sy in (-1, 1)))
    out = ""
    if stroke:
        out += f'<g fill="{stroke}" stroke="{stroke}" stroke-width="{sw*2}" stroke-linejoin="round">{parts}</g>'
    out += f'<g fill="{fill}">{parts}</g>'
    return g(out, cx, cy, rot, 1, opacity)


def fish(cx, cy, s, fill, rot=0, opacity=1, eye="#ffffff"):
    body = ('<path d="M -0.5 0 C -0.3 -0.32 0.18 -0.34 0.32 0 C 0.18 0.34 -0.3 0.32 -0.5 0 Z"/>'
            '<path d="M 0.26 0 L 0.56 -0.26 C 0.5 -0.08 0.5 0.08 0.56 0.26 Z"/>')
    return g(f'<g fill="{fill}">{body}</g><circle cx="-0.28" cy="-0.04" r="0.05" fill="{eye}"/>', cx, cy, rot, s, opacity)


def sparkle(cx, cy, r, fill, rot=0, opacity=1):
    d = "M 0 -1 Q 0.12 -0.12 1 0 Q 0.12 0.12 0 1 Q -0.12 0.12 -1 0 Q -0.12 -0.12 0 -1 Z"
    return g(f'<path d="{d}" fill="{fill}"/>', cx, cy, rot, r, opacity)


def star5(cx, cy, r, fill, rot=0, inner=0.45, opacity=1, stroke=None, sw=0):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * inner
        pts.append(f"{f(rr*math.cos(a))},{f(rr*math.sin(a))}")
    st = f' stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"' if stroke else ""
    return g(f'<polygon points="{" ".join(pts)}" fill="{fill}"{st}/>', cx, cy, rot, 1, opacity)


def heart(cx, cy, s, fill, rot=0, opacity=1):
    d = "M 0 0.35 C -0.55 -0.05 -0.45 -0.55 0 -0.25 C 0.45 -0.55 0.55 -0.05 0 0.35 Z"
    return g(f'<path d="{d}" fill="{fill}"/>', cx, cy, rot, s, opacity)


def snowflake(cx, cy, r, color, sw=None, rot=0, opacity=1):
    sw = sw or max(1.5, r * 0.09)
    arms = ""
    for i in range(6):
        a = i * 60
        arm = (f'<line x1="0" y1="0" x2="0" y2="{f(-r)}"/>'
               f'<polyline points="{f(-r*0.28)},{f(-r*0.72)} 0,{f(-r*0.5)} {f(r*0.28)},{f(-r*0.72)}" fill="none"/>'
               f'<polyline points="{f(-r*0.18)},{f(-r*0.38)} 0,{f(-r*0.26)} {f(r*0.18)},{f(-r*0.38)}" fill="none"/>')
        arms += f'<g transform="rotate({a})">{arm}</g>'
    return g(f'<g stroke="{color}" stroke-width="{f(sw)}" stroke-linecap="round" stroke-linejoin="round">{arms}</g>',
             cx, cy, rot, 1, opacity)


def dot_snow(rng, n, box, rmin, rmax, color, opacity=(0.5, 1)):
    x0, y0, x1, y1 = box
    out = []
    for _ in range(n):
        out.append(f'<circle cx="{f(rng.uniform(x0,x1))}" cy="{f(rng.uniform(y0,y1))}" r="{f(rng.uniform(rmin,rmax))}" '
                   f'fill="{color}" opacity="{rng.uniform(*opacity):.2f}"/>')
    return "".join(out)


def firework(cx, cy, r, color, n=18, sw=6, tip="dot", tip_color=None, inner=0.28, rot=0, opacity=1):
    tip_color = tip_color or color
    out = []
    for i in range(n):
        a = math.radians(rot + i * 360 / n)
        rr = r * (0.86 if i % 2 else 1.0)
        x1, y1 = math.cos(a) * r * inner, math.sin(a) * r * inner
        x2, y2 = math.cos(a) * rr * 0.86, math.sin(a) * rr * 0.86
        out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="{f(sw)}" stroke-linecap="round"/>')
        tx, ty = math.cos(a) * rr, math.sin(a) * rr
        if tip == "dot":
            out.append(f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(sw*1.1)}" fill="{tip_color}"/>')
        elif tip == "paw":
            out.append(paw(tx, ty, sw * 4.2, tip_color, rot=math.degrees(a) + 90))
        elif tip == "sparkle":
            out.append(sparkle(tx, ty, sw * 2.4, tip_color))
        # second ring of small dots
        mx, my = math.cos(a + 0.17) * r * 0.62, math.sin(a + 0.17) * r * 0.62
        out.append(f'<circle cx="{f(mx)}" cy="{f(my)}" r="{f(sw*0.55)}" fill="{tip_color}" opacity="0.8"/>')
    return g("".join(out), cx, cy, 0, 1, opacity)


def confetti(rng, n, box, colors, size=(14, 34), kinds=("rect", "circle", "tri", "squiggle"), avoid=None, opacity=1):
    x0, y0, x1, y1 = box
    out = []
    tries = 0
    while len(out) < n and tries < n * 30:
        tries += 1
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1)
        if avoid and any(ax0 - 10 < x < ax1 + 10 and ay0 - 10 < y < ay1 + 10 for ax0, ay0, ax1, ay1 in avoid):
            continue
        c = rng.choice(colors)
        s = rng.uniform(*size)
        k = rng.choice(kinds)
        rot = rng.uniform(0, 360)
        if k == "rect":
            el = f'<rect x="{f(-s/2)}" y="{f(-s/4)}" width="{f(s)}" height="{f(s/2)}" rx="{f(s*0.08)}" fill="{c}"/>'
        elif k == "circle":
            el = f'<circle r="{f(s*0.38)}" fill="{c}"/>'
        elif k == "tri":
            el = f'<polygon points="0,{f(-s*0.5)} {f(s*0.48)},{f(s*0.4)} {f(-s*0.48)},{f(s*0.4)}" fill="{c}"/>'
        elif k == "squiggle":
            el = (f'<path d="M {f(-s)} 0 q {f(s/4)} {f(-s/2.2)} {f(s/2)} 0 t {f(s/2)} 0 t {f(s/2)} 0 t {f(s/2)} 0" '
                  f'fill="none" stroke="{c}" stroke-width="{f(s*0.22)}" stroke-linecap="round"/>')
        elif k == "star":
            el = star5(0, 0, s * 0.6, c)
        elif k == "paw":
            el = paw(0, 0, s * 1.1, c)
        elif k == "bone":
            el = bone(0, 0, s * 1.6, s * 0.38, c)
        elif k == "fish":
            el = fish(0, 0, s * 1.5, c)
        elif k == "heart":
            el = heart(0, 0, s * 1.2, c)
        else:
            el = ""
        out.append(g(el, x, y, rot, 1, opacity))
    return "".join(out)


def balloon(cx, cy, rx, color, grad_id, string_end=None, string_color="#9b8a7a", rot=0):
    ry = rx * 1.2
    d = (f"M 0 {f(-ry)} C {f(rx*0.98)} {f(-ry)} {f(rx*1.02)} {f(ry*0.35)} {f(rx*0.18)} {f(ry*0.92)} "
         f"L 0 {f(ry)} L {f(-rx*0.18)} {f(ry*0.92)} C {f(-rx*1.02)} {f(ry*0.35)} {f(-rx*0.98)} {f(-ry)} 0 {f(-ry)} Z")
    knot = f'<path d="M -{f(rx*0.09)} {f(ry*1.08)} L {f(rx*0.09)} {f(ry*1.08)} L 0 {f(ry*0.96)} Z" fill="{color}"/>'
    hl = (f'<ellipse cx="{f(-rx*0.38)}" cy="{f(-ry*0.42)}" rx="{f(rx*0.16)}" ry="{f(ry*0.26)}" fill="#ffffff" opacity="0.55" '
          f'transform="rotate(25 {f(-rx*0.38)} {f(-ry*0.42)})"/>'
          f'<ellipse cx="{f(-rx*0.18)}" cy="{f(-ry*0.72)}" rx="{f(rx*0.06)}" ry="{f(ry*0.05)}" fill="#ffffff" opacity="0.7"/>')
    body = f'<path d="{d}" fill="{color}"/><path d="{d}" fill="url(#{grad_id})"/>{knot}{hl}'
    string = ""
    if string_end:
        # string in absolute coordinates
        L = ry * 1.08
        sx, sy = cx - L * math.sin(math.radians(rot)), cy + L * math.cos(math.radians(rot))
        ex, ey = string_end
        mx = (sx + ex) / 2
        string = (f'<path d="M {f(sx)} {f(sy)} C {f(sx+40)} {f(sy+(ey-sy)*0.3)} {f(mx-50)} {f(sy+(ey-sy)*0.6)} {f(ex)} {f(ey)}" '
                  f'fill="none" stroke="{string_color}" stroke-width="3"/>')
    return string + g(body, cx, cy, rot)


def bubble(cx, cy, r, color="#C9A24A", opacity=0.8, sw=None):
    sw = sw or max(1.6, r * 0.08)
    return (f'<g opacity="{opacity}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="#ffffff" fill-opacity="0.25" stroke="{color}" stroke-width="{f(sw)}"/>'
            f'<path d="M {f(cx-r*0.55)} {f(cy-r*0.2)} A {f(r*0.6)} {f(r*0.6)} 0 0 1 {f(cx-r*0.1)} {f(cy-r*0.6)}" fill="none" stroke="#ffffff" stroke-width="{f(sw*1.2)}" stroke-linecap="round"/></g>')


def holly_leaf(cx, cy, s, rot, fill, vein="#0f3b24"):
    d = ("M 0 -1 C 0.12 -0.8 0.32 -0.78 0.3 -0.6 C 0.42 -0.48 0.5 -0.44 0.42 -0.26 C 0.52 -0.12 0.56 -0.02 0.44 0.12 "
         "C 0.5 0.3 0.46 0.4 0.3 0.46 C 0.28 0.66 0.16 0.78 0 1 C -0.16 0.78 -0.28 0.66 -0.3 0.46 C -0.46 0.4 -0.5 0.3 -0.44 0.12 "
         "C -0.56 -0.02 -0.52 -0.12 -0.42 -0.26 C -0.5 -0.44 -0.42 -0.48 -0.3 -0.6 C -0.32 -0.78 -0.12 -0.8 0 -1 Z")
    return g(f'<path d="{d}" fill="{fill}"/><path d="M 0 -0.9 L 0 0.9" stroke="{vein}" stroke-width="0.04" opacity="0.6"/>',
             cx, cy, rot, s)


def berry(cx, cy, r, color="#C3172D"):
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{color}"/>'
            f'<circle cx="{f(cx-r*0.32)}" cy="{f(cy-r*0.32)}" r="{f(r*0.28)}" fill="#ffffff" opacity="0.55"/>')


def pine_sprig(rng, x, y, length, angle, colors, needle=46, density=1.0, sw=5):
    """A pine branch: stem plus needles both sides."""
    a = math.radians(angle)
    out = []
    steps = int(length / 9 * density)
    for i in range(steps):
        t = i / max(1, steps - 1)
        px, py = x + math.cos(a) * length * t, y + math.sin(a) * length * t
        nl = needle * (0.55 + 0.45 * math.sin(math.pi * min(1, t * 1.1 + 0.05)))
        for side in (-1, 1):
            na = a + side * math.radians(rng.uniform(35, 62)) + math.radians(rng.uniform(-6, 6))
            ex, ey = px + math.cos(na) * nl, py + math.sin(na) * nl
            out.append(f'<line x1="{f(px)}" y1="{f(py)}" x2="{f(ex)}" y2="{f(ey)}" stroke="{rng.choice(colors)}" '
                       f'stroke-width="{f(sw*rng.uniform(0.8,1.15))}" stroke-linecap="round"/>')
    out.insert(0, f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x+math.cos(a)*length)}" y2="{f(y+math.sin(a)*length)}" '
                  f'stroke="#5b3a1f" stroke-width="{f(sw*0.9)}" stroke-linecap="round"/>')
    return "".join(out)


def bow(cx, cy, s, color, dark, rot=0):
    loops = (f'<path d="M 0 0 C -0.25 -0.45 -0.95 -0.55 -0.95 -0.1 C -0.95 0.3 -0.35 0.25 0 0 Z" fill="{color}"/>'
             f'<path d="M 0 0 C 0.25 -0.45 0.95 -0.55 0.95 -0.1 C 0.95 0.3 0.35 0.25 0 0 Z" fill="{color}"/>'
             f'<path d="M 0 0 C -0.2 -0.2 -0.7 -0.32 -0.75 -0.1 C -0.5 -0.15 -0.25 -0.05 0 0 Z" fill="{dark}" opacity="0.55"/>'
             f'<path d="M 0 0 C 0.2 -0.2 0.7 -0.32 0.75 -0.1 C 0.5 -0.15 0.25 -0.05 0 0 Z" fill="{dark}" opacity="0.55"/>')
    tails = (f'<path d="M -0.05 0.05 C -0.2 0.4 -0.35 0.75 -0.5 1.05 L -0.3 0.98 L -0.24 1.18 C -0.1 0.8 0.02 0.4 0.08 0.08 Z" fill="{color}"/>'
             f'<path d="M 0.05 0.05 C 0.2 0.4 0.32 0.75 0.42 1.08 L 0.24 1.0 L 0.16 1.2 C 0.06 0.8 -0.02 0.4 -0.08 0.08 Z" fill="{dark}"/>')
    knot = f'<ellipse cx="0" cy="0" rx="0.17" ry="0.15" fill="{dark}"/><ellipse cx="-0.03" cy="-0.03" rx="0.1" ry="0.08" fill="{color}"/>'
    return g(tails + loops + knot, cx, cy, rot, s)


def bauble(cx, cy, r, color, grad_id, hang_from=None, cap="#D4AF5A", string="#D4AF5A"):
    out = ""
    if hang_from:
        out += f'<line x1="{f(hang_from[0])}" y1="{f(hang_from[1])}" x2="{f(cx)}" y2="{f(cy-r*1.15)}" stroke="{string}" stroke-width="3"/>'
    out += (f'<rect x="{f(cx-r*0.22)}" y="{f(cy-r*1.17)}" width="{f(r*0.44)}" height="{f(r*0.26)}" rx="{f(r*0.05)}" fill="{cap}"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{color}"/><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="url(#{grad_id})"/>'
            f'<ellipse cx="{f(cx-r*0.35)}" cy="{f(cy-r*0.38)}" rx="{f(r*0.2)}" ry="{f(r*0.13)}" fill="#fff" opacity="0.6" transform="rotate(-35 {f(cx-r*0.35)} {f(cy-r*0.38)})"/>')
    return out


def party_hat(cx, cy, h, w, rot, base, stripe, pom, trim="#ffffff"):
    # cx,cy = bottom centre of the hat
    d = f"M {f(-w/2)} 0 L 0 {f(-h)} L {f(w/2)} 0 Z"
    clip_id = f"hat{abs(hash((cx, cy, h))) % 100000}"
    stripes = "".join(f'<rect x="{f(-w)}" y="{f(-h + i*h/5)}" width="{f(2*w)}" height="{f(h/10)}" fill="{stripe}" transform="rotate(-18)"/>'
                      for i in range(6))
    dots = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(w*0.035)}" fill="{trim}"/>' for x, y in
                   [(-w*0.12, -h*0.55), (w*0.12, -h*0.3), (-w*0.2, -h*0.2), (w*0.05, -h*0.72)])
    inner = (f'<clipPath id="{clip_id}"><path d="{d}"/></clipPath>'
             f'<path d="{d}" fill="{base}"/><g clip-path="url(#{clip_id})">{stripes}{dots}</g>'
             f'<rect x="{f(-w/2-w*0.04)}" y="{f(-h*0.07)}" width="{f(w*1.08)}" height="{f(h*0.11)}" rx="{f(h*0.05)}" fill="{trim}"/>'
             f'<circle cx="0" cy="{f(-h)}" r="{f(w*0.17)}" fill="{pom}"/>'
             f'<circle cx="{f(-w*0.05)}" cy="{f(-h-w*0.05)}" r="{f(w*0.06)}" fill="#fff" opacity="0.6"/>')
    return g(inner, cx, cy, rot)


def tennis_ball(cx, cy, r, rot=0):
    seam = f'<path d="M {f(-r*0.95)} {f(-r*0.3)} C {f(-r*0.3)} {f(-r*0.1)} {f(-r*0.3)} {f(r*0.6)} {f(-r*0.55)} {f(r*0.85)}" fill="none" stroke="#fff" stroke-width="{f(r*0.09)}" stroke-linecap="round"/>' \
           f'<path d="M {f(r*0.95)} {f(r*0.3)} C {f(r*0.3)} {f(r*0.1)} {f(r*0.3)} {f(-r*0.6)} {f(r*0.55)} {f(-r*0.85)}" fill="none" stroke="#fff" stroke-width="{f(r*0.09)}" stroke-linecap="round"/>'
    return g(f'<circle r="{f(r)}" fill="#C9E52F"/><circle r="{f(r)}" fill="url(#ballShade)"/>{seam}', cx, cy, rot)


def yarn_ball(cx, cy, r, color, dark, rot=0):
    lines = ""
    for i in range(7):
        a = i * 26 - 70
        lines += f'<ellipse rx="{f(r*0.95)}" ry="{f(r*(0.25+0.08*i))}" fill="none" stroke="{dark}" stroke-width="{f(r*0.06)}" transform="rotate({a})" opacity="0.7"/>'
    tail = f'<path d="M {f(r*0.7)} {f(r*0.7)} C {f(r*1.3)} {f(r*1.2)} {f(r*1.8)} {f(r*0.6)} {f(r*2.3)} {f(r*1.1)}" fill="none" stroke="{color}" stroke-width="{f(r*0.09)}" stroke-linecap="round"/>'
    return g(f'{tail}<circle r="{f(r)}" fill="{color}"/>{lines}<circle r="{f(r)}" fill="url(#ballShade)"/>', cx, cy, rot)


def streamer(points, color, width=10, opacity=1):
    """Smooth curly ribbon through points (Catmull-Rom to bezier)."""
    if len(points) < 2:
        return ""
    d = f"M {f(points[0][0])} {f(points[0][1])}"
    pts = [points[0]] + points + [points[-1]]
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C {f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" opacity="{opacity}"/>'


def curl(cx, cy, r, turns, color, width=8, rot=0, opacity=1):
    pts = []
    n = int(turns * 24)
    for i in range(n + 1):
        t = i / n
        a = t * turns * 2 * math.pi
        rr = r * (0.25 + 0.75 * t)
        pts.append((cx + math.cos(a + math.radians(rot)) * rr + t * r * 2.2, cy + math.sin(a + math.radians(rot)) * rr))
    return streamer(pts, color, width, opacity)


def text(x, y, s, size, family, fill, anchor="middle", weight=400, ls=0, style="normal", extra=""):
    s = s.replace("&", "&amp;").replace("<", "&lt;")
    return (f'<text x="{f(x)}" y="{f(y)}" font-family="{family}" font-size="{size}" font-weight="{weight}" '
            f'font-style="{style}" fill="{fill}" text-anchor="{anchor}" letter-spacing="{ls}" {extra}>{s}</text>')


def rounded_rect_path(x, y, w, h, r):
    return (f"M {f(x+r)} {f(y)} H {f(x+w-r)} A {f(r)} {f(r)} 0 0 1 {f(x+w)} {f(y+r)} V {f(y+h-r)} "
            f"A {f(r)} {f(r)} 0 0 1 {f(x+w-r)} {f(y+h)} H {f(x+r)} A {f(r)} {f(r)} 0 0 1 {f(x)} {f(y+h-r)} V {f(y+r)} "
            f"A {f(r)} {f(r)} 0 0 1 {f(x+r)} {f(y)} Z")


def arch_path(x, y, w, h):
    r = w / 2
    return f"M {f(x)} {f(y+h)} V {f(y+r)} A {f(r)} {f(r)} 0 0 1 {f(x+w)} {f(y+r)} V {f(y+h)} Z"


def shape_path(photo, grow=0):
    x, y, w, h = photo["x"] - grow, photo["y"] - grow, photo["w"] + 2 * grow, photo["h"] + 2 * grow
    sh = photo.get("shape", "rect")
    if sh == "rounded":
        return rounded_rect_path(x, y, w, h, photo.get("radius", 40) + grow)
    if sh == "circle":
        r = w / 2
        cx, cy = x + r, y + h / 2
        return f"M {f(cx-r)} {f(cy)} A {f(r)} {f(r)} 0 1 0 {f(cx+r)} {f(cy)} A {f(r)} {f(r)} 0 1 0 {f(cx-r)} {f(cy)} Z"
    if sh == "arch":
        return arch_path(x, y, w, h)
    return f"M {f(x)} {f(y)} H {f(x+w)} V {f(y+h)} H {f(x)} Z"


def scallop_ring(photo, grow, bump, color):
    """Scalloped badge edge around a rect photo zone."""
    x, y, w, h = photo["x"] - grow, photo["y"] - grow, photo["w"] + 2 * grow, photo["h"] + 2 * grow
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{color}"/>']
    n_w = max(4, round(w / (bump * 1.7)))
    n_h = max(4, round(h / (bump * 1.7)))
    for i in range(n_w + 1):
        px = x + w * i / n_w
        out.append(f'<circle cx="{f(px)}" cy="{f(y)}" r="{f(bump)}" fill="{color}"/>')
        out.append(f'<circle cx="{f(px)}" cy="{f(y+h)}" r="{f(bump)}" fill="{color}"/>')
    for i in range(n_h + 1):
        py = y + h * i / n_h
        out.append(f'<circle cx="{f(x)}" cy="{f(py)}" r="{f(bump)}" fill="{color}"/>')
        out.append(f'<circle cx="{f(x+w)}" cy="{f(py)}" r="{f(bump)}" fill="{color}"/>')
    return "".join(out)
