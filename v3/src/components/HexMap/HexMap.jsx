/* eslint-disable react-hooks/preserve-manual-memoization --
   This map view is built on imperative refs by design: the camera
   (`cameraRef`/`viewRef`) is applied to the DOM without re-rendering, and the
   terrain canvas is redrawn from `drawStateRef` (its inputs, refreshed each
   render) so a combat beat never rebuilds the draw path. Every `.current` access
   here happens in an event handler, an effect, or the imperative draw — not as a
   value the render output depends on — which the rule cannot prove but is the
   whole point of the pattern. Feeding those memoised inputs (`layout`, `known`)
   into `drawStateRef` reads to the compiler as a possible later mutation, so it
   cannot auto-optimise this component; the hand-written useMemos are the whole
   performance strategy here and stand on their own, so opting out is correct. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { SQRT3, DIRS, fromPixel } from '../../game/hex/coords.js'
import { spriteUrl, terrainOf } from '../../game/world/terrain.js'

import PieceCard from './PieceCard.jsx'
import TileCard from './TileCard.jsx'
import { UNIT_DEFS } from '../../game/data/units.js'
import { buildingDef, buildingEffectText } from '../../game/data/buildings.js'
import { tileYield } from '../../game/world/territory.js'
import IconText from '../common/IconText.jsx'
import './HexMap.css'

// Flat-top hexes. `HEX_SIZE` is the circumradius, so a hex is 2*size wide and
// sqrt(3)*size tall; tile.x / tile.y are pre-computed at size 1 by worldgen.
const HEX_SIZE = 54
const HEX_W = HEX_SIZE * 2
const HEX_H = HEX_SIZE * SQRT3
const SEAM = 1.5 // shrink each hex slightly so the dark backdrop reads as a grid seam

const FIT_PADDING = 0.94
const MIN_TILES_ACROSS = 2.5 // most zoomed-in view (smaller = closer)
const CULL_MARGIN = HEX_W * 1.5
// Below this ON-SCREEN hex width the canvas draws SQUARE textures instead of
// clipping each tile to a hexagon: the corners are invisible at a few px per hex,
// and skipping the per-tile clip path makes a full-map redraw far cheaper.
const DETAIL_HEX_PX = 20

/** The six corners of a flat-top hex, as an SVG `points` string. */
const hexPoints = (cx, cy, R) => Array.from({ length: 6 }, (_, i) => {
  const a = (-60 * i) * (Math.PI / 180)
  return `${cx + R * Math.cos(a)},${cy + R * Math.sin(a)}`
}).join(' ')

