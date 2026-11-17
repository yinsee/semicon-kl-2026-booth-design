// Editor UI (Japan 2026 standard): Items pane (groups, mini rail, lock / visibility, hover outline),
// Properties pane (dimensions, lock, arm sliders, graphic + screen pickers), status bar, view presets
// (perspective / top / front / visitor look), iso + guide toggles, undo, reset.
import * as THREE from 'three';
import { C, LOOK_RADIUS, setControlMode, toggleIsoCamera } from './core.js';
import { S } from './state.js';
import { ARM_LIMITS, updateArm, findItem, barrierOwner, setBarrierCount, setBarrierLoop } from './items.js';
import { saveLayout, undo, clearLayout } from './layout.js';
import { setScreenEntry, setGraphic } from './media.js';

const $ = (id) => document.getElementById(id);
const mm = v => Math.round(v * 1000);
const VIEWS = ['persp', 'top', 'front', 'visitor'];

// ---------------- Icons ----------------
const svgIcon = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  booth:    svgIcon('<path d="M3 20V6l9-3 9 3v14"/><path d="M3 20h18M7 20V9h10v11"/>'),
  light:    svgIcon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'),
  poster:   svgIcon('<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  fan:      svgIcon('<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-7 4-7 2 0 3 2 1 4l-3 3M14 12c4 0 7 1 7 4 0 2-2 3-4 1l-3-3M12 14c0 4-1 7-4 7-2 0-3-2-1-4l3-3M10 12c-4 0-7-1-7-4 0-2 2-3 4-1l3 3"/>'),
  counter:  svgIcon('<rect x="3" y="7" width="18" height="13" rx="1"/><path d="M3 11h18"/><circle cx="12" cy="15.5" r="1.5"/>'),
  banner:   svgIcon('<rect x="4" y="3" width="16" height="13" rx="1"/><path d="M6 21l2-5M18 21l-2-5M8 7h8M8 11h5"/>'),
  pole:     svgIcon('<path d="M6 4v15M18 4v15M4 21h4M16 21h4"/><path d="M6 7h12"/>'),
  box3d:    svgIcon('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'),
  monitor:  svgIcon('<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M12 16v4M8 20h8"/>'),
  watch:    svgIcon('<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 7l1-4h4l1 4M9 17l1 4h4l1-4"/><path d="M12 10v2l1.5 1"/>'),
  table:    svgIcon('<ellipse cx="12" cy="7" rx="9" ry="3"/><path d="M12 10v9M8 21h8"/>'),
  brochures:svgIcon('<path d="M4 6h11v14H4z"/><path d="M8 3h12v14"/><path d="M7 10h5M7 14h5"/>'),
  chair:    svgIcon('<path d="M7 3v9h10V3M6 12h12M8 12l-2 9M16 12l2 9M9 16h6"/>'),
  tv:       svgIcon('<rect x="3" y="4" width="18" height="11" rx="1"/><path d="M12 15v5M8 21h8"/>'),
  oven:     svgIcon('<rect x="5" y="3" width="14" height="18" rx="1"/><rect x="8" y="6" width="8" height="4" rx=".5"/><path d="M8 14h8M8 17h8"/>'),
  console:  svgIcon('<path d="M3 6l5-2v9l-5 2zM9.5 4h5v9h-5zM21 6l-5-2v9l5 2z"/><path d="M12 13v7M8 20h8"/>'),
  display:  svgIcon('<rect x="8" y="10" width="8" height="11"/><rect x="7" y="3" width="10" height="7" rx=".5"/><rect x="10" y="6" width="4" height="3"/>'),
  human:    svgIcon('<circle cx="12" cy="5" r="2.2"/><path d="M12 8v7M8 11l4-2 4 2M10 21l2-6 2 6"/>'),
  box:      svgIcon('<rect x="4" y="9" width="16" height="11" rx="1"/><rect x="8" y="3" width="8" height="6" rx=".5"/>'),
};
const DEFAULT_ICON = svgIcon('<rect x="4" y="4" width="16" height="16" rx="2"/>');
const LOCK_ICON   = svgIcon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>');
const UNLOCK_ICON = svgIcon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>');
const EYE_ICON     = svgIcon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
const EYE_OFF_ICON = svgIcon('<path d="M2 12s3.5-7 10-7c2 0 3.8.7 5.2 1.6M22 12s-3.5 7-10 7c-2 0-3.8-.7-5.2-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>');
function itemIcon(id) { return ICONS[id === 'booth' ? 'booth' : S.icons.get(id)] ?? DEFAULT_ICON; }
function itemName(obj) { return obj.userData.isBooth ? 'Booth shell' : (S.names.get(obj.userData.id) ?? obj.userData.id); }

