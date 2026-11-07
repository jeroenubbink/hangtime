# Bank Shot's roadworks compound, built in Blender from this script: blender -b -P assets/src/roadworks.py
# Saves assets/src/roadworks.blend and exports assets/scenery/roadworks.glb (see kitlib.py). Each model's origin is the
# middle of its foot; its front faces Blender's -Y, the game's +z.
# What the crew digging up the road keep across the avenue from it, and what goes up when something does beside it: a
# cage of gas bottles, and the tar boiler on its trailer, its fire lit.
import bpy, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True
import kitlib
from kitlib import Model, glb

STEEL, STEEL2, GALV, CONCRETE = '#5d6670', '#3d444c', '#a9b1b6', '#b9b5aa'
RED, ORANGE, YELLOW, BLACK, DARK, WHITE = '#d9342b', '#ff8a1a', '#f2c21b', '#1c1d1f', '#2a2f33', '#f1efe6'
TEAL, RUST = '#1f878c', '#8a4a2a'


def bottle(M, x, y, colour, h=1.25, r=0.19):
    """a gas bottle standing: the body, its shoulder, the valve and its guard"""
    M.cyl(x, y, 0.12, r, h - 0.25, colour, seg=12)
    M.cyl(x, y, 0.12 + h - 0.25, r, 0.12, colour, seg=12, r2=r * 0.55)
    M.cyl(x, y, h - 0.01, 0.05, 0.09, GALV, seg=6)
    M.ring(x, y, h + 0.06, 0.09, 0.08, 0.025, GALV, seg=8)


def gascage():
    """the bottle store: a galvanised cage on a concrete plinth, two rows of bottles in it, a roof, and the warnings"""
    M = Model('works_gascage')
    W, D, H = 3.4, 1.7, 2.3
    M.box(0, 0, 0, W + 0.3, D + 0.3, 0.12, CONCRETE)
    # (posts at the corners and between, rails top and bottom, and the mesh as thin bars, front and sides)
    for x in (-W / 2, 0, W / 2):
        for y in (-D / 2, D / 2):
            M.box(x, y, 0.12, 0.08, 0.08, H - 0.12, GALV)
    for z in (0.2, H - 0.05):
        M.box(0, -D / 2, z, W, 0.06, 0.06, GALV)
        M.box(0, D / 2, z, W, 0.06, 0.06, GALV)
        for s in (-1, 1): M.box(s * W / 2, 0, z, 0.06, D, 0.06, GALV)
    for i in range(1, 17):
        x = -W / 2 + i * W / 17
        M.box(x, -D / 2, 0.2, 0.025, 0.025, H - 0.25, GALV)
        M.box(x, D / 2, 0.2, 0.025, 0.025, H - 0.25, GALV)
    for i in range(1, 8):
        y = -D / 2 + i * D / 8
        for s in (-1, 1): M.box(s * W / 2, y, 0.2, 0.025, 0.025, H - 0.25, GALV)
    # (the gate in the front, its own frame and a padlock)
    M.box(0.85, -D / 2 - 0.05, 0.25, 1.5, 0.05, 0.05, GALV)
    M.box(0.85, -D / 2 - 0.05, 1.9, 1.5, 0.05, 0.05, GALV)
    M.box(0.12, -D / 2 - 0.09, 1.05, 0.1, 0.06, 0.14, YELLOW)
    # the roof, sloping off to the back
    M.box(0, 0.05, H, W + 0.4, D + 0.5, 0.06, STEEL)
    M.box(0, -D / 2 - 0.2, H - 0.12, W + 0.4, 0.05, 0.18, STEEL2)
    # the bottles: the big red ones at the back, a row of smaller orange ones in front, one blue among them
    for i in range(7):
        bottle(M, -1.35 + i * 0.45, 0.42, RED, h=1.45, r=0.2)
    for i in range(6):
        bottle(M, -1.15 + i * 0.46, -0.2, '#3a7bd5' if i == 3 else ORANGE, h=1.05, r=0.17)
    # (the signs on its front: a red flammable diamond, and NO SMOKING in yellow beside it)
    M.box(-0.95, -D / 2 - 0.06, 1.35, 0.5, 0.03, 0.5, RED)
    M.box(-0.95, -D / 2 - 0.08, 1.45, 0.3, 0.02, 0.3, WHITE)
    M.box(-0.3, -D / 2 - 0.06, 1.3, 0.5, 0.03, 0.6, YELLOW)
    M.box(-0.3, -D / 2 - 0.08, 1.38, 0.32, 0.02, 0.06, BLACK)
    M.box(-0.3, -D / 2 - 0.08, 1.6, 0.06, 0.02, 0.2, BLACK)
    return M.build((0, 0, 0))


