"""The 12 theme versions: New Year, Christmas, Birthday x (2 general + 2 pet)."""
import math, random
from art import *

BRAND = ["#FF8F3F", "#F24BDF", "#DD07C4"]
PARTY = ["#FF8F3F", "#F24BDF", "#DD07C4", "#FFC93C", "#2EC4B6", "#9B8CFF"]


def lay(photo, to, msg, frm):
    return {"canvas": {"w": W, "h": H}, "photo": photo, "text": {"to": to, "message": msg, "from": frm}}


def tz(y, color, size=62, font="DM Serif Display", template="Dear {to},", x=150, w=1200, align="center"):
    return {"x": x, "y": y, "w": w, "font": font, "size": size, "color": color, "align": align, "template": template}


def mz(y, color, h=220, size=40, x=150, w=1200, max_lines=4, align="center", lh=1.35, valign="middle"):
    return {"x": x, "y": y, "w": w, "h": h, "font": "Plus Jakarta Sans", "size": size, "lineHeight": lh,
            "color": color, "align": align, "valign": valign, "maxLines": max_lines}


def fz(y, color, size=54, template="With love, {from}", x=150, w=1200, align="center"):
    return tz(y, color, size, "DM Serif Display", template, x, w, align)


def edge_points(photo, n, rng, jitter=30, sides=("top", "left", "right", "bottom")):
    """Points near the photo zone boundary (for overlay sprinkles)."""
    x, y, w, h = photo["x"], photo["y"], photo["w"], photo["h"]
    sh = photo.get("shape", "rect")
    pts = []
    for _ in range(n * 4):
        if len(pts) >= n:
            break
        if sh == "circle":
            a = rng.uniform(0, 2 * math.pi)
            r = w / 2 + rng.uniform(-jitter, jitter)
            pts.append((x + w / 2 + math.cos(a) * r, y + h / 2 + math.sin(a) * r))
            continue
        side = rng.choice(sides)
        if sh == "arch" and side == "top":
            a = rng.uniform(math.pi * 1.05, math.pi * 1.95)
            r = w / 2 + rng.uniform(-jitter, jitter)
            pts.append((x + w / 2 + math.cos(a) * r, y + w / 2 + math.sin(a) * r))
        elif side == "top":
            pts.append((rng.uniform(x, x + w), y + rng.uniform(-jitter, jitter)))
        elif side == "bottom":
            pts.append((rng.uniform(x, x + w), y + h + rng.uniform(-jitter, jitter)))
        elif side == "left":
            y0 = y + (w / 2 if sh == "arch" else 0)
            pts.append((x + rng.uniform(-jitter, jitter), rng.uniform(y0, y + h)))
        else:
            y0 = y + (w / 2 if sh == "arch" else 0)
            pts.append((x + w + rng.uniform(-jitter, jitter), rng.uniform(y0, y + h)))
    return pts


def box_of(photo, pad=0):
    return (photo["x"] - pad, photo["y"] - pad, photo["x"] + photo["w"] + pad, photo["y"] + photo["h"] + pad)


GOLD_TEXT = ('<linearGradient id="goldText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1C1"/>'
             '<stop offset="0.45" stop-color="#E9C46A"/><stop offset="0.78" stop-color="#B8892E"/><stop offset="1" stop-color="#F3D88F"/></linearGradient>')
BRAND_GRAD = ('<linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF8F3F"/>'
              '<stop offset="0.55" stop-color="#F24BDF"/><stop offset="1" stop-color="#DD07C4"/></linearGradient>')


# ======================= NEW YEAR =======================

def ny_midnight_gold():
    rng = random.Random(11)
    photo = {"x": 285, "y": 572, "w": 930, "h": 968, "shape": "arch", "frame": {"color": "#D9B25C", "width": 16}}
    defs = ('<radialGradient id="nyMid" cx="50%" cy="12%" r="95%"><stop offset="0" stop-color="#2C3A78"/>'
            '<stop offset="0.5" stop-color="#151C42"/><stop offset="1" stop-color="#0A0E24"/></radialGradient>' + GOLD_TEXT)
    bg = ['<rect width="1500" height="2100" fill="url(#nyMid)"/>',
          dot_snow(rng, 170, (60, 60, 1440, 2040), 1.2, 3.2, "#F5EBD3", (0.25, 0.9))]
    for _ in range(16):
        bg.append(sparkle(rng.uniform(80, 1420), rng.uniform(80, 1600), rng.uniform(8, 18), "#F3D88F", opacity=rng.uniform(0.5, 1)))
    bg.append(firework(205, 180, 112, "#E7C46A", n=20, sw=4.5, tip="dot", tip_color="#FFF1C1"))
    bg.append(firework(1295, 190, 104, "#F5E6C4", n=16, sw=4.2, tip="sparkle", tip_color="#E7C46A", rot=8))
    bg.append(firework(750, 150, 76, "#C99A45", n=14, sw=3.2, tip="dot", tip_color="#F3D88F", rot=4, opacity=0.85))
    bg.append(text(750, 404, "Happy New Year", 146, "DM Serif Display", "url(#goldText)"))
    bg.append(text(750, 506, "CHEERS TO NEW BEGINNINGS", 52, "League Gothic", "#F5EBD3", ls=10))
    bg.append(f'<path d="{shape_path(photo, 30)}" fill="none" stroke="#D9B25C" stroke-width="3"/>')
    bg.append(f'<path d="{shape_path(photo, 44)}" fill="none" stroke="#D9B25C" stroke-width="1.5" opacity="0.55"/>')
    for sx in (photo["x"] - 30, photo["x"] + photo["w"] + 30):
        bg.append(f'<rect x="{sx-10}" y="{photo["y"]+photo["h"]+20}" width="20" height="20" fill="#D9B25C" transform="rotate(45 {sx} {photo["y"]+photo["h"]+30})"/>')
    bg.append('<line x1="560" y1="1610" x2="700" y2="1610" stroke="#D9B25C" stroke-width="2"/><line x1="800" y1="1610" x2="940" y2="1610" stroke="#D9B25C" stroke-width="2"/>')
    bg.append(sparkle(750, 1610, 22, "#E7C46A"))
    ov = []
    for (x, y) in edge_points(photo, 9, rng, 26):
        ov.append(sparkle(x, y, rng.uniform(10, 22), rng.choice(["#FFF1C1", "#E7C46A"])))
    ov.append(confetti(rng, 22, (photo["x"] - 40, photo["y"] - 40, photo["x"] + photo["w"] + 40, photo["y"] + 280),
                       ["#E7C46A", "#F5E6C4", "#C99A45"], size=(8, 16), kinds=("rect", "circle"),
                       avoid=[(photo["x"] + 120, photo["y"] + 90, photo["x"] + photo["w"] - 120, photo["y"] + 400)]))
    layout = lay(photo, tz(1650, "#F5EEDC"), mz(1735, "#E6E0D0"), fz(1965, "#E7C46A"))
    return dict(theme="new-year", version="midnight-gold", name="Midnight Gold", audience="general",
                defs=defs, bg="".join(bg), overlay="".join(ov), layout=layout,
                ideas=["Happy New Year, {to}! Here's to a year full of good things.",
                       "Cheers to new beginnings, {to}. Wishing you health, joy and lots of laughter.",
                       "{pet} and I are sending you all our love for the year ahead!"],
                sample="Happy New Year, Grandma Rose! Biscuit and I are wishing you a year full of health, laughter and long walks together.")


