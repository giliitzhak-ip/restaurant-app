"""
יוצר תמונות בדיקה פוטוריאליסטיות (רינדור מבוסס-פיזיקה, Mitsuba 3) לשלושת התרחישים:
  1. סלון (תמונת החדר)  +  ספה מצולמת באולם תצוגה (שתי זוויות)
  2. דוגמת פרקט בחנות
  3. דוגמת חיפוי קיר (רפפות עץ) בחנות
וגם תמונות "אמת" (ground truth) – אותו חדר כשהמוצר באמת נמצא בו – כדי להשוות לתוצאת האפליקציה.

הרצה:  pip install mitsuba numpy pillow  &&  python3 tools/render_test_scenes.py [--spp 128]
הפלט: test-images/
"""
import argparse
import os

import mitsuba as mi
import numpy as np
from PIL import Image, ImageFilter

mi.set_variant("llvm_ad_rgb")
T = mi.ScalarTransform4f
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "test-images")
TEX = os.path.join(OUT, "_tex")
os.makedirs(TEX, exist_ok=True)
rng = np.random.default_rng(7)


# ---------------------------------------------------------------- טקסטורות
def fbm(h, w, scale_y, scale_x, octaves=4, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp = 1.0
    for o in range(octaves):
        gh, gw = max(2, int(h / scale_y * 2**o)), max(2, int(w / scale_x * 2**o))
        g = r.random((gh, gw))
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += amp * (np.asarray(img) / 255.0 - 0.5)
        amp *= 0.5
    return out


def save_tex(arr, name):
    p = os.path.join(TEX, name)
    Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8)).save(p)
    return p


