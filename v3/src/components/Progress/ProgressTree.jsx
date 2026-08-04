import { useRef, useEffect, useLayoutEffect } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import {
  LAID_OUT, LAID_OUT_BY_ID, QUADRANT_LIST, ringUnlock, MAX_RING,
  NODE_SIZE, extentFor, ringRadius, edgePath,
} from '../../game/data/progress.js'
import InfoTip from '../common/InfoTip.jsx'
import IconText from '../common/IconText.jsx'
import DefChips from './DefChips.jsx'
import './ProgressTree.css'

const FIT_PADDING = 0.9
const MIN_SCALE_MULT = 0.85 // how far below "fit" you may zoom out
const MAX_SCALE = 1.6

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const lerp = (a, b, t) => a + (b - a) * t
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * The progress web: a radial tree that grows outward.
 *
 * Rings unlock by count (`ringUnlock(r)` nodes taken from the ring inside), and
 * a ring that has not unlocked is not drawn at all — so the web literally
 * expands as the civ develops. The four quadrants each own a 90° sector.
 *
 * Camera is the same pattern as HexMap: it lives in a ref and is applied
 * imperatively, so pan/zoom never re-render the ~300 nodes. Opening a new ring
 * animates a zoom-out to the new fit.
 *
 * State colours: green = taken, blue = available, grey = locked. A locked node
 * is either missing its prerequisite or shut out by a fork it lost.
 */
