"""Product mockup scenes for the My Magic Portraits shop.

Run:  python scenes.py <product> <pass> <res> <samples> <out.png>
pass: base  - the scene with a plain white print area (the picture is multiplied onto it)
      gloss - the print area black and glossy, so only its shine shows (becomes the overlay's highlights)
      mask  - the print area pure white on black (where the picture goes)
Writes <out>.json next to the image with the print area's corners on the picture (0..1, y down).
"""
import json
import math
import random
import sys

import bpy  # must come first: it provides bmesh, mathutils and bpy_extras
import bmesh
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

MM = 0.001


def srgb(r, g, b):
    f = lambda c: (c / 255) / 12.92 if c / 255 <= 0.04045 else (((c / 255) + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b))


# ------------------------------------------------------------------ palette
WALL = srgb(228, 224, 216)
WALL_WARM = srgb(226, 220, 210)
OAK = srgb(198, 172, 136)
OAK_DARK = srgb(182, 154, 118)
OATMEAL = srgb(178, 164, 144)
SAGE = srgb(150, 160, 132)
TERRACOTTA = srgb(150, 82, 56)
STONE = srgb(214, 205, 190)
WHITE_CERAMIC = srgb(244, 243, 240)
BLACK_CERAMIC = srgb(24, 24, 26)
FOAM_BLACK = srgb(20, 20, 22)
STEEL = srgb(205, 205, 208)
RIBBON_RED = srgb(122, 8, 18)
GOLD = srgb(212, 175, 98)
PINE = srgb(14, 36, 22)

ROLE_FACE, ROLE_GLASS, ROLE_SCENE = "face", "glass", "scene"
STATE = {"pass": "base", "rough": 0.5}


# ------------------------------------------------------------------ scene and materials
def reset(res, samples, exposure=0.0):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = samples
    s.cycles.use_adaptive_sampling = True
    s.cycles.use_denoising = True
    try:
        s.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    s.cycles.max_bounces = 10
    s.cycles.diffuse_bounces = 3
    s.cycles.glossy_bounces = 4
    s.cycles.transmission_bounces = 10
    s.cycles.transparent_max_bounces = 8
    s.cycles.sample_clamp_indirect = 3.0
    s.cycles.caustics_reflective = False
    s.cycles.caustics_refractive = False
    s.render.resolution_x = res
    s.render.resolution_y = res
    s.render.resolution_percentage = 100
    s.render.threads_mode = "FIXED"
    s.render.threads = 2
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGB"
    s.render.image_settings.color_depth = "16"
    s.view_settings.view_transform = "AgX"
    try:
        s.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        s.view_settings.look = "None"
    s.view_settings.exposure = exposure
    world = bpy.data.worlds.new("world")
    s.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*srgb(232, 226, 216), 1)
    bg.inputs["Strength"].default_value = 0.22
    return s


