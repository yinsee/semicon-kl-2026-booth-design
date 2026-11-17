// Furniture model builders — the single source of geometry for both booth pages.
//
// Each builder is a pure function: it returns { object, meta } where `object` is a THREE.Group
// at the origin (floor level, centred, front = +Z; the wall poster is centred on its mid-height)
// and `meta` holds the footprint the pages need synchronously ({ w, d, h, ...extra }).
//
// tools/models/export.html runs these builders and writes one GLB per variant into
// assets/models/ (+ manifest.json). The pages never run this file; they only load the GLBs.
//
// Live parts are tagged in userData (GLTFExporter writes userData as glTF `extras`,
// GLTFLoader restores it), and js/models.js hands them to the page after loading:
//   role: 'screen' | 'screen0'..'screen2'  → page assigns its swappable screen material
//   role: 'print'                          → page assigns its swappable graphic material
//   role: 'holo'                           → page rebuilds the additive hologram (video) material
//   role: 'spin'                           → page pushes it into animatedItems
//   role: 'envmap'                         → page binds the live CubeCamera reflection
//   noPick: true                           → raycasts pass through (glass / overlay / lines)
//   noShadow: true                         → does not cast a shadow
// Named nodes: arm_swivel / arm_seg1 / arm_seg2 / arm_head (monitor arm joint chain).
//
// Where index.html and japan2026.html both had an item, the japan2026.html version is used
// (standing TV, queue pole, hologram fan display).

import * as THREE from 'three';

const tag = (obj, data) => { Object.assign(obj.userData, data); return obj; };
const std = (p) => new THREE.MeshStandardMaterial(p);
function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
// Placeholder for a material the page replaces at runtime (kept dark so a missing hook is obvious)
const placeholder = (name) => std({ name, color: 0x05070a, roughness: 0.3 });
// Reverse triangle winding + normals so a FrontSide mesh shows its inside (glTF has no BackSide).
function flipFaces(geom) {
  const g = geom.index ? geom.toNonIndexed() : geom.clone();
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i += 3) {
    for (const a of [pos, nor, uv].filter(Boolean)) {
      for (let k = 0; k < a.itemSize; k++) {
        const t = a.array[(i + 1) * a.itemSize + k];
        a.array[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k];
        a.array[(i + 2) * a.itemSize + k] = t;
      }
    }
  }
  for (let i = 0; i < nor.array.length; i++) nor.array[i] = -nor.array[i];
  return g;
}
function addTube(group, a, b, r, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 12), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  group.add(m);
  return m;
}

// ============================================================================================
// From japan2026.html
// ============================================================================================

// Standing TV on a floor stand; screen faces +Z.
export function standingTV({ diagIn = 42, totalH = 1.35, aspect = 16 / 9 } = {}) {
  const diag = diagIn * 0.0254;
  const tvW = diag * aspect / Math.hypot(aspect, 1);
  const tvH = diag / Math.hypot(aspect, 1);
  const baseW = Math.max(0.6, tvW * 0.45), baseD = 0.4, baseT = 0.03;
  const tvCenterY = totalH - tvH / 2;
  const group = new THREE.Group();
  const frameMat = std({ color: 0x0f0f10, roughness: 0.4, metalness: 0.5 });
  const baseMat = std({ color: 0x1a1a1d, roughness: 0.5, metalness: 0.6 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseT, baseD), baseMat);
  base.position.set(0, baseT / 2, 0);
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.09, totalH - baseT, 0.09), frameMat);
  pole.position.set(0, baseT + (totalH - baseT) / 2, -0.12);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(tvW + 0.04, tvH + 0.04, 0.06), frameMat);
  frame.position.set(0, tvCenterY, -0.04);
  const screen = tag(new THREE.Mesh(new THREE.BoxGeometry(tvW, tvH, 0.015), placeholder('screen')), { role: 'screen', noShadow: true });
  screen.position.set(0, tvCenterY, -0.002);
  group.add(base, pole, frame, screen);
  return { object: group, meta: { w: Math.max(tvW, baseW), d: baseD, h: totalH } };
}

// 3D hologram fan display: 2×3 fans on a frame on a base plate, operator hologram planes.
export function hologramFan() {
  const W = 2 * 0.3048;
  const group = new THREE.Group();
  const plateW = 1.0, plateD = 0.64, plateT = 0.05;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateT, plateD), std({ color: 0x1f2226, roughness: 0.55, metalness: 0.25 }));
  plate.position.set(0, plateT / 2, 0);
  group.add(plate);

  const frameMat = std({ color: 0x141416, roughness: 0.55, metalness: 0.45 });
  const colsX = [-W / 4, +W / 4];
  const rowsY = [0.35, 0.80, 1.25];
  const postH = rowsY[rowsY.length - 1] + 0.035 / 2;   // posts stop flush with the top crossbar
  for (const px of colsX) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, postH, 0.035), frameMat);
    post.position.set(px, postH / 2, 0);
    group.add(post);
  }
  for (const py of rowsY) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(colsX[1] - colsX[0] + 0.035, 0.035, 0.035), frameMat);
    beam.position.set(0, py, 0);
    group.add(beam);
  }
  // 6 fans: spinning blades blurred into a glowing disc
  const hubMat = std({ color: 0x141416, roughness: 0.5, metalness: 0.4 });
  const discMat = std({ color: 0x2a8cff, emissive: 0x2a8cff, emissiveIntensity: 1.2, roughness: 0.3,
    transparent: true, opacity: 0.45, side: THREE.DoubleSide });
  const fanR = 0.10;
  for (const py of rowsY) {
    for (const px of colsX) {
      const fan = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(fanR, fanR, 0.006, 48), discMat);
      disc.rotation.x = Math.PI / 2;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 24), hubMat);
      hub.rotation.x = Math.PI / 2;
      hub.position.z = 0.008;
      fan.add(disc, hub);
      fan.position.set(px, py, 0.03);
      group.add(fan);
    }
  }
  // Operator hologram planes (front + back); the page gives them the additive video material.
  const holoW = 0.81, holoH = 1.61, holoY = 0.05 + holoH / 2, holoZ = 0.05;
  const geo = new THREE.PlaneGeometry(holoW, holoH);
  const holoMat = new THREE.MeshBasicMaterial({ name: 'holo', color: 0x000000, transparent: true, opacity: 0 });
  const front = tag(new THREE.Mesh(geo, holoMat), { role: 'holo', noPick: true, noShadow: true });
  front.position.set(0, holoY, holoZ);
  const back = tag(new THREE.Mesh(geo, holoMat), { role: 'holo', noPick: true, noShadow: true });
  back.position.set(0, holoY, -holoZ);
  back.rotation.y = Math.PI;
  group.add(front, back);
  return { object: group, meta: { w: Math.max(W, plateW), d: Math.max(W, plateD), h: Math.max(1.5, 0.05 + holoH) } };
}

