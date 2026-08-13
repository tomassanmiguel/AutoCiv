import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { GameProvider, useGame } from '../game/react/GameProvider.jsx'
import { GameEngine } from '../game/GameEngine.js'
import { fromPixel, SQRT3, key as hkey } from '../game/hex/coords.js'
import { spriteUrl, terrainOf } from '../game/world/terrain.js'
import { TERRAIN, DEPLOYABLES, META, TECHS } from '../game/data/content.js'
import { DOMAINS, ERAS } from '../game/data/schema.js'
import { resolveCombatTimeline, domainHasForce } from '../game/systems/combat.js'
import { trackForEra } from '../game/audio/tracks.js'
import NineSlice from './common/NineSlice.jsx'
import InfoTip from './common/InfoTip.jsx'
import IconText from './common/IconText.jsx'
import './GameScreen.css'

const HEX_SIZE = 54
const HEX_W = HEX_SIZE * 2
const HEX_H = HEX_SIZE * SQRT3
const SEAM = 1.5
const FIT_PAD = 0.94
const MIN_ACROSS = 3
const CULL = HEX_W * 1.5
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const hexPoints = (cx, cy, R) => Array.from({ length: 6 }, (_, i) => { const a = (-60 * i) * Math.PI / 180; return `${cx + R * Math.cos(a)},${cy + R * Math.sin(a)}` }).join(' ')
const hexPath = (ctx, l, t, w, h) => { ctx.beginPath(); ctx.moveTo(l + 0.25 * w, t); ctx.lineTo(l + 0.75 * w, t); ctx.lineTo(l + w, t + 0.5 * h); ctx.lineTo(l + 0.75 * w, t + h); ctx.lineTo(l + 0.25 * w, t + h); ctx.lineTo(l, t + 0.5 * h); ctx.closePath() }
const RES_KEYS = ['production', 'food', 'gold', 'progress']
const ICON = (n) => `/sprites/icons/${n}.png`
const RES_ICON = { production: ICON('production'), gold: ICON('gold'), food: ICON('food'), progress: ICON('progress'), legitimacy: ICON('legitimacy') }
const STAT_ICON = { atk: ICON('attack'), def: ICON('defense'), bomb: ICON('range') }
const CAT_COLOR = {
  melee: '#c0563b', ranged: '#c9a13e', cavalry: '#b5793a', siege: '#8a5a2b', naval: '#3d7fa0',
  settlement: '#c79a4a', legitimacy: '#b45fb0', defense: '#8c98a6', gold: '#e0be3f',
  food: '#6faa4f', progress: '#5aa0d0', production: '#b0703a',
}
const catColor = (dep) => CAT_COLOR[dep.subtype] || '#9a8a6a'
const UI = (n) => `/sprites/ui/${n}.png`
const SIL_UNIT = { melee: UI('melee'), ranged: UI('ranged'), cavalry: UI('cavalry'), siege: UI('siege'), naval: UI('boat') }
const SIL_BLD = { settlement: UI('building'), defense: UI('defense'), gold: UI('gold'), food: UI('food'), progress: UI('progress'), production: UI('production'), legitimacy: UI('legitimacy') }
function silFor(dep) {
  if (dep.id === 'palace') return UI('wonder')
  if (dep.type === 'unit') return SIL_UNIT[dep.subtype] || UI('unit')
  return SIL_BLD[dep.subtype] || UI('building')
}
const RIco = ({ r, s = 14 }) => <img className="ric" src={RES_ICON[r]} alt={r} style={{ height: s }} />
const SIco = ({ st, s = 14 }) => <img className="ric" src={STAT_ICON[st]} alt={st} style={{ height: s }} />
const fmt = (n) => Math.floor(n)
const cap = (s) => s[0].toUpperCase() + s.slice(1)
const total = (p) => p.atk + p.def + p.bomb
const delta = (n) => { const v = Math.floor(n); return v === 0 ? null : <span className={`dlt ${v > 0 ? 'up' : 'dn'}`}>{v > 0 ? '+' : ''}{v}</span> }

export default function GameScreen({ seed, onExit, audio }) {
  const [engine] = useState(() => new GameEngine(seed))
  useEffect(() => { if (import.meta.env.DEV) window.__g = engine }, [engine])
  return (
    <GameProvider manager={engine}>
      <Game onExit={onExit} audio={audio} />
    </GameProvider>
  )
}