// ---------------- Properties pane ----------------
export function showInfo(obj) {
  const infoEl = $('info');
  if (!obj || !S.project) {
    S.infoObj = null;
    infoEl.innerHTML = '<div class="empty">Click an item in the booth or in the Items list.</div>';
    updateStatus();
    return;
  }
  const { w, d, h, isLight } = obj.userData;
  const p = obj.position;
  let deg = Math.round(THREE.MathUtils.radToDeg(obj.rotation.y)) % 360;
  if (deg < 0) deg += 360;
  let rows;
  if (obj.userData.isBooth) {
    rows = [['Width', `${mm(w)} mm`], ['Depth', `${mm(d)} mm`], ['Wall height', `${mm(h)} mm`], ...(S.project.boothInfo ?? [])];
  } else if (isLight) {
    rows = [['Position X', `${mm(p.x)} mm`], ['Height', `${mm(p.y)} mm`]];
  } else {
    rows = [['Width', `${mm(w)} mm`], ['Depth', `${mm(d)} mm`], ['Height', `${mm(h)} mm`],
            [positionLabel(obj), `${mm(p.x)}, ${mm(p.z)} mm`],
            ['Rotation', `${deg}°`]];
  }
  const rowsHtml = rows.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('');

  // Same item (e.g. during a drag): only refresh the numbers, keep the dropdowns intact
  if (obj === S.infoObj) {
    infoEl.querySelector('.rows').innerHTML = rowsHtml;
    syncLockToggle(obj);
    updateStatus();
    infoEl.querySelectorAll('input[data-arm]').forEach(inp => {
      inp.disabled = !!obj.userData.locked;
      inp.value = obj.userData.arm[inp.dataset.arm];
      inp.nextElementSibling.textContent = `${inp.value}°`;
    });
    return;
  }
  S.infoObj = obj;
  infoEl.innerHTML = `<div class="name">${itemName(obj)}</div><div class="rows">${rowsHtml}</div>
    <label class="row lock-row"><span>Lock</span>
      <span class="switch"><input type="checkbox" class="lock-toggle"><span class="slider"></span></span>
    </label>`;
  infoEl.querySelector('.lock-toggle').onchange = (ev) => setLocked(obj, ev.target.checked);
  syncLockToggle(obj);
  if (obj.userData.arm) {
    const labels = { swivel: 'Swivel', a1: 'Arm 1 ↕', a2: 'Arm 2 ↕' };
    for (const [key, [min, max]] of Object.entries(ARM_LIMITS)) {
      const row = document.createElement('div');
      row.className = 'row arm';
      row.innerHTML = `<span>${labels[key]}</span><input type="range" min="${min}" max="${max}" step="5" data-arm="${key}"><span class="val"></span>`;
      const inp = row.querySelector('input'), val = row.querySelector('.val');
      inp.value = obj.userData.arm[key];
      inp.disabled = !!obj.userData.locked;
      val.textContent = `${inp.value}°`;
      inp.oninput = () => { obj.userData.arm[key] = +inp.value; updateArm(obj); val.textContent = `${inp.value}°`; showInfo(obj); };
      inp.onchange = () => saveLayout();
      infoEl.append(row);
    }
  }
  if (obj.userData.graphicSources) {
    const sel = document.createElement('select');
    sel.title = 'Print graphic';
    for (const [key, src] of Object.entries(obj.userData.graphicSources)) sel.add(new Option(src.label, key));
    sel.value = obj.userData.graphic;
    sel.onchange = () => { setGraphic(obj, sel.value); saveLayout(); };
    infoEl.append(labelRow('Graphic'), sel);
  }
  const screens = obj.userData.screens ?? [];
  for (const entry of screens) {
    const sel = document.createElement('select');
    sel.title = 'Screen content';
    for (const [key, src] of Object.entries(S.project.screenSources)) sel.add(new Option(src.label, key));
    sel.value = entry.key;
    sel.onchange = () => { setScreenEntry(entry, sel.value); saveLayout(); };
    infoEl.append(labelRow(screens.length > 1 ? entry.label : 'Screen'), sel);
  }
  const owner = barrierOwner(obj);
  if (owner) {
    // Barrier pole count (2..4): poles are added / removed and the belts re-joined automatically
    const B = owner.userData.barrier;
    const sel = document.createElement('select');
    sel.title = 'Number of barrier poles';
    for (let n = B.min; n <= B.max; n++) sel.add(new Option(`${n} poles`, n));
    sel.value = B.count;
    sel.onchange = () => {
      setBarrierCount(owner, +sel.value);
      saveLayout();
      buildItemList();
      const keep = S.furniture.includes(obj) ? obj : owner;   // a removed pole hands the panel to its owner
      S.infoObj = null;
      showInfo(keep);
    };
    infoEl.append(labelRow('Barrier poles'), sel);
    // Loop the strap back to the first pole (3+ poles only)
    const loopRow = document.createElement('label');
    loopRow.className = 'row lock-row';
    loopRow.title = B.count < 3 ? 'Needs 3 or more poles' : 'Join the last pole back to the first';
    loopRow.innerHTML = `<span>Loop strap</span>
      <span class="switch"><input type="checkbox" class="loop-toggle"><span class="slider"></span></span>`;
    const loop = loopRow.querySelector('input');
    loop.checked = B.closed;
    loop.disabled = B.count < 3;
    loop.onchange = () => { setBarrierLoop(owner, loop.checked); saveLayout(); };
    infoEl.append(loopRow);
  }
  updateStatus();
}
function positionLabel(obj) {
  if (!obj.userData.parentId) return 'Position';
  return obj.userData.freeOnParent ? 'Position (relative)' : 'Position on table';
}
function labelRow(text) {
  const el = document.createElement('div');
  el.className = 'row';
  el.innerHTML = `<span>${text}</span>`;
  return el;
}
function syncLockToggle(obj) {
  const t = $('info').querySelector('.lock-toggle');
  if (t) { t.checked = !!obj.userData.locked; t.disabled = !!obj.userData.isBooth; }
  $('info').querySelectorAll('input[data-arm]').forEach(inp => { inp.disabled = !!obj.userData.locked; });
}
function setVisible(obj, visible) {
  if (obj.userData.isBooth) return;
  obj.visible = visible;                     // children (items on a counter / table) hide with it
  saveLayout();
  if (!visible && S.infoObj === obj) showInfo(null); else updateStatus();
}
export function setLocked(obj, locked) {
  if (obj.userData.isBooth) return;          // the booth is always locked
  obj.userData.locked = locked;
  saveLayout();
  showInfo(obj);
}

