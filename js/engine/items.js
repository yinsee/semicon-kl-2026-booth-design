// Furniture items from project JSON. Each item is a root object pushed into S.furniture whose
// userData { id, w, d, h, draggable, ... } drives picking, dragging, persistence and clamping.
// The root is created synchronously (placement, layout, footprint from manifest.json); the GLB
// model is added when loaded and its tagged parts are wired to the item's live features.
//
// Item JSON fields (all optional except id):
//   model      GLB name in assets/models/          at        { x, z, ry } default placement
//   parent     id of the item it stands on         light     { x, y, z, intensity } (point light + bulb)
//   free       with parent: stand on the floor in the parent's frame (moves with it, drags anywhere)
//   wall       { side: 'left'|'right', bottom }    graphic   { sources, default, roughness }
//   screen     { default, intensity, roughness }   screens [{ role, label, default, … }]
//   arm        { swivel, a1, a2 }  (monitor arm)   hologram  { image, video }
//   spin       rotate the 'spin' part 1°/s         spotlight { intensity, distance, angle, penumbra, decay, y, targetY }
//   envmap     bind the live reflection to 'envmap' parts
//   barrier    { model, count, min, max, closed, poles: [{ id, name, seq, at }] } — barrier poles that
//              belong to this item: they move with it, can each be dragged freely on the floor, and are
//              joined in `seq` order by red belts. `count` (min..max) poles are active; `closed` loops the
//              belt back to the first pole. Saved as `barrier` (count) and `barrierLoop`.
import * as THREE from 'three';
import { S } from './state.js';
import { addModel, modelMeta } from './models.js';
import { addScreen, initGraphic, makeHologramMaterial } from './media.js';

const ARM = { L1: 0.18, L2: 0.16, POLE_H: 0.2 };
export const ARM_LIMITS = { swivel: [-90, 90], a1: [-30, 60], a2: [-60, 45] }; // degrees
const QUEUE_STRAP_Y = 0.92; // belt height (just below the top finial)
export const DECAL = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

export function findItem(id) { return S.furniture.find(f => f.userData.id === id); }

export function buildItems(project) {
  for (const def of project.items) {
    S.names.set(def.id, def.name ?? def.id);
    S.icons.set(def.id, def.icon);
    if (def.light) addPointLight(def);
    else {
      const root = buildModelItem(def);
      if (def.barrier) buildBarrier(root, def);
    }
  }
}

// --- Point light: the bulb mesh is the item root (Grid toggle hides its material, not the light) ---
function addPointLight({ id, light: L }) {
  const light = new THREE.PointLight(0xffffff, L.intensity ?? 14, 10, 1.6);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.0005;
  light.shadow.radius = 6;
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe6a8, emissiveIntensity: 1.1, roughness: 0.5 }),
  );
  bulb.add(light);
  bulb.userData = { id, isLight: true, draggable: true, w: 0.18, d: 0.18, h: 0.18 };
  const saved = S.savedLayout[id];
  // Lights drag only in X and Y; Z is always the initial value.
  bulb.position.set(saved ? saved.x : L.x, saved ? (saved.y ?? L.y) : L.y, L.z);
  bulb.material.visible = S.grid?.visible ?? true;
  S.scene.add(bulb);
  S.furniture.push(bulb);
  return bulb;
}

