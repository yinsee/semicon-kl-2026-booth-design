# Exhibition Booth — 3D Floor Plan

Interactive WebGL visualization of a 6 × 3 m exhibition booth, built with Three.js.

## Usage

Drag objects on the floor; **Shift + drag** to rotate (15° snap). Drag the light bulbs to move them in X / Y. Click **Export** in the top-right to copy the current layout JSON to the clipboard.

Positions are saved to `localStorage` (`exhibition-booth-layout-v1`); `DEFAULT_LAYOUT` in `index.html` is used when no save exists.

## Local preview

No build step — just open `index.html` in a browser, or:

```
python3 -m http.server 8000
```

then visit <http://localhost:8000>.
