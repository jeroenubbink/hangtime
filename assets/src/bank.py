# Bank Shot's bank, Fiatmine, built in Blender from this script: blender -b -P assets/src/bank.py
# Saves assets/src/bank.blend and exports assets/scenery/bank.glb (see kitlib.py). Its origin is the middle of the
# front, at the foot of the steps' top (where the podium starts); the front faces Blender's -Y, the game's +z.
# A temple of money in pale stone: a flight of steps up to a portico of eight columns, the name across the frieze
# (drawn in the game, see bank.js), a pediment with the company's gold coin in it, and a copper dome behind.
import bpy, bmesh, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import kitlib
from kitlib import Model, glb, lin

STONE, STONE2, STONE3 = '#e9e2d2', '#d6ccb6', '#c2b69c'
GOLD, GOLD2, BRONZE = '#e8b84a', '#b88a2a', '#5e4128'
COPPER, COPPER2, GLASS, DARK = '#3f9c8c', '#2f7c70', '#2c5f7a', '#2a2f33'
ORANGE = '#ff8a1a'

# The plan: W across, D deep (back from the front of the podium), the podium PH high; the portico's columns COLS
# across at CY, CH tall; the hall behind from HY back
W, D, PH = 44.0, 30.0, 1.2
CY, CH, HY = 1.2, 11.5, 4.5
COLS = [-17.5 + i * 5 for i in range(8)]
TOP = PH + CH            # the columns' tops: the entablature from here
ENT = TOP + 2.4          # its top: the cornice from here
COR = ENT + 0.6          # the cornice's top: the pediment from here


def prism(M, x0, x1, z0, apex, y0, y1, colour):
    """a pediment: a triangle across x0..x1, from z0 up to `apex` in the middle, y0 to y1 deep"""
    bm = M.bm
    xm = (x0 + x1) / 2
    f = [bm.verts.new(p) for p in ((x0, y0, z0), (x1, y0, z0), (xm, y0, apex))]
    b = [bm.verts.new(p) for p in ((x0, y1, z0), (x1, y1, z0), (xm, y1, apex))]
    bm.faces.new(f)
    bm.faces.new(list(reversed(b)))
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((f[j], f[i], b[i], b[j]))
    bm.normal_update()
    M._paint(f + b, colour, False)


def column(M, x, y):
    """a column on the podium: a square plinth, a round base, the shaft (a little narrower up top), and a capital"""
    M.box(x, y, PH, 1.9, 1.9, 0.35, STONE2)
    M.cyl(x, y, PH + 0.35, 0.86, 0.3, STONE, seg=20)
    M.cyl(x, y, PH + 0.65, 0.74, CH - 1.45, STONE, seg=20, r2=0.66)
    M.cyl(x, y, TOP - 0.8, 0.72, 0.25, STONE2, seg=20)
    M.cyl(x, y, TOP - 0.55, 0.72, 0.25, STONE, seg=20, r2=0.95)
    M.box(x, y, TOP - 0.3, 2.0, 2.0, 0.3, STONE2)


