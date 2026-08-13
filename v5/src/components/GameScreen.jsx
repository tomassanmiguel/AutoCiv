import { useEffect, useMemo, useState } from 'react'
import { GameProvider, useGame } from '../game/react/GameProvider.jsx'
import { GameEngine } from '../game/GameEngine.js'
import { toPixel } from '../game/hex/coords.js'
import { TERRAIN, DEPLOYABLES } from '../game/data/content.js'
import { DOMAINS } from '../game/data/schema.js'
import './GameScreen.css'

const HEX = 34
const TERR_COLOR = {
  plains: '#6f9c4a', forest: '#2f5f38', hills: '#9c8452', coast: '#3a7fa8',
  mountain: '#6f6a64', desert: '#c9b06a', tundra: '#aec7d1',
}
const CAT_COLOR = {
  melee: '#c0563b', ranged: '#c9a13e', cavalry: '#b5793a', siege: '#8a5a2b', naval: '#3d7fa0',
  settlement: '#c79a4a', legitimacy: '#b45fb0', defense: '#8c98a6', gold: '#e0be3f',
  food: '#6faa4f', progress: '#5aa0d0', production: '#b0703a',
}
const catColor = (dep) => CAT_COLOR[dep.subtype] || '#9a8a6a'
const RES_ICON = { production: '⚒', gold: '⛃', food: '🌾', progress: '📜', legitimacy: '♛' }

export default function GameScreen({ seed, onExit }) {
  const [engine] = useState(() => new GameEngine(seed))
  useEffect(() => { if (import.meta.env.DEV) window.__g = engine }, [engine])
  return (
    <GameProvider manager={engine}>
      <Game onExit={onExit} />
    </GameProvider>
  )
}

function Game({ onExit }) {
  const g = useGame()
  const [seenWave, setSeenWave] = useState(0)
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
  const dueIn = (3 - (g.turn % 3)) % 3
  return (
    <header className="v5-top">
      <div className="v5-brand">AutoCiv <span>v5</span></div>
      <div className="v5-era">{g.eraName()} Era · Turn {g.turn}</div>
      <div className={`v5-wave ${dueIn === 0 ? 'imminent' : ''}`}>
        {dueIn === 0 ? '⚔ Wave this turn!' : `⚔ Wave in ${dueIn}`}
      </div>
      <div className="v5-legit" title="Legitimacy — your life total">
        <span className="ico">♛</span>{Math.floor(g.legitimacy)}
      </div>
      <div className="v5-res">
        {['production', 'food', 'gold', 'progress'].map((r) => (
          <div key={r} className="res" title={r}>
            <span className="ico">{RES_ICON[r]}</span>{Math.floor(g.resources[r])}
          </div>
        ))}
      </div>
      <button className="v5-endturn" onClick={() => g.endTurn()}>End Turn ▸</button>
      <button className="v5-exit" onClick={onExit} title="Quit to title">✕</button>
    </header>
  )
}

function HexMap({ g }) {
  const tiles = g.world.tiles
  const layout = useMemo(() => {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
    const pos = {}
    for (const t of tiles) {
      const { x, y } = toPixel(t.q, t.r, HEX)
      pos[t.key] = { x, y }
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
    const pad = HEX * 1.4
    return { pos, vb: `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}` }
  }, [tiles])

  const vision = useMemo(() => g.visionSet(), [g, g._version]) // eslint-disable-line
  const expand = useMemo(() => {
    const m = {}
    for (const e of g.expandTargets()) m[e.key] = e
    return m
  }, [g, g._version]) // eslint-disable-line
  const placing = g.selection && g.selection.type === 'build' ? g.selection.deployableId : null

  const onTile = (t) => {
    if (placing) { g.placeAt(t.key); return }
    if (expand[t.key]) { g.expandAt(t.key); return }
  }

  return (
    <div className="v5-map">
      <svg viewBox={layout.vb} preserveAspectRatio="xMidYMid meet">
        {tiles.map((t) => {
          const p = layout.pos[t.key]
          const seen = vision.has(t.key)
          const controlled = g.controlled.has(t.key)
          const inst = g.deployed.get(t.key)
          const canPlace = placing && g.placementValid(placing, t.key)
          const exp = expand[t.key]
          const cls = ['hx']
          if (!seen) cls.push('fog')
          if (controlled) cls.push('owned')
          if (canPlace) cls.push('place')
          if (exp) cls.push('expand')
          return (
            <g key={t.key} className={cls.join(' ')} transform={`translate(${p.x} ${p.y})`} onClick={() => onTile(t)}>
              <polygon points={HEX_PTS} fill={seen ? TERR_COLOR[t.terrain] : '#12151b'} />
              {controlled && <polygon points={HEX_PTS} className="own-ring" />}
              {(canPlace || exp) && <polygon points={HEX_PTS} className="hi-ring" />}
              {inst && <Badge dep={DEPLOYABLES[inst.id]} />}
              {exp && !inst && <text className="cost" y="5">🌾{exp.cost}</text>}
            </g>
          )
        })}
      </svg>
      <div className="v5-map-hint">
        {placing ? 'Click a highlighted tile to build.' : 'Click a 🌾 tile to expand your territory.'}
      </div>
    </div>
  )
}

function Badge({ dep }) {
  const unit = dep.type === 'unit'
  return (
    <g className="badge">
      {unit
        ? <circle r="13" fill={catColor(dep)} stroke="#0c0e12" strokeWidth="1.5" />
        : <rect x="-13" y="-11" width="26" height="22" rx="4" fill={catColor(dep)} stroke="#0c0e12" strokeWidth="1.5" />}
      <text y="4" className="badge-t">{dep.id === 'palace' ? '★' : dep.name[0]}</text>
    </g>
  )
}

function Sidebar({ g }) {
  const [tab, setTab] = useState('research')
  return (
    <aside className="v5-side">
      <div className="v5-tabs">
        {['research', 'build', 'wave'].map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'research' ? 'Research' : t === 'build' ? 'Build' : 'Next Wave'}
          </button>
        ))}
      </div>
      <div className="v5-tabbody">
        {tab === 'research' && <ResearchPanel g={g} />}
        {tab === 'build' && <BuildPanel g={g} />}
        {tab === 'wave' && <WavePanel g={g} />}
      </div>
    </aside>
  )
}