// Reception counter: white box with the BioEnergy logo on the front (+Z).
function counterLogoCanvas(pxW, pxH) {
  const [c, g] = makeCanvas(pxW, pxH);
  g.fillStyle = '#f4f5f6';
  g.fillRect(0, 0, pxW, pxH);
  const cy = pxH * 0.5, s = pxH / 690;
  const blue = '#1d3f8f';
  const ix = pxW * 0.14, r = 70 * s;
  g.strokeStyle = blue; g.lineWidth = 22 * s; g.lineCap = 'round';
  g.beginPath(); g.arc(ix, cy, r, -Math.PI * 0.32, Math.PI * 1.32); g.stroke();
  g.fillStyle = blue;
  g.fillRect(ix - 11 * s, cy - r - 10 * s, 22 * s, r * 1.05);
  g.beginPath(); g.arc(ix, cy + 18 * s, 22 * s, 0, Math.PI * 2); g.fill();
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = `600 ${120 * s}px system-ui, sans-serif`;
  g.fillText('BioEnergy', ix + r + 40 * s, cy + 20 * s);
  g.font = `600 ${46 * s}px system-ui, sans-serif`;
  g.fillText('Projects Sdn Bhd', ix + r + 120 * s, cy + 90 * s);
  return c;
}
export function counter({ w = 0.9, h = 0.8, d = 0.45 } = {}) {
  const group = new THREE.Group();
  const whiteMat = std({ color: 0xf4f5f6, roughness: 0.35, metalness: 0.05 });
  const logoMat = std({ map: canvasTex(counterLogoCanvas(1024, Math.round(1024 * h / w))), roughness: 0.35, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [whiteMat, whiteMat, whiteMat, whiteMat, logoMat, whiteMat]);
  body.position.y = h / 2;
  group.add(body);
  return { object: group, meta: { w, d, h } };
}

// Framed banner on a floor stand; print faces +Z. The frame is inset over the print edges.
export function framedBanner({ w = 2.6, h = 2.5 } = {}) {
  const frameT = 0.03, frameD = 0.04, footLen = 0.35, footT = 0.03;
  const group = new THREE.Group();
  const aluMat = std({ color: 0xc9ccd0, roughness: 0.35, metalness: 0.7 });
  const backMat = std({ color: 0xe8e8e8, roughness: 0.9 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.01), backMat);
  panel.position.set(0, h / 2, 0);
  const print = tag(new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ name: 'print', roughness: 0.8 })), { role: 'print' });
  print.position.set(0, h / 2, 0.0051);
  group.add(panel, print);
  for (const y of [frameT / 2, h - frameT / 2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, frameT, frameD), aluMat);
    rail.position.set(0, y, 0);
    group.add(rail);
  }
  for (const sx of [-1, 1]) {
    const px = sx * (w / 2 - frameT / 2);
    const post = new THREE.Mesh(new THREE.BoxGeometry(frameT, h - frameT * 2, frameD), aluMat);
    post.position.set(px, h / 2, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, footT, footLen), aluMat);
    foot.position.set(px, footT / 2, footLen / 2 - frameD / 2);
    group.add(post, foot);
  }
  return { object: group, meta: { w, d: footLen, h } };
}

// A0 wall poster (portrait), print on +Z, origin at the poster centre.
export function wallPoster({ w = 0.841, h = 1.189, t = 0.005 } = {}) {
  const group = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), std({ color: 0xf2f2f2, roughness: 0.8 }));
  const print = tag(new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ name: 'print', roughness: 0.6 })), { role: 'print' });
  print.position.z = t / 2 + 0.0005;
  group.add(board, print);
  return { object: group, meta: { w, d: t, h } };
}

// Barrier pole (chrome stanchion); the red belt between poles stays in page code.
export function queuePole() {
  const totalH = 1.0;
  const group = new THREE.Group();
  const chromeMat = new THREE.MeshPhysicalMaterial({ color: 0xe2e6ea, metalness: 1.0, roughness: 0.18, clearcoat: 0.4, clearcoatRoughness: 0.15 });
  const baseMat = std({ color: 0x1a1a1c, roughness: 0.5, metalness: 0.4 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.018, 32), baseMat);
  base.position.y = 0.009;
  const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.06, 24), chromeMat);
  weight.position.y = 0.018 + 0.03;
  const postBaseY = 0.018 + 0.06, postH = totalH - postBaseY - 0.06;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, postH, 16), chromeMat);
  post.position.y = postBaseY + postH / 2;
  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 24), chromeMat);
  spool.position.y = totalH - 0.06;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.04, 24, 16), chromeMat);
  cap.position.y = totalH - 0.02;
  group.add(base, weight, post, spool, cap);
  return { object: group, meta: { w: 0.36, d: 0.36, h: totalH } };
}