function Game({ onExit, audio }) {
  const g = useGame()
  const [seenWave, setSeenWave] = useState(0)
  const [waveOpen, setWaveOpen] = useState(false)
  const [takenOpen, setTakenOpen] = useState(false)
  useEffect(() => { if (audio) audio.playTrack(trackForEra(g.era)) }, [g.era, audio])
  const showCombat = g.lastCombat && g.lastCombat.wave > seenWave
  return (
    <div className="v5">
      <TopBar g={g} onExit={onExit} onWave={() => setWaveOpen(true)} onTaken={() => setTakenOpen(true)} />
      <div className="v5-body">
        <HexMap g={g} />
        <Sidebar g={g} />
      </div>
      {g.selection && <SelectionBanner g={g} />}
      {waveOpen && <WaveOverlay g={g} onClose={() => setWaveOpen(false)} />}
      {takenOpen && <TakenOverlay g={g} onClose={() => setTakenOpen(false)} />}
      {showCombat && (
        <CombatOverlay title={`Wave ${g.lastCombat.wave} · ${g.lastCombat.enemy.archetypeName}`}
          player={g.lastCombat.player} enemy={g.lastCombat.enemy.scalars}
          dismissLabel="Continue" onDismiss={() => setSeenWave(g.lastCombat.wave)} />
      )}
      {g.status !== 'playing' && <EndOverlay g={g} onExit={onExit} />}
    </div>
  )
}

function TopBar({ g, onExit, onWave, onTaken }) {
  const pt = g.perTurn()
  const dueIn = (META.waveInterval - (g.turn % META.waveInterval)) % META.waveInterval
  const pred = g.previewCombat()
  const dmg = pred ? pred.legitimacyLost : 0
  const fatal = dmg >= g.legitimacy
  // "Anything left to do?" — a still-actionable research / build / expansion.
  const pending = g.offerData().some((o) => o.affordable) || g.buildableList().some((b) => b.affordable) || g.expandTargets().some((e) => e.affordable)
  const goldTip = `Gold — pays upkeep, mercenaries and rerolls. Income :gold:${fmt(pt.income.gold)}, upkeep −${pt.upkeep} → net ${fmt(pt.net.gold)}/turn. Negative gold subtracts from every combat scalar.`
  const resTip = {
    production: `Production — build deployables. +${fmt(pt.net.production)}/turn from tiles & buildings.`,
    food: `Food — expand your territory. +${fmt(pt.net.food)}/turn.`,
    progress: `Progress — unlock technologies. +${fmt(pt.net.progress)}/turn.`,
  }
  return (
    <header className="v5-top">
      <div className="v5-brand">AutoCiv <span>v5</span></div>
      <div className="v5-era">{g.eraName()} Era · Turn {g.turn}</div>
      <InfoTip text={`Next wave ${dueIn === 0 ? 'this turn' : `in ${dueIn} turn(s)`}. Predicted loss ${dmg} legitimacy${fatal ? ' — FATAL!' : ''}. Click for the matchup.`}>
        <button className={`v5-wave ${dueIn === 0 ? 'imminent' : ''} ${fatal ? 'fatal' : ''}`} onClick={onWave}>
          ⚔ {dueIn === 0 ? 'Wave now' : `Wave in ${dueIn}`}<span className="wdmg"><RIco r="legitimacy" s={13} />−{dmg}</span>
        </button>
      </InfoTip>
      <div className="v5-stats">
        <InfoTip text={`Legitimacy — your life total. Reach 0 and the run ends. +${fmt(pt.income.legitimacy)}/turn.`}>
          <div className="v5-stat legit"><RIco r="legitimacy" s={20} /><b>{fmt(g.legitimacy)}</b>{delta(pt.income.legitimacy)}</div>
        </InfoTip>
        {RES_KEYS.map((r) => (
          <InfoTip key={r} text={r === 'gold' ? goldTip : resTip[r]}>
            <div className="v5-stat"><RIco r={r} s={17} /><b>{fmt(g.resources[r])}</b>{delta(pt.net[r])}</div>
          </InfoTip>
        ))}
      </div>
      <InfoTip text="Technologies researched, by era.">
        <button className="v5-iconbtn" onClick={onTaken}>📜</button>
      </InfoTip>
      <InfoTip text={pending ? 'You still have research, builds, or expansions available this turn.' : 'Nothing left to do — end your turn.'}>
        <button className={`v5-endturn ${pending ? 'muted' : 'ready'}`} onClick={() => g.endTurn()}>End Turn ▸</button>
      </InfoTip>
      <button className="v5-exit" onClick={onExit} title="Quit to title">✕</button>
    </header>
  )
}