function buildModelItem(def) {
  const meta = modelMeta(def.model);
  const saved = S.savedLayout[def.id];
  const at = def.at ?? {};
  const root = new THREE.Group();
  root.name = def.id;
  root.userData = { id: def.id, w: meta.w, d: meta.d, h: meta.h, draggable: true };

  // Live features that must exist before the model loads (layout, pickers, undo use them)
  if (def.screen) addScreen(root, { role: 'screen', ...def.screen }, saved?.screen);
  (def.screens ?? []).forEach((cfg, i) => addScreen(root, cfg, saved?.screens?.[i]));
  if (def.graphic) {
    // Print sits a hair in front of its board: depth offset prevents z-fighting at a distance
    const mat = new THREE.MeshStandardMaterial({ roughness: def.graphic.roughness ?? 0.8, ...DECAL });
    initGraphic(root, mat, S.project.graphicSources[def.graphic.sources], saved?.graphic ?? def.graphic.default);
  }
  if (def.arm) {
    Object.assign(root.userData, { h: 0.4, screenH: meta.screenH, arm: { ...def.arm, ...(saved?.arm ?? {}) } });
    updateArm(root);
  }
  if (def.spotlight) {
    // Small hidden spotlight inside a display cover, aimed at the product
    const s = def.spotlight;
    const spot = new THREE.SpotLight(0xffffff, s.intensity, s.distance, s.angle, s.penumbra, s.decay);
    spot.position.set(0, s.y, 0);
    spot.target.position.set(0, s.targetY, 0);
    root.add(spot, spot.target);
  }

  // Placement (same rules as before the JSON move)
  if (def.wall) placeOnWall(root, def, saved);
  else if (def.parent && def.free) {
    // Free child (e.g. the console TVs): on the floor, moves with its parent, dragged anywhere
    const parent = findItem(def.parent);
    Object.assign(root.userData, { parentId: parent.userData.id, freeOnParent: true });
    setFloorPose(root, parent, saved, at);
    parent.add(root);
    S.furniture.push(root);
  } else if (def.parent) {
    const parent = findItem(def.parent);
    if (def.arm) root.userData.lockZ = -parent.userData.d / 2 + meta.clampZ; // clamp on the back edge; slides along it only
    placeOnSurface(root, { id: def.id, x: at.x ?? 0, z: at.z ?? 0, ry: def.arm ? 0 : (at.ry ?? 0), parent });
  } else {
    if (saved) {
      root.position.set(saved.x, 0, saved.z);
      root.rotation.y = saved.ry ?? 0;
    } else {
      root.position.set(at.x ?? 0, 0, at.z ?? 0);
      root.rotation.y = at.ry ?? 0;
    }
    S.scene.add(root);
    S.furniture.push(root);
  }

  addModel(root, def.model, (roles, model) => {
    for (const e of root.userData.screens ?? []) for (const m of roles[e.role] ?? []) m.material = e.mat;
    for (const m of roles.print ?? []) m.material = root.userData.graphicMat;
    if (def.hologram && roles.holo) {
      const mat = makeHologramMaterial(def.hologram);
      for (const m of roles.holo) m.material = mat;
    }
    if (def.spin) S.animatedItems.push(...(roles.spin ?? []));
    if (def.envmap && S.cubeRT) {
      for (const m of roles.envmap ?? []) { m.material.envMap = S.cubeRT.texture; m.material.envMapIntensity = 1.5; m.material.needsUpdate = true; }
    }
    if (def.arm) {
      const n = (name) => model.getObjectByName(name);
      root.userData.joints = { swivel: n('arm_swivel'), seg1: n('arm_seg1'), seg2: n('arm_seg2'), head: n('arm_head') };
      updateArm(root);
    }
  });
  return root;
}

// Wall item (A0 poster): flush with the inner face of a side wall, slides along Z only.
// userData.wallX marks a wall item — the drag code slides it on the wall plane x = wallX.
function placeOnWall(root, def, saved) {
  const { room } = S.project, { w, d, h } = root.userData;
  const left = def.wall.side === 'left';
  const wallX = left ? room.wallT + d / 2 : room.w - room.wallT - d / 2;
  root.rotation.y = left ? Math.PI / 2 : -Math.PI / 2;
  Object.assign(root.userData, { wallX, wallMinZ: room.wallT + w / 2, wallMaxZ: room.d - w / 2 });
  const z = saved?.z ?? def.at?.z ?? room.d / 2;
  root.position.set(wallX, (def.wall.bottom ?? 0.9) + h / 2, THREE.MathUtils.clamp(z, root.userData.wallMinZ, root.userData.wallMaxZ));
  S.scene.add(root);
  S.furniture.push(root);
}

