// Renderer, sky, lights and camera for Crunchtime, with the same look as Hangtime: filmic tone mapping,
// a gradient sky the cars' paint reflects, and resolution that drops if the frame rate does.
import * as THREE from 'three';

export const TIMES = {
  day: { label: 'Day', sky: ['#2f7fd6', '#9ccdf2', '#d9eefa'], fog: ['#c4e0f2', 160, 700], hemi: ['#e4f3ff', '#6a5a40', 1.45],
    sun: ['#fff1d6', 2.1, [60, 110, 40]], orb: '#fffbe8', stars: 0, lamps: 0 },
  sunset: { label: 'Sunset', sky: ['#2b2f6b', '#c8679a', '#ffb066'], fog: ['#d99a8a', 140, 650], hemi: ['#ffc4a8', '#3c3550', 1.1],
    sun: ['#ff9b55', 2.2, [-120, 40, -70]], orb: '#ffcf8a', stars: 0.3, lamps: 0.6 },
  night: { label: 'Floodlit', sky: ['#01030a', '#081230', '#16244a'], fog: ['#0a1228', 120, 600], hemi: ['#6f86c0', '#1a1a22', 0.75],
    sun: ['#f2f4ff', 2.0, [25, 120, 18]], orb: '#e6ecff', stars: 1, lamps: 1 },
};

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const coarse = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(coarse ? 1.5 : 2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#c4e0f2', 160, 700);
  const skyGeo = new THREE.SphereGeometry(1500, 24, 12);
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: false })));
  const pmrem = new THREE.PMREMGenerator(renderer);

  function setSky(top, mid, hor) {
    [top, mid, hor] = [top, mid, hor].map(c => new THREE.Color(c));
    const pos = skyGeo.attributes.position, cols = [];
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i) / 1500;
      const c = h > 0.15 ? mid.clone().lerp(top, Math.min(1, (h - 0.15) / 0.6)) : hor.clone().lerp(mid, Math.max(0, h / 0.15));
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    // Reflections for the glossy paint: this sky over a dusty ground
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1400, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: hor.clone().lerp(new THREE.Color('#5a4a36'), 0.75) }));
    ground.position.y = -20;
    env.add(ground);
    const old = scene.environment;
    scene.environment = pmrem.fromScene(env, 0.03).texture;
    old?.dispose();
  }

  const stars = (() => {
    const p = [];
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * Math.PI * 2, y = 0.1 + Math.random() * 0.9, r = Math.sqrt(1 - y * y);
      p.push(Math.cos(a) * r * 1400, y * 1400, Math.sin(a) * r * 1400);
    }
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, transparent: true }));
  })();
  const orb = new THREE.Mesh(new THREE.CircleGeometry(50, 32), new THREE.MeshBasicMaterial({ fog: false }));
  scene.add(stars, orb);
  const hemi = new THREE.HemisphereLight('#e4f3ff', '#6a5a40', 1.45);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 320 });
  scene.add(hemi, sun, sun.target);
  const sunOffset = new THREE.Vector3(60, 110, 40);

  const camera = new THREE.PerspectiveCamera(65, 1, 0.25, 3000);
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // A wider view on portrait screens, so an upright phone still sees what's beside the car
  function fitFov(fov) {
    const a = camera.aspect;
    if (a >= 0.8) return fov;
    const half = Math.atan(Math.tan(fov * Math.PI / 360) * 0.8 / a);
    return Math.min(100, half * 360 / Math.PI);
  }

  let time = 'day';
  function setTime(key) {
    const t = TIMES[key] || TIMES.day;
    time = key;
    setSky(...t.sky);
    scene.fog.color.set(t.fog[0]);
    [scene.fog.near, scene.fog.far] = [t.fog[1], t.fog[2]];
    hemi.color.set(t.hemi[0]);
    hemi.groundColor.set(t.hemi[1]);
    hemi.intensity = t.hemi[2];
    sun.color.set(t.sun[0]);
    sun.intensity = t.sun[1];
    sunOffset.set(...t.sun[2]);
    orb.material.color.set(t.orb);
    orb.position.set(...t.sun[2]).normalize().multiplyScalar(1350);
    if (key === 'night') orb.position.set(-500, 700, -900).normalize().multiplyScalar(1350);   // the moon, not the floodlights
    orb.lookAt(0, 0, 0);
    orb.scale.setScalar(key === 'night' ? 0.7 : 1);
    stars.material.opacity = t.stars;
    stars.visible = t.stars > 0;
    return t;
  }

  function focusSun(p, extent = 45) {
    sun.target.position.copy(p);
    sun.position.copy(p).add(sunOffset);
    const c = sun.shadow.camera;
    if (c.right !== extent) {
      Object.assign(c, { left: -extent, right: extent, top: extent, bottom: -extent });
      c.updateProjectionMatrix();
    }
  }

  // Keeping 60 fps: if it stays under 50 for a few seconds, render fewer pixels (down to 60% density)
  const quality = { ratio: renderer.getPixelRatio(), frames: 0, time: 0, slow: 0 };
  function watchFrameRate(raw) {
    if (raw <= 0 || raw > 1 || document.hidden) return;
    quality.frames++;
    quality.time += raw;
    if (quality.time < 2) return;
    const fps = quality.frames / quality.time;
    quality.frames = quality.time = 0;
    quality.slow = fps < 50 ? quality.slow + 1 : 0;
    if (quality.slow < 2 || quality.ratio <= 0.6) return;
    quality.slow = 0;
    quality.ratio = Math.max(0.6, quality.ratio * 0.8);
    renderer.setPixelRatio(quality.ratio);
    resize();
    if (quality.ratio < 1 && sun.shadow.mapSize.x > 1024) {
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  }

  return { renderer, scene, camera, sun, hemi, setTime, focusSun, fitFov, resize, watchFrameRate, quality, get time() { return time; } };
}
