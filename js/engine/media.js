// Textures and video for the open project: screen content, print graphics, canvas-drawn textures.
// Everything created here is released by disposeMedia() when the project closes.
import * as THREE from 'three';
import { C } from './core.js';
import { S } from './state.js';
import { DECAL } from './items.js';

const videos = [];                 // <video> elements of the open project
const screenTex = new Map();       // key → texture (shared by all screens with that content)
const graphicTex = new Map();      // image path / canvas name → texture

const aniso = () => C.renderer.capabilities.getMaxAnisotropy();

function makeVideoElement(src) {
  const el = document.createElement('video');
  Object.assign(el, { src, loop: true, muted: true, playsInline: true, autoplay: true, preload: 'auto', crossOrigin: 'anonymous' });
  el.style.display = 'none';
  document.body.appendChild(el);
  el.addEventListener('error', () => console.warn(`[video] load failed: ${src}`, el.error));
  el.play().catch(() => window.addEventListener('pointerdown', () => el.play().catch(() => {}), { once: true }));
  videos.push(el);
  return el;
}

// ---- Screens (TVs, monitors, display panels) ----
function screenSources() { return S.project.screenSources; }
function defaultScreenKey() { return Object.keys(screenSources())[0]; }
function getScreenTexture(key) {
  if (!screenSources()[key]) key = defaultScreenKey();
  let tex = screenTex.get(key);
  if (!tex) {
    const src = screenSources()[key];
    tex = src.video ? new THREE.VideoTexture(makeVideoElement(src.video)) : new THREE.TextureLoader().load(src.image);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso();
    screenTex.set(key, tex);
  }
  return tex;
}
// One swappable screen on an item: { role, label, mat, key }. Registered on root.userData.screens.
export function addScreen(root, cfg, savedKey) {
  const mat = new THREE.MeshStandardMaterial({
    roughness: cfg.roughness ?? 0.22, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: cfg.intensity ?? 0.5,
    ...DECAL,   // screen faces sit right on their frame / panel
  });
  const entry = { role: cfg.role ?? 'screen', label: cfg.label ?? 'Screen', mat, key: null };
  (root.userData.screens ??= []).push(entry);
  setScreenEntry(entry, savedKey ?? cfg.default);
  return entry;
}
export function setScreenEntry(entry, key) {
  if (!screenSources()[key]) key = defaultScreenKey();
  const tex = getScreenTexture(key);
  entry.mat.map = entry.mat.emissiveMap = tex;
  entry.mat.needsUpdate = true;
  entry.key = key;
}

// ---- Print graphics (posters, banner) ----
function graphicTexture(src) {
  const cacheKey = src.image ?? `canvas:${src.canvas}`;
  let t = graphicTex.get(cacheKey);
  if (!t) {
    t = src.image ? new THREE.TextureLoader().load(src.image) : new THREE.CanvasTexture(CANVASES[src.canvas]());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso();
    graphicTex.set(cacheKey, t);
  }
  return t;
}
// Register a print material on `obj` and apply the saved (or default) graphic
export function initGraphic(obj, mat, sources, key) {
  obj.userData.graphicMat = mat;
  obj.userData.graphicSources = sources;
  setGraphic(obj, key);
}
export function setGraphic(obj, key) {
  const sources = obj.userData.graphicSources;
  if (!sources[key]) key = Object.keys(sources)[0];
  obj.userData.graphicMat.map = graphicTexture(sources[key]);
  obj.userData.graphicMat.needsUpdate = true;
  obj.userData.graphic = key;
}

// ---- Hologram (additive operator overlay: JPEG first, then the MP4 once it can play) ----
export function makeHologramMaterial({ image, video }) {
  const tex = new THREE.TextureLoader().load(image);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  if (video) {
    const el = makeVideoElement(video);
    el.addEventListener('canplay', () => {
      const vt = new THREE.VideoTexture(el);
      vt.colorSpace = THREE.SRGBColorSpace;
      mat.map = vt;
      mat.needsUpdate = true;
    }, { once: true });
  }
  return mat;
}

export function disposeMedia() {
  for (const el of videos.splice(0)) { el.pause(); el.removeAttribute('src'); el.load(); el.remove(); }
  for (const t of screenTex.values()) t.dispose();
  for (const t of graphicTex.values()) t.dispose();
  screenTex.clear();
  graphicTex.clear();
}

