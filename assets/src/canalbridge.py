# Mind the Gap's bridge, or what's left of it, built in Blender from this script: blender -b -P assets/src/canalbridge.py
# Saves assets/src/canalbridge.blend and exports assets/scenery/canalbridge.glb (see kitlib.py). The game's +z is
# Blender's -Y; each model's origin is the middle of its foot.
# The old steel bridge that carried your road over the canal, its deck lifted out for repairs: the two trusses still
# standing either side of where it was, braced to each other high overhead, on a stone pier in the middle; and on the
# right, a piece of truss gone from the far span, the floating crane beside the bridge lifting it out.
import bpy, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import kitlib
from kitlib import Model, glb

TEAL, TEAL2, PLATE, RUST, STONE, STONE2 = '#1f878c', '#16676b', '#26989d', '#8a4a2a', '#b9b1a0', '#8f887a'
RED, WHITE, DARK, BLACK, YELLOW, ORANGE, CABLE = '#d63a2f', '#eeece6', '#3d444c', '#1c1d1f', '#f2c21b', '#ff8a1a', '#2a2f33'

H, P = 8.0, 4.5          # the trusses' height and their panels' length
SPAN = 27.0              # each span: six panels


def truss(M, y0, n, cut0=False, cut1=False):
    """a Pratt truss side, `n` panels from y0 along +Y, standing on the deck's level (z 0): bottom chord, top chord,
    the posts, the diagonals and the gusset plates at the joints; a whole span's ends slope (`cut` ends are torn off
    short instead, bent steel and a dangling diagonal)"""
    L = n * P
    ys = [y0 + i * P for i in range(n + 1)]
    end0, end1 = not cut0, not cut1
    # the bottom chord the whole way, a deep plate girder
    M.box(0, y0 + L / 2, -0.9, 0.7, L, 1.2, TEAL)
    M.box(0, y0 + L / 2, 0.3, 0.9, L, 0.08, TEAL2)
    # the top chord, from the first post to the last (or to the torn end)
    t0 = ys[1] if end0 else y0 + 0.4
    t1 = ys[-2] if end1 else ys[-1] - 0.4
    M.box(0, (t0 + t1) / 2, H - 0.7, 0.8, t1 - t0, 0.7, TEAL)
    M.box(0, (t0 + t1) / 2, H, 1.0, t1 - t0, 0.08, TEAL2)
    # the end posts, sloping down to the bearings
    if end0: M.beam((0, ys[0] + 0.3, 0.2), (0, ys[1], H - 0.35), 0.7, TEAL)
    if end1: M.beam((0, ys[-1] - 0.3, 0.2), (0, ys[-2], H - 0.35), 0.7, TEAL)
    # posts and diagonals: each diagonal from a post's top down toward the middle of the span
    mid = y0 + L / 2 if end0 and end1 else (y0 + L if end0 else y0)
    for i, y in enumerate(ys):
        if (i == 0 and end0) or (i == n and end1): continue
        if (i == 0 or i == n): continue
        M.beam((0, y, 0.3), (0, y, H - 0.7), 0.45, TEAL)
        M.box(0, y, -0.2, 0.95, 1.4, 1.1, PLATE)
        M.box(0, y, H - 1.1, 0.95, 1.4, 1.1, PLATE)
    for i in range(n):
        a, b = ys[i], ys[i + 1]
        if (i == 0 and end0) or (i == n - 1 and end1): continue
        top, bot = (a, b) if abs(b - mid) < abs(a - mid) else (b, a)
        M.beam((0, top, H - 0.7), (0, bot, 0.3), 0.35, TEAL2)
    # the bearings under a whole end: a plinth and the shoe on it
    for y, e in ((ys[0], end0), (ys[-1], end1)):
        if e:
            M.box(0, y + (0.4 if y == ys[0] else -0.4), -1.4, 1.4, 1.4, 0.5, DARK)
    # torn ends: the chords' ends bent out and down, rust where they tore, a diagonal hanging off the last post
    for y, s, cut in ((y0, -1, cut0), (y0 + L, 1, cut1)):
        if not cut: continue
        M.beam((0, y - s * 0.4, H - 0.35), (0.6, y + s * 1.2, H - 1.6), 0.6, TEAL)
        M.box(0.9, y + s * 1.25, H - 2.0, 0.5, 0.5, 0.5, RUST)
        M.beam((0, y, -0.4), (-0.5, y + s * 1.4, -1.6), 0.7, TEAL)
        M.box(-0.6, y + s * 1.5, -2.0, 0.6, 0.5, 0.5, RUST)
        last = y - s * P
        M.beam((0, last, H - 0.9), (0.4, y - s * 0.6, 1.2), 0.32, TEAL2)
        M.beam((0, last, 0.3), (0, last, H - 0.7), 0.45, TEAL)
        M.box(0, last, -0.2, 0.95, 1.4, 1.1, PLATE)
        M.box(0, last, H - 1.1, 0.95, 1.4, 1.1, PLATE)
        # (and the stubs of the cross girders the deck sat on, cut off with a torch)
        for k in (0.3, 0.7):
            M.box(-0.8, last + (y - last) * k, -0.75, 0.9, 0.35, 0.8, TEAL2)
            M.box(-1.2, last + (y - last) * k, -0.75, 0.05, 0.35, 0.8, RUST)