def ny_champagne_toast():
    rng = random.Random(12)
    photo = {"x": 250, "y": 575, "w": 1000, "h": 950, "shape": "rounded", "radius": 36, "frame": {"color": "#FFFFFF", "width": 22}}
    defs = ('<radialGradient id="champBg" cx="50%" cy="28%" r="85%"><stop offset="0" stop-color="#FFFBF2"/>'
            '<stop offset="1" stop-color="#F3E3C3"/></radialGradient>'
            '<linearGradient id="fizz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBE59A"/><stop offset="1" stop-color="#DDA941"/></linearGradient>'
            '<filter id="shadow24"><feGaussianBlur stdDeviation="22"/></filter>' + GOLD_TEXT)

    def coupe(cx, cy, rot):
        bowl = "M -112 0 C -104 74 -42 98 0 98 C 42 98 104 74 112 0 Z"
        liquid = "M -104 22 C -92 80 -38 92 0 92 C 38 92 92 80 104 22 C 60 30 -60 30 -104 22 Z"
        bubbles = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="#fff" opacity="0.8"/>' for x, y, r in
                          [(-40, 60, 5), (-10, 48, 4), (22, 66, 6), (48, 44, 3.5), (-62, 40, 3), (8, 78, 3)])
        inner = (f'<path d="{liquid}" fill="url(#fizz)"/>{bubbles}'
                 f'<path d="{bowl}" fill="#ffffff" fill-opacity="0.18" stroke="#B8892E" stroke-width="5" stroke-linejoin="round"/>'
                 f'<ellipse cx="0" cy="0" rx="112" ry="13" fill="none" stroke="#B8892E" stroke-width="5"/>'
                 f'<path d="M -6 98 L -6 236 L 6 236 L 6 98 Z" fill="#B8892E"/>'
                 f'<ellipse cx="0" cy="240" rx="64" ry="12" fill="#B8892E"/>'
                 f'<path d="M -80 18 C -70 50 -50 66 -30 74" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.7"/>')
        return g(inner, cx, cy, rot, 0.78)

    bg = ['<rect width="1500" height="2100" fill="url(#champBg)"/>',
          '<circle cx="750" cy="180" r="190" fill="#F8DFA0" opacity="0.45" filter="url(#shadow24)"/>']
    # ribbon streamers and curls in the top corners
    for pts, col, wdt in [([(70, 250), (150, 170), (250, 150), (330, 90), (430, 110)], "#E2B04A", 16),
                          ([(75, 420), (170, 360), (150, 290), (250, 250)], "#F2B8B0", 14),
                          ([(1430, 250), (1350, 170), (1250, 150), (1170, 90), (1070, 110)], "#E2B04A", 16),
                          ([(1425, 420), (1330, 360), (1350, 290), (1250, 250)], "#F2B8B0", 14)]:
        bg.append(streamer(pts, "#B8892E", wdt + 4, 0.35))
        bg.append(streamer(pts, col, wdt))
    bg.append(curl(110, 330, 26, 1.5, "#E2B04A", 10))
    bg.append(curl(1330, 330, 26, 1.5, "#E2B04A", 10, rot=180))
    bg.append(confetti(rng, 26, (70, 70, 1430, 330), ["#E2B04A", "#F2B8B0", "#C99A45"], size=(10, 18), kinds=("circle", "rect"),
                       avoid=[(470, 60, 1030, 330)]))
    bg.append(coupe(675, 120, -13))
    bg.append(coupe(825, 120, 13))
    for a in (-60, -35, -10, 15, 40):
        r1, r2 = 26, 64
        x1, y1 = 750 + math.cos(math.radians(a - 90)) * r1, 96 + math.sin(math.radians(a - 90)) * r1
        x2, y2 = 750 + math.cos(math.radians(a - 90)) * r2, 96 + math.sin(math.radians(a - 90)) * r2
        if y2 > 62:
            bg.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="#C99A45" stroke-width="5" stroke-linecap="round"/>')
    bg.append(text(750, 400, "Here's to a", 66, "Fraunces", "#9A7420", style="italic", weight=500))
    bg.append(text(750, 510, "Sparkling New Year", 118, "DM Serif Display", "#3B2A14"))
    for _ in range(46):
        side = rng.choice([0, 1])
        x = rng.uniform(70, 215) if side == 0 else rng.uniform(1285, 1430)
        bg.append(bubble(x, rng.uniform(560, 1560), rng.uniform(6, 24), "#C9A24A", rng.uniform(0.4, 0.9)))
    bg.append(f'<path d="{shape_path(photo, 6)}" fill="#7A5A2A" opacity="0.28" filter="url(#shadow24)" transform="translate(0 18)"/>')
    ov = [bubble(photo["x"] + 6, photo["y"] + photo["h"] - 30, 22, "#C9A24A", 0.9),
          bubble(photo["x"] - 20, photo["y"] + photo["h"] - 90, 14, "#C9A24A", 0.9),
          bubble(photo["x"] + 40, photo["y"] + photo["h"] + 8, 10, "#C9A24A", 0.9),
          curl(photo["x"] + photo["w"] - 150, photo["y"] - 18, 30, 1.6, "#E2B04A", 9),
          sparkle(photo["x"] + photo["w"] - 10, photo["y"] + 70, 22, "#E2B04A"),
          sparkle(photo["x"] + 20, photo["y"] + 10, 16, "#E2B04A")]
    layout = lay(photo, tz(1600, "#3B2A14"), mz(1685, "#4A3A22"), fz(1918, "#9A7420"))
    return dict(theme="new-year", version="champagne-toast", name="Champagne Toast", audience="general",
                defs=defs, bg="".join(bg), overlay="".join(ov), layout=layout,
                ideas=["Here's to you, {to}! May this year sparkle as brightly as you do.",
                       "Raising a glass to you, {to}. Happy New Year and all my love.",
                       "{pet} would raise a glass too, if paws could hold one. Happy New Year, {to}!"],
                sample="Raising a glass to you, Grandma Rose! Wishing you a sparkling year ahead, full of joy, good health and plenty of cuddles from Biscuit.")


