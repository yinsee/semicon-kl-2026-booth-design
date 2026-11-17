// Shared mutable state of the open project. Reset by engine.closeProject().
// (Long-lived objects — renderer, cameras, controls, composer — live in core.js as `C`.)
export const S = {
  project: null,        // parsed projects/<id>.json
  scene: null,          // THREE.Scene of the open project
  booth: null,          // booth shell group (id 'booth', always locked)
  names: new Map(),     // item id → display name
  icons: new Map(),     // item id → icon key
  furniture: [],        // draggable roots, in build order (parents before children)
  animatedItems: [],    // meshes rotated each frame (role 'spin')
  queues: [],           // [{ a, b, strap }] barrier pole pairs + their belt mesh
  savedLayout: {},      // layout read at open (localStorage or project.defaultLayout)
  undoStack: [],
  lastSavedJson: null,
  infoObj: null,        // item shown in the Properties pane
  hoverObj: null,       // item hovered in the Items list
  grid: null, yGrid: null, axes: null,
  cubeCam: null, cubeRT: null, frame: 0,
};

export function resetState() {
  Object.assign(S, {
    project: null, scene: null, booth: null, furniture: [], animatedItems: [], queues: [],
    savedLayout: {}, undoStack: [], lastSavedJson: null, infoObj: null, hoverObj: null,
    grid: null, yGrid: null, axes: null, cubeCam: null, cubeRT: null, frame: 0,
  });
  S.names = new Map();
  S.icons = new Map();
}