def span():
    """a whole span's truss side, its middle on the origin"""
    M = Model('bridge_truss')
    truss(M, -SPAN / 2, 6)
    return M.build((0, 0, 0))


def stub():
    """a span's end, two panels of it, torn off: from the origin (its bearing) along +Y (the game's -z)"""
    M = Model('bridge_stub')
    truss(M, 0, 2, cut1=True)
    return M.build((0, 0, 0))


def brace():
    """what ties the two sides together high overhead at a panel point: a strut 22 m across, knee braces down each side,
    an X of rods to the next one (`P` on) and, at the bridge's ends, the portal (deeper, its builder's plate on it)"""
    M = Model('bridge_brace')
    W = 22.0
    M.box(0, 0, H - 0.6, W, 0.5, 0.6, TEAL)
    for s in (-1, 1):
        M.beam((s * W / 2, 0, H - 2.6), (s * (W / 2 - 2.2), 0, H - 0.6), 0.3, TEAL2)
    M.beam((-W / 2, 0, H - 0.3), (W / 2, -P, H - 0.3), 0.12, TEAL2)
    M.beam((W / 2, 0, H - 0.3), (-W / 2, -P, H - 0.3), 0.12, TEAL2)
    return M.build((0, 0, 0))


def portal():
    M = Model('bridge_portal')
    W = 22.0
    M.box(0, 0, H - 1.6, W, 0.6, 1.6, TEAL)
    for x in range(-10, 11, 2):
        M.box(x, -0.32, H - 1.5, 0.12, 0.05, 1.4, TEAL2)
    for s in (-1, 1):
        M.beam((s * W / 2, 0, H - 4.0), (s * (W / 2 - 3.2), 0, H - 1.6), 0.4, TEAL)
    # the builder's plate, cast, and a lamp either side of it
    M.box(0, -0.34, H - 1.35, 4.2, 0.06, 1.1, DARK)
    M.box(0, -0.37, H - 1.25, 3.9, 0.04, 0.9, '#c9a24a')
    for s in (-1, 1):
        M.cyl(s * 3.2, -0.4, H - 0.2, 0.05, 0.6, BLACK, seg=6)
        M.sphere(s * 3.2, -0.4, H + 0.5, 0.22, '#fff2c0', seg=8, rings=5)
    return M.build((0, 0, 0))


