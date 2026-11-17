// Engine entry point: init once, then open / close projects (projects/<id>.json).
// Open order matters (same as the original single-file editor):
//   layout → scene + booth shell → items (parents before children) → locked / hidden → clamp
//   → saveLayout() baseline (no undo entry) → camera + view → Items list + empty Properties.
import { C, initCore, setScene, placeCameras, bindControls } from './core.js';
import { S, resetState } from './state.js';
import { loadManifest } from './models.js';
import { buildScene, disposeScene } from './shell.js';
import { buildItems } from './items.js';
import { loadLayout, saveLayout, syncUndoUi } from './layout.js';
import { initInteraction, clampAll, endDrag } from './interact.js';
import { initUi, buildItemList, showInfo, setView, applyProjectUi } from './ui.js';
import { disposeMedia } from './media.js';

let ready = null;
export function initEngine() {
  ready ??= (async () => {
    initCore();
    initInteraction();
    initUi();
    await loadManifest();
  })();
  return ready;
}

export async function openProject(project) {
  await initEngine();
  closeProject();
  S.project = project;
  S.savedLayout = loadLayout();
  const scene = buildScene(project);
  buildItems(project);
  for (const m of S.furniture) {
    m.userData.locked = !!S.savedLayout[m.userData.id]?.locked;
    m.visible = !S.savedLayout[m.userData.id]?.hidden;
  }
  clampAll();
  saveLayout();          // seeds the undo baseline
  syncUndoUi();

  if (C.activeCamera !== C.camera) { C.activeCamera = C.camera; bindControls(C.camera); C.renderPass.camera = C.outlinePass.renderCamera = C.camera; }
  placeCameras(project.views);
  setScene(scene);
  applyProjectUi(project);
  setView(project.views.default ?? 'front');
  buildItemList();
  showInfo(null);
}

export function closeProject() {
  if (!S.project) return;
  endDrag();
  const scene = S.scene;
  setScene(null);
  disposeScene(scene);
  disposeMedia();
  resetState();
  buildItemList();
  showInfo(null);
}
