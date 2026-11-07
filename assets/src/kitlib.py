# The kit builders' shared parts: Model, a mesh built up from parts each in its own colour, and glb(), which exports a
# kit the way the game reads it. Used by depot.py and bank.py (blender -b -P assets/src/<kit>.py)
import bpy, bmesh, math
from mathutils import Matrix, Vector

# The collection built models go into (`use` sets it)
KIT = None

def use(collection):
    global KIT
    KIT = collection


def lin(hex_):
    c = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


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