function ResearchPanel({ g }) {
  const offer = g.offerData()
  return (
    <div className="panel">
      <div className="panel-h">
        Era {g.eraName()} · {g.unlocksThisEra}/3 to advance
        <span className="sub">unlock cost {offer[0]?.cost ?? '—'} 📜</span>
      </div>
      {offer.map((o, i) => (
        <div key={o.id} className={`tech ${o.wildcard ? 'wild' : ''}`}>
          <div className="tech-top">
            <b>{o.tech.name}</b>
            <span className="flav">{o.tech.flavor}{o.wildcard ? ' · wildcard' : ''}</span>
          </div>
          <div className="tech-desc">{o.tech.desc}</div>
          <div className="tech-act">
            <button disabled={!o.affordable} onClick={() => g.unlockTech(o.id)}>Unlock · {o.cost}📜</button>
            <button className="reroll" onClick={() => g.reroll(i)} title="Reroll this option">
              ⟳ {g.rerollTokens > 0 ? 'free' : `${5 + 5 * g.rerollsUsed}⛃`}
            </button>
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
      <div className="panel-h">Deployables <span className="sub">production {Math.floor(g.resources.production)} ⚒</span></div>
      <div className="build-grid">
        {list.map(({ id, dep, cost, affordable }) => (
          <button key={id} className={`bcard ${g.selection?.deployableId === id ? 'sel' : ''}`}
            disabled={!affordable} onClick={() => g.beginBuild(id)} title={dep.desc}>
            <span className="bdot" style={{ background: catColor(dep) }} />
            <span className="bname">{dep.name}</span>
            <span className="bcost">{cost}⚒</span>
          </button>
        ))}
      </div>
      <div className="hint">Pick one, then click a tile. Building on a tile replaces its natural yield.</div>
    </div>
  )
}

function WavePanel({ g }) {
  const enemy = g.enemyCard
  const you = g.playerScalars()
  return (
    <div className="panel">
      <div className="panel-h">Incoming wave {enemy?.wave} <span className="sub">{enemy?.archetypeName}</span></div>
      <ScalarTable title="Your military" s={you} accent="#5aa0d0" />
      <div className="vs">vs</div>
      <ScalarTable title="Enemy card" s={enemy?.scalars} accent="#c0563b" />
      <div className="hint">Combat is abstract — every deployed unit feeds these 12 scalars. Bombardment fires first and spills downward.</div>
    </div>
  )
}

function ScalarTable({ title, s, accent }) {
  if (!s) return null
  return (
    <div className="stbl">
      <div className="stbl-h" style={{ color: accent }}>{title}</div>
      <table>
        <thead><tr><th></th><th>Atk</th><th>Def</th><th>Bmb</th></tr></thead>
        <tbody>
          {DOMAINS.map((d) => {
            const row = s[d]
            const empty = !row.atk && !row.def && !row.bomb
            return (
              <tr key={d} className={empty ? 'z' : ''}>
                <td className="dm">{d}</td><td>{row.atk}</td><td>{row.def}</td><td>{row.bomb}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SelectionBanner({ g }) {
  const dep = DEPLOYABLES[g.selection.deployableId]
  return (
    <div className="v5-selband">
      Placing <b>{dep.name}</b> — click a highlighted tile.
      <button onClick={() => g.cancelSelection()}>Cancel</button>
    </div>
  )
}

function CombatModal({ g, onClose }) {
  const c = g.lastCombat
  const r = c.result
  return (
    <div className="v5-modal-bg" onClick={onClose}>
      <div className="v5-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Wave {c.wave} · {c.enemy.archetypeName}</h2>
        <div className="combat-cols">
          {r.domains.map((d) => (
            <div key={d.domain} className={`cdom ${d.result}`}>
              <div className="cdom-h">{d.domain}</div>
              <div className="cdom-r">{d.result}</div>
              <div className="cdom-n">you {d.player.atk + d.player.def + d.player.bomb} · foe {d.enemy.atk + d.enemy.def + d.enemy.bomb}</div>
            </div>
          ))}
        </div>
        <div className="combat-score">
          <span className="gold">+{r.goldGained} ⛃ gold</span>
          <span className="loss">−{r.legitimacyLost} ♛ legitimacy</span>
        </div>
        <button className="v5-cont" onClick={onClose}>Continue</button>
      </div>
    </div>
  )
}

function EndOverlay({ g, onExit }) {
  const won = g.status === 'won'
  return (
    <div className="v5-modal-bg">
      <div className={`v5-end ${won ? 'win' : 'lose'}`}>
        <h1>{won ? 'Victory' : 'Defeat'}</h1>
        <p>{won ? 'Your civilization ascends.' : 'Your legitimacy has collapsed.'}</p>
        <p className="sub">Survived {g.waveCount} waves · reached the {g.eraName()} era.</p>
        <button onClick={onExit}>Return to Title</button>
      </div>
    </div>
  )
}

// flat-top hex, circumradius HEX
const HEX_PTS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i)
  return `${(HEX * Math.cos(a)).toFixed(2)},${(HEX * Math.sin(a)).toFixed(2)}`
}).join(' ')