def ny_pawsome():
    rng = random.Random(13)
    photo = {"x": 260, "y": 545, "w": 980, "h": 970, "shape": "rounded", "radius": 70, "frame": {"color": "#F6C453", "width": 18}}
    defs = ('<linearGradient id="plum" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B1748"/>'
            '<stop offset="1" stop-color="#4A2263"/></linearGradient>' + BRAND_GRAD +
            '<filter id="glow"><feGaussianBlur stdDeviation="6"/></filter>')
    bg = ['<rect width="1500" height="2100" fill="url(#plum)"/>',
          dot_snow(rng, 120, (60, 60, 1440, 2040), 1.2, 3, "#F7E9FF", (0.25, 0.8))]
    bg.append(firework(205, 210, 135, "#F6C453", n=12, sw=6, tip="paw", tip_color="#F6C453"))
    bg.append(firework(1295, 220, 125, "#F24BDF", n=12, sw=6, tip="paw", tip_color="#F9A8EC", rot=12))
    bg.append(firework(1330, 1540, 70, "#2EC4B6", n=10, sw=4, tip="paw", tip_color="#7FE3D8"))
    bg.append(firework(160, 1500, 60, "#FF8F3F", n=10, sw=4, tip="paw", tip_color="#FFC093"))
    bg.append(text(750, 190, "Have a", 66, "Fredoka", "#F7E9FF", weight=600))
    bg.append(text(756, 384, "Pawsome", 196, "Fredoka", "#14081F", weight=700, extra='opacity="0.45"'))
    bg.append(text(750, 378, "Pawsome", 196, "Fredoka", "url(#brandGrad)", weight=700))
    bg.append(text(750, 480, "New Year!", 96, "Fredoka", "#F7E9FF", weight=600))
    head_box = (330, 120, 1170, 500)
    bg.append(confetti(rng, 70, (70, 70, 1430, 2030), PARTY, size=(16, 30),
                       kinds=("paw", "bone", "fish", "circle", "squiggle", "rect"),
                       avoid=[box_of(photo, 30), head_box, (130, 1570, 1370, 2045)]))
    ov = []
    tl, tr = (photo["x"], photo["y"]), (photo["x"] + photo["w"], photo["y"])
    ov.append(streamer([(tl[0] - 70, tl[1] + 140), (tl[0] - 20, tl[1] + 40), (tl[0] + 60, tl[1] - 20), (tl[0] + 150, tl[1] + 10), (tl[0] + 230, tl[1] - 30)], "#F24BDF", 12))
    ov.append(curl(tl[0] + 210, tl[1] - 40, 22, 1.4, "#F6C453", 9))
    ov.append(streamer([(tr[0] + 70, tr[1] + 150), (tr[0] + 15, tr[1] + 50), (tr[0] - 60, tr[1] - 20), (tr[0] - 160, tr[1] + 15), (tr[0] - 240, tr[1] - 25)], "#2EC4B6", 12))
    for (x, y) in edge_points(photo, 12, rng, 24, sides=("top", "left", "right")):
        ov.append(paw(x, y, rng.uniform(22, 32), rng.choice(PARTY), rot=rng.uniform(-40, 40)))
    layout = lay(photo, tz(1595, "#F7E9FF"), mz(1680, "#E9DDF3"), fz(1912, "#F6C453"))
    return dict(theme="new-year", version="pawsome-new-year", name="Pawsome New Year", audience="pet",
                defs=defs, bg="".join(bg), overlay="".join(ov), layout=layout,
                ideas=["Happy New Year, {to}! {pet} says this year is going to be pawsome.",
                       "Wishing you a pawsome New Year, {to}, from both of us (and our wagging tails).",
                       "New year, same good pet. Love you, {to}!"],
                sample="Happy New Year, Grandma Rose! Biscuit says this year is going to be pawsome, and he's never wrong about these things.")


def ny_resolutions():
    rng = random.Random(14)
    photo = {"x": 300, "y": 405, "w": 900, "h": 880, "shape": "rect", "frame": {"color": "#FFFFFF", "width": 0}}
    defs = ('<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFE3F7"/>'
            '<stop offset="1" stop-color="#E9F5FC"/></linearGradient>'
            '<pattern id="tapeDots" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#F7A8C4"/><circle cx="9" cy="9" r="3.2" fill="#ffffff"/></pattern>'
            '<pattern id="tapeStripes" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="22" height="22" fill="#9FE0CF"/><rect width="9" height="22" fill="#ffffff" opacity="0.8"/></pattern>'
            '<filter id="shadow16"><feGaussianBlur stdDeviation="16"/></filter>')
    navy = "#1D2E55"
    bg = ['<rect width="1500" height="2100" fill="url(#sky)"/>',
          confetti(rng, 60, (70, 70, 1430, 2030), ["#ffffff", "#FFD36E", "#F7A8C4", "#9FE0CF"], size=(10, 22),
                   kinds=("circle", "rect", "star"), avoid=[(240, 345, 1260, 1505), (300, 100, 1200, 330), (140, 1560, 1360, 1990)])]
    bg.append(text(750, 196, "Happy New Year!", 128, "Fredoka", navy, weight=700))

    def check(x, y, label):
        box = (f'<rect x="{f(x)}" y="{f(y-34)}" width="40" height="40" rx="8" fill="#ffffff" stroke="{navy}" stroke-width="4"/>'
               f'<path d="M {f(x+7)} {f(y-14)} L {f(x+17)} {f(y-4)} L {f(x+36)} {f(y-30)}" fill="none" stroke="#E8504A" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>')
        return box + text(x + 56, y, label, 54, "Caveat", navy, anchor="start", weight=700)
    bg.append(check(205, 296, "More treats"))
    bg.append(check(625, 296, "More naps"))
    bg.append(check(1005, 296, "More cuddles"))
    paper = (photo["x"] - 50, photo["y"] - 50, photo["w"] + 100, photo["h"] + 50 + 190)
    bg.append(f'<rect x="{paper[0]}" y="{paper[1]+14}" width="{paper[2]}" height="{paper[3]}" fill="#294a72" opacity="0.28" filter="url(#shadow16)"/>')
    bg.append(f'<rect x="{paper[0]}" y="{paper[1]}" width="{paper[2]}" height="{paper[3]}" fill="#FFFFFF"/>')
    bg.append(f'<rect x="{photo["x"]}" y="{photo["y"]}" width="{photo["w"]}" height="{photo["h"]}" fill="#E8EEF3"/>')
    bg.append(text(750, photo["y"] + photo["h"] + 120, "New year, same lovable me", 74, "Caveat", navy, weight=600))
    py = 2006
    for i, x in enumerate(range(150, 1380, 110)):
        bg.append(paw(x, py - (16 if i % 2 else 0), 34, navy, rot=90, opacity=0.18))
    ov = []
    for (cx, cy, rot, fill) in [(photo["x"] + 10, photo["y"] - 18, -32, "url(#tapeDots)"),
                                (photo["x"] + photo["w"] - 10, photo["y"] - 18, 30, "url(#tapeStripes)")]:
        ov.append(g(f'<rect x="-120" y="-34" width="240" height="68" fill="{fill}" opacity="0.88"/>'
                    '<path d="M -120 -34 l 6 8 l -6 8 l 6 8 l -6 8 l 6 8 l -6 8 l 6 8 l -6 8" fill="none"/>', cx, cy, rot))
    layout = lay(photo, tz(1585, navy), mz(1668, "#2A3C63"), fz(1900, "#E8504A", template="Love, {from}"))
    return dict(theme="new-year", version="pet-resolutions", name="Pet Resolutions", audience="pet",
                defs=defs, bg="".join(bg), overlay="".join(ov), layout=layout,
                ideas=["Happy New Year, {to}! {pet}'s resolutions: more treats, more naps, more visits to you.",
                       "New year, same lovable {pet}. Wishing you a wonderful year, {to}!",
                       "Our only resolution is to see you more often. Happy New Year, {to}!"],
                sample="Happy New Year, Grandma Rose! Biscuit's resolutions: more treats, more naps and many more visits to you. Mine too!")


# ======================= CHRISTMAS =======================