// The same flat-top hexagon as the CSS `clip-path`, traced as a canvas path over
// the tile's [left, top, w, h] box: polygon(25% 0, 75% 0, 100% 50%, 75% 100%,
// 25% 100%, 0 50%).
const hexPath = (ctx, l, t, w, h) => {
  ctx.beginPath()
  ctx.moveTo(l + 0.25 * w, t)
  ctx.lineTo(l + 0.75 * w, t)
  ctx.lineTo(l + w, t + 0.5 * h)
  ctx.lineTo(l + 0.75 * w, t + h)
  ctx.lineTo(l + 0.25 * w, t + h)
  ctx.lineTo(l, t + 0.5 * h)
  ctx.closePath()
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const lerp = (a, b, t) => a + (b - a) * t
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * The map viewer: a pan/zoom camera over the KNOWN slice of the hex world.
 *
 * Three things keep this smooth at ~5000 tiles:
 *   - the camera lives in a ref and is applied imperatively, so pan/zoom never
 *     re-renders React (ported from v2's Tableau)
 *   - the TERRAIN is a single <canvas>, redrawn imperatively on every camera
 *     frame. Thousands of clipped, textured hex DIVs were the map lag — one
 *     canvas draws only the visible tiles as a handful of ms of drawImage. The
 *     canvas is screen-space (a viewport-sized sibling BEHIND the content div),
 *     so it never scales a bitmap; it re-renders at the new camera each frame.
 *   - everything else (markers, highlights, cards, pieces) is CULLED DOM in the
 *     camera-transformed content layer, and the cull rect only updates when it
 *     has moved by more than a hex
 *
 * Because the terrain is no longer per-tile DOM, hover/click/reposition are
 * hit-tested GEOMETRICALLY (pixel -> hex via `fromPixel`) on the viewport. The
 * cards are `pointer-events: none` (only their gold buttons opt back in), so a
 * mouse event over bare terrain lands on the viewport itself — which is exactly
 * the check that tells terrain apart from a card/button/piece.
 */
export default function HexMap() {
  const game = useGame()
  const stage = game.stage
  const known = game.known
  const combat = game.combat
  const sel = game.selection
  // AIMING. Several selections put something on the map — settling an outpost or
  // founding a city (:food:), building a held wonder, placing a granted
  // unit/building — and all use the same affordance: legal tiles glow and become
  // clickable. The :food: EXPAND choice is special: it lights TWO disjoint sets,
  // settle-tiles (green) and city-tiles (gold), and dispatches by which was hit.
  const placing = sel?.type === 'placement' ? sel.item : null
  const expandSel = sel?.type === 'expand'
  // City-founding tiles: their own set so they can be coloured and dispatched
  // apart from settle tiles in the expand choice.
  const cityAimSet = (expandSel || sel?.type === 'city')
    ? new Set(game.cityTargets.map((x) => `${x.q},${x.r}`))
    : null
  const expSet = (() => {
    if (placing) return new Set(game.placementTargets.map((x) => `${x.q},${x.r}`))
    if (expandSel) {
      const s = new Set(game.expandTargets.map((x) => `${x.q},${x.r}`))
      if (cityAimSet) for (const k of cityAimSet) s.add(k) // both kinds are clickable
      return s
    }
    if (sel?.type === 'city') return cityAimSet
    // A wonder aims on the map only in its PLACE stage; the choose stage is an overlay.
    if (sel?.type === 'wonder' && sel.stage === 'place') return new Set(game.wonderTargets.map((x) => `${x.q},${x.r}`))
    return null
  })()
  // Ground you own that is full — marked so "one per tile" is a visible rule
  // rather than a tile that mysteriously fails to light up.
  const blockedSet = placing
    ? new Set(game.placementBlocked.map((x) => `${x.q},${x.r}`))
    : null
  const aimAt = (t) => {
    if (placing) game.placeGrant(t)
    else if (expandSel) {
      if (cityAimSet?.has(`${t.q},${t.r}`)) game.foundCityAt(t)
      else game.settleAt(t)
    }
    else if (sel?.type === 'city') game.foundCityAt(t)
    else if (sel?.type === 'wonder' && sel.stage === 'place') game.buildWonderAt(t)
  }

  const viewportRef = useRef(null)
  const contentRef = useRef(null)
  const canvasRef = useRef(null)
  const cameraRef = useRef({ scale: 1, tx: 0, ty: 0 })
  const viewRef = useRef(null)
  const rafRef = useRef(null)
  const didMountRef = useRef(false)
  const prevLayoutRef = useRef(null)
  const dragRef = useRef(null)
  const repoDragRef = useRef(null) // an in-progress reposition drag
  const suppressClickRef = useRef(false) // a pan that moved must not also aim
  const spriteCache = useRef(new Map()) // terrain sprite <img>s, keyed by url
  const drawStateRef = useRef(null) // latest terrain inputs, read by drawTerrain
  const drawSigRef = useRef('') // last terrain-relevant signature (skip redundant redraws)

  const [view, setView] = useState(null)
  const [hover, setHover] = useState(null)

  // Hover is cleared on a GRACE TIMER, not immediately. A tile's gold buttons
  // hang below its hex, so reaching them means leaving the hex — and an instant
  // clear unmounts the button out from under the cursor mid-travel. Any new
  // hover (including the button strip re-asserting its own tile) cancels the
  // pending clear, so the only thing that actually clears it is leaving for good.
  const hoverTimer = useRef(null)
  const hoverOn = (t) => {
    clearTimeout(hoverTimer.current)
    setHover((h) => (h === t ? h : t))
  }
  // The hex layer's enter handler also tracks a reposition drag's drop target.
  const hexEnter = (t) => {
    hoverOn(t)
    const d = repoDragRef.current
    if (d) { d.over = t; if (t !== d.from) d.moved = true }
  }
  const hoverOff = (t) => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHover((h) => (h === t ? null : h)), 160)
  }
  useEffect(() => () => clearTimeout(hoverTimer.current), [])

  // Hovering a unit shows where it could go and what it could hit — the
  // clearest way to read a stat block is to see it drawn on the board. Must sit
  // AFTER the `hover` state: reading it above is a temporal-dead-zone crash.
  const reach = !combat.active && hover?.unit ? game.unitReachCells(hover) : null

  // REPOSITIONING (prep phase). Click a unit to pick it up; valid tiles light —
  // green where it is free, amber (with a cost) where it is paid — and a second
  // click drops it. Distinct from the aiming flow because prep has no selection.
  const [repo, setRepo] = useState(null)
  const canReposition = game.canReposition
  // Drop the picked-up unit when prep ends, so it doesn't re-highlight on the
  // next prep. (A transient UI reset on phase change — the state genuinely lives
  // in React, not the model.)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!canReposition) setRepo(null) }, [canReposition])
  const repoActive = canReposition && repo?.unit && !repo.unit.destroyed
  const version = game.getVersion()
  const repoMap = useMemo(() => {
    if (!repoActive) return null
    return new Map(game.repositionTargets(repo).map((r) => [`${r.tile.q},${r.tile.r}`, r]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoActive, repo, version])

  // Placement/aim is a click; REPOSITION is a DRAG (below).
  const onTileClick = (t, k) => {
    if (expSet?.has(k)) aimAt(t)
  }

  // Pixel -> the world tile under the cursor. `null` for anything unknown (off
  // the revealed slice), so hover/click/reposition all agree on what is real.
  // Content space carries the layout's -min offset, which `fromPixel` must not
  // see — add it back before inverting.
  const tileAt = (clientX, clientY) => {
    const vp = viewportRef.current
    if (!vp) return null
    const rect = vp.getBoundingClientRect()
    const { scale, tx, ty } = cameraRef.current
    const cx = (clientX - rect.left - tx) / scale + layout.minX
    const cy = (clientY - rect.top - ty) / scale + layout.minY
    const { q, r } = fromPixel(cx, cy, HEX_SIZE)
    const t = game.world.at(q, r)
    if (!t) return null
    if (known.bfSet.has(`${q},${r}`)) return t
    return t.revealStage <= stage ? t : null
  }

  /**
   * DRAG-TO-REPOSITION. Press on one of your units during prep and the legal
   * destinations light — green free, amber with the gold cost printed on the
   * tile — following the same `repoMap` the highlight layer draws. Drop on a
   * destination to move (paying if it is beyond free range); drop anywhere else
   * to cancel. Started from the viewport mousedown once the pressed tile is
   * hit-tested to one of your units; a non-unit press falls through to panning.
   */
  const startReposition = (t) => {
    setRepo(t)
    repoDragRef.current = { from: t, over: t, moved: false }
    const onUp = () => {
      window.removeEventListener('mouseup', onUp)
      const d = repoDragRef.current
      repoDragRef.current = null
      if (d && d.moved && d.over && d.over !== d.from) game.repositionUnit(d.from, d.over)
      setRepo(null)
    }
    window.addEventListener('mouseup', onUp)
  }

  // Hover / click on bare terrain. A mouse event whose target is the viewport
  // itself is over terrain (the canvas, content layer and cards are all
  // pointer-events:none — only the gold buttons and pieces opt back in), so that
  // check cleanly excludes buttons/pieces without hunting for their classes.
  const onHexHover = (e) => {
    if (dragRef.current || e.target !== viewportRef.current) return
    const t = tileAt(e.clientX, e.clientY)
    if (t) hexEnter(t)
    else hoverOff(hover)
  }
  const onHexClick = (e) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return }
    if (e.target !== viewportRef.current) return
    const t = tileAt(e.clientX, e.clientY)
    if (t) onTileClick(t, `${t.q},${t.r}`)
  }
  const onViewportLeave = () => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHover(null), 160)
  }

  // --- Content layout (origin + size of the known world in content px) -------
  const layout = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const t of known.all) {
      const x = t.x * HEX_SIZE
      const y = t.y * HEX_SIZE
      if (x - HEX_W / 2 < minX) minX = x - HEX_W / 2
      if (x + HEX_W / 2 > maxX) maxX = x + HEX_W / 2
      if (y - HEX_H / 2 < minY) minY = y - HEX_H / 2
      if (y + HEX_H / 2 > maxY) maxY = y + HEX_H / 2
    }
    if (!known.all.length) return { minX: 0, minY: 0, w: 1, h: 1 }
    return { minX, minY, w: maxX - minX, h: maxY - minY }
  }, [known])

  const posOf = (t) => ({
    left: t.x * HEX_SIZE - layout.minX - HEX_W / 2 + SEAM / 2,
    top: t.y * HEX_SIZE - layout.minY - HEX_H / 2 + SEAM / 2,
  })

  // Centre of a hex in content space — pieces and damage floats anchor here.
  const centerOf = (q, r) => ({
    x: 1.5 * q * HEX_SIZE - layout.minX,
    y: SQRT3 * (r + q / 2) * HEX_SIZE - layout.minY,
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

  // A terrain sprite <img>, cached by url. A miss kicks off the load and redraws
  // when it arrives — a tile pops in the first time its terrain is seen, then is
  // instant forever after.
  const getSprite = (key) => {
    const url = spriteUrl(key)
    let img = spriteCache.current.get(url)
    if (!img) {
      img = new Image()
      img.src = url
      img.onload = () => drawTerrain()
      spriteCache.current.set(url, img)
    }
    return img
  }

  // Redraw the terrain canvas for the CURRENT camera. Screen-space: the canvas is
  // the viewport size, and the camera (translate+scale) is baked into the 2D
  // context transform, so tiles land exactly where the CSS-transformed content
  // layer draws its cards. Only visible tiles are drawn; below DETAIL_HEX_PX the
  // per-tile hexagon clip is skipped (invisible corners) for a cheap zoomed-out
  // redraw.
  const drawTerrain = () => {
    const cv = canvasRef.current
    const vp = viewportRef.current
    const st = drawStateRef.current
    if (!cv || !vp || !st) return
    const dpr = window.devicePixelRatio || 1
    const W = vp.clientWidth
    const H = vp.clientHeight
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
    }
    const ctx = cv.getContext('2d')
    const { scale, tx, ty } = cameraRef.current
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, tx * dpr, ty * dpr)

    // Visible rect in CONTENT space (what the camera maps onto the viewport).
    const x0 = -tx / scale, y0 = -ty / scale
    const x1 = (W - tx) / scale, y1 = (H - ty) / scale
    const cellW = HEX_W - SEAM, cellH = HEX_H - SEAM
    const square = scale * HEX_W < DETAIL_HEX_PX
    const { minX, minY } = st.layout

    for (const t of st.knownAll) {
      const left = t.x * HEX_SIZE - minX - HEX_W / 2 + SEAM / 2
      const top = t.y * HEX_SIZE - minY - HEX_H / 2 + SEAM / 2
      if (left > x1 || left + cellW < x0 || top > y1 || top + cellH < y0) continue
      const isBf = st.bfSet.has(`${t.q},${t.r}`)
      const img = getSprite(isBf ? 'battlefield' : t.terrain)
      const ready = img.complete && img.naturalWidth > 0
      if (square || !ready) {
        if (ready) ctx.drawImage(img, left, top, cellW, cellH)
      } else {
        ctx.save()
        hexPath(ctx, left, top, cellW, cellH)
        ctx.clip()
        ctx.drawImage(img, left, top, cellW, cellH)
        ctx.restore()
      }
      // Controlled ground takes a faint warm wash (not while a unit's reach is up
      // — then the whole board dims instead, so the reach is the only lit thing).
      if (!isBf && !st.reachActive && t.controlled && t.revealStage <= st.stage) {
        ctx.fillStyle = 'rgba(255, 206, 110, 0.16)'
        if (square) ctx.fillRect(left, top, cellW, cellH)
        else { ctx.save(); hexPath(ctx, left, top, cellW, cellH); ctx.fill(); ctx.restore() }
      }
    }
    if (st.reachActive) {
      ctx.fillStyle = 'rgba(3, 5, 12, 0.62)'
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    }
  }

  const applyTransform = () => {
    const { scale, tx, ty } = cameraRef.current
    if (contentRef.current) {
      contentRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
    }
    drawTerrain()
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

  // --- Press: reposition a unit, else pan -----------------------------------
  const onMouseDown = (e) => {
    // Left OR middle button. preventDefault on middle stops the browser's
    // autoscroll widget from hijacking the drag.
    if (e.button !== 0 && e.button !== 1) return
    // A press on a gold action button is not ours — let it click (it stops its
    // own propagation). Everything else — bare terrain, a card body, a piece —
    // pans or repositions.
    if (e.target.closest('button')) return
    if (e.button === 1) e.preventDefault()

    // Left-press on one of your units during prep starts a reposition drag
    // instead of panning.
    if (e.button === 0 && canReposition) {
      const t = tileAt(e.clientX, e.clientY)
      if (t && t.unit && !t.unit.destroyed) {
        e.preventDefault()
        startReposition(t)
        return
      }
    }

    clearTimeout(hoverTimer.current)
    setHover(null)
    dragRef.current = { x: e.clientX, y: e.clientY, cam: { ...cameraRef.current }, moved: false }
    const onMove = (ev) => {
      const d = dragRef.current
      if (!d) return
      if (Math.abs(ev.clientX - d.x) > 3 || Math.abs(ev.clientY - d.y) > 3) d.moved = true
      cameraRef.current = clampPan({
        scale: d.cam.scale,
        tx: d.cam.tx + (ev.clientX - d.x),
        ty: d.cam.ty + (ev.clientY - d.y),
      })
      applyTransform()
    }
    const onUp = () => {
      // A pan that actually moved must not also fire the click as an aim.
      if (dragRef.current?.moved) suppressClickRef.current = true
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
    for (const t of known.all) {
      const x = t.x * HEX_SIZE - layout.minX
      const y = t.y * HEX_SIZE - layout.minY
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue
      out.push(t)
    }
    return out
  }, [known, layout, view])

  // ⚠️ PERFORMANCE. A wave fires ~10 combat beats/second, each bumping the game
  // version and re-rendering this component. At late-era map sizes `shown` is
  // thousands of tiles, so recomputing the border/road geometry EACH BEAT was
  // half the map lag; the terrain DIVs were the other half. The terrain is now a
  // canvas (see drawTerrain) and the marker/edge layers depend only on the SHOWN
  // set and the TERRITORY (which change on expansion/raze, not on a combat beat),
  // so they are memoised against `terrVersion` and skip the churn.
  const terrVersion = game.world.terr.version
  const devPhase = game.phase === 'development'

  // The small on-tile markers (improvement dot / city pip / camp level) — the one
  // thing the terrain DIVs still carried. Kept as DOM in the camera-scaled content
  // layer so their CSS (and `rem` sizing, which scales under the transform) is
  // unchanged; only tiles that actually bear a marker make a node.
  const markerEls = useMemo(() => shown.map((t) => {
    const k = `${t.q},${t.r}`
    if (known.bfSet.has(k)) return null
    // The outpost pip shows for any improved, city-less tile. It sits CENTRED by
    // default; only when a unit or building shares the tile does it tuck into the
    // corner so the centred card doesn't cover it.
    const dot = t.improved && !t.city
    if (!dot && !t.city && !t.encampment) return null
    const dotCornered = dot && (t.unit || t.building)
    const c = centerOf(t.q, t.r)
    return (
      <div key={`m${k}`} className="hex-marker-anchor" style={{ left: c.x, top: c.y, width: HEX_W, height: HEX_H }}>
        {dot && <span className={`hex-improved${dotCornered ? ' cornered' : ''}`} />}
        {/* When a FULL unit badge stands on a city (prep/combat), tuck the pop pip
            into the corner so the centred badge does not swallow it. In development
            the unit is a small icon, so the pip stays centred and prominent. */}
        {t.city && <span className={`hex-city${t.city.palace ? ' palace' : ''}${t.unit && !devPhase ? ' cornered' : ''}`}>{t.city.pop}</span>}
        {t.encampment && <span className="hex-marker camp">{t.encampment.level}</span>}
      </div>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }).filter(Boolean), [shown, known, terrVersion, game.stage, devPhase])

  // The territory border, drawn as real hex EDGES where controlled meets
  // uncontrolled — one clean outline around the whole country.
  const borderEdges = useMemo(() => {
    const out = []
    for (const t of shown) {
      // Claimed-but-unrevealed ground is inert, so it must not read as territory.
      if (!t.controlled || t.revealStage > game.stage) continue
      if (known.bfSet.has(`${t.q},${t.r}`)) continue
      const c = centerOf(t.q, t.r)
      for (let i = 0; i < 6; i++) {
        const o = game.world.at(t.q + DIRS[i][0], t.r + DIRS[i][1])
        if (o && o.controlled) continue
        const a0 = (-60 * i) * (Math.PI / 180)
        const a1 = (-60 * i + 60) * (Math.PI / 180)
        const R = HEX_SIZE - SEAM
        out.push({
          id: `${t.q},${t.r}:${i}`,
          x1: c.x + R * Math.cos(a0), y1: c.y + R * Math.sin(a0),
          x2: c.x + R * Math.cos(a1), y2: c.y + R * Math.sin(a1),
        })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, known, terrVersion, game.stage])

  // Roads are drawn as segments between adjacent road tiles; only the first three
  // directions are walked, so each link is emitted once.
  const roadEdges = useMemo(() => {
    const out = []
    for (const t of shown) {
      if (!t.road) continue
      const c = centerOf(t.q, t.r)
      for (let i = 0; i < 3; i++) {
        const o = game.world.at(t.q + DIRS[i][0], t.r + DIRS[i][1])
        if (!o?.road) continue
        const oc = centerOf(o.q, o.r)
        out.push({ id: `${t.q},${t.r}:${i}`, x1: c.x, y1: c.y, x2: oc.x, y2: oc.y })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, known, terrVersion])

  // The terrain canvas reads its inputs from a ref so a combat-beat re-render
  // never rebuilds the draw path. Refresh the ref every render (cheap), and
  // REDRAW only when something TERRAIN-relevant changed — a new stage/known set,
  // territory (control wash), the reach dim, or a layout shift. Camera moves
  // redraw through `applyTransform` instead, so a combat beat (whose signature is
  // unchanged) triggers no redraw here.
  const drawSig = `${terrVersion}|${game.stage}|${known.all.length}|${!!reach}|${layout.minX},${layout.minY}`
  useLayoutEffect(() => {
    drawStateRef.current = {
      knownAll: known.all,
      bfSet: known.bfSet,
      layout,
      stage: game.stage,
      reachActive: !!reach,
    }
    if (drawSigRef.current !== drawSig) {
      drawSigRef.current = drawSig
      drawTerrain()
    }
  })

  return (
    <div
      className="hexmap-viewport"
      ref={viewportRef}
      onMouseDown={onMouseDown}
      onMouseMove={onHexHover}
      onMouseLeave={onViewportLeave}
      onClick={onHexClick}
    >
      <canvas className="hexmap-canvas" ref={canvasRef} />
      <div
        className={`hexmap-content${reach ? ' reaching' : ''}`}
        ref={contentRef}
        style={{ width: layout.w, height: layout.h }}
      >
        {/* Terrain itself is the canvas above. This layer holds only the small
            on-tile markers (improvement / city / camp), memoised so combat beats
            do not re-diff them. */}
        {markerEls}

        {/* Hover cue, kept OUT of the memoised layer: a single brightening tile
            drawn over the hovered hex. */}
        {hover && !combat.active && (() => {
          const { left, top } = posOf(hover)
          return <div className="hex-hover-cue" style={{ left, top, width: HEX_W - SEAM, height: HEX_H - SEAM }} />
        })()}

        {/* Tile highlights are REAL SVG HEXAGONS, not CSS rings.
            An `inset box-shadow` is painted on the element's rectangle and only
            then clipped by the clip-path, so the ring survives along the flat
            top/bottom and the left/right extremes and vanishes on all four
            diagonals — it never actually borders the tile. A polygon does.

            One layer serves both highlights so they cannot fight each other,
            and reach is composited rather than ranked: for a melee unit "can
            move here" and "can hit here" are the same tiles, so picking one
            would make the other invisible for the commonest unit in the game.
            FILL = where it can stand, STROKE = what it can hit. */}
        {(reach || expSet || repoActive) && (
          <svg className="hex-overlay" width={layout.w} height={layout.h}>
            {shown.map((t) => {
              const k = `${t.q},${t.r}`
              const repoInfo = repoMap?.get(k)
              // A city-founding tile (gold) reads apart from a settle tile (green)
              // in the :food: expand choice; everywhere else `cityAimSet` is null.
              const isCity = cityAimSet?.has(k)
              const cls = [
                isCity && 'city-target',
                !isCity && expSet?.has(k) && 'target',
                blockedSet?.has(k) && 'blocked',
                reach?.move.has(k) && 'can-move',
                reach?.attack.has(k) && 'can-hit',
                reach?.threat.has(k) && 'threat',
                repoActive && t === repo && 'repo-src',
                repoInfo && (repoInfo.free ? 'repo-free' : repoInfo.afford ? 'repo-paid' : 'repo-poor'),
              ].filter(Boolean)
              if (!cls.length) return null
              const c = centerOf(t.q, t.r)
              // A paid reposition tile shows its gold cost right on the tile.
              const label = repoInfo && !repoInfo.free
              return (
                <g key={k}>
                  <polygon className={cls.join(' ')} points={hexPoints(c.x, c.y, HEX_SIZE - SEAM)} />
                  {label && (
                    <text className="repo-cost" x={c.x} y={c.y + 5} textAnchor="middle">{repoInfo.cost}</text>
                  )}
                </g>
              )
            })}
          </svg>
        )}

        {roadEdges.length > 0 && (
          <svg className="road-net" width={layout.w} height={layout.h}>
            {roadEdges.map((e) => (
              <line key={e.id} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
            ))}
          </svg>
        )}

        {borderEdges.length > 0 && (
          <svg className="territory-outline" width={layout.w} height={layout.h}>
            {borderEdges.map((e) => (
              <line key={e.id} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
            ))}
          </svg>
        )}

        {/* Buildings, the garrison and any ruin live on one card per tile, which
            also carries that tile's gold actions.

            This is its OWN LAYER rather than a child of the hex: `.hex` has a
            `clip-path`, which clips descendants, so an action button hanging
            below the hex was in the DOM but invisible. Hidden during a battle,
            when the combat pieces own the board. */}
        {!combat.active && shown.map((t) => {
          const k = `${t.q},${t.r}`
          if (known.bfSet.has(k) || (!t.unit && !t.building && !t.ruin)) return null
          const c = centerOf(t.q, t.r)
          return (
            <div
              key={`c${k}`}
              // The hovered tile lifts above its neighbours, so its action
              // buttons are not overlapped by the card on the tile below.
              className={`tile-card-anchor${hover === t ? ' hovered' : ''}`}
              // Card type is sized off the HEX, not in rem: the whole content
              // layer is scaled by the camera, so a fixed rem size shrinks to
              // nothing when zoomed out. Everything inside the card uses `em`.
              style={{ left: c.x, top: c.y, width: HEX_W, height: HEX_H, fontSize: HEX_W * 0.17 }}
            >
              <TileCard
                game={game}
                tile={t}
                hovered={hover === t}
                onHover={() => hoverOn(t)}
                compact={game.phase === 'development'}
              />
            </div>
          )
        })}

        {/* The wave that will attack at the end of this era, mustered on the
            battlefield ring and shown all through development. Knowing what is
            coming is the whole point of having a preparation phase. */}
        {!combat.active && game.pendingWave && game.pendingWave.enemies.map((e) => {
          const c = centerOf(e.q, e.r)
          return (
            <div key={`p${e.id}`} className="muster">
              <PieceCard piece={e} turn={0} x={c.x} y={c.y} size={HEX_W * 0.7} acting={false} />
            </div>
          )
        })}

        {/* --- combat layer ------------------------------------------------ */}
        {combat.active && (
          <>
            {combat.palace && (() => { const c = centerOf(0, 0); return (
              <PieceCard key="palace" piece={combat.palace} turn={combat.actionSeq}
                x={c.x} y={c.y} size={HEX_W * 0.82}
                acting={combat.acting?.side === 'palace'} />
            ) })()}
            {combat.units.map((u) => { const c = centerOf(u.q, u.r); return (
              <PieceCard key={`u${u.id}`} piece={u} turn={combat.actionSeq}
                x={c.x} y={c.y} size={HEX_W * 0.74}
                acting={combat.acting?.side === 'player' && combat.acting.id === u.id} />
            ) })}
            {combat.enemies.map((e) => { const c = centerOf(e.q, e.r); return (
              <PieceCard key={`e${e.id}`} piece={e} turn={combat.actionSeq}
                x={c.x} y={c.y} size={HEX_W * 0.74}
                acting={combat.acting?.side === 'enemy' && combat.acting.id === e.id} />
            ) })}
            {combat.events.map((ev) => { const c = centerOf(ev.q, ev.r); return (
              <div key={ev.id} className={`combat-float ${ev.kind}${ev.crit ? ' crit' : ''}`}
                style={{ left: c.x, top: c.y, fontSize: HEX_W * (ev.crit ? 0.32 : 0.26) }}>
                {ev.kind === 'raze' ? `${ev.amount} razed!`
                  : ev.kind === 'heal' ? `+${ev.amount}`
                    : `−${ev.amount}${ev.crit ? ' CRIT' : ''}`}
              </div>
            ) })}
          </>
        )}
      </div>

      {hover && (
        <TileTip
          game={game}
          tile={hover}
          battlefield={known.bfSet.has(`${hover.q},${hover.r}`)}
        />
      )}

      <div className="hexmap-readout">
        {known.tiles.length} tiles known · {known.encampments.length} encampments
      </div>
    </div>
  )
}

/** Hover card: terrain, what the tile yields, and what sits on it. */
function TileTip({ game, tile, battlefield }) {
  if (battlefield) {
    return (
      <div className="hex-tip">
        <div className="hex-tip-title">Battlefield</div>
        <div className="hex-tip-sub">ring {tile.d} · wedge {tile.wedge}</div>
        <div className="hex-tip-note camp">Enemy forces muster here, beyond the known world.</div>
      </div>
    )
  }
  const def = terrainOf(tile.terrain)
  // What it ACTUALLY makes right now, with every progress bonus folded in —
  // more useful than the raw terrain table once the web starts stacking up.
  const live = tile.controlled ? tileYield(game.world, tile, game.mods) : null
  const shownYield = live && Object.values(live).some((v) => v > 0)
    ? live
    : def.yields
  const bDef = tile.building && buildingDef(tile.building.key)
  const uDef = tile.unit && UNIT_DEFS[tile.unit.key]
  return (
    <div className="hex-tip">
      <div className="hex-tip-title">{def.name}</div>
      <div className="hex-tip-sub">
        {tile.region.replace(/_/g, ' ')} · ring {tile.d} · wedge {tile.wedge}
        {tile.improved && ' · improved'}{tile.road && ` · ${game.connectionName}`}
      </div>
      <div className="hex-tip-body">
        {Object.entries(shownYield).some(([, v]) => v > 0)
          ? Object.entries(shownYield).filter(([, v]) => v > 0).map(([res, v]) => (
            <span key={res} className="hex-tip-yield">+{v} {res}</span>
          ))
          : <span className="hex-tip-none">no yield</span>}
        {!def.passable && <span className="hex-tip-warn">impassable</span>}
      </div>
      {def.note && <div className="hex-tip-note">{def.note}</div>}
      {tile.q === 0 && tile.r === 0 && <div className="hex-tip-note palace">Your palace stands here.</div>}
      {tile.city && (() => {
        const ci = game.cityInfo(tile)
        const palace = tile.city.palace
        return (
          <div className="hex-tip-note build">
            <b>{palace ? 'Palace' : 'City'}</b> — {palace
              ? 'your seat of power; its population compounds and adds to production, gold and progress. If it falls, the run ends.'
              : 'grows population on nearby food; each citizen adds to this tile’s production, gold and progress. Cities also link into your road network.'}
            {ci && (
              <div className="hex-tip-sub">
                population {ci.pop} · +{ci.rate.toFixed(1)} :food:/tick · next pop in {Number.isFinite(ci.ticks) ? `${ci.ticks} tick${ci.ticks === 1 ? '' : 's'}` : '—'}
                {' '}({Math.floor(ci.food)}/{ci.cost} :food:)
              </div>
            )}
          </div>
        )
      })()}
      {tile.improved && !tile.city && (
        <div className="hex-tip-note build">
          <b>Outpost</b> — a settled tile: its yield is DOUBLED and it holds your border. Found a city here (or upgrade it) as you expand.
        </div>
      )}
      {bDef && (
        <div className="hex-tip-note build">
          <b>{bDef.name}</b> — <IconText>{buildingEffectText(bDef)}</IconText>
          <div className="hex-tip-sub">
            makes: {Object.entries(game.buildingOutput(tile)).filter(([, v]) => v > 0)
              .map(([r, v]) => `+${Math.round(v)} ${r}`).join(' ') || 'nothing yet'}
          </div>
        </div>
      )}
      {uDef && (() => {
        const s = game.unitBoardStats(tile)
        return (
          <div className="hex-tip-note unit">
            <b>{uDef.name}</b> — {uDef.blurb}
            {s && !tile.unit.destroyed && (
              <>
                <div className="hex-tip-body">
                  {s.atk > 0 && <span className="hex-tip-yield"><IconText>{`:attack: ${s.atk}`}</IconText></span>}
                  <span className="hex-tip-yield"><IconText>{`:defense: ${s.def}`}</IconText></span>
                  {s.range > 0 && <span className="hex-tip-yield"><IconText>{`:range: ${Number.isFinite(s.range) ? s.range : '∞'}`}</IconText></span>}
                  {s.acts > 0 && <span className="hex-tip-yield"><IconText>{`:speed: ${s.acts}`}</IconText></span>}
                  {s.crit > 0 && <span className="hex-tip-yield"><IconText>{`:crit: ${Math.round(s.crit * 100)}%`}</IconText></span>}
                  {s.taunt > 0 && <span className="hex-tip-yield">taunt {s.taunt}</span>}
                  {s.zoc > 0 && <span className="hex-tip-yield">+{s.zoc} ZOC lvl</span>}
                </div>
                <div className="hex-tip-gear">
                  <StatLine label="Base" atk={s.baseAtk} def={s.baseDef} />
                  {(s.atkBasePct > 0 || s.defBasePct > 0) &&
                    <StatLine label="Research" atk={s.atkBasePct ? `+${Math.round(s.atkBasePct * 100)}%` : null} def={s.defBasePct ? `+${Math.round(s.defBasePct * 100)}%` : null} />}
                  {s.classDefFlat > 0 && <StatLine label="Class" def={`+${s.classDefFlat}`} />}
                  {(s.formationAtk > 0 || s.formationDef > 0) &&
                    <StatLine label="Formation" atk={s.formationAtk ? `+${s.formationAtk}` : null} def={s.formationDef ? `+${s.formationDef}` : null} />}
                  {(s.earnedAtk > 0 || s.earnedDef > 0) &&
                    <StatLine label="Earned" atk={s.earnedAtk ? `+${s.earnedAtk}` : null} def={s.earnedDef ? `+${s.earnedDef}` : null} />}
                  {s.fortAdj > 0 && <StatLine label="Adj. ranged" def={`×${s.fortAdj}`} />}
                </div>
              </>
            )}
          </div>
        )
      })()}
      {tile.encampment && (
        <div className="hex-tip-note camp">
          Enemy encampment (level {tile.encampment.level}) — fields a garrison every wave until your borders reach it.
        </div>
      )}
    </div>
  )
}

/** One line of a unit's stat breakdown: a label, then its atk / def contribution. */
function StatLine({ label, atk = null, def = null }) {
  return (
    <div className="gear-row">
      <span className="gear-slot">{label}</span>
      {atk != null && <span className="gear-bonus"><IconText>{`:attack: ${atk}`}</IconText></span>}
      {def != null && <span className="gear-bonus"><IconText>{`:defense: ${def}`}</IconText></span>}
    </div>
  )
}
