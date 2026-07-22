import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { ERA_INDEX } from '../../game/data/eras.js'
import TileCard from './TileCard.jsx'
import './Tableau.css'

const CELL = 96          // base tile size in content-space pixels
const FIT_PADDING = 0.92 // leave a little breathing room at full-zoom-out

// Enemy slots (Battlefield tiles) sit above the player grid; hover tooltip content.
const BATTLEFIELD_TIP = {
  title: 'Battlefield',
  lines: ['Enemy forces deploy here to assault your civilization.'],
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const lerp = (a, b, t) => a + (b - a) * t
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * The tableau viewer: a pan/zoom camera over the visible slice of the grid.
 * The camera lives in a ref and is applied imperatively so pan/zoom never
 * re-render the ~200 tiles. `revealFullTableau()` animates a zoom-out to fit
 * everything and is reused on every era change (and later, real era transitions).
 */
export default function Tableau() {
  const game = useGame()
  const era = game.era
  const tableau = game.data.tableau
  const bounds = tableau.visibleBounds(era)

  const viewportRef = useRef(null)
  const contentRef = useRef(null)
  const cameraRef = useRef({ scale: 1, tx: 0, ty: 0 })
  const rafRef = useRef(null)
  const didMountRef = useRef(false)
  const prevLayoutRef = useRef(null)
  const dragRef = useRef(null)
  const movedRef = useRef(false) // did the last press actually pan? (suppresses the click)
  const [tooltip, setTooltip] = useState(null)

  // --- Content dimensions for the current era ---
  const enemyRows = era >= ERA_INDEX.revolution ? 4 : 3 // +1 enemy row from Revolution
  const visCols = bounds ? bounds.maxCol - bounds.minCol + 1 : 0
  const visRows = bounds ? bounds.maxRow - bounds.minRow + 1 : 0
  const contentW = visCols * CELL
  const contentH = (enemyRows + visRows) * CELL

  const applyTransform = () => {
    const { scale, tx, ty } = cameraRef.current
    if (contentRef.current) {
      contentRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
    }
  }

  const fitCamera = () => {
    const vp = viewportRef.current
    if (!vp || !contentW || !contentH) return null
    const W = vp.clientWidth
    const H = vp.clientHeight
    const scale = Math.min(W / contentW, H / contentH) * FIT_PADDING
    return { scale, tx: (W - contentW * scale) / 2, ty: (H - contentH * scale) / 2 }
  }

  const scaleBounds = () => {
    const vp = viewportRef.current
    const W = vp.clientWidth
    const H = vp.clientHeight
    const min = Math.min(W / contentW, H / contentH) * FIT_PADDING
    const zoomIn = Math.min(W, H) / (2 * CELL) // ~2x2 tiles fill the viewport
    return { min, max: Math.max(min, zoomIn) }
  }

  const clampPan = (cam) => {
    const vp = viewportRef.current
    const W = vp.clientWidth
    const H = vp.clientHeight
    const cw = contentW * cam.scale
    const ch = contentH * cam.scale
    const tx = cw <= W ? (W - cw) / 2 : clamp(cam.tx, W - cw, 0)
    const ty = ch <= H ? (H - ch) / 2 : clamp(cam.ty, H - ch, 0)
    return { scale: cam.scale, tx, ty }
  }

  const revealFullTableau = (duration = 700) => {
    const target = fitCamera()
    if (!target) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
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

  // On era change: first mount snaps to fit; subsequent changes anchor the
  // previously-visible region in place across the grid's origin shift, then
  // animate the zoom-out reveal. Also re-fit on viewport resize.
  useEffect(() => {
    const layout = bounds ? { minCol: bounds.minCol, maxRow: bounds.maxRow, enemyRows } : null
    if (!didMountRef.current) {
      didMountRef.current = true
      const target = fitCamera()
      if (target) { cameraRef.current = target; applyTransform() }
    } else {
      // Unlocking tiles shifts the content origin (minCol / maxRow / enemyRows),
      // which would teleport every existing tile the moment the era changes.
      // Counter-translate the camera by that shift first so the current view
      // holds still, then smoothly zoom out to the new fit.
      const prev = prevLayoutRef.current
      if (prev && layout) {
        const dx = (prev.minCol - layout.minCol) * CELL
        const dy = (layout.enemyRows - prev.enemyRows + layout.maxRow - prev.maxRow) * CELL
        const cam = cameraRef.current
        cameraRef.current = { scale: cam.scale, tx: cam.tx - cam.scale * dx, ty: cam.ty - cam.scale * dy }
        applyTransform()
      }
      revealFullTableau()
    }
    prevLayoutRef.current = layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [era])

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
  }, [contentW, contentH])

  // Wheel zoom (needs a non-passive listener to preventDefault the page scroll).
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
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const ns = clamp(cam.scale * factor, min, max)
      const wx = (cx - cam.tx) / cam.scale
      const wy = (cy - cam.ty) / cam.scale
      cameraRef.current = clampPan({ scale: ns, tx: cx - wx * ns, ty: cy - wy * ns })
      applyTransform()
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentW, contentH])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // --- Drag to pan ---
  const onMouseDown = (e) => {
    setTooltip(null)
    movedRef.current = false
    dragRef.current = { x: e.clientX, y: e.clientY, cam: { ...cameraRef.current } }
    const onMove = (ev) => {
      const d = dragRef.current
      if (!d) return
      // A few pixels of travel counts as a pan, not a click (drag-vs-click guard).
      if (Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y) > 4) movedRef.current = true
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
      if (viewportRef.current) viewportRef.current.classList.remove('dragging')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    viewportRef.current.classList.add('dragging')
  }

  // --- Tooltips (tiles + battlefield) ---
  const showTip = (content, e) => {
    if (dragRef.current) return
    setTooltip({ ...content, x: e.clientX, y: e.clientY })
  }
  const showTooltip = (tile, e) => showTip(tile.getTooltip(), e)
  const moveTooltip = (e) => {
    setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))
  }

  const cols = bounds ? range(bounds.minCol, bounds.maxCol) : []
  const tiles = bounds ? tableau.visibleTiles(era) : []

  // Production placement mode: valid tiles flash yellow, occupied ones red.
  const sel = game.data.selection
  const placing = !!(sel && sel.type === 'production' && sel.stage === 'place')
  const hpBonus = game.data.civilization.modifiers.unitHpBonus

  // Enemy host (visible during development as a preview, fighting during battle).
  const combat = game.data.phase === 'battle'
  const enemyGrid = new Map()
  for (const e of game.data.enemies) enemyGrid.set(`${e.col}:${e.slot}`, e)

  return (
    <div className="tableau-viewport" ref={viewportRef} onMouseDown={onMouseDown}>
      <div
        className="tableau-content"
        ref={contentRef}
        style={{ width: contentW, height: contentH }}
      >
        {/* Enemy slots (Battlefield) atop each visible column; enemies deploy here */}
        {cols.map((c) =>
          Array.from({ length: enemyRows }, (_, k) => {
            const enemy = enemyGrid.get(`${c}:${k}`)
            return (
              <div
                key={`enemy-${c}-${k}`}
                className={`enemy-slot${enemy ? ' occupied' : ''}`}
                style={{ left: (c - bounds.minCol) * CELL, top: k * CELL, width: CELL, height: CELL }}
                onMouseEnter={enemy ? undefined : (e) => showTip(BATTLEFIELD_TIP, e)}
                onMouseMove={enemy ? undefined : moveTooltip}
                onMouseLeave={enemy ? undefined : () => setTooltip(null)}
              >
                {enemy && <TileCard occupant={enemy} era={era} combat={combat} side="enemy" />}
              </div>
            )
          }),
        )}

        {/* Player tiles */}
        {tiles.map((tile) => {
          const j = tile.col - bounds.minCol
          const i = enemyRows + (bounds.maxRow - tile.row)
          const occ = tile.occupant
          const pstate = placing ? game.placementState(tile.row, tile.col) : null
          const placeable = pstate === 'valid' || pstate === 'replace'
          const cls = [
            'tableau-tile',
            occ ? 'occupied' : '',
            pstate === 'valid' ? 'place-valid' : '',
            pstate === 'replace' ? 'place-replace' : '',
          ].filter(Boolean).join(' ')
          return (
            <div
              key={`${tile.row},${tile.col}`}
              className={cls}
              style={{ left: j * CELL, top: i * CELL, width: CELL, height: CELL }}
              onMouseEnter={occ ? undefined : (e) => showTooltip(tile, e)}
              onMouseMove={occ ? undefined : moveTooltip}
              onMouseLeave={occ ? undefined : () => setTooltip(null)}
              onClick={placeable ? () => { if (!movedRef.current) game.placeAt(tile.row, tile.col) } : undefined}
            >
              {/* Background layer holds the sprite (and the west-coast mirror) so
                  the on-tile card is never flipped/mirrored. */}
              <div
                className={`tile-bg ${tile.flipX ? 'flip-x' : ''}`}
                style={{
                  backgroundColor: tile.color,
                  backgroundImage: tile.sprite ? `url("${tile.sprite}")` : 'none',
                }}
              />
              {occ && <TileCard occupant={occ} era={era} hpBonus={hpBonus} combat={combat} side="player" />}
            </div>
          )
        })}
      </div>

      {tooltip && (
        <div
          className="tile-tooltip"
          style={{ left: tooltip.x + 16, top: tooltip.y + 16 }}
        >
          <div className="tile-tooltip-title">{tooltip.title}</div>
          {tooltip.lines?.map((l, i) => (
            <div key={i} className="tile-tooltip-line">{l}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function range(a, b) {
  const out = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}
