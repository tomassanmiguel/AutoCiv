/* eslint-disable react-hooks/preserve-manual-memoization --
   Imperative-ref map view (see v3): the camera is applied to the DOM without a
   re-render, and the terrain canvas redraws from a ref. The hand-written memos
   are the performance strategy; the compiler can't prove the ref pattern safe. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { SQRT3, fromPixel, key } from '../../game/hex/coords.js'
import { spriteUrl, terrainOf, RES_ICON } from '../../game/world/terrain.js'
import { UNIT_DEFS, PALACE_ICON, CITY_ICON } from '../../game/data/units.js'
import { BUILDING_DEFS } from '../../game/data/buildings.js'
import PieceCard from './PieceCard.jsx'
import IconText from '../common/IconText.jsx'
import './HexMap.css'

const POP = '/sprites/ui/pop.png'

const HEX_SIZE = 54
const HEX_W = HEX_SIZE * 2
const HEX_H = HEX_SIZE * SQRT3
const SEAM = 1.5
const FIT_PADDING = 0.94
const MIN_TILES_ACROSS = 2.5
const CULL_MARGIN = HEX_W * 1.5
const DETAIL_HEX_PX = 20

const hexPoints = (cx, cy, R) => Array.from({ length: 6 }, (_, i) => {
  const a = (-60 * i) * (Math.PI / 180)
  return `${cx + R * Math.cos(a)},${cy + R * Math.sin(a)}`
}).join(' ')

const hexPath = (ctx, l, t, w, h) => {
  ctx.beginPath()
  ctx.moveTo(l + 0.25 * w, t); ctx.lineTo(l + 0.75 * w, t); ctx.lineTo(l + w, t + 0.5 * h)
  ctx.lineTo(l + 0.75 * w, t + h); ctx.lineTo(l + 0.25 * w, t + h); ctx.lineTo(l, t + 0.5 * h)
  ctx.closePath()
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const lerp = (a, b, t) => a + (b - a) * t
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** The pan/zoom map viewer over the KNOWN slice of the world (ported from v3). */
export default function HexMap() {
  const game = useGame()
  const stage = game.stage
  const known = game.known
  const sel = game.selection
  const version = game.getVersion()

  // Placement aiming: legal tiles glow and become clickable.
  const placing = sel?.type === 'placement'
  const placeSet = useMemo(
    () => (placing ? new Set(game.placementTargets().map((t) => key(t.q, t.r))) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placing, version],
  )

  const viewportRef = useRef(null)
  const contentRef = useRef(null)
  const canvasRef = useRef(null)
  const cameraRef = useRef({ scale: 1, tx: 0, ty: 0 })
  const viewRef = useRef(null)
  const rafRef = useRef(null)
  const didMountRef = useRef(false)
  const prevLayoutRef = useRef(null)
  const dragRef = useRef(null)
  const repoDragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const spriteCache = useRef(new Map())
  const drawStateRef = useRef(null)
  const drawSigRef = useRef('')

  const [view, setView] = useState(null)
  const [hover, setHover] = useState(null)

  const hoverTimer = useRef(null)
  const hoverOn = (t) => { clearTimeout(hoverTimer.current); setHover((h) => (h === t ? h : t)) }
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

  const reach = hover?.unit ? game.unitReachCells(hover) : null

  // Normalized render pieces for every unit / building / city on the board.
  const boardPieces = useMemo(() => {
    const out = []
    for (const t of known.tiles) {
      if (t.unit) {
        const d = UNIT_DEFS[t.unit.cls]; const s = game.unitStats(t.unit.cls)
        out.push({ id: `u${t.unit.id}`, side: 'player', name: d.name, icon: d.icon, color: d.flavor, q: t.q, r: t.r, hp: t.unit.hp, maxHp: s.def, atk: s.atk, lastAttackSeq: t.unit.lastAttackSeq, lastAttackDir: t.unit.lastAttackDir })
      }
      if (t.building) {
        const d = BUILDING_DEFS[t.building.key]; const s = game.buildingStats(t.building.key)
        out.push({ id: `b${t.building.id}`, side: 'building', name: d.name, icon: d.icon, color: d.flavor, q: t.q, r: t.r, hp: t.building.hp, maxHp: s.maxHp, atk: s.atk, lastAttackSeq: t.building.lastAttackSeq, lastAttackDir: t.building.lastAttackDir })
      }
      if (t.city) {
        const c = t.city; const s = game.cityStats(c)
        out.push({ id: `c${c.id}`, side: c.palace ? 'palace' : 'city', name: c.palace ? 'Palace' : 'City', icon: c.palace ? PALACE_ICON : CITY_ICON, color: '#e6c15a', q: t.q, r: t.r, hp: c.hp, maxHp: s.maxHp, atk: s.atk, pop: c.pop, lastAttackSeq: c.lastAttackSeq, lastAttackDir: c.lastAttackDir })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known, version])

  const [repo, setRepo] = useState(null)
  const canReposition = game.canReposition
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!canReposition) setRepo(null) }, [canReposition])
  const repoActive = canReposition && repo?.unit
  const repoMap = useMemo(() => {
    if (!repoActive) return null
    return new Map(game.repositionTargets(repo).map((r) => [key(r.tile.q, r.tile.r), r]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoActive, repo, version])

  const onTileClick = (t, k) => { if (placeSet?.has(k)) game.placeAt(t) }

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
    if (known.bfSet.has(key(q, r))) return t
    return t.revealStage <= stage ? t : null
  }

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

  const onHexHover = (e) => {
    if (dragRef.current || e.target !== viewportRef.current) return
    const t = tileAt(e.clientX, e.clientY)
    if (t) hexEnter(t); else hoverOff(hover)
  }
  const onHexClick = (e) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return }
    if (e.target !== viewportRef.current) return
    const t = tileAt(e.clientX, e.clientY)
    if (t) onTileClick(t, key(t.q, t.r))
  }
  const onViewportLeave = () => {
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHover(null), 160)
  }

  const layout = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const t of known.all) {
      const x = t.x * HEX_SIZE, y = t.y * HEX_SIZE
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
  const centerOf = (q, r) => ({
    x: 1.5 * q * HEX_SIZE - layout.minX,
    y: SQRT3 * (r + q / 2) * HEX_SIZE - layout.minY,
  })

  // At sea = on water or open space (embarked), but not the muster ring.
  const isAtSea = (q, r) => {
    if (known.bfSet.has(key(q, r))) return false
    const t = game.world.at(q, r)
    if (!t) return false
    const d = terrainOf(t.terrain)
    return d.domain === 'water' || t.terrain === 'space' || t.terrain === 'deep_space'
  }

  // --- Camera (verbatim from v3) --------------------------------------------
  const updateView = () => {
    const vp = viewportRef.current
    if (!vp) return
    const { scale, tx, ty } = cameraRef.current
    const next = {
      x0: -tx / scale - CULL_MARGIN, y0: -ty / scale - CULL_MARGIN,
      x1: (vp.clientWidth - tx) / scale + CULL_MARGIN, y1: (vp.clientHeight - ty) / scale + CULL_MARGIN,
    }
    const prev = viewRef.current
    if (prev && Math.abs(prev.x0 - next.x0) < HEX_W && Math.abs(prev.x1 - next.x1) < HEX_W &&
      Math.abs(prev.y0 - next.y0) < HEX_H && Math.abs(prev.y1 - next.y1) < HEX_H) return
    viewRef.current = next
    setView(next)
  }

  const getSprite = (key2) => {
    const url = spriteUrl(key2)
    let img = spriteCache.current.get(url)
    if (!img) {
      img = new Image(); img.src = url; img.onload = () => drawTerrain()
      spriteCache.current.set(url, img)
    }
    return img
  }

  const drawTerrain = () => {
    const cv = canvasRef.current, vp = viewportRef.current, st = drawStateRef.current
    if (!cv || !vp || !st) return
    const dpr = window.devicePixelRatio || 1
    const W = vp.clientWidth, H = vp.clientHeight
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr) }
    const ctx = cv.getContext('2d')
    const { scale, tx, ty } = cameraRef.current
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, tx * dpr, ty * dpr)
    const x0 = -tx / scale, y0 = -ty / scale, x1 = (W - tx) / scale, y1 = (H - ty) / scale
    const cellW = HEX_W - SEAM, cellH = HEX_H - SEAM
    const square = scale * HEX_W < DETAIL_HEX_PX
    const { minX, minY } = st.layout
    for (const t of st.knownAll) {
      const left = t.x * HEX_SIZE - minX - HEX_W / 2 + SEAM / 2
      const top = t.y * HEX_SIZE - minY - HEX_H / 2 + SEAM / 2
      if (left > x1 || left + cellW < x0 || top > y1 || top + cellH < y0) continue
      const isBf = st.bfSet.has(key(t.q, t.r))
      const img = getSprite(isBf ? 'battlefield' : t.terrain)
      const ready = img.complete && img.naturalWidth > 0
      if (square || !ready) { if (ready) ctx.drawImage(img, left, top, cellW, cellH) }
      else { ctx.save(); hexPath(ctx, left, top, cellW, cellH); ctx.clip(); ctx.drawImage(img, left, top, cellW, cellH); ctx.restore() }
    }
  }

  const applyTransform = () => {
    const { scale, tx, ty } = cameraRef.current
    if (contentRef.current) contentRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
    drawTerrain(); updateView()
  }

  const fitCamera = () => {
    const vp = viewportRef.current
    if (!vp || !layout.w || !layout.h) return null
    const W = vp.clientWidth, H = vp.clientHeight
    const scale = Math.min(W / layout.w, H / layout.h) * FIT_PADDING
    return { scale, tx: (W - layout.w * scale) / 2, ty: (H - layout.h * scale) / 2 }
  }
  const scaleBounds = () => {
    const vp = viewportRef.current
    const W = vp.clientWidth, H = vp.clientHeight
    const min = Math.min(W / layout.w, H / layout.h) * FIT_PADDING
    const zoomIn = Math.min(W, H) / (MIN_TILES_ACROSS * HEX_W)
    return { min, max: Math.max(min, zoomIn) }
  }
  const clampPan = (cam) => {
    const vp = viewportRef.current
    const W = vp.clientWidth, H = vp.clientHeight
    const cw = layout.w * cam.scale, ch = layout.h * cam.scale
    return {
      scale: cam.scale,
      tx: cw <= W ? (W - cw) / 2 : clamp(cam.tx, W - cw, 0),
      ty: ch <= H ? (H - ch) / 2 : clamp(cam.ty, H - ch, 0),
    }
  }

  const revealFullMap = (duration = 700) => {
    const target = fitCamera()
    if (!target) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cameraRef.current = target; applyTransform(); return }
    const start = { ...cameraRef.current }
    const t0 = performance.now()
    const frame = (now) => {
      const p = Math.min(1, (now - t0) / duration), e = easeInOutCubic(p)
      cameraRef.current = { scale: lerp(start.scale, target.scale, e), tx: lerp(start.tx, target.tx, e), ty: lerp(start.ty, target.ty, e) }
      applyTransform()
      if (p < 1) rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  useLayoutEffect(() => {
    const next = { minX: layout.minX, minY: layout.minY }
    if (!didMountRef.current) {
      didMountRef.current = true
      const target = fitCamera()
      if (target) { cameraRef.current = target; applyTransform() }
    } else {
      const prev = prevLayoutRef.current
      if (prev) {
        const dx = prev.minX - next.minX, dy = prev.minY - next.minY
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
    const ro = new ResizeObserver(() => { const target = fitCamera(); if (target) { cameraRef.current = target; applyTransform() } })
    ro.observe(vp)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e) => {
      e.preventDefault()
      const rect = vp.getBoundingClientRect()
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top
      const cam = cameraRef.current
      const { min, max } = scaleBounds()
      const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14
      const ns = clamp(cam.scale * factor, min, max)
      const wx = (cx - cam.tx) / cam.scale, wy = (cy - cam.ty) / cam.scale
      cameraRef.current = clampPan({ scale: ns, tx: cx - wx * ns, ty: cy - wy * ns })
      applyTransform()
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const onMouseDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return
    if (e.target.closest('button')) return
    if (e.button === 1) e.preventDefault()
    if (e.button === 0 && canReposition) {
      const t = tileAt(e.clientX, e.clientY)
      if (t && t.unit) { e.preventDefault(); startReposition(t); return }
    }
    clearTimeout(hoverTimer.current); setHover(null)
    dragRef.current = { x: e.clientX, y: e.clientY, cam: { ...cameraRef.current }, moved: false }
    const onMove = (ev) => {
      const d = dragRef.current
      if (!d) return
      if (Math.abs(ev.clientX - d.x) > 3 || Math.abs(ev.clientY - d.y) > 3) d.moved = true
      cameraRef.current = clampPan({ scale: d.cam.scale, tx: d.cam.tx + (ev.clientX - d.x), ty: d.cam.ty + (ev.clientY - d.y) })
      applyTransform()
    }
    const onUp = () => {
      if (dragRef.current?.moved) suppressClickRef.current = true
      dragRef.current = null
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      viewportRef.current?.classList.remove('dragging')
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    viewportRef.current.classList.add('dragging')
  }

  const shown = useMemo(() => {
    if (!view) return []
    const out = []
    for (const t of known.all) {
      const x = t.x * HEX_SIZE - layout.minX, y = t.y * HEX_SIZE - layout.minY
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue
      out.push(t)
    }
    return out
  }, [known, layout, view])

  const drawSig = `${game.getVersion()}|${stage}|${known.all.length}|${layout.minX},${layout.minY}`
  useLayoutEffect(() => {
    drawStateRef.current = { knownAll: known.all, bfSet: known.bfSet, layout, stage }
    if (drawSigRef.current !== drawSig) { drawSigRef.current = drawSig; drawTerrain() }
  })

  return (
    <div className="hexmap-viewport" ref={viewportRef}
      onMouseDown={onMouseDown} onMouseMove={onHexHover} onMouseLeave={onViewportLeave} onClick={onHexClick}>
      <canvas className="hexmap-canvas" ref={canvasRef} />
      <div className={`hexmap-content${reach ? ' reaching' : ''}`} ref={contentRef} style={{ width: layout.w, height: layout.h }}>

        {hover && (() => {
          const { left, top } = posOf(hover)
          return <div className="hex-hover-cue" style={{ left, top, width: HEX_W - SEAM, height: HEX_H - SEAM }} />
        })()}

        {(reach || placeSet || repoActive) && (
          <svg className="hex-overlay" width={layout.w} height={layout.h}>
            {shown.map((t) => {
              const k = key(t.q, t.r)
              const repoInfo = repoMap?.get(k)
              const cls = [
                placeSet?.has(k) && 'target',
                reach?.attack.has(k) && 'can-hit',
                repoActive && t === repo && 'repo-src',
                repoInfo && (repoInfo.free ? 'repo-free' : repoInfo.afford ? 'repo-paid' : 'repo-poor'),
              ].filter(Boolean)
              if (!cls.length) return null
              const c = centerOf(t.q, t.r)
              return <polygon key={k} className={cls.join(' ')} points={hexPoints(c.x, c.y, HEX_SIZE - SEAM)} />
            })}
          </svg>
        )}

        {/* Every unit / building / city on the board, always on. */}
        {boardPieces.map((p) => {
          const c = centerOf(p.q, p.r)
          return <PieceCard key={p.id} piece={p} x={c.x} y={c.y} size={HEX_W * (p.side === 'palace' ? 0.84 : 0.74)} />
        })}

        {/* Persistent enemies marching on the palace. */}
        {game.enemies.map((e) => {
          const c = centerOf(e.q, e.r)
          return <PieceCard key={`e${e.id}`} piece={e} x={c.x} y={c.y} size={HEX_W * 0.74} embarked={isAtSea(e.q, e.r)} />
        })}

        {/* Forecast: next turn's arrivals, telegraphed on the frontier. */}
        {game.forecast.map((e) => {
          const c = centerOf(e.q, e.r)
          return <PieceCard key={`f${e.id}`} piece={e} x={c.x} y={c.y} size={HEX_W * 0.7} ghost />
        })}

        {/* Floating combat + income numbers for the turn just resolved. */}
        {game.events.map((ev) => {
          const c = centerOf(ev.q, ev.r)
          const isRes = ev.kind === 'gold' || ev.kind === 'progress' || ev.kind === 'food'
          const dx = ev.kind === 'gold' ? -HEX_W * 0.18 : ev.kind === 'progress' ? HEX_W * 0.18 : 0
          let body
          if (isRes) body = <><img src={RES_ICON[ev.kind]} alt="" />+{ev.amount}</>
          else if (ev.kind === 'raze') body = 'razed'
          else if (ev.kind === 'pop') body = <><img src={POP} alt="" />−{ev.amount}</>
          else body = `−${ev.amount}`
          return (
            <div key={ev.id} className={`combat-float ${ev.kind}`} style={{ left: c.x + dx, top: c.y, fontSize: HEX_W * (isRes ? 0.2 : 0.24) }}>
              {body}
            </div>
          )
        })}

        {/* Hovering a city paints what each surrounding tile yields to it. */}
        {hover?.city && game.cityRadiusTiles(hover.city).map((t) => {
          if (t === hover) return null
          const y = terrainOf(t.terrain).yields
          const items = []
          if (y.food > 0) items.push(['food', y.food])
          if (y.gold > 0) items.push(['gold', y.gold])
          if (y.progress > 0) items.push(['progress', y.progress])
          if (!items.length) return null
          const c = centerOf(t.q, t.r)
          return (
            <div key={`cy${key(t.q, t.r)}`} className="city-yield" style={{ left: c.x, top: c.y, fontSize: HEX_W * 0.15 }}>
              {items.map(([res, v]) => (
                <span key={res} className={`cy-res ${res}`}><img src={RES_ICON[res]} alt={res} />{v}</span>
              ))}
            </div>
          )
        })}

      </div>

      {hover && <TileTip game={game} tile={hover} battlefield={known.bfSet.has(key(hover.q, hover.r))} />}
    </div>
  )
}

/** Hover card: terrain, what the tile yields, and what sits on it. */
function TileTip({ game, tile, battlefield }) {
  if (battlefield) {
    return (
      <div className="hex-tip">
        <div className="hex-tip-title">Battlefield</div>
        <div className="hex-tip-note camp">Enemy forces muster here, beyond the known world.</div>
      </div>
    )
  }
  const def = terrainOf(tile.terrain)
  const y = def.yields
  const info = tile.city ? game.cityInfo(tile) : null
  const uDef = tile.unit && UNIT_DEFS[tile.unit.cls]
  const uStats = tile.unit && game.unitBoardStats(tile)
  const bDef = tile.building && BUILDING_DEFS[tile.building.key]
  const bStats = tile.building && game.buildingStats(tile.building.key)
  const enemy = game.enemies.find((e) => !e.dead && e.q === tile.q && e.r === tile.r)
  return (
    <div className="hex-tip">
      <div className="hex-tip-title">{def.name}</div>
      <div className="hex-tip-body">
        {y.food > 0 && <span className="hex-tip-yield">+{y.food} food</span>}
        {y.gold > 0 && <span className="hex-tip-yield">+{y.gold} gold</span>}
        {y.progress > 0 && <span className="hex-tip-yield">+{y.progress} progress</span>}
        {y.food === 0 && y.gold === 0 && y.progress === 0 && <span className="hex-tip-none">no yield</span>}
        {!def.passable && <span className="hex-tip-warn">impassable</span>}
      </div>
      {def.note && <div className="hex-tip-note"><IconText>{def.note}</IconText></div>}
      {info && (
        <div className="hex-tip-note build">
          <b>{info.palace ? 'Palace' : 'City'}</b> — pop {info.pop}
          <div className="hex-tip-body">
            <IconText>{info.palace ? `:defense: ${Math.round(info.hp)}/${info.maxHp} · :attack: ${info.atk} · :range: ${info.range}` : `${info.atk > 0 ? `:attack: ${info.atk} · :range: ${info.range} · ` : ''}each hit costs 1 pop`}</IconText>
          </div>
          <div className="hex-tip-sub">
            <IconText>{`+${info.gold} :gold: · +${info.progress} :progress: per turn · +${info.food} :food: → grows at ${info.threshold}`}</IconText>
          </div>
        </div>
      )}
      {uDef && (
        <div className="hex-tip-note unit">
          <b>{uDef.name}</b> — {uDef.blurb}
          <div className="hex-tip-sub">
            <IconText>{`:attack: ${uStats.atk} · :defense: ${Math.round(uStats.hp)}/${uStats.def} · :range: ${uStats.range}`}</IconText>
          </div>
        </div>
      )}
      {bDef && (
        <div className="hex-tip-note build">
          <b>{bDef.name}</b> — <IconText>{bDef.blurb}</IconText>
          <div className="hex-tip-sub">
            <IconText>{`:defense: ${Math.round(tile.building.hp)}/${bStats.maxHp}${bStats.atk > 0 ? ` · :attack: ${bStats.atk} · :range: ${bStats.range}` : ''}`}</IconText>
          </div>
        </div>
      )}
      {enemy && (
        <div className="hex-tip-note enemy">
          <b>{enemy.name}</b> — enemy
          <div className="hex-tip-sub">
            <IconText>{`:attack: ${enemy.atk} · :defense: ${Math.max(0, Math.round(enemy.hp))}/${enemy.maxHp} · :range: ${enemy.range}`}</IconText>
          </div>
        </div>
      )}
    </div>
  )
}