// ---- Canvas-drawn textures ----
export function carpetTexture(style) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (style === 'charcoal') {
    // Dark charcoal needle-punch (6 × 3 booth)
    ctx.fillStyle = '#3a3a3c';
    ctx.fillRect(0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 36;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * size, y = Math.random() * size, len = 1 + Math.random() * 3;
      const s = 40 + Math.floor(Math.random() * 30);
      ctx.strokeStyle = `rgba(${s},${s},${s + 2},0.5)`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 0.6, y + len);
      ctx.stroke();
    }
  } else {
    // Mid-grey heathered short pile (Japan 2026)
    ctx.fillStyle = '#76787c';
    ctx.fillRect(0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 46, t = (Math.random() - 0.5) * 6;
      d[i] = Math.max(0, Math.min(255, d[i] + n + t));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n - t));
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = 20 + Math.random() * 50;
      const light = Math.random() < 0.5;
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        const grad = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grad.addColorStop(0, light ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    for (let i = 0; i < 16000; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const len = 1.5 + Math.random() * 3, ang = Math.random() * Math.PI * 2;
      const shade = Math.random() < 0.5 ? 70 + Math.random() * 25 : 140 + Math.random() * 30;
      ctx.strokeStyle = `rgba(${shade},${shade},${shade + 2},0.45)`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso();
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Fascia print. 'logo-box': white board, ring logo + name (1 px per mm). 'navy-plane': navy, bordered, centred text.
export function fasciaTexture({ style, text, size, color = '#1d3f8f' }, mirrored = false) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  if (style === 'navy-plane') {
    c.width = 1536; c.height = 192;
    g.fillStyle = '#0a1a3a'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.strokeRect(4, 4, c.width - 8, c.height - 8);
    if (mirrored) { g.translate(c.width, 0); g.scale(-1, 1); }
    g.fillStyle = '#ffffff'; g.font = 'bold 110px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2);
  } else {
    c.width = Math.round(size[0] * 1000); c.height = Math.round(size[1] * 1000);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.font = '700 150px Arial, Helvetica, sans-serif';
    const textW = g.measureText(text).width, r = 70, gap = 50;
    const ix = (c.width - (r * 2 + gap + textW)) / 2 + r, cy = c.height / 2;
    g.strokeStyle = color; g.lineWidth = 22; g.lineCap = 'round';
    g.beginPath(); g.arc(ix, cy, r, -Math.PI * 0.32, Math.PI * 1.32); g.stroke();
    g.beginPath(); g.moveTo(ix, cy - r - 8); g.lineTo(ix, cy + 12); g.stroke();
    g.fillStyle = '#e02020';
    g.beginPath(); g.arc(ix + 26, cy - r - 24, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(text, ix + r + gap, cy + 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso();
  return tex;
}

// Named canvas graphics usable as a graphic source: { "canvas": "<name>" }
const CANVASES = {
  'unysis-poster': () => {
    const W = 841, H = 1189;
    const c = document.createElement('canvas');
    c.width = W * 2; c.height = H * 2;
    const g = c.getContext('2d');
    g.scale(2, 2);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1846'); bg.addColorStop(0.55, '#16306e'); bg.addColorStop(1, '#0a1233');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let r = 60; r < 420; r += 36) {
      g.strokeStyle = `rgba(80,160,255,${0.16 - r / 3200})`; g.lineWidth = 2;
      g.beginPath(); g.arc(W / 2, 640, r, 0, Math.PI * 2); g.stroke();
    }
    const ix = 90, iy = 110, r = 34;
    g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath(); g.arc(ix, iy, r, -Math.PI * 0.3, Math.PI * 1.3); g.stroke();
    g.beginPath(); g.moveTo(ix, iy - r - 4); g.lineTo(ix, iy + 6); g.stroke();
    g.fillStyle = '#e02020'; g.beginPath(); g.arc(ix + 12, iy - r - 12, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = '700 54px Arial, Helvetica, sans-serif';
    g.fillText('BioEnergy', ix + r + 22, iy + 18);
    g.font = '34px "Hiragino Sans", "Noto Sans JP", sans-serif';
    g.textAlign = 'right';
    g.fillText('マレーシア製', W - 60, iy + 14);
    g.textAlign = 'center';
    g.font = '800 150px Arial, Helvetica, sans-serif'; g.fillStyle = '#ffffff';
    g.fillText('UNYSIS', W / 2, 330);
    g.font = '600 40px Arial, Helvetica, sans-serif'; g.fillStyle = '#ffd400';
    g.fillText('VIRTUAL OPERATOR ON THE EDGE', W / 2, 400);
    g.font = '36px "Hiragino Sans", "Noto Sans JP", sans-serif'; g.fillStyle = '#ffffff';
    g.fillText('エッジAIバーチャルオペレーター', W / 2, 455);
    const bx = W / 2 - 140, by = 540, bw = 280, bh = 215;
    g.fillStyle = '#121214'; g.fillRect(bx, by, bw, bh);
    g.fillStyle = '#2a2a2e';
    g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 50, by - 40); g.lineTo(bx + bw + 50, by - 40); g.lineTo(bx + bw, by); g.fill();
    g.fillStyle = '#0a0a0b';
    g.beginPath(); g.moveTo(bx + bw, by); g.lineTo(bx + bw + 50, by - 40); g.lineTo(bx + bw + 50, by + bh - 40); g.lineTo(bx + bw, by + bh); g.fill();
    g.fillStyle = '#ffffff'; g.font = '700 46px Arial, Helvetica, sans-serif';
    g.fillText('UNYSIS', W / 2, by + 85);
    g.font = '18px Arial, Helvetica, sans-serif';
    g.fillText('EDGE AI CONTROLLER', W / 2, by + 125);
    g.fillStyle = '#3fbf3f'; g.fillRect(bx + 18, by + bh - 42, 34, 28);
    g.fillStyle = '#7dffc8'; g.beginPath(); g.arc(bx + bw - 30, by + 160, 6, 0, Math.PI * 2); g.fill();
    const feats = ['AI anomaly detection & auto-recovery', 'Digital twin command center', 'Runs on the edge — no cloud needed', '24/7 virtual operator for every line'];
    g.textAlign = 'left'; g.font = '32px Arial, Helvetica, sans-serif';
    feats.forEach((t, i) => {
      const y = 880 + i * 58;
      g.fillStyle = '#4da3ff'; g.beginPath(); g.arc(100, y - 11, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.fillText(t, 128, y);
    });
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, H - 80, W, 80);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = '600 28px Arial, Helvetica, sans-serif';
    g.fillText('PLACEHOLDER POSTER', W / 2, H - 30);
    return c;
  },
};
