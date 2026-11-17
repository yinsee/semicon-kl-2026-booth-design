# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Single-page WebGL booth editor (Three.js r161 from jsDelivr via an import map, ES modules, no build
step, no package manager). `index.html` shows a project menu; `#/<id>` opens `projects/<id>.json` in the
editor. The editor UI and behaviour are the former `japan2026.html` editor ("Japan UI" is the standard).
`japan2026.html` is only a redirect to `index.html#/japan2026`.

## Running

```
python3 -m http.server 8000   # then open http://localhost:8000
```
A server is required (`fetch` of JSON / GLB); `file://` does not work.

## Architecture

```
index.html              UI shell (top bar, Items pane, Properties pane, status bar, menu) + import map
js/main.js              hash router: #/ → menu (projects/index.json), #/<id> → openProject()
js/engine/engine.js     initEngine() once; openProject(json) / closeProject()
js/engine/core.js       C: renderer, perspective + iso cameras, OrbitControls (orbit / visitor 'look'),
                        composer (RenderPass → OutlinePass → OutputPass), resize, render loop
js/engine/state.js      S: state of the open project (scene, booth, furniture[], queues, undo, selection)
js/engine/shell.js      booth shell + lights + guides from JSON; disposeScene()
js/engine/models.js     manifest.json + GLB cache; addModel(root, name, onReady(roles, model))
js/engine/items.js      items from JSON: lights, floor items, wall items, anchored items (placeOnSurface),
                        monitor arm (updateArm), queue belts (updateQueueStraps)
js/engine/media.js      screen / graphic / hologram textures + video elements; canvas textures (carpet, fascia)
js/engine/layout.js     localStorage load / save, undo, applyLayoutState
js/engine/interact.js   picking + drag modes (move, rotate, light, wall, surface, surface-rotate, swivel)
js/engine/ui.js         Items list, Properties pane, status bar, panes, views, toggles, reset
```
Modules import each other in a cycle (core ↔ items, layout ↔ ui ↔ interact); this is fine because no
module uses another at top level — keep it that way (only declarations at module top level).

### Open order (engine.openProject) — keep it
layout → `buildScene` (shell, guides) → `buildItems` (parents before children, then queue belts) →
locked / hidden from layout → `clampAll` → `saveLayout()` (undo baseline, no undo entry) → cameras + default
view → Items list + empty Properties. `closeProject` disposes the scene (except cloned GLB data, which the
model cache shares), stops / removes project videos and resets `S`.

### Project JSON (`projects/<id>.json`)
`meta` (title, subtitle, storageKey) · `room` (w, d, h, wallT, bounds, lightY) · `scene` (background, fog,
hemi, sun) · `floor` (carpet style `mid-grey` | `charcoal`, tint, bump) · `walls[]` (size, position, color,
`faces` → backdrop image per face `+x/-x/+y/-y/+z/-z`) · `fascias[]` (`logo-box` | `navy-plane`) · `poles[]` ·
`reflections` (CubeCamera for `envmap` items) · `boothInfo` (Properties rows for the booth) · `guides` ·
`views` (default, center, iso, persp/top/front positions, visitor item) · `screenSources` ·
`graphicSources` (named sets; `{ image }` or `{ canvas }`) · `queues` (pole id chains, `closed`) ·
`groups` (Items pane sections; may include "booth" to share the booth shell section) · `items[]` · `defaultLayout` (used when localStorage is empty / after Reset).

Item fields: `id`, `name`, `icon` (key in `ICONS`, ui.js), `model`, `at {x,z,ry}`, `parent`, `light`, `wall`,
`graphic`, `screen` / `screens[]`, `arm`, `hologram`, `spin`, `spotlight`, `envmap` (see items.js header).
Saved layout per item: `{ x, y, z, ry }` + `screen` / `screens`, `local`, `arm`, `locked`, `hidden`, `graphic`.

### Models (`assets/models/`)
Furniture geometry lives only in `tools/models/factories.js` (pure builders → `VARIANTS`). Parts the page
drives at runtime are tagged in `userData` (exported as glTF extras): `role` = `screen` / `screen0..n` /
`print` / `holo` / `spin` / `envmap`, plus `noPick`, `noShadow`; monitor-arm joints are named
`arm_swivel / arm_seg1 / arm_seg2 / arm_head`. `python3 tools/models/build.py` (Playwright + Chrome, via
`save_server.py` PUT endpoint) writes `<name>.glb` and `manifest.json` (`{ w, d, h, … }` footprint per
model; entries not in `VARIANTS`, e.g. `unysis9r` from CAD, are kept). Model origin: floor level, centred,
front = +Z (wall poster: centred on its mid-height).

## Adding things
- **New project:** add `projects/<id>.json` (copy one) + an entry in `projects/index.json` (+ thumbnail in
  `assets/thumbs/`). Use a new `meta.storageKey`.
- **New furniture model:** builder + `VARIANTS` entry in `tools/models/factories.js` → full
  `python3 tools/models/build.py` (writes the GLB and its `{ w, d, h }` manifest entry; a partial build
  `build.py <name>` leaves the manifest unchanged) → reference with `"model": "<name>"` in an item.
  External GLBs (CAD): copy to `assets/models/` and add the manifest entry by hand.
- **New item behaviour:** tag the part in the builder (`userData.role`), handle it in `items.js`
  `buildModelItem` (`addModel` onReady) and, if it is saved, in `layout.js` save / apply.