def xmas_evergreen_gold():
    rng = random.Random(21)
    photo = {"x": 300, "y": 575, "w": 900, "h": 980, "shape": "arch", "frame": {"color": "#D4AF5A", "width": 16}}
    defs = ('<radialGradient id="forest" cx="50%" cy="38%" r="85%"><stop offset="0" stop-color="#245A43"/>'
            '<stop offset="0.6" stop-color="#173D2E"/><stop offset="1" stop-color="#0D261C"/></radialGradient>'
            '<radialGradient id="baubleShade" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity="0.15"/>'
            '<stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient>' + GOLD_TEXT)
    greens = ["#2E6B45", "#3A7D50", "#25593A", "#4C8C5C", "#1E4A31"]
    bg = ['<rect width="1500" height="2100" fill="url(#forest)"/>',
          dot_snow(rng, 90, (60, 60, 1440, 2040), 1.5, 3.5, "#ffffff", (0.12, 0.35))]
    # garland swag along the top
    swag = []
    for i in range(34):
        t = i / 33
        x = 50 + t * 1400
        y = 92 + math.sin(t * math.pi) * 70
        swag.append((x, y))
        bg.append(pine_sprig(rng, x, y, rng.uniform(70, 110), rng.choice([rng.uniform(150, 210), rng.uniform(-30, 30)]), greens, needle=34, sw=4.2))
    for x, y in swag[::2]:
        bg.append(pine_sprig(rng, x, y, rng.uniform(60, 90), rng.uniform(60, 120), greens, needle=30, sw=4))
    bg.append(streamer([(60, 70), (300, 150), (560, 175), (750, 168), (940, 175), (1200, 150), (1440, 70)], "#D4AF5A", 8))
    for x, length, col, r in [(150, 150, "#B3202E", 34), (290, 96, "#D4AF5A", 30), (430, 70, "#F3E9D2", 24),
                              (1070, 70, "#F3E9D2", 24), (1210, 96, "#D4AF5A", 30), (1350, 150, "#B3202E", 34)]:
        t = (x - 50) / 1400
        top = 92 + math.sin(t * math.pi) * 70
        bg.append(bauble(x, top + length, r, col, "baubleShade", hang_from=(x, top)))
    bg.append(star5(750, 132, 46, "url(#goldText)", stroke="#8A6516", sw=2))
    bg.append(text(750, 432, "Merry Christmas", 168, "Great Vibes", "url(#goldText)"))
    bg.append(text(750, 526, "AND A JOYFUL NEW YEAR", 50, "League Gothic", "#F3E9D2", ls=10))
    bg.append(f'<path d="{shape_path(photo, 26)}" fill="none" stroke="#D4AF5A" stroke-width="2.5"/>')
    bg.append('<line x1="560" y1="1610" x2="700" y2="1610" stroke="#D4AF5A" stroke-width="2"/><line x1="800" y1="1610" x2="940" y2="1610" stroke="#D4AF5A" stroke-width="2"/>')
    bg.append(star5(750, 1610, 16, "#D4AF5A"))

    def holly_cluster(x, y, s, flip=1):
        out = holly_leaf(x - 46 * s * flip, y - 6 * s, 64 * s, -62 * flip, "#2E6B45")
        out += holly_leaf(x + 40 * s * flip, y - 30 * s, 60 * s, 48 * flip, "#3A7D50")
        out += holly_leaf(x - 4 * s * flip, y - 52 * s, 56 * s, -8 * flip, "#25593A")
        out += pine_sprig(rng, x, y, 120 * s, -150 if flip == 1 else -30, ["#2E6B45", "#4C8C5C"], needle=26 * s, sw=3.4)
        out += berry(x - 4 * s, y - 16 * s, 15 * s) + berry(x + 20 * s, y - 2 * s, 14 * s) + berry(x - 22 * s, y + 4 * s, 13 * s)
        return out
    ov = [holly_cluster(photo["x"] + 10, photo["y"] + photo["h"] - 10, 1.0, 1),
          holly_cluster(photo["x"] + photo["w"] - 10, photo["y"] + photo["h"] - 10, 0.85, -1)]
    for (x, y) in edge_points(photo, 6, rng, 20, sides=("top",)):
        ov.append(sparkle(x, y, rng.uniform(10, 18), "#F3D88F"))
    layout = lay(photo, tz(1650, "#F7F0E1"), mz(1735, "#E8E2D2"), fz(1965, "#E2C275"))
    return dict(theme="christmas", version="evergreen-gold", name="Evergreen & Gold", audience="general",
                defs=defs, bg="".join(bg), overlay="".join(ov), layout=layout,
                ideas=["Merry Christmas, {to}! Wishing you a season full of warmth and joy.",
                       "Sending you love and comfort and joy this Christmas, {to}.",
                       "Merry Christmas from {pet} and me. We can't wait to see you!"],
                sample="Merry Christmas, Grandma Rose! Wishing you a season full of warmth and joy. Biscuit and I can't wait to see you soon.")


def xmas_winter_wreath():
    rng = random.Random(22)
    photo = {"x": 345, "y": 525, "w": 810, "h": 810, "shape": "circle", "frame": {"color": "#FFFFFF", "width": 0}}
    cx, cy, r0 = 750, 525 + 405, 405
    defs = ('<linearGradient id="snowBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E4EEF5"/>'
            '<stop offset="0.45" stop-color="#F7F4EE"/><stop offset="1" stop-color="#F5EFE5"/></linearGradient>'
            '<radialGradient id="velvet" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#D2283F"/><stop offset="1" stop-color="#8E1428"/></radialGradient>'
            '<filter id="shadow20"><feGaussianBlur stdDeviation="20"/></filter>')
    bg = ['<rect width="1500" height="2100" fill="url(#snowBg)"/>']
    for _ in range(30):
        x, y = rng.uniform(80, 1420), rng.uniform(80, 2020)
        if (x - cx) ** 2 + (y - cy) ** 2 < 560 ** 2 or (130 < x < 1370 and 1560 < y < 2000) or (220 < x < 1280 and 80 < y < 320):
            continue
        bg.append(snowflake(x, y, rng.uniform(12, 30), "#A9C1D3", opacity=rng.uniform(0.5, 0.9)))
    bg.append(dot_snow(rng, 80, (60, 60, 1440, 2040), 2, 5, "#C5D6E3", (0.4, 0.9)))
    bg.append(text(750, 205, "Merry Christmas", 138, "DM Serif Display", "#8E1B2A"))
    bg.append(text(750, 285, "Peace, love & joy", 58, "Fraunces", "#2E5A43", style="italic", weight=400))
    bg.append(f'<circle cx="{cx}" cy="{cy+18}" r="{r0+90}" fill="#3B5A4A" opacity="0.22" filter="url(#shadow20)"/>')
    bg.append(f'<circle cx="{cx}" cy="{cy}" r="{r0+70}" fill="#2B5B40"/>')
    # wreath (overlay): ring of sprigs
    greens = ["#24573A", "#2E6B45", "#3A7D50", "#1B4730", "#4F8F63", "#2F6656"]
    ov = []
    for layer, (rr, n, ln) in enumerate([(r0 + 62, 60, 120), (r0 + 30, 60, 110), (r0 + 6, 48, 90)]):
        for i in range(n):
            a = 2 * math.pi * i / n + rng.uniform(-0.04, 0.04) + layer * 0.05
            x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr
            tang = math.degrees(a) + 90 + rng.uniform(-25, 25)
            ov.append(pine_sprig(rng, x, y, ln * rng.uniform(0.8, 1.1), tang, greens, needle=30, sw=4.4))
    for i in range(16):
        a = 2 * math.pi * i / 16 + 0.2
        bx, by = cx + math.cos(a) * (r0 + 52), cy + math.sin(a) * (r0 + 52)
        if math.sin(a) > 0.85:
            continue
        ov.append(berry(bx, by, 15) + berry(bx + 20, by + 12, 13) + berry(bx - 14, by + 18, 12))
    for i in range(6):
        a = 2 * math.pi * i / 6 + 0.55
        px, py = cx + math.cos(a) * (r0 + 70), cy + math.sin(a) * (r0 + 70)
        cone = (f'<ellipse rx="22" ry="34" fill="#7A4A26"/>' +
                "".join(f'<path d="M {f(-18+j%3*12)} {f(-26+j//3*14)} q 6 8 12 0" fill="none" stroke="#4A2913" stroke-width="3"/>' for j in range(12)))
        ov.append(g(cone, px, py, math.degrees(a) + 90))
    ov.append(bow(cx, cy + r0 + 70, 150, "url(#velvet)", "#7A0F20"))
    for (x, y) in edge_points(photo, 8, rng, 60):
        ov.append(sparkle(x, y, rng.uniform(8, 14), "#F3D88F"))
    layout = lay(photo, tz(1615, "#8E1B2A"), mz(1698, "#3A2A26"), fz(1928, "#2E5A43"))
    return dict(theme="christmas", version="winter-wreath", name="Winter Wreath", audience="general",
                defs=defs, bg="".join(bg), overlay="".join(ov), layout=layout,
                ideas=["Merry Christmas, {to}! Peace, love and joy to you this season.",
                       "Wishing you a cozy Christmas and a bright New Year, {to}.",
                       "{pet} and I are sending you the warmest Christmas hugs, {to}."],
                sample="Merry Christmas, Grandma Rose! Biscuit and I are sending you the warmest hugs. Peace, love and joy to you this season.")


