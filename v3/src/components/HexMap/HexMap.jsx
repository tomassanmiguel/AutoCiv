import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { SQRT3 } from '../../game/hex/coords.js'
import { spriteUrl, terrainOf } from '../../game/world/terrain.js'
import './HexMap.css'

// Flat-top hexes. `HEX_SIZE` is the circumradius, so a hex is 2*size wide and
// sqrt(3)*size tall; tile.x / tile.y are pre-computed at size 1 by worldgen.
const HEX_SIZE = 54
const HEX_W = HEX_SIZE * 2
const HEX_H = HEX_SIZE * SQRT3
const SEAM = 1.5 // shrink each hex slightly so the dark backdrop reads as a grid seam

const FIT_PADDING = 0.94
const MIN_TILES_ACROSS = 6 // most zoomed-in view
const CULL_MARGIN = HEX_W * 1.5

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const lerp = (a, b, t) => a + (b - a) * t
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * The map viewer: a pan/zoom camera over the KNOWN slice of the hex world.
 *
 * Two things keep this smooth at ~4000 tiles:
 *   - the camera lives in a ref and is applied imperatively, so pan/zoom never
 *     re-renders React (ported from v2's Tableau)
 *   - tiles are CULLED to the visible rect, and the cull rect only updates when
 *     it has moved by more than a hex — so a drag triggers a handful of renders,
 *     not one per frame
 */
export default function HexMap() {
  const game = useGame()
  const stage = game.stage
  const known = game.known

  const viewportRef = useRef(null)
  const contentRef = useRef(null)
  const cameraRef = useRef({ scale: 1, tx: 0, ty: 0 })
  const viewRef = useRef(null)
  const rafRef = useRef(null)
  const didMountRef = useRef(false)
  const prevLayoutRef = useRef(null)
  const dragRef = useRef(null)

  const [view, setView] = useState(null)
  const [hover, setHover] = useState(null)

  // --- Content layout (origin + size of the known world in content px) -------
  const layout = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const t of known.tiles) {
      const x = t.x * HEX_SIZE
      const y = t.y * HEX_SIZE
      if (x - HEX_W / 2 < minX) minX = x - HEX_W / 2
      if (x + HEX_W / 2 > maxX) maxX = x + HEX_W / 2
      if (y - HEX_H / 2 < minY) minY = y - HEX_H / 2
      if (y + HEX_H / 2 > maxY) maxY = y + HEX_H / 2
    }
    if (!known.tiles.length) return { minX: 0, minY: 0, w: 1, h: 1 }
    return { minX, minY, w: maxX - minX, h: maxY - minY }
  }, [known])

  const posOf = (t) => ({
    left: t.x * HEX_SIZE - layout.minX - HEX_W / 2 + SEAM / 2,
    top: t.y * HEX_SIZE - layout.minY - HEX_H / 2 + SEAM / 2,
  })

  // --- Camera ---------------------------------------------------------------
  const updateView = () => {
    const vp = viewportRef.current
    if (!vp) return
    const { scale, tx, ty } = cameraRef.current
    const next = {
      x0: -tx / scale - CULL_MARGIN,
      y0: -ty / scale - CULL_MARGIN,
      x1: (vp.clientWidth - tx) / scale + CULL_MARGIN,
      y1: (vp.clientHeight - ty) / scale + CULL_MARGIN,
    }
    const prev = viewRef.current
    if (
      prev &&
      Math.abs(prev.x0 - next.x0) < HEX_W && Math.abs(prev.x1 - next.x1) < HEX_W &&
      Math.abs(prev.y0 - next.y0) < HEX_H && Math.abs(prev.y1 - next.y1) < HEX_H
    ) return
    viewRef.current = next
    setView(next)
  }

  const applyTransform = () => {
    const { scale, tx, ty } = cameraRef.current
    if (contentRef.current) {
      contentRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
    }
    updateView()
  }

  const fitCamera = () => {
    const vp = viewportRef.current
    if (!vp || !layout.w || !layout.h) return null
    const W = vp.clientWidth
    const H = vp.clientHeight
    const scale = Math.min(W / layout.w, H / layout.h) * FIT_PADDING
    return { scale, tx: (W - layout.w * scale) / 2, ty: (H - layout.h * scale) / 2 }
  }

  const scaleBounds = () => {
    const vp = viewportRef.current
    const W = vp.clientWidth
    const H = vp.clientHeight
    const min = Math.min(W / layout.w, H / layout.h) * FIT_PADDING
    const zoomIn = Math.min(W, H) / (MIN_TILES_ACROSS * HEX_W)
    return { min, max: Math.max(min, zoomIn) }
  }

  const clampPan = (cam) => {
    const vp = viewportRef.current
    const W = vp.clientWidth
    const H = vp.clientHeight
    const cw = layout.w * cam.scale
    const ch = layout.h * cam.scale
    return {
      scale: cam.scale,
      tx: cw <= W ? (W - cw) / 2 : clamp(cam.tx, W - cw, 0),
      ty: ch <= H ? (H - ch) / 2 : clamp(cam.ty, H - ch, 0),
    }
  }

  const revealFullMap = (duration = 750) => {
    const target = fitCamera()
    if (!target) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    // requestAnimationFrame does not fire on a hidden tab, which would leave the
    // camera stranded at the previous stage's zoom. Snap instead of animating
    // when frames aren't coming (backgrounded) or motion is unwanted.
    if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cameraRef.current = target
      applyTransform()
      return
    }
    const start = { ...cameraRef.current }
    const t0 = performance.now()
    const frame = (now) => {
      const p = Math.min(1, (now - t0) / duration)
      const e = easeInOutCubic(p)
      cameraRef.current = {
        scale: lerp(start.scale, target.scale, e),
        tx: lerp(start.tx, target.tx, e),
        ty: lerp(start.ty, target.ty, e),
      }
      applyTransform()
      if (p < 1) rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  // Fit on mount (before paint, so the first render is already culled correctly).
  // On a stage change the content origin shifts, which would teleport every
  // existing hex — counter-translate by that shift first, then animate the
  // zoom-out reveal. Same trick v2 used for era growth.
  useLayoutEffect(() => {
    const next = { minX: layout.minX, minY: layout.minY }
    if (!didMountRef.current) {
      didMountRef.current = true
      const target = fitCamera()
      if (target) { cameraRef.current = target; applyTransform() }
    } else {
      const prev = prevLayoutRef.current
      if (prev) {
        const dx = prev.minX - next.minX
        const dy = prev.minY - next.minY
        const cam = cameraRef.current
        cameraRef.current = { scale: cam.scale, tx: cam.tx - cam.scale * dx, ty: cam.ty - cam.scale * dy }
        applyTransform()
      }
      revealFullMap()
    }
    prevLayoutRef.current = next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, known])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const ro = new ResizeObserver(() => {
      const target = fitCamera()
      if (target) { cameraRef.current = target; applyTransform() }
    })
    ro.observe(vp)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  // Wheel zoom (non-passive so the page doesn't scroll).
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = vp.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const cam = cameraRef.current
      const { min, max } = scaleBounds()
      const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14
      const ns = clamp(cam.scale * factor, min, max)
      const wx = (cx - cam.tx) / cam.scale
      const wy = (cy - cam.ty) / cam.scale
      cameraRef.current = clampPan({ scale: ns, tx: cx - wx * ns, ty: cy - wy * ns })
      applyTransform()
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // --- Drag to pan ----------------------------------------------------------
  const onMouseDown = (e) => {
    if (e.button !== 0) return
    setHover(null)
    dragRef.current = { x: e.clientX, y: e.clientY, cam: { ...cameraRef.current } }
    const onMove = (ev) => {
      const d = dragRef.current
      if (!d) return
      cameraRef.current = clampPan({
        scale: d.cam.scale,
        tx: d.cam.tx + (ev.clientX - d.x),
        ty: d.cam.ty + (ev.clientY - d.y),
      })
      applyTransform()
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      viewportRef.current?.classList.remove('dragging')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    viewportRef.current.classList.add('dragging')
  }

  // --- Cull -----------------------------------------------------------------
  const shown = useMemo(() => {
    if (!view) return []
    const out = []
    for (const t of known.tiles) {
      const x = t.x * HEX_SIZE - layout.minX
      const y = t.y * HEX_SIZE - layout.minY
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue
      out.push(t)
    }
    return out
  }, [known, layout, view])

  return (
    <div className="hexmap-viewport" ref={viewportRef} onMouseDown={onMouseDown}>
      <div
        className="hexmap-content"
        ref={contentRef}
        style={{ width: layout.w, height: layout.h }}
      >
        {shown.map((t) => {
          const { left, top } = posOf(t)
          const isPalace = t.q === 0 && t.r === 0
          return (
            <div
              key={`${t.q},${t.r}`}
              className={`hex${hover === t ? ' hovered' : ''}`}
              style={{
                left,
                top,
                width: HEX_W - SEAM,
                height: HEX_H - SEAM,
                backgroundImage: `url(${spriteUrl(t.terrain)})`,
              }}
              onMouseEnter={() => setHover(t)}
              onMouseLeave={() => setHover((h) => (h === t ? null : h))}
            >
              {isPalace && <span className="hex-marker palace" title="Palace">★</span>}
              {t.encampment && <span className="hex-marker camp">{t.encampment.level}</span>}
            </div>
          )
        })}
      </div>

      {hover && <TileTip tile={hover} />}

      <div className="hexmap-readout">
        {known.tiles.length} tiles known · {known.encampments.length} encampments
      </div>
    </div>
  )
}

/** Hover card: terrain, what the tile yields, and what sits on it. */
function TileTip({ tile }) {
  const def = terrainOf(tile.terrain)
  return (
    <div className="hex-tip">
      <div className="hex-tip-title">{def.name}</div>
      <div className="hex-tip-sub">
        {tile.region.replace(/_/g, ' ')} · ring {tile.d} · wedge {tile.wedge}
      </div>
      <div className="hex-tip-body">
        {def.yield
          ? <span className="hex-tip-yield">+{def.yield.amount} {def.yield.res}</span>
          : <span className="hex-tip-none">no yield</span>}
        {!def.passable && <span className="hex-tip-warn">impassable</span>}
      </div>
      {def.note && <div className="hex-tip-note">{def.note}</div>}
      {tile.q === 0 && tile.r === 0 && <div className="hex-tip-note palace">Your palace stands here.</div>}
      {tile.encampment && (
        <div className="hex-tip-note camp">
          Enemy encampment (level {tile.encampment.level}) — reinforces every wave until your borders reach it.
        </div>
      )}
    </div>
  )
}