function WaveOverlay({ g, onClose }) {
  return (
    <div className="v5-modal-bg" onClick={onClose}>
      <NineSlice src="/sprites/ui/box.png" slice={205} width={24} className="v5-theater" onClick={(e) => e.stopPropagation()}>
        <h2>Next Wave</h2>
        <WavePanel g={g} />
        <button className="v5-cont" onClick={onClose}>Close</button>
      </NineSlice>
    </div>
  )
}

function TakenOverlay({ g, onClose }) {
  const byEra = {}
  for (const id of g.taken) { const t = TECHS[id]; (byEra[t.era] ||= []).push(t) }
  const eras = ERAS.filter((e) => byEra[e])
  return (
    <div className="v5-modal-bg" onClick={onClose}>
      <NineSlice src="/sprites/ui/box.png" slice={205} width={24} className="v5-theater taken" onClick={(e) => e.stopPropagation()}>
        <h2>Researched Technologies</h2>
        {eras.length === 0 && <p className="taken-empty">Nothing researched yet.</p>}
        {eras.map((e) => (
          <div key={e} className="taken-era">
            <div className="taken-eh">{e} <span>({byEra[e].length})</span></div>
            <div className="taken-list">{byEra[e].map((t) => (
              <InfoTip key={t.id} text={`${t.flavor} · ${t.desc}`}><span className="taken-chip">{t.name}</span></InfoTip>
            ))}</div>
          </div>
        ))}
        <button className="v5-cont" onClick={onClose}>Close</button>
      </NineSlice>
    </div>
  )
}

