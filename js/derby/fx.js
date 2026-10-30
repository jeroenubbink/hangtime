// Effects for the derby: smoke, dust, fire and sparks as soft round points (one draw call per kind,
// however many are in flight), and loose parts (doors, bumpers, wheels) that tumble and bounce.
import * as THREE from 'three';

const VERT = `
  attribute float size;
  attribute vec4 rgba;
  varying vec4 vC;
  uniform float scale;
  void main() {
    vC = rgba;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  varying vec4 vC;
  uniform float soft;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = vC.a * (1.0 - smoothstep(soft, 1.0, d));
    // A little shading so smoke reads as puffs, lit from above
    float lit = 1.0 - 0.25 * (gl_PointCoord.y - 0.3);
    gl_FragColor = vec4(vC.rgb * mix(1.0, lit, soft < 0.5 ? 1.0 : 0.0), a);
  }`;

export class Puffs {
  // `additive` for fire and sparks (they glow), otherwise normal blending (smoke, dust)
  constructor(scene, max, { additive = false, soft = 0.2 } = {}) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.rgba = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.p = [];   // per particle: vel, life, max life, size, grow, gravity, drag, alpha, colour
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rgba', new THREE.BufferAttribute(this.rgba, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uniforms = { scale: { value: 400 }, soft: { value: soft } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.points.frustumCulled = false;
    this.geo = g;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, { life = 1, size = 1, grow = 0, gravity = 0, drag = 0, colour = '#888', alpha = 0.8 } = {}) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max);   // full: replace one at random
    else this.n++;
    const c = typeof colour === 'string' ? _c.set(colour) : colour;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.p[i] = { vx, vy, vz, life, max: life, size, grow, gravity, drag, alpha, r: c.r, g: c.g, b: c.b };
  }

  update(dt, camera, height) {
    this.uniforms.scale.value = height / (2 * Math.tan(camera.fov * Math.PI / 360));
    for (let i = 0; i < this.n; i++) {
      const q = this.p[i];
      q.life -= dt;
      if (q.life <= 0) {
        // Move the last one into this slot
        const j = --this.n;
        if (i !== j) {
          this.p[i] = this.p[j];
          this.pos.copyWithin(i * 3, j * 3, j * 3 + 3);
          i--;
        }
        continue;
      }
      const k = Math.max(0, 1 - q.drag * dt);
      q.vx *= k; q.vz *= k; q.vy = q.vy * k - q.gravity * dt;
      this.pos[i * 3] += q.vx * dt;
      this.pos[i * 3 + 1] += q.vy * dt;
      this.pos[i * 3 + 2] += q.vz * dt;
      q.size *= 1 + q.grow * dt;
      const t = q.life / q.max;
      this.size[i] = q.size;
      this.rgba[i * 4] = q.r; this.rgba[i * 4 + 1] = q.g; this.rgba[i * 4 + 2] = q.b;
      this.rgba[i * 4 + 3] = q.alpha * Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 12 + 0.3);
    }
    this.geo.setDrawRange(0, this.n);
    this.points.visible = this.n > 0;
    for (const a of ['position', 'rgba', 'size']) this.geo.attributes[a].needsUpdate = true;
  }

  clear() { this.n = 0; this.geo.setDrawRange(0, 0); this.points.visible = false; }
}
const _c = new THREE.Color();

// Loose parts: simple tumbling bodies that bounce off the ground, settle and, after a while, sink away.
export class Debris {
  constructor(scene, ground) {
    this.scene = scene;
    this.ground = ground;   // (x, z) => height
    this.list = [];
  }

  // `mesh` is placed in the scene and owned from now on. `spin` is how fast it tumbles; wheels roll.
  add(mesh, pos, vel, { spin = 6, life = 14, radius = 0.3, roll = null } = {}) {
    if (this.list.length > 40) this.remove(0);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const w = new THREE.Vector3((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
    this.list.push({ mesh, vel: vel.clone(), w, life, radius, roll, rest: 0 });
  }

  remove(i) {
    const d = this.list[i];
    this.scene.remove(d.mesh);
    d.mesh.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    this.list.splice(i, 1);
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i], m = d.mesh;
      d.life -= dt;
      if (d.life <= 0) { this.remove(i); continue; }
      if (d.life < 1.5) { m.position.y -= dt * 0.6; continue; }   // sink into the ground
      if (d.rest > 1.5) continue;
      d.vel.y -= 9.81 * dt;
      m.position.addScaledVector(d.vel, dt);
      const gy = this.ground(m.position.x, m.position.z);
      if (gy < -50 && m.position.y < -60) { this.remove(i); continue; }
      if (m.position.y < gy + d.radius) {
        m.position.y = gy + d.radius;
        if (d.vel.y < 0) d.vel.y *= -0.35;
        d.vel.x *= 0.82; d.vel.z *= 0.82;
        d.w.multiplyScalar(0.7);
        if (d.vel.lengthSq() < 0.4) { d.rest += dt; d.vel.set(0, 0, 0); }
      } else d.rest = 0;
      if (d.roll) {
        // A wheel rolls about its axle in the direction it travels
        const sp = Math.hypot(d.vel.x, d.vel.z);
        if (sp > 0.3) m.rotation.y = Math.atan2(d.vel.x, d.vel.z) + Math.PI / 2;
        d.roll.rotation.x += sp / d.radius * dt;
      } else {
        m.rotation.x += d.w.x * dt;
        m.rotation.y += d.w.y * dt;
        m.rotation.z += d.w.z * dt;
      }
    }
  }

  clear() { while (this.list.length) this.remove(0); }
}