PIX = {
    "paw": ["..X.X..", ".XX.XX.", "X.....X", "..XXX..", ".XXXXX.", ".XXXXX.", "..X.X.."],
    "tree": ["...X...", "..XXX..", ".XXXXX.", "..XXX..", ".XXXXX.", "XXXXXXX", "...X..."],
    "bone": [".X.....X.", "XXXXXXXXX", ".XXXXXXX.", "XXXXXXXXX", ".X.....X."],
    "flake": ["X..X..X", ".X.X.X.", "..XXX..", "XXXXXXX", "..XXX..", ".X.X.X.", "X..X..X"],
    "fish": ["..XX....", ".XXXX..X", "XX.XXXXX", "XXXXXXXX", ".XXXX..X", "..XX...."],
    "heart": [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."],
}


def stitch_grid(x0, y0, rows, st, color):
    out = []
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            if ch == "X":
                x, y = x0 + c * st + st / 2, y0 + r * st + st / 2
                out.append(f'<ellipse cx="{f(x - st*0.2)}" cy="{f(y)}" rx="{f(st*0.26)}" ry="{f(st*0.44)}" transform="rotate(-28 {f(x-st*0.2)} {f(y)})" fill="{color}"/>'
                           f'<ellipse cx="{f(x + st*0.2)}" cy="{f(y)}" rx="{f(st*0.26)}" ry="{f(st*0.44)}" transform="rotate(28 {f(x+st*0.2)} {f(y)})" fill="{color}"/>')
    return "".join(out)


def knit_band(y0, motifs, st, colors, x_from=75, x_to=1425):
    out = []
    widths = [len(PIX[m][0]) * st for m in motifs]
    gap = (x_to - x_from - sum(widths)) / max(1, len(motifs) - 1)
    x = x_from
    for m, wdt, col in zip(motifs, widths, colors):
        rows = PIX[m]
        out.append(stitch_grid(x, y0 + (7 - len(rows)) * st / 2, rows, st, col))
        x += wdt + gap
    return "".join(out)


def zigzag_row(y, st, color, x_from=75, x_to=1425):
    n = int((x_to - x_from) / st)
    row = "".join("X" if i % 2 == 0 else "." for i in range(n))
    row2 = "".join("." if i % 2 == 0 else "X" for i in range(n))
    return stitch_grid(x_from, y, [row, row2], st, color)


def santa_hat(cx, cy, s, rot):
    inner = ('<path d="M -0.55 0 C -0.5 -0.5 -0.1 -0.95 0.35 -1.0 C 0.75 -1.02 0.95 -0.7 1.05 -0.35 C 0.85 -0.55 0.6 -0.62 0.4 -0.45 C 0.25 -0.32 0.45 -0.1 0.55 0 Z" fill="#C8202F"/>'
             '<path d="M 0.35 -1.0 C 0.75 -1.02 0.95 -0.7 1.05 -0.35 C 0.95 -0.5 0.75 -0.6 0.6 -0.6 Z" fill="#8E1428" opacity="0.6"/>'
             '<rect x="-0.68" y="-0.12" width="1.36" height="0.3" rx="0.15" fill="#F7F4EE"/>'
             '<circle cx="1.05" cy="-0.3" r="0.17" fill="#F7F4EE"/>')
    return g(inner, cx, cy, rot, s)


def xmas_pawsitively():
    rng = random.Random(23)
    photo = {"x": 270, "y": 530, "w": 960, "h": 930, "shape": "rounded", "radius": 40, "frame": {"color": "#F7F4EE", "width": 22}}
    defs = ('<pattern id="knit" width="22" height="24" patternUnits="userSpaceOnUse">'
            '<rect width="22" height="24" fill="#B71F2E"/>'
            '<ellipse cx="6.5" cy="12" rx="5" ry="10" transform="rotate(-28 6.5 12)" fill="#C42736"/>'
            '<ellipse cx="15.5" cy="12" rx="5" ry="10" transform="rotate(28 15.5 12)" fill="#C42736"/>'
            '<path d="M 6.5 4 L 6.5 18" stroke="#A01826" stroke-width="1" opacity="0.5" transform="rotate(-28 6.5 12)"/>'
            '</pattern>'
            '<filter id="shadow12"><feGaussianBlur stdDeviation="10"/></filter>')
    cream, green = "#F7F4EE", "#2E7D4F"
    bg = ['<rect width="1500" height="2100" fill="url(#knit)"/>']
    st = 18
    bg.append(zigzag_row(66, st, cream))
    bg.append(knit_band(112, ["paw", "tree", "bone", "flake", "fish", "tree", "paw"], st, [cream, green, cream, cream, cream, green, cream]))
    bg.append(zigzag_row(246, st, cream))
    bg.append(text(750, 346, "HAVE A PAWSITIVELY", 62, "League Gothic", cream, ls=12))
    bg.append(text(756, 476, "Merry Christmas", 134, "Fredoka", "#6E0F19", weight=700, extra='opacity="0.6"'))
    bg.append(text(750, 470, "Merry Christmas", 134, "Fredoka", cream, weight=700))
    bg.append(santa_hat(286, 384, 84, -16))
    bg.append(f'<path d="{shape_path(photo, 4)}" fill="#5A0A14" opacity="0.4" filter="url(#shadow12)" transform="translate(0 12)"/>')
    bg.append(zigzag_row(1985, st, cream))
    ov = []
    for (x, y) in edge_points(photo, 9, rng, 30, sides=("left", "right", "bottom")):
        ov.append(snowflake(x, y, rng.uniform(14, 22), "#FFFFFF"))
    layout = lay(photo, tz(1525, cream), mz(1610, "#FBE3E5", h=220), fz(1845, "#FFD9A0", template="Love, {from}"))
    return dict(theme="christmas", version="pawsitively-merry", name="Pawsitively Merry", audience="pet",
                defs=defs, bg="".join(bg), overlay="".join(ov), layout=layout,
                ideas=["Merry Christmas, {to}! {pet} has been pawsitively good this year (mostly).",
                       "Wishing you a pawsitively merry Christmas, {to}, from both of us!",
                       "{pet} wanted to be in the Christmas card. Who could say no? Merry Christmas, {to}!"],
                sample="Merry Christmas, Grandma Rose! Biscuit insisted on being in the Christmas card this year. Who could say no to that face?")


def stocking(cx, cy, s):
    inner = ('<path d="M -0.35 -1 L 0.25 -1 L 0.25 0.15 C 0.25 0.35 0.45 0.4 0.62 0.45 C 0.9 0.53 0.92 0.98 0.55 1.0 L -0.05 1.0 C -0.32 1.0 -0.4 0.8 -0.37 0.55 Z" fill="#B3202E"/>'
             '<path d="M -0.37 0.62 C -0.38 0.85 -0.28 1.0 -0.05 1.0 L 0.12 1.0 C 0.05 0.85 0.05 0.72 0.1 0.62 Z" fill="#F7F4EE"/>'
             '<path d="M 0.62 0.45 C 0.9 0.53 0.92 0.98 0.55 1.0 L 0.45 1.0 C 0.6 0.85 0.62 0.62 0.5 0.43 Z" fill="#F7F4EE"/>'
             '<rect x="-0.45" y="-1.12" width="0.82" height="0.32" rx="0.08" fill="#F7F4EE"/>')
    toys = bone(-0.12 * s, -1.25 * s, 0.95 * s, 0.24 * s, "#E8C38C", rot=-62, stroke="#9C6A2C", sw=3) + fish(0.2 * s, -1.28 * s, 0.85 * s, "#F29A6B", rot=-72, eye="#7A3E12")
    return f'<g transform="translate({f(cx)} {f(cy)})">{toys}<g transform="scale({f(s)})">{inner}</g></g>'


def xmas_dear_santa():
    rng = random.Random(24)
    photo = {"x": 310, "y": 455, "w": 880, "h": 830, "shape": "rect", "frame": {"color": "#FFFFFF", "width": 0}}
    ink, red = "#3B2A22", "#9E1F2E"
    defs = ('<pattern id="cane" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
            '<rect width="34" height="34" fill="#F7F1E6"/><rect width="16" height="34" fill="#C1272D"/></pattern>'
            '<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" seed="9"/>'
            '<feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0 0.2  0 0 0 0.09 0"/></filter>'
            '<radialGradient id="vign" cx="50%" cy="45%" r="75%"><stop offset="0.65" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#6b4a1e" stop-opacity="0.22"/></radialGradient>'
            '<filter id="shadow14"><feGaussianBlur stdDeviation="14"/></filter>'
            '<filter id="inkStamp"><feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="6"/></filter>')
    bg = ['<rect width="1500" height="2100" fill="#F3E6CD"/>', '<rect width="1500" height="2100" filter="url(#paper)"/>',
          '<rect width="1500" height="2100" fill="url(#vign)"/>',
          f'<path d="M 60 60 H 1440 V 2040 H 60 Z M 92 92 V 2008 H 1408 V 92 Z" fill="url(#cane)" fill-rule="evenodd"/>']
    bg.append(text(150, 250, "Dear Santa,", 132, "Caveat", red, anchor="start", weight=700))
    bg.append(text(155, 352, "I've been (mostly) good this year.", 72, "Caveat", ink, anchor="start", weight=600))
    # polaroid print behind the photo, with the "Exhibit A" caption on its strip
    px0, py0, pw_, ph_ = photo["x"] - 28, photo["y"] - 28, photo["w"] + 56, photo["h"] + 28 + 120
    bg.append(f'<rect x="{px0}" y="{py0+14}" width="{pw_}" height="{ph_}" fill="#5a3a12" opacity="0.3" filter="url(#shadow14)"/>')
    bg.append(f'<rect x="{px0}" y="{py0}" width="{pw_}" height="{ph_}" fill="#FFFDF8"/>')
    bg.append(text(750, photo["y"] + photo["h"] + 82, "Exhibit A: proof of good behavior", 62, "Caveat", red, weight=700))
    bg.append(stocking(205, 1918, 78))
    # cookies and milk, bottom right
    bg.append('<g transform="translate(1265 1975)">'
              '<rect x="-38" y="-120" width="76" height="120" rx="10" fill="#FFFFFF" stroke="#C9B79A" stroke-width="4"/>'
              '<rect x="-38" y="-120" width="76" height="22" fill="#E7E1D6"/>'
              '<ellipse cx="-95" cy="-8" rx="62" ry="15" fill="#E6D3B3"/>'
              '<circle cx="-110" cy="-34" r="34" fill="#C98A4B"/><circle cx="-118" cy="-42" r="6" fill="#5A3212"/><circle cx="-98" cy="-28" r="5" fill="#5A3212"/><circle cx="-120" cy="-22" r="4" fill="#5A3212"/>'
              '<circle cx="-70" cy="-30" r="30" fill="#D59A5A"/><circle cx="-76" cy="-36" r="5" fill="#5A3212"/><circle cx="-62" cy="-24" r="4" fill="#5A3212"/>'
              '</g>')
    bg.append(f'<g filter="url(#inkStamp)" opacity="0.85">{paw(735, 1940, 66, red, rot=-12)}</g>')
    bg.append(text(790, 1958, "xoxo", 54, "Caveat", red, anchor="start", weight=700))
    corner = '<path d="M 0 0 L 92 0 L 0 92 Z" fill="#7A1622"/><path d="M 0 0 L 92 0 L 0 92 Z" fill="none" stroke="#5A0E18" stroke-width="2"/>'
    x0, y0, x1, y1 = photo["x"] - 6, photo["y"] - 6, photo["x"] + photo["w"] + 6, photo["y"] + photo["h"] + 6
    ov = [g(corner, x0, y0, 0), g(corner, x1, y0, 90), g(corner, x1, y1, 180), g(corner, x0, y1, 270)]
    layout = lay(photo, tz(1452, red, template="To {to},"), mz(1535, ink, h=220, x=210, w=1080), fz(1768, red, template="Love, {from}"))
    return dict(theme="christmas", version="dear-santa", name="Dear Santa", audience="pet",
                defs=defs, bg="".join(bg), overlay="".join(ov), layout=layout,
                ideas=["Merry Christmas, {to}! {pet} has been mostly good this year. Santa is reviewing the evidence.",
                       "Exhibit A: one very good {pet}. Merry Christmas, {to}!",
                       "{pet} wrote to Santa and asked for one thing: more time with you. Merry Christmas, {to}!"],
                sample="Merry Christmas, Grandma Rose! Biscuit wrote to Santa and asked for just one thing: more cuddles with you. (And maybe a bone.)")


# ======================= BIRTHDAY =======================

def bd_confetti_pop():
    rng = random.Random(31)
    photo = {"x": 240, "y": 515, "w": 1020, "h": 1010, "shape": "rounded", "radius": 56, "frame": {"color": "#FFFFFF", "width": 24}}
    defs = BRAND_GRAD
    bg = ['<rect width="1500" height="2100" fill="#FFF7EF"/>']
    bg.append(confetti(rng, 64, (70, 70, 1430, 2030), PARTY, size=(30, 62), kinds=("circle", "tri", "squiggle", "star", "rect"),
                       avoid=[box_of(photo, 60), (300, 110, 1200, 470), (140, 1570, 1360, 2000)]))
    bg.append(text(750, 220, "HAPPY", 140, "League Gothic", "#DD07C4", ls=34))
    bg.append(text(750, 432, "Birthday", 220, "DM Serif Display", "url(#brandGrad)"))
    bg.append(f'<path d="{shape_path(photo)}" fill="#FFC93C" transform="translate(28 28)"/>')
    ov = [curl(photo["x"] + photo["w"] - 40, photo["y"] + 210, 26, 1.6, "#2EC4B6", 11, rot=90),
          confetti(rng, 9, (photo["x"] - 50, photo["y"] + photo["h"] - 90, photo["x"] + 140, photo["y"] + photo["h"] + 50), PARTY, size=(22, 38),
                   kinds=("circle", "tri", "rect")),
          star5(photo["x"] + photo["w"] + 8, photo["y"] + 120, 34, "#FFC93C", rot=12)]
    layout = lay(photo, tz(1600, "#2A1B3D"), mz(1685, "#3A2C4D"), fz(1918, "#DD07C4"))
    return dict(theme="birthday", version="confetti-pop", name="Confetti Pop", audience="general",
                defs=defs, bg="".join(bg), overlay="".join(ov), layout=layout,
                ideas=["Happy Birthday, {to}! Hope your day is as wonderful as you are.",
                       "Wishing you the happiest of birthdays, {to}. Let's celebrate!",
                       "Happy Birthday from {pet} and me, {to}! Have the best day."],
                sample="Happy Birthday, Grandma Rose! Hope your day is full of cake, laughter and everything you love. Biscuit sends extra birthday kisses!")


def bd_balloon_bouquet():
    rng = random.Random(32)
    photo = {"x": 255, "y": 560, "w": 990, "h": 990, "shape": "rect", "frame": {"color": "#FFFFFF", "width": 28}}
    defs = ('<linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE3D3"/>'
            '<stop offset="0.5" stop-color="#F8DDEE"/><stop offset="1" stop-color="#E8E0FA"/></linearGradient>'
            '<radialGradient id="balShade" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity="0.2"/>'
            '<stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/></radialGradient>'
            '<filter id="cloud"><feGaussianBlur stdDeviation="30"/></filter><filter id="shadow22"><feGaussianBlur stdDeviation="22"/></filter>')
    cols = ["#FF7A6B", "#F7C548", "#7FD8BE", "#F7A8C4", "#B9A3F5"]
    bg = ['<rect width="1500" height="2100" fill="url(#dusk)"/>',
          '<g filter="url(#cloud)" opacity="0.7"><ellipse cx="300" cy="1700" rx="260" ry="70" fill="#fff"/><ellipse cx="1200" cy="1780" rx="300" ry="80" fill="#fff"/><ellipse cx="750" cy="560" rx="380" ry="90" fill="#fff"/></g>']
    clusters = [((300, 760), [(175, 290, 96, 0, -10), (300, 205, 86, 1, 6), (280, 390, 84, 2, -4), (160, 465, 76, 3, -14), (385, 345, 70, 4, 10)]),
                ((1200, 760), [(1325, 290, 96, 2, 10), (1200, 205, 86, 0, -6), (1220, 390, 84, 4, 4), (1340, 465, 76, 1, 14), (1115, 345, 70, 3, -10)])]
    for end, bl in clusters:
        for (x, y, r, ci, rot) in sorted(bl, key=lambda b: b[1]):
            bg.append(balloon(x, y, r, cols[ci], "balShade", string_end=end, rot=rot))
    bg.append(text(750, 250, "Happy", 132, "DM Serif Display", "#3D1F4F"))
    bg.append(text(750, 392, "Birthday", 132, "DM Serif Display", "#3D1F4F"))
    bg.append(text(750, 470, "another trip around the sun", 48, "Fraunces", "#7A4F86", style="italic", weight=400))
    bg.append(f'<rect x="{photo["x"]}" y="{photo["y"]+20}" width="{photo["w"]}" height="{photo["h"]}" fill="#6A3F6E" opacity="0.25" filter="url(#shadow22)"/>')
    ov = [balloon(photo["x"] + 20, photo["y"] + 70, 66, "#FF7A6B", "balShade", string_end=(photo["x"] - 40, photo["y"] + 460), rot=-12),
          balloon(photo["x"] + photo["w"] - 4, photo["y"] + 210, 54, "#F7C548", "balShade", string_end=(photo["x"] + photo["w"] + 50, photo["y"] + 560), rot=10)]
    layout = lay(photo, tz(1620, "#3D1F4F"), mz(1705, "#4A3358"), fz(1940, "#C2456B"))
    return dict(theme="birthday", version="balloon-bouquet", name="Balloon Bouquet", audience="general",
                defs=defs, bg="".join(bg), overlay="".join(ov), layout=layout,
                ideas=["Happy Birthday, {to}! Here's to another wonderful trip around the sun.",
                       "Sending you a bouquet of birthday wishes, {to}. Enjoy every moment!",
                       "{pet} and I hope your birthday is as lovely as you are, {to}."],
                sample="Happy Birthday, Grandma Rose! Here's to another wonderful trip around the sun. Biscuit and I love you to the moon and back.")


def bd_pawty_time():
    rng = random.Random(33)
    photo = {"x": 340, "y": 600, "w": 820, "h": 820, "shape": "circle", "frame": {"color": "#FFC93C", "width": 22}}
    cx, cy, r = 750, 1010, 410
    defs = ('<radialGradient id="mint" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#E6FBF4"/>'
            '<stop offset="1" stop-color="#C3EEDF"/></radialGradient>' + BRAND_GRAD +
            '<filter id="shadow18"><feGaussianBlur stdDeviation="18"/></filter>')
    bg = ['<rect width="1500" height="2100" fill="url(#mint)"/>']
    for _ in range(46):
        x, y = rng.uniform(80, 1420), rng.uniform(560, 2020)
        if (x - cx) ** 2 + (y - cy) ** 2 < (r + 80) ** 2 or y > 1440:
            continue
        k = rng.random()
        bg.append(paw(x, y, rng.uniform(34, 50), "#8FD9C0", rot=rng.uniform(-30, 30)) if k < 0.6 else
                  bone(x, y, rng.uniform(60, 80), 16, "#8FD9C0", rot=rng.uniform(0, 180)))
    # bunting
    x0, x1, ytop, sag = 60, 1440, 96, 74
    pts = [(x0 + (x1 - x0) * t / 40, ytop + math.sin(math.pi * t / 40) * sag) for t in range(41)]
    bg.append(streamer(pts, "#0F7F70", 4))
    n = 9
    for i in range(n):
        t = (i + 0.5) / n
        fx = x0 + (x1 - x0) * t
        fy = ytop + math.sin(math.pi * t) * sag
        ang = math.degrees(math.atan(math.cos(math.pi * t) * math.pi * sag / (x1 - x0)))
        flag = (f'<path d="M -62 0 L 62 0 L 0 140 Z" fill="{PARTY[i % 6]}"/>' + paw(0, 48, 44, "#ffffff", opacity=0.9))
        bg.append(g(flag, fx, fy, ang))
    bg.append(text(756, 418, "It's Pawty Time!", 126, "Fredoka", "#0F5E55", weight=700, extra='opacity="0.25"'))
    bg.append(text(750, 412, "It's Pawty Time!", 126, "Fredoka", "url(#brandGrad)", weight=700))
    bg.append('<rect x="520" y="456" width="460" height="74" rx="37" fill="#0FA38F"/>')
    bg.append(text(750, 514, "HAPPY BIRTHDAY", 58, "League Gothic", "#ffffff", ls=12))
    bg.append(f'<circle cx="{cx}" cy="{cy+14}" r="{r+6}" fill="#0F5E55" opacity="0.22" filter="url(#shadow18)"/>')
    for i, x in enumerate(range(140, 1400, 90)):
        bg.append(paw(x, 2000, 30, "#7ACFB4", rot=90) if i % 2 == 0 else bone(x, 2000, 52, 13, "#7ACFB4", rot=0))
    ang = math.radians(42)
    hx, hy = cx + math.sin(ang) * (r - 6), cy - math.cos(ang) * (r - 6)
    ov = [party_hat(hx, hy, 230, 160, 38, "#2EC4B6", "#FFFFFF", "#F24BDF", trim="#FFC93C")]
    ov.append(confetti(rng, 12, (photo["x"] - 50, cy + 160, photo["x"] + 160, cy + r + 40), PARTY, size=(18, 30),
                       kinds=("paw", "circle", "squiggle"), avoid=[(photo["x"] + 120, cy + 100, cx + 200, cy + r - 60)]))
    layout = lay(photo, tz(1508, "#0F3D3A"), mz(1592, "#1F4A46"), fz(1826, "#C4069F"))
    return dict(theme="birthday", version="pawty-time", name="Pawty Time", audience="pet",
                defs=defs, bg="".join(bg), overlay="".join(ov), layout=layout,
                ideas=["Happy Birthday, {to}! {pet} says it's pawty time!",
                       "It's your birthday, {to}! {pet} is ready to party (and share the cake).",
                       "Wishing you the happiest birthday, {to}, from your favorite furry party animal."],
                sample="Happy Birthday, Grandma Rose! Biscuit says it's pawty time, and he's ready to help you with the cake. Have the best day!")


def bd_treats_on_me():
    rng = random.Random(34)
    photo = {"x": 325, "y": 645, "w": 850, "h": 850, "shape": "rect", "frame": {"color": "#FFFFFF", "width": 0}}
    brown = "#5A3212"
    defs = ('<linearGradient id="butter" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0BF"/>'
            '<stop offset="1" stop-color="#FFD9AE"/></linearGradient>'
            '<radialGradient id="ballShade" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity="0.25"/>'
            '<stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/></radialGradient>'
            '<filter id="shadow16"><feGaussianBlur stdDeviation="16"/></filter>')
    bg = ['<rect width="1500" height="2100" fill="url(#butter)"/>']
    avoid = [box_of(photo, 95), (60, 40, 1440, 560), (60, 1580, 1440, 2040)]
    placed, spots = 0, []
    for _ in range(2000):
        if placed >= 24:
            break
        x, y = rng.uniform(110, 1390), rng.uniform(580, 1990)
        if any(a0 < x < a2 and a1 < y < a3 for a0, a1, a2, a3 in avoid) or any((x - a) ** 2 + (y - b) ** 2 < 120 ** 2 for a, b in spots):
            continue
        spots.append((x, y))
        k = rng.choice(["bone", "bone", "fish", "ball", "yarn", "kibble"])
        if k == "bone":
            bg.append(bone(x, y, rng.uniform(70, 100), 22, "#E9C08A", rot=rng.uniform(0, 180), stroke="#B07A3F", sw=3))
        elif k == "fish":
            bg.append(fish(x, y, rng.uniform(70, 90), "#E99A62", rot=rng.uniform(-40, 40), eye="#7A3E12"))
        elif k == "ball":
            bg.append(tennis_ball(x, y, rng.uniform(28, 36), rng.uniform(0, 180)))
        elif k == "yarn":
            bg.append(yarn_ball(x, y, rng.uniform(28, 34), "#F27C9B", "#C24A6C", rng.uniform(0, 180)))
        else:
            bg.append("".join(f'<circle cx="{f(x+rng.uniform(-30,30))}" cy="{f(y+rng.uniform(-20,20))}" r="{f(rng.uniform(7,10))}" fill="#B9773A"/>' for _ in range(4)))
        placed += 1
    # headline on a big bone
    bg.append(f'<g filter="url(#shadow16)" opacity="0.35">{bone(750, 268, 1180, 186, "#B07A3F")}</g>')
    bg.append(bone(750, 256, 1180, 186, "#FFFCF4", stroke="#E2B26B", sw=6))
    bg.append(text(750, 296, "Happy Birthday!", 110, "Fredoka", "#8A4B16", weight=700))
    bg.append(text(750, 520, "THE TREATS ARE ON ME", 60, "League Gothic", "#B5541C", ls=12))
    bg.append(f'<g filter="url(#shadow16)" opacity="0.4" transform="translate(0 14)">{scallop_ring(photo, 44, 28, "#B07A3F")}</g>')
    bg.append(scallop_ring(photo, 50, 28, "#F2A65A"))
    bg.append(scallop_ring(photo, 30, 22, "#FFFCF4"))
    ov = [tennis_ball(photo["x"] + photo["w"] + 6, photo["y"] + photo["h"] - 10, 62, 30),
          bone(photo["x"] + 10, photo["y"] + 12, 170, 40, "#E9C08A", rot=-35, stroke="#B07A3F", sw=4)]
    layout = lay(photo, tz(1618, brown), mz(1700, "#5A3A1E"), fz(1926, "#C0571B"))
    return dict(theme="birthday", version="treats-on-me", name="Treats On Me", audience="pet",
                defs=defs, bg="".join(bg), overlay="".join(ov), layout=layout,
                ideas=["Happy Birthday, {to}! The treats are on {pet} today.",
                       "{pet} saved the best treat for you, {to}. Happy Birthday!",
                       "Happy Birthday, {to}! Wishing you a day full of treats, naps and belly rubs."],
                sample="Happy Birthday, Grandma Rose! Biscuit says the treats are on him today (he's been saving them all year). Have a wonderful day!")


ALL = [ny_midnight_gold, ny_champagne_toast, ny_pawsome, ny_resolutions,
       xmas_evergreen_gold, xmas_winter_wreath, xmas_pawsitively, xmas_dear_santa,
       bd_confetti_pop, bd_balloon_bouquet, bd_pawty_time, bd_treats_on_me]