// Monitor on a 2-segment swivel arm clamped to a table's back edge (edge line = local z = −clampZ).
// Joint chain: arm_swivel (yaw) → arm_seg1 (pitch) → arm_seg2 (pitch) → arm_head (counter-pitch).
export const ARM = { L1: 0.18, L2: 0.16, POLE_H: 0.2 };
export function armMonitor({ diagIn = 15.6, aspect = 16 / 9, clampZ = 0.12 } = {}) {
  const diag = diagIn * 0.0254;
  const sw = diag * aspect / Math.hypot(aspect, 1);
  const sh = diag / Math.hypot(aspect, 1);
  const bezel = 0.006;
  const group = new THREE.Group();
  const armMat = std({ color: 0x1a1a1d, roughness: 0.4, metalness: 0.6 });
  const blackMat = std({ color: 0x111113, roughness: 0.45, metalness: 0.3 });
  const mesh = (parentObj, geo, mat, px, py, pz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    parentObj.add(m);
    return m;
  };
  const cylX = (r, len) => new THREE.CylinderGeometry(r, r, len, 20).rotateZ(Math.PI / 2);
  const cylZ = (r, len) => new THREE.CylinderGeometry(r, r, len, 16).rotateX(Math.PI / 2);
  const edgeZ = -clampZ, plateT = 0.012, topLen = 0.08;
  mesh(group, new THREE.BoxGeometry(0.07, plateT, topLen + plateT), armMat, 0, plateT / 2, edgeZ - plateT + (topLen + plateT) / 2);
  mesh(group, new THREE.BoxGeometry(0.07, 0.08, plateT), armMat, 0, plateT - 0.04, edgeZ - plateT / 2);
  tag(mesh(group, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 16).rotateX(Math.PI / 2), armMat, 0, -0.045, edgeZ - plateT - 0.01), { noShadow: true });
  const cz = edgeZ + 0.03;
  mesh(group, new THREE.CylinderGeometry(0.014, 0.014, ARM.POLE_H, 20), armMat, 0, ARM.POLE_H / 2, cz);
  mesh(group, new THREE.CylinderGeometry(0.018, 0.018, 0.03, 20), armMat, 0, plateT + 0.015, cz);

  const swivel = new THREE.Object3D(); swivel.name = 'arm_swivel';
  swivel.position.set(0, ARM.POLE_H, cz);
  group.add(swivel);
  mesh(swivel, new THREE.CylinderGeometry(0.02, 0.02, 0.035, 20), armMat, 0, 0, 0);
  const seg1 = new THREE.Object3D(); seg1.name = 'arm_seg1';
  swivel.add(seg1);
  mesh(seg1, cylX(0.016, 0.04), armMat, 0, 0, 0);
  mesh(seg1, cylZ(0.012, ARM.L1), armMat, 0, 0, ARM.L1 / 2);
  const seg2 = new THREE.Object3D(); seg2.name = 'arm_seg2';
  seg2.position.z = ARM.L1;
  seg1.add(seg2);
  mesh(seg2, cylX(0.015, 0.036), armMat, 0, 0, 0);
  mesh(seg2, cylZ(0.011, ARM.L2), armMat, 0, 0, ARM.L2 / 2);
  const head = new THREE.Object3D(); head.name = 'arm_head';
  head.position.z = ARM.L2;
  seg2.add(head);
  mesh(head, cylX(0.013, 0.03), armMat, 0, 0, 0);
  mesh(head, new THREE.BoxGeometry(0.075, 0.075, 0.012), armMat, 0, 0, 0.012);
  mesh(head, new THREE.BoxGeometry(sw + bezel * 2, sh + bezel * 2, 0.014), blackMat, 0, 0, 0.025);
  tag(mesh(head, new THREE.PlaneGeometry(sw, sh), placeholder('screen'), 0, 0, 0.0325), { role: 'screen', noShadow: true });
  return { object: group, meta: { w: sw + bezel * 2, d: clampZ + 0.03, h: 0.4, screenH: sh + bezel * 2, clampZ } };
}

// Andon Watch display: glowing acrylic block with `count` watches on pillow stands.
function andonBlockCanvas(wMm, hMm) {
  const k = 8;
  const [c, g] = makeCanvas(wMm * k, hMm * k);
  g.scale(k, k);
  g.fillStyle = '#eaf3ff'; g.fillRect(0, 0, wMm, hMm);
  g.fillStyle = 'rgba(70,110,170,0.55)';
  g.font = '600 20px Arial, Helvetica, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('Andon Watch', wMm / 2, hMm / 2 + 1);
  return c;
}
function watchScreenCanvas(color) {
  const [c, g] = makeCanvas(128, 144);
  g.fillStyle = '#05070a'; g.fillRect(0, 0, 128, 144);
  g.fillStyle = color; g.fillRect(14, 16, 100, 34);
  g.fillStyle = '#ffffff'; g.font = '700 22px Arial'; g.textAlign = 'center';
  g.fillText('ANDON', 64, 41);
  g.fillStyle = '#cfd8e3'; g.font = '600 18px Arial';
  g.fillText('LINE A · M-03', 64, 80);
  g.fillStyle = color; g.font = '700 28px Arial';
  g.fillText('12:48', 64, 120);
  return c;
}
export function andonWatchDisplay({ count = 4 } = {}) {
  const W = 0.36, D = 0.08, H = 0.05;
  const R = 0.026, tube = 0.008, pitch = 0.085;
  const group = new THREE.Group();
  const glow = std({ color: 0xeaf3ff, emissive: 0xcfe4ff, emissiveIntensity: 1.1, roughness: 0.2 });
  const frontTex = canvasTex(andonBlockCanvas(360, 50));
  const front = std({ map: frontTex, emissive: 0xffffff, emissiveMap: frontTex, emissiveIntensity: 1.0, roughness: 0.2 });
  const block = tag(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [glow, glow, glow, glow, front, glow]), { noShadow: true });
  block.position.y = H / 2;
  group.add(block);
  const strapMat = std({ color: 0x18181b, roughness: 0.55 });
  const caseMat = std({ color: 0x2a2b30, roughness: 0.3, metalness: 0.7 });
  const pillowMat = std({ color: 0x0e0e10, roughness: 0.7 });
  const status = ['#22c55e', '#f59e0b', '#ef4444', '#22c55e'];
  const cy = H + R + tube;
  for (let i = 0; i < count; i++) {
    const watch = new THREE.Group();
    watch.position.set((i - (count - 1) / 2) * pitch, cy, 0);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 12, 32).rotateY(Math.PI / 2), strapMat);
    strap.scale.set(1, 1.08, 0.92);
    const pillow = new THREE.Mesh(new THREE.CylinderGeometry(R - tube * 0.6, R - tube * 0.6, 0.026, 20).rotateZ(Math.PI / 2), pillowMat);
    const caseM = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.044, 0.011), caseMat);
    caseM.position.z = R * 0.92 + 0.004;
    const scrTex = canvasTex(watchScreenCanvas(status[i % status.length]));
    const screen = tag(new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.036),
      std({ map: scrTex, emissive: 0xffffff, emissiveMap: scrTex, emissiveIntensity: 0.8, roughness: 0.2 })), { noShadow: true });
    screen.position.z = caseM.position.z + 0.0056;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.004, 10).rotateZ(Math.PI / 2), caseMat);
    crown.position.set(0.021, 0.006, caseM.position.z);
    watch.add(strap, pillow, caseM, screen, crown);
    group.add(watch);
  }
  return { object: group, meta: { w: W, d: D, h: H + 2 * (R + tube) } };
}

