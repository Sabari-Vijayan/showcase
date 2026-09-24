# Wall, endlessly

A minimal white infinite poster gallery. Nine posters pinned to a room with
no edges — scroll in all four directions and the wall loops seamlessly.
Built with React 18 and Vite 5.

## Features

- Infinite 2D canvas: a 3-column Swiss grid rendered as repeating tiles with
  modulo wrapping, so panning loops at every border.
- Pan by dragging (with inertia), mouse / trackpad scroll on both axes, or
  arrow keys / WASD (Shift leaps further).
- Zoom from 0.35× to 2.5× via Ctrl/Cmd + scroll, two-finger pinch,
  double-click, `+` / `-` keys, or the on-screen − / % / + cluster.
  Zooming pins the point under the cursor.
- Viewport-dynamic fit: phones open at ~2 columns wide, desktops at 1:1.
  Rotating or resizing re-fits until you zoom manually; `%` hands back control.
- Click any poster for a reading view with prev / next (Escape closes).
- Gentle auto-drift while idle, pausable; wandered-pixel counter.
- Frosted-blur top bar (light fading scrim on mobile), touch-specific hints,
  thumb-friendly mobile controls, reduced-motion support.

## Quick start

Prerequisites: Node 18+ and npm.

```bash
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
npm run preview  # serve the production build
```

## Project structure

```
index.html            # entry, fonts (Instrument Serif + Inter)
vite.config.js        # Vite + React plugin
public/posters/       # poster image assets (served as-is)
src/main.jsx          # React entry
src/App.jsx           # canvas, pan/zoom engine, chrome, lightbox
src/index.css         # tokens, wall, chrome, responsive rules
```

## Adding or replacing posters

1. Drop the image file into `public/posters/`.
2. Add an entry to the `BASE` list at the top of `src/App.jsx`
   (`src`, `title`, `note`). Layout, captions, and the lightbox pick it up
   automatically.

## Customization knobs (`src/App.jsx`)

| Knob | What it does |
| ---- | ------------ |
| `MIN_GAP_X/Y`, `EXTRA_GAP_X/Y` | Random grid-gap range; minimums always hold |
| `MIN_Z`, `MAX_Z` | Zoom limits (0.35×–2.5×) |
| `fittingZoom` | Default zoom from viewport width (`width / 1050`) |
| `0.35 * dt` drift term | Idle auto-drift speed |
| `mulberry32(…)` seed | Re-roll the gap layout with a new seed |

## Deployment

`npm run build` emits static files to `dist/`. Serve that directory from any
static host (GitHub Pages, Netlify, Vercel, nginx). No server code or
environment variables needed.