def principled(name, color, rough=0.5, metal=0.0, transmission=0.0, ior=1.45, coat=0.0, coat_rough=0.05, sheen=0.0, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    vals = {
        "Base Color": (*color, 1),
        "Roughness": rough,
        "Metallic": metal,
        "IOR": ior,
        "Transmission Weight": transmission,
        "Coat Weight": coat,
        "Coat Roughness": coat_rough,
        "Sheen Weight": sheen,
        "Specular IOR Level": spec,
    }
    for k, v in vals.items():
        if k in b.inputs:
            b.inputs[k].default_value = v
    return m


def _nodes(m):
    nt = m.node_tree
    return nt, nt.nodes["Principled BSDF"]


def wood(name, light=OAK, dark=OAK_DARK, scale=6.0, rough=0.42, coat=0.15):
    """Oak: long grain bands with a little noise, a faint bump."""
    m = principled(name, light, rough=rough, coat=coat, coat_rough=0.3)
    nt, b = _nodes(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale * 4.0, scale * 0.25, scale)
    mp.inputs["Rotation"].default_value = (0, 0, 0.02)
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 0.6
    wave.inputs["Distortion"].default_value = 14.0
    wave.inputs["Detail"].default_value = 4.0
    wave.inputs["Detail Roughness"].default_value = 0.6
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0
    noise.inputs["Detail"].default_value = 8.0
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "FLOAT"
    mix.inputs["Factor"].default_value = 0.55
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.15
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].position = 0.95
    ramp.color_ramp.elements[1].color = (*light, 1)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.06
    bump.inputs["Distance"].default_value = 0.0005
    L = nt.links.new
    L(tc.outputs["Object"], mp.inputs["Vector"])
    L(mp.outputs["Vector"], wave.inputs["Vector"])
    L(mp.outputs["Vector"], noise.inputs["Vector"])
    L(wave.outputs["Fac"], mix.inputs["A"])
    L(noise.outputs["Fac"], mix.inputs["B"])
    L(mix.outputs["Result"], ramp.inputs["Fac"])
    L(ramp.outputs["Color"], b.inputs["Base Color"])
    L(mix.outputs["Result"], bump.inputs["Height"])
    L(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def textured(name, color, rough=0.9, bump_strength=0.08, scale=180.0, sheen=0.0, vary=0.04):
    """Plaster or fabric: a fine noise in colour and a soft bump."""
    m = principled(name, color, rough=rough, sheen=sheen, spec=0.3)
    nt, b = _nodes(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 6.0
    big = nt.nodes.new("ShaderNodeTexNoise")
    big.inputs["Scale"].default_value = scale / 40
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    lo = tuple(max(0.0, c * (1 - vary)) for c in color)
    hi = tuple(min(1.0, c * (1 + vary)) for c in color)
    ramp.color_ramp.elements[0].color = (*lo, 1)
    ramp.color_ramp.elements[1].color = (*hi, 1)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.0003
    L = nt.links.new
    L(tc.outputs["Object"], noise.inputs["Vector"])
    L(tc.outputs["Object"], big.inputs["Vector"])
    L(big.outputs["Fac"], ramp.inputs["Fac"])
    L(ramp.outputs["Color"], b.inputs["Base Color"])
    L(noise.outputs["Fac"], bump.inputs["Height"])
    L(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def emission(name, color, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*color, 1)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], out.inputs[0])
    return m


def glass(name="acrylic"):
    return principled(name, (0.985, 0.99, 0.99), rough=0.0, transmission=1.0, ior=1.49, spec=0.5)


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_obj(name, bm, mat, role=ROLE_SCENE, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(mat)
    o["role"] = role
    if role == ROLE_GLASS:
        o.visible_shadow = False  # light reaches the print behind the acrylic, as caustics would
    return link(o)


def box(name, size, loc, mat, rot=(0, 0, 0), bevel=0.0, role=ROLE_SCENE, segments=3):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    o = mesh_obj(name, bm, mat, role)
    o.location = loc
    o.rotation_euler = rot
    if bevel > 0:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = segments
        m.limit_method = "ANGLE"
    return o


def cylinder(name, r, h, loc, mat, rot=(0, 0, 0), segs=96, role=ROLE_SCENE, r2=None, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    for f in bm.faces:
        f.smooth = abs(f.normal.z) < 0.5
    o = mesh_obj(name, bm, mat, role)
    o.location = loc
    o.rotation_euler = rot
    if bevel > 0:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 3
        m.limit_method = "ANGLE"
    return o


def sphere(name, r, loc, mat, role=ROLE_SCENE, scale=(1, 1, 1), segs=(48, 24)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=r)
    for f in bm.faces:
        f.smooth = True
    o = mesh_obj(name, bm, mat, role)
    o.location = loc
    o.scale = scale
    return o


def quad_face(name, tl, tr, br, bl, mat, role=ROLE_FACE):
    """A flat print area from its four corners (as seen from the front)."""
    bm = bmesh.new()
    vs = [bm.verts.new(Vector(p)) for p in (bl, br, tr, tl)]
    f = bm.faces.new(vs)
    uv = bm.loops.layers.uv.new("UVMap")
    for loop, (u, v) in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop[uv].uv = (u, v)
    o = mesh_obj(name, bm, mat, role)
    o["corners"] = [list(tl), list(tr), list(br), list(bl)]
    return o


def frame_corners(c, right, up, w, h):
    c, right, up = Vector(c), Vector(right).normalized(), Vector(up).normalized()
    return (c - right * (w / 2) + up * (h / 2), c + right * (w / 2) + up * (h / 2), c + right * (w / 2) - up * (h / 2), c - right * (w / 2) - up * (h / 2))


def look_at(obj, target):
    d = Vector(target) - Vector(obj.location)
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def area_light(name, loc, target, size, energy, color=(1.0, 0.95, 0.88), size_y=None):
    l = bpy.data.lights.new(name, "AREA")
    l.energy = energy
    l.color = color
    if size_y:
        l.shape = "RECTANGLE"
        l.size = size
        l.size_y = size_y
    else:
        l.shape = "DISK"
        l.size = size
    o = bpy.data.objects.new(name, l)
    o.location = loc
    look_at(o, target)
    link(o)
    return o


def camera(loc, target, lens=60, fstop=None, focus=None):
    cd = bpy.data.cameras.new("cam")
    cd.lens = lens
    cd.sensor_width = 36
    cam = bpy.data.objects.new("cam", cd)
    cam.location = loc
    look_at(cam, target)
    link(cam)
    bpy.context.scene.camera = cam
    if fstop:
        cd.dof.use_dof = True
        cd.dof.aperture_fstop = fstop
        cd.dof.focus_distance = focus if focus else (Vector(target) - Vector(loc)).length
    return cam


def framed_camera(target, view_h, direction, lens, fstop=None):
    """A camera that shows `view_h` metres of height at the target, looking along `direction`."""
    fov = 2 * math.atan(18 / lens)
    dist = (view_h / 2) / math.tan(fov / 2)
    d = Vector(direction).normalized()
    return camera(Vector(target) - d * dist, target, lens=lens, fstop=fstop, focus=dist)


def vase(loc, h=0.16, r=0.045, color=STONE, stems=True, name="vase"):
    v = cylinder(name, r, h, (loc[0], loc[1], loc[2] + h / 2), textured(name + "m", color, rough=0.6, bump_strength=0.15, scale=300), r2=r * 0.72, bevel=0.004)
    if stems:
        stem = principled(name + "stem", srgb(104, 112, 74), rough=0.6)
        leaf = principled(name + "leaf", srgb(124, 136, 88), rough=0.5, sheen=0.2)
        for i, (dx, dy, tilt) in enumerate([(0, 0, 0.06), (0.012, 0.004, -0.2), (-0.01, -0.006, 0.24)]):
            sh = h * 1.25
            top = Vector((loc[0] + dx + math.sin(tilt) * sh, loc[1] + dy, loc[2] + h - 0.02 + math.cos(tilt) * sh))
            base = Vector((loc[0] + dx, loc[1] + dy, loc[2] + h - 0.02))
            cylinder(f"{name}stem{i}", 0.0017, sh, (base + top) / 2, stem, rot=(0, tilt, 0), segs=10)
            for k in range(7):
                t = 0.35 + 0.1 * k
                p = base.lerp(top, t)
                side = (-1) ** k
                lf = sphere(f"{name}leaf{i}{k}", 0.0075 + 0.0012 * (k % 3), p + Vector((0.006 * side, 0.002 * side, 0)), leaf, scale=(1.5, 0.22, 0.75), segs=(14, 7))
                lf.rotation_euler = (0.3 * side, 0.5 * side + tilt, 0.9 * k)
    return v


# ------------------------------------------------------------------ rooms
def tabletop(wall_y=0.45, key=(-0.8, -0.85, 1.1), target=(0, 0, 0.08), key_e=72, fill_e=11, rim_e=20):
    box("wall", (6, 0.05, 3), (0, wall_y + 0.025, 1.3), textured("wall", WALL, rough=0.92, bump_strength=0.05))
    box("table", (6, 3, 0.04), (0, wall_y - 1.5, -0.02), wood("oak"))
    area_light("key", key, target, 1.3, key_e, color=(1.0, 0.975, 0.94))
    area_light("fill", (1.1, -1.0, 0.7), target, 1.8, fill_e, color=(0.93, 0.95, 1.0))
    area_light("rim", (0.5, 1.0, 1.1), target, 1.0, rim_e, color=(1.0, 0.93, 0.85))


def living_wall(props=True):
    box("wall", (8, 0.05, 4), (0, 0.025, 1.6), textured("wall", WALL_WARM, rough=0.93, bump_strength=0.06))
    box("floor", (8, 4, 0.04), (0, -2, -0.02), wood("floor", scale=2.0))
    if props:
        sb = wood("sideboard", scale=5.0, rough=0.38, coat=0.25)
        box("sideboard", (1.5, 0.42, 0.70), (0, -0.21, 0.37), sb, bevel=0.006)
        box("legs", (1.40, 0.36, 0.04), (0, -0.20, 0.02), principled("legs", OAK_DARK, rough=0.6))
        for sx in (-1, 1):
            box(f"door{sx}", (0.002, 0.002, 0.5), (sx * 0.002, -0.421, 0.40), principled("gap", (0.05, 0.04, 0.03), rough=0.8))
        vase((0.36, -0.22, 0.72), h=0.26, r=0.065, color=STONE, name="tallvase")
        cylinder("bowl", 0.10, 0.05, (-0.40, -0.2, 0.745), textured("bowl", SAGE, rough=0.55, bump_strength=0.1, scale=250), r2=0.065, bevel=0.004)
        for i, (bh, col, rz) in enumerate([(0.035, srgb(206, 196, 180), 0.0), (0.03, srgb(150, 110, 88), 0.1), (0.028, srgb(84, 96, 88), -0.06)]):
            box(f"book{i}", (0.24, 0.17, bh), (-0.12, -0.2, 0.72 + bh / 2 + sum(x[0] for x in [(0.035,), (0.03,), (0.028,)][:i])), principled(f"book{i}", col, rough=0.75), rot=(0, 0, rz), bevel=0.002)


def wall_lights(tgt):
    area_light("window", (-2.4, -1.8, 2.3), tgt, 2.4, 420, color=(1.0, 0.975, 0.94), size_y=1.6)
    area_light("fill", (2.0, -2.6, 1.5), tgt, 3.0, 80, color=(0.93, 0.95, 1.0))
    area_light("ceiling", (0, -1.0, 3.2), tgt, 2.5, 55, color=(1.0, 0.97, 0.93))


# ------------------------------------------------------------------ products
def acrylic_block(w, h, d=20 * MM, yaw=-0.42, side="left"):
    tabletop()
    acr = glass()
    rot = (0, 0, yaw)
    box("block", (w, d, h), (0, 0, h / 2), acr, rot=rot, bevel=1.8 * MM, role=ROLE_GLASS, segments=4)
    R = Matrix.Rotation(yaw, 4, "Z")
    right = (R @ Vector((1, 0, 0))).to_3d()
    up = Vector((0, 0, 1))
    back = (R @ Vector((0, d / 2 + 0.25 * MM, 0))).to_3d()
    c = Vector((0, 0, h / 2)) + back
    tl, tr, br, bl = frame_corners(c, right, up, w - 2.5 * MM, h - 2.5 * MM)
    quad_face("print", tl, tr, br, bl, face_mat())
    box("backing", (w - 2 * MM, 0.4 * MM, h - 2 * MM), c + (R @ Vector((0, 0.5 * MM, 0))).to_3d(), principled("backing", (0.85, 0.85, 0.85), rough=0.8), rot=rot)
    sx = 1 if side == "left" else -1
    vase((sx * 0.19, 0.16, 0), h=0.15, r=0.045, color=STONE)
    cylinder("candle", 0.03, 0.06, (-sx * 0.16, 0.10, 0.03), textured("candle", srgb(238, 232, 220), rough=0.6, scale=300), segs=64, bevel=1 * MM)
    framed_camera(Vector((0, 0, h * 0.52)), h * 1.55, Vector((0, 1, -0.18)), lens=70, fstop=5.6)
    return {"kind": "corners", "behind_glass": True}


def wall_piece(w, h, kind, yaw=0.0, cam_side=0.0, lens=50, fill=0.5):
    """Wall pieces hung above a sideboard: poster, acrylic on standoffs, floating acrylic, foam board."""
    living_wall()
    cz = 0.72 + 0.17 + h / 2
    R = Matrix.Rotation(yaw, 4, "Z")
    right = (R @ Vector((1, 0, 0))).to_3d()
    up = Vector((0, 0, 1))
    out = (R @ Vector((0, -1, 0))).to_3d()
    info = {"kind": "corners"}
    if kind == "poster":
        c = Vector((0, -0.004, cz))
        box("paper", (w, 0.6 * MM, h), c, principled("paper", (0.9, 0.9, 0.9), rough=0.8))
        tl, tr, br, bl = frame_corners(c + out * 0.35 * MM, right, up, w, h)
        quad_face("print", tl, tr, br, bl, face_mat())
        oak = wood("hanger", scale=30.0)
        for z in (h / 2, -h / 2):
            box(f"bar{z}", (w + 16 * MM, 9 * MM, 18 * MM), c + Vector((0, -5 * MM, z)), oak, bevel=1.5 * MM)
        cord = principled("cord", srgb(70, 58, 44), rough=0.8)
        top = c + Vector((0, -5 * MM, h / 2 + 9 * MM))
        apex = c + Vector((0, -2 * MM, h / 2 + 110 * MM))
        for sx in (-1, 1):
            a = top + Vector((sx * (w / 2 - 20 * MM), 0, 0))
            ang = math.atan2(apex.x - a.x, apex.z - a.z)
            cylinder(f"cord{sx}", 0.8 * MM, (apex - a).length, (a + apex) / 2, cord, rot=(0, ang, 0), segs=12)
        cylinder("nail", 2 * MM, 8 * MM, apex + Vector((0, -2 * MM, 0)), principled("nail", STEEL, rough=0.3, metal=1.0), rot=(math.pi / 2, 0, 0), segs=16)
    elif kind in ("acrylic", "acrylic_float"):
        t = 5 * MM
        gap = 20 * MM if kind == "acrylic" else 14 * MM
        c = Vector((0, -gap - t / 2, cz))
        box("sheet", (w, t, h), c, glass(), rot=(0, 0, yaw), bevel=0.8 * MM, role=ROLE_GLASS, segments=3)
        back = c + out * (-(t / 2 + 0.25 * MM))
        tl, tr, br, bl = frame_corners(back, right, up, w - 1 * MM, h - 1 * MM)
        quad_face("print", tl, tr, br, bl, face_mat())
        box("backing", (w - 1 * MM, 0.4 * MM, h - 1 * MM), back + out * (-0.5 * MM), principled("backing", (0.85, 0.85, 0.85), rough=0.8), rot=(0, 0, yaw))
        info["behind_glass"] = True
        if kind == "acrylic":
            steel = principled("steel", STEEL, rough=0.22, metal=1.0)
            inset = 22 * MM
            for sx in (-1, 1):
                for sz in (-1, 1):
                    p = c + right * (sx * (w / 2 - inset)) + up * (sz * (h / 2 - inset))
                    cylinder(f"post{sx}{sz}", 7 * MM, gap, Vector((p.x, -gap / 2, p.z)), steel, rot=(math.pi / 2, 0, 0), segs=32)
                    cylinder(f"cap{sx}{sz}", 9.5 * MM, 7 * MM, p + out * (t / 2 + 3.5 * MM), steel, rot=(math.pi / 2, 0, yaw), segs=48, bevel=1.2 * MM)
    elif kind == "foam":
        t = 10 * MM
        c = Vector((0, -t / 2 - 0.5 * MM, cz))
        box("foam", (w, t, h), c, principled("foam", FOAM_BLACK, rough=0.7), rot=(0, 0, yaw), bevel=0.6 * MM)
        tl, tr, br, bl = frame_corners(c + out * (t / 2 + 0.2 * MM), right, up, w - 0.6 * MM, h - 0.6 * MM)
        quad_face("print", tl, tr, br, bl, face_mat())
    tgt = Vector((0, 0, cz - h * 0.22))
    wall_lights(tgt)
    framed_camera(tgt, h / fill, Vector((cam_side, 1, -0.06)), lens=lens)
    return info


def pillow(w=305 * MM, h=305 * MM, thick=125 * MM):
    box("wall", (6, 0.05, 3), (0, 0.9 + 0.025, 1.3), textured("wall", WALL, rough=0.92, bump_strength=0.05))
    box("floor", (6, 3, 0.04), (0, -0.6, -0.02), wood("floor", scale=2.0))
    fab = textured("sofa", OATMEAL, rough=0.95, bump_strength=0.25, scale=900, sheen=0.7, vary=0.05)
    box("seat", (1.6, 0.62, 0.18), (0, -0.05, 0.36), fab, bevel=0.035, segments=5)
    box("base", (1.62, 0.64, 0.27), (0, -0.05, 0.135), fab, bevel=0.02)
    box("back", (1.6, 0.22, 0.44), (0, 0.33, 0.68), fab, rot=(-0.14, 0, 0), bevel=0.05, segments=5)
    box("arm", (0.2, 0.78, 0.34), (0.86, 0.0, 0.6), fab, bevel=0.06, segments=5)
    lean = -0.30
    R = Matrix.Translation(Vector((0, 0.14, 0.45 + h / 2 * math.cos(lean)))) @ Matrix.Rotation(lean, 4, "X")
    R2 = Matrix.Translation(Vector((0.36, 0.22, 0.46 + 0.20 * math.cos(lean)))) @ Matrix.Rotation(-0.30, 4, "Z") @ Matrix.Rotation(lean - 0.04, 4, "X") @ Matrix.Rotation(-0.10, 4, "Y")
    front, back_, corners = pillow_meshes(w, h, thick)
    f = mesh_obj("print", front, face_mat(), ROLE_FACE, smooth=True)
    b = mesh_obj("pillowback", back_, textured("pillowback", (0.82, 0.81, 0.79), rough=0.95, bump_strength=0.2, scale=900, sheen=0.5), smooth=True)
    for o in (f, b):
        o.matrix_world = R
    f["corners"] = [list(R @ Vector(p)) for p in corners]
    fr2, bk2, _ = pillow_meshes(0.42, 0.42, 0.15)
    sm = textured("terracotta", TERRACOTTA, rough=0.95, bump_strength=0.25, scale=900, sheen=0.6)
    for nm, bm_ in (("other_f", fr2), ("other_b", bk2)):
        o = mesh_obj(nm, bm_, sm, smooth=True)
        o.matrix_world = R2
    box("throw", (0.5, 0.3, 0.02), (-0.55, -0.1, 0.46), textured("throw", SAGE, rough=0.95, bump_strength=0.3, scale=600, sheen=0.6), rot=(0, 0, 0.12), bevel=0.008)
    tgt = Vector((0.02, 0.1, 0.45 + h / 2))
    area_light("window", (-1.9, -0.7, 1.3), tgt, 1.4, 230, color=(1.0, 0.975, 0.94))
    area_light("fill", (1.4, -1.6, 1.1), tgt, 2.4, 45, color=(0.93, 0.95, 1.0))
    area_light("rim", (0.3, 1.2, 1.5), tgt, 1.2, 40)
    framed_camera(tgt, 0.56, Vector((0, 1, -0.22)), lens=70, fstop=4.0)
    return {"kind": "corners", "bulged": True}


def pillow_meshes(w, h, thick, n=40, pinch=0.045):
    """Front and back of a stuffed square cushion: puffed in the middle, pinched along the edges."""
    def pos(x, y, side):
        X = x * (w / 2) * (1 - pinch * (1 - y * y))
        Y = y * (h / 2) * (1 - pinch * (1 - x * x))
        z = (thick / 2) * ((1 - x * x) * (1 - y * y)) ** 0.75
        return Vector((X, -side * z, Y))  # the front faces -Y (towards the camera)
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


def mug():
    tabletop(wall_y=0.55, key=(-0.75, -0.55, 0.7), target=(0, 0, 0.05), key_e=48, fill_e=4, rim_e=14)
    R_out, H, wall_t = 41 * MM, 96 * MM, 3.2 * MM
    white = principled("ceramic", WHITE_CERAMIC, rough=0.1, coat=0.6, coat_rough=0.04)
    black = principled("glaze", BLACK_CERAMIC, rough=0.18, coat=0.5, coat_rough=0.06)
    cylinder("outer", R_out, H, (0, 0, H / 2), white, segs=192, bevel=1.2 * MM)
    cylinder("inner", R_out - wall_t, H - 6 * MM, (0, 0, H / 2 + 3.2 * MM), black, segs=192)
    cylinder("rimband", R_out + 0.12 * MM, 3.5 * MM, (0, 0, H - 1.75 * MM), black, segs=192)
    bpy.ops.mesh.primitive_torus_add(major_radius=27 * MM, minor_radius=6.2 * MM, major_segments=64, minor_segments=24, location=(R_out + 6 * MM, 0, H * 0.52), rotation=(math.pi / 2, 0, 0))
    hd = bpy.context.active_object
    hd.name = "handle"
    hd.scale = (0.78, 1.0, 1.08)
    hd.data.materials.append(black)
    for p in hd.data.polygons:
        p.use_smooth = True
    hd["role"] = ROLE_SCENE
    # The print band: a cylindrical skin around the front (the front faces -Y).
    top, bottom = H - 6 * MM, 4.5 * MM
    band_h = top - bottom
    half = (band_h / R_out) / 2  # a square picture: arc length = band height
    n_u, n_v = 96, 24
    bm = bmesh.new()
    r = R_out + 0.18 * MM
    vs = [[bm.verts.new((r * math.sin(-half + 2 * half * i / n_u), -r * math.cos(-half + 2 * half * i / n_u), top - band_h * j / n_v)) for i in range(n_u + 1)] for j in range(n_v + 1)]
    for j in range(n_v):
        for i in range(n_u):
            bm.faces.new([vs[j][i], vs[j + 1][i], vs[j + 1][i + 1], vs[j][i + 1]])
    for f in bm.faces:
        f.smooth = True
    mesh_obj("print", bm, face_mat(), ROLE_FACE)
    # Context: a linen coaster under the mug, coffee beans, a plant behind.
    cylinder("coaster", 0.056, 4 * MM, (0, 0, -1.9 * MM), textured("coaster", srgb(176, 136, 96), rough=0.95, bump_strength=0.6, scale=900, vary=0.18), segs=96, bevel=1.2 * MM)
    bean = principled("bean", srgb(70, 42, 26), rough=0.35, coat=0.4)
    random.seed(3)
    for k in range(9):
        sphere(f"bean{k}", 5 * MM, (-0.10 + random.uniform(-0.03, 0.03), -0.03 + random.uniform(-0.025, 0.02), 3 * MM), bean, scale=(1.0, 0.75, 0.55), segs=(16, 8))
    vase((0.16, 0.18, 0), h=0.12, r=0.038, color=STONE)
    tgt = Vector((0.006, 0, H * 0.5))
    framed_camera(tgt, H * 2.05, Vector((0, 1, -0.24)), lens=85, fstop=4.0)
    return {"kind": "wrap", "R": r, "half": half, "top": top, "bottom": bottom}


def ornament():
    s = bpy.context.scene
    s.world.node_tree.nodes["Background"].inputs["Color"].default_value = (*srgb(30, 40, 30), 1)
    s.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.25
    r, t = 38 * MM, 4.5 * MM
    cer = principled("ceramic", WHITE_CERAMIC, rough=0.08, coat=0.8, coat_rough=0.03)
    yaw, pitch = 0.20, 0.06
    rot = (math.pi / 2 + pitch, 0, yaw)
    c = Vector((0, 0, 0))
    disc = cylinder("disc", r, t, c, cer, rot=rot, segs=192, bevel=1.4 * MM)
    Rm = disc.rotation_euler.to_matrix()
    front = (Rm @ Vector((0, 0, 1))).normalized()  # the +Z cap faces the camera (-Y)
    right = (Rm @ Vector((1, 0, 0))).normalized()
    up = (Rm @ Vector((0, 1, 0))).normalized()
    fc = c + front * (t / 2 + 0.15 * MM)
    rr = r - 2.2 * MM
    bm = bmesh.new()
    segs = 192
    bm.faces.new([bm.verts.new(fc + right * rr * math.cos(2 * math.pi * k / segs) + up * rr * math.sin(2 * math.pi * k / segs)) for k in range(segs)])
    o = mesh_obj("print", bm, face_mat(), ROLE_FACE)
    tl, tr, br, bl = frame_corners(fc, right, up, 2 * rr, 2 * rr)
    o["corners"] = [list(tl), list(tr), list(br), list(bl)]
    gold = principled("gold", GOLD, rough=0.25, metal=1.0)
    hole = c + up * (r - 5 * MM)
    rib = principled("ribbon", RIBBON_RED, rough=0.38, sheen=0.7, coat=0.25)
    bpy.ops.mesh.primitive_torus_add(major_radius=2.6 * MM, minor_radius=0.9 * MM, location=hole + front * (t / 2 + 0.2 * MM), rotation=rot)
    g = bpy.context.active_object
    g.data.materials.append(gold)
    g["role"] = ROLE_SCENE
    for sx in (-1, 1):
        L = 0.28
        top = hole + Vector((sx * 0.012, 0, L))
        ang = math.atan2(top.x - hole.x, top.z - hole.z)
        box(f"ribbon{sx}", (6 * MM, 0.5 * MM, L), (hole + top) / 2 + Vector((0, sx * 1.2 * MM, 0)), rib, rot=(0, ang, yaw * 0.5 + sx * 0.15))
    pine = textured("pine", PINE, rough=0.75, bump_strength=0.4, scale=400, sheen=0.0, vary=0.3)
    random.seed(7)
    for k in range(70):
        p = Vector((random.uniform(-0.9, 0.9), random.uniform(0.55, 1.3), random.uniform(-0.6, 0.7)))
        sphere(f"bough{k}", random.uniform(0.05, 0.12), p, pine, scale=(1.8, 1, 0.6), segs=(24, 12))
    for k in range(220):
        p = Vector((random.uniform(-0.45, 0.45), random.uniform(0.14, 0.50), random.uniform(-0.38, 0.40)))
        if abs(p.x) < 0.06 and abs(p.z) < 0.06:
            continue
        warm = random.choice([(1.0, 0.70, 0.36), (1.0, 0.78, 0.48), (1.0, 0.62, 0.30)])
        sphere(f"light{k}", random.uniform(1.6, 2.6) * MM, p, emission(f"bulb{k}", warm, random.uniform(14, 34)), segs=(12, 6))
    area_light("key", (-0.5, -0.55, 0.45), c, 0.5, 14, color=(1.0, 0.93, 0.85))
    area_light("fill", (0.5, -0.5, 0.1), c, 0.7, 5, color=(0.9, 0.95, 1.0))
    area_light("warm", (0.2, 0.4, 0.3), c, 0.6, 8, color=(1.0, 0.75, 0.45))
    area_light("treefill", (-0.2, 0.1, 0.9), Vector((0, 0.9, 0)), 1.6, 30, color=(1.0, 0.88, 0.7))
    framed_camera(c + Vector((0, 0, 0.004)), 0.118, Vector((0, 1, -0.03)), lens=100, fstop=2.0)
    return {"kind": "corners", "mask": "circle"}


def puzzle(w=368 * MM, h=276 * MM):
    tabletop(wall_y=0.7, key=(-0.9, -0.5, 1.2), target=(0, 0.02, 0), key_e=90, fill_e=20, rim_e=20)
    board_t = 2.2 * MM
    yaw = 0.05
    box("board", (w, h, board_t), (0, 0, board_t / 2), principled("board", (0.8, 0.78, 0.75), rough=0.85), rot=(0, 0, yaw), bevel=0.4 * MM)
    R = Matrix.Rotation(yaw, 4, "Z")
    right = (R @ Vector((1, 0, 0))).to_3d()
    up = (R @ Vector((0, 1, 0))).to_3d()  # the top of the picture is away from the camera
    tl, tr, br, bl = frame_corners(Vector((0, 0, board_t + 0.15 * MM)), right, up, w, h)
    quad_face("print", tl, tr, br, bl, face_mat())
    box("lid", (0.30, 0.21, 0.05), (0.36, 0.36, 0.025), textured("lid", srgb(236, 228, 216), rough=0.8, scale=300), rot=(0, 0, -0.35), bevel=1.5 * MM)
    cup = principled("cup", WHITE_CERAMIC, rough=0.1, coat=0.5)
    cylinder("cup", 0.04, 0.085, (-0.29, 0.20, 0.0425), cup, segs=96, bevel=1 * MM)
    cylinder("tea", 0.036, 0.002, (-0.29, 0.20, 0.079), principled("tea", srgb(110, 62, 30), rough=0.05), segs=96)
    vase((-0.36, 0.48, 0), h=0.16, r=0.05, color=STONE)
    tgt = Vector((0, 0.01, 0))
    framed_camera(tgt + Vector((0, -0.01, 0.0)), 0.56, Vector((0, 1, -0.80)), lens=55, fstop=8)
    return {"kind": "corners", "puzzle": True}


PRODUCTS = {
    # name: (builder, kwargs, roughness of the print surface for its shine, exposure)
    "acrylic-block": (acrylic_block, dict(w=127 * MM, h=178 * MM, yaw=-0.42, side="left"), 0.95, 0.0),
    "acrylic-square-block": (acrylic_block, dict(w=152 * MM, h=152 * MM, yaw=0.40, side="right"), 0.95, 0.0),
    "magic-poster": (wall_piece, dict(w=305 * MM, h=406 * MM, kind="poster", cam_side=-0.08, lens=50, fill=0.44), 0.6, 0.0),
    "acrylic-print": (wall_piece, dict(w=305 * MM, h=406 * MM, kind="acrylic", cam_side=-0.55, lens=50, fill=0.44), 0.95, 0.0),
    "acrylic-glass-art": (wall_piece, dict(w=406 * MM, h=610 * MM, kind="acrylic_float", cam_side=0.10, lens=45, fill=0.5), 0.95, 0.0),
    "masterpiece": (wall_piece, dict(w=406 * MM, h=610 * MM, kind="foam", cam_side=0.30, lens=45, fill=0.5), 0.45, 0.0),
    "magic-portrait-tile": (wall_piece, dict(w=305 * MM, h=305 * MM, kind="foam", cam_side=-0.30, lens=50, fill=0.36), 0.45, 0.0),
    "magic-pillow": (pillow, {}, 1.0, 0.0),
    "magic-mug": (mug, {}, 0.08, 0.0),
    "magic-xmas-ornaments": (ornament, {}, 0.08, 0.0),
    "magic-puzzle": (puzzle, {}, 0.6, 0.0),
}


def face_mat():
    if STATE["pass"] == "mask":
        return emission("face_mask", (1, 1, 1), 1.0)
    if STATE["pass"] == "gloss":
        rough = STATE["rough"]
        return principled("face_gloss", (0, 0, 0), rough=rough, coat=0.8 if rough < 0.2 else 0.0, coat_rough=0.04, spec=0.5 if rough < 0.95 else 0.0)
    return principled("face_white", (0.95, 0.95, 0.95), rough=0.85, spec=0.2)


def to_mask_scene():
    black = emission("black", (0, 0, 0), 0.0)
    s = bpy.context.scene
    s.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
    s.cycles.use_denoising = False
    s.view_settings.view_transform = "Standard"
    s.view_settings.look = "None"
    s.view_settings.exposure = 0.0
    for o in s.objects:
        if o.type == "LIGHT":
            o.hide_render = True
            continue
        if o.type != "MESH" or o.get("role", ROLE_SCENE) in (ROLE_FACE, ROLE_GLASS):
            continue
        o.data.materials.clear()
        o.data.materials.append(black)
    if s.camera and s.camera.data.dof.use_dof:
        s.camera.data.dof.use_dof = False


def project(p):
    s = bpy.context.scene
    co = world_to_camera_view(s, s.camera, Vector(p))
    return [co.x, 1 - co.y]


def main():
    name, pas, res, samples, out = sys.argv[-5:]
    STATE["pass"] = pas
    res, samples = int(res), int(samples)
    builder, kw, rough, exposure = PRODUCTS[name]
    STATE["rough"] = rough
    reset(res, samples if pas != "mask" else 24, exposure)
    info = builder(**kw)
    if pas == "mask":
        to_mask_scene()
    bpy.context.view_layer.update()
    face = bpy.data.objects["print"]
    meta = {"product": name, "res": res, "info": dict(info)}
    if "corners" in face.keys():
        meta["corners"] = [project(p) for p in face["corners"]]
    if info["kind"] == "wrap":
        r, half, top, bottom = info["R"], info["half"], info["top"], info["bottom"]
        pt = lambda a, z: project((r * math.sin(a), -r * math.cos(a), z))
        meta["wrap_points"] = {
            "center_top": pt(0, top), "center_bottom": pt(0, bottom),
            "left_top": pt(-half, top), "right_top": pt(half, top),
            "left_bottom": pt(-half, bottom), "right_bottom": pt(half, bottom),
            "left_mid": pt(-half, (top + bottom) / 2), "right_mid": pt(half, (top + bottom) / 2),
            "center_mid": pt(0, (top + bottom) / 2),
        }
        meta["wrap_half_deg"] = math.degrees(half)
    bpy.context.scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    with open(out.rsplit(".", 1)[0] + ".json", "w") as f:
        json.dump(meta, f, indent=1)


if __name__ == "__main__":
    main()
