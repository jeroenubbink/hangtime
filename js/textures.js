// Procedural surface detail. Every texture is drawn into a canvas at startup (no image files), and is
// laid onto materials in world space with a triplanar projection, so geometry needs no UVs: the shader
// darkens and lightens the material's colour by the texture, once at a fine scale (grain) and once at
// a coarse one (blotches and wear).
import * as THREE from 'three';

function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Tileable value noise, several octaves, as a 0..1 Float32Array of size×size
function fbm(size, octaves, seed, base = 4) {
  const out = new Float32Array(size * size);
  const r = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = base << o, grid = Array.from({ length: n * n }, r);
    const at = (i, j) => grid[(j % n) * n + (i % n)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / size * n, fy = y / size * n, i = Math.floor(fx), j = Math.floor(fy);
      let u = fx - i, v = fy - j;
      u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
      const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
      out[y * size + x] += (a + (b - a) * v) * amp;
    }
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function toTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function noiseInto(ctx, size, field, contrast, mean = 0.5) {
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < field.length; i++) {
    const v = Math.max(0, Math.min(255, (mean + (field[i] - 0.5) * contrast) * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Speckles drawn wrapped round the edges so the texture still tiles
function speckle(ctx, size, count, r, shade, seed, alpha = 1) {
  const rand = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = rand() * size, y = rand() * size, s = r * (0.5 + rand());
    const v = shade(rand());
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) ctx.fillRect(x + dx, y + dy, s, s);
  }
}

// Stone grit: asphalt aggregate and concrete grain
export const gritTexture = toTexture(256, (ctx, n) => {
  noiseInto(ctx, n, fbm(n, 5, 7, 8), 0.9);
  speckle(ctx, n, 2600, 1.2, t => (t < 0.5 ? 70 + t * 60 : 170 + t * 70), 11, 0.55);
});

// Grass: soft clumps with short blade strokes
export const grassTexture = toTexture(256, (ctx, n) => {
  noiseInto(ctx, n, fbm(n, 4, 3, 4), 0.8);
  const rand = rng(5);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 2600; i++) {
    const x = rand() * n, y = rand() * n, l = 2 + rand() * 4, a = rand() * Math.PI * 2;
    const v = rand() < 0.5 ? 60 + rand() * 50 : 160 + rand() * 80;
    ctx.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) {
      ctx.beginPath();
      ctx.moveTo(x + dx, y + dy);
      ctx.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l);
      ctx.stroke();
    }
  }
});

// Large soft blotches (patchy colour over tens of metres)
export const blotchTexture = toTexture(128, (ctx, n) => noiseInto(ctx, n, fbm(n, 4, 21, 3), 1.6));

// Add world-space detail to a material. `fine`/`coarse` are texture repeats per metre; `strength` and
// `coarseStrength` how far the colour is pushed darker/lighter. `stripes` > 0 adds mown-lawn stripes of
// that width (m) along x. `flat` projects from above only, which is cheaper, for ground.
export function addDetail(material, { map = gritTexture, fine = 0.5, coarse = 0.03, strength = 0.35, coarseStrength = 0.25, stripes = 0, flat = false } = {}) {
  material.onBeforeCompile = sh => {
    sh.uniforms.detailMap = { value: map };
    sh.uniforms.blotchMap = { value: blotchTexture };
    sh.uniforms.detailK = { value: new THREE.Vector4(fine, coarse, strength, coarseStrength) };
    sh.uniforms.detailStripes = { value: stripes };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetailPos;\nvarying vec3 vDetailN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 detailWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          detailWorld = instanceMatrix * detailWorld;
        #endif
        vDetailPos = (modelMatrix * detailWorld).xyz;
        vDetailN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDetailPos;
        varying vec3 vDetailN;
        uniform sampler2D detailMap;
        uniform sampler2D blotchMap;
        uniform vec4 detailK;
        uniform float detailStripes;
        float triplanar(sampler2D m, vec3 p, vec3 w) {
          ${flat ? 'return texture2D(m, p.xz).r;' : 'return texture2D(m, p.zy).r * w.x + texture2D(m, p.xz).r * w.y + texture2D(m, p.xy).r * w.z;'}
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 w = abs(normalize(vDetailN));
          w *= w; w *= w;
          w /= dot(w, vec3(1.0));
          float f = triplanar(detailMap, vDetailPos * detailK.x, w);
          float c = triplanar(blotchMap, vDetailPos * detailK.y, w);
          float k = 1.0 + (f - 0.5) * detailK.z * 2.0 + (c - 0.5) * detailK.w * 2.0;
          if (detailStripes > 0.0) k *= 1.0 + 0.045 * sign(sin(vDetailPos.x * 3.14159 / detailStripes));
          diffuseColor.rgb *= k;
        }`);
  };
  material.customProgramCacheKey = () => 'detail' + map.uuid + stripes + flat;
  return material;
}

// Water: glossy, slightly see-through, with ripples drawn by bending the surface normal (the surface
// itself stays flat). `waterTime` drives the ripples.
export const waterTime = { value: 0 };
export function waterMaterial() {
  const m = new THREE.MeshPhongMaterial({ color: '#2378b8', specular: '#d8ecff', shininess: 70, transparent: true, opacity: 0.9 });
  m.onBeforeCompile = sh => {
    sh.uniforms.waterTime = waterTime;
    sh.uniforms.detailMap = { value: gritTexture };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;\nuniform float waterTime;\nuniform sampler2D detailMap;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 p = vWaterPos.xz;
          float t = waterTime;
          float dx = 0.10 * cos(p.x * 0.8 + t * 1.6) + 0.06 * cos((p.x + p.y) * 1.9 - t * 2.3) + 0.04 * cos(p.x * 4.1 + t * 3.0);
          float dz = 0.10 * cos(p.y * 0.7 - t * 1.3) + 0.06 * cos((p.x - p.y) * 2.2 + t * 1.9) + 0.04 * cos(p.y * 3.7 - t * 2.6);
          dx += (texture2D(detailMap, p * 0.15 + t * 0.02).r - 0.5) * 0.25;
          dz += (texture2D(detailMap, p.yx * 0.13 - t * 0.025).r - 0.5) * 0.25;
          normal = normalize((viewMatrix * vec4(normalize(vec3(-dx, 1.0, -dz)), 0.0)).xyz);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 0.85 + 0.3 * texture2D(detailMap, vWaterPos.xz * 0.05 + waterTime * 0.01).r;`);
  };
  return m;
}