export default function ProgressTree({ onClose }) {
  const game = useGame()
  const visibleRing = game.visibleRing

  const viewportRef = useRef(null)
  const contentRef = useRef(null)
  const cameraRef = useRef({ scale: 1, tx: 0, ty: 0 })
  const rafRef = useRef(null)
  const dragRef = useRef(null)
  const didMountRef = useRef(false)

  // Not memoised: useGame() already re-renders on every emit, so a memo would
  // only add a way to go stale. `progressState` is cheap because `chosenInRing`
  // is cached in the manager — without that this filter would be O(nodes²).
  const shown = LAID_OUT.filter((n) => game.progressState(n) !== 'hidden')
  const extent = extentFor(visibleRing)
  const size = extent * 2

  // --- camera ---------------------------------------------------------------
  const applyTransform = () => {
    const { scale, tx, ty } = cameraRef.current
    if (contentRef.current) {
      contentRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
    }
  }

  const fitCamera = () => {
    const vp = viewportRef.current
    if (!vp) return null
    const scale = Math.min(vp.clientWidth / size, vp.clientHeight / size) * FIT_PADDING
    return { scale, tx: (vp.clientWidth - size * scale) / 2, ty: (vp.clientHeight - size * scale) / 2 }
  }

  const scaleBounds = () => {
    const vp = viewportRef.current
    const fit = Math.min(vp.clientWidth / size, vp.clientHeight / size) * FIT_PADDING
    return { min: fit * MIN_SCALE_MULT, max: MAX_SCALE }
  }

  // Pan is clamped loosely: the web must stay partly on screen, but you can
  // push a quadrant to the edge to read its outer ring up close.
  const clampPan = (cam) => {
    const vp = viewportRef.current
    const w = size * cam.scale
    const h = size * cam.scale
    const slackX = vp.clientWidth * 0.5
    const slackY = vp.clientHeight * 0.5
    return {
      scale: cam.scale,
      tx: clamp(cam.tx, vp.clientWidth - w - slackX, slackX),
      ty: clamp(cam.ty, vp.clientHeight - h - slackY, slackY),
    }
  }

  const animateTo = (target, duration = 600) => {
    if (!target) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
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

  // Fit on open (before paint); animate the zoom-out when a new ring appears.
  useLayoutEffect(() => {
    const target = fitCamera()
    if (!target) return
    if (!didMountRef.current) {
      didMountRef.current = true
      cameraRef.current = target
      applyTransform()
    } else {
      animateTo(target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRing])

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
  }, [size])

  // Wheel zoom, anchored at the cursor.
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
      const ns = clamp(cam.scale * (e.deltaY < 0 ? 1.14 : 1 / 1.14), min, max)
      const wx = (cx - cam.tx) / cam.scale
      const wy = (cy - cam.ty) / cam.scale
      cameraRef.current = clampPan({ scale: ns, tx: cx - wx * ns, ty: cy - wy * ns })
      applyTransform()
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // Drag to pan — left or middle button, same as the map.
  const onMouseDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return
    if (e.button === 1) e.preventDefault()
    dragRef.current = { x: e.clientX, y: e.clientY, cam: { ...cameraRef.current }, moved: false }
    const onMove = (ev) => {
      const d = dragRef.current
      if (!d) return
      if (Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y) > 4) d.moved = true
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

  // A drag that moved must not also count as a click on a node.
  const takeNode = (n) => {
    if (dragRef.current?.moved) return
    game.chooseProgress(n)
  }

  // --- edges ----------------------------------------------------------------
  // Curves, not chords: an edge interpolates radius AND angle, so it stays in
  // its own annulus and can never cross another (see `edgePoints`).
  const edges = []
  for (const n of shown) {
    for (const pid of n.prereqs) {
      const p = LAID_OUT_BY_ID.get(pid)
      if (!p) continue
      edges.push({
        id: `${pid}->${n.id}`,
        d: edgePath(p, n),
        live: game.progress.has(pid),
        dead: game.progressState(n) === 'locked' && !game.progress.has(pid),
      })
    }
  }

  const towardNext = game.chosenInRing(visibleRing)

  return (
    <div className="tree-backdrop">
      <div className="tree-head">
        <div>
          <h2>Progress</h2>
          <span className="tree-sub">
            {game.progress.size} taken
            {visibleRing < MAX_RING && <> · ring {visibleRing + 2} opens at {towardNext}/{ringUnlock(visibleRing)}</>}
          </span>
        </div>
        <div className="tree-head-actions">
          <button className="tree-btn" onClick={() => animateTo(fitCamera(), 400)}>Recentre</button>
          <button className="tree-btn" onClick={() => game.resetProgress()}>Reset</button>
          <button className="tree-btn" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="tree-viewport" ref={viewportRef} onMouseDown={onMouseDown}>
        <div className="tree-content" ref={contentRef} style={{ width: size, height: size }}>
          <svg className="tree-edges" viewBox={`${-extent} ${-extent} ${size} ${size}`}>
            {[0, 90, 180, 270].map((deg) => {
              const a = (deg * Math.PI) / 180
              return (
                <line key={deg} className="tree-divider"
                  x1={0} y1={0} x2={Math.cos(a) * extent} y2={Math.sin(a) * extent} />
              )
            })}
            {Array.from({ length: visibleRing + 1 }, (_, r) => (
              <circle key={r} className="tree-ring" cx={0} cy={0} r={ringRadius(r)} />
            ))}
            {edges.map((e) => (
              <path key={e.id}
                className={`tree-edge${e.live ? ' live' : ''}${e.dead ? ' dead' : ''}`}
                d={e.d} />
            ))}
          </svg>

          {QUADRANT_LIST.map((q) => {
            const mid = ((q.from + q.to) / 2) * (Math.PI / 180)
            const R = ringRadius(visibleRing) + NODE_SIZE * 1.25
            return (
              <div key={q.key} className={`tree-quadrant-label q-${q.key}`}
                style={{
                  left: extent + Math.cos(mid) * R + (q.nudge?.x ?? 0),
                  top: extent + Math.sin(mid) * R + (q.nudge?.y ?? 0),
                }}>
                {q.name}
              </div>
            )
          })}

          {/* The palace: where the civilization starts, so the web grows out of it.
              (Fire itself is now a node — the Economy tech that permits cities.) */}
          <div className="tree-hub" style={{ left: extent, top: extent }}><span>Palace</span></div>

          {shown.map((n) => {
            const state = game.progressState(n)
            return (
              <InfoTip
                key={n.id}
                className={`tree-node-anchor q-${n.quadrant}`}
                style={{ left: extent + n.x, top: extent + n.y }}
                title={n.name}
                // Interactive so the definition chips inside can be hovered —
                // a plain tooltip has pointer-events: none and would vanish.
                interactive
                text={
                  <div className="tree-tip">
                    <div className="tree-tip-kind">{n.kind}</div>
                    <div className="tree-tip-unlocks">Unlocks <IconText>{n.unlocks}</IconText></div>
                    <div className="tree-tip-effect"><IconText>{n.effect}</IconText></div>
                    <DefChips keys={n.sub} />
                    {n.excludes.length > 0 && (
                      <div className="tree-tip-fork">
                        Taking this rules out {n.excludes.map((id) => LAID_OUT_BY_ID.get(id)?.name).join(', ')}
                      </div>
                    )}
                    <div className={`tree-tip-state s-${state}`}>
                      {state === 'unlocked' ? 'Already taken'
                        : state === 'available' ? 'Click to take' : 'Locked'}
                    </div>
                  </div>
                }
              >
                <button
                  className={`tree-node s-${state}`}
                  style={{ width: NODE_SIZE, height: NODE_SIZE * 0.866 }}
                  onClick={() => takeNode(n)}
                  disabled={state !== 'available'}
                >
                  <img src={n.icon} alt={n.kind} draggable={false} />
                </button>
                <span className="tree-node-name">{n.name}</span>
              </InfoTip>
            )
          })}
        </div>
      </div>
    </div>
  )
}