def pier():
    """the stone pier in the middle of the canal, under one side: from the bottom up to the deck's level, a cutwater
    at each end and a dressed cap"""
    M = Model('bridge_pier')
    M.box(0, 0, -6, 3.2, 4.0, 4.4, STONE2)
    M.box(0, 0, -1.6, 3.2, 4.0, 0.6, STONE)
    M.box(0, 0, -1.0, 3.6, 4.4, 0.45, STONE)
    for s in (-1, 1):
        M.box(0, s * 2.3, -6, 2.26, 2.26, 5.0, STONE2, rot=math.pi / 4)
        M.box(0, s * 2.3, -1.0, 1.5, 1.5, 0.05, STONE)
    M.box(0, 0, -1.4, 1.6, 1.6, 0.4, DARK)
    return M.build((0, 0, 0))


def lattice(M, a, b, w, colour, k=10):
    """a crane's lattice boom from a to b, w square: four chords and the zigzag between them"""
    from mathutils import Vector
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    u = d.cross(Vector((0, 1, 0))).normalized()
    v = d.cross(u).normalized()
    cs = [a + (u * su + v * sv) * w / 2 for su, sv in ((1, 1), (1, -1), (-1, -1), (-1, 1))]
    L = (b - a).length
    for c in cs: M.beam(tuple(c), tuple(c + d * L), 0.16, colour)
    for i in range(k):
        p0, p1 = d * (L * i / k), d * (L * (i + 1) / k)
        for j in range(4):
            c0, c1 = cs[j], cs[(j + 1) % 4]
            M.beam(tuple(c0 + p0), tuple(c1 + p1), 0.08, WHITE if i % 2 else colour)


def crane():
    """the floating crane: a pontoon (red, a white band), the machinery house at the back with a counterweight, an
    A-frame, the lattice jib reaching out over the bridge's gap at -X, the falls down to the hook block, and the slings
    from that to the piece of truss it's lifting out, hanging under it a little askew"""
    M = Model('bridge_crane')
    M.box(0, 0, -1.2, 16, 12, 2.6, RED)
    M.box(0, 0, 0.7, 16.1, 12.1, 0.4, WHITE)
    M.box(0, 0, 1.1, 15.6, 11.6, 0.06, DARK)
    for x in (-7.6, 7.6):
        for y in (-5.6, 5.6): M.cyl(x, y, 1.1, 0.25, 0.5, YELLOW, seg=8)
    # the house, the counterweight behind it, its cab windows toward the jib
    M.box(3.5, 0, 1.15, 6.0, 5.0, 3.6, WHITE)
    M.box(3.5, 0, 4.75, 6.2, 5.2, 0.2, RED)
    M.box(7.1, 0, 1.15, 1.4, 5.4, 3.0, DARK)
    M.box(0.47, 0, 2.6, 0.06, 3.6, 1.2, '#2c4a63')
    M.box(3.5, 2.53, 3.4, 4.6, 0.06, 0.4, ORANGE)
    M.box(3.5, -2.53, 3.4, 4.6, 0.06, 0.4, ORANGE)
    # the A-frame over the house, and the jib from its foot at the front of the house
    for s in (-1, 1):
        M.beam((6.5, s * 2.2, 4.9), (3.0, s * 0.6, 13.0), 0.5, RED)
        M.beam((0.5, s * 2.2, 1.2), (3.0, s * 0.6, 13.0), 0.4, RED)
    head = (-16.0, 0, 27.0)
    lattice(M, (0.5, 0, 2.0), head, 1.6, RED, k=14)
    M.cyl(head[0], 0, head[2], 0.7, 1.4, DARK, seg=12, axis='Y')
    # (the pendants from the A-frame's top to the jib's head, and the falls down to the block)
    for s in (-1, 1): M.beam((3.0, s * 0.5, 13.0), (head[0] + 0.4, s * 0.5, head[2] + 0.4), 0.07, CABLE)
    hook = (-16.0, 0, 17.0)
    for s in (-1, 1): M.beam((head[0] + s * 0.2, 0, head[2] - 0.6), (hook[0] + s * 0.2, 0, hook[2] + 0.9), 0.06, CABLE)
    M.box(hook[0], 0, hook[2], 1.0, 0.8, 1.0, YELLOW)
    M.box(hook[0], 0, hook[2] - 0.4, 0.3, 0.3, 0.4, DARK)
    # the piece of truss, three panels, its ends cut, hanging below: slings from the hook to its top chord
    yb, lift = 9.0, 4.5
    import bmesh
    from mathutils import Matrix
    before = set(M.bm.verts)
    truss(M, -yb / 2, 2, cut0=True, cut1=True)
    new = [v for v in M.bm.verts if v not in before]
    # (askew: rolled a little and dipped at one end, as a load on slings hangs)
    bmesh.ops.rotate(M.bm, cent=(0, 0, H / 2), matrix=Matrix.Rotation(0.06, 3, 'Y') @ Matrix.Rotation(-0.05, 3, 'X'), verts=new)
    bmesh.ops.translate(M.bm, vec=(hook[0], 0, lift), verts=new)
    for y in (-yb / 2 + 1.5, yb / 2 - 1.5):
        M.beam((hook[0], 0, hook[2] - 0.4), (hook[0], y, lift + H - 0.1 + y * 0.05), 0.06, CABLE)
    return M.build((0, 0, 0))


