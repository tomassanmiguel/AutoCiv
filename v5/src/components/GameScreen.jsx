import { useEffect, useMemo, useState } from 'react'
import { GameProvider, useGame } from '../game/react/GameProvider.jsx'
import { GameEngine } from '../game/GameEngine.js'
import { toPixel } from '../game/hex/coords.js'
import { TERRAIN, DEPLOYABLES } from '../game/data/content.js'
import { DOMAINS } from '../game/data/schema.js'
import { trackForEra } from '../game/audio/tracks.js'
import NineSlice from './common/NineSlice.jsx'
import InfoTip from './common/InfoTip.jsx'
import IconText from './common/IconText.jsx'
import './GameScreen.css'

const HEX = 34
const RES_KEYS = ['production', 'food', 'gold', 'progress']
const ICON = (n) => `/sprites/icons/${n}.png`
const RES_ICON = {
  production: ICON('production'), gold: ICON('gold'), food: ICON('food'),
  progress: ICON('progress'), legitimacy: ICON('legitimacy'),
}
const STAT_ICON = { atk: ICON('attack'), def: ICON('defense'), bomb: ICON('range') }
const CAT_COLOR = {
  melee: '#c0563b', ranged: '#c9a13e', cavalry: '#b5793a', siege: '#8a5a2b', naval: '#3d7fa0',
  settlement: '#c79a4a', legitimacy: '#b45fb0', defense: '#8c98a6', gold: '#e0be3f',
  food: '#6faa4f', progress: '#5aa0d0', production: '#b0703a',
}
const catColor = (dep) => CAT_COLOR[dep.subtype] || '#9a8a6a'
// silhouette (in /sprites/ui, inverted to white by index.css / .sil filter)
const UI = (n) => `/sprites/ui/${n}.png`
const SIL_UNIT = { melee: UI('melee'), ranged: UI('ranged'), cavalry: UI('cavalry'), siege: UI('siege'), naval: UI('boat') }
const SIL_BLD = { settlement: UI('building'), defense: UI('defense'), gold: UI('gold'), food: UI('food'), progress: UI('progress'), production: UI('production'), legitimacy: UI('legitimacy') }
function silFor(dep) {
  if (dep.id === 'palace') return UI('wonder')
  if (dep.type === 'unit') return SIL_UNIT[dep.subtype] || UI('unit')
  return SIL_BLD[dep.subtype] || UI('building')
}

