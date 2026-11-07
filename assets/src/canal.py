# Mind the Gap's canal boats, built in Blender from this script: blender -b -P assets/src/canal.py
# Saves assets/src/canal.blend and exports assets/scenery/canal.glb (see kitlib.py). Each boat's origin is the middle of
# it at the waterline; its bow faces Blender's +Y, the game's -z (as the yacht's does), its deck 1.6 m up for a quay's
# height over the water.
# Moored along the walls, out of the way of the jump: a houseboat on the near side, its owner's garden on the deck, and
# the canal tour boat across on the far side, glass-roofed, waiting for the next lot of sightseers.
import bpy, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import kitlib
from kitlib import Model, glb

CONCRETE, PLANK, TEAL, TEAL2, WHITE, GLASS = '#8f8d87', '#9a6b43', '#1f878c', '#16676b', '#f1efe6', '#2c4a63'
ORANGE, DARK, BLACK, GREEN, POT, NAVY, SKY = '#ff8a1a', '#3d444c', '#1c1d1f', '#5f9a3e', '#b4552f', '#1f3b63', '#9fd3e0'


def plant(M, x, y, z, s=1.0):
    """a terracotta pot with a shrub in it"""
    M.cyl(x, y, z, 0.22 * s, 0.35 * s, POT, seg=10, r2=0.28 * s)
    M.sphere(x, y, z + 0.6 * s, 0.38 * s, GREEN, seg=8, rings=5)


