# Tanker Row's fuel depot, built in Blender from this script: blender -b -P assets/src/depot.py
# Saves assets/src/depot.blend and exports assets/scenery/depot.glb. Each model is one mesh, vertex-coloured (a `Col`
# colour per point, the parts kept apart so they don't blend), its origin where it stands on the ground; the front
# (the side toward the road) faces Blender's -Y, which is the game's +z.
import bpy, bmesh, math, os
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))

def lin(hex_):
    c = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]

# The depot's colours: a cream white for the tanks, steel in a teal grey, safety orange, and the company's teal
CREAM, CREAM2, ROOF = '#ece8dc', '#dcd7c8', '#bfc3c0'
STEEL, STEEL2, DARK = '#5d7478', '#7d9295', '#33393d'
ORANGE, TEAL, YELLOW, RED, WHITE = '#ff8a1a', '#11898c', '#ffd23a', '#d8352b', '#f4f2ea'
CONCRETE, CONCRETE2, GLASS = '#a9aca6', '#c4c6c0', '#2c5f7a'


class Model:
    """Parts added into one bmesh, each with its own colour"""
    def __init__(self, name):
        self.name, self.bm = name, bmesh.new()
        self.col = self.bm.verts.layers.float_color.new('Col')

    def _paint(self, verts, colour, smooth):
        c = lin(colour)
        for v in verts: v[self.col] = c
        faces = {f for v in verts for f in v.link_faces}
        for f in faces: f.smooth = smooth

    def box(self, x, y, z, w, d, h, colour, rot=0.0):
        """a box w (x) by d (y) by h (z), its bottom middle at (x, y, z), turned rot about z"""
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = r['verts']
        bmesh.ops.scale(self.bm, vec=(w, d, h), verts=vs)
        bmesh.ops.translate(self.bm, vec=(0, 0, h / 2), verts=vs)
        if rot: bmesh.ops.rotate(self.bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, 'Z'), verts=vs)
        bmesh.ops.translate(self.bm, vec=(x, y, z), verts=vs)
        self._paint(vs, colour, False)
        return vs

    def cyl(self, x, y, z, r, h, colour, seg=24, r2=None, smooth=True, axis='Z', caps=True):
        """an upright cylinder (or a cone, to r2) of radius r, height h, its bottom middle at (x, y, z); `axis` lays it
        along X or Y instead, (x, y, z) then its middle"""
        res = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
        vs = res['verts']
        bmesh.ops.translate(self.bm, vec=(0, 0, h / 2), verts=vs)
        if axis == 'X':
            bmesh.ops.translate(self.bm, vec=(0, 0, -h / 2), verts=vs)
            bmesh.ops.rotate(self.bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'), verts=vs)
        elif axis == 'Y':
            bmesh.ops.translate(self.bm, vec=(0, 0, -h / 2), verts=vs)
            bmesh.ops.rotate(self.bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'), verts=vs)
        bmesh.ops.translate(self.bm, vec=(x, y, z), verts=vs)
        self._paint(vs, colour, smooth)
        # (the caps flat even on a smooth cylinder)
        for f in {f for v in vs for f in v.link_faces}:
            if len(f.verts) > 4: f.smooth = False
        return vs

    def sphere(self, x, y, z, r, colour, seg=16, rings=8, sz=1.0):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=r)
        vs = res['verts']
        bmesh.ops.scale(self.bm, vec=(1, 1, sz), verts=vs)
        bmesh.ops.translate(self.bm, vec=(x, y, z), verts=vs)
        self._paint(vs, colour, True)
        return vs

    def beam(self, a, b, t, colour, round_=False):
        """a square (or round) bar of thickness t from point a to point b"""
        a, b = Vector(a), Vector(b)
        d = b - a
        L = d.length
        if round_: vs = self.cyl(0, 0, 0, t / 2, L, colour, seg=8)
        else: vs = self.box(0, 0, 0, t, t, L, colour)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bmesh.ops.rotate(self.bm, cent=(0, 0, 0), matrix=q.to_matrix(), verts=vs)
        bmesh.ops.translate(self.bm, vec=a, verts=vs)
        return vs

    def ring(self, x, y, z, r, h, t, colour, seg=24):
        """a band round a tank: a short tube of radius r, t thick"""
        return self.cyl(x, y, z, r + t, h, colour, seg=seg, caps=False)

    def build(self, at):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        me.color_attributes.active_color_name = 'Col'
        ob = bpy.data.objects.new(self.name, me)
        ob.location = at
        KIT.objects.link(ob)
        return ob


# ---- The storage tanks: a cream drum on a concrete ring, a shallow cone roof with a rail round its rim, bands of
# the company's colours, and a stair winding up the side to the roof, the way the real ones have
def tank(name, r, h, band, at, stair_from=-2.3):
    M = Model(name)
    seg = 32
    M.cyl(0, 0, 0, r + 0.6, 0.5, CONCRETE, seg=seg, smooth=False)
    M.cyl(0, 0, 0.5, r, h - 0.5, CREAM, seg=seg)
    # (the plating's seams, a little darker, every 2.4 m up)
    for k in range(1, int((h - 0.5) / 2.4) + 1):
        zz = 0.5 + k * 2.4
        if zz < h - 1.6: M.ring(0, 0, zz, r, 0.08, 0.02, CREAM2, seg=seg)
    M.ring(0, 0, h - 2.2, r, 0.9, 0.04, band, seg=seg)
    M.ring(0, 0, h - 1.1, r, 0.25, 0.04, band, seg=seg)
    M.cyl(0, 0, h, r + 0.15, max(1.0, r * 0.12), ROOF, seg=seg, r2=1.2, smooth=False)
    M.cyl(0, 0, h + max(1.0, r * 0.12), 1.2, 0.5, STEEL, seg=12)
    # the rail round the roof's rim
    n = int(2 * math.pi * r / 2.2)
    for i in range(n):
        a = 2 * math.pi * i / n
        M.beam((math.cos(a) * (r - 0.1), math.sin(a) * (r - 0.1), h + 0.1), (math.cos(a) * (r - 0.1), math.sin(a) * (r - 0.1), h + 1.15), 0.08, ORANGE)
    M.ring(0, 0, h + 1.05, r - 0.15, 0.1, 0.0, ORANGE, seg=seg)
    # the stair: treads winding a third of the way round, up to the roof, with its rail
    steps = int(h / 0.45)
    turn = 2 * math.pi / 3
    for i in range(steps):
        f = i / steps
        a = stair_from + f * turn
        zz = 0.5 + f * (h - 0.5)
        ca, sa = math.cos(a), math.sin(a)
        M.box(ca * (r + 0.55), sa * (r + 0.55), zz, 1.0, 0.32, 0.08, STEEL, rot=a + math.pi / 2)
        if i % 3 == 0:
            M.beam((ca * (r + 1.05), sa * (r + 1.05), zz), (ca * (r + 1.05), sa * (r + 1.05), zz + 1.0), 0.07, ORANGE)
    pts = []
    for i in range(0, 25):
        f = i / 24
        a = stair_from + f * turn
        pts.append((math.cos(a) * (r + 1.05), math.sin(a) * (r + 1.05), 0.5 + f * (h - 0.5) + 1.0))
    for p, q in zip(pts, pts[1:]): M.beam(p, q, 0.08, ORANGE)
    # a pipe out at the foot, a valve on it, toward the front
    M.cyl(0, -r - 1.4, 0.9, 0.35, 2.8, STEEL2, seg=10, axis='Y')
    M.cyl(0, -r - 2.0, 0.9, 0.55, 0.3, RED, seg=12, axis='Y')
    return M.build(at)


# ---- A long white pressure tank on its side, on two concrete saddles (along x)
def bullet(at):
    M = Model('depot_bullet')
    L, r = 14.0, 2.1
    for x in (-L / 2 + 2.5, L / 2 - 2.5):
        M.box(x, 0, 0, 1.0, 3.6, 1.6, CONCRETE)
    M.cyl(0, 0, r + 1.0, r, L, WHITE, seg=24, axis='X', caps=False)
    for s in (-1, 1):
        vs = M.sphere(s * L / 2, 0, r + 1.0, r, WHITE, seg=24, rings=12)
        # (only the half that sticks out)
        bmesh.ops.delete(M.bm, geom=[v for v in vs if s * (v.co.x - s * L / 2) < -1e-4], context='VERTS')
    for x in (-3.5, 3.5):
        M.cyl(x, 0, r + 1.0, r + 0.04, 0.5, ORANGE, seg=24, axis='X', caps=False)
    M.cyl(0, 0, 2 * r + 1.0, 0.25, 1.0, STEEL, seg=8)
    M.cyl(0, 0, 2 * r + 2.0, 0.45, 0.25, RED, seg=10)
    return M.build(at)


# ---- The loading rack the tankers fill up under: a canopy on steel posts, a walkway along the middle at a tanker's
# roof, the arms that swing over to fill them, and the pumps; two bays, drive-through along x
def gantry(at):
    M = Model('depot_gantry')
    W, D, H = 22.0, 14.0, 8.0
    for x in (-W / 2 + 1, 0, W / 2 - 1):
        for y in (-D / 2 + 0.6, D / 2 - 0.6):
            M.box(x, y, 0, 0.5, 0.5, H, STEEL)
    for y in (-D / 2 + 0.6, D / 2 - 0.6):
        M.box(0, y, H - 0.8, W, 0.5, 0.8, STEEL)
    for x in (-W / 2 + 1, 0, W / 2 - 1):
        M.box(x, 0, H - 0.8, 0.5, D, 0.8, STEEL)
    # the roof, its edge in the company's orange with a teal stripe
    M.box(0, 0, H, W + 1.2, D + 1.2, 0.35, WHITE)
    M.box(0, 0, H - 0.65, W + 1.4, D + 1.4, 0.65, ORANGE)
    for y in (-1, 1):
        M.box(0, y * (D / 2 + 0.71), H - 0.45, W + 1.3, 0.04, 0.22, TEAL)
    for x in (-1, 1):
        M.box(x * (W / 2 + 0.71), 0, H - 0.45, 0.04, D + 1.3, 0.22, TEAL)
    # the walkway down the middle, between the two bays, on its own posts, rails both sides, and a stair up at one end
    M.box(0, 0, 4.2, W - 2, 1.6, 0.15, STEEL2)
    for x in (-W / 2 + 2, -3, 3, W / 2 - 2):
        M.box(x, 0, 0, 0.35, 0.35, 4.2, STEEL)
    for y in (-0.75, 0.75):
        M.box(0, y, 5.25, W - 2, 0.07, 0.07, YELLOW)
        for x in [(-W / 2 + 1) + k * 1.5 for k in range(int((W - 2) / 1.5) + 1)]:
            M.box(x, y, 4.35, 0.06, 0.06, 0.95, YELLOW)
    for i in range(10):
        M.box(W / 2 - 1.5 + i * 0.42, 0, 4.2 - (i + 1) * 0.42, 0.42, 1.2, 0.1, STEEL2)
    # the loading arms: down from the walkway, out over each bay, and a hose down
    for x in (-6, 0, 6):
        for s in (-1, 1):
            M.beam((x, s * 0.8, 4.4), (x, s * 2.6, 6.0), 0.22, ORANGE, round_=True)
            M.beam((x, s * 2.6, 6.0), (x, s * 3.8, 4.6), 0.22, ORANGE, round_=True)
            M.beam((x, s * 3.8, 4.6), (x, s * 3.8, 3.6), 0.14, DARK, round_=True)
    # the pumps and meters, on an island under the walkway
    M.box(0, 0, 0, W - 4, 1.2, 0.25, CONCRETE2)
    for x in (-7.5, -2.5, 2.5, 7.5):
        M.box(x, 0, 0.25, 1.1, 0.8, 1.8, TEAL)
        M.box(x, -0.41, 1.25, 0.7, 0.02, 0.5, GLASS)
        M.box(x, 0.41, 1.25, 0.7, 0.02, 0.5, GLASS)
        M.box(x, 0, 2.05, 1.2, 0.9, 0.12, WHITE)
    # bollards, yellow, at the ends of the island
    for x in (-W / 2 + 2.2, W / 2 - 2.2):
        M.cyl(x, 0, 0.25, 0.22, 1.1, YELLOW, seg=10)
    return M.build(at)


# ---- The gate: two concrete pillars and a steel portal over the way in, its beam the board the name goes on (the
# name's put on by the game, in the language you play in); a gatehouse by it and a red and white barrier, down
def gate(at):
    M = Model('depot_gate')
    S, H = 7.0, 7.4
    for s in (-1, 1):
        M.box(s * S, 0, 0, 1.4, 1.4, 2.4, CONCRETE2)
        M.box(s * S, 0, 2.4, 1.6, 1.6, 0.25, CONCRETE)
        M.box(s * S, 0, 2.65, 0.7, 0.7, H - 2.65, STEEL)
        # (orange caps on the pillars)
        M.box(s * S, 0, H + 1.9, 0.9, 0.9, 0.2, ORANGE)
        M.box(s * S, 0, H, 0.7, 0.7, 1.9, STEEL)
    # the board across the top (its front, toward -y, painted over in the game) and a frame round it
    M.box(0, 0.05, H - 0.4, 2 * S + 0.6, 0.5, 2.4, TEAL)
    M.box(0, 0.05, H + 2.0, 2 * S + 1.0, 0.7, 0.18, ORANGE)
    M.box(0, 0.05, H - 0.58, 2 * S + 1.0, 0.7, 0.18, ORANGE)
    # the barrier, down across the way in, from a post on the right: red and white
    M.box(S - 1.4, -1.2, 0, 0.6, 0.6, 1.1, YELLOW)
    for i in range(6):
        M.box(S - 2.1 - i * 1.9 + 0.95 - 0.95, -1.2, 0.95, 1.9, 0.14, 0.14, RED if i % 2 == 0 else WHITE)
    M.box(-S + 1.6, -1.2, 0, 0.3, 0.3, 1.0, STEEL)
    # the gatehouse, just inside on the left: a box with windows all round and a flat roof
    gx, gy = -S - 4.0, 3.0
    M.box(gx, gy, 0, 3.6, 3.0, 0.3, CONCRETE)
    M.box(gx, gy, 0.3, 3.2, 2.6, 1.0, WHITE)
    M.box(gx, gy, 1.3, 3.2, 2.6, 1.2, GLASS)
    for x in (-1.55, 1.55):
        for y in (-1.25, 1.25):
            M.box(gx + x, gy + y, 1.3, 0.12, 0.12, 1.2, WHITE)
    M.box(gx, gy, 2.5, 3.2, 2.6, 0.3, WHITE)
    M.box(gx, gy, 2.8, 3.8, 3.2, 0.25, ORANGE)
    return M.build(at)


# ---- A length of palisade fence, 10 m along x, centred: posts, two rails, and the pales with their pointed tops
def fence(at):
    M = Model('depot_fence')
    L, H = 10.0, 2.4
    for x in (-L / 2, 0):
        M.box(x + 0.0, 0, 0, 0.16, 0.16, H + 0.1, STEEL)
    for z in (0.35, H - 0.45):
        M.box(0, 0.12, z, L, 0.05, 0.12, STEEL)
    n = int(L / 0.22)
    for i in range(n):
        x = -L / 2 + 0.11 + i * 0.22
        M.box(x, 0.17, 0.05, 0.12, 0.04, H - 0.25, STEEL2)
        tip = M.cyl(x, 0.17, H - 0.2, 0.08, 0.28, STEEL2, seg=4, r2=0.0, smooth=False)
    return M.build(at)


# ---- The office: a two-storey block of portable cabins, stacked, a stair up the end, windows along the front
def office(at):
    M = Model('depot_office')
    W, D = 12.0, 4.0
    for z, c in ((0, WHITE), (2.9, WHITE)):
        M.box(0, 0, z + 0.1, W, D, 2.8, c)
        # (the trim stands a little proud of the roof, so the two never share a face)
        M.box(0, 0, z + 2.75, W + 0.2, D + 0.2, 0.2, TEAL)
        for x in (-4.2, -1.4, 1.4, 4.2):
            M.box(x, -D / 2 - 0.01, z + 1.0, 1.6, 0.05, 1.1, GLASS)
            M.box(x, -D / 2 - 0.03, z + 0.95, 1.8, 0.05, 0.08, DARK)
    M.box(-5.3, -D / 2 - 0.02, 0.1, 1.0, 0.05, 2.1, ORANGE)
    # the stair up the end, and the landing
    for i in range(12):
        M.box(W / 2 + 0.7, -D / 2 + 0.5 + i * 0.25, 0.25 + i * 0.25, 1.2, 0.28, 0.08, STEEL2)
    M.box(W / 2 + 0.7, D / 2 - 0.4, 2.9, 1.3, 1.6, 0.12, STEEL2)
    M.beam((W / 2 + 1.3, -D / 2 + 0.5, 1.3), (W / 2 + 1.3, -D / 2 + 3.5, 4.1), 0.07, YELLOW)
    M.box(W / 2 + 1.3, -D / 2 + 0.5, 0.3, 0.06, 0.06, 1.0, YELLOW)
    # an air conditioner on the roof, a flagpole, and the company's colours
    M.box(-3, 0.5, 5.95, 1.6, 1.2, 0.8, ROOF)
    M.cyl(W / 2 - 0.6, D / 2 - 0.4, 5.95, 0.06, 5.0, STEEL2, seg=6)
    M.box(W / 2 - 0.6 - 0.9, D / 2 - 0.4, 9.9, 1.8, 0.04, 1.0, ORANGE)
    M.box(W / 2 - 0.6 - 0.9, D / 2 - 0.4 - 0.03, 10.25, 1.8, 0.04, 0.3, TEAL)
    M.box(0, 0, 0, W + 1.0, D + 1.0, 0.1, CONCRETE)
    return M.build(at)


# ---- A pipe rack, 12 m along x: a frame of posts and cross beams, and pipes along it in the depot's colours
def pipes(at):
    M = Model('depot_pipes')
    L = 12.0
    for x in (-L / 2 + 0.5, L / 2 - 0.5):
        for y in (-1.2, 1.2):
            M.box(x, y, 0, 0.3, 0.3, 4.2, STEEL)
        M.box(x, 0, 2.6, 0.3, 2.7, 0.25, STEEL)
        M.box(x, 0, 4.0, 0.3, 2.7, 0.25, STEEL)
    for y, z, r, c in ((-0.8, 2.85 + 0.3, 0.3, CREAM), (0.0, 2.85 + 0.3, 0.3, YELLOW), (0.8, 2.85 + 0.3, 0.3, CREAM),
                       (-0.6, 4.25 + 0.22, 0.22, TEAL), (0.4, 4.25 + 0.22, 0.22, ORANGE)):
        M.cyl(0, y, z, r, L, c, seg=12, axis='X', caps=False)
    return M.build(at)


# ---- A fire point: a red board with an extinguisher and a sand bucket, on legs
def firepoint(at):
    M = Model('depot_firepoint')
    for x in (-0.5, 0.5):
        M.box(x, 0, 0, 0.08, 0.08, 1.9, STEEL)
    M.box(0, 0, 0.7, 1.3, 0.06, 1.3, RED)
    M.cyl(-0.3, -0.18, 0.8, 0.13, 0.6, RED, seg=10)
    M.cyl(-0.3, -0.18, 1.4, 0.05, 0.12, DARK, seg=6)
    M.cyl(0.3, -0.2, 0.85, 0.17, 0.35, RED, seg=10, r2=0.2)
    M.box(0, 0, 1.95, 1.4, 0.4, 0.06, RED)
    return M.build(at)


# ---- A floodlight mast: a tapering pole with a ladder up it, a railed platform at the top, and four floodlights on a
# frame, tipped down toward the front; their lenses are a model of their own (`depot_mast_lens`), lit by the game
MAST_H = 22.0
LAMPS = [(-2.1, 0), (-0.7, 0), (0.7, 0), (2.1, 0)]
TILT = math.radians(38)

def lamp_frame(M, lens=False):
    for x, _ in LAMPS:
        rot = Matrix.Rotation(-TILT, 3, 'X')
        if lens:
            vs = M.box(0, 0, 0, 1.0, 0.04, 0.62, '#fff4d6')
            bmesh.ops.translate(M.bm, vec=(0, -0.29, -0.31), verts=vs)
        else:
            vs = M.box(0, 0, 0, 1.15, 0.55, 0.75, DARK)
            bmesh.ops.translate(M.bm, vec=(0, 0, -0.375), verts=vs)
        bmesh.ops.rotate(M.bm, cent=(0, 0, 0), matrix=rot, verts=vs)
        bmesh.ops.translate(M.bm, vec=(x, -0.9, MAST_H + 1.6), verts=vs)

def mast(at):
    M = Model('depot_mast')
    M.box(0, 0, 0, 1.6, 1.6, 0.6, CONCRETE)
    M.cyl(0, 0, 0.6, 0.38, MAST_H - 0.6, STEEL2, seg=10, r2=0.22)
    # (the ladder up the back, in hoops)
    for z in [1.5 + k * 0.6 for k in range(int((MAST_H - 2) / 0.6))]:
        M.box(0, 0.62, z, 0.5, 0.05, 0.05, STEEL)
    for x in (-0.25, 0.25):
        M.box(x, 0.62, 1.4, 0.05, 0.05, MAST_H - 1.4, STEEL)
    # the platform, its rail, and the frame the lamps hang on
    M.cyl(0, 0, MAST_H, 1.5, 0.15, STEEL, seg=12, smooth=False)
    M.ring(0, 0, MAST_H + 1.0, 1.45, 0.08, 0.0, YELLOW, seg=12)
    for i in range(8):
        a = i * math.pi / 4
        M.box(math.cos(a) * 1.45, math.sin(a) * 1.45, MAST_H + 0.15, 0.06, 0.06, 0.9, YELLOW)
    M.box(0, -0.9, MAST_H + 2.1, 5.4, 0.12, 0.12, STEEL)
    M.box(0, -0.9, MAST_H + 0.9, 5.4, 0.12, 0.12, STEEL)
    for x in (-2.7, 2.7):
        M.box(x, -0.9, MAST_H + 0.9, 0.12, 0.12, 1.3, STEEL)
    lamp_frame(M)
    return M.build(at)

def mast_lens(at):
    M = Model('depot_mast_lens')
    lamp_frame(M, lens=True)
    return M.build(at)


bpy.ops.wm.read_factory_settings(use_empty=True)
KIT = bpy.data.collections.new('depot-kit')
bpy.context.scene.collection.children.link(KIT)
# (the front, toward the road, is at -90 degrees: the stairs wind up round the sides and back, clear of the lettering)
tank('depot_tank_huge', 16.0, 18.0, ORANGE, (-40, 0, 0), stair_from=-0.5)
tank('depot_tank_big', 13.0, 15.0, ORANGE, (0, 0, 0), stair_from=-0.6)
tank('depot_tank_mid', 9.0, 12.0, TEAL, (36, 0, 0), stair_from=-1.6)
tank('depot_tank_small', 5.0, 9.0, ORANGE, (60, 0, 0), stair_from=-2.0)
bullet((82, 0, 0))
gantry((0, 50, 0))
gate((40, 50, 0))
fence((64, 50, 0))
office((84, 50, 0))
pipes((0, 80, 0))
firepoint((20, 80, 0))
mast((40, 80, 0))
mast_lens((40, 80, 0))

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'depot.blend'))
# Exported as the other kits are: each model a node of plain triangles (no index), a position, normal and colour at
# each corner (flat faces their own normal, smooth ones the shared one), in the game's axes (y up, Blender's -y its +z)
def glb(path, objects):
    import json, struct
    nodes, meshes, accessors, views, blob = [], [], [], [], bytearray()
    for ob in objects:
        me = ob.data
        me.calc_loop_triangles()
        col = me.color_attributes['Col'].data
        P, N, C = [], [], []
        for tri in me.loop_triangles:
            for k in range(3):
                vi = tri.vertices[k]
                x, y, z = me.vertices[vi].co
                n = me.vertices[vi].normal if tri.use_smooth else tri.normal
                P += [x, z, -y]; N += [n.x, n.z, -n.y]; C += list(col[vi].color)[:3]
        prim = {}
        for name, data in (('POSITION', P), ('NORMAL', N), ('COLOR_0', C)):
            off = len(blob)
            blob += struct.pack('<%df' % len(data), *data)
            views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data) * 4})
            acc = {'bufferView': len(views) - 1, 'componentType': 5126, 'count': len(data) // 3, 'type': 'VEC3'}
            if name == 'POSITION':
                acc['min'] = [min(data[i::3]) for i in range(3)]; acc['max'] = [max(data[i::3]) for i in range(3)]
            accessors.append(acc)
            prim[name] = len(accessors) - 1
        meshes.append({'name': ob.name, 'primitives': [{'attributes': prim}]})
        nodes.append({'name': ob.name, 'mesh': len(meshes) - 1})
    doc = {'asset': {'version': '2.0', 'generator': 'stunts kit'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}],
           'nodes': nodes, 'meshes': meshes, 'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(blob)}]}
    js = json.dumps(doc, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4); blob += b'\0' * (-len(blob) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(blob), 0x004E4942) + bytes(blob))

glb(os.path.join(HERE, '..', 'scenery', 'depot.glb'), list(KIT.objects))
for ob in KIT.objects: print(ob.name, len(ob.data.polygons))