function HexMap({ g }) {
  const tiles = g.world.tiles
  const version = g.getVersion()
  const placing = g.selection && g.selection.type === 'build' ? g.selection.deployableId : null

  const viewportRef = useRef(null)
  const contentRef = useRef(null)
  const canvasRef = useRef(null)
  const cameraRef = useRef({ scale: 1, tx: 0, ty: 0 })
  const viewRef = useRef(null)
  const spriteCache = useRef(new Map())
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const didMount = useRef(false)
  const [view, setView] = useState(null)
  const [hover, setHover] = useState(null)

  const layout = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const t of tiles) {
      const x = t.x * HEX_SIZE, y = t.y * HEX_SIZE
      minX = Math.min(minX, x - HEX_W / 2); maxX = Math.max(maxX, x + HEX_W / 2)
      minY = Math.min(minY, y - HEX_H / 2); maxY = Math.max(maxY, y + HEX_H / 2)
    }
    return { minX, minY, w: maxX - minX, h: maxY - minY }
  }, [tiles])
  const centerOf = (q, r) => ({ x: 1.5 * q * HEX_SIZE - layout.minX, y: SQRT3 * (r + q / 2) * HEX_SIZE - layout.minY })

  const expand = useMemo(() => { const m = {}; for (const e of g.expandTargets()) if (e.affordable) m[e.key] = e; return m }, [g, version]) // eslint-disable-line
  const placeSet = useMemo(() => { if (!placing) return null; const s = new Set(); for (const t of tiles) if (g.placementValid(placing, t.key)) s.add(t.key); return s }, [g, placing, version]) // eslint-disable-line

  const getSprite = (terr) => {
    const url = spriteUrl(terr)
    let img = spriteCache.current.get(url)
    if (!img) { img = new Image(); img.src = url; img.onload = () => drawTerrain(); spriteCache.current.set(url, img) }
    return img
  }
  const drawTerrain = () => {
    const cv = canvasRef.current, vp = viewportRef.current
    if (!cv || !vp) return
    const dpr = window.devicePixelRatio || 1
    const W = vp.clientWidth, H = vp.clientHeight
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr) }
    const ctx = cv.getContext('2d')
    const { scale, tx, ty } = cameraRef.current
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, tx * dpr, ty * dpr)
    const x0 = -tx / scale, y0 = -ty / scale, x1 = (W - tx) / scale, y1 = (H - ty) / scale
    const cellW = HEX_W - SEAM, cellH = HEX_H - SEAM
    const square = scale * HEX_W < 22 // zoomed out: skip the per-tile hex clip (corners invisible)
    const { minX, minY } = layout
    for (const t of tiles) {
      const left = t.x * HEX_SIZE - minX - HEX_W / 2 + SEAM / 2
      const top = t.y * HEX_SIZE - minY - HEX_H / 2 + SEAM / 2
      if (left > x1 || left + cellW < x0 || top > y1 || top + cellH < y0) continue
      const img = getSprite(t.terrain)
      if (!(img.complete && img.naturalWidth > 0)) continue
      if (square) { ctx.drawImage(img, left, top, cellW, cellH) }
      else { ctx.save(); hexPath(ctx, left, top, cellW, cellH); ctx.clip(); ctx.drawImage(img, left, top, cellW, cellH); ctx.restore() }
    }
  }
  const updateView = () => {
    const vp = viewportRef.current; if (!vp) return
    const { scale, tx, ty } = cameraRef.current
    const next = { x0: -tx / scale - CULL, y0: -ty / scale - CULL, x1: (vp.clientWidth - tx) / scale + CULL, y1: (vp.clientHeight - ty) / scale + CULL }
    const p = viewRef.current
    if (p && Math.abs(p.x0 - next.x0) < HEX_W && Math.abs(p.x1 - next.x1) < HEX_W && Math.abs(p.y0 - next.y0) < HEX_H && Math.abs(p.y1 - next.y1) < HEX_H) return
    viewRef.current = next; setView(next)
  }
  const applyTransform = () => {
    const { scale, tx, ty } = cameraRef.current
    if (contentRef.current) contentRef.current.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`
    drawTerrain(); updateView()
  }
  const fitCamera = () => {
    const vp = viewportRef.current; if (!vp || !layout.w || !layout.h) return null
    const W = vp.clientWidth, H = vp.clientHeight
    const scale = Math.min(W / layout.w, H / layout.h) * FIT_PAD
    return { scale, tx: (W - layout.w * scale) / 2, ty: (H - layout.h * scale) / 2 }
  }
  const scaleBounds = () => {
    const vp = viewportRef.current; const W = vp.clientWidth, H = vp.clientHeight
    const min = Math.min(W / layout.w, H / layout.h) * FIT_PAD
    return { min, max: Math.max(min, Math.min(W, H) / (MIN_ACROSS * HEX_W)) }
  }
  const clampPan = (cam) => {
    const vp = viewportRef.current; const W = vp.clientWidth, H = vp.clientHeight
    const cw = layout.w * cam.scale, ch = layout.h * cam.scale
    return { scale: cam.scale, tx: cw <= W ? (W - cw) / 2 : clamp(cam.tx, W - cw, 0), ty: ch <= H ? (H - ch) / 2 : clamp(cam.ty, H - ch, 0) }
  }

  useLayoutEffect(() => { if (!didMount.current) { didMount.current = true; const t = fitCamera(); if (t) { cameraRef.current = t; applyTransform() } } })
  useLayoutEffect(() => { drawTerrain() })
  useEffect(() => {
    const vp = viewportRef.current; if (!vp) return
    const ro = new ResizeObserver(() => { const t = fitCamera(); if (t) { cameraRef.current = t; applyTransform() } }); ro.observe(vp)
    const onWheel = (e) => {
      e.preventDefault()
      const rect = vp.getBoundingClientRect(); const cx = e.clientX - rect.left, cy = e.clientY - rect.top
      const cam = cameraRef.current; const { min, max } = scaleBounds(); const f = e.deltaY < 0 ? 1.14 : 1 / 1.14
      const ns = clamp(cam.scale * f, min, max); const wx = (cx - cam.tx) / cam.scale, wy = (cy - cam.ty) / cam.scale
      cameraRef.current = clampPan({ scale: ns, tx: cx - wx * ns, ty: cy - wy * ns }); applyTransform()
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => { ro.disconnect(); vp.removeEventListener('wheel', onWheel) }
  }, [layout]) // eslint-disable-line

  const tileAt = (clientX, clientY) => {
    const vp = viewportRef.current; if (!vp) return null
    const rect = vp.getBoundingClientRect(); const { scale, tx, ty } = cameraRef.current
    const cx = (clientX - rect.left - tx) / scale + layout.minX
    const cy = (clientY - rect.top - ty) / scale + layout.minY
    const { q, r } = fromPixel(cx, cy, HEX_SIZE)
    return g.tileAt(hkey(q, r))
  }
  const onDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return
    if (e.button === 1) e.preventDefault()
    dragRef.current = { x: e.clientX, y: e.clientY, cam: { ...cameraRef.current }, moved: false }
    const onMove = (ev) => { const d = dragRef.current; if (!d) return; if (Math.abs(ev.clientX - d.x) > 3 || Math.abs(ev.clientY - d.y) > 3) d.moved = true; cameraRef.current = clampPan({ scale: d.cam.scale, tx: d.cam.tx + (ev.clientX - d.x), ty: d.cam.ty + (ev.clientY - d.y) }); applyTransform() }
    const onUp = () => { if (dragRef.current?.moved) suppressClickRef.current = true; dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }
  const onHover = (e) => { if (dragRef.current) return; const t = tileAt(e.clientX, e.clientY); setHover((h) => { const k = t ? t.key : null; return h === k ? h : k }) }
  const onClick = (e) => { if (suppressClickRef.current) { suppressClickRef.current = false; return } const t = tileAt(e.clientX, e.clientY); if (!t) return; if (placing) g.placeAt(t.key); else if (expand[t.key]) g.expandAt(t.key) }

  const shown = useMemo(() => {
    if (!view) return []
    const out = []
    for (const t of tiles) { const x = t.x * HEX_SIZE - layout.minX, y = t.y * HEX_SIZE - layout.minY; if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue; out.push(t) }
    return out
  }, [tiles, layout, view])

  const nameSize = HEX_W * 0.15
  return (
    <div className="v5-map" ref={viewportRef} onMouseDown={onDown} onMouseMove={onHover} onMouseLeave={() => setHover(null)} onClick={onClick}>
      <canvas className="v5-canvas" ref={canvasRef} />
      <div className="v5-content" ref={contentRef} style={{ width: layout.w, height: layout.h }}>
        <svg className="v5-ov" width={layout.w} height={layout.h}>
          {shown.map((t) => {
            const controlled = g.controlled.has(t.key)
            const canPlace = placeSet?.has(t.key)
            const isExp = !!expand[t.key] && !placing && !g.deployed.has(t.key)
            if (!controlled && !canPlace && !isExp) return null
            const c = centerOf(t.q, t.r)
            const cls = [controlled && 'ov-own', canPlace && 'ov-place', isExp && 'ov-exp'].filter(Boolean).join(' ')
            return <polygon key={t.key} className={cls} points={hexPoints(c.x, c.y, HEX_SIZE - SEAM)} />
          })}
        </svg>
        {shown.map((t) => {
          const inst = g.deployed.get(t.key); if (!inst) return null
          const dep = DEPLOYABLES[inst.id]; const c = centerOf(t.q, t.r)
          return (
            <div key={t.key} className="v5-piece" style={{ left: c.x, top: c.y, width: HEX_W * 0.66, height: HEX_W * 0.66 }}>
              <div className="v5-badge" style={{ borderColor: catColor(dep) }}><img src={silFor(dep)} alt="" /></div>
              <div className="v5-pname" style={{ fontSize: nameSize }}>{dep.name}</div>
            </div>
          )
        })}
        {shown.map((t) => {
          const e = expand[t.key]; if (!e || placing || g.deployed.has(t.key)) return null
          const c = centerOf(t.q, t.r); const yl = Object.keys(TERRAIN[t.terrain]?.yield || {})
          return (
            <div key={t.key} className="v5-expm" style={{ left: c.x, top: c.y - HEX_H * 0.3, fontSize: nameSize }}>
              <span className="v5-expcost"><img src={RES_ICON.food} alt="" />{e.cost}</span>
              {yl.length > 0 && <span className="v5-expy">{yl.map((r) => <img key={r} src={RES_ICON[r]} alt="" />)}</span>}
            </div>
          )
        })}
      </div>
      {hover && <MapHoverCard g={g} k={hover} />}
      <div className="v5-map-hint">{placing ? 'Click a highlighted tile to build.' : 'Scroll to zoom · drag to pan · click a food-marked tile to expand.'}</div>
    </div>
  )
}

function MapHoverCard({ g, k }) {
  const t = g.tileAt(k)
  if (!t) return null
  const inst = g.deployed.get(k)
  const dep = inst && DEPLOYABLES[inst.id]
  const out = inst && g.tileOutput(k)
  const sc = inst && g.instScalars(k)
  const scLines = sc ? DOMAINS.map((d) => ({ d, ...sc[d] })).filter((x) => x.atk || x.def || x.bomb) : []
  const cdef = TERRAIN[t.terrain]        // content economy def (may be undefined off-world)
  const tdef = terrainOf(t.terrain)      // v4 registry — always defined (name, sprite)
  const tName = cdef?.name || tdef.name
  // Live yield includes tech modifiers (e.g. Foraging → forest +1 food) for content terrains.
  const tYield = cdef ? g.terrainYield(t) : (tdef.yields || {})
  return (
    <div className="v5-hover">
      <NineSlice src="/sprites/ui/box.png" slice={205} width={18} className="frame">
        {dep ? (
          <>
            <div className="hv-h"><img className="sil-i" src={silFor(dep)} alt="" /><b>{dep.name}</b><span className="hv-sub">{dep.type} · {dep.subtype}</span></div>
            <div className="hv-desc"><IconText>{dep.desc}</IconText></div>
            {out && Object.keys(out).length > 0 && (
              <div className="hv-out"><span className="hv-lbl">Output / turn</span>{Object.entries(out).map(([r, v]) => <span key={r} className="hv-chip"><RIco r={r} s={13} />{v}</span>)}</div>
            )}
            {scLines.length > 0 && (
              <div className="hv-out"><span className="hv-lbl">Combat</span>{scLines.map((x) => (
                <span key={x.d} className="hv-chip cap">{x.d}: {x.atk ? <><SIco st="atk" s={12} />{x.atk} </> : ''}{x.def ? <><SIco st="def" s={12} />{x.def} </> : ''}{x.bomb ? <><SIco st="bomb" s={12} />{x.bomb}</> : ''}</span>
              ))}</div>
            )}
          </>
        ) : (
          <>
            <div className="hv-h"><b>{tName}</b>{t.region === 'new_world' && <span className="hv-nw">New World ×2</span>}{t.region === 'old_world' && <span className="hv-ow">Old World</span>}{(t.region === 'exoplanet' || t.region === 'mini_exo') && <span className="hv-exo">Exoplanet ×4</span>}<span className="hv-sub">{g.controlled.has(k) ? 'controlled' : cdef ? 'unclaimed' : 'unreachable'}</span></div>
            <div className="hv-out">{Object.entries(tYield).filter(([, v]) => v > 0).map(([r, v]) => <span key={r} className="hv-chip"><RIco r={r} s={13} />{v}</span>)}{cdef?.defBonus ? <span className="hv-chip"><SIco st="def" s={12} />+{cdef.defBonus}</span> : null}{Object.values(tYield).every((v) => !v) && <span className="hv-chip">no yield</span>}</div>
          </>
        )}
      </NineSlice>
    </div>
  )
}

function Sidebar({ g }) {
  // Collapse a menu when there is nothing you can act on right now.
  const canResearch = g.offerData().some((o) => o.affordable)
  const canBuild = g.buildableList().some((b) => b.affordable)
  return (
    <aside className="v5-side">
      <NineSlice src="/sprites/ui/box.png" slice={205} width={20} className="v5-sidebody">
        {canResearch && <ResearchPanel g={g} />}
        {canResearch && canBuild && <div className="v5-sep" />}
        {canBuild && <BuildPanel g={g} />}
        {!canResearch && !canBuild && (
          <div className="v5-nada"><IconText>Nothing affordable yet — end your turn to gather more :production: and :progress:.</IconText></div>
        )}
      </NineSlice>
    </aside>
  )
}

function ResearchPanel({ g }) {
  const offer = g.offerData()
  return (
    <div className="panel">
      <div className="panel-h">Research <span className="sub">{g.eraName()} · {g.unlocksThisEra}/3 to next era</span></div>
      {offer.map((o, i) => (
        <div key={o.id} className={`tech ${o.wildcard ? 'wild' : ''}`}>
          <div className="tech-top"><b>{o.tech.name}</b><span className="flav">{o.tech.flavor}{o.wildcard ? ' · wildcard' : ''}</span></div>
          <div className="tech-desc"><IconText>{o.tech.desc}</IconText></div>
          <div className="tech-act">
            <button disabled={!o.affordable} onClick={() => g.unlockTech(o.id)}>Unlock · {o.cost} <RIco r="progress" s={13} /></button>
            <InfoTip text={g.rerollTokens > 0 ? 'Reroll this option — free (from Astrology).' : `Reroll for ${5 + 5 * g.rerollsUsed} gold. Cost rises each reroll.`}>
              <button className="reroll" onClick={() => g.reroll(i)}>⟳ {g.rerollTokens > 0 ? 'free' : <>{5 + 5 * g.rerollsUsed}<RIco r="gold" s={12} /></>}</button>
            </InfoTip>
          </div>
        </div>
      ))}
      {offer.length === 0 && <div className="empty">All options taken — new research arrives next turn.</div>}
    </div>
  )
}

function BuildPanel({ g }) {
  const list = g.buildableList()
  return (
    <div className="panel">
      <div className="panel-h">Build <span className="sub"><RIco r="production" s={13} /> {fmt(g.resources.production)}</span></div>
      <div className="build-grid">
        {list.map(({ id, dep, cost, affordable }) => (
          <InfoTip key={id} text={`${dep.desc}\n\nCost ${cost} :production:  ·  Upkeep ${dep.upkeep} :gold:`}>
            <button className={`bcard ${g.selection?.deployableId === id ? 'sel' : ''}`} disabled={!affordable} onClick={() => g.beginBuild(id)}>
              <img className="bsil" src={silFor(dep)} alt="" />
              <span className="bname">{dep.name}</span>
              <span className="bcost">{cost}<RIco r="production" s={12} /></span>
            </button>
          </InfoTip>
        ))}
      </div>
      <div className="hint">Pick one, then click a tile. A deployable replaces its tile’s natural yield.</div>
    </div>
  )
}

function WavePanel({ g }) {
  const enemy = g.enemyCard
  const you = g.playerScalars()
  const pred = g.previewCombat()
  const [sim, setSim] = useState(false)
  return (
    <div className="panel">
      <div className="panel-h">Next Wave <span className="sub">#{enemy?.wave} · {enemy?.archetypeName}</span></div>
      {pred && (
        <div className="predict">
          <div className="predict-h">Predicted outcome</div>
          <div className="predict-row">
            <span className="gold"><RIco r="gold" s={15} /> +{pred.goldGained} gold</span>
            <span className="loss"><RIco r="legitimacy" s={15} /> −{pred.legitimacyLost} legit</span>
          </div>
          <div className="predict-sub">won: {pred.won.map(cap).join(', ') || '—'} · lost: {pred.lost.map(cap).join(', ') || '—'}</div>
          <button className="sim-btn" onClick={() => setSim(true)}>▶ Simulate battle</button>
        </div>
      )}
      <ScalarTable title="Your military" s={you} accent="#5aa0d0" />
      <div className="vs">▼ resolves against ▼</div>
      <ScalarTable title="Enemy card" s={enemy?.scalars} accent="#c0563b" />
      <div className="hint">Combat is an empire-wide aggregate of these 12 scalars. Bombardment fires first and spills downward.</div>
      {sim && enemy && (
        <CombatOverlay title={`Wave ${enemy.wave} — simulation (no effect)`} player={you} enemy={enemy.scalars}
          dismissLabel="Close" onDismiss={() => setSim(false)} />
      )}
    </div>
  )
}
function ScalarTable({ title, s, accent }) {
  if (!s) return null
  return (
    <div className="stbl">
      <div className="stbl-h" style={{ color: accent }}>{title}</div>
      <table>
        <thead><tr><th></th><th><SIco st="atk" s={13} /></th><th><SIco st="def" s={13} /></th><th><SIco st="bomb" s={13} /></th></tr></thead>
        <tbody>
          {DOMAINS.map((d) => { const row = s[d]; const z = !row.atk && !row.def && !row.bomb; return (
            <tr key={d} className={z ? 'z' : ''}><td className="dm">{d}</td><td>{row.atk}</td><td>{row.def}</td><td>{row.bomb}</td></tr>) })}
        </tbody>
      </table>
    </div>
  )
}

// ---- combat theater ----
function CombatOverlay({ title, player, enemy, dismissLabel, onDismiss }) {
  return (
    <div className="v5-modal-bg" onClick={onDismiss}>
      <NineSlice src="/sprites/ui/box.png" slice={205} width={24} className="v5-theater" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <CombatTheater player={player} enemy={enemy} />
        <button className="v5-cont" onClick={onDismiss}>{dismissLabel}</button>
      </NineSlice>
    </div>
  )
}
function CombatTheater({ player, enemy }) {
  const { frames, result } = useMemo(() => resolveCombatTimeline(player, enemy), [player, enemy])
  const last = frames.length - 1
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  useEffect(() => {
    if (!playing || i >= last) return
    const id = setTimeout(() => setI((x) => Math.min(last, x + 1)), 640 / speed)
    return () => clearTimeout(id)
  }, [playing, i, speed, last])
  const cur = frames[i]
  const start = frames[0]
  const done = i >= last
  const shown = DOMAINS.filter((d) => domainHasForce(start.P[d]) || domainHasForce(start.E[d]))
  const scale = {}
  for (const d of shown) scale[d] = Math.max(1, total(start.P[d]), total(start.E[d]))
  const phaseLabel = cur.phase === 'start' ? 'Battle begins' : cur.phase === 'end' ? 'Resolved' : `${cap(cur.domain)} — ${cur.phase === 'bombard' ? 'Bombardment' : 'Attack'}`
  const toggle = () => { if (done) { setI(0); setPlaying(true) } else setPlaying((p) => !p) }
  return (
    <div className="ct">
      <div className="ct-phase">{phaseLabel}</div>
      <div className="ct-board" style={{ gridTemplateColumns: `repeat(${shown.length}, 1fr)` }}>
        {shown.map((d) => (
          <div key={d} className={`ct-dom ${cur.domain === d && cur.phase !== 'end' ? 'active' : ''}`}>
            <div className="ct-dh">{d}</div>
            <Army side="you" pool={cur.P[d]} scale={scale[d]} />
            <div className="ct-mid">vs</div>
            <Army side="foe" pool={cur.E[d]} scale={scale[d]} />
          </div>
        ))}
      </div>
      <div className={`ct-score ${done ? 'show' : ''}`}>
        <span className="gold"><RIco r="gold" s={18} /> +{result.goldGained}</span>
        <span className="loss"><RIco r="legitimacy" s={18} /> −{result.legitimacyLost}</span>
      </div>
      <div className="ct-controls">
        <button onClick={() => setI(0)} title="Restart">⟲</button>
        <button onClick={toggle} title="Play / pause">{playing && !done ? '❚❚' : '▶'}</button>
        <button onClick={() => { setPlaying(false); setI((x) => Math.min(last, x + 1)) }} title="Step">⏭</button>
        <button onClick={() => setI(last)} title="Skip to end">Skip</button>
        <span className="ct-spd">{[1, 2, 4].map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}</span>
      </div>
    </div>
  )
}
function Army({ side, pool, scale }) {
  return (
    <div className={`ct-army ${side}`}>
      <div className="ct-side">{side === 'you' ? 'You' : 'Foe'}</div>
      {['def', 'atk', 'bomb'].map((st) => (
        <div key={st} className="ct-bar-row">
          <img className="ric" src={STAT_ICON[st]} alt={st} />
          <div className="ct-bar"><div className={`ct-fill ${st}`} style={{ width: `${Math.min(100, (pool[st] / scale) * 100)}%` }} /></div>
          <span className="ct-bv">{pool[st]}</span>
        </div>
      ))}
    </div>
  )
}

function SelectionBanner({ g }) {
  const dep = DEPLOYABLES[g.selection.deployableId]
  return (
    <div className="v5-selband">
      <img className="sil-i" src={silFor(dep)} alt="" />Placing <b>{dep.name}</b> — click a highlighted tile.
      <button onClick={() => g.cancelSelection()}>Cancel</button>
    </div>
  )
}

function EndOverlay({ g, onExit }) {
  const won = g.status === 'won'
  return (
    <div className="v5-modal-bg">
      <NineSlice src="/sprites/ui/box.png" slice={205} width={28} className={`v5-end ${won ? 'win' : 'lose'}`}>
        <h1>{won ? 'Victory' : 'Defeat'}</h1>
        <p>{won ? 'Your civilization ascends.' : 'Your legitimacy has collapsed.'}</p>
        <p className="sub">Survived {g.waveCount} waves · reached the {g.eraName()} era.</p>
        <button onClick={onExit}>Return to Title</button>
      </NineSlice>
    </div>
  )
}