const RIco = ({ r, s = 16 }) => <img className="ric" src={RES_ICON[r]} alt={r} style={{ height: s }} />
const fmt = (n) => Math.floor(n)
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
      {showCombat && <CombatModal g={g} onClose={() => setSeenWave(g.lastCombat.wave)} />}
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
      <InfoTip text={dueIn === 0 ? 'An enemy wave strikes at the end of this turn.' : `The next enemy wave arrives in ${dueIn} turn(s). Prepare your military.`}>
        <div className={`v5-wave ${dueIn === 0 ? 'imminent' : ''}`}>⚔ {dueIn === 0 ? 'Wave now' : `Wave in ${dueIn}`}</div>
      </InfoTip>
      <div className="v5-stats">
        <InfoTip text={`Legitimacy — your life total. Reach 0 and the run ends. +${fmt(pt.income.legitimacy)}/turn.`}>
          <div className="v5-stat legit"><RIco r="legitimacy" s={20} /><b>{fmt(g.legitimacy)}</b>{delta(pt.income.legitimacy)}</div>
        </InfoTip>
        {RES_KEYS.map((r) => (
          <InfoTip key={r} text={r === 'gold' ? goldTip : resTip[r]}>
            <div className="v5-stat"><RIco r={r} /><b>{fmt(g.resources[r])}</b>{delta(pt.net[r])}</div>
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

  const onTile = (t) => {
    if (placing) g.placeAt(t.key)
    else if (expand[t.key]) g.expandAt(t.key)
  }

  return (
    <div className="v5-map">
      <svg viewBox={layout.vb} preserveAspectRatio="xMidYMid meet">
        <defs><clipPath id="hexclip"><polygon points={HEX_PTS} /></clipPath></defs>
        {tiles.map((t) => {
          const p = layout.pos[t.key]
          const seen = vision.has(t.key)
          const controlled = g.controlled.has(t.key)
          const inst = g.deployed.get(t.key)
          const dep = inst && DEPLOYABLES[inst.id]
          const canPlace = placing && g.placementValid(placing, t.key)
          const exp = expand[t.key]
          const cls = ['hx']
          if (!seen) cls.push('fog')
          if (canPlace || exp) cls.push('clickable')
          return (
            <g key={t.key} className={cls.join(' ')} transform={`translate(${p.x} ${p.y})`}
              onClick={() => onTile(t)} onMouseEnter={() => setHover(t.key)} onMouseLeave={() => setHover((h) => (h === t.key ? null : h))}>
              {seen
                ? <image href={`/sprites/tiles/${TERRAIN[t.terrain].sprite || t.terrain}.png`} x={-HEX} y={-HEX} width={HEX * 2} height={HEX * 2} clipPath="url(#hexclip)" preserveAspectRatio="xMidYMid slice" />
                : <polygon points={HEX_PTS} fill="#0e1017" />}
              <polygon points={HEX_PTS} className="seam" />
              {controlled && <polygon points={HEX_PTS} className="own-ring" />}
              {(canPlace || exp) && <polygon points={HEX_PTS} className={`hi-ring ${exp && !canPlace ? 'exp' : ''}`} />}
              {dep && (
                <g className="dbadge">
                  <circle r="14" fill="#12151bee" stroke={catColor(dep)} strokeWidth="2.2" />
                  <image className="sil" href={silFor(dep)} x={-10} y={-10} width={20} height={20} />
                  <text className="dname" y={27}>{dep.name}</text>
                </g>
              )}
              {exp && !inst && <g className="exp-badge"><image className="ric" href={RES_ICON.food} x={-15} y={-10} width={14} height={14} /><text className="cost" x={3} y={2}>{exp.cost}</text></g>}
            </g>
          )
        })}
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
      <NineSlice src="/sprites/ui/box-dark.png" slice={205} width={20} className="frame">
        {dep ? (
          <>
            <div className="hv-h"><img className="sil-i" src={silFor(dep)} alt="" /><b>{dep.name}</b><span className="hv-sub">{dep.type} · {dep.subtype}</span></div>
            <div className="hv-desc"><IconText>{dep.desc}</IconText></div>
            {out && Object.keys(out).length > 0 && (
              <div className="hv-out"><span className="hv-lbl">Output / turn</span>{Object.entries(out).map(([r, v]) => <span key={r} className="hv-chip"><RIco r={r} s={14} />{v}</span>)}</div>
            )}
            {scLines.length > 0 && (
              <div className="hv-out"><span className="hv-lbl">Combat</span>{scLines.map((x) => (
                <span key={x.d} className="hv-chip">{x.d}: {x.atk ? <><img src={STAT_ICON.atk} className="ric" alt="atk" />{x.atk} </> : ''}{x.def ? <><img src={STAT_ICON.def} className="ric" alt="def" />{x.def} </> : ''}{x.bomb ? <><img src={STAT_ICON.bomb} className="ric" alt="bomb" />{x.bomb}</> : ''}</span>
              ))}</div>
            )}
          </>
        ) : (
          <>
            <div className="hv-h"><b>{ty.name}</b>{g.controlled.has(k) ? <span className="hv-sub">controlled</span> : <span className="hv-sub">unclaimed</span>}</div>
            <div className="hv-out">{Object.entries(ty.yield || {}).map(([r, v]) => <span key={r} className="hv-chip"><RIco r={r} s={14} />{v}</span>)}{ty.defBonus ? <span className="hv-chip"><img src={STAT_ICON.def} className="ric" alt="def" />+{ty.defBonus}</span> : null}</div>
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
      <NineSlice src="/sprites/ui/box-dark.png" slice={205} width={22} className="v5-tabbody">
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
      <div className="panel-h">Research <span className="sub">{g.eraName()} · {g.unlocksThisEra}/{3} to next era</span></div>
      {offer.map((o, i) => (
        <div key={o.id} className={`tech ${o.wildcard ? 'wild' : ''}`}>
          <div className="tech-top"><b>{o.tech.name}</b><span className="flav">{o.tech.flavor}{o.wildcard ? ' · wildcard' : ''}</span></div>
          <div className="tech-desc"><IconText>{o.tech.desc}</IconText></div>
          <div className="tech-act">
            <button disabled={!o.affordable} onClick={() => g.unlockTech(o.id)}>Unlock · {o.cost} <RIco r="progress" s={13} /></button>
            <InfoTip text={g.rerollTokens > 0 ? 'Reroll this option — free (from Astrology).' : `Reroll this option for ${5 + 5 * g.rerollsUsed} gold. Cost rises each reroll.`}>
              <button className="reroll" onClick={() => g.reroll(i)}>⟳ {g.rerollTokens > 0 ? 'free' : <>{5 + 5 * g.rerollsUsed}<RIco r="gold" s={12} /></>}</button>
            </InfoTip>
          </div>
        </div>
      ))}
      {offer.length === 0 && <div className="empty">Nothing left to research here.</div>}
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
          <InfoTip key={id} text={`${dep.desc}\n\nType: :${simpleTok(dep)}:  ·  Cost ${cost} :production:  ·  Upkeep ${dep.upkeep} :gold:`}>
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
function simpleTok(dep) {
  const t = dep.type === 'unit' ? dep.subtype : dep.subtype === 'defense' ? 'fort' : 'building'
  return ['melee', 'ranged', 'cavalry', 'siege', 'naval', 'fort', 'building'].includes(t) ? t : 'building'
}

function WavePanel({ g }) {
  const enemy = g.enemyCard
  const you = g.playerScalars()
  return (
    <div className="panel">
      <div className="panel-h">Next Wave <span className="sub">#{enemy?.wave} · {enemy?.archetypeName}</span></div>
      <ScalarTable title="Your military" s={you} accent="#5aa0d0" />
      <div className="vs">▼ resolves against ▼</div>
      <ScalarTable title="Enemy card" s={enemy?.scalars} accent="#c0563b" />
      <div className="hint">Combat is an empire-wide aggregate of these 12 scalars. Bombardment fires first and spills downward; surviving attack scores gold (yours) or legitimacy loss (theirs).</div>
    </div>
  )
}
function ScalarTable({ title, s, accent }) {
  if (!s) return null
  return (
    <div className="stbl">
      <div className="stbl-h" style={{ color: accent }}>{title}</div>
      <table>
        <thead><tr><th></th><th><img src={STAT_ICON.atk} className="ric" alt="atk" /></th><th><img src={STAT_ICON.def} className="ric" alt="def" /></th><th><img src={STAT_ICON.bomb} className="ric" alt="bmb" /></th></tr></thead>
        <tbody>
          {DOMAINS.map((d) => { const row = s[d]; const z = !row.atk && !row.def && !row.bomb; return (
            <tr key={d} className={z ? 'z' : ''}><td className="dm">{d}</td><td>{row.atk}</td><td>{row.def}</td><td>{row.bomb}</td></tr>) })}
        </tbody>
      </table>
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

function CombatModal({ g, onClose }) {
  const c = g.lastCombat
  const r = c.result
  return (
    <div className="v5-modal-bg" onClick={onClose}>
      <NineSlice src="/sprites/ui/box-dark.png" slice={205} width={26} className="v5-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Wave {c.wave} · {c.enemy.archetypeName}</h2>
        <div className="combat-cols">
          {r.domains.map((d) => (
            <div key={d.domain} className={`cdom ${d.result}`}>
              <div className="cdom-h">{d.domain}</div>
              <div className="cdom-r">{d.result === 'win' ? 'won' : d.result === 'loss' ? 'lost' : d.result}</div>
            </div>
          ))}
        </div>
        <div className="combat-score">
          <span className="gold"><RIco r="gold" s={20} /> +{r.goldGained}</span>
          <span className="loss"><RIco r="legitimacy" s={20} /> −{r.legitimacyLost}</span>
        </div>
        {c.bonus && (c.bonus.food || c.bonus.production || c.bonus.progress) ? <div className="combat-bonus">Festival bonus collected.</div> : null}
        <button className="v5-cont" onClick={onClose}>Continue</button>
      </NineSlice>
    </div>
  )
}

function EndOverlay({ g, onExit }) {
  const won = g.status === 'won'
  return (
    <div className="v5-modal-bg">
      <NineSlice src="/sprites/ui/box-dark.png" slice={205} width={30} className={`v5-end ${won ? 'win' : 'lose'}`}>
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
