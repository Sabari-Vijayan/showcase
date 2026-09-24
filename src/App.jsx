import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/*
 * Design plan (frontend-design skill, reviewed against brief)
 * - Palette: pure white #ffffff, ink #161616, muted #8b8b87, hairline #e9e9e6.
 *   Monochrome keeps the posters loud.
 * - Type: Instrument Serif italic for voice + Inter for UI.
 * - Layout: strict Swiss grid (3 cols x 3 top-aligned rows). Gaps are randomly
 *   varied per reload but clamped to a minimum so nothing ever crowds.
 * - Boldness in one place only: the endless 4-way drift + zoom. Chrome stays quiet.
 */

const MIN_Z = 0.35
const MAX_Z = 2.5

// Deterministic RNG so every tile copy uses identical gaps (required for looping).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BASE = [
  { src: 'posters/justice_lady_session.png', title: 'Justice lady session', note: 'Talk · portrait format' },
  { src: 'posters/chess-tournament.png', title: 'Chess tournament', note: 'Bracket night' },
  { src: 'posters/linux.png', title: 'Linux install fest', note: 'Small square print' },
  { src: 'posters/o-pen-mic-1.png', title: 'Open mic no. 1', note: 'Evening series' },
  { src: 'posters/howtodesign.jpg', title: 'How to design', note: 'Workshop poster' },
  { src: 'posters/fyc.png', title: 'Find your club', note: 'Recruitment week' },
  { src: 'posters/chess-inter.jpg', title: 'Inter chess meet', note: 'Friendly · photo' },
  { src: 'posters/A_Policy_And_Governance.png', title: 'Policy and governance', note: 'Reading group' },
  { src: 'posters/useless-winner.png', title: 'Useless winner', note: 'Closing night' },
]

// Roomy random gaps with a guaranteed floor. Computed once at module scope so
// all 3x3 (or 5x5) tile copies share the exact same layout -> seamless loop.
const COL_W = 420
const ROW_H = 680
const MARGIN = 70
const MIN_GAP_X = 150
const EXTRA_GAP_X = 130 // gaps land in [150, 280]
const MIN_GAP_Y = 150
const EXTRA_GAP_Y = 160 // gaps land in [150, 310]

const _rng = mulberry32(20260924)
const _gx = [MIN_GAP_X + _rng() * EXTRA_GAP_X, MIN_GAP_X + _rng() * EXTRA_GAP_X]
const _gy = [MIN_GAP_Y + _rng() * EXTRA_GAP_Y, MIN_GAP_Y + _rng() * EXTRA_GAP_Y]
const _xs = [MARGIN, MARGIN + COL_W + _gx[0], MARGIN + 2 * COL_W + _gx[0] + _gx[1]]
const _ys = [MARGIN, MARGIN + ROW_H + _gy[0], MARGIN + 2 * ROW_H + _gy[0] + _gy[1]]

const TILE_W = Math.round(_xs[2] + COL_W + MARGIN)
const TILE_H = Math.round(_ys[2] + ROW_H + MARGIN)

const POSTERS = BASE.map((p, i) => ({
  ...p,
  x: Math.round(_xs[i % 3]),
  y: Math.round(_ys[Math.floor(i / 3)]),
  w: COL_W,
  r: 0,
}))

const wrap = (v, m) => ((v % m) + m) % m
const clampZ = (z) => Math.min(MAX_Z, Math.max(MIN_Z, z))
// Viewport-dynamic fit: phones open wide enough to read the wall as a wall
// (~2 columns), desktops open at 1:1. Used for first paint, reset, and
// (until the user zooms manually) window resizes / rotation.
const fittingZoom = () => clampZ(Math.min(1, window.innerWidth / 1050))

