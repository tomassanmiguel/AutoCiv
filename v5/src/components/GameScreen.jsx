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
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [creativeOpen, setCreativeOpen] = useState(false)
  useEffect(() => { if (audio) audio.playTrack(trackForEra(g.era)) }, [g.era, audio])
  const showCombat = g.lastCombat && g.lastCombat.wave > seenWave
  return (
    <div className={`v5 ${g.creative ? 'creative' : ''}`}>
      <TopBar g={g} onExit={onExit} onWave={() => setWaveOpen(true)} onTaken={() => setTakenOpen(true)} onIncome={() => setIncomeOpen(true)} onCreativeMenu={() => setCreativeOpen(true)} />
      <div className="v5-body">
        <HexMap g={g} />
        <Sidebar g={g} />
      </div>
      {g.selection && <SelectionBanner g={g} />}
      {waveOpen && <WaveOverlay g={g} onClose={() => setWaveOpen(false)} />}
      {takenOpen && <TakenOverlay g={g} onClose={() => setTakenOpen(false)} />}
      {incomeOpen && <IncomeOverlay g={g} onClose={() => setIncomeOpen(false)} />}
      {creativeOpen && <CreativeTechOverlay g={g} onClose={() => setCreativeOpen(false)} />}
      {showCombat && (
        <CombatOverlay title={`Wave ${g.lastCombat.wave} · ${g.lastCombat.enemy.archetypeName}`}
          player={g.lastCombat.player} enemy={g.lastCombat.enemy.scalars} creative={g.creative}
          dismissLabel="Continue" onDismiss={() => setSeenWave(g.lastCombat.wave)} />
      )}
      {g.status !== 'playing' && <EndOverlay g={g} onExit={onExit} />}
    </div>
  )
}