// ---------------- Items pane ----------------
// Groups (separated by a divider) come from project.groups; items anchored to a parent are indented
// under it; items not named in a group go last.
export function buildItemList() {
  const listEl = $('item-list');
  listEl.innerHTML = '';
  if (!S.project) return;
  const byId = new Map(S.furniture.map(f => [f.userData.id, f]));
  byId.set('booth', S.booth);
  const groupsCfg = S.project.groups ?? [];
  const listed = new Set(groupsCfg.flat());
  const groups = groupsCfg.map(ids => ids.map(id => byId.get(id)).filter(Boolean));
  groups.push(S.furniture.filter(f => !listed.has(f.userData.id)));
  if (!listed.has('booth')) groups.unshift([S.booth]);   // a group may include "booth" to share its section
  groups.filter(g => g.length).forEach((group, gi) => {
    if (gi > 0) {
      const sep = document.createElement('li');
      sep.className = 'sep';
      listEl.append(sep);
    }
    for (const obj of group) addItemRow(listEl, obj);
  });
}
function addItemRow(listEl, obj) {
  const li = document.createElement('li');
  if (obj.userData.parentId) li.classList.add('child');
  li.dataset.id = obj.userData.id;
  li.title = itemName(obj);
  li.innerHTML = `<span class="ic">${itemIcon(obj.userData.id)}</span><span class="nm">${itemName(obj)}</span><span class="vis"></span><span class="lk"></span>`;
  li.onclick = () => showInfo(obj);
  li.ondblclick = () => setLocked(obj, !obj.userData.locked);          // double-click toggles lock
  const lk = li.querySelector('.lk');
  lk.title = 'Lock / unlock';
  lk.onclick = (e) => { e.stopPropagation(); setLocked(obj, !obj.userData.locked); };
  lk.ondblclick = (e) => e.stopPropagation();
  const vis = li.querySelector('.vis');
  vis.title = 'Show / hide';
  vis.onclick = (e) => { e.stopPropagation(); setVisible(obj, !obj.visible); };
  vis.ondblclick = (e) => e.stopPropagation();
  li.onmouseenter = () => { S.hoverObj = obj; updateOutline(); };   // silhouette highlight in the 3D view
  li.onmouseleave = () => { S.hoverObj = null; updateOutline(); };
  listEl.append(li);
}
// Silhouette outline: the selected item (or booth) plus the item hovered in the Items list
function updateOutline() {
  C.outlinePass.selectedObjects = [...new Set([S.infoObj, S.hoverObj])].filter(o => o && o.visible);
}
export function updateStatus() {
  layoutPanes();
  if (!S.project) return;
  updateOutline();
  for (const li of $('item-list').querySelectorAll('li[data-id]')) {
    const obj = li.dataset.id === 'booth' ? S.booth : findItem(li.dataset.id);
    li.classList.toggle('selected', obj === S.infoObj);
    li.querySelector('.lk').innerHTML = obj?.userData.locked ? LOCK_ICON : UNLOCK_ICON;
    li.classList.toggle('locked', !!obj?.userData.locked);
    // A child is effectively hidden when its parent (counter / table) is hidden
    const parentHidden = !!obj?.userData.parentId && obj.parent?.visible === false;
    const ownHidden = obj?.visible === false;
    li.querySelector('.vis').innerHTML = ownHidden || parentHidden ? EYE_OFF_ICON : EYE_ICON;
    li.classList.toggle('hidden-item', ownHidden);
    li.classList.toggle('parent-hidden', parentHidden && !ownHidden);
  }
  const selEl = $('status-sel');
  if (S.infoObj) {
    const { w, d, h, locked } = S.infoObj.userData;
    selEl.innerHTML = `<span class="sel">${itemName(S.infoObj)}</span> · ${mm(w)} × ${mm(d)} × ${mm(h)} mm${locked ? ` · <span class="lock-tag">${LOCK_ICON} locked</span>` : ''}`;
  } else {
    selEl.textContent = 'No item selected';
  }
  const lockedCount = S.furniture.filter(f => f.userData.locked).length;
  $('status-items').textContent = `${S.furniture.length} items · ${lockedCount} locked`;
  $('status-undo').textContent = `Undo: ${S.undoStack.length}`;
}