// Foldable round table: tilt-top, column + disc base, all white.
export function roundTable({ dia = 0.75, h = 0.7 } = {}) {
  const group = new THREE.Group();
  const topMat = std({ color: 0xf4f4f2, roughness: 0.35, metalness: 0.05 });
  const whiteMat = std({ color: 0xf2f2f2, roughness: 0.35, metalness: 0.3 });
  const topT = 0.025;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(dia / 2, dia / 2, topT, 48), topMat);
  top.position.y = h - topT / 2;
  const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.08), whiteMat);
  hinge.position.y = h - topT - 0.015;
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.1), topMat);
  lever.position.set(0.12, h - topT - 0.035, 0.06);
  const colH = h - topT - 0.03 - 0.015;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, colH, 20), whiteMat);
  col.position.y = 0.015 + colH / 2;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.015, 40), whiteMat);
  base.position.y = 0.0075;
  group.add(top, hinge, lever, col, base);
  return { object: group, meta: { w: dia, d: dia, h } };
}

// Folding chair: white tubular X-frame, seat + backrest, front = +Z.
export function foldingChair() {
  const W = 0.44, D = 0.5, H = 0.85, seatY = 0.45;
  const group = new THREE.Group();
  const frameMat = std({ color: 0xf2f2f2, roughness: 0.3, metalness: 0.4 });
  const panelMat = std({ color: 0xf4f4f2, roughness: 0.5 });
  const r = 0.011, V = (a, b, c) => new THREE.Vector3(a, b, c);
  for (const sx of [-1, 1]) {
    const xx = sx * (W / 2 - 0.02);
    addTube(group, V(xx, 0, 0.22), V(xx, H, -0.2), r, frameMat);
    addTube(group, V(xx, 0, -0.24), V(xx, seatY, 0.18), r, frameMat);
    addTube(group, V(xx, seatY - 0.01, -0.12), V(xx, seatY - 0.01, 0.2), r * 0.8, frameMat);
  }
  addTube(group, V(-W / 2 + 0.02, 0.12, 0.155), V(W / 2 - 0.02, 0.12, 0.155), r, frameMat);
  addTube(group, V(-W / 2 + 0.02, 0.06, -0.21), V(W / 2 - 0.02, 0.06, -0.21), r, frameMat);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, 0.02, 0.36), panelMat);
  seat.position.set(0, seatY + 0.01, 0.03);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, 0.13, 0.018), panelMat);
  back.position.set(0, H - 0.08, -0.165);
  back.rotation.x = -0.2;
  group.add(seat, back);
  return { object: group, meta: { w: W, d: D, h: H } };
}

// Brochure stacks: 3 A4 piles with different covers, slightly fanned.
function brochureCoverCanvas(kind) {
  const W = 210, H = 297, k = 3;
  const [c, g] = makeCanvas(W * k, H * k);
  g.scale(k, k);
  const dark = kind !== 'andon';
  g.fillStyle = dark ? '#0d1846' : '#eef4fb';
  g.fillRect(0, 0, W, H);
  g.fillStyle = dark ? '#ffffff' : '#1d3f8f';
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = '700 13px Arial, Helvetica, sans-serif';
  g.fillText('BioEnergy', 18, 28);
  g.textAlign = 'center';
  if (kind === 'unysis') {
    g.font = '800 40px Arial, Helvetica, sans-serif'; g.fillText('UNYSIS', W / 2, 120);
    g.fillStyle = '#ffd400'; g.font = '600 11px Arial'; g.fillText('VIRTUAL OPERATOR ON THE EDGE', W / 2, 142);
    g.fillStyle = '#121214'; g.fillRect(W / 2 - 40, 170, 80, 62);
  } else if (kind === 'andon') {
    g.font = '800 32px Arial, Helvetica, sans-serif'; g.fillText('Andon Watch', W / 2, 120);
    g.fillStyle = '#18181b'; g.fillRect(W / 2 - 22, 160, 44, 52);
    g.fillStyle = '#22c55e'; g.fillRect(W / 2 - 16, 168, 32, 10);
  } else {
    g.font = '800 26px Arial, Helvetica, sans-serif'; g.fillText('Digital Twin', W / 2, 110);
    g.font = '600 11px Arial'; g.fillText('AI COMMAND CENTER', W / 2, 132);
    g.strokeStyle = '#4da3ff'; g.lineWidth = 2;
    for (let i = 0; i < 5; i++) g.strokeRect(40 + i * 6, 160 + i * 6, 130 - i * 12, 80 - i * 12);
  }
  g.fillStyle = dark ? 'rgba(255,255,255,0.6)' : 'rgba(29,63,143,0.6)';
  g.font = '9px Arial'; g.fillText('PLACEHOLDER COVER', W / 2, H - 14);
  return c;
}
export function brochureStacks() {
  const BW = 0.21, BD = 0.297;
  const stacks = [['unysis', -0.23, 0.0, -8, 0.022], ['andon', 0.0, 0.02, 0, 0.016], ['twin', 0.23, 0.0, 8, 0.019]];
  const group = new THREE.Group();
  const pageMat = std({ color: 0xf6f6f2, roughness: 0.9 });
  for (const [kind, ox, oz, yaw, h] of stacks) {
    const cover = std({ map: canvasTex(brochureCoverCanvas(kind)), roughness: 0.5 });
    const pile = new THREE.Mesh(new THREE.BoxGeometry(BW, h, BD), [pageMat, pageMat, cover, pageMat, pageMat, pageMat]);
    pile.position.set(ox, h / 2, oz);
    pile.rotation.y = THREE.MathUtils.degToRad(yaw);
    group.add(pile);
  }
  return { object: group, meta: { w: 0.7, d: 0.34, h: 0.022 } };
}