def houseboat():
    """a woonboot: a concrete hull flush with the quay, a planked deck round a timber house painted teal, its windows
    framed white, an orange door at each end, a stovepipe on the flat roof, pot plants, a bike and a lifebuoy"""
    M = Model('houseboat')
    L, B = 15.0, 4.6
    M.box(0, 0, -1.0, B, L, 2.5, CONCRETE)
    M.box(0, 0, 1.5, B, L, 0.1, PLANK)
    # (the house: 4 m wide and 10 long, set toward the stern; a white plinth and eaves)
    HL, HB, H, Y0 = 10.0, 4.0, 2.4, -1.4
    M.box(0, Y0, 1.6, HB, HL, H, TEAL)
    M.box(0, Y0, 1.6, HB + 0.06, HL + 0.06, 0.18, WHITE)
    M.box(0, Y0, 1.6 + H, HB + 0.5, HL + 0.5, 0.16, DARK)
    M.box(0, Y0, 1.6 + H + 0.16, HB + 0.3, HL + 0.3, 0.06, BLACK)
    # (windows down both sides: white frames, the glass, a window box under every other one)
    for s in (-1, 1):
        for i in range(4):
            y = Y0 - 3.6 + i * 2.4
            M.box(s * (HB / 2 + 0.03), y, 2.35, 0.06, 1.4, 1.2, WHITE)
            M.box(s * (HB / 2 + 0.06), y, 2.45, 0.04, 1.2, 1.0, GLASS)
            M.box(s * (HB / 2 + 0.07), y, 2.9, 0.03, 0.06, 0.1, WHITE)
            if i % 2 == 0:
                M.box(s * (HB / 2 + 0.2), y, 2.1, 0.28, 1.2, 0.22, POT)
                M.box(s * (HB / 2 + 0.2), y, 2.3, 0.3, 1.1, 0.16, GREEN)
    # (the doors, orange, at the bow end and the stern, each with its little window; a lifebuoy beside the front one)
    for e in (-1, 1):
        y = Y0 + e * (HL / 2 + 0.03)
        M.box(-0.8, y, 1.6, 0.95, 0.06, 2.05, ORANGE)
        M.box(-0.8, y + e * 0.02, 2.95, 0.5, 0.04, 0.4, GLASS)
        M.box(0.8, y, 2.35, 1.2, 0.06, 1.0, WHITE)
        M.box(0.8, y + e * 0.02, 2.42, 1.0, 0.04, 0.86, GLASS)
    M.cyl(1.25, Y0 + HL / 2 + 0.1, 2.5, 0.42, 0.1, ORANGE, seg=16, axis='Y', caps=False)
    M.cyl(1.25, Y0 + HL / 2 + 0.1, 2.5, 0.3, 0.1, ORANGE, seg=16, axis='Y', caps=False)
    # the stovepipe and its cap, and a satellite dish
    M.cyl(1.2, Y0 - 3.0, 4.15, 0.1, 0.9, BLACK, seg=8)
    M.cyl(1.2, Y0 - 3.0, 5.05, 0.2, 0.08, BLACK, seg=8, r2=0.05)
    M.sphere(-1.2, Y0 + 2.5, 4.4, 0.3, WHITE, seg=10, rings=4, sz=0.4)
    # the front deck: a garden in pots, a bench and table, a bike leaning on the house
    for x, y, s in ((-1.9, 6.9, 1.0), (1.9, 6.9, 1.2), (-1.9, 4.9, 0.8), (1.95, 4.3, 0.9)):
        plant(M, x, y, 1.6, s)
    M.box(0, 5.5, 1.6, 1.4, 0.5, 0.45, PLANK)
    M.box(0, 5.5, 2.0, 1.6, 0.8, 0.05, PLANK)
    M.box(0, 6.3, 1.6, 0.9, 0.9, 0.72, WHITE)
    M.box(0, 6.3, 2.32, 1.0, 1.0, 0.04, WHITE)
    bx = -2.12
    for y in (2.6, 4.0):
        M.cyl(bx, y, 1.95, 0.34, 0.05, BLACK, seg=14, axis='X', caps=False)
    M.beam((bx, 2.6, 2.0), (bx, 3.3, 2.5), 0.05, TEAL2)
    M.beam((bx, 3.3, 2.5), (bx, 4.0, 2.0), 0.05, TEAL2)
    M.beam((bx, 2.6, 2.0), (bx, 3.3, 1.95), 0.05, TEAL2)
    M.beam((bx, 3.3, 2.5), (bx, 3.4, 2.75), 0.04, TEAL2)
    M.box(bx, 3.4, 2.75, 0.06, 0.25, 0.06, BLACK)
    M.box(bx, 4.0, 2.55, 0.06, 0.4, 0.06, BLACK)
    # (a fender or two over the side, and a rail round the bow)
    for s in (-1, 1):
        for y in (-5, 0, 5):
            M.cyl(s * (B / 2 + 0.12), y, 0.6, 0.14, 0.7, BLACK, seg=8)
    for s in (-1, 1):
        M.box(s * (B / 2 - 0.05), 5.5, 2.35, 0.05, 4.0, 0.05, WHITE)
        for y in (3.6, 5.5, 7.4): M.box(s * (B / 2 - 0.05), y, 1.6, 0.05, 0.05, 0.75, WHITE)
    M.box(0, L / 2 - 0.05, 2.35, B - 0.1, 0.05, 0.05, WHITE)
    return M.build((0, 0, 0))


