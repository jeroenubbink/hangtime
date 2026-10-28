// 2D top-down track editor plus the shared tile drawing used by the minimap and palette.
import { GRID, PIECES, PIECE_TYPES } from './pieces.js';
import { emptyGrid, walk, serialize, deserialize, BUILTIN } from './track.js';
import * as store from './store.js';

const ROAD = '#4a4d55', LINE = '#eeeeea', GRASS = '#5da43f', GRASS2 = '#58a03b';

// Draw one tile at (x, y) with size s. Local unit coordinates: -0.5..0.5, north is up.
export function drawPiece(ctx, type, r, x, y, s, { grass = true, simple = false } = {}) {
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  ctx.rotate(r * Math.PI / 2);
  ctx.scale(s, s);
  if (grass) { ctx.fillStyle = GRASS; ctx.fillRect(-0.5, -0.5, 1, 1); }
  const W = 10 / 28;
  const lw = 1 / s;
  const road = () => {
    ctx.fillStyle = ROAD;
    ctx.fillRect(-W / 2, -0.5, W, 1);
    if (!simple) {
      ctx.strokeStyle = LINE; ctx.lineWidth = lw; ctx.setLineDash([0.06, 0.06]);
      ctx.beginPath(); ctx.moveTo(0, -0.5); ctx.lineTo(0, 0.5); ctx.stroke(); ctx.setLineDash([]);
    }
  };
  const arc = (stroke) => {
    ctx.strokeStyle = stroke; ctx.lineWidth = W;
    ctx.beginPath(); ctx.arc(0.5, 0.5, 0.5, Math.PI, 1.5 * Math.PI); ctx.stroke();
  };
  switch (type) {
    case 'straight': road(); break;
    case 'start':
      road();
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
        ctx.fillRect(-W / 2 + i * W / 6, 0.36 + j * 0.05, W / 6, 0.05);
      }
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath(); ctx.moveTo(0, -0.3); ctx.lineTo(0.12, -0.12); ctx.lineTo(-0.12, -0.12); ctx.fill();
      break;
    case 'corner': arc(ROAD); break;
    case 'banked':
      arc(ROAD);
      ctx.lineWidth = 0.05; ctx.setLineDash([0.06, 0.06]);
      ctx.strokeStyle = '#d8352b'; ctx.beginPath(); ctx.arc(0.5, 0.5, 0.5 + W / 2 - 0.025, Math.PI, 1.5 * Math.PI); ctx.stroke();
      ctx.setLineDash([]);
      break;
    case 'ramp': {
      const gr = ctx.createLinearGradient(0, 0.5, 0, -0.5);
      gr.addColorStop(0, ROAD); gr.addColorStop(1, '#a8a49a');
      ctx.fillStyle = gr; ctx.fillRect(-W / 2, -0.5, W, 1);
      ctx.fillStyle = '#ffd23a';
      for (const yy of [0.2, -0.05, -0.3]) {
        ctx.beginPath(); ctx.moveTo(0, yy - 0.1); ctx.lineTo(0.12, yy + 0.02); ctx.lineTo(-0.12, yy + 0.02); ctx.fill();
      }
      ctx.fillStyle = '#d8352b'; ctx.fillRect(-W / 2, -0.5, W, 0.05);
      break;
    }
    case 'water':
      ctx.fillStyle = '#2e8fd8'; ctx.fillRect(-0.5, -0.5, 1, 1);
      if (!simple) {
        ctx.strokeStyle = '#8cc8f2'; ctx.lineWidth = 1.5 / s;
        for (const yy of [-0.25, 0, 0.25]) {
          ctx.beginPath();
          for (let i = 0; i <= 8; i++) ctx.lineTo(-0.35 + i * 0.0875, yy + (i % 2 ? 0.03 : -0.03));
          ctx.stroke();
        }
      }
      break;
    case 'loop':
      ctx.fillStyle = ROAD;
      ctx.fillRect(-W / 2, 0, W, 0.5);
      ctx.beginPath(); ctx.moveTo(0.06, 0); ctx.lineTo(0.31, 0); ctx.lineTo(W / 2, -0.5); ctx.lineTo(-W / 2, -0.5); ctx.fill();
      ctx.fillStyle = '#2f6fbd';
      ctx.fillRect(-0.14, -0.31, 0.44, 0.31);
      ctx.fillStyle = '#3f86dc';
      ctx.fillRect(-0.14, 0, 0.44, 0.31);
      if (!simple) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / s; ctx.strokeRect(-0.14, -0.31, 0.44, 0.62); }
      break;
    case 'boost':
      road();
      ctx.lineWidth = 0.05;
      for (const [yy, c] of [[0.3, '#ffd23a'], [0.05, '#ff7a1a'], [-0.2, '#ffd23a']]) {
        ctx.strokeStyle = c;
        ctx.beginPath(); ctx.moveTo(-0.13, yy + 0.08); ctx.lineTo(0, yy - 0.05); ctx.lineTo(0.13, yy + 0.08); ctx.stroke();
      }
      break;
    case 'hump':
      road();
      ctx.fillStyle = '#a8a49a';
      ctx.fillRect(-W / 2, -0.25, W, 0.5);
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(-W / 2, -0.03, W, 0.06);
      break;
  }
  ctx.restore();
}