def hall():
    M = Model('bank_hall')
    # The steps up, four, across the portico's width, and the podium under it all
    for k in range(4):
        d = 0.8
        M.box(0, -1 - (4 - k) * d + d / 2, 0, 39.0, d, (k + 1) * 0.3, STONE2 if k % 2 else STONE)
    M.box(0, (D - 1) / 2, 0, W, D + 1, PH, STONE3)
    M.box(0, (D - 1) / 2, PH, W - 0.4, D + 0.6, 0.06, STONE2)
    # (two pedestals either side of the steps, a brass lamp on each)
    for s in (-1, 1):
        M.box(s * 20.6, -2.6, 0, 1.6, 3.2, 2.2, STONE2)
        M.box(s * 20.6, -2.6, 2.2, 1.9, 3.5, 0.25, STONE)
        M.cyl(s * 20.6, -2.6, 2.45, 0.12, 3.4, BRONZE, seg=8)
        M.cyl(s * 20.6, -2.6, 5.85, 0.5, 0.9, GOLD, seg=10, r2=0.35)
        M.sphere(s * 20.6, -2.6, 6.95, 0.28, GOLD, seg=10, rings=6)
    # The hall: its front wall back in the portico, the sides and back, and its windows
    M.box(0, HY + (D - HY) / 2, PH, W - 2.0, D - HY, ENT - PH, STONE)
    # (a plinth course along its foot, and string courses between its floors, on the sides)
    for s in (-1, 1):
        M.box(s * (W / 2 - 1.0), HY + (D - HY) / 2, PH, 0.3, D - HY + 0.3, 1.0, STONE2)
        M.box(s * (W / 2 - 1.0), HY + (D - HY) / 2, PH + 6.2, 0.25, D - HY + 0.25, 0.35, STONE2)
        for y in (HY + 3.5, HY + 9.5, HY + 15.5, HY + 21.5):
            for z, h in ((PH + 1.6, 3.8), (PH + 7.3, 3.4)):
                M.box(s * (W / 2 - 1.0), y, z, 0.22, 2.2, h, GLASS)
                M.box(s * (W / 2 - 1.0), y, z + h, 0.3, 2.8, 0.35, STONE2)
    # On the front: the doors in the middle, bronze, the revolving one between, and tall windows each side, a stone
    # hood over each
    M.box(0, HY - 0.15, PH, 6.4, 0.3, 7.4, STONE2)
    M.box(0, HY - 0.3, PH, 5.2, 0.3, 6.2, BRONZE)
    M.cyl(0, HY - 1.2, PH, 1.5, 3.8, GLASS, seg=20)
    M.cyl(0, HY - 1.2, PH + 3.8, 1.6, 0.35, BRONZE, seg=20)
    M.box(0, HY - 0.32, PH + 6.6, 7.6, 0.4, 0.5, STONE3)
    for x in (-15, -10, -5, 5, 10, 15):
        M.box(x, HY - 0.12, PH + 1.0, 2.4, 0.2, 6.4, GLASS)
        M.box(x, HY - 0.16, PH + 1.0, 0.12, 0.2, 6.4, BRONZE)
        M.box(x, HY - 0.16, PH + 4.0, 2.4, 0.2, 0.12, BRONZE)
        M.box(x, HY - 0.3, PH + 7.4, 3.2, 0.5, 0.35, STONE3)
        M.box(x, HY - 0.3, PH + 0.75, 3.0, 0.45, 0.25, STONE2)
    # The portico's columns, the ceiling over them, and the entablature on them: the architrave (the slogan on it),
    # the frieze (the name), a cornice standing out over both, and the pediment
    for x in COLS: column(M, x, CY)
    M.box(0, (CY + HY) / 2, TOP - 0.25, 39.4, HY - CY + 2.0, 0.25, STONE2)
    M.box(0, (-0.25 + HY) / 2, TOP, 39.6, HY + 0.25, 1.0, STONE)
    M.box(0, (-0.45 + HY) / 2, TOP + 1.0, 39.8, HY + 0.45, 1.4, STONE)
    M.box(0, (-0.95 + D + 0.4) / 2, ENT, W + 0.6, D + 1.35, 0.6, STONE2)
    # (dentils under the cornice, along the front)
    for i in range(52):
        M.box(-21.6 + i * (43.2 / 51), -0.7, ENT - 0.18, 0.32, 0.25, 0.18, STONE2)
    # (the tympanum set back, and the raking cornices standing out along its two sloping sides)
    prism(M, -20.4, 20.4, COR, COR + 5.4, -0.3, HY + 0.2, STONE)
    for s in (-1, 1):
        a, b = (s * 20.9, -0.55, COR + 0.05), (0, -0.55, COR + 5.4 + 0.5)
        M.beam(a, b, 0.55, STONE2)
    # (the coin in it: gold, its rim raised, a pickaxe across it, the Fiatmine one)
    cz, cr = COR + 2.3, 2.0
    M.cyl(0, -0.45, cz, cr, 0.3, GOLD, seg=32, axis='Y')
    M.cyl(0, -0.62, cz, cr - 0.25, 0.06, GOLD2, seg=32, axis='Y')
    M.beam((-1.05, -0.72, cz - 1.05), (0.95, -0.72, cz + 0.95), 0.24, BRONZE)
    M.beam((0.2, -0.78, cz + 1.25), (1.45, -0.78, cz + 0.05), 0.3, DARK)
    M.beam((0.45, -0.78, cz + 1.3), (-0.45, -0.78, cz + 1.05), 0.22, DARK)
    # The roof: an attic storey behind the pediment, a balustrade round the edge, and the dome on a drum, copper
    # gone green, a gold lantern on top
    M.box(0, HY + (D - HY) / 2 + 1.5, COR, W - 10, D - HY - 5, 2.6, STONE)
    for s in (-1, 1):
        M.box(s * (W / 2 - 0.2), (HY + D) / 2, COR, 0.4, D - HY, 1.1, STONE2)
    M.box(0, D - 0.2, COR, W, 0.4, 1.1, STONE2)
    dy, dz, dr = 18.5, COR + 2.6, 7.0
    M.cyl(0, dy, dz, dr + 0.6, 0.6, STONE2, seg=40)
    M.cyl(0, dy, dz + 0.6, dr, 3.4, STONE, seg=40)
    for i in range(16):
        a = i / 16 * math.tau
        M.box(math.cos(a) * (dr + 0.02), dy + math.sin(a) * (dr + 0.02), dz + 1.4, 0.2, 0.2, 1.8, GLASS, rot=a)
        M.box(math.cos(a + 0.2) * (dr + 0.15), dy + math.sin(a + 0.2) * (dr + 0.15), dz + 0.6, 0.45, 0.45, 3.4, STONE2, rot=a)
    M.cyl(0, dy, dz + 4.0, dr + 0.4, 0.5, STONE2, seg=40)
    vs = M.sphere(0, dy, dz + 4.5, dr, COPPER, seg=40, rings=20, sz=0.78)
    bmesh.ops.delete(M.bm, geom=[v for v in vs if v.co.z < dz + 4.49], context='VERTS')
    for i in range(12):
        a = i / 12 * math.tau
        M.beam((math.cos(a) * dr * 0.999, dy + math.sin(a) * dr * 0.999, dz + 4.5), (math.cos(a) * 1.0, dy + math.sin(a) * 1.0, dz + 4.5 + dr * 0.76), 0.18, COPPER2)
    M.cyl(0, dy, dz + 4.5 + dr * 0.76, 1.0, 1.6, STONE, seg=16)
    M.cyl(0, dy, dz + 6.1 + dr * 0.76, 1.2, 0.3, GOLD, seg=16)
    M.sphere(0, dy, dz + 6.9 + dr * 0.76, 0.55, GOLD, seg=14, rings=8)
    # (and two flagpoles at the front corners of the roof, the company's orange flying)
    for s in (-1, 1):
        M.cyl(s * 19.0, 3.0, COR, 0.1, 7.0, STONE2, seg=8)
        M.sphere(s * 19.0, 3.0, COR + 7.05, 0.18, GOLD, seg=8, rings=5)
        M.box(s * 19.0 + s * 1.3, 3.0, COR + 5.0, 2.6, 0.05, 1.7, ORANGE)
    return M.build((0, 0, 0))


KIT = bpy.data.collections.new('bank-kit')
bpy.context.scene.collection.children.link(KIT)
kitlib.use(KIT)
hall()

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'bank.blend'))
glb(os.path.join(HERE, '..', 'scenery', 'bank.glb'), list(KIT.objects))
for ob in KIT.objects: print(ob.name, len(ob.data.polygons))
