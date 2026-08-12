import { useEffect, useRef, useState } from 'react'
import { GameManager } from '../game/GameManager.js'
import { GameProvider, useGame } from '../game/react/GameProvider.jsx'
import { ERA_NAMES } from '../game/data/config.js'
import { FLAVOR_META } from '../game/data/progress.js'
import HexMap from './HexMap/HexMap.jsx'
import AudioController from './AudioController.jsx'
import MenuOverlay from './Menu/MenuOverlay.jsx'
import BuildPanel from './Build/BuildPanel.jsx'
import ProgressPanel from './Progress/ProgressPanel.jsx'
import EndOverlay from './Hud/EndOverlay.jsx'
import './GameScreen.css'

// Delay between animated actor actions so the round reads one piece at a time.
const STEP_MS = 150

export default function GameScreen({ seed, audio, onExit }) {
  const [manager] = useState(() => new GameManager(seed))

  return (
    <GameProvider manager={manager}>
      <div className="game-screen">
        <HexMap />
        <AudioController audio={audio} />
        <TopBar />
        <BuildPanel />
        <ProgressPanel />
        <MenuOverlay onExit={onExit} />
        <EndOverlay onExit={onExit} />
      </div>
    </GameProvider>
  )
}

function TopBar() {
  const game = useGame()
  const ri = game.researchInfo()
  const eraIdx = ri.flavor ? game.branchEra[ri.flavor] : 0
  const pct = ri.flavor ? Math.max(0, Math.min(100, (ri.value / ri.cost) * 100)) : 0
  const meta = ri.flavor ? FLAVOR_META[ri.flavor] : null

  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  // Drive the turn one actor at a time: acting actors pause STEP_MS so you can
  // follow them; no-op actors advance instantly.
  const busy = game.resolving
  const endTurn = () => {
    if (game.resolving || game.selection || game.pickingResearch || game.won || game.defeated) return
    game.endTurn()
    const run = () => {
      if (!game.resolving) return
      const acted = game.stepTurn()
      timer.current = setTimeout(run, acted ? STEP_MS : 0)
    }
    timer.current = setTimeout(run, STEP_MS)
  }

  const incoming = game.forecast.length

  return (
    <div className="top-bar">
      <div className="tb-group">
        <div className="tb-stat turn">Turn <b>{game.turn}</b></div>
        <div className="tb-stat era">{ERA_NAMES[Math.min(eraIdx, ERA_NAMES.length - 1)]}</div>
        <div className="tb-stat threat" title="Enemies forecast to arrive next turn">
          <span className="tb-threat-dot" />incoming <b>{incoming}</b>
        </div>
      </div>

      <div className="tb-stat gold">
        <img src="/sprites/icons/gold.png" alt="gold" /><b>{Math.round(game.gold)}</b>
        {game.lastGoldGain > 0 && <span className="tb-delta">+{game.lastGoldGain}</span>}
      </div>

      <button className="tb-research" onClick={() => game.toggleProgress()} style={meta ? { '--flavor': meta.color } : undefined}>
        <span className="tb-res-label">
          {meta ? `${meta.name}: ${ri.adv.name}` : 'Choose a research lane'}
        </span>
        <span className="tb-res-bar"><span style={{ width: `${pct}%` }} /></span>
        <span className="tb-res-num">{ri.flavor ? `${Math.round(ri.value)}/${ri.cost}` : '—'}</span>
      </button>

      <button className={`tb-endturn${busy ? ' busy' : ''}`} onClick={endTurn}
        disabled={busy || !!game.selection || game.pickingResearch || game.won || game.defeated}>
        {busy ? 'Resolving…' : 'End Turn ⏭'}
      </button>
    </div>
  )
}