// ============================================================================================
// From index.html
// ============================================================================================

// SONIK-style industrial oven (stainless body = role 'envmap' for the live reflection).
function sonikLogoCanvas(vertical) {
  const [c, g] = vertical ? makeCanvas(256, 1024) : makeCanvas(512, 160);
  g.fillStyle = '#1e5cb2';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (vertical) {
    g.translate(c.width / 2, c.height / 2);
    g.rotate(Math.PI / 2);
    g.font = 'bold 130px system-ui, sans-serif';
    g.fillText('SONIK', 0, 0);
  } else {
    g.font = 'bold 120px system-ui, sans-serif';
    g.fillText('SONIK', c.width / 2, c.height / 2);
  }
  return c;
}
export function oven({ w = 0.9, d = 1.1, h = 2.5 } = {}) {
  const group = new THREE.Group();
  const stainlessMat = new THREE.MeshPhysicalMaterial({ name: 'stainless', color: 0xdde2e6, metalness: 1.0, roughness: 0.22,
    clearcoat: 0.4, clearcoatRoughness: 0.15 });
  const frameMat = std({ color: 0x2a2e33, roughness: 0.45, metalness: 0.6 });
  const body = tag(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stainlessMat), { role: 'envmap' });
  body.position.y = h / 2;
  group.add(body);
  const frontLogo = tag(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14),
    std({ map: canvasTex(sonikLogoCanvas(false)), transparent: true, alphaTest: 0.1 })), { noShadow: true });
  frontLogo.position.set(-w / 4, h - 0.18, d / 2 + 0.002);
  const sideLogo = tag(new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.9),
    std({ map: canvasTex(sonikLogoCanvas(true)), transparent: true, alphaTest: 0.1 })), { noShadow: true });
  sideLogo.position.set(w / 2 + 0.002, h * 0.6, 0);
  sideLogo.rotation.y = Math.PI / 2;
  group.add(frontLogo, sideLogo);
  // Viewing window: frame + tinted glass + green readout
  const winW = 0.58, winH = 0.30, winY = h * 0.72;
  const winFrame = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.04, winH + 0.04, 0.025), frameMat);
  winFrame.position.set(0, winY, d / 2 + 0.004);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x1b2a2f, metalness: 0.3, roughness: 0.1,
    transmission: 0.25, transparent: true, ior: 1.5, thickness: 0.01, clearcoat: 1.0, clearcoatRoughness: 0.05 });
  const glass = tag(new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.015), glassMat), { noPick: true, noShadow: true });
  glass.position.set(0, winY, d / 2 + 0.022);
  const readout = tag(new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.06),
    std({ color: 0x0e2416, emissive: 0x33ff88, emissiveIntensity: 0.9, roughness: 0.3 })), { noShadow: true });
  readout.position.set(-0.16, winY, d / 2 + 0.031);
  group.add(winFrame, glass, readout);
  // Recessed door: raised rim around the opening + door inside the rim
  const doorW = w * 0.82, doorH = h * 0.45, doorY = h * 0.33, rimT = 0.03, rimW = 0.035, bodyFront = d / 2;
  for (const b of [
    { w: doorW + 2 * rimW, h: rimW, x: 0, y: doorY + doorH / 2 + rimW / 2 },
    { w: doorW + 2 * rimW, h: rimW, x: 0, y: doorY - doorH / 2 - rimW / 2 },
    { w: rimW, h: doorH, x: -doorW / 2 - rimW / 2, y: doorY },
    { w: rimW, h: doorH, x: doorW / 2 + rimW / 2, y: doorY },
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, rimT), frameMat);
    bar.position.set(b.x, b.y, bodyFront + rimT / 2);
    group.add(bar);
  }
  const door = tag(new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.01, doorH - 0.01, 0.008), stainlessMat), { role: 'envmap' });
  door.position.set(0, doorY, bodyFront + 0.004);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, 0.14, 0.02), frameMat);
  panel.position.set(0, 0.18, d / 2 + 0.012);
  group.add(door, panel);
  const castorMat = std({ color: 0x1a1a1c, roughness: 0.5, metalness: 0.3 });
  for (const cx of [-w / 2 + 0.08, w / 2 - 0.08]) {
    for (const cz of [-d / 2 + 0.08, d / 2 - 0.08]) {
      const castor = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 16), castorMat);
      castor.rotation.z = Math.PI / 2;
      castor.position.set(cx, 0.035, cz);
      group.add(castor);
    }
  }
  return { object: group, meta: { w, d, h } };
}

