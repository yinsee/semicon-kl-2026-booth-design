# Exhibition Booths — 3D editor

Interactive WebGL booth editor built with Three.js. One app (`index.html`) opens several booth
projects; each booth is described in a JSON file and its furniture are shared GLB models.

## Usage

Open the app, pick a project on the start screen (or go straight to `index.html#/japan2026`,
`index.html#/semicon-kl2026`). The grid button at the top left returns to the project list.

- **Click** an item (in the 3D view or the Items list) to select it; drag the selected item to move it,
  **Shift + drag** to rotate (15° snap). Light bulbs move in X / Y, wall posters slide along their wall,
  items on a counter or table stay on it (Shift + drag on the monitor arm swivels it).
- **Double-click** locks / unlocks an item; the eye icon in the Items list shows / hides it.
- The Properties pane shows sizes, the lock switch, arm sliders and the screen / graphic pickers.
- Views: perspective, top, front, visitor (eye height, look around), iso. Guides: floor grid, height grid.
- **Ctrl/⌘ + Z** undoes; **Reset** clears this project's saved layout.

Changes are saved in the browser (`localStorage`, one key per project). The defaults come from
`defaultLayout` in the project JSON — edit that file to change them for everyone.

## Local preview

No build step. Serve the folder (the app loads JSON + GLB files with `fetch`):

```
python3 -m http.server 8000
```

then visit <http://localhost:8000>.

## Files

| Path | What |
|---|---|
| `index.html` | App shell: editor UI + project menu |
| `js/main.js`, `js/engine/*.js` | Router and editor engine |
| `projects/index.json` | Project list for the start screen |
| `projects/<id>.json` | One booth: room, walls, fascia, lights, views, screens, graphics, items, default layout |
| `assets/models/*.glb` + `manifest.json` | Shared furniture models + their footprint |
| `assets/screens/` | Screen content (videos, images) and the hologram video |
| `assets/posters/` | Poster graphics (A0) |
| `assets/backdrops/` | Backdrop banner graphics and wall backdrops |
| `assets/concepts/index.html` | Contact sheet of the poster + backdrop concepts |
| `tools/models/` | Model source (`factories.js`) and the GLB build (`build.py`) |
| `tools/screens/` | Animated dashboard page + `render_dashboard.py` (writes `assets/screens/dashboard.mp4`) |

To rebuild the GLB models after changing `tools/models/factories.js`:

```
python3 tools/models/build.py            # all models (needs Playwright + Chrome)
python3 tools/models/build.py tv-42 pc   # only some
```
