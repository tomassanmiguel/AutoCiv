import { useEffect, useMemo, useState } from 'react'
import { GameProvider, useGame } from '../game/react/GameProvider.jsx'
import { GameEngine } from '../game/GameEngine.js'
import { toPixel } from '../game/hex/coords.js'
import { TERRAIN, DEPLOYABLES } from '../game/data/content.js'
import { DOMAINS } from '../game/data/schema.js'
import { resolveCombatTimeline, domainHasForce } from '../game/systems/combat.js'
import { trackForEra } from '../game/audio/tracks.js'
import NineSlice from './common/NineSlice.jsx'
import InfoTip from './common/InfoTip.jsx'
import IconText from './common/IconText.jsx'
import './GameScreen.css'

const HEX = 34
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
  useEffect(() => { if (audio) audio.playTrack(trackForEra(g.era)) }, [g.era, audio])
  const showCombat = g.lastCombat && g.lastCombat.wave > seenWave
  return (
    <div className="v5">
      <TopBar g={g} onExit={onExit} />
      <div className="v5-body">
        <HexMap g={g} />
        <Sidebar g={g} />
      </div>
      {g.selection && <SelectionBanner g={g} />}
      {showCombat && (
        <CombatOverlay title={`Wave ${g.lastCombat.wave} · ${g.lastCombat.enemy.archetypeName}`}
          player={g.lastCombat.player} enemy={g.lastCombat.enemy.scalars}
          dismissLabel="Continue" onDismiss={() => setSeenWave(g.lastCombat.wave)} />
      )}
      {g.status !== 'playing' && <EndOverlay g={g} onExit={onExit} />}
    </div>
  )
}

function TopBar({ g, onExit }) {
  const pt = g.perTurn()
  const dueIn = (3 - (g.turn % 3)) % 3
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
      <InfoTip text={dueIn === 0 ? 'An enemy wave strikes at the end of this turn.' : `The next enemy wave arrives in ${dueIn} turn(s).`}>
        <div className={`v5-wave ${dueIn === 0 ? 'imminent' : ''}`}>⚔ {dueIn === 0 ? 'Wave now' : `Wave in ${dueIn}`}</div>
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
      <InfoTip text="Advance to the next turn. Income is collected and, every 3rd turn, a wave resolves.">
        <button className="v5-endturn" onClick={() => g.endTurn()}>End Turn ▸</button>
      </InfoTip>
      <button className="v5-exit" onClick={onExit} title="Quit to title">✕</button>
    </header>
  )
}