// Chamber oven: off-white body, traffic-light tower, control screen, door + handle, side port.
export function oven2({ w = 0.9, d = 1.1, h = 1.8 } = {}) {
  const group = new THREE.Group();
  const bodyMat = std({ color: 0xd6d1c4, roughness: 0.55, metalness: 0.12 });
  const accentMat = std({ color: 0xb3b0a7, roughness: 0.6, metalness: 0.18 });
  const frameMat = std({ color: 0x2a2e33, roughness: 0.45, metalness: 0.6 });
  const darkMat = std({ color: 0x17191b, roughness: 0.5, metalness: 0.55 });
  const screenMat = std({ color: 0x0a0e18, emissive: 0x1f4f9e, emissiveIntensity: 0.45, roughness: 0.22 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
  body.position.y = h / 2;
  const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.008, h * 0.9, d * 0.9), accentMat);
  sidePanel.position.set(w / 2 + 0.005, h * 0.5, 0);
  group.add(body, sidePanel);
  const towerX = -w * 0.28, towerZ = -d * 0.28;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.05, 12), frameMat);
  stem.position.set(towerX, h + 0.025, towerZ);
  group.add(stem);
  const lightColors = [0xff2e2e, 0xffd42a, 0x33cc55];
  for (let i = 0; i < 3; i++) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 20),
      std({ color: lightColors[i], emissive: lightColors[i], emissiveIntensity: 0.6, roughness: 0.3 }));
    lamp.position.set(towerX, h + 0.08 + i * 0.065, towerZ);
    group.add(lamp);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.025, 20), frameMat);
  cap.position.set(towerX, h + 0.08 + 3 * 0.065 + 0.01, towerZ);
  const panelFrame = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.17, 0.022), frameMat);
  panelFrame.position.set(-w * 0.25, h - 0.17, d / 2 + 0.013);
  const screen = tag(new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.09), screenMat), { noShadow: true });
  screen.position.set(-w * 0.25, h - 0.15, d / 2 + 0.026);
  group.add(cap, panelFrame, screen);
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 10),
      std({ color: lightColors[i], emissive: lightColors[i], emissiveIntensity: 0.9, roughness: 0.3 }));
    led.rotation.x = Math.PI / 2;
    led.position.set(-w * 0.25 + 0.11, h - 0.12 - i * 0.03, d / 2 + 0.028);
    group.add(led);
  }
  const doorW = w * 0.72, doorH = h * 0.72, doorY = h * 0.42, doorOffsetX = w * 0.06;
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.03, doorH + 0.03, 0.02), frameMat);
  doorFrame.position.set(doorOffsetX, doorY, d / 2 + 0.005);
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.015), bodyMat);
  door.position.set(doorOffsetX, doorY, d / 2 + 0.014);
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.06), std({ color: 0x1e5cb2, roughness: 0.4 }));
  sticker.position.set(doorOffsetX, doorY + doorH * 0.3, d / 2 + 0.023);
  const handleH = doorH * 0.85, handleX = doorOffsetX - doorW / 2 - 0.03;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, handleH, 0.05), darkMat);
  handle.position.set(handleX, doorY, d / 2 + 0.035);
  group.add(doorFrame, door, sticker, handle);
  for (const hy of [handleH / 2 - 0.02, -handleH / 2 + 0.02]) {
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.03), frameMat);
    clip.position.set(handleX, doorY + hy, d / 2 + 0.02);
    group.add(clip);
  }
  const flangeOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.02, 32), frameMat);
  flangeOuter.rotation.z = Math.PI / 2;
  flangeOuter.position.set(w / 2 + 0.012, h * 0.45, 0);
  const flangeInner = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.014, 32), darkMat);
  flangeInner.rotation.z = Math.PI / 2;
  flangeInner.position.set(w / 2 + 0.02, h * 0.45, 0);
  group.add(flangeOuter, flangeInner);
  for (const cx of [-w / 2 + 0.09, w / 2 - 0.09]) {
    for (const cz of [-d / 2 + 0.09, d / 2 - 0.09]) {
      const legStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 12), frameMat);
      legStem.position.set(cx, 0.03, cz);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.015, 16), darkMat);
      pad.position.set(cx, 0.008, cz);
      group.add(legStem, pad);
    }
  }
  return { object: group, meta: { w, d, h } };
}

// White box with an optional portrait display panel ("facade") standing on its back edge.
// The facade front is role 'screen' (the page assigns the image material).
export function facadeBox({ w = 0.91, d = 0.3048, h = 0.615, facadeH = 0, facadeW = 0.7, facadeColor = 0x2f5fa8 } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std({ color: 0xffffff, metalness: 0, roughness: 0.85 }));
  body.position.y = h / 2;
  group.add(body);
  if (facadeH > 0) {
    const facadeT = 0.03;
    const bodyFacadeMat = std({ color: facadeColor, roughness: 0.55, metalness: 0.1, emissive: facadeColor, emissiveIntensity: 0.12 });
    const facade = new THREE.Mesh(new THREE.BoxGeometry(facadeW, facadeH, facadeT), bodyFacadeMat);
    facade.position.set(0, h + facadeH / 2, -d / 2 + facadeT / 2);
    const front = tag(new THREE.Mesh(new THREE.PlaneGeometry(facadeW, facadeH), placeholder('screen')), { role: 'screen', noShadow: true });
    front.position.set(0, h + facadeH / 2, -d / 2 + facadeT + 0.0005);
    group.add(facade, front);
  }
  return { object: group, meta: { w, d, h } };
}

