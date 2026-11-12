"""Furnished-room scenes for the shop's product templates (docs/shop.md › Studio templates › Rooms).

Run:  python rooms.py <scene> <pass> <res> <samples> <out.png>      (same passes as scenes.py)
The furniture and props are scanned models (scripts/mockups/ASSETS.md) that fetch_assets.sh puts in
$MOCKUP_ASSETS; the product itself is still modelled here, so its print area is exact.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402  (scenes imports bpy first too)
import scenes as S  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from scenes import MM, ROLE_FACE, ROLE_GLASS, ROLE_SCENE, STATE, box, cylinder, face_mat, frame_corners, glass, mesh_obj, principled, quad_face, sphere, srgb, textured, wood  # noqa: E402

ASSETS = os.environ.get("MOCKUP_ASSETS", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".assets"))


# ------------------------------------------------------------------ assets
def tex(name):
    return os.path.join(ASSETS, "tex", name)


def image_node(nt, path, non_color=False):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = bpy.data.images.load(path, check_existing=True)
    if non_color:
        n.image.colorspace_settings.name = "Non-Color"
    return n


def _world_bbox(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w))
            mx = Vector(map(max, mx, w))
    return mn, mx


def set_variant(objs, name):
    """KHR_materials_variants: put the named variant's materials on the imported meshes."""
    sc = bpy.context.scene
    names = [v.name for v in getattr(sc, "gltf2_KHR_materials_variants_variants", [])]
    if name not in names:
        return
    idx = names.index(name)
    for o in objs:
        if o.type != "MESH" or not hasattr(o.data, "gltf2_variant_mesh_data"):
            continue
        for entry in o.data.gltf2_variant_mesh_data:
            if any(v.variant.variant_idx == idx for v in entry.variants):
                o.material_slots[entry.material_slot_index].material = entry.material