// --- Desktop items: sit on a parent's top (e.g. the counter) ---
// x/z/ry are in the parent's local frame, y is the parent's top (userData.h); the item follows the
// parent when it moves or rotates. Drag keeps it on the parent's top (see 'surface' drag mode).
function placeOnSurface(group, { id, x, z, ry = 0, parent }) {
  const saved = S.savedLayout[id];
  group.userData.parentId = parent.userData.id;
  parent.add(group);
  const topY = parent.userData.h;
  if (saved && saved.local) {
    group.position.set(saved.x, topY, saved.z);
    group.rotation.y = saved.ry ?? ry;
  } else if (saved) {
    // Older layout saved world coords → convert into the parent's frame once
    parent.updateMatrixWorld(true);
    const v = parent.worldToLocal(new THREE.Vector3(saved.x, 0, saved.z));
    group.position.set(v.x, topY, v.z);
    group.rotation.y = (saved.ry ?? 0) - parent.rotation.y;
  } else {
    group.position.set(x, topY, z);
    group.rotation.y = ry;
  }
  clampToParentTop(group);
  S.furniture.push(group);
  return group;
}
// Keep an anchored item fully on its parent's top. userData.lockZ pins local z (edge clamps).
export function clampToParentTop(obj) {
  const P = obj.parent.userData, { w, d, lockZ } = obj.userData;
  const c = Math.abs(Math.cos(obj.rotation.y)), sn = Math.abs(Math.sin(obj.rotation.y));
  const hw = c * w / 2 + sn * d / 2, hd = sn * w / 2 + c * d / 2;
  obj.position.x = THREE.MathUtils.clamp(obj.position.x, -P.w / 2 + hw, P.w / 2 - hw);
  obj.position.z = lockZ !== undefined ? lockZ : THREE.MathUtils.clamp(obj.position.z, -P.d / 2 + hd, P.d / 2 - hd);
  if (lockZ !== undefined) obj.rotation.y = 0; // edge clamp stays square to the table edge
}

// Monitor arm: apply userData.arm angles (degrees, clamped to ARM_LIMITS) to the joint chain.
// Joints: swivel (yaw) → seg1 (pitch) → seg2 (pitch) → head (counter-pitch keeps the screen upright).
// Before the model has loaded only the angles and the height are updated.
export function updateArm(group) {
  const arm = group.userData.arm, j = group.userData.joints;
  for (const k of Object.keys(ARM_LIMITS)) arm[k] = THREE.MathUtils.clamp(arm[k], ...ARM_LIMITS[k]);
  const r = THREE.MathUtils.degToRad;
  if (j?.swivel) {
    j.swivel.rotation.y = r(arm.swivel);
    j.seg1.rotation.x = -r(arm.a1);            // +angle lifts the segment
    j.seg2.rotation.x = -r(arm.a2 - arm.a1);   // a2 is absolute (relative to horizontal)
    j.head.rotation.x = r(arm.a2);
  }
  const headY = ARM.POLE_H + ARM.L1 * Math.sin(r(arm.a1)) + ARM.L2 * Math.sin(r(arm.a2));
  group.userData.h = headY + group.userData.screenH / 2;
}

// --- Barrier poles (children of their owner item, e.g. the 3D fan) + red belts ---
// All pole objects are built once; setBarrierCount() attaches the first `count` of them to the owner
// (and to S.furniture) and detaches the rest. Poles are free on the floor in the owner's frame.
function buildBarrier(owner, def) {
  const cfg = def.barrier;
  const model = cfg.model ?? 'queue-pole';
  const meta = modelMeta(model);
  const poles = cfg.poles.map((p, i) => {
    S.names.set(p.id, p.name ?? p.id);
    S.icons.set(p.id, 'pole');
    const pole = new THREE.Group();
    pole.name = p.id;
    pole.userData = { id: p.id, w: meta.w, d: meta.d, h: meta.h, draggable: true,
                      parentId: def.id, freeOnParent: true, seq: p.seq ?? i };
    setFloorPose(pole, owner, S.savedLayout[p.id], p.at);
    addModel(pole, model);
    return pole;
  });
  const min = cfg.min ?? 2, max = cfg.max ?? poles.length;
  const saved = S.savedLayout[def.id];
  owner.userData.barrier = { poles, min, max, closed: saved?.barrierLoop ?? !!cfg.closed, count: 0 };
  setBarrierCount(owner, saved?.barrier ?? cfg.count ?? min);
}