// Control console: semi-circular wall of 3 × 43" TVs (roles screen0..2) + curved banner on 2 poles.
function consoleBannerCanvas(mirrored) {
  const [c, g] = makeCanvas(2048, 256);
  g.fillStyle = '#0a1a3a';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#1f6fb8';
  g.lineWidth = 4;
  g.strokeRect(3, 3, c.width - 6, c.height - 6);
  if (mirrored) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.fillStyle = '#ffd166';
  g.font = 'bold 130px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('VIRTUAL OPERATOR WITH Ai', c.width / 2, c.height / 2);
  return c;
}
export function consoleWall() {
  const W = 2.6, D = 2.4, H = 2.2;
  const group = new THREE.Group();
  const frameMat = std({ color: 0x1a1c1f, roughness: 0.4, metalness: 0.7 });
  const op = new THREE.Group();          // origin = operator position
  op.position.set(0, 0, -D / 2 + 0.55);
  group.add(op);
  const R_wall = 1.55, R_mon = R_wall - 0.12;
  const wallAngles = [-Math.PI * 40 / 180, 0, Math.PI * 40 / 180];
  const mW = 0.952, mH = 0.536, tvCenterY = 1.54;
  wallAngles.forEach((θ, i) => {
    const mon = new THREE.Group();
    const screen = tag(new THREE.Mesh(new THREE.BoxGeometry(mW, mH, 0.025), placeholder('screen')), { role: `screen${i}` });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(mW + 0.04, mH + 0.04, 0.02), frameMat);
    frame.position.z = -0.005;
    mon.add(frame, screen);
    mon.position.set(R_mon * Math.sin(θ), tvCenterY, R_mon * Math.cos(θ));
    mon.rotation.y = θ + Math.PI;        // face the operator
    op.add(mon);
    const postH = tvCenterY + mH / 2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, postH, 0.08), frameMat);
    post.position.set(R_wall * Math.sin(θ), postH / 2, R_wall * Math.cos(θ));
    post.rotation.y = θ;
    op.add(post);
  });
  // "Virtual Operator with Ai" banner: 3000 chord × 540 tall, 152.4 sag, on two 1820 poles
  const bannerL = 3.0, bannerSag = 0.1524, bannerH = 0.54;
  const bannerR = ((bannerL / 2) ** 2 + bannerSag ** 2) / (2 * bannerSag);
  const bannerHalf = Math.asin(bannerL / (2 * bannerR));
  const bannerBottomY = 1.82, bannerCenterY = bannerBottomY + bannerH / 2, chordZ = 1.5;
  const cylZ = chordZ - bannerR * Math.cos(bannerHalf);
  const geom = new THREE.CylinderGeometry(bannerR, bannerR, bannerH, 64, 1, true, -bannerHalf, bannerHalf * 2);
  const texOut = canvasTex(consoleBannerCanvas(false)), texIn = canvasTex(consoleBannerCanvas(true));
  const bannerOut = new THREE.Mesh(geom, std({ map: texOut, roughness: 0.7, emissive: 0xffffff, emissiveMap: texOut, emissiveIntensity: 0.2 }));
  const bannerIn = tag(new THREE.Mesh(flipFaces(geom), std({ map: texIn, roughness: 0.7, emissive: 0xffffff, emissiveMap: texIn, emissiveIntensity: 0.2 })), { noShadow: true });
  bannerOut.position.set(0, bannerCenterY, cylZ);
  bannerIn.position.set(0, bannerCenterY, cylZ);
  op.add(bannerOut, bannerIn);
  const poleMat = std({ color: 0x0a1a3a, roughness: 0.6, metalness: 0.1 });
  for (const sign of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.058, bannerBottomY, 0.058), poleMat);
    pole.position.set(sign * (bannerL / 2), bannerBottomY / 2, chordZ);
    op.add(pole);
  }
  return { object: group, meta: { w: W, d: D, h: H } };
}

// Curved arc desk (not placed today; kept on purpose).
export function arcDesk() {
  const group = new THREE.Group();
  const bodyMat = std({ color: 0x2b2f34, roughness: 0.65, metalness: 0.25 });
  const topMat = std({ color: 0xe4e6e9, roughness: 0.45, metalness: 0.1 });
  function annularShape(innerR, outerR, halfLeft, halfRight = halfLeft) {
    const s = new THREE.Shape();
    const a0 = -Math.PI / 2 - halfLeft, a1 = -Math.PI / 2 + halfRight;
    s.moveTo(outerR * Math.cos(a0), outerR * Math.sin(a0));
    s.absarc(0, 0, outerR, a0, a1, false);
    s.lineTo(innerR * Math.cos(a1), innerR * Math.sin(a1));
    s.absarc(0, 0, innerR, a1, a0, true);
    s.closePath();
    return s;
  }
  const deskShape = annularShape(0.89, 1.35, Math.PI * 20 / 180, Math.PI * 55 / 180);
  const bodyGeom = new THREE.ExtrudeGeometry(deskShape, { depth: 0.7, bevelEnabled: false, curveSegments: 48 });
  bodyGeom.rotateX(-Math.PI / 2);
  const topGeom = new THREE.ExtrudeGeometry(deskShape, { depth: 0.04, bevelEnabled: false, curveSegments: 48 });
  topGeom.rotateX(-Math.PI / 2);
  const top = new THREE.Mesh(topGeom, topMat);
  top.position.y = 0.7;
  group.add(new THREE.Mesh(bodyGeom, bodyMat), top);
  return { object: group, meta: { w: 1.6, d: 1.4, h: 0.74 } };
}

// PC: 21" monitor (role 'screen') on a stand + keyboard. Origin = desk top (place it on a table item).
export function pc({ deskTop = 0 } = {}) {
  const group = new THREE.Group();
  const frameMat = std({ color: 0x1a1c1f, roughness: 0.4, metalness: 0.7 });
  const oW = 0.465, oH = 0.262;
  const mon = new THREE.Group();
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(oW + 0.03, oH + 0.03, 0.018), frameMat);
  bezel.position.z = -0.003;
  const screen = tag(new THREE.Mesh(new THREE.BoxGeometry(oW, oH, 0.02), placeholder('screen')), { role: 'screen' });
  mon.add(bezel, screen);
  mon.position.set(0, deskTop + oH / 2 + 0.10, -0.09);
  mon.rotation.x = 0.12;
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), frameMat);
  stand.position.set(0, deskTop + 0.05, -0.09);
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.14), frameMat);
  kb.position.set(0, deskTop + 0.02, 0.08);
  group.add(mon, stand, kb);
  return { object: group, meta: { w: 0.5, d: 0.35, h: +(deskTop + 0.10 + oH + 0.015).toFixed(3) } };
}

// Foldable table with a draped navy cloth (not placed today; kept on purpose).
export function foldingTable() {
  const W = 0.60, D = 0.60, H = 0.74, topT = 0.04;
  const group = new THREE.Group();
  const topMat = std({ color: 0x141416, roughness: 0.55, metalness: 0.15 });
  const legMat = std({ color: 0xb0b3b8, roughness: 0.4, metalness: 0.6 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, topT, D), topMat);
  top.position.y = H - topT / 2;
  group.add(top);
  const legH = H - topT, inset = 0.08;
  for (const [lx, lz] of [[-W / 2 + inset, -D / 2 + inset], [W / 2 - inset, -D / 2 + inset], [W / 2 - inset, D / 2 - inset], [-W / 2 + inset, D / 2 - inset]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, legH, 12), legMat);
    leg.position.set(lx, legH / 2, lz);
    group.add(leg);
  }
  const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, D - 0.1), legMat);
  hinge.position.set(0, H - topT - 0.01, 0);
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, H, D + 0.04), std({ color: 0x0a1a3a, roughness: 0.9, metalness: 0 }));
  cloth.position.set(0, H / 2, 0);
  group.add(hinge, cloth);
  return { object: group, meta: { w: W, d: D, h: H } };
}