def asset(name, loc=(0, 0, 0), rot_z=0.0, size=None, axis=2, variant=None, hide_shadow=False):
    """Imports a model, sits its bottom centre on `loc`, turns it about Z and scales it so its size along
    `axis` (0 x, 1 y, 2 z) is `size` metres. Returns the parent empty."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, "glb", f"{name}.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    # Models can carry their own cameras, lights and decorations (the plant's fireflies): drop them.
    for o in [o for o in new if o.type in ("CAMERA", "LIGHT") or "firefly" in o.name.lower()]:
        new.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    if variant:
        set_variant(new, variant)
    bpy.context.view_layer.update()
    mn, mx = _world_bbox(new)
    root = bpy.data.objects.new(f"{name}_root", None)
    S.link(root)
    off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for o in new:
        o["role"] = ROLE_SCENE
        if hide_shadow and o.type == "MESH":
            o.visible_shadow = False
        if o.parent is None:
            o.location = o.location - off
            o.parent = root
    s = 1.0 if not size else size / max(1e-6, (mx - mn)[axis])
    root.scale = (s, s, s)
    root.rotation_euler = (0, 0, rot_z)
    root.location = Vector(loc)
    bpy.context.view_layer.update()
    root["size"] = list((mx - mn) * s)
    return root


def ray_down(x, y, z_from=1.4):
    dg = bpy.context.evaluated_depsgraph_get()
    hit, p, *_ = bpy.context.scene.ray_cast(dg, Vector((x, y, z_from)), Vector((0, 0, -1)))
    return p if hit else None


def ray(origin, direction):
    dg = bpy.context.evaluated_depsgraph_get()
    hit, p, n, *_ = bpy.context.scene.ray_cast(dg, Vector(origin), Vector(direction).normalized())
    return (p, n) if hit else (None, None)


# ------------------------------------------------------------------ materials
def plank_floor(name="floor", value=0.52, sat=0.85, tint=(1.0, 0.86, 0.72), rot=math.pi / 2):
    """Real plank photo (three.js hardwood2), turned to run away from the camera and toned down to oak."""
    m = principled(name, (0.5, 0.4, 0.3), rough=0.55, coat=0.05, coat_rough=0.4)
    nt, b = S._nodes(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / 1.7, 1 / 0.85, 1)
    mp.inputs["Rotation"].default_value = (0, 0, rot)
    d = image_node(nt, tex("hardwood2_diffuse.jpg"))
    r = image_node(nt, tex("hardwood2_roughness.jpg"), True)
    bp = image_node(nt, tex("hardwood2_bump.jpg"), True)
    hsv = nt.nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Saturation"].default_value = sat
    hsv.inputs["Value"].default_value = value
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = (*tint, 1)
    rr = nt.nodes.new("ShaderNodeMapRange")
    rr.inputs["To Min"].default_value = 0.45
    rr.inputs["To Max"].default_value = 0.8
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.001
    L = nt.links.new
    L(tc.outputs["Object"], mp.inputs["Vector"])
    for n in (d, r, bp):
        L(mp.outputs["Vector"], n.inputs["Vector"])
    L(d.outputs["Color"], hsv.inputs["Color"])
    L(hsv.outputs["Color"], mix.inputs["A"])
    L(mix.outputs["Result"], b.inputs["Base Color"])
    L(r.outputs["Color"], rr.inputs["Value"])
    L(rr.outputs["Result"], b.inputs["Roughness"])
    L(bp.outputs["Color"], bump.inputs["Height"])
    L(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def photo_wood(name, plank=0.6, value=0.4, sat=0.9, tint=(0.86, 0.64, 0.47), rough=0.38, coat=0.25, offset_v=0.0, offset_u=0.0):
    """Furniture veneer from the plank photo, box-projected so every face gets grain; `plank` is how tall one
    board of the photo is on the furniture (a big value gives long, continuous grain)."""
    m = principled(name, (0.4, 0.3, 0.2), rough=rough, coat=coat, coat_rough=0.3)
    nt, b = S._nodes(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    tile_v = plank * 8
    mp.inputs["Scale"].default_value = (1 / (tile_v * 2), 1 / tile_v, 1 / tile_v)
    mp.inputs["Location"].default_value = (offset_u, offset_v, offset_v)
    d = image_node(nt, tex("hardwood2_diffuse.jpg"))
    bp = image_node(nt, tex("hardwood2_bump.jpg"), True)
    for n in (d, bp):
        n.projection = "BOX"
        n.projection_blend = 0.15
    hsv = nt.nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Saturation"].default_value = sat
    hsv.inputs["Value"].default_value = value
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = (*tint, 1)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.05
    bump.inputs["Distance"].default_value = 0.0005
    L = nt.links.new
    L(tc.outputs["Object"], mp.inputs["Vector"])
    L(mp.outputs["Vector"], d.inputs["Vector"])
    L(mp.outputs["Vector"], bp.inputs["Vector"])
    L(d.outputs["Color"], hsv.inputs["Color"])
    L(hsv.outputs["Color"], mix.inputs["A"])
    L(mix.outputs["Result"], b.inputs["Base Color"])
    L(bp.outputs["Color"], bump.inputs["Height"])
    L(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def weave(name, color, rough=0.95, strength=0.25, scale=900.0, sheen=0.4, vary=0.06):
    """Linen and wool: a fine cross weave over a soft colour variation."""
    m = textured(name, color, rough=rough, bump_strength=strength, scale=scale / 3, sheen=sheen, vary=vary)
    nt, b = S._nodes(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    w1 = nt.nodes.new("ShaderNodeTexWave")
    w1.wave_type = "BANDS"
    w1.bands_direction = "X"
    w1.inputs["Scale"].default_value = scale
    w2 = nt.nodes.new("ShaderNodeTexWave")
    w2.wave_type = "BANDS"
    w2.bands_direction = "Z"
    w2.inputs["Scale"].default_value = scale
    mx = nt.nodes.new("ShaderNodeMath")
    mx.operation = "MULTIPLY"
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = 0.0002
    L = nt.links.new
    L(tc.outputs["Object"], w1.inputs["Vector"])
    L(tc.outputs["Object"], w2.inputs["Vector"])
    L(w1.outputs["Fac"], mx.inputs[0])
    L(w2.outputs["Fac"], mx.inputs[1])
    L(mx.outputs["Value"], bump.inputs["Height"])
    L(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def walnut(name="walnut", rough=0.34, coat=0.3):
    return photo_wood(name, plank=0.7, value=0.24, sat=0.95, tint=(0.74, 0.5, 0.36), rough=rough, coat=coat)


def oak(name="oak", rough=0.4, coat=0.18):
    return photo_wood(name, plank=0.7, value=0.78, sat=0.7, tint=(1.0, 0.86, 0.68), rough=rough, coat=coat)


def candle(loc, r=0.04, h=0.11):
    """A pillar candle on a brass dish, lit."""
    x, y, z = loc
    cylinder("candledish", r * 1.6, 0.008, (x, y, z + 0.004), principled("brassdish", srgb(196, 160, 96), rough=0.28, metal=1.0), segs=64, bevel=0.002)
    cylinder("candle", r, h, (x, y, z + 0.008 + h / 2), textured("wax", srgb(240, 234, 222), rough=0.55, bump_strength=0.02, scale=300), segs=64, bevel=0.004)
    sphere("flame", 0.006, (x, y, z + 0.008 + h + 0.014), S.emission("flame", (1.0, 0.62, 0.25), 40), scale=(0.6, 0.6, 1.6), segs=(12, 8))
    lamp_glow((x, y, z + 0.008 + h + 0.03), energy=1.2, color=(1.0, 0.6, 0.3), size=0.01)


PAINT = srgb(236, 231, 222)
PAINT_WARM = srgb(232, 222, 206)
TRIM = srgb(242, 240, 235)


# ------------------------------------------------------------------ the room and its light
def sky(sun_elev=24.0, sun_az=200.0, strength=0.9):
    """Daylight outside the windows: a physical sky, plus a sun lamp for crisp light patches."""
    w = bpy.context.scene.world
    nt = w.node_tree
    bg = nt.nodes["Background"]
    sk = nt.nodes.new("ShaderNodeTexSky")
    for t in ("MULTIPLE_SCATTERING", "SINGLE_SCATTERING", "NISHITA"):
        try:
            sk.sky_type = t
            break
        except TypeError:
            continue
    try:
        sk.sun_disc = False
        sk.sun_elevation = math.radians(sun_elev)
        sk.sun_rotation = math.radians(sun_az)
    except AttributeError:
        pass
    nt.links.new(sk.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.6
    sun.angle = math.radians(1.2)
    sun.color = (1.0, 0.93, 0.84)
    o = bpy.data.objects.new("sun", sun)
    el, az = math.radians(sun_elev), math.radians(sun_az)
    d = Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))  # towards the sun
    o.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    S.link(o)
    return o


def portal(c, size_x, size_y, facing):
    l = bpy.data.lights.new("portal", "AREA")
    l.shape = "RECTANGLE"
    l.size = size_x
    l.size_y = size_y
    try:
        l.cycles.is_portal = True
    except AttributeError:
        l.is_portal = True
    o = bpy.data.objects.new("portal", l)
    o.location = c
    o.rotation_euler = Vector(facing).to_track_quat("-Z", "Y").to_euler()
    S.link(o)


def room(width=5.0, depth=4.5, height=2.75, wall=PAINT, floor=None, window=None, side_wall=True, right_wall=True):
    """Back wall on y=0 (the room is at y<0), floor on z=0, an optional left wall at x=-width/2 with a window
    (dict: y centre, width, height, sill). Skirting boards on both walls."""
    W, D, H = width, depth, height
    plaster = textured("plaster", wall, rough=0.93, bump_strength=0.05, scale=140, vary=0.02)
    trim = principled("trim", TRIM, rough=0.35, coat=0.2)
    box("floor", (W + 2, D + 2, 0.04), (0, -D / 2, -0.02), floor or plank_floor())
    box("backwall", (W, 0.1, H), (0, 0.05, H / 2), plaster)
    box("ceiling", (W + 2, D + 2, 0.05), (0, -D / 2, H + 0.025), textured("ceiling", srgb(240, 238, 234), rough=0.95, bump_strength=0.0))
    box("skirting_back", (W, 0.018, 0.11), (0, -0.009, 0.055), trim, bevel=0.002)
    if side_wall:
        x = -W / 2
        if window:
            wy, ww, wh, sill = window["y"], window["w"], window["h"], window["sill"]
            y0, y1 = wy - ww / 2, wy + ww / 2
            box("wall_l_back", (0.1, -y1, H), (x - 0.05, y1 / 2, H / 2), plaster)
            box("wall_l_front", (0.1, D + y0, H), (x - 0.05, (y0 - D) / 2, H / 2), plaster)
            box("wall_l_low", (0.1, ww, sill), (x - 0.05, wy, sill / 2), plaster)
            box("wall_l_high", (0.1, ww, H - sill - wh), (x - 0.05, wy, sill + wh + (H - sill - wh) / 2), plaster)
            fr = 0.05
            for nm, size, loc in (
                ("frame_top", (0.14, ww, fr), (x - 0.03, wy, sill + wh - fr / 2)),
                ("frame_bot", (0.2, ww + 0.06, fr), (x, wy, sill + fr / 2)),
                ("frame_l", (0.14, fr, wh), (x - 0.03, y0 + fr / 2, sill + wh / 2)),
                ("frame_r", (0.14, fr, wh), (x - 0.03, y1 - fr / 2, sill + wh / 2)),
                ("mullion", (0.1, 0.035, wh), (x - 0.03, wy, sill + wh / 2)),
                ("transom", (0.1, ww, 0.035), (x - 0.03, wy, sill + wh * 0.72)),
            ):
                box(nm, size, loc, trim, bevel=0.003)
            pane = box("pane", (0.006, ww - 0.1, wh - 0.1), (x - 0.04, wy, sill + wh / 2), principled("pane", (1, 1, 1), rough=0.0, transmission=1.0, ior=1.5))
            pane.visible_shadow = False
            portal(Vector((x - 0.12, wy, sill + wh / 2)), ww, wh, Vector((1, 0, 0)))
            # A sheer curtain gathered at the window's edge, nearest the back wall.
            sheer = principled("sheer", srgb(246, 243, 236), rough=0.9, sheen=0.5)
            sheer_tr = sheer.node_tree.nodes["Principled BSDF"]
            for k in ("Transmission Weight",):
                if k in sheer_tr.inputs:
                    sheer_tr.inputs[k].default_value = 0.6
            for k in range(7):
                cylinder(f"sheer{k}", 0.028, wh + 0.25, (x + 0.06 + 0.012 * (k % 2), y1 + 0.02 - k * 0.045, sill + wh / 2 + 0.1), sheer, segs=24)
        else:
            box("wall_l", (0.1, D, H), (x - 0.05, -D / 2, H / 2), plaster)
        box("skirting_l", (0.018, D, 0.11), (x + 0.009, -D / 2, 0.055), trim, bevel=0.002)
    if right_wall:
        box("wall_r", (0.1, D, H), (W / 2 + 0.05, -D / 2, H / 2), plaster)
        box("skirting_r", (0.018, D, 0.11), (W / 2 - 0.009, -D / 2, 0.055), trim, bevel=0.002)
    sc = bpy.context.scene
    sc.cycles.diffuse_bounces = 5
    sc.cycles.max_bounces = 12
    return plaster


def fill_light(target, frm, size=2.5, energy=60):
    """A large soft bounce from the camera side (what a photographer's reflector does)."""
    return S.area_light("fill", frm, target, size, energy, color=(1.0, 0.97, 0.93))


def window_key(loc, target, w, h, energy):
    """Soft daylight from a window: a window-sized area light just inside it, aimed at the product."""
    return S.area_light("windowkey", loc, target, w, energy, color=(0.97, 0.98, 1.0), size_y=h)


def lamp_glow(loc, energy=12, color=(1.0, 0.78, 0.52), size=0.12):
    l = bpy.data.lights.new("lampglow", "POINT")
    l.energy = energy
    l.color = color
    l.shadow_soft_size = size
    o = bpy.data.objects.new("lampglow", l)
    o.location = loc
    S.link(o)
    return o


def table_lamp(loc, h=0.52, shade_r=0.15, base=srgb(206, 196, 178)):
    """Ceramic base with a linen drum shade, lit warm from inside."""
    x, y, z = loc
    cer = principled("lampbase", base, rough=0.35, coat=0.4)
    cylinder("lampfoot", 0.075, 0.03, (x, y, z + 0.015), cer, segs=64, bevel=0.006)
    sphere("lampbody", 0.085, (x, y, z + 0.13), cer, scale=(1, 1, 1.25), segs=(48, 24))
    cylinder("lampneck", 0.012, 0.12, (x, y, z + 0.29), principled("brass", srgb(196, 160, 96), rough=0.3, metal=1.0), segs=24)
    shade = principled("shade", srgb(240, 232, 214), rough=0.9, sheen=0.3)
    nb = shade.node_tree.nodes["Principled BSDF"]
    if "Transmission Weight" in nb.inputs:
        nb.inputs["Transmission Weight"].default_value = 0.35
    cylinder("lampshade", shade_r, 0.2, (x, y, z + h - 0.1), shade, segs=96, r2=shade_r * 0.82)
    lamp_glow((x, y, z + h - 0.12), energy=9)


def books(loc, n=4, rot=0.0, palette=None, seed=1, upright=False):
    random.seed(seed)
    palette = palette or [srgb(214, 204, 188), srgb(150, 112, 90), srgb(86, 98, 92), srgb(190, 160, 120), srgb(60, 66, 80), srgb(170, 84, 64)]
    x, y, z = loc
    hz = z
    for i in range(n):
        w, d, t = random.uniform(0.2, 0.26), random.uniform(0.15, 0.19), random.uniform(0.022, 0.04)
        col = palette[(i + seed) % len(palette)]
        box(f"book{seed}_{i}", (w, d, t), (x + random.uniform(-0.01, 0.01), y + random.uniform(-0.008, 0.008), hz + t / 2), textured(f"bk{seed}{i}", col, rough=0.7, bump_strength=0.03, scale=400), rot=(0, 0, rot + random.uniform(-0.08, 0.08)), bevel=0.0025)
        box(f"pages{seed}_{i}", (w - 0.006, d - 0.004, t - 0.004), (x, y - 0.003, hz + t / 2), principled("pages", srgb(238, 232, 218), rough=0.8), rot=(0, 0, rot))
        hz += t
    return hz


def frame_art(c, w, h, art_color=srgb(200, 170, 140), frame_col=srgb(30, 28, 26)):
    """A simple framed abstract print on the back wall (kept soft, out of focus, behind the product)."""
    fm = principled("artframe", frame_col, rough=0.4)
    t = 0.025
    box("artframe", (w, t, h), (c[0], -t / 2, c[2]), fm, bevel=0.003)
    box("artmat", (w - 0.05, 0.004, h - 0.05), (c[0], -t - 0.002, c[2]), principled("artmat", srgb(246, 244, 238), rough=0.9))
    art = textured("artpaint", art_color, rough=0.9, bump_strength=0.05, scale=12, vary=0.25)
    box("artpaint", (w - 0.16, 0.004, h - 0.16), (c[0], -t - 0.004, c[2]), art)


def rug(c, w, d, color=srgb(200, 190, 172), rot=0.0):
    return box("rug", (w, d, 0.012), (c[0], c[1], 0.006), weave("rug", color, rough=1.0, strength=0.6, scale=260, sheen=0.3, vary=0.12), rot=(0, 0, rot), bevel=0.004)


def sideboard(c, w=1.6, d=0.45, h=0.72, mat=None, legs=0.16):
    """A mid-century sideboard: a cabinet on tapered legs, with three doors."""
    x, y = c[0], c[1]
    mat = mat or walnut()
    body_h = h - legs
    box("sb_body", (w, d, body_h), (x, y, legs + body_h / 2), mat, bevel=0.008)
    gap = principled("sb_gap", (0.03, 0.02, 0.015), rough=0.8)
    for k in (1, 2):
        box(f"sb_gap{k}", (0.003, 0.002, body_h - 0.06), (x - w / 2 + k * w / 3, y - d / 2 - 0.0005, legs + body_h / 2), gap)
    brass = principled("brass", srgb(196, 160, 96), rough=0.28, metal=1.0)
    for k in range(3):
        cylinder(f"sb_knob{k}", 0.007, 0.018, (x - w / 2 + (k + 0.5) * w / 3 + (0.12 if k < 2 else -0.12), y - d / 2 - 0.009, legs + body_h * 0.62), brass, rot=(math.pi / 2, 0, 0), segs=24)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cylinder(f"sb_leg{sx}{sy}", 0.016, legs + 0.01, (x + sx * (w / 2 - 0.08), y + sy * (d / 2 - 0.07), legs / 2), mat, r2=0.011, segs=24, rot=(sy * 0.06, -sx * 0.06, 0))
    return h


def side_table(c, r=0.24, h=0.52, mat=None):
    mat = mat or oak()
    cylinder("st_top", r, 0.03, (c[0], c[1], h - 0.015), mat, segs=96, bevel=0.004)
    cylinder("st_stem", 0.03, h - 0.03, (c[0], c[1], (h - 0.03) / 2), mat, segs=48)
    cylinder("st_foot", 0.16, 0.025, (c[0], c[1], 0.0125), mat, segs=96, bevel=0.004)
    return h


def camera_at(loc, target, lens, fstop=None):
    wide = os.environ.get("ROOM_WIDE")  # a debugging overview: "x,y,z" of a far camera looking at the target
    if wide:
        return S.camera(Vector(tuple(float(v) for v in wide.split(","))), Vector(target), lens=24)
    return S.camera(Vector(loc), Vector(target), lens=lens, fstop=fstop)


# ------------------------------------------------------------------ products in rooms
def cushion_meshes(w, h, thick, n=56, pinch=0.06, wrinkle=0.007, seed=1):
    """A stuffed square cushion: puffed in the middle, pinched along the seam, with soft creases that run
    in from the corners (front and back meshes, front facing -Y)."""
    import bmesh

    rnd = random.Random(seed)
    phase = [rnd.uniform(0, math.tau) for _ in range(8)]

    def pos(x, y, side):
        X = x * (w / 2) * (1 - pinch * (1 - y * y))
        Y = y * (h / 2) * (1 - pinch * (1 - x * x))
        z = (thick / 2) * ((1 - x * x) * (1 - y * y)) ** 0.7
        crease = 0.0
        for k, (cx, cy) in enumerate(((-1, 1), (1, 1), (1, -1), (-1, -1))):
            d = math.hypot(x - cx, y - cy)
            fall = math.exp(-(d * d) / 0.32)
            across = (x - cx) * cy - (y - cy) * cx  # across the corner's diagonal
            crease += fall * math.sin(across * 9.0 + phase[k + 4 * (side < 0)])
        edge = (1 - min(1.0, (1 - abs(x)) * 6)) + (1 - min(1.0, (1 - abs(y)) * 6))
        crease += 0.35 * edge * math.sin((x + y) * 22 + phase[1])
        z = max(0.0, z + wrinkle * crease * (0.4 + z / (thick / 2)))
        return Vector((X, -side * z, Y))

    out = []
    for side in (1, -1):
        bm = bmesh.new()
        grid = [[bm.verts.new(pos(-1 + 2 * i / n, 1 - 2 * j / n, side)) for i in range(n + 1)] for j in range(n + 1)]
        for j in range(n):
            for i in range(n):
                quad = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
                bm.faces.new(quad if side == 1 else quad[::-1])
        out.append(bm)
    corners = [pos(-1, 1, 1), pos(1, 1, 1), pos(1, -1, 1), pos(-1, -1, 1)]
    return out[0], out[1], corners


def pillow_print_mat():
    """Base pass: plain white linen (the picture is multiplied on, so the weave shows through)."""
    if STATE["pass"] != "base":
        return face_mat()
    return weave("face_linen", (0.95, 0.95, 0.95), rough=0.9, strength=0.16, scale=1400, sheen=0.25, vary=0.0)


def place_pillow(seat, back_y, x, w=305 * MM, h=305 * MM, thick=110 * MM, lean=-0.30, yaw=0.0, name="print"):
    """The cushion sitting on a seat (z), leaning back against a surface at y=back_y. Returns its corners."""
    cy = back_y - (thick / 2) * math.cos(lean) - (h / 2) * math.sin(-lean) - 0.01
    R = Matrix.Translation(Vector((x, cy, seat + (h / 2) * math.cos(lean) - 0.02))) @ Matrix.Rotation(yaw, 4, "Z") @ Matrix.Rotation(lean, 4, "X")
    front, back_, corners = cushion_meshes(w, h, thick, seed=3)
    f = mesh_obj(name, front, pillow_print_mat() if name == "print" else weave(name + "f", srgb(176, 100, 70), rough=0.95, strength=0.3, scale=1100, sheen=0.4), ROLE_FACE if name == "print" else ROLE_SCENE, smooth=True)
    b = mesh_obj(name + "back", back_, weave(name + "b", srgb(232, 226, 214) if name == "print" else srgb(176, 100, 70), rough=0.95, strength=0.3, scale=1100, sheen=0.4), smooth=True)
    for o in (f, b):
        o.matrix_world = R
    if name == "print":
        f["corners"] = [list(R @ Vector(p)) for p in corners]
    return R


def pillow_sofa():
    """Magic Pillow on a champagne velvet sofa, a terracotta cushion behind it, lamp and plant, window light."""
    room(width=5.0, depth=5.0, window={"y": -1.35, "w": 1.5, "h": 1.75, "sill": 0.62}, wall=PAINT_WARM)
    rug((0.1, -1.35), 2.8, 1.9, color=srgb(204, 190, 166))
    asset("GlamVelvetSofa", loc=(0.0, -0.58, 0.0), rot_z=0.0, variant="Champagne")
    bpy.context.view_layer.update()
    # Find the seat and the back cushion where the pillow sits.
    px = 0.60
    seat = ray_down(px, -0.62)
    seat_z = seat.z if seat else 0.45
    back_hit, _ = ray((px, -1.6, seat_z + 0.22), (0, 1, 0))
    back_y = back_hit.y if back_hit else -0.25
    place_pillow(seat_z, back_y, px, lean=-0.26, yaw=-0.12, thick=130 * MM)
    # A bigger terracotta cushion behind it, toward the middle of the sofa.
    big, lean2, x2 = 400 * MM, -0.34, 0.18
    back2, _ = ray((x2, -1.6, seat_z + 0.25), (0, 1, 0))
    by2 = back2.y if back2 else back_y
    cy2 = by2 - 0.06 - (big / 2) * math.sin(-lean2)
    R2 = Matrix.Translation(Vector((x2, cy2, seat_z + (big / 2) * math.cos(lean2) - 0.035))) @ Matrix.Rotation(-0.28, 4, "Z") @ Matrix.Rotation(lean2, 4, "X") @ Matrix.Rotation(0.10, 4, "Y")
    fr, bk, _ = cushion_meshes(big, big, 150 * MM, wrinkle=0.006, seed=8)
    terr = weave("terracotta", srgb(150, 80, 52), rough=0.95, strength=0.5, scale=700, sheen=0.5)
    for nm, bm in (("cushion2", fr), ("cushion2b", bk)):
        o = mesh_obj(nm, bm, terr, ROLE_SCENE, smooth=True)
        o.matrix_world = R2
    # Knitted throw folded on the seat, to the left.
    throw = weave("throw", srgb(236, 230, 216), rough=1.0, strength=0.9, scale=320, sheen=0.6)
    for k in range(3):
        box(f"throw{k}", (0.44 - 0.012 * k, 0.38, 0.03), (-0.45, -0.74, seat_z + 0.015 + 0.03 * k), throw, rot=(0, 0, 0.12 - 0.05 * k), bevel=0.013, segments=5)
    # Side table with a lamp at the right arm; a plant at the left.
    st_h = side_table((1.2, -0.3), h=0.6)
    table_lamp((1.18, -0.26, st_h), h=0.52)
    books((1.22, -0.42, st_h), n=2, rot=0.3, seed=4)
    asset("DiffuseTransmissionPlant", loc=(-1.45, -0.42, 0.0), rot_z=0.6, size=1.05)
    frame_art((0.45, 0, 1.5), 0.8, 0.6, art_color=srgb(176, 146, 112))
    sky(sun_elev=20, sun_az=300, strength=0.8)
    window_key((-2.42, -1.35, 1.5), (px, back_y - 0.2, seat_z + 0.15), 1.4, 1.6, 260)
    tgt = Vector((px + 0.02, back_y - 0.15, seat_z + 0.15))
    fill_light(tgt, (0.6, -3.2, 1.5), size=3.0, energy=9)
    camera_at(tgt + Vector((-0.10, -1.28, 0.30)), tgt, lens=50, fstop=2.8)
    return {"kind": "corners", "bulged": True}


def wall_board(c, w, h, t=10 * MM):
    """Masterpiece: a frameless print on black-edged board, flat on the back wall (y=0)."""
    board = box("foam", (w, t, h), (c[0], -t / 2 - 0.6 * MM, c[2]), principled("foam", S.FOAM_BLACK, rough=0.7), bevel=0.6 * MM)
    tl, tr, br, bl = frame_corners(Vector((c[0], -t - 0.8 * MM, c[2])), Vector((1, 0, 0)), Vector((0, 0, 1)), w - 0.6 * MM, h - 0.6 * MM)
    quad_face("print", tl, tr, br, bl, face_mat())
    return board


def masterpiece_sideboard(w=406 * MM, h=610 * MM):
    """Masterpiece above a walnut sideboard styled with flowers, books and a candle; plant and chair beside."""
    room(width=5.2, depth=5.0, window={"y": -1.5, "w": 1.5, "h": 1.8, "sill": 0.6}, wall=PAINT)
    rug((0.0, -1.5), 2.6, 1.8, color=srgb(208, 196, 176))
    top = sideboard((0.0, -0.24), w=1.7, d=0.45, h=0.74)
    asset("GlassVaseFlowers", loc=(0.52, -0.22, top), rot_z=0.4, size=0.34)
    hz = books((-0.5, -0.24, top), n=3, rot=0.06, seed=2)
    candle((-0.5, -0.22, hz), r=0.045, h=0.13)
    cylinder("bowl", 0.11, 0.05, (0.18, -0.24, top + 0.025), textured("bowl", srgb(150, 160, 132), rough=0.5, bump_strength=0.1, scale=250), r2=0.07, bevel=0.004)
    cz = top + 0.24 + h / 2
    wall_board((0.0, 0, cz), w, h)
    asset("DiffuseTransmissionPlant", loc=(-1.0, -0.40, 0.0), rot_z=2.2, size=1.25)
    asset("SheenChair", loc=(1.02, -0.82, 0.0), rot_z=math.radians(205), size=0.80, axis=2, variant="Peacock Velvet")
    sky(sun_elev=24, sun_az=305, strength=0.8)
    window_key((-2.52, -1.5, 1.5), (0, -0.1, cz), 1.4, 1.6, 220)
    tgt = Vector((0.0, -0.1, cz - 0.20))
    fill_light(tgt, (0.6, -3.4, 1.6), size=3.0, energy=14)
    camera_at(tgt + Vector((0.0, -1.68, -0.08)), tgt, lens=40, fstop=4.0)
    return {"kind": "corners"}


def puzzle_table(w=276 * MM, h=368 * MM):
    """The finished puzzle on an oak dining table, box lid and tea beside it, chairs and flowers behind.
    Upright (3:4), the shape of a Magic Portraits picture; the top of the picture is away from the camera."""
    room(width=5.0, depth=5.0, window={"y": -1.6, "w": 1.6, "h": 1.8, "sill": 0.7}, wall=PAINT_WARM)
    tw, td, th = 1.9, 0.95, 0.75
    tmat = photo_wood("tabletop", plank=0.17, value=0.74, sat=0.8, tint=(1.0, 0.88, 0.74), rough=0.42, coat=0.15, offset_u=0.23)  # a farmhouse table of 17 cm oak boards
    box("table", (tw, td, 0.045), (0, -1.2, th - 0.0225), tmat, bevel=0.004)
    legm = oak("tablelegs")
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(f"tleg{sx}{sy}", (0.07, 0.07, th - 0.045), (sx * (tw / 2 - 0.1), -1.2 + sy * (td / 2 - 0.1), (th - 0.045) / 2), legm, bevel=0.003)
    box("apron", (tw - 0.2, td - 0.2, 0.08), (0, -1.2, th - 0.085), legm, bevel=0.003)
    board_t = 2.2 * MM
    yaw = 0.06
    c = Vector((-0.06, -1.30, th + board_t / 2))
    box("board", (w, h, board_t), c, principled("board", (0.8, 0.78, 0.75), rough=0.85), rot=(0, 0, yaw), bevel=0.4 * MM)
    R = Matrix.Rotation(yaw, 4, "Z")
    tl, tr, br, bl = frame_corners(Vector((c.x, c.y, th + board_t + 0.15 * MM)), (R @ Vector((1, 0, 0))).to_3d(), (R @ Vector((0, 1, 0))).to_3d(), w, h)
    quad_face("print", tl, tr, br, bl, face_mat())
    lid = box("lid", (0.26, 0.19, 0.04), (0.33, -1.06, th + 0.02), weave("lid", srgb(176, 146, 108), rough=0.85, strength=0.12, scale=600, vary=0.08), rot=(0, 0, -0.42), bevel=1.2 * MM)  # the kraft box lid
    asset("DiffuseTransmissionTeacup", loc=(-0.42, -1.12, th), rot_z=0.8, size=0.16, axis=0)
    asset("GlassVaseFlowers", loc=(0.15, -0.86, th), rot_z=0.2, size=0.30)
    for k, (x, rz) in enumerate(((-0.45, math.radians(180)), (0.45, math.radians(176)))):
        asset("SheenChair", loc=(x, -0.42, 0.0), rot_z=rz, size=0.80, variant="Peacock Velvet")
    asset("DiffuseTransmissionPlant", loc=(1.45, -0.35, 0.0), rot_z=1.0, size=1.15)
    frame_art((0.0, 0, 1.6), 1.0, 0.7, art_color=srgb(160, 170, 150))
    sky(sun_elev=26, sun_az=300, strength=0.8)
    window_key((-2.42, -1.6, 1.55), (0, -1.3, th), 1.5, 1.6, 240)
    tgt = Vector((-0.04, -1.24, th))
    fill_light(tgt, (0.5, -3.6, 2.2), size=3.0, energy=12)
    camera_at(tgt + Vector((0.08, -0.50, 0.56)), tgt, lens=40, fstop=4.5)
    return {"kind": "corners", "puzzle": True, "puzzle_grid": [9, 12]}


def acrylic_on(c, w, h, d=20 * MM, yaw=-0.35):
    """The acrylic block standing on a surface at c (x, y, top z); the print is on its back face."""
    acr = glass()
    rot = (0, 0, yaw)
    box("block", (w, d, h), (c[0], c[1], c[2] + h / 2), acr, rot=rot, bevel=1.8 * MM, role=ROLE_GLASS, segments=4)
    R = Matrix.Rotation(yaw, 4, "Z")
    right = (R @ Vector((1, 0, 0))).to_3d()
    back = (R @ Vector((0, d / 2 + 0.25 * MM, 0))).to_3d()
    cc = Vector((c[0], c[1], c[2] + h / 2)) + back
    tl, tr, br, bl = frame_corners(cc, right, Vector((0, 0, 1)), w - 2.5 * MM, h - 2.5 * MM)
    quad_face("print", tl, tr, br, bl, face_mat())
    box("backing", (w - 2 * MM, 0.4 * MM, h - 2 * MM), cc + (R @ Vector((0, 0.5 * MM, 0))).to_3d(), principled("backing", (0.85, 0.85, 0.85), rough=0.8), rot=rot)


def block_sideboard(w=127 * MM, h=178 * MM):
    """The acrylic block on a walnut sideboard by the window, with books, flowers and a candle."""
    room(width=5.0, depth=5.0, window={"y": -1.1, "w": 1.5, "h": 1.8, "sill": 0.6}, wall=PAINT)
    top = sideboard((0.0, -0.24), w=1.7, d=0.45, h=0.74)
    acrylic_on((0.0, -0.30, top), w, h, yaw=-0.32)
    asset("GlassVaseFlowers", loc=(0.30, -0.16, top), rot_z=0.6, size=0.32)
    hz = books((-0.30, -0.22, top), n=3, rot=-0.1, seed=5)
    candle((-0.30, -0.2, hz), r=0.04, h=0.10)
    frame_art((0.16, 0, 1.22), 0.7, 0.52, art_color=srgb(186, 160, 128))
    asset("DiffuseTransmissionPlant", loc=(-1.05, -0.40, 0.0), rot_z=2.0, size=1.25)
    sky(sun_elev=22, sun_az=300, strength=0.8)
    window_key((-2.42, -1.1, 1.5), (0, -0.3, top + h / 2), 1.4, 1.6, 200)
    tgt = Vector((0.0, -0.30, top + h * 0.52))
    fill_light(tgt, (0.8, -3.0, 1.4), size=2.5, energy=10)
    camera_at(tgt + Vector((0.10, -1.05, 0.10)), tgt, lens=70, fstop=2.8)
    return {"kind": "corners", "behind_glass": True}


def laptop(c, rot_z=0.0):
    alu = principled("alu", srgb(196, 198, 202), rough=0.32, metal=1.0)
    base = box("lap_base", (0.31, 0.215, 0.012), (c[0], c[1], c[2] + 0.006), alu, rot=(0, 0, rot_z), bevel=0.004)
    R = Matrix.Rotation(rot_z, 4, "Z")
    hinge = Vector(c) + (R @ Vector((0, 0.107, 0.012))).to_3d()
    tilt = math.radians(-18)
    scr = box("lap_lid", (0.31, 0.008, 0.205), hinge + (R @ Vector((0, 0.1025 * math.sin(-tilt), 0.1025 * math.cos(tilt)))).to_3d(), alu, rot=(tilt, 0, rot_z), bevel=0.003)
    box("lap_screen", (0.29, 0.002, 0.185), hinge + (R @ Vector((0, 0.1025 * math.sin(-tilt) - 0.005, 0.1025 * math.cos(tilt)))).to_3d(), principled("screen", (0.02, 0.02, 0.025), rough=0.08, coat=0.6), rot=(tilt, 0, rot_z))
    box("lap_keys", (0.27, 0.11, 0.001), Vector(c) + (R @ Vector((0, 0.02, 0.0125))).to_3d(), principled("keys", (0.08, 0.08, 0.09), rough=0.6), rot=(0, 0, rot_z))
    return base


def block_desk(w=127 * MM, h=178 * MM):
    """The acrylic block on an oak desk with a laptop, tea, a notebook and a lamp, window light from the left."""
    room(width=4.4, depth=4.5, window={"y": -0.9, "w": 1.5, "h": 1.8, "sill": 0.75}, wall=srgb(224, 228, 222))
    dw, dd, dh = 1.4, 0.7, 0.75
    top_mat = oak("desk", rough=0.36, coat=0.2)
    box("desk", (dw, dd, 0.03), (0, -0.4, dh - 0.015), top_mat, bevel=0.003)
    blk = principled("deskframe", srgb(36, 34, 32), rough=0.5, metal=0.6)
    for sx in (-1, 1):
        box(f"dleg{sx}", (0.03, dd - 0.08, 0.03), (sx * (dw / 2 - 0.06), -0.4, 0.015), blk)
        box(f"dpost{sx}", (0.03, 0.03, dh - 0.06), (sx * (dw / 2 - 0.06), -0.4, (dh - 0.03) / 2), blk)
    acrylic_on((0.12, -0.52, dh), w, h, yaw=-0.42)
    laptop((-0.22, -0.30, dh), rot_z=0.22)
    asset("DiffuseTransmissionTeacup", loc=(0.30, -0.60, dh), rot_z=1.2, size=0.15, axis=0)
    box("notebook", (0.15, 0.21, 0.012), (-0.08, -0.62, dh + 0.006), weave("notebook", srgb(70, 84, 96), rough=0.8, strength=0.05, scale=400), rot=(0, 0, 0.35), bevel=0.002)
    cylinder("pen", 0.0045, 0.14, (-0.08, -0.62, dh + 0.017), principled("pen", srgb(30, 30, 32), rough=0.3), rot=(0, math.pi / 2, 0.35 + math.pi / 2), segs=16)
    table_lamp((0.40, -0.16, dh), h=0.48)
    asset("DiffuseTransmissionPlant", loc=(-0.50, -0.14, dh), rot_z=0.5, size=0.42)
    frame_art((0.2, 0, 1.45), 0.6, 0.45, art_color=srgb(150, 168, 176))
    sky(sun_elev=24, sun_az=300, strength=0.85)
    window_key((-2.12, -0.9, 1.5), (0.1, -0.5, dh + 0.1), 1.4, 1.6, 180)
    tgt = Vector((0.10, -0.52, dh + h * 0.5))
    fill_light(tgt, (0.8, -2.8, 1.4), size=2.5, energy=9)
    camera_at(tgt + Vector((0.12, -0.92, 0.16)), tgt, lens=60, fstop=2.8)
    return {"kind": "corners", "behind_glass": True}


ROOMS = {
    # name: (builder, kwargs, roughness of the print surface for its shine, exposure)
    "room-pillow-sofa": (pillow_sofa, {}, 1.0, 0.0),
    "room-masterpiece-sideboard": (masterpiece_sideboard, {}, 0.45, 0.0),
    "room-puzzle-table": (puzzle_table, {}, 0.6, 0.0),
    "room-block-sideboard": (block_sideboard, {}, 0.95, 0.0),
    "room-block-desk": (block_desk, {}, 0.95, 0.0),
}

S.PRODUCTS.update(ROOMS)

if __name__ == "__main__":
    S.main()