export function customTracks() {
  return store.load('tracks', {});
}

export class Editor {
  constructor({ onTest, onBack }) {
    this.onTest = onTest;
    this.onBack = onBack;
    this.grid = emptyGrid();
    this.brush = 'straight';
    this.rot = 0;
    this.hover = null;
    this.el = document.getElementById('editor');
    this.canvas = document.getElementById('ed-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.status = document.getElementById('ed-status');
    this.nameInput = document.getElementById('ed-name');
    this.buildPalette();
    this.bind();
  }

  buildPalette() {
    const pal = document.getElementById('palette');
    pal.innerHTML = '';
    for (const t of [...PIECE_TYPES, 'erase']) {
      const b = document.createElement('button');
      b.className = 'piece';
      b.dataset.type = t;
      const c = document.createElement('canvas');
      c.width = c.height = 48;
      const x = c.getContext('2d');
      if (t === 'erase') {
        x.fillStyle = GRASS; x.fillRect(0, 0, 48, 48);
        x.strokeStyle = '#fff'; x.lineWidth = 5;
        x.beginPath(); x.moveTo(12, 12); x.lineTo(36, 36); x.moveTo(36, 12); x.lineTo(12, 36); x.stroke();
      } else drawPiece(x, t, 0, 0, 0, 48);
      const label = document.createElement('span');
      label.textContent = t === 'erase' ? 'Erase' : PIECES[t].label;
      b.append(c, label);
      b.onclick = () => { this.brush = t; this.refreshPalette(); };
      pal.append(b);
    }
    this.refreshPalette();
  }

  refreshPalette() {
    for (const b of document.querySelectorAll('#palette .piece')) b.classList.toggle('active', b.dataset.type === this.brush);
  }

  refreshLoadList() {
    const sel = document.getElementById('ed-load');
    sel.innerHTML = '<option value="">Load track…</option>';
    BUILTIN.forEach((b, i) => sel.add(new Option(b.name + ' (built-in)', 'b' + i)));
    for (const name of Object.keys(customTracks())) sel.add(new Option(name, 'c' + name));
  }

  bind() {
    const $ = id => document.getElementById(id);
    this.canvas.addEventListener('mousemove', e => { this.hover = this.cellAt(e); this.draw(); });
    this.canvas.addEventListener('mouseleave', () => { this.hover = null; this.draw(); });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.canvas.addEventListener('mousedown', e => {
      const c = this.cellAt(e);
      if (!c) return;
      if (e.button === 2 || this.brush === 'erase') this.grid[c.z][c.x] = null;
      else this.place(c.x, c.z);
      this.changed();
    });
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.rot = (this.rot + (e.deltaY > 0 ? 1 : 3)) % 4;
      this.draw();
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (this.el.classList.contains('hidden') || e.target.tagName === 'INPUT') return;
      if (e.key === 'r' || e.key === 'R') { this.rot = (this.rot + 1) % 4; this.draw(); }
    });
    window.addEventListener('resize', () => this.visible && this.resize());