// Pose of a free child (on the floor, in its parent's frame): saved local pose, or a layout saved
// before it belonged to the parent (world → parent frame, once), or the default `at`.
function setFloorPose(obj, parent, saved, at) {
  if (saved?.local) {
    obj.position.set(saved.x, 0, saved.z);
    obj.rotation.y = saved.ry ?? 0;
  } else if (saved) {
    parent.updateMatrixWorld(true);
    const v = parent.worldToLocal(new THREE.Vector3(saved.x, 0, saved.z));
    obj.position.set(v.x, 0, v.z);
    obj.rotation.y = (saved.ry ?? 0) - parent.rotation.y;
  } else {
    obj.position.set(at?.x ?? 0, 0, at?.z ?? 0);
    obj.rotation.y = at?.ry ?? 0;
  }
}

export function barrierOwner(obj) {
  if (obj?.userData.barrier) return obj;
  if (obj?.userData.freeOnParent && obj.parent?.userData.barrier) return obj.parent;
  return null;
}

export function setBarrierCount(owner, count) {
  const B = owner.userData.barrier;
  B.count = THREE.MathUtils.clamp(Math.round(count), B.min, B.max);
  B.poles.forEach((pole, i) => {
    const active = i < B.count;
    const listed = S.furniture.includes(pole);
    if (active && !listed) {
      owner.add(pole);
      const at = S.furniture.indexOf(owner) + 1 + B.poles.slice(0, i).filter(p => S.furniture.includes(p)).length;
      S.furniture.splice(at, 0, pole);
    } else if (!active && listed) {
      owner.remove(pole);
      S.furniture.splice(S.furniture.indexOf(pole), 1);
      if (S.infoObj === pole) S.infoObj = null;
      if (S.hoverObj === pole) S.hoverObj = null;
    }
  });
  rebuildBelts(owner);
}

// Loop the belt (last pole back to the first) or leave it open. Needs 3 or more poles.
export function setBarrierLoop(owner, closed) {
  owner.userData.barrier.closed = !!closed;
  rebuildBelts(owner);
}

// Belts: active poles joined in `seq` order; closed loop only with 3 or more poles
function rebuildBelts(owner) {
  const B = owner.userData.barrier;
  for (const q of S.queues.filter(q => q.owner === owner)) {
    S.scene.remove(q.strap);
    q.strap.geometry.dispose();
    q.strap.material.dispose();
  }
  S.queues = S.queues.filter(q => q.owner !== owner);
  const chain = B.poles.slice(0, B.count).sort((a, b) => a.userData.seq - b.userData.seq);
  const n = B.closed && chain.length >= 3 ? chain.length : chain.length - 1;
  for (let i = 0; i < n; i++) S.queues.push({ owner, a: chain[i], b: chain[(i + 1) % chain.length], strap: makeQueueStrap() });
}

function makeQueueStrap() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.05, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xc02020, roughness: 0.6, metalness: 0.05 }),
  );
  mesh.castShadow = true;
  mesh.raycast = () => {};
  S.scene.add(mesh);
  return mesh;
}
function shown(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
// Each belt is a unit-length box stretched between its two poles (world positions) every frame
export function updateQueueStraps() {
  for (const { a, b, strap } of S.queues) {
    a.getWorldPosition(_pa);
    b.getWorldPosition(_pb);
    const dx = _pb.x - _pa.x, dz = _pb.z - _pa.z;
    strap.position.set((_pa.x + _pb.x) / 2, QUEUE_STRAP_Y, (_pa.z + _pb.z) / 2);
    strap.scale.x = Math.max(Math.hypot(dx, dz), 0.001);
    strap.rotation.y = -Math.atan2(dz, dx);
    strap.visible = shown(a) && shown(b);
  }
}