def oak_planks(w=2048, h=1536, plank_px=256, seed=1, tone=(0.63, 0.47, 0.30)):
    """לוחות אלון: גרעיניות, הבדלי גוון בין לוחות, מרווחים כהים ואורכים מדורגים."""
    r = np.random.default_rng(seed)
    img = np.zeros((h, w, 3))
    rows = h // plank_px
    for row in range(rows):
        y0 = row * plank_px
        x = -r.integers(0, w // 2)
        while x < w:
            L = r.integers(w // 3, w // 2 + w // 4)
            x0, x1 = max(0, x), min(w, x + L)
            if x1 > x0:
                grain = fbm(plank_px, x1 - x0, 6, 180, 5, seed=int(r.integers(1e9)))
                fine = fbm(plank_px, x1 - x0, 2, 40, 3, seed=int(r.integers(1e9)))
                k = 1 + r.normal(0, 0.07)
                base = np.array(tone) * k
                v = 1 + 0.35 * grain + 0.12 * fine
                img[y0:y0 + plank_px, x0:x1] = base[None, None, :] * v[..., None]
                img[y0:y0 + plank_px, x0:min(x0 + 3, w)] *= 0.55
            x += L
        img[y0:y0 + 3] *= 0.5
    return np.clip(img, 0, 1)


def ceramic_tiles(w=1024, h=1024, seed=3):
    """אריח קרמיקה 60×60 בהיר עם פוגה (טקסטורה של אריח אחד + פוגה בשוליים)."""
    base = np.array([0.80, 0.78, 0.74])
    n = fbm(h, w, 60, 60, 4, seed) * 0.08 + fbm(h, w, 8, 8, 2, seed + 1) * 0.03
    img = base[None, None, :] * (1 + n[..., None])
    g = 10
    img[:g] = img[-g:] = img[:, :g] = img[:, -g:] = np.array([0.62, 0.60, 0.57])
    return np.clip(img, 0, 1)


def wall_paint(w=512, h=512, color=(0.86, 0.84, 0.80), seed=5):
    n = fbm(h, w, 30, 30, 3, seed) * 0.025
    return np.clip(np.array(color)[None, None, :] * (1 + n[..., None]), 0, 1)


def fabric(w=512, h=512, color=(0.30, 0.47, 0.46), seed=9):
    """בד בוקלה: גרעיניות עדינה ולולאות קטנות."""
    n = fbm(h, w, 3, 3, 3, seed) * 0.18 + fbm(h, w, 25, 25, 2, seed + 1) * 0.05
    yy, xx = np.mgrid[0:h, 0:w]
    weave = 0.03 * np.sin(xx * 0.9) * np.sin(yy * 0.9)
    return np.clip(np.array(color)[None, None, :] * (1 + n[..., None] + weave[..., None]), 0, 1)


def concrete(w=1024, h=1024, seed=11):
    n = fbm(h, w, 120, 120, 5, seed) * 0.12 + fbm(h, w, 4, 4, 2, seed + 2) * 0.04
    return np.clip(np.array([0.52, 0.52, 0.50])[None, None, :] * (1 + n[..., None]), 0, 1)


# ---------------------------------------------------------------- גאומטריה
def rounded_box_obj(path, size, radius, n=18):
    """קופסה מעוגלת (לריפוד/ספה) כקובץ OBJ עם נורמלים ו-UV."""
    hx, hy, hz = [s / 2 for s in size]
    r = min(radius, hx, hy, hz)
    inner = np.array([hx - r, hy - r, hz - r])
    verts, norms, uvs, faces = [], [], [], []
    axes = [(0, 1, 2), (0, 1, 2)]
    for axis in range(3):
        for sign in (-1, 1):
            u_ax, v_ax = [a for a in range(3) if a != axis]
            start = len(verts)
            for i in range(n + 1):
                for j in range(n + 1):
                    p = np.zeros(3)
                    p[axis] = sign * [hx, hy, hz][axis]
                    p[u_ax] = (-1 + 2 * i / n) * [hx, hy, hz][u_ax]
                    p[v_ax] = (-1 + 2 * j / n) * [hx, hy, hz][v_ax]
                    c = np.clip(p, -inner, inner)
                    d = p - c
                    ln = np.linalg.norm(d)
                    nn = d / ln if ln > 1e-9 else np.eye(3)[axis] * sign
                    verts.append(c + nn * r)
                    norms.append(nn)
                    uvs.append((p[u_ax] + 1.5, p[v_ax] + 1.5))
            for i in range(n):
                for j in range(n):
                    a = start + i * (n + 1) + j
                    b, c_, d_ = a + 1, a + n + 1, a + n + 2
                    if sign > 0 and axis != 1 or sign < 0 and axis == 1:
                        faces.append((a, c_, d_, b))
                    else:
                        faces.append((a, b, d_, c_))
    with open(path, "w") as f:
        for v in verts:
            f.write(f"v {v[0]:.5f} {v[1]:.5f} {v[2]:.5f}\n")
        for v in norms:
            f.write(f"vn {v[0]:.5f} {v[1]:.5f} {v[2]:.5f}\n")
        for v in uvs:
            f.write(f"vt {v[0]:.5f} {v[1]:.5f}\n")
        for q in faces:
            a, b, c, d = [k + 1 for k in q]
            f.write(f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}\n")
            f.write(f"f {a}/{a}/{a} {c}/{c}/{c} {d}/{d}/{d}\n")
    return path


_obj_cache = {}


def rbox(name, size, radius, center, bsdf, rot=None):
    key = (tuple(size), radius)
    if key not in _obj_cache:
        _obj_cache[key] = rounded_box_obj(os.path.join(TEX, f"rb_{len(_obj_cache)}.obj"), size, radius)
    tr = T().translate(center)
    if rot:
        tr = tr @ T().rotate(rot[0], rot[1])
    return name, {"type": "obj", "filename": _obj_cache[key], "to_world": tr, "bsdf": bsdf, "face_normals": False}


def box(name, center, size, bsdf):
    return name, {"type": "cube", "to_world": T().translate(center) @ T().scale([s / 2 for s in size]), "bsdf": bsdf}


def rect(name, center, size, bsdf, rotate=None, emitter=None):
    tr = T().translate(center)
    if rotate:
        for axis, ang in rotate:
            tr = tr @ T().rotate(axis, ang)
    tr = tr @ T().scale([size[0] / 2, size[1] / 2, 1])
    d = {"type": "rectangle", "to_world": tr}
    if bsdf:
        d["bsdf"] = bsdf
    if emitter:
        d["emitter"] = emitter
    return name, d


def diffuse(rgb=None, tex=None, uv_scale=1.0):
    if tex:
        return {"type": "diffuse", "reflectance": {"type": "bitmap", "filename": tex, "to_uv": T().scale([uv_scale, uv_scale, 1])}}
    return {"type": "diffuse", "reflectance": {"type": "rgb", "value": rgb}}


def principled(rgb=None, tex=None, rough=0.5, spec=0.5, uv_scale=1.0, sheen=0.0):
    d = {"type": "principled", "roughness": rough, "specular": spec}
    if sheen:
        d["sheen"] = sheen
    if tex:
        d["base_color"] = {"type": "bitmap", "filename": tex, "to_uv": T().scale([uv_scale, uv_scale, 1])}
    else:
        d["base_color"] = {"type": "rgb", "value": rgb}
    return d


def sofa(prefix, origin, fabric_tex, yaw=0.0):
    """ספה דו-מושבית 210×92×85 ס"מ, מרופדת, רגלי עץ כהות וכרית נוי."""
    ox, oy, oz = origin
    fab = principled(tex=fabric_tex, rough=0.95, spec=0.2, sheen=0.6)
    wood = principled(rgb=[0.12, 0.08, 0.05], rough=0.4, spec=0.4)
    pillow = principled(tex=save_tex(fabric(512, 512, (0.72, 0.55, 0.20), 21), "pillow.png"), rough=0.95, spec=0.2, sheen=0.5)
    parts = []
    base = T().translate([ox, oy, oz]) @ T().rotate([0, 1, 0], yaw)

    def P(name, local_center, size, radius, bsdf, rot=None):
        c = base @ mi.ScalarPoint3f(local_center)
        tr = T().translate([c[0], c[1], c[2]]) @ T().rotate([0, 1, 0], yaw)
        if rot:
            tr = tr @ T().rotate(rot[0], rot[1])
        key = (tuple(size), radius)
        if key not in _obj_cache:
            _obj_cache[key] = rounded_box_obj(os.path.join(TEX, f"rb_{len(_obj_cache)}.obj"), size, radius)
        parts.append((f"{prefix}_{name}", {"type": "obj", "filename": _obj_cache[key], "to_world": tr, "bsdf": bsdf}))

    P("base", [0, 0.27, 0.0], [2.1, 0.28, 0.9], 0.06, fab)
    P("seat_l", [-0.45, 0.47, 0.07], [0.88, 0.17, 0.7], 0.07, fab)
    P("seat_r", [0.45, 0.47, 0.07], [0.88, 0.17, 0.7], 0.07, fab)
    P("back", [0, 0.6, -0.37], [2.1, 0.52, 0.18], 0.07, fab)
    P("backc_l", [-0.45, 0.7, -0.2], [0.88, 0.42, 0.2], 0.1, fab, ([1, 0, 0], -12))
    P("backc_r", [0.45, 0.7, -0.2], [0.88, 0.42, 0.2], 0.1, fab, ([1, 0, 0], -12))
    P("arm_l", [-0.96, 0.4, 0.0], [0.19, 0.56, 0.92], 0.08, fab)
    P("arm_r", [0.96, 0.4, 0.0], [0.19, 0.56, 0.92], 0.08, fab)
    P("pillow", [0.62, 0.73, -0.06], [0.42, 0.4, 0.12], 0.06, pillow, ([0, 0, 1], -12))
    for i, (lx, lz) in enumerate([(-0.95, 0.38), (0.95, 0.38), (-0.95, -0.38), (0.95, -0.38)]):
        c = base @ mi.ScalarPoint3f([lx, 0, lz])
        parts.append((f"{prefix}_leg{i}", {"type": "cylinder", "p0": [c[0], c[1], c[2]], "p1": [c[0], c[1] + 0.13, c[2]], "radius": 0.022, "bsdf": wood}))
    return parts


# ---------------------------------------------------------------- סצנת הסלון
def living_room(extra=(), floor_tex=None, back_wall_tex=None, back_uv=1.0):
    wall = diffuse(tex=save_tex(wall_paint(), "wall.png"))
    white = principled(rgb=[0.9, 0.9, 0.88], rough=0.5, spec=0.3)
    floor_bsdf = principled(tex=floor_tex or save_tex(ceramic_tiles(), "tiles.png"), rough=0.35, spec=0.4, uv_scale=10 if not floor_tex else 5)
    back = diffuse(tex=back_wall_tex, uv_scale=back_uv) if back_wall_tex else wall
    oak = principled(tex=save_tex(oak_planks(1024, 768, 128, seed=4, tone=(0.55, 0.38, 0.22)), "sideboard.png"), rough=0.4, spec=0.4)
    dark = principled(rgb=[0.08, 0.08, 0.08], rough=0.5)
    s = dict(
        type="scene",
        integrator={"type": "path", "max_depth": 7},
        sensor={
            "type": "perspective", "fov": 66, "fov_axis": "x",
            "to_world": T().look_at(origin=[0.25, 1.35, 2.75], target=[-0.25, 0.95, -3.0], up=[0, 1, 0]),
            "film": {"type": "hdrfilm", "width": 1600, "height": 1200, "rfilter": {"type": "gaussian"}},
            "sampler": {"type": "independent", "sample_count": 64},
        },
    )
    items = [
        rect("floor", [0, 0, 0], [6, 6], floor_bsdf, rotate=[([1, 0, 0], -90)]),
        rect("ceiling", [0, 2.7, 0], [6, 6], white, rotate=[([1, 0, 0], 90)]),
        rect("left", [-3, 1.35, 0], [6, 2.7], wall, rotate=[([0, 1, 0], 90)]),
        rect("right", [3, 1.35, 0], [6, 2.7], wall, rotate=[([0, 1, 0], -90)]),
        rect("front", [0, 1.35, 3], [6, 2.7], wall, rotate=[([0, 1, 0], 180)]),
        # קיר אחורי עם פתח חלון x∈[0.6,2.0], y∈[0.9,2.3]
        rect("back_l", [-1.2, 1.35, -3], [3.6, 2.7], back),
        rect("back_r", [2.5, 1.35, -3], [1.0, 2.7], back),
        rect("back_b", [1.3, 0.45, -3], [1.4, 0.9], back),
        rect("back_t", [1.3, 2.5, -3], [1.4, 0.4], back),
        box("win_l", [0.62, 1.6, -3.0], [0.05, 1.4, 0.16], white),
        box("win_r", [1.98, 1.6, -3.0], [0.05, 1.4, 0.16], white),
        box("win_t", [1.3, 2.28, -3.0], [1.4, 0.05, 0.16], white),
        box("win_b", [1.3, 0.92, -2.97], [1.5, 0.05, 0.24], white),
        box("win_m", [1.3, 1.6, -3.0], [0.035, 1.4, 0.08], white),
        box("win_h", [1.3, 1.6, -3.0], [1.4, 0.035, 0.08], white),
        ("sky", {"type": "constant", "radiance": {"type": "rgb", "value": [3.2, 3.7, 4.6]}}),
        rect("ground_out", [1.3, -0.3, -6.0], [12, 6], diffuse([0.25, 0.3, 0.2]), rotate=[([1, 0, 0], -90)]),
        # פאנלים של פלינטוס
        box("skirt_back", [-0.3, 0.04, -2.99], [5.4, 0.08, 0.02], white),
        box("skirt_left", [-2.99, 0.04, 0], [0.02, 0.08, 6], white),
        # שידה נמוכה מול הקיר האחורי (שמאל)
        box("sideboard", [-1.35, 0.42, -2.78], [1.5, 0.52, 0.42], oak),
        *[box(f"sb_leg{i}", [x, 0.08, z], [0.04, 0.16, 0.04], dark) for i, (x, z) in enumerate([(-2.05, -2.62), (-0.65, -2.62), (-2.05, -2.94), (-0.65, -2.94)])],
        box("vase", [-1.7, 0.83, -2.8], [0.12, 0.3, 0.12], principled(rgb=[0.75, 0.73, 0.68], rough=0.3, spec=0.5)),
        # שולחן קפה בחזית (יסתיר חלק מספה שתוצב מאחוריו)
        box("ct_top", [-0.25, 0.4, -0.35], [1.1, 0.05, 0.6], principled(rgb=[0.93, 0.92, 0.9], rough=0.2, spec=0.6)),
        *[box(f"ct_leg{i}", [x, 0.19, z], [0.04, 0.38, 0.04], dark) for i, (x, z) in enumerate([(-0.75, -0.6), (0.25, -0.6), (-0.75, -0.1), (0.25, -0.1)])],
        # עציץ בפינה
        ("pot", {"type": "cylinder", "p0": [2.5, 0, -2.4], "p1": [2.5, 0.42, -2.4], "radius": 0.18, "bsdf": principled(rgb=[0.78, 0.74, 0.68], rough=0.6)}),
        ("potcap", {"type": "disk", "to_world": T().translate([2.5, 0.42, -2.4]) @ T().rotate([1, 0, 0], -90) @ T().scale(0.18), "bsdf": diffuse([0.2, 0.15, 0.1])}),
        *[("leaf%d" % i, {"type": "sphere", "center": [2.5 + dx, 0.95 + dy, -2.4 + dz], "radius": rr, "bsdf": principled(rgb=[0.16, 0.32, 0.14], rough=0.6)}) for i, (dx, dy, dz, rr) in enumerate([(0, 0, 0, 0.32), (-0.18, 0.25, 0.1, 0.22), (0.15, 0.3, -0.05, 0.2), (0.05, -0.2, 0.2, 0.2)])],
        # תאורת תקרה רכה + אור שמש דרך החלון
        ("ceil_light", {"type": "disk", "to_world": T().translate([0, 2.69, 2.2]) @ T().rotate([1, 0, 0], 90) @ T().scale(0.4), "emitter": {"type": "area", "radiance": {"type": "rgb", "value": [14, 12.5, 10.5]}}}),
        ("sun", {"type": "directional", "direction": [-0.3, -0.5, 0.81], "irradiance": {"type": "rgb", "value": [11, 9.8, 8.2]}}),
    ]
    for k, v in list(items) + list(extra):
        s[k] = v
    return s


def develop(img, exposure=1.0, noise=0.006, seed=0, blur=0.0):
    """מ"תמונה פיזיקלית" ל"צילום טלפון": חשיפה, עקומת טון, גאמה, רעש חיישן, JPEG."""
    a = np.array(img)[..., :3] * exposure
    a = a / (1 + a * 0.18)  # עקומת כתפיים עדינה
    a = np.clip(a, 0, 1) ** (1 / 2.2)
    r = np.random.default_rng(seed)
    a = a + r.normal(0, noise, a.shape) + r.normal(0, noise * 0.6, a.shape[:2])[..., None]
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    return im


def render(scene, spp, name, exposure, seed=0, blur=0.0):
    sc = mi.load_dict(scene)
    img = mi.render(sc, spp=spp, seed=seed)
    im = develop(img, exposure, seed=seed, blur=blur)
    p = os.path.join(OUT, name)
    im.save(p, quality=90)
    print("✓", name)
    return p


# ---------------------------------------------------------------- סצנות חנות
def showroom(extra, cam_origin, cam_target, fov=52, glossy=True):
    s = dict(
        type="scene",
        integrator={"type": "path", "max_depth": 6},
        sensor={
            "type": "perspective", "fov": fov, "fov_axis": "x",
            "to_world": T().look_at(origin=cam_origin, target=cam_target, up=[0, 1, 0]),
            "film": {"type": "hdrfilm", "width": 1500, "height": 1125, "rfilter": {"type": "gaussian"}},
        },
    )
    gray = diffuse(tex=save_tex(wall_paint(512, 512, (0.62, 0.62, 0.6), 13), "store_wall.png"))
    floor = principled(tex=save_tex(concrete(), "concrete.png"), rough=0.12 if glossy else 0.6, spec=0.6, uv_scale=3)
    shelf = principled(rgb=[0.35, 0.25, 0.16], rough=0.5)
    items = [
        rect("floor", [0, 0, 0], [14, 14], floor, rotate=[([1, 0, 0], -90)]),
        rect("back", [0, 2, -2.2], [14, 4], gray),
        rect("left", [-5, 2, 0], [14, 4], gray, rotate=[([0, 1, 0], 90)]),
        rect("ceiling", [0, 3.4, 0], [14, 14], diffuse([0.3, 0.3, 0.3]), rotate=[([1, 0, 0], 90)]),
        box("shelf1", [-2.6, 1.3, -2.05], [1.6, 0.04, 0.28], shelf),
        box("shelf2", [-2.6, 1.9, -2.05], [1.6, 0.04, 0.28], shelf),
        box("b1", [-3.1, 1.46, -2.05], [0.25, 0.28, 0.22], principled(rgb=[0.62, 0.3, 0.22], rough=0.5)),
        ("v1", {"type": "sphere", "center": [-2.4, 1.45, -2.05], "radius": 0.13, "bsdf": principled(rgb=[0.25, 0.36, 0.48], rough=0.2, spec=0.7)}),
        box("b2", [-2.1, 2.05, -2.05], [0.3, 0.26, 0.2], principled(rgb=[0.8, 0.75, 0.6], rough=0.6)),
        box("b3", [2.4, 1.5, -2.08], [0.9, 0.9, 0.05], principled(rgb=[0.75, 0.62, 0.35], rough=0.6)),
        ("spot1", {"type": "disk", "to_world": T().translate([-0.6, 3.39, 0.6]) @ T().rotate([1, 0, 0], 90) @ T().scale(0.25), "emitter": {"type": "area", "radiance": {"type": "rgb", "value": [45, 40, 34]}}}),
        ("spot2", {"type": "disk", "to_world": T().translate([0.9, 3.39, 0.4]) @ T().rotate([1, 0, 0], 90) @ T().scale(0.25), "emitter": {"type": "area", "radiance": {"type": "rgb", "value": [45, 40, 34]}}}),
        ("amb", {"type": "constant", "radiance": {"type": "rgb", "value": [0.25, 0.25, 0.27]}}),
    ]
    for k, v in items + list(extra):
        s[k] = v
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spp", type=int, default=128)
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    spp = a.spp
    fab = save_tex(fabric(), "fabric.png")
    want = lambda n: not a.only or n in a.only.split(",")

    # --- 1. החדר (לפני)
    if want("room"):
        render(living_room(), spp * 3, "room-living.jpg", exposure=1.7, seed=1)
    # --- ספה בחנות: חזית ו-3/4
    sofa_parts = sofa("sofa", [0.0, 0.0, -0.5], fab)
    armchair = [rbox("arm_seat", [0.8, 0.45, 0.8], 0.08, [3.0, 0.3, -0.6], principled(rgb=[0.7, 0.66, 0.6], rough=0.9)),
                rbox("arm_back", [0.8, 0.5, 0.18], 0.07, [3.0, 0.7, -0.95], principled(rgb=[0.7, 0.66, 0.6], rough=0.9))]
    lamp = [("lamp_pole", {"type": "cylinder", "p0": [-2.0, 0, -1.2], "p1": [-2.0, 1.55, -1.2], "radius": 0.015, "bsdf": principled(rgb=[0.1, 0.1, 0.1], rough=0.3)}),
            ("lamp_shade", {"type": "cylinder", "p0": [-2.0, 1.45, -1.2], "p1": [-2.0, 1.75, -1.2], "radius": 0.2, "bsdf": diffuse([0.9, 0.88, 0.82])})]
    if want("sofa"):
        render(showroom(sofa_parts + armchair + lamp, [0.3, 1.25, 3.1], [0.0, 0.5, -0.5]), spp, "store-sofa-front.jpg", exposure=0.85, seed=2)
        render(showroom(sofa_parts + armchair + lamp, [2.4, 1.3, 2.4], [0.0, 0.5, -0.5]), spp, "store-sofa-angle.jpg", exposure=0.85, seed=3)
    # --- 2. פרקט בחנות: לוח תצוגה על הקיר
    oak = save_tex(oak_planks(), "oak.png")
    if want("parquet"):
        board = [
            rect("oak_board", [0, 1.35, -2.17], [1.6, 1.2], principled(tex=oak, rough=0.35, spec=0.5)),
            rect("tile_board", [-1.9, 1.35, -2.17], [1.0, 1.2], principled(tex=save_tex(ceramic_tiles(512, 512, 17) * np.array([0.9, 0.95, 1.0]), "tile2.png"), rough=0.3, spec=0.5, uv_scale=2)),
            rect("dark_board", [1.8, 1.35, -2.17], [1.0, 1.2], principled(tex=save_tex(oak_planks(1024, 768, 128, 8, (0.28, 0.19, 0.12)), "walnut.png"), rough=0.3, spec=0.5)),
            box("label", [0, 0.62, -2.15], [0.3, 0.12, 0.01], diffuse([0.95, 0.95, 0.95])),
        ]
        render(showroom(board, [0.25, 1.4, 0.9], [0.0, 1.3, -2.2], fov=60, glossy=False), spp, "store-parquet.jpg", exposure=0.85, seed=4)
    # --- 3. חיפוי קיר: רפפות עץ על לבד כהה (תבליט תלת-ממדי אמיתי)
    if want("cladding"):
        slat_oak = principled(tex=save_tex(oak_planks(256, 1024, 1024, 12, (0.66, 0.5, 0.33)), "slat.png"), rough=0.5, spec=0.35)
        felt = diffuse(tex=save_tex(fabric(256, 256, (0.08, 0.08, 0.08), 31), "felt.png"))
        panel = [rect("felt", [0, 1.35, -2.175], [1.2, 1.8], felt)]
        for i in range(30):
            x = -0.6 + 0.02 + i * 0.04
            panel.append(box(f"slat{i}", [x, 1.35, -2.16], [0.027, 1.8, 0.02], slat_oak))
        panel.append(("graze", {"type": "disk", "to_world": T().translate([0, 3.2, -1.6]) @ T().rotate([1, 0, 0], 70) @ T().scale(0.3), "emitter": {"type": "area", "radiance": {"type": "rgb", "value": [25, 22, 18]}}}))
        render(showroom(panel, [0.2, 1.4, 0.8], [0.0, 1.35, -2.2], fov=62, glossy=False), spp, "store-cladding.jpg", exposure=0.8, seed=5)

    # --- תמונות "אמת": המוצר באמת בחדר (להשוואה בלבד)
    if want("gt"):
        render(living_room(extra=sofa("gt_sofa", [-0.55, 0.0, -1.65], fab)), spp * 3, "gt-room-sofa.jpg", exposure=1.7, seed=1)
        render(living_room(floor_tex=oak), spp * 3, "gt-room-parquet.jpg", exposure=1.7, seed=1)
    if want("gtclad"):
        # אותן רפפות (4 ס"מ, על לבד כהה) לאורך כל הקיר האחורי, מעל הפלינטוס ומסביב לפתח החלון
        slat_oak = principled(tex=save_tex(oak_planks(256, 1024, 1024, 12, (0.66, 0.5, 0.33)), "slat.png"), rough=0.5, spec=0.35)
        felt = diffuse(tex=save_tex(fabric(256, 256, (0.08, 0.08, 0.08), 31), "felt.png"))
        wall_parts = [
            rect("felt_l", [-1.2, 1.39, -2.985], [3.6, 2.62], felt),
            rect("felt_r", [2.5, 1.39, -2.985], [1.0, 2.62], felt),
            rect("felt_b", [1.3, 0.49, -2.985], [1.4, 0.82], felt),
            rect("felt_t", [1.3, 2.5, -2.985], [1.4, 0.4], felt),
        ]
        x = -3.0 + 0.02
        i = 0
        while x < 3.0:
            if 0.6 < x < 2.0:  # מתחת ומעל החלון
                wall_parts.append(box(f"cs{i}a", [x, 0.49, -2.97], [0.027, 0.82, 0.02], slat_oak))
                wall_parts.append(box(f"cs{i}b", [x, 2.5, -2.97], [0.027, 0.4, 0.02], slat_oak))
            else:
                wall_parts.append(box(f"cs{i}", [x, 1.39, -2.97], [0.027, 2.62, 0.02], slat_oak))
            x += 0.04
            i += 1
        render(living_room(extra=wall_parts), spp * 3, "gt-room-cladding.jpg", exposure=1.7, seed=1)


if __name__ == "__main__":
    main()
