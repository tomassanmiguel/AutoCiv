/* The unit-slide FLIP (posRef / lastEraRef) intentionally reads the previous-render
   cell positions during render to compute each moved card's slide offset — the
   standard FLIP memoization. A stale read can only drop/replay one animation frame
   (purely cosmetic), never a data bug, so `react-hooks/refs` does not apply here. */
/* eslint-disable react-hooks/refs */
import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { ERA_INDEX } from '../../game/data/eras.js'
import { upgradeCost } from '../../game/data/costs.js'
import { UNIT_DEFS } from '../../game/data/units.js'
import { defOf } from '../../game/data/buildings.js'
import TileCard from './TileCard.jsx'
import CombatFx from './CombatFx.jsx'
import IconText from '../common/IconText.jsx'
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

  // FLIP: remember each occupant's content-space cell position last render, so a
  // unit that moved tiles (combat reposition / Wolf shift / shift-back / drag) can
  // slide from its old cell instead of teleporting. Cleared on era change (the grid
  // origin shifts then, which would otherwise read as every card moving).
  const posRef = useRef(new Map())
  const lastEraRef = useRef(era)
  if (lastEraRef.current !== era) { posRef.current = new Map(); lastEraRef.current = era }
  const curPos = new Map()
  const slideFor = (occ, x, y) => {
    curPos.set(occ, { x, y })
    const prev = posRef.current.get(occ)
    return prev && (prev.x !== x || prev.y !== y) ? { dx: prev.x - x, dy: prev.y - y } : null
  }
  useEffect(() => { posRef.current = curPos }) // commit this render's cell positions

  // Unit reposition drag: `repos` (state) is set once a grab passes the move
  // threshold and drives the ghost + valid-tile highlight; the ghost follows the
  // cursor imperatively (reposPendingRef) so ticking re-renders don't reset it.
  const [repos, setRepos] = useState(null)
  // The deployed unit currently hovered — drives the range/pursuit tile preview (#7).
  const [hoverUnit, setHoverUnit] = useState(null)
  const reposPendingRef = useRef(null)
  const ghostRef = useRef(null)
  const snapTimerRef = useRef(null) // pending snap-back timeout (canceled on a new grab)
  const reposSeqRef = useRef(0)     // unique id per drag, keys a fresh ghost node each time

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

  // --- Drag a unit to reposition it (to a valid empty tile) ---
  const onUnitGrab = (e, tile) => {
    if (e.button !== 0) return
    const occ = tile.occupant
    // Units always; buildings only with the Stargate wonder during prep (canReposition enforces it too).
    const stargateBuilding = occ?.kind === 'building' && game._hasWonder('stargate') && game.data.phase === 'prep'
    if (!occ || (occ.kind !== 'unit' && !stargateBuilding)) return
    e.stopPropagation() // don't start a camera pan
    e.preventDefault()
    setTooltip(null)
    movedRef.current = false // a plain click (no drag) still counts as a placement click
    // A previous drag may still be mid-snap-back; cancel its pending clear so it
    // can't unmount this drag's ghost.
    if (snapTimerRef.current) { clearTimeout(snapTimerRef.current); snapTimerRef.current = null }
    const seq = ++reposSeqRef.current
    const name = (occ.kind === 'unit' ? UNIT_DEFS[occ.key]?.name : defOf(occ.key)?.name) ?? ''
    reposPendingRef.current = { seq, fromRow: tile.row, fromCol: tile.col, name, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false }

    const onMove = (ev) => {
      const p = reposPendingRef.current
      if (!p) return
      p.x = ev.clientX; p.y = ev.clientY
      if (!p.active) {
        if (Math.abs(ev.clientX - p.startX) + Math.abs(ev.clientY - p.startY) <= 4) return
        p.active = true
        movedRef.current = true // a real drag — suppress the source tile's placement click
        setRepos({ seq: p.seq, fromRow: p.fromRow, fromCol: p.fromCol, name: p.name })
      }
      const g = ghostRef.current
      if (g) { g.style.left = `${ev.clientX}px`; g.style.top = `${ev.clientY}px` }
    }
    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const p = reposPendingRef.current
      reposPendingRef.current = null
      if (!p || !p.active) { setRepos(null); return }
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const tileEl = el && el.closest('.tableau-tile')
      if (tileEl && tileEl.dataset.row && game.canReposition(p.fromRow, p.fromCol, Number(tileEl.dataset.row), Number(tileEl.dataset.col))) {
        game.moveUnit(p.fromRow, p.fromCol, Number(tileEl.dataset.row), Number(tileEl.dataset.col))
        setRepos(null)
      } else {
        snapBackGhost(p)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // --- Panopticon wonder: drag an ENEMY to an empty battlefield cell during prep ---
  const onEnemyGrab = (ev0, enemy) => {
    if (ev0.button !== 0) return
    if (!(game.data.phase === 'prep' && game._hasWonder('panopticon'))) return
    ev0.stopPropagation(); ev0.preventDefault(); setTooltip(null)
    if (snapTimerRef.current) { clearTimeout(snapTimerRef.current); snapTimerRef.current = null }
    const seq = ++reposSeqRef.current
    reposPendingRef.current = { seq, enemy: true, fromRow: enemy.row, fromCol: enemy.col, name: enemy.name ?? '', startX: ev0.clientX, startY: ev0.clientY, x: ev0.clientX, y: ev0.clientY, active: false }
    const onMove = (ev) => {
      const p = reposPendingRef.current; if (!p) return
      p.x = ev.clientX; p.y = ev.clientY
      if (!p.active) {
        if (Math.abs(ev.clientX - p.startX) + Math.abs(ev.clientY - p.startY) <= 4) return
        p.active = true; setRepos({ seq: p.seq, enemy: true, fromRow: p.fromRow, fromCol: p.fromCol, name: p.name })
      }
      const g = ghostRef.current; if (g) { g.style.left = `${ev.clientX}px`; g.style.top = `${ev.clientY}px` }
    }
    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      const p = reposPendingRef.current; reposPendingRef.current = null
      if (!p || !p.active) { setRepos(null); return }
      const slot = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.enemy-slot')
      if (slot?.dataset.erow && game.canRepositionEnemy(p.fromRow, p.fromCol, Number(slot.dataset.erow), Number(slot.dataset.ecol))) {
        game.moveEnemy(p.fromRow, p.fromCol, Number(slot.dataset.erow), Number(slot.dataset.ecol))
      }
      setRepos(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Invalid drop: animate the ghost back to the source tile, then clear.
  const snapBackGhost = (p) => {
    const src = viewportRef.current?.querySelector(`.tableau-tile[data-row="${p.fromRow}"][data-col="${p.fromCol}"]`)
    const g = ghostRef.current
    if (!src || !g) { setRepos(null); return }
    const r = src.getBoundingClientRect()
    g.style.transition = 'left 0.22s ease, top 0.22s ease, opacity 0.22s ease'
    g.style.left = `${r.left + r.width / 2}px`
    g.style.top = `${r.top + r.height / 2}px`
    g.style.opacity = '0.15'
    snapTimerRef.current = setTimeout(() => { snapTimerRef.current = null; setRepos(null) }, 230)
  }

  // Position the ghost at the cursor when a reposition drag begins (so it doesn't
  // flash at the origin before the first move). The ghost is keyed per-drag, so
  // this runs on a fresh node with default styles each time.
  useEffect(() => {
    const g = ghostRef.current
    if (repos && g && reposPendingRef.current) {
      g.style.transition = 'none'
      g.style.opacity = '1'
      g.style.left = `${reposPendingRef.current.x}px`
      g.style.top = `${reposPendingRef.current.y}px`
    }
  }, [repos])

  // Cancel a pending snap-back timer on unmount.
  useEffect(() => () => { if (snapTimerRef.current) clearTimeout(snapTimerRef.current) }, [])

  // --- Tooltips (tiles + battlefield) ---
  const showTip = (content, e) => {
    if (dragRef.current || reposPendingRef.current?.active) return
    setTooltip({ ...content, x: e.clientX, y: e.clientY })
  }
  const moveTooltip = (e) => {
    setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))
  }
  // Terrain tooltip for a tile — works even when a unit sits on it: over the on-tile
  // CARD the card's own tooltip takes over (and we clear the terrain one), but over
  // the surrounding terrain we still show the tile's terrain/effect tooltip.
  const tileTip = (tile, e) => {
    if (e.target.closest?.('.tile-card-anchor, .underlap-anchor')) { setTooltip(null); return }
    showTip(tile.getTooltip(), e)
  }

  // Track the hovered deployed unit for the range preview. The functional updater returns the
  // SAME reference when nothing changed, so mousemove over one tile doesn't churn re-renders.
  const hoverTileUnit = (tile) => setHoverUnit((prev) => {
    if (!tile.unit) return prev === null ? prev : null
    return prev && prev.row === tile.row && prev.col === tile.col ? prev : { row: tile.row, col: tile.col }
  })

  const cols = bounds ? range(bounds.minCol, bounds.maxCol) : []
  const tiles = bounds ? tableau.visibleTiles(era) : []

  // Production placement mode: valid tiles flash yellow, occupied ones red.
  const sel = game.data.selection
  const placing = !!(sel && sel.type === 'production' && sel.stage === 'place')
  // Hover-a-unit range preview: red = tiles it can strike now, blue = tiles it could reach then
  // strike after pursuing (obstruction-shortened). Hidden during placement / a reposition drag so
  // it doesn't clash with those flashes.
  const reach = hoverUnit && !placing && !repos ? game.unitReachCells(hoverUnit.row, hoverUnit.col) : null
  // Advancing a placed-but-incomplete wonder: during a production PICK, clicking the on-map
  // structure spends the build on it (canAdvanceWonder gates: placed, on-board, not destroyed).
  const picking = !!(sel && sel.type === 'production' && sel.stage === 'pick')
  const wonderInst = game.data.civilization.wonder?.placed ? game.data.civilization.wonder.inst : null
  const canAdvanceMap = picking && game.canAdvanceWonder()
  const hpBonus = game.data.civilization.modifiers.unitHpBonus
  const buildingHpBonus = game.data.civilization.modifiers.buildingHpBonus

  // Enemy host (visible during development as a preview, fighting during battle).
  const combat = game.data.phase === 'battle'
  const combatSeq = game.data.combatSeq // drives the per-attack "thrust" (only when a unit attacked)
  // Combat runs discrete turns at 1/3/5/10 per second; the march-slide + attack-lunge must fit
  // INSIDE one turn or they get cut off (the old fixed 0.22s couldn't keep up at 5x/10x — the
  // "jumpy" feel). Scale their duration to ~80% of the current turn interval, so animations
  // stay smooth at every speed. Outside combat, a fixed 220ms drives reposition slides.
  const TURN_TPS = { paused: 0, standard: 1, fast: 3, super: 5, ultra: 10 }
  const tps = TURN_TPS[game.data.speed] ?? 1
  const turnMs = combat && tps > 0 ? Math.max(90, Math.min(300, Math.round((1000 / tps) * 0.8))) : 220

  // Gold actions (repair/upgrade) are offered on deployed instances during
  // development + preparation (not mid-battle, not during a selection).
  const phase = game.data.phase
  const gold = game.data.civilization.gold.value
  const canAct = !combat && !sel && (phase === 'development' || phase === 'prep') && !game.data.won && !game.data.defeated
  // Units may be repositioned in dev/prep AND throughout a production selection
  // (pick or place) — rearrange freely, or drag a unit aside to make room to build.
  const repositionable = canAct || !!(sel && sel.type === 'production')
  const prepping = phase === 'prep'
  // Stargate wonder: buildings become grabbable (repositionable) during prep.
  const stargateGrab = prepping && game._hasWonder('stargate')
  const grabbable = (occ) => occ && (occ.kind === 'unit' || (occ.kind === 'building' && stargateGrab))
  // Panopticon wonder: enemy pieces become draggable during prep.
  const enemyDraggable = prepping && game._hasWonder('panopticon')
  const mercCost = prepping ? game.mercCost() : 0
  const tileAction = (tile, occ, pkind = null) => {
    if (!canAct || !occ || occ.mercenary) return null // mercenaries are disposable — no repair/upgrade
    // pkind ('unit'|'building') targets one of a coexisting pair; null falls back to the occupant.
    if (occ.damaged) {
      const cost = game.repairCostFor(occ) // Code of Laws discount applies
      return { kind: 'repair', cost, affordable: gold >= cost, onClick: () => game.repairOccupant(tile.row, tile.col, pkind) }
    }
    if (occ.kind === 'building' && defOf(occ.key)?.noUpgrade) return null // e.g. Cave Painting
    const cost = upgradeCost(occ, era)
    return { kind: 'upgrade', cost, affordable: gold >= cost, onClick: () => game.upgradeOccupant(tile.row, tile.col, pkind) }
  }

  return (
    <div className="tableau-viewport" ref={viewportRef} onMouseDown={onMouseDown}>
      <div
        className="tableau-content"
        ref={contentRef}
        style={{ width: contentW, height: contentH, '--turn-dur': `${turnMs}ms` }}
      >
        {/* Battlefield backdrop zone atop each visible column — enemies spawn here
            (during development) and march DOWN into the grid (during battle). */}
        {cols.map((c) =>
          Array.from({ length: enemyRows }, (_, k) => {
            const erow = bounds.maxRow + enemyRows - k // battlefield row for this backdrop cell
            const evalid = repos?.enemy && game.canRepositionEnemy(repos.fromRow, repos.fromCol, erow, c)
            return (
              <div
                key={`bf-${c}-${k}`}
                className={`enemy-slot${evalid ? ' reposition-valid' : ''}`}
                data-erow={erow}
                data-ecol={c}
                style={{ left: (c - bounds.minCol) * CELL, top: k * CELL, width: CELL, height: CELL }}
                onMouseEnter={(e) => showTip(BATTLEFIELD_TIP, e)}
                onMouseMove={moveTooltip}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          }),
        )}

        {/* Player tiles */}
        {tiles.map((tile) => {
          const j = tile.col - bounds.minCol
          const i = enemyRows + (bounds.maxRow - tile.row)
          const occ = tile.occupant
          // Multi-tile buildings render once as a spanning card in a separate pass below.
          const isMT = occ?.kind === 'building' && occ.footprint && (occ.footprint[0] > 1 || occ.footprint[1] > 1)
          const pstate = placing ? game.placementState(tile.row, tile.col) : null
          const placeable = pstate === 'valid' || pstate === 'replace'
          const mercOK = !occ && prepping && game.mercEligible(tile.row, tile.col)
          const reposSrc = repos && repos.fromRow === tile.row && repos.fromCol === tile.col
          const reposValid = repos && !reposSrc && game.canReposition(repos.fromRow, repos.fromCol, tile.row, tile.col)
          // Single-tile wonder awaiting a build → clickable to advance (multi-tile handled below).
          const advanceHere = canAdvanceMap && !isMT && wonderInst && tile.building === wonderInst
          const rkey = `${tile.row},${tile.col}`
          const cls = [
            'tableau-tile',
            occ ? 'occupied' : '',
            pstate === 'valid' ? 'place-valid' : '',
            pstate === 'replace' ? 'place-replace' : '',
            advanceHere ? 'wonder-advance' : '',
            reposValid ? 'reposition-valid' : '',
            reposSrc ? 'reposition-src' : '',
            reach?.attack.has(rkey) ? 'in-attack-range' : '',
            reach?.pursuit.has(rkey) ? 'in-pursuit-range' : '',
          ].filter(Boolean).join(' ')
          return (
            <div
              key={`${tile.row},${tile.col}`}
              className={cls}
              data-row={tile.row}
              data-col={tile.col}
              style={{ left: j * CELL, top: i * CELL, width: CELL, height: CELL }}
              onMouseEnter={(e) => { tileTip(tile, e); hoverTileUnit(tile) }}
              onMouseMove={(e) => { tileTip(tile, e); hoverTileUnit(tile) }}
              onMouseLeave={() => { setTooltip(null); setHoverUnit(null) }}
              onClick={
                placeable ? () => { if (!movedRef.current) game.placeAt(tile.row, tile.col) }
                  : advanceHere ? () => { if (!movedRef.current) game.advanceWonderProgress() }
                    : undefined
              }
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
              {/* Deployed pieces: a tile can hold a unit AND a building at once (they coexist —
                  e.g. infantry standing on a wall), plus a City's extra buildings. One piece → a
                  full card; two or more → a compact vertical stack (each ~half height) so every
                  piece stays visible and individually actionable. Multi-tile buildings are excluded
                  here — they render once as a spanning card in the pass below. */}
              {(() => {
                const big = (o) => o?.footprint && (o.footprint[0] > 1 || o.footprint[1] > 1)
                const pieces = []
                if (tile.unit && !big(tile.unit)) pieces.push({ occ: tile.unit, pkind: 'unit' })
                if (tile.building && !big(tile.building)) pieces.push({ occ: tile.building, pkind: 'building' })
                if (tile.extras) for (const ex of tile.extras) pieces.push({ occ: ex, pkind: 'building', extra: true })
                if (pieces.length === 0) return null
                const stacked = pieces.length >= 2
                const cards = pieces.map((p, k) => (
                  <TileCard
                    key={`${p.pkind}-${p.occ.key}-${k}`}
                    occupant={p.occ}
                    era={era}
                    hpBonus={hpBonus}
                    buildingHpBonus={buildingHpBonus}
                    combat={combat}
                    combatSeq={combatSeq}
                    side="player"
                    terrain={tile.terrain}
                    compact={stacked}
                    action={p.extra ? null : tileAction(tile, p.occ, p.pkind)}
                    slide={slideFor(p.occ, j * CELL, i * CELL)}
                    onGrab={repositionable && grabbable(p.occ) && !p.extra ? (e) => onUnitGrab(e, tile) : undefined}
                    anchorClass={!stacked && tile.underlap ? 'has-underlap' : ''}
                  />
                ))
                return stacked ? <div className="tile-stack">{cards}</div> : cards
              })()}
              {/* A City marks the tile (its own underlaid badge); a Road underlaps in a strip. */}
              {tile.city && <span className="city-badge">City</span>}
              {tile.underlap && <TileCard occupant={tile.underlap} era={era} side="player" />}
              {mercOK && !repos && (
                <button
                  type="button"
                  className={`merc-btn${gold >= mercCost ? '' : ' disabled'}`}
                  disabled={gold < mercCost}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); game.hireMercenary(tile.row, tile.col) }}
                  title="Hire a random mercenary for this battle"
                >
                  <span className="merc-btn-label">Hire</span>
                  <span className="merc-btn-cost"><img src="/sprites/icons/gold.png" alt="" />{mercCost}</span>
                </button>
              )}
            </div>
          )
        })}

        {/* Multi-tile buildings (Shinkansen, wonder structures) render as ONE spanning card at
            the anchor cell, sized to the footprint. Covered cells render nothing (skipped above). */}
        {tiles.filter((t) => {
          const bd = t.building
          return bd?.footprint && (bd.footprint[0] > 1 || bd.footprint[1] > 1) && bd.anchor?.row === t.row && bd.anchor?.col === t.col
        }).map((t) => {
          const bd = t.building
          const [w, h] = bd.footprint
          const left = (t.col - bounds.minCol) * CELL
          const top = (enemyRows + (bounds.maxRow - (t.row + h - 1))) * CELL
          // Multi-tile wonder awaiting a build → the spanning card is clickable to advance.
          const advanceMT = canAdvanceMap && bd === wonderInst
          return (
            <div
              key={`mt-${t.row},${t.col}`}
              className={`multitile-card${advanceMT ? ' wonder-advance' : ''}`}
              style={{ left, top, width: w * CELL, height: h * CELL }}
              onMouseEnter={(e) => tileTip(t, e)}
              onMouseMove={(e) => tileTip(t, e)}
              onMouseLeave={() => setTooltip(null)}
              onClick={advanceMT ? () => { if (!movedRef.current) game.advanceWonderProgress() } : undefined}
            >
              <TileCard
                occupant={bd}
                era={era}
                hpBonus={hpBonus}
                buildingHpBonus={buildingHpBonus}
                combat={combat}
                combatSeq={combatSeq}
                side="player"
                terrain={t.terrain}
                action={tileAction(t, bd)}
                onGrab={repositionable && grabbable(bd) ? (e) => onUnitGrab(e, t) : undefined}
              />
            </div>
          )
        })}

        {/* Marching enemies — positioned on the unified grid (spawn zone above the
            grid during development, marching down through the player rows in battle).
            An enemy at row R maps to the same vertical index as a player tile at R,
            so it slides smoothly from the battlefield into the columns. */}
        {bounds && game.data.enemies.map((e) => {
          if (e.breached) return null // broke through — no longer on the board
          // Bosses span a footprint (extends right + up from the anchor col/row). The card is
          // sized to the whole footprint and anchored at its top-left cell.
          const [ew, eh] = e.footprint ?? [1, 1]
          const x = (e.col - bounds.minCol) * CELL
          const y = (enemyRows + (bounds.maxRow - (e.row + eh - 1))) * CELL
          const edim = repos?.enemy && repos.fromRow === e.row && repos.fromCol === e.col
          return (
            <div
              key={`enemy-${e.id}`}
              className={`enemy-piece${ew > 1 || eh > 1 ? ' enemy-boss' : ''}${enemyDraggable ? ' enemy-grabbable' : ''}${edim ? ' reposition-src' : ''}`}
              style={{ left: x, top: y, width: ew * CELL, height: eh * CELL }}
              onMouseDown={enemyDraggable ? (ev) => onEnemyGrab(ev, e) : undefined}
            >
              <TileCard occupant={e} era={era} combat={combat} combatSeq={combatSeq} side="enemy" slide={slideFor(e, x, y)} />
            </div>
          )
        })}

        {/* Floating combat numbers (damage / gold / legitimacy) */}
        {bounds && <CombatFx bounds={bounds} enemyRows={enemyRows} />}
      </div>

      {tooltip && (
        <div
          className="tile-tooltip"
          style={{ left: tooltip.x + 16, top: tooltip.y + 16 }}
        >
          <div className="tile-tooltip-title">{tooltip.title}</div>
          {tooltip.lines?.map((l, i) => (
            <div key={i} className="tile-tooltip-line"><IconText>{l}</IconText></div>
          ))}
        </div>
      )}

      {/* Reposition drag ghost (follows the cursor; positioned imperatively). Keyed
          per-drag so a fresh node mounts each time (no stale opacity/transition). */}
      {repos && (
        <div key={repos.seq} className="unit-drag-ghost" ref={ghostRef}>{repos.name}</div>
      )}
    </div>
  )
}

function range(a, b) {
  const out = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}
