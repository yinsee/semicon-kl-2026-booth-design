# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Single-file interactive WebGL visualization of a 6 × 3 m exhibition booth built with Three.js (loaded from jsDelivr CDN via an import map). There is no build step or package manager — the entire app lives in `index.html`.

## Running

```
python3 -m http.server 8000   # then open http://localhost:8000
```

Opening `index.html` directly with `file://` also works because all imports resolve via CDN; no bundler, no npm install.

## Architecture

Three conceptual layers inside `index.html`:

1. **Static scene** — renderer, PMREM-baked `RoomEnvironment`, lights, floor (procedural carpet texture drawn onto a canvas), walls (`addWall`), pole + double-sided fascia, and the diagonal-banner-style signage. Dimensions live in module-level constants near the top (`ROOM_W`, `ROOM_D`, `WALL_H`, …).

2. **Furniture factories** — each factory function (`addBox`, `addConsole`, `addDisplayBox`, `addHuman`, `addStandingTV`, `addGlassCase`, `addCutoutFigure`, `addPointLight`, …) builds a `THREE.Group` (or `Mesh`), registers its `{ id, w, d, h, draggable }` in `userData`, applies any saved position/rotation from `savedLayout`, and pushes the root object into the module-level `furniture[]` array. Everything downstream (picking, dragging, persistence, bounds-clamping) is driven by iteration over `furniture[]` + `userData` flags — **add new items via this pattern, not ad-hoc**.

3. **Interaction + persistence** — one unified mouse-drag state machine (`drag` object + `onMouseDown` / `onMouseMove` / `onMouseUp`) with three modes:
   - `move` — raycast against `dragPlane` (XZ, y=0), snap to `SNAP` (0.1 m), clamp to `[BOUND_MIN, BOUND_MAX]` minus the object's half-extent.
   - `rotate` — triggered by **Shift + drag**; rotates around Y, snapped to `ROT_SNAP` (15°).
   - `light` — triggered automatically when the picked object has `userData.isLight`; uses a vertical XY plane so bulbs move in X and Y (Z is pinned to the initial value). The `PointLight` is parented to the bulb so it follows.

   Positions persist to `localStorage` under `STORAGE_KEY` on every drag-end via `saveLayout()`. `loadLayout()` falls back to the baked-in `DEFAULT_LAYOUT` constant when storage is empty — this is the mechanism behind the **Reset** button.

### Picking a grouped object

`pickFurniture()` calls `raycaster.intersectObjects(furniture, true)` (recursive) then walks up the parent chain until it hits something in the `furniture` set. This is why child meshes inside a `Group` (e.g. all the monitors of `console-1`) behave as one draggable unit. Any new factory that builds a composite object **must** push only the root group into `furniture[]`.

### Saved layout format

Per-item keys store `{ x, y, z, ry }` (center position + Y rotation). Non-light factories ignore `saved.y` (their Y is derived from geometry — e.g. `h/2` for boxes). Lights force `saved.z = initial z`. The on-load clamp loop at the bottom of the furniture section re-runs bounds-clamping in case a previously-saved item was dragged out before clamping was introduced.

### Animation

Per-frame rotation is opt-in: factories push the target mesh into `animatedItems[]`. The render loop (`tick`) rotates each at `ROT_PER_SEC` (1°/s) using a `THREE.Clock` delta.

## Adding a new furniture type

1. Write a factory function taking at minimum `{ id, x, z }`.
2. Build a `Group` (or single `Mesh`), set `userData = { id, w, d, h, draggable: true }`.
3. Restore from `savedLayout[id]` if present, otherwise position with the passed defaults.
4. `scene.add(group); furniture.push(group);`
5. Call the factory *after* `savedLayout` is declared (light factories are called late for this reason — don't move them back up).

## HUD

Buttons top-right (Perspective / Top / Front / Grid / Y grid / Reset) are wired in the final script block. The **Reset** button clears `STORAGE_KEY` from localStorage and `location.reload()`s — which then reads `DEFAULT_LAYOUT`.