export default function App() {
  const stageRef = useRef(null)
  const worldRef = useRef(null)
  const pos = useRef({ x: TILE_W * 0.3, y: TILE_H * 0.25 })
  const vel = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(fittingZoom())
  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  const idle = useRef(true)
  const driftOn = useRef(true)
  const reduced = useRef(false)
  const pinch = useRef({ d: 0, cx: 0, cy: 0 })
  const pointers = useRef(new Map())
  const manualZoom = useRef(false)

  const [open, setOpen] = useState(null)
  const [drift, setDrift] = useState(true)
  const [zoom, setZoom] = useState(fittingZoom)
  const [trav, setTrav] = useState(0)
  const [coarse] = useState(
    () => window.matchMedia?.('(pointer: coarse)').matches ?? false
  )
  const travelled = useRef(0)

  // Wider tile coverage when zoomed out so the viewport never sees past the edge.
  const range = zoom < 0.6 ? 2 : 1
  const tiles = useMemo(() => {
    const out = []
    for (let ty = -range; ty <= range; ty++)
      for (let tx = -range; tx <= range; tx++) out.push({ tx, ty })
    return out
  }, [range])

  const apply = useCallback(() => {
    const el = worldRef.current
    if (!el) return
    const z = zoomRef.current
    const ox = wrap(pos.current.x, TILE_W)
    const oy = wrap(pos.current.y, TILE_H)
    el.style.transform =
      `translate3d(${((ox - TILE_W) * z).toFixed(1)}px, ${((oy - TILE_H) * z).toFixed(1)}px, 0) scale(${z})`
  }, [])

  const setZ = useCallback((nz, cx, cy, user = true) => {
    const z0 = zoomRef.current
    const z1 = clampZ(nz)
    if (z1 === z0) return
    if (user) manualZoom.current = true
    // Keep the world point under the cursor pinned while zooming.
    const stage = stageRef.current
    const rect = stage ? stage.getBoundingClientRect() : { left: 0, top: 0 }
    const px = (cx ?? rect.left + window.innerWidth / 2) - rect.left
    const py = (cy ?? rect.top + window.innerHeight / 2) - rect.top
    pos.current.x += px * (1 / z1 - 1 / z0)
    pos.current.y += py * (1 / z1 - 1 / z0)
    vel.current = { x: 0, y: 0 }
    zoomRef.current = z1
    setZoom(z1)
    apply()
  }, [apply])

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced.current) {
      driftOn.current = false
      setDrift(false)
    }
    apply()

    let raf = 0
    let lastT = performance.now()
    let uiTick = 0
    const loop = (t) => {
      const dt = Math.min(50, t - lastT) / 16.666
      lastT = t
      if (!dragging.current && pointers.current.size < 2) {
        if (idle.current && driftOn.current && !reduced.current) {
          pos.current.x += 0.35 * dt
          pos.current.y += 0.22 * dt
        } else {
          pos.current.x += vel.current.x * dt
          pos.current.y += vel.current.y * dt
          vel.current.x *= Math.pow(0.94, dt)
          vel.current.y *= Math.pow(0.94, dt)
          if (Math.abs(vel.current.x) < 0.02) vel.current.x = 0
          if (Math.abs(vel.current.y) < 0.02) vel.current.y = 0
        }
        travelled.current += Math.hypot(vel.current.x, vel.current.y) * dt
        apply()
      }
      uiTick += dt
      if (uiTick > 12) {
        uiTick = 0
        setTrav(Math.round(travelled.current))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [apply])

  // Wheel: plain scroll pans (divided by zoom for 1:1 feel), Ctrl/Cmd+scroll zooms.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (e) => {
      e.preventDefault()
      idle.current = false
      if (e.ctrlKey || e.metaKey) {
        setZ(zoomRef.current * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY)
        return
      }
      const z = zoomRef.current
      const f = e.deltaMode === 1 ? 16 : 1
      const dx = (e.deltaX * f) / z
      const dy = (e.deltaY * f) / z
      pos.current.x -= dx
      pos.current.y -= dy
      vel.current.x = -dx * 0.12
      vel.current.y = -dy * 0.12
      travelled.current += Math.hypot(dx, dy)
      apply()
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [apply, setZ])

  // Drag to pan + two-finger pinch to zoom.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const down = (e) => {
      if (e.target.closest('button') || e.target.closest('.lightbox')) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.current.size === 2) {
        dragging.current = false
        const [a, b] = [...pointers.current.values()]
        pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
        vel.current = { x: 0, y: 0 }
        return
      }
      dragging.current = true
      idle.current = false
      last.current = { x: e.clientX, y: e.clientY }
      vel.current = { x: 0, y: 0 }
      try { stage.setPointerCapture?.(e.pointerId) } catch { /* noop */ }
    }
    const move = (e) => {
      if (!pointers.current.has(e.pointerId)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const cx = (a.x + b.x) / 2
        const cy = (a.y + b.y) / 2
        if (pinch.current.d > 0 && d > 0) {
          idle.current = false
          setZ(zoomRef.current * (d / pinch.current.d), cx, cy)
          // midpoint drift also pans
          const z = zoomRef.current
          pos.current.x += (cx - pinch.current.cx) / z
          pos.current.y += (cy - pinch.current.cy) / z
          apply()
        }
        pinch.current = { d, cx, cy }
        return
      }
      if (!dragging.current) return
      const z = zoomRef.current
      const dx = (e.clientX - last.current.x) / z
      const dy = (e.clientY - last.current.y) / z
      last.current = { x: e.clientX, y: e.clientY }
      pos.current.x += dx
      pos.current.y += dy
      vel.current.x = vel.current.x * 0.7 + dx * 0.3 * 0.16
      vel.current.y = vel.current.y * 0.7 + dy * 0.3 * 0.16
      travelled.current += Math.hypot(dx, dy)
      apply()
    }
    const up = (e) => {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) pinch.current.d = 0
      if (pointers.current.size === 0) dragging.current = false
      else if (pointers.current.size === 1) {
        const [p] = [...pointers.current.values()]
        last.current = { x: p.x, y: p.y }
        dragging.current = true
      }
    }
    stage.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      stage.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [apply, setZ])

  // Keyboard: arrows/WASD pan, + / - zoom, 0 resets zoom.
  useEffect(() => {
    const onKey = (e) => {
      if (open !== null && e.key === 'Escape') return setOpen(null)
      const k = e.key.toLowerCase()
      if (k === '+' || k === '=') { idle.current = false; setZ(zoomRef.current * 1.2); e.preventDefault(); return }
      if (k === '-' || k === '_') { idle.current = false; setZ(zoomRef.current / 1.2); e.preventDefault(); return }
      if (k === '0') { idle.current = false; setZ(fittingZoom()); e.preventDefault(); return }
      const step = (e.shiftKey ? 160 : 70) / zoomRef.current
      if (['arrowup', 'w'].includes(k)) { idle.current = false; pos.current.y += step; vel.current.y = 2; }
      else if (['arrowdown', 's'].includes(k)) { idle.current = false; pos.current.y -= step; vel.current.y = -2; }
      else if (['arrowleft', 'a'].includes(k)) { idle.current = false; pos.current.x += step; vel.current.x = 2; }
      else if (['arrowright', 'd'].includes(k)) { idle.current = false; pos.current.x -= step; vel.current.x = -2; }
      else return
      e.preventDefault()
      travelled.current += step
      apply()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [apply, open, setZ])

  const recenter = () => {
    idle.current = false
    pos.current = { x: TILE_W * 0.3, y: TILE_H * 0.25 }
    vel.current = { x: 0, y: 0 }
    apply()
  }
  const toggleDrift = () => {
    driftOn.current = !driftOn.current
    idle.current = true
    setDrift(driftOn.current)
  }
  const resetZoom = () => {
    idle.current = false
    manualZoom.current = false
    setZ(fittingZoom(), undefined, undefined, false)
  }

  // Truly viewport-dynamic: until the user takes over zooming, rotations and
  // resizes re-fit the wall instead of leaving a stale zoom behind.
  useEffect(() => {
    let t = 0
    const onResize = () => {
      clearTimeout(t)
      t = window.setTimeout(() => {
        if (!manualZoom.current) setZ(fittingZoom(), undefined, undefined, false)
      }, 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', onResize)
    }
  }, [setZ])

  return (
    <>
      <div
        ref={stageRef}
        className="stage"
        role="application"
        aria-label="Infinite poster wall. Drag or scroll in any direction. Hold Control and scroll, or pinch, to zoom."
        onDoubleClick={(e) => {
          if (e.target.closest('button')) return
          idle.current = false
          setZ(zoomRef.current * 1.35, e.clientX, e.clientY)
        }}
      >
        <div ref={worldRef} className="world">
          {tiles.map(({ tx, ty }) => (
            <div key={`${tx}:${ty}`} style={{ transform: `translate(${tx * TILE_W}px, ${ty * TILE_H}px)`, width: TILE_W, height: TILE_H }}>
              {POSTERS.map((p, i) => (
                <figure
                  key={p.src}
                  className="poster"
                  style={{ left: p.x, top: p.y, width: p.w }}
                >
                  <button onClick={() => setOpen(i)} aria-label={`Open ${p.title}`}>
                    <img src={p.src} alt={p.title} loading="lazy" draggable={false} />
                  </button>
                  <figcaption>
                    <span className="t">{p.title}</span>
                    <span className="n">N°{i + 1}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="chrome">
        <header className="topbar">
          <div className="brand">
            <h1>Wall, <em>endlessly</em></h1>
            <p><b>9 posters</b> · one white room with no edges · scroll any way</p>
          </div>
          <div className="meta">
            <div className="count">09 works</div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="pill">
                <span className={`dot ${drift ? '' : 'paused'}`} />
                {drift ? 'drifting' : 'paused'} · {trav.toLocaleString()}px wandered
              </span>
            </div>
          </div>
        </header>

        <footer className="bottombar">
          <div className="hint">
            {coarse ? (
              <div>
                Drag to wander · pinch to zoom
                <small>Tap any poster to read it · use + − to zoom</small>
              </div>
            ) : (
              <div>
                <span className="keys"><span className="k">←</span><span className="k">↑</span><span className="k">↓</span><span className="k">→</span></span>
                drag, scroll, or use arrow keys
                <small>Ctrl + scroll or pinch to zoom · double-click zooms in · click a poster to read it</small>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div className="controls">
              <span className="seg">
                <button onClick={() => { idle.current = false; setZ(zoomRef.current / 1.25) }} aria-label="Zoom out">−</button>
                <button onClick={resetZoom} aria-label="Reset zoom" style={{ minWidth: 64 }}>{Math.round(zoom * 100)}%</button>
                <button onClick={() => { idle.current = false; setZ(zoomRef.current * 1.25) }} aria-label="Zoom in">+</button>
              </span>
              <button onClick={toggleDrift} aria-pressed={drift}>{drift ? 'Pause drift' : 'Resume drift'}</button>
              <button onClick={recenter}>Back to start</button>
            </div>
          </div>
        </footer>
      </div>

      {open !== null && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={POSTERS[open].title} onClick={() => setOpen(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={POSTERS[open].src} alt={POSTERS[open].title} />
          </figure>
          <aside onClick={(e) => e.stopPropagation()}>
            <span className="idx">N°{open + 1} / 09</span>
            <h2>{POSTERS[open].title}</h2>
            <p>{POSTERS[open].note}. Part of a nine-poster set pinned to an infinite white wall — the wall wraps in every direction, so there is no first or last. Press Escape or click outside to return to wandering.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button className="close" style={{ background: '#fff', color: 'var(--ink)', borderColor: 'var(--hairline)' }} onClick={() => setOpen((v) => (v + POSTERS.length - 1) % POSTERS.length)}>← Prev</button>
              <button className="close" style={{ background: '#fff', color: 'var(--ink)', borderColor: 'var(--hairline)' }} onClick={() => setOpen((v) => (v + 1) % POSTERS.length)}>Next →</button>
            </div>
            <button className="close" onClick={() => setOpen(null)}>Back to the wall</button>
          </aside>
        </div>
      )}
    </>
  )
}