def tar():
    """the tar boiler: a black tank on a two-wheeled trailer, the fire box under it, a chimney, the drawbar out front"""
    M = Model('works_tar')
    # (the trailer: the chassis along Y, the axle, two wheels, the drawbar and its jockey wheel, and a stand at the back)
    M.box(0, 0.2, 0.55, 1.5, 3.2, 0.14, STEEL2)
    for s in (-1, 1):
        M.cyl(s * 0.95, 0.45, 0.42, 0.42, 0.26, BLACK, seg=16, axis='X')
        M.cyl(s * 1.0, 0.45, 0.42, 0.2, 0.18, GALV, seg=10, axis='X')
        M.box(s * 0.95, 0.45, 0.85, 0.36, 1.0, 0.06, YELLOW)
    M.beam((-0.5, -1.35, 0.6), (0, -2.6, 0.5), 0.1, STEEL2)
    M.beam((0.5, -1.35, 0.6), (0, -2.6, 0.5), 0.1, STEEL2)
    M.cyl(0, -2.65, 0.46, 0.09, 0.12, GALV, seg=8)
    M.cyl(0, -2.45, 0.1, 0.05, 0.4, STEEL2, seg=6)
    M.cyl(0, -2.45, 0.08, 0.08, 0.08, BLACK, seg=8, axis='X')
    for s in (-1, 1): M.box(s * 0.55, 1.65, 0, 0.08, 0.08, 0.55, STEEL2)
    # (the fire box under the tank, its door glowing, and the gas bottle that feeds it, strapped on at the front)
    M.box(0, 0.25, 0.69, 1.25, 2.4, 0.4, DARK)
    M.box(0, -0.96, 0.75, 0.4, 0.04, 0.26, ORANGE)
    bottle(M, 0.45, -1.15, RED, h=0.9, r=0.15)
    # the tank: a drum along Y, banded, the lid on top, a ladder up the back, and its pipe and tap off the back
    M.cyl(0, 0.25, 1.75, 0.75, 2.5, BLACK, seg=24, axis='Y')
    for y in (-0.85, 0.25, 1.35):
        M.cyl(0, y, 1.75, 0.78, 0.12, YELLOW, seg=24, axis='Y', caps=False)
    M.cyl(0, 0.0, 2.48, 0.32, 0.14, DARK, seg=16)
    M.cyl(0, 0.0, 2.62, 0.36, 0.05, DARK, seg=16)
    M.cyl(0, -0.25, 2.62, 0.04, 0.22, GALV, seg=6)
    M.beam((0.3, 1.55, 1.75), (0.6, 1.62, 1.0), 0.07, GALV, round_=True)
    M.cyl(0.6, 1.62, 0.92, 0.07, 0.16, RED, seg=8)
    for s in (-1, 1): M.beam((s * 0.25, 1.52, 0.75), (s * 0.25, 1.52, 2.2), 0.05, GALV)
    for z in (1.0, 1.35, 1.7, 2.05): M.box(0, 1.52, z, 0.5, 0.05, 0.04, GALV)
    # (the chimney at the front, a cap on it and soot round its foot)
    M.cyl(0, -0.75, 2.4, 0.16, 1.25, DARK, seg=10)
    M.cyl(0, -0.75, 3.65, 0.26, 0.06, DARK, seg=10, r2=0.12)
    M.cyl(0, -0.75, 3.6, 0.2, 0.06, BLACK, seg=10)
    # (a hazard plate on each side, and the crew's company: teal with a white stripe)
    for s in (-1, 1):
        M.box(s * 0.77, -0.3, 1.55, 0.03, 0.42, 0.42, ORANGE)
        M.box(s * 0.79, -0.3, 1.66, 0.02, 0.22, 0.2, BLACK)
        M.box(s * 0.77, 0.9, 1.45, 0.03, 0.8, 0.5, TEAL)
        M.box(s * 0.79, 0.9, 1.6, 0.02, 0.7, 0.08, WHITE)
    return M.build((0, 0, 0))


KIT = bpy.data.collections.new('roadworks-kit')
bpy.context.scene.collection.children.link(KIT)
kitlib.use(KIT)
gascage()
tar()

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'roadworks.blend'))
glb(os.path.join(HERE, '..', 'scenery', 'roadworks.glb'), list(KIT.objects))
for ob in KIT.objects: print(ob.name, len(ob.data.polygons))