def deck():
    """what's left of the deck at the far end: a panel's length of it still on the bridge, from the bank out over the
    water (-Y here, toward the near side), its top level with the quay. The road's asphalt and its kerbs, the concrete
    slab under, the cross girders and stringers under that; its broken edge ragged, the rebar sticking out of it"""
    M = Model('bridge_deck')
    W, L = 21.0, 4.5
    M.box(0, -L / 2, -0.55, W, L, 0.5, '#a9a59b')
    M.box(0, -L / 2, -0.05, W - 1.6, L, 0.05, '#3b3e44')
    for s in (-1, 1):
        M.box(s * (W / 2 - 0.4), -L / 2, -0.05, 0.8, L, 0.2, '#c9c4b8')
        # (the lane markings, carried on from the road)
    M.box(-0.12, -L / 2, -0.005, 0.12, L, 0.01, '#f2c21b')
    M.box(0.12, -L / 2, -0.005, 0.12, L, 0.01, '#f2c21b')
    for x in (-3.5, 3.5): M.box(x, -L / 2 - 0.5, -0.005, 0.15, 2.5, 0.01, '#f1efe6')
    # under it: two cross girders (the second at the broken edge, bent) and the stringers along
    M.box(0, -0.6, -1.5, W, 0.4, 0.95, TEAL)
    M.box(0, -L + 0.5, -1.5, W, 0.4, 0.95, TEAL2)
    for x in (-7, -2.5, 2.5, 7): M.box(x, -L / 2, -1.1, 0.35, L, 0.55, TEAL2)
    # the broken edge: lumps of slab hanging on, and rebar bent out of it
    for i, x in enumerate(range(-9, 10, 2)):
        d = 0.3 + (i * 7 % 5) * 0.12
        M.box(x + 0.4, -L - d / 2, -0.55 + (i % 3) * 0.05, 1.3, d, 0.4 - (i % 2) * 0.15, '#a9a59b')
    for i, x in enumerate([v * 0.7 - 9.8 for v in range(29)]):
        M.beam((x, -L - 0.2, -0.3), (x + (i % 3 - 1) * 0.25, -L - 0.7 - (i * 5 % 4) * 0.15, -0.3 - (i * 3 % 5) * 0.12), 0.04, RUST)
    return M.build((0, 0, 0))


KIT = bpy.data.collections.new('canalbridge-kit')
bpy.context.scene.collection.children.link(KIT)
kitlib.use(KIT)
span(); stub(); brace(); portal(); pier(); crane(); deck()

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'canalbridge.blend'))
glb(os.path.join(HERE, '..', 'scenery', 'canalbridge.glb'), list(KIT.objects))
for ob in KIT.objects: print(ob.name, len(ob.data.polygons))