// ---------------- Docked panes ----------------
// Left (Items): expanded or minimized to an icon rail (remembered per browser).
// Right (Properties): shown only while something is selected; ✕ deselects. It overlays the viewport.
const UI_KEY = 'exhibition-ui-v1';
function loadUi() { try { return JSON.parse(localStorage.getItem(UI_KEY)) || JSON.parse(localStorage.getItem('exhibition-japan2026-ui-v1')) || {}; } catch { return {}; } }
function saveUi(ui) { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch {} }
const LEFT_W = 240, LEFT_MINI_W = 48;
let leftMini = !!loadUi().leftMini;
function layoutPanes() {
  $('pane-left').classList.toggle('mini', leftMini);
  $('toggle-left').classList.toggle('active', !leftMini);
  document.documentElement.style.setProperty('--left-w', (leftMini ? LEFT_MINI_W : LEFT_W) + 'px');
  $('pane-right').classList.toggle('off', !S.infoObj);
}

// ---------------- Views ----------------
// Visitor view: eye height 1.7 m, in front of the project's visitor item (follows where it is and
// which way it faces), first looking at it. Drag turns the head (look mode).
function visitorPreset() {
  const v = S.project.views.visitor;
  const item = findItem(v.item);
  const f = item.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(Math.sin(item.rotation.y), 0, Math.cos(item.rotation.y)); // front = local +Z
  const pos = f.clone().addScaledVector(fwd, v.dist);
  return { pos: [pos.x, v.eyeY, pos.z], target: new THREE.Vector3(f.x, v.targetY, f.z) };
}
export function setView(name) {
  if (!S.project) return;
  if (C.activeCamera !== C.camera) $('toggle-iso').click(); // presets use the perspective camera
  if (name === 'visitor' && S.project.views.visitor && findItem(S.project.views.visitor.item)) {
    const p = visitorPreset();
    const eye = new THREE.Vector3(...p.pos);
    C.camera.position.copy(eye);
    C.controls.target.copy(eye).addScaledVector(p.target.clone().sub(eye).normalize(), LOOK_RADIUS);
    setControlMode('look');
  } else {
    setControlMode('orbit');
    C.camera.position.set(...S.project.views[name]);
    C.controls.target.copy(C.center);
  }
  C.controls.update();
  VIEWS.forEach(n => $('view-' + n).classList.toggle('active', n === name));
}