def tourboat():
    """the canal tour boat: long, low and navy, an orange stripe along it, a glass cabin the length of it under a
    curved glass roof, the skipper's place at the bow end and an open deck at the stern, a rail round that"""
    M = Model('tourboat')
    L, B = 17.0, 3.8
    # the hull: below the water, up to its gunwale, the stripe and the white rubbing strake
    M.box(0, 0, -0.8, B, L, 1.75, NAVY)
    M.box(0, L / 2, -0.8, B * 0.7, 0.8, 1.75, NAVY)
    M.box(0, -L / 2, -0.8, B * 0.85, 0.4, 1.75, NAVY)
    M.box(0, 0, 0.55, B + 0.06, L + 0.02, 0.18, ORANGE)
    M.box(0, 0, 0.95, B + 0.12, L + 0.1, 0.1, WHITE)
    M.box(0, 0, 0.95, B - 0.1, L - 0.2, 0.06, PLANK)
    # the cabin: navy below the windows, then glass up and over, ribs every metre and a half
    CL, Y0 = 12.0, 0.9
    M.box(0, Y0, 1.0, B - 0.3, CL, 0.55, NAVY)
    M.box(0, Y0, 1.55, B - 0.3, CL, 0.8, GLASS)
    for i, (w, z, h) in enumerate(((B - 0.5, 2.35, 0.2), (B - 1.1, 2.55, 0.12), (B - 1.9, 2.67, 0.06))):
        M.box(0, Y0, z, w, CL - 0.1, h, SKY if i else GLASS)
    for k in range(9):
        y = Y0 - CL / 2 + k * CL / 8
        for s in (-1, 1):
            M.box(s * (B / 2 - 0.15), y, 1.55, 0.06, 0.08, 0.8, WHITE)
            M.beam((s * (B / 2 - 0.15), y, 2.35), (s * 0.95, y, 2.67), 0.06, WHITE)
        M.box(0, y, 2.69, 1.9, 0.08, 0.05, WHITE)
    # (passengers' seats, a row of them showing through the glass, orange)
    for k in range(10):
        y = Y0 - CL / 2 + 0.8 + k * 1.1
        for s in (-1, 1): M.box(s * 0.85, y, 1.05, 1.0, 0.45, 0.75, ORANGE)
    # the skipper's end: a sloped windscreen, the wheel behind it, and a lamp on top
    yb = Y0 + CL / 2
    M.box(0, yb + 0.1, 1.0, B - 0.4, 0.2, 1.1, NAVY)
    M.box(0, yb + 0.15, 2.1, B - 0.5, 0.06, 0.55, GLASS)
    M.cyl(0.9, yb - 0.4, 1.6, 0.2, 0.05, BLACK, seg=10, axis='Y')
    M.cyl(0, yb - 0.3, 2.72, 0.1, 0.2, WHITE, seg=8)
    # the open stern: a bench round it, the rail and its posts, a flag at the very back
    ys = Y0 - CL / 2
    M.box(0, ys - 0.1, 1.0, B - 0.3, 0.12, 1.55, NAVY)
    M.box(0, -L / 2 + 0.6, 1.0, B - 0.6, 0.5, 0.45, PLANK)
    for s in (-1, 1):
        M.box(s * (B / 2 - 0.05), (ys - L / 2) / 2, 1.85, 0.05, ys + L / 2, 0.05, WHITE)
        for y in (ys - 0.5, -L / 2 + 1.6, -L / 2 + 0.2): M.box(s * (B / 2 - 0.05), y, 1.0, 0.05, 0.05, 0.9, WHITE)
    M.box(0, -L / 2 + 0.05, 1.85, B - 0.1, 0.05, 0.05, WHITE)
    M.cyl(0, -L / 2 + 0.1, 1.0, 0.03, 1.8, WHITE, seg=6)
    M.box(0.3, -L / 2 + 0.1, 2.35, 0.6, 0.02, 0.4, ORANGE)
    M.box(0.3, -L / 2 + 0.1, 2.48, 0.6, 0.03, 0.14, TEAL)
    # (and fenders along its sides)
    for s in (-1, 1):
        for y in (-6, -1, 4):
            M.cyl(s * (B / 2 + 0.12), y, 0.2, 0.13, 0.6, BLACK, seg=8)
    return M.build((0, 0, 0))


KIT = bpy.data.collections.new('canal-kit')
bpy.context.scene.collection.children.link(KIT)
kitlib.use(KIT)
houseboat()
tourboat()

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'canal.blend'))
glb(os.path.join(HERE, '..', 'scenery', 'canal.glb'), list(KIT.objects))
for ob in KIT.objects: print(ob.name, len(ob.data.polygons))