    $('ed-rotate').onclick = () => { this.rot = (this.rot + 1) % 4; this.draw(); };
    $('ed-test').onclick = () => {
      const res = walk(this.grid);
      if (res.ok) this.onTest(this.grid, this.nameInput.value || 'Untitled');
    };
    $('ed-save').onclick = () => {
      const name = this.nameInput.value.trim();
      if (!name) { this.flash('Give the track a name first'); return; }
      const all = customTracks();
      all[name] = serialize(this.grid);
      this.flash(store.save('tracks', all) ? `Saved “${name}”` : 'Could not save (storage unavailable)');
      this.refreshLoadList();
    };
    $('ed-load').onchange = e => {
      const v = e.target.value;
      if (!v) return;
      if (v[0] === 'b') { const b = BUILTIN[+v.slice(1)]; this.grid = b.grid(); this.nameInput.value = b.name + ' copy'; }
      else { this.grid = deserialize(customTracks()[v.slice(1)]); this.nameInput.value = v.slice(1); }
      e.target.value = '';
      this.changed();
    };
    $('ed-clear').onclick = () => { this.grid = emptyGrid(); this.changed(); };
    $('ed-delete').onclick = () => {
      const name = this.nameInput.value.trim(), all = customTracks();
      if (!all[name]) { this.flash('No saved track with that name'); return; }
      delete all[name];
      store.save('tracks', all);
      this.refreshLoadList();
      this.flash(`Deleted “${name}”`);
    };
    $('ed-export').onclick = async () => {
      const code = btoa(serialize(this.grid));
      try { await navigator.clipboard.writeText(code); this.flash('Track code copied to clipboard'); }
      catch { window.prompt('Copy this track code:', code); }
    };
    $('ed-link').onclick = async () => {
      const name = this.nameInput.value.trim() || 'Shared track';
      const url = `${location.origin}${location.pathname}#track=${encodeURIComponent(name)}&code=${encodeURIComponent(btoa(serialize(this.grid)))}`;
      try { await navigator.clipboard.writeText(url); this.flash('Link copied: anyone who opens it gets this track'); }
      catch { window.prompt('Copy this link:', url); }
    };
    $('ed-import').onclick = () => {
      const code = window.prompt('Paste a track code:');
      if (!code) return;
      try { this.grid = deserialize(atob(code.trim())); this.changed(); } catch { this.flash('That code is not valid'); }
    };
    $('ed-back').onclick = () => this.onBack();
  }

  place(x, z) {
    const cur = this.grid[z][x];
    if (cur && cur.t === this.brush) { cur.r = (cur.r + 1) % 4; this.rot = cur.r; return; }
    if (this.brush === 'start') this.grid.forEach(row => row.forEach((c, i) => { if (c && c.t === 'start') row[i] = null; }));
    this.grid[z][x] = { t: this.brush, r: this.rot };
  }

  flash(msg) {
    this.flashMsg = msg;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => { this.flashMsg = null; this.changed(); }, 2200);
    this.changed();
  }

  changed() {
    this.result = walk(this.grid);
    const r = this.result;
    document.getElementById('ed-test').disabled = !r.ok;
    let msg = r.ok ? `✔ Track OK — ${r.path.length} tiles` + (r.unused ? ` (${r.unused} unconnected)` : '') : '✖ ' + r.error;
    if (this.flashMsg) msg = this.flashMsg;
    this.status.textContent = msg;
    this.status.className = r.ok ? 'ok' : 'bad';
    this.draw();
  }

  show(grid, name) {
    this.visible = true;
    this.el.classList.remove('hidden');
    if (grid) { this.grid = grid.map(row => row.map(c => c && { ...c })); this.nameInput.value = name || ''; }
    this.refreshLoadList();
    this.resize();
    this.changed();
  }

  hide() {
    this.visible = false;
    this.el.classList.add('hidden');
  }

  resize() {
    const host = this.canvas.parentElement;
    const size = Math.floor(Math.min(host.clientWidth, host.clientHeight) - 24);
    const dpr = window.devicePixelRatio || 1;
    this.size = Math.max(240, size);
    this.canvas.style.width = this.canvas.style.height = this.size + 'px';
    this.canvas.width = this.canvas.height = this.size * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  cellAt(e) {
    const rect = this.canvas.getBoundingClientRect();
    const s = rect.width / GRID;
    const x = Math.floor((e.clientX - rect.left) / s), z = Math.floor((e.clientY - rect.top) / s);
    return x >= 0 && z >= 0 && x < GRID && z < GRID ? { x, z } : null;
  }

  draw() {
    const ctx = this.ctx, S = this.size, s = S / GRID;
    if (!S) return;
    ctx.clearRect(0, 0, S, S);
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
      ctx.fillStyle = (x + z) % 2 ? GRASS : GRASS2;
      ctx.fillRect(x * s, z * s, s, s);
      const c = this.grid[z][x];
      if (c) drawPiece(ctx, c.t, c.r, x * s, z * s, s, { grass: false });
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * s + 0.5, 0); ctx.lineTo(i * s + 0.5, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * s + 0.5); ctx.lineTo(S, i * s + 0.5); ctx.stroke();
    }
    const r = this.result;
    if (r && r.ok) {
      // Direction arrows along the driving line
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const p of r.path) {
        ctx.save();
        ctx.translate((p.x + 0.5) * s, (p.z + 0.5) * s);
        ctx.rotate(p.hout * Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -s * 0.12); ctx.lineTo(s * 0.08, 0); ctx.lineTo(-s * 0.08, 0); ctx.fill();
        ctx.restore();
      }
    } else if (r && r.at) {
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 3;
      ctx.strokeRect(r.at.x * s + 2, r.at.z * s + 2, s - 4, s - 4);
    }
    if (this.hover) {
      const { x, z } = this.hover;
      if (this.brush === 'erase') {
        ctx.fillStyle = 'rgba(255,60,48,0.35)';
        ctx.fillRect(x * s, z * s, s, s);
      } else {
        ctx.globalAlpha = 0.6;
        drawPiece(ctx, this.brush, this.rot, x * s, z * s, s, { grass: false });
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x * s + 1, z * s + 1, s - 2, s - 2);
    }
  }
}
