// Picking + the drag state machine (ported from japan2026.html):
//   move (floor, 100 mm snap) · rotate (Shift, 15° snap) · light (X/Y plane) · wall (slide along a wall)
//   surface (on a parent's top, 10 mm steps) · surface-rotate (Shift) · swivel (Shift on a monitor arm)
// Only the selected, unlocked item can be dragged; otherwise the mouse orbits. Selection happens on
// mouse-up for a click (< 4 px of movement).
import * as THREE from 'three';
import { C } from './core.js';
import { S } from './state.js';
import { clampToParentTop, updateArm } from './items.js';
import { saveLayout } from './layout.js';
import { showInfo, setLocked } from './ui.js';

const SNAP = 0.1;                 // 100 mm
const ROT_SNAP = Math.PI / 12;    // 15°
const CLICK_TOL = 4;
const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.005;
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
const grabOffset = new THREE.Vector3();
let pressed = null; // { x, y, target } recorded at mouse-down

export const drag = {
  obj: null,
  mode: 'none',
  startAngle: 0,
  startRotY: 0,
  lightPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
  wallPlane: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
  surfacePlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
};

const bounds = () => S.project.room.bounds;

function setPointerNDC(clientX, clientY) {
  const rect = C.renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

function pickFurniture(clientX, clientY) {
  setPointerNDC(clientX, clientY);
  raycaster.setFromCamera(pointer, C.activeCamera);
  const hits = raycaster.intersectObjects(S.furniture.filter(f => f.visible), true).filter(h => {
    for (let o = h.object; o; o = o.parent) if (!o.visible) return false;   // skip hidden children
    return true;
  });
  if (!hits.length) return null;
  const roots = new Set(S.furniture);
  let node = hits[0].object;
  while (node && !roots.has(node)) node = node.parent;
  return node || null;
}
// Booth shell hit test (uses the ray already set by pickFurniture)
function pickBooth() { return raycaster.intersectObject(S.booth, true).length > 0; }

function onMouseDown(e) {
  if (!S.project || e.button !== 0) return;
  const obj = pickFurniture(e.clientX, e.clientY);
  pressed = { x: e.clientX, y: e.clientY, target: obj ?? (pickBooth() ? S.booth : null) };
  if (!obj) return;                   // empty space / booth: orbit; selection decided on mouse-up
  if (obj !== S.infoObj) return;      // only the selected item can be moved / rotated; else orbit
  if (obj.userData.locked) return;    // locked: no drag
  drag.obj = obj;

  if (obj.userData.parentId) {
    // Anchored item: move (or Shift-rotate) on the parent's top (or the floor for barrier poles),
    // in the parent's local frame
    const topY = obj.getWorldPosition(new THREE.Vector3()).y;
    drag.surfacePlane.set(new THREE.Vector3(0, 1, 0), -topY);
    raycaster.ray.intersectPlane(drag.surfacePlane, hitPoint);
    const local = obj.parent.worldToLocal(hitPoint.clone());
    if (e.shiftKey && obj.userData.arm) {
      drag.mode = 'swivel';
      drag.startX = e.clientX;
      drag.startSwivel = obj.userData.arm.swivel;
      document.body.style.cursor = 'ew-resize';
    } else if (e.shiftKey && obj.userData.lockZ === undefined) {
      drag.mode = 'surface-rotate';
      drag.startAngle = Math.atan2(local.x - obj.position.x, local.z - obj.position.z);
      drag.startRotY = obj.rotation.y;
      document.body.style.cursor = 'ew-resize';
    } else {
      drag.mode = 'surface';
      grabOffset.set(local.x - obj.position.x, 0, local.z - obj.position.z);
      document.body.style.cursor = 'grabbing';
    }
  } else if (obj.userData.wallX !== undefined) {
    // Wall item: slide along Z on its wall plane (no rotation, no height change)
    drag.mode = 'wall';
    drag.wallPlane.set(new THREE.Vector3(1, 0, 0), -obj.userData.wallX);
    raycaster.ray.intersectPlane(drag.wallPlane, hitPoint);
    grabOffset.set(0, 0, hitPoint.z - obj.position.z);
    document.body.style.cursor = 'ew-resize';
  } else if (obj.userData.isLight) {
    drag.mode = 'light';
    drag.lightPlane.set(new THREE.Vector3(0, 0, 1), -obj.position.z);
    raycaster.ray.intersectPlane(drag.lightPlane, hitPoint);
    grabOffset.set(hitPoint.x - obj.position.x, hitPoint.y - obj.position.y, 0);
    document.body.style.cursor = 'grabbing';
  } else if (e.shiftKey) {
    raycaster.ray.intersectPlane(dragPlane, hitPoint);
    drag.mode = 'rotate';
    drag.startAngle = Math.atan2(hitPoint.x - obj.position.x, hitPoint.z - obj.position.z);
    drag.startRotY = obj.rotation.y;
    document.body.style.cursor = 'ew-resize';
  } else {
    raycaster.ray.intersectPlane(dragPlane, hitPoint);
    drag.mode = 'move';
    grabOffset.set(hitPoint.x - obj.position.x, 0, hitPoint.z - obj.position.z);
    document.body.style.cursor = 'grabbing';
  }
  C.renderer.domElement.style.cursor = '';   // body cursor (grabbing / ew-resize) shows during the drag
  C.controls.enabled = false;
  e.preventDefault();
  e.stopPropagation();
}

// Plane the pointer ray is cast against for each drag mode
function dragPlaneFor(mode) {
  if (mode === 'light') return drag.lightPlane;
  if (mode === 'wall') return drag.wallPlane;
  if (mode.startsWith('surface')) return drag.surfacePlane;
  return dragPlane;
}
// Live-update the Properties pane while dragging, only if it already shows this item
function refreshInfo(obj) { if (S.infoObj === obj) showInfo(obj); }

function onMouseMove(e) {
  if (!drag.obj) return;
  if (e.buttons === 0) { onMouseUp(e); return; }
  const [BMIN, BMAX] = bounds();
  if (drag.mode === 'swivel') {
    const o = drag.obj;
    o.userData.arm.swivel = Math.round((drag.startSwivel + (e.clientX - drag.startX) * 0.5) / 5) * 5;
    updateArm(o);
    refreshInfo(o);
    return;
  }
  setPointerNDC(e.clientX, e.clientY);
  raycaster.setFromCamera(pointer, C.activeCamera);
  if (!raycaster.ray.intersectPlane(dragPlaneFor(drag.mode), hitPoint)) return;

  if (drag.mode.startsWith('surface')) {
    const o = drag.obj, local = o.parent.worldToLocal(hitPoint.clone());
    // Items on a table top: 10 mm steps, kept on the top. Free children (barrier poles): floor steps, anywhere.
    const free = !!o.userData.freeOnParent;
    const step = free ? SNAP : 0.01;
    if (drag.mode === 'surface-rotate') {
      const a = Math.atan2(local.x - o.position.x, local.z - o.position.z);
      o.rotation.y = Math.round((drag.startRotY + a - drag.startAngle) / ROT_SNAP) * ROT_SNAP;
    } else {
      o.position.x = Math.round((local.x - grabOffset.x) / step) * step;
      o.position.z = Math.round((local.z - grabOffset.z) / step) * step;
    }
    if (!free) clampToParentTop(o);
    refreshInfo(o);
    return;
  }
  if (drag.mode === 'wall') {
    const { wallMinZ, wallMaxZ } = drag.obj.userData;
    const nz = Math.round((hitPoint.z - grabOffset.z) / SNAP) * SNAP;
    drag.obj.position.z = THREE.MathUtils.clamp(nz, wallMinZ, wallMaxZ);
    refreshInfo(drag.obj);
    return;
  }
  if (drag.mode === 'light') {
    const [ymin, ymax] = S.project.room.lightY ?? [0.2, 4.0];
    const nx = Math.round((hitPoint.x - grabOffset.x) / SNAP) * SNAP;
    const ny = Math.round((hitPoint.y - grabOffset.y) / SNAP) * SNAP;
    drag.obj.position.x = THREE.MathUtils.clamp(nx, BMIN, BMAX);
    drag.obj.position.y = THREE.MathUtils.clamp(ny, ymin, ymax);
    refreshInfo(drag.obj);
    return;
  }
  if (drag.mode === 'rotate') {
    const a = Math.atan2(hitPoint.x - drag.obj.position.x, hitPoint.z - drag.obj.position.z);
    drag.obj.rotation.y = Math.round((drag.startRotY + (a - drag.startAngle)) / ROT_SNAP) * ROT_SNAP;
  } else {
    const { w, d } = drag.obj.userData;
    const cx = Math.round((hitPoint.x - grabOffset.x) / SNAP) * SNAP;
    const cz = Math.round((hitPoint.z - grabOffset.z) / SNAP) * SNAP;
    drag.obj.position.x = THREE.MathUtils.clamp(cx, BMIN + w / 2, BMAX - w / 2);
    drag.obj.position.z = THREE.MathUtils.clamp(cz, BMIN + d / 2, BMAX - d / 2);
  }
  refreshInfo(drag.obj);
}

function onMouseUp(e) {
  if (pressed && e && e.type === 'mouseup' &&
      Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < CLICK_TOL) {
    showInfo(pressed.target);       // click: select the item / booth, or clear on empty space
  }
  pressed = null;
  if (!drag.obj) return;
  saveLayout();
  endDrag();
}
export function endDrag() {
  drag.obj = null;
  drag.mode = 'none';
  pressed = null;
  if (C.controls) C.controls.enabled = true;
  document.body.style.cursor = '';
}

// Clamp floor items into the bounds (after loading a layout; anchored items are clamped to their parent)
export function clampAll() {
  const [BMIN, BMAX] = bounds();
  for (const m of S.furniture) {
    if (m.userData.parentId) continue;
    const { w, d } = m.userData;
    m.position.x = THREE.MathUtils.clamp(m.position.x, BMIN + w / 2, BMAX - w / 2);
    m.position.z = THREE.MathUtils.clamp(m.position.z, BMIN + d / 2, BMAX - d / 2);
  }
}

// Hover cursor (when not dragging): open hand on the selected, unlocked item (a drag moves it;
// Shift = rotate), pointing hand on other items (a click selects them), default elsewhere.
let hoverQueued = false;
function updateHoverCursor(e) {
  const canvas = C.renderer.domElement;
  if (drag.obj || !S.project || e.target !== canvas || (e.buttons & 1)) return;
  if (hoverQueued) return;
  hoverQueued = true;
  const { clientX, clientY, shiftKey } = e;
  requestAnimationFrame(() => {
    hoverQueued = false;
    if (drag.obj) return;
    const obj = pickFurniture(clientX, clientY);
    let cursor = '';
    if (obj && obj === S.infoObj && !obj.userData.locked) cursor = shiftKey && !obj.userData.isLight && obj.userData.wallX === undefined ? 'ew-resize' : 'grab';
    else if (obj) cursor = 'pointer';
    canvas.style.cursor = cursor;
  });
}

export function initInteraction() {
  const canvas = C.renderer.domElement;
  canvas.addEventListener('mousemove', updateHoverCursor);
  canvas.addEventListener('mouseleave', () => { canvas.style.cursor = ''; });
  canvas.addEventListener('mousedown', onMouseDown, { capture: true });
  // Double-click an item to lock / unlock it (locked items cannot be moved, rotated or adjusted)
  canvas.addEventListener('dblclick', (e) => {
    if (!S.project) return;
    const obj = pickFurniture(e.clientX, e.clientY);
    if (obj) setLocked(obj, !obj.userData.locked);
  });
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onMouseUp);
  document.addEventListener('visibilitychange', () => { if (document.hidden) onMouseUp(); });
}