// Display plinth (UNYSIS / BIOENERGY lettering) with a glass cover and a spinning product box.
// The page adds the small spotlight inside the cover (lights are not exported).
function plinthLettersCanvas(letters, size) {
  const [c, g] = makeCanvas(256, 768);
  g.fillStyle = '#0a1a3a';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#ffffff';
  g.font = `bold ${size}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const step = c.height / (letters.length + 1);
  letters.forEach((ch, i) => g.fillText(ch, c.width / 2, step * (i + 1)));
  return c;
}
export const DISPLAY_BOX = { baseH: 0.90, coverH: 0.30, itemH: 0.08 };
export function displayBox() {
  const W = 0.30, D = 0.30, { baseH, coverH, itemH } = DISPLAY_BOX;
  const group = new THREE.Group();
  const sideMat = std({ map: canvasTex(plinthLettersCanvas([...'UNYSIS'], 120)), roughness: 0.7 });
  const frontMat = std({ map: canvasTex(plinthLettersCanvas([...'BIOENERGY'], 84)), roughness: 0.7 });
  const capMat = std({ color: 0x0a1a3a, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, baseH, D), [sideMat, sideMat, capMat, capMat, frontMat, frontMat]);
  base.position.y = baseH / 2;
  const cover = tag(new THREE.Mesh(new THREE.BoxGeometry(W, coverH, D), new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 1.0, transparent: true, opacity: 1.0, roughness: 0.05, metalness: 0,
    ior: 1.5, thickness: 0.01, clearcoat: 1.0, clearcoatRoughness: 0.05 })), { noPick: true });
  cover.position.y = baseH + coverH / 2;
  const edges = tag(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, coverH, D)),
    new THREE.LineBasicMaterial({ color: 0xbfd3e0 })), { noPick: true });
  edges.position.y = baseH + coverH / 2;
  const item = tag(new THREE.Mesh(new THREE.BoxGeometry(0.13, itemH, 0.09), std({ color: 0x0f0f10, roughness: 0.5, metalness: 0.25 })), { role: 'spin' });
  item.position.set(0, baseH + itemH / 2, 0);
  group.add(base, cover, edges, item);
  return { object: group, meta: { w: W, d: D, h: baseH + coverH } };
}

// Simple 170 cm mannequin.
export function human() {
  const group = new THREE.Group();
  const skinMat = std({ color: 0xe8c9a8, roughness: 0.7 });
  const shirtMat = std({ color: 0x2f5fa8, roughness: 0.8 });
  const pantsMat = std({ color: 0x1e2530, roughness: 0.85 });
  const shoeMat = std({ color: 0x111111, roughness: 0.6 });
  const hairMat = std({ color: 0x2a1a0e, roughness: 0.9 });
  const hShoes = 0.04, hLegs = 0.83, hTorso = 0.55, hNeck = 0.05, hHead = 0.23;
  for (const sx of [-0.08, 0.08]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.10, hShoes, 0.22), shoeMat);
    shoe.position.set(sx, hShoes / 2, 0.02);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, hLegs, 16), pantsMat);
    leg.position.set(sx, hShoes + hLegs / 2, 0);
    group.add(shoe, leg);
  }
  const torsoY = hShoes + hLegs + hTorso / 2;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, hTorso, 0.22), shirtMat);
  torso.position.y = torsoY;
  group.add(torso);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.60, 16), shirtMat);
    arm.position.set(side * 0.22, torsoY + 0.05, 0);
    arm.rotation.z = side * 0.06;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), skinMat);
    hand.position.set(side * 0.245, hShoes + hLegs + 0.02, 0);
    group.add(arm, hand);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, hNeck, 16), skinMat);
  neck.position.y = hShoes + hLegs + hTorso + hNeck / 2;
  const headR = hHead / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 24, 20), skinMat);
  head.position.y = hShoes + hLegs + hTorso + hNeck + headR;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.02, 24, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.copy(head.position);
  group.add(neck, head, hair);
  return { object: group, meta: { w: 0.45, d: 0.30, h: 1.70 } };
}

// ============================================================================================
// Variants written to assets/models/<name>.glb (only what the pages use, + kept spares)
// ============================================================================================
export const VARIANTS = {
  // japan2026.html (also used by index.html where noted)
  'tv-42':                () => standingTV({ diagIn: 42, totalH: 1.35 }),
  'tv-55':                () => standingTV({ diagIn: 55, totalH: 1.6 }),
  'tv-60':                () => standingTV({ diagIn: 60, totalH: 1.6 }),          // index tv-1
  'hologram-fan':         () => hologramFan(),                                    // japan fan-1, index case-1
  'counter':              () => counter({ w: 0.9, h: 0.8, d: 0.45 }),
  'framed-banner':        () => framedBanner({ w: 2.6, h: 2.5 }),
  'wall-poster-a0':       () => wallPoster(),
  'queue-pole':           () => queuePole(),                                      // both pages
  'arm-monitor':          () => armMonitor({ diagIn: 15.6, clampZ: 0.12 }),
  'andon-watch-display':  () => andonWatchDisplay({ count: 4 }),
  'round-table':          () => roundTable({ dia: 0.75, h: 0.7 }),
  'folding-chair':        () => foldingChair(),
  'brochure-stacks':      () => brochureStacks(),
  // index.html
  'oven':                 () => oven({ w: 0.9, d: 1.1, h: 2.5 }),
  'oven2':                () => oven2({ w: 0.9, d: 1.1, h: 1.8 }),
  'facade-box':           () => facadeBox({ w: 0.91, d: 0.3048, h: 0.615, facadeH: 1.2 }),
  'white-box':            () => facadeBox({ w: 0.6, d: 0.6, h: 0.74 }),
  'console':              () => consoleWall(),
  'pc':                   () => pc(),
  'display-box':          () => displayBox(),
  'human':                () => human(),
  'arc-desk':             () => arcDesk(),
  'folding-table':        () => foldingTable(),
};
