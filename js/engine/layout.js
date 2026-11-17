// Layout persistence (localStorage, one key per project) and undo.
// Saved per item: { x, y, z, ry } + screen / screens, local (anchored), arm, locked, hidden, graphic,
// barrier + barrierLoop (pole count and belt loop of an item with barrier poles).
// With nothing saved the project's `defaultLayout` is used (that is what Reset goes back to).
import { S } from './state.js';
import { setScreenEntry, setGraphic } from './media.js';
import { updateArm, setBarrierCount, setBarrierLoop } from './items.js';
import { drag } from './interact.js';
import { showInfo, updateStatus, buildItemList } from './ui.js';

const UNDO_LIMIT = 50;
const storageKey = () => S.project.meta.storageKey;

export function loadLayout() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) return JSON.parse(raw);
  } catch {}
  return structuredClone(S.project.defaultLayout ?? {});
}

export function clearLayout() { localStorage.removeItem(storageKey()); }

export function saveLayout() {
  const data = {};
  for (const m of S.furniture) {
    const e = data[m.userData.id] = {
      x: +m.position.x.toFixed(3),
      y: +m.position.y.toFixed(3),
      z: +m.position.z.toFixed(3),
      ry: +m.rotation.y.toFixed(4),
    };
    const screens = m.userData.screens;
    if (screens?.length === 1) e.screen = screens[0].key;
    else if (screens?.length > 1) e.screens = screens.map(s => s.key);
    if (m.userData.parentId) e.local = true; // coords are relative to the parent
    if (m.userData.arm) e.arm = { ...m.userData.arm };
    if (m.userData.locked) e.locked = true;
    if (!m.visible) e.hidden = true;
    if (m.userData.graphic) e.graphic = m.userData.graphic;
    if (m.userData.barrier) { e.barrier = m.userData.barrier.count; e.barrierLoop = m.userData.barrier.closed; }
  }
  recordUndo(data);
  try { localStorage.setItem(storageKey(), JSON.stringify(data)); } catch {}
}

// Every saveLayout() compares the new state with the last saved one; if it differs, the
// previous state goes onto the undo stack. Undo restores that state into the scene.
function recordUndo(data) {
  const json = JSON.stringify(data);
  if (S.lastSavedJson !== null && json !== S.lastSavedJson) {
    S.undoStack.push(S.lastSavedJson);
    if (S.undoStack.length > UNDO_LIMIT) S.undoStack.shift();
  }
  S.lastSavedJson = json;
  syncUndoUi();
}
export function syncUndoUi() {
  const btn = document.getElementById('undo');
  if (btn) btn.disabled = S.undoStack.length === 0;
  const st = document.getElementById('status-undo');
  if (st) st.textContent = `Undo: ${S.undoStack.length}`;
}

export function undo() {
  if (!S.project || !S.undoStack.length || drag.obj) return;
  const prevJson = S.undoStack.pop();
  applyLayoutState(JSON.parse(prevJson));
  S.lastSavedJson = prevJson;                      // restoring is not a new change
  try { localStorage.setItem(storageKey(), prevJson); } catch {}
  syncUndoUi();
  buildItemList();                                 // the barrier pole count may have changed
  if (S.infoObj) { const o = S.infoObj; S.infoObj = null; showInfo(o); } // rebuild panel with restored values
  else updateStatus();
}

function applyLayoutState(state) {
  // Pole count first: it adds / removes poles from S.furniture
  for (const m of [...S.furniture]) {
    const n = state[m.userData.id]?.barrier;
    if (m.userData.barrier && n && n !== m.userData.barrier.count) setBarrierCount(m, n);
    const loop = state[m.userData.id]?.barrierLoop;
    if (m.userData.barrier && loop !== undefined && loop !== m.userData.barrier.closed) setBarrierLoop(m, loop);
  }
  for (const m of S.furniture) {
    const st = state[m.userData.id];
    if (!st) continue;
    m.position.set(st.x, st.y, st.z);
    m.rotation.y = st.ry ?? 0;
    const screens = m.userData.screens ?? [];
    if (st.screen && screens.length === 1) setScreenEntry(screens[0], st.screen);
    if (st.screens) st.screens.forEach((k, i) => screens[i] && setScreenEntry(screens[i], k));
    if (st.arm && m.userData.arm) { Object.assign(m.userData.arm, st.arm); updateArm(m); }
    m.userData.locked = !!st.locked;
    m.visible = !st.hidden;
    if (st.graphic && m.userData.graphicMat) setGraphic(m, st.graphic);
  }
}