function HexMap({ g }) {
  const tiles = g.world.tiles
  const [hover, setHover] = useState(null)
  const layout = useMemo(() => {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
    const pos = {}
    for (const t of tiles) {
      const { x, y } = toPixel(t.q, t.r, HEX)
      pos[t.key] = { x, y }
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
    const pad = HEX * 1.5
    return { pos, vb: `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}` }
  }, [tiles])
  const vision = useMemo(() => g.visionSet(), [g, g._version]) // eslint-disable-line
  const expand = useMemo(() => { const m = {}; for (const e of g.expandTargets()) m[e.key] = e; return m }, [g, g._version]) // eslint-disable-line
  const placing = g.selection && g.selection.type === 'build' ? g.selection.deployableId : null
  const onTile = (t) => { if (placing) g.placeAt(t.key); else if (expand[t.key]?.affordable) g.expandAt(t.key) }

  const infoFor = (t) => {
    const seen = g.revealAll || vision.has(t.key)
    const inst = g.deployed.get(t.key)
    const canPlace = placing && g.placementValid(placing, t.key)
    const exp = expand[t.key]
    return { seen, controlled: g.controlled.has(t.key), inst, dep: inst && DEPLOYABLES[inst.id], canPlace, exp, expAff: exp && exp.affordable && !placing }
  }
  return (
    <div className="v5-map">
      <svg viewBox={layout.vb} preserveAspectRatio="xMidYMid meet">
        <defs><clipPath id="hexclip"><polygon points={HEX_PTS} /></clipPath></defs>
        {/* terrain layer — interactive; drawn first so neighbouring tiles never paint over a border */}
        <g>
          {tiles.map((t) => {
            const p = layout.pos[t.key]
            const { seen, canPlace, expAff } = infoFor(t)
            const cls = ['hx']
            if (!seen) cls.push('fog')
            if (canPlace || expAff) cls.push('clickable')
            return (
              <g key={t.key} className={cls.join(' ')} transform={`translate(${p.x} ${p.y})`}
                onClick={() => onTile(t)} onMouseEnter={() => seen && setHover(t.key)} onMouseLeave={() => setHover((h) => (h === t.key ? null : h))}>
                {seen
                  ? <image href={`/sprites/tiles/${TERRAIN[t.terrain].sprite || t.terrain}.png`} x={-HEX} y={-HEX} width={HEX * 2} height={HEX * 2} clipPath="url(#hexclip)" preserveAspectRatio="xMidYMid slice" />
                  : <polygon points={HEX_PTS} fill="#0e1017" />}
                <polygon points={HEX_PTS} className="seam" />
              </g>
            )
          })}
        </g>
        {/* overlay layer — borders, highlights, badges on top of ALL terrain */}
        <g style={{ pointerEvents: 'none' }}>
          {tiles.map((t) => {
            const { controlled, inst, dep, canPlace, exp, expAff } = infoFor(t)
            if (!controlled && !canPlace && !expAff && !inst) return null
            const p = layout.pos[t.key]
            const yields = expAff ? Object.keys(TERRAIN[t.terrain].yield || {}) : []
            return (
              <g key={t.key} transform={`translate(${p.x} ${p.y})`}>
                {controlled && <polygon points={HEX_PTS} className="own-ring" />}
                {(canPlace || expAff) && <polygon points={HEX_PTS} className={`hi-ring ${expAff && !canPlace ? 'exp' : ''}`} />}
                {dep && (
                  <g className="dbadge">
                    <circle r="14" fill="#12151bee" stroke={catColor(dep)} strokeWidth="2.2" />
                    <image className="sil" href={silFor(dep)} x={-10} y={-10} width={20} height={20} />
                    <text className="dname" y={27}>{dep.name}</text>
                  </g>
                )}
                {expAff && !inst && (
                  <g className="exp-badge">
                    <g transform="translate(0 -20)"><image href={RES_ICON.food} x={-13} y={-6} width={11} height={11} /><text className="cost" x={1} y={3}>{exp.cost}</text></g>
                    <g transform="translate(0 -9)">{yields.map((r, idx) => { const step = 11, x0 = -(yields.length - 1) * step / 2; return <image key={r} href={RES_ICON[r]} x={x0 + idx * step - 4.5} y={-4.5} width={9} height={9} /> })}</g>
                  </g>
                )}
              </g>
            )
          })}
        </g>
      </svg>
      {hover && <MapHoverCard g={g} k={hover} />}
      <div className="v5-map-hint">{placing ? 'Click a highlighted tile to build.' : 'Click a tile marked with food to expand.'}</div>
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
  const ty = TERRAIN[t.terrain]
  return (
    <div className="v5-hover">
      <NineSlice src="/sprites/ui/box-dark.png" slice={205} width={18} fill={false} className="frame">
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
            <div className="hv-h"><b>{ty.name}</b><span className="hv-sub">{g.controlled.has(k) ? 'controlled' : 'unclaimed'}</span></div>
            <div className="hv-out">{Object.entries(ty.yield || {}).map(([r, v]) => <span key={r} className="hv-chip"><RIco r={r} s={13} />{v}</span>)}{ty.defBonus ? <span className="hv-chip"><SIco st="def" s={12} />+{ty.defBonus}</span> : null}</div>
          </>
        )}
      </NineSlice>
    </div>
  )
}

function Sidebar({ g }) {
  const [tab, setTab] = useState('research')
  const tabs = [['research', 'Research'], ['build', 'Build'], ['wave', 'Next Wave']]
  return (
    <aside className="v5-side">
      <div className="v5-tabs">
        {tabs.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <NineSlice src="/sprites/ui/box-dark.png" slice={205} width={20} fill={false} className="v5-tabbody">
        {tab === 'research' && <ResearchPanel g={g} />}
        {tab === 'build' && <BuildPanel g={g} />}
        {tab === 'wave' && <WavePanel g={g} />}
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
      <NineSlice src="/sprites/ui/box-dark.png" slice={205} width={24} fill={false} className="v5-theater" onClick={(e) => e.stopPropagation()}>
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
      <NineSlice src="/sprites/ui/box-dark.png" slice={205} width={28} fill={false} className={`v5-end ${won ? 'win' : 'lose'}`}>
        <h1>{won ? 'Victory' : 'Defeat'}</h1>
        <p>{won ? 'Your civilization ascends.' : 'Your legitimacy has collapsed.'}</p>
        <p className="sub">Survived {g.waveCount} waves · reached the {g.eraName()} era.</p>
        <button onClick={onExit}>Return to Title</button>
      </NineSlice>
    </div>
  )
}

const HEX_PTS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i)
  return `${(HEX * Math.cos(a)).toFixed(2)},${(HEX * Math.sin(a)).toFixed(2)}`
}).join(' ')