// Per-project top bar: brand, document title, visitor view availability, guide toggles back to default
export function applyProjectUi(project) {
  document.title = `${project.meta.title} — Booth`;
  document.querySelector('#topnav .brand b').textContent = project.meta.title;
  document.querySelector('#topnav .brand span').textContent = project.meta.subtitle ?? 'Booth design';
  const v = project.views.visitor;
  $('view-visitor').style.display = v ? '' : 'none';
  if (v?.tooltip) $('view-visitor').title = v.tooltip;
  $('toggle-grid').classList.add('active');
  $('toggle-ygrid').classList.remove('active');
  $('toggle-iso').classList.remove('active');
}

export function initUi() {
  $('toggle-left').onclick = () => { leftMini = !leftMini; saveUi({ ...loadUi(), leftMini }); layoutPanes(); };
  $('close-props').onclick = () => showInfo(null);
  $('undo').onclick = undo;
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      e.preventDefault();
      undo();
    }
  });
  VIEWS.forEach(n => { $('view-' + n).onclick = () => setView(n); });
  $('toggle-grid').onclick = () => {
    if (!S.grid) return;
    S.grid.visible = !S.grid.visible;
    for (const obj of S.furniture) if (obj.userData.isLight) obj.material.visible = S.grid.visible;
    $('toggle-grid').classList.toggle('active', S.grid.visible);
  };
  $('toggle-ygrid').onclick = () => {
    if (!S.yGrid) return;
    S.yGrid.visible = !S.yGrid.visible;
    $('toggle-ygrid').classList.toggle('active', S.yGrid.visible);
  };
  $('toggle-iso').onclick = () => {
    const on = toggleIsoCamera();
    $('toggle-iso').classList.toggle('active', on);
    // The view presets belong to the perspective camera: none is current in Iso, and after leaving
    // Iso the camera is wherever it was, so clear their highlight either way.
    VIEWS.forEach(n => $('view-' + n).classList.remove('active'));
  };
  $('reset-layout').onclick = () => {
    if (!S.project || !confirm('Clear saved layout and reload with the default positions?')) return;
    clearLayout();
    location.reload();
  };
  layoutPanes();
}