function TopBar({ g, onExit, onWave, onTaken, onIncome, onCreativeMenu }) {
  const pt = g.perTurn()
  const dueIn = g.turnsUntilWave()
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
          <div className="v5-stat legit"><RIco r="legitimacy" s={20} /><b>{g.creative ? '∞' : fmt(g.legitimacy)}</b>{!g.creative && delta(pt.income.legitimacy)}</div>
        </InfoTip>
        {RES_KEYS.map((r) => (
          <InfoTip key={r} text={r === 'gold' ? goldTip : resTip[r]}>
            <div className="v5-stat"><RIco r={r} s={17} /><b>{g.creative ? '∞' : fmt(g.resources[r])}</b>{!g.creative && delta(pt.net[r])}</div>
          </InfoTip>
        ))}
      </div>
      <InfoTip text="Income breakdown — what every tile and building contributes, per resource.">
        <button className="v5-iconbtn" onClick={onIncome}>📊</button>
      </InfoTip>
      <InfoTip text="Technologies researched, by era.">
        <button className="v5-iconbtn" onClick={onTaken}>📜</button>
      </InfoTip>
      <InfoTip text={g.creative ? 'Creative Mode ON — everything unlocked, infinite resources, no death. Click to turn off.' : 'Creative Mode — unlock all deployables, infinite resources, and research anything (for manual testing).'}>
        <button className={`v5-iconbtn ${g.creative ? 'creative-on' : ''}`} onClick={() => g.setCreative(!g.creative)}>🛠</button>
      </InfoTip>
      {g.creative && (
        <InfoTip text="Unlock any technology instantly.">
          <button className="v5-iconbtn creative-on" onClick={onCreativeMenu}>⚗</button>
        </InfoTip>
      )}
      {g.creative && (
        <InfoTip text="Reveal the whole map (fog stays off only for tiles now shown).">
          <button className="v5-iconbtn creative-on" onClick={() => g.revealAllMap()}>🗺</button>
        </InfoTip>
      )}
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

function IncomeOverlay({ g, onClose }) {
  const RESES = ['production', 'gold', 'food', 'progress', 'legitimacy']
  const [tab, setTab] = useState('production')
  const { rows } = g.incomeBreakdown()
  const num = (v) => { const r = Math.round(v * 10) / 10; return Number.isInteger(r) ? `${r}` : r.toFixed(1) }
  const sign = (v) => `${v > 0 ? '+' : ''}${num(v)}`
  const SECTIONS = [
    { key: 'tile', title: 'Tiles' }, { key: 'building', title: 'Buildings' }, { key: 'unit', title: 'Units' },
    { key: 'palace', title: 'Palace' }, { key: 'bonus', title: 'Bonuses' }, { key: 'upkeep', title: 'Upkeep' },
    { key: 'merc', title: 'Mercenaries' },
  ]
  const isMil = tab === 'military'
  const list = isMil ? [] : (rows[tab] || [])
  const total = list.reduce((s, x) => s + x.amount, 0)
  const mil = isMil ? g.militaryBreakdown() : null
  const hasForce = (t) => t && (t.atk || t.def || t.bomb)
  const StatCells = ({ s, cls = '' }) => (
    <span className={`mil-stats ${cls}`}>
      <span className={s.atk ? '' : 'z'}><SIco st="atk" s={12} />{s.atk || 0}</span>
      <span className={s.def ? '' : 'z'}><SIco st="def" s={12} />{s.def || 0}</span>
      <span className={s.bomb ? '' : 'z'}><SIco st="bomb" s={12} />{s.bomb || 0}</span>
    </span>
  )
  return (
    <div className="v5-modal-bg" onClick={onClose}>
      <NineSlice src="/sprites/ui/box.png" slice={205} width={24} className="v5-theater income" onClick={(e) => e.stopPropagation()}>
        <h2>{isMil ? 'Military Breakdown' : 'Income Breakdown'}</h2>
        <div className="inc-tabs">
          {RESES.map((r) => (
            <button key={r} className={`inc-tab ${tab === r ? 'on' : ''}`} onClick={() => setTab(r)}>
              <RIco r={r} s={18} /><span className={`inc-tt ${(rows[r] || []).reduce((s, x) => s + x.amount, 0) < 0 ? 'neg' : 'pos'}`}>{sign((rows[r] || []).reduce((s, x) => s + x.amount, 0))}</span>
            </button>
          ))}
          <button className={`inc-tab ${isMil ? 'on' : ''}`} onClick={() => setTab('military')} title="Military">
            <SIco st="atk" s={18} /><span className="inc-tt mil-lbl">⚔</span>
          </button>
        </div>
        {isMil ? (
          <div className="inc-body">
            {DOMAINS.filter((d) => hasForce(mil.totals[d])).map((d) => (
              <div key={d} className="inc-sec">
                <div className="inc-sec-h mil-h">{cap(d)}<StatCells s={mil.totals[d]} cls="tot" /></div>
                {mil.domains[d].map((it) => (
                  <div key={`${it.group}-${it.label}`} className="inc-row">
                    <span className="inc-name">{it.label}{it.count > 1 && (it.group === 'unit' || it.group === 'building') ? <span className="inc-cnt">×{it.count}</span> : null}</span>
                    <StatCells s={it} />
                  </div>
                ))}
              </div>
            ))}
            {DOMAINS.every((d) => !hasForce(mil.totals[d])) && <div className="inc-empty">No military yet — build some units.</div>}
          </div>
        ) : (
          <>
            <div className="inc-total"><span>Net / turn</span><b className={total < 0 ? 'neg' : 'pos'}><RIco r={tab} s={16} /> {sign(total)}</b></div>
            <div className="inc-body">
              {SECTIONS.map((sec) => {
                const items = list.filter((x) => x.group === sec.key)
                if (!items.length) return null
                return (
                  <div key={sec.key} className="inc-sec">
                    <div className="inc-sec-h">{sec.title}</div>
                    {items.map((it) => (
                      <div key={`${it.group}-${it.label}`} className="inc-row">
                        <span className="inc-name">{it.label}{it.count > 1 && (sec.key === 'tile' || sec.key === 'building' || sec.key === 'unit' || sec.key === 'upkeep') ? <span className="inc-cnt">×{it.count}</span> : null}</span>
                        <span className={`inc-amt ${it.amount < 0 ? 'neg' : 'pos'}`}>{sign(it.amount)}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
              {list.length === 0 && <div className="inc-empty">No {tab} income yet.</div>}
            </div>
          </>
        )}
        <button className="v5-cont" onClick={onClose}>Close</button>
      </NineSlice>
    </div>
  )
}

function CreativeTechOverlay({ g, onClose }) {
  const byEra = {}
  for (const id in TECHS) { const t = TECHS[id]; (byEra[t.era] ||= []).push(t) }
  const eras = ERAS.filter((e) => byEra[e])
  return (
    <div className="v5-modal-bg" onClick={onClose}>
      <NineSlice src="/sprites/ui/box.png" slice={205} width={24} className="v5-theater taken" onClick={(e) => e.stopPropagation()}>
        <h2>Creative — Unlock Technologies</h2>
        <p className="taken-empty">Click any technology to research it instantly.</p>
        {eras.map((e) => {
          const owned = byEra[e].filter((t) => g.taken.has(t.id)).length
          return (
            <div key={e} className="taken-era">
              <div className="taken-eh">{e} <span>({owned}/{byEra[e].length})</span></div>
              <div className="taken-list">{byEra[e].map((t) => {
                const has = g.taken.has(t.id)
                return (
                  <InfoTip key={t.id} text={`${t.flavor} · ${t.desc}`}>
                    <button className={`taken-chip cre ${has ? 'owned' : ''}`} disabled={has} onClick={() => g.unlockTechDirect(t.id)}>{has ? '✓ ' : ''}{t.name}</button>
                  </InfoTip>
                )
              })}</div>
            </div>
          )
        })}
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
      // fog-of-war: unexplored tiles render as dark fog (Creative Mode lifts it).
      if (!g.isExplored(t.key)) {
        ctx.fillStyle = '#0a0d18'
        if (square) { ctx.fillRect(left, top, cellW, cellH) }
        else { ctx.save(); hexPath(ctx, left, top, cellW, cellH); ctx.clip(); ctx.fillRect(left, top, cellW, cellH); ctx.restore() }
        continue
      }
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
    // Allow panning at ANY zoom (even fully zoomed out) rather than hard-centering when the map
    // is smaller than the viewport — but on a per-axis leash so it can't slide WAY off-screen.
    // Horizontal is kept tighter than vertical (the map is wider than it is tall).
    const clampAxis = (t, content, view, m) => clamp(t, Math.min(0, view - content) - m, Math.max(0, view - content) + m)
    return {
      scale: cam.scale,
      tx: clampAxis(cam.tx, cw, W, W * 0.3),
      ty: clampAxis(cam.ty, ch, H, H * 0.5),
    }
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
        {g.explorers.map((exp) => {
          const t = g.tileAt(exp.key); if (!t) return null
          const dep = DEPLOYABLES[exp.id]; const c = centerOf(t.q, t.r)
          return (
            <div key={`exp-${exp.id}-${exp.key}`} className="v5-piece explorer" style={{ left: c.x, top: c.y, width: HEX_W * 0.66, height: HEX_W * 0.66 }}>
              <div className="v5-badge" style={{ borderColor: '#57c7ff' }}><img src={silFor(dep)} alt="" /></div>
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
  if (!g.isExplored(k)) return (
    <div className="v5-hover">
      <NineSlice src="/sprites/ui/box.png" slice={205} width={18} className="frame">
        <div className="hv-h"><b>Unexplored</b><span className="hv-sub">send an explorer to reveal</span></div>
      </NineSlice>
    </div>
  )
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
            <div className="hv-h"><b>{tName}</b>{t.region === 'new_world' && <span className="hv-nw">New World ×2</span>}{t.region === 'old_world' && <span className="hv-ow">Old World</span>}{t.region === 'exoplanet' && <span className="hv-exo">Exoplanet ×4</span>}<span className="hv-sub">{g.controlled.has(k) ? 'controlled' : cdef ? 'unclaimed' : 'unreachable'}</span></div>
            <div className="hv-out">{Object.entries(tYield).filter(([, v]) => v > 0).map(([r, v]) => <span key={r} className="hv-chip"><RIco r={r} s={13} />{v}</span>)}{cdef?.defBonus ? <span className="hv-chip"><SIco st="def" s={12} />+{cdef.defBonus}</span> : null}{Object.values(tYield).every((v) => !v) && <span className="hv-chip">no yield</span>}</div>
          </>
        )}
      </NineSlice>
    </div>
  )
}

function Sidebar({ g }) {
  return (
    <aside className="v5-side">
      <NineSlice src="/sprites/ui/box.png" slice={205} width={20} className="v5-sidebody">
        <ResearchPanel g={g} />
        <div className="v5-sep" />
        <BuildPanel g={g} />
      </NineSlice>
    </aside>
  )
}

function techUnlockTip(tech) {
  // Techs that unlock a deployable should surface that deployable's own rules on hover.
  const eff = (tech.effects || []).find((e) => e.name === 'unlock_deployable')
  const dep = eff && DEPLOYABLES[eff.deployable]
  if (!dep) return null
  const t = dep.type === 'unit' ? 'Unit' : 'Building'
  return `Unlocks ${dep.name} — ${t}${dep.subtype ? ` · ${dep.subtype}` : ''}\n${dep.desc}\n\nCost ${dep.production} :production: · Upkeep ${dep.upkeep} :gold:`
}
function ResearchPanel({ g }) {
  const offer = g.offerData()
  const rerollCost = 5 + 5 * g.rerollsUsed
  const canReroll = g.rerollTokens > 0 || g.resources.gold >= rerollCost
  return (
    <div className="panel">
      <div className="panel-h">Research <span className="sub">{g.eraName()} · {g.unlocksThisEra}/{g.eraUnlocksNeeded()} to next era</span></div>
      {offer.map((o, i) => {
        const depTip = techUnlockTip(o.tech)
        return (
          <div key={o.id} className={`tech ${o.wildcard ? 'wild' : ''}`}>
            <InfoTip text={depTip || `${o.tech.flavor} · ${o.tech.desc}`}>
              <div className="tech-info">
                <div className="tech-top"><b>{o.tech.name}</b><span className="flav">{o.tech.flavor}{o.wildcard ? ' · wildcard' : ''}</span></div>
                <div className="tech-desc"><IconText>{o.tech.desc}</IconText></div>
              </div>
            </InfoTip>
            <div className="tech-act">
              <button disabled={!o.affordable} onClick={() => g.unlockTech(o.id)}>Unlock · {o.cost} <RIco r="progress" s={13} /></button>
              <InfoTip text={g.rerollTokens > 0 ? 'Reroll this option — free (from Astrology).' : canReroll ? `Reroll for ${rerollCost} gold. Cost rises each reroll.` : `Reroll costs ${rerollCost} gold — not enough gold.`}>
                <button className="reroll" disabled={!canReroll} onClick={() => g.reroll(i)}>⟳ {g.rerollTokens > 0 ? 'free' : <>{rerollCost}<RIco r="gold" s={12} /></>}</button>
              </InfoTip>
            </div>
          </div>
        )
      })}
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
  const you = g.combatScalars()
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
      <MercPanel g={g} />
      <div className="hint">Combat is an empire-wide aggregate of these 12 scalars. Bombardment fires first and spills downward.</div>
      {sim && enemy && (
        <CombatOverlay title={`Wave ${enemy.wave} — simulation`} player={you} enemy={enemy.scalars} creative={g.creative}
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

function MercPanel({ g }) {
  if (!g.mercUnlocked()) return null
  const rows = g.mercInfo()
  const emb = rows[0]?.embassy || 0
  return (
    <div className="merc">
      <div className="merc-h">Mercenaries <span className="sub">temporary — spent this wave</span></div>
      {rows.map((r) => (
        <div key={r.domain} className={`merc-row ${r.present ? '' : 'off'}`}>
          <span className="merc-dm">{cap(r.domain)}</span>
          <span className="merc-cost">{r.cost}<RIco r="gold" s={11} />/<SIco st="atk" s={11} /></span>
          <span className="merc-have">{r.atk ? <>+{r.atk}<SIco st="atk" s={11} /></> : null}{r.def ? <> +{r.def}<SIco st="def" s={11} /></> : null}</span>
          {r.present ? (
            <span className="merc-btns">
              <button disabled={!r.canAfford1} onClick={() => g.hireMerc(r.domain, 1)}>+1</button>
              <button disabled={!r.canAfford1} onClick={() => g.hireMerc(r.domain, 10)}>+10</button>
            </span>
          ) : <span className="merc-noio">no presence</span>}
        </div>
      ))}
      {emb > 0 && <div className="merc-emb"><IconText>Embassy auto-hires +{emb} :attack: in every domain.</IconText></div>}
      <div className="merc-hint">Mercenaries boost only your side — the enemy card is fixed to your board army.</div>
    </div>
  )
}

// ---- combat theater ----
// Creative dials ADD a flat power block per domain (so you can inject force into an
// otherwise-empty domain to preview e.g. a land+sea fight).
const domAdd = (s, add) => { const o = {}; for (const d of DOMAINS) { const a = add[d] || 0; o[d] = { atk: s[d].atk + a, def: s[d].def + a, bomb: s[d].bomb + a } } return o }
const NO_ADD = { land: 0, sea: 0, sky: 0, space: 0 }
// Per (side, domain, stat) sprite. Player = disciplined army; foe = barbarian horde.
const FIG = {
  you: { land: { atk: '⚔️', def: '🛡️', bomb: '🏹' }, sea: { atk: '🚣', def: '⛵', bomb: '⚓' }, sky: { atk: '✈️', def: '🎈', bomb: '💣' }, space: { atk: '🚀', def: '🛰️', bomb: '☄️' } },
  foe: { land: { atk: '🪓', def: '🛡', bomb: '🔥' }, sea: { atk: '🚩', def: '⛴️', bomb: '💥' }, sky: { atk: '🦅', def: '☁️', bomb: '🌩️' }, space: { atk: '👾', def: '🛸', bomb: '☄️' } },
}
const STAT_ORDER = ['def', 'atk', 'bomb']
const DOM_ICON = { land: '🌲', sea: '🌊', sky: '☁️', space: '🌌' }

function CombatOverlay({ title, player, enemy, dismissLabel, onDismiss, creative }) {
  return (
    <div className="cbt-bg" onClick={onDismiss}>
      <div className="cbt" onClick={(e) => e.stopPropagation()}>
        <CombatTheater title={title} player={player} enemy={enemy} onDismiss={onDismiss} dismissLabel={dismissLabel} creative={creative} />
      </div>
    </div>
  )
}
function CombatTheater({ title, player, enemy, onDismiss, dismissLabel, creative }) {
  const [pAdd, setPAdd] = useState(NO_ADD)
  const [eAdd, setEAdd] = useState(NO_ADD)
  const P0 = useMemo(() => domAdd(player, pAdd), [player, pAdd])
  const E0 = useMemo(() => domAdd(enemy, eAdd), [enemy, eAdd])
  const { frames, result } = useMemo(() => resolveCombatTimeline(P0, E0), [P0, E0])
  const last = frames.length - 1
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const restart = () => { setI(0); setPlaying(true) }
  const setDom = (setter, d) => (e) => { const val = +e.target.value; setter((p) => ({ ...p, [d]: val })); restart() }
  useEffect(() => {
    if (!playing || i >= last) return
    const id = setTimeout(() => setI((x) => Math.min(last, x + 1)), 760 / speed)
    return () => clearTimeout(id)
  }, [playing, i, speed, last])
  const cur = frames[i]
  const prev = frames[Math.max(0, i - 1)]
  const start = frames[0]
  const done = i >= last
  const shown = DOMAINS.filter((d) => domainHasForce(start.P[d]) || domainHasForce(start.E[d]))
  const phaseLabel = cur.phase === 'start' ? 'Battle Begins' : cur.phase === 'end' ? 'Battle Resolved' : `${cap(cur.domain)} — ${cur.phase === 'bombard' ? 'Bombardment' : 'Assault'}`
  const toggle = () => { if (done) { setI(0); setPlaying(true) } else setPlaying((p) => !p) }
  return (
    <>
      <div className="cbt-head">
        <div className="cbt-title">{title}</div>
        <div key={`${cur.phase}-${cur.domain}-${i === 0}`} className={`cbt-phase ph-${cur.phase}`}>{phaseLabel}</div>
      </div>
      <div className="cbt-lanes" style={{ '--lanes': shown.length || 1 }}>
        {shown.map((d) => (
          <CombatLane key={d} d={d} P={cur.P[d]} E={cur.E[d]} pPrev={prev.P[d]} ePrev={prev.E[d]}
            start={{ P: start.P[d], E: start.E[d] }} active={cur.domain === d && cur.phase !== 'end' && cur.phase !== 'start'} phase={cur.phase} />
        ))}
        {shown.length === 0 && <div className="cbt-empty">No forces engaged.</div>}
      </div>
      <div className={`cbt-score ${done ? 'show' : ''}`}>
        <span className="s-gold"><RIco r="gold" s={20} /> +{result.goldGained}</span>
        <span className="s-loss"><RIco r="legitimacy" s={20} /> −{result.legitimacyLost}</span>
        {(result.won.length > 0 || result.lost.length > 0) && (
          <span className="s-verdict">{result.won.length ? `▲ ${result.won.map(cap).join(', ')}` : ''}{result.won.length && result.lost.length ? '  ' : ''}{result.lost.length ? `▼ ${result.lost.map(cap).join(', ')}` : ''}</span>
        )}
      </div>
      <div className="cbt-controls">
        <button onClick={() => { setI(0); setPlaying(true) }} title="Replay">⟲</button>
        <button onClick={toggle} title="Play / pause">{playing && !done ? '❚❚' : '▶'}</button>
        <button onClick={() => { setPlaying(false); setI((x) => Math.min(last, x + 1)) }} title="Step">⏭</button>
        <button onClick={() => { setPlaying(false); setI(last) }} title="Skip to end">⏩</button>
        <span className="cbt-spd">{[1, 2, 4].map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}</span>
        <button className="cbt-done" onClick={onDismiss}>{dismissLabel}</button>
      </div>
      {creative && (
        <div className="cbt-dials">
          <div className="dial-hd"><span className="dh-lab">Creative — power per domain</span><span className="dh-you">You</span><span className="dh-foe">Enemy</span></div>
          {DOMAINS.map((d) => (
            <div key={d} className="dial-row">
              <span className="dial-dom">{DOM_ICON[d]} {cap(d)}</span>
              <span className="dial-cell"><input type="range" min="0" max="60" step="4" value={pAdd[d]} onChange={setDom(setPAdd, d)} /><b className="you">+{pAdd[d]}</b></span>
              <span className="dial-cell"><input type="range" min="0" max="60" step="4" value={eAdd[d]} onChange={setDom(setEAdd, d)} /><b className="foe">+{eAdd[d]}</b></span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
function CombatLane({ d, P, E, pPrev, ePrev, start, active, phase }) {
  const startMax = Math.max(1, start.P.atk, start.P.def, start.P.bomb, start.E.atk, start.E.def, start.E.bomb)
  const fires = (st) => active && ((phase === 'attack' && st === 'atk') || (phase === 'bombard' && st === 'bomb'))
  return (
    <div className={`cbt-lane dom-${d} ${active ? 'active' : ''}`}>
      <div className="lane-side you">
        <div className="lane-name">Your Empire</div>
        <div className="companies">{STAT_ORDER.map((st) => <Company key={st} side="you" d={d} st={st} val={P[st]} prev={pPrev[st]} startMax={startMax} firing={fires(st)} />)}</div>
      </div>
      <div className="lane-vs"><span className="lane-dom">{DOM_ICON[d]} {cap(d)}</span><span className="lane-x">⚔</span></div>
      <div className="lane-side foe">
        <div className="lane-name">👹 The Horde</div>
        <div className="companies">{STAT_ORDER.map((st) => <Company key={st} side="foe" d={d} st={st} val={E[st]} prev={ePrev[st]} startMax={startMax} firing={fires(st)} />)}</div>
      </div>
    </div>
  )
}
function Company({ side, d, st, val, prev, startMax, firing }) {
  const MAX = 6
  const figs = val <= 0 ? 0 : Math.max(1, Math.round((val / startMax) * MAX))
  const hit = val < prev
  const dead = val <= 0 && prev > 0
  const gone = val <= 0
  const sprite = FIG[side][d][st]
  return (
    <div className={`company st-${st} ${firing ? 'firing' : ''} ${hit ? 'hit' : ''} ${gone ? 'gone' : ''}`}>
      <div className="co-figs">
        {Array.from({ length: figs }, (_, k) => <span key={k} className="fig" style={{ animationDelay: `${k * 45}ms` }}>{sprite}</span>)}
        {dead && <span className="fig ghost">💀</span>}
      </div>
      <div className="co-meta"><img className="co-ico" src={STAT_ICON[st]} alt={st} /><span className="co-val">{val}</span></div>
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
