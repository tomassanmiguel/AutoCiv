import { useEffect, useState } from 'react'
import { GameManager } from '../game/GameManager.js'
import { GameProvider, useGame } from '../game/react/GameProvider.jsx'
import { SPEED_TPS, COMBAT_INTERVAL_MS } from '../game/data/config.js'
import { STAGES } from '../game/world/regions.js'
import HexMap from './HexMap/HexMap.jsx'
import AudioController from './AudioController.jsx'
import MenuOverlay from './Menu/MenuOverlay.jsx'
import BuildPanel from './Build/BuildPanel.jsx'
import DraftOverlay from './Draft/DraftOverlay.jsx'
import UpgradeModal from './Upgrade/UpgradeModal.jsx'
import ProgressPanel from './Progress/ProgressPanel.jsx'
import EndOverlay from './Hud/EndOverlay.jsx'
import './GameScreen.css'

const SPEEDS = [
  { key: 'paused', glyph: '❚❚' },
  { key: 'slow', glyph: '▶' },
  { key: 'normal', glyph: '▶▶' },
  { key: 'fast', glyph: '▶▶▶' },
]

export default function GameScreen({ seed, audio, onExit }) {
  const [manager] = useState(() => new GameManager(seed))

  // The combat clock: a fractional accumulator advances the running combat at
  // SPEED_TPS[speed] ticks/sec. It runs only during combat and pauses for a draft.
  useEffect(() => {
    let acc = 0
    const iv = setInterval(() => {
      const g = manager
      if (g.phase !== 'combat' || g.selection || g.won || g.defeated) { acc = 0; return }
      acc += (SPEED_TPS[g.speed] ?? 0) * (COMBAT_INTERVAL_MS / 1000)
      let guard = 0
      while (acc >= 1 && guard++ < 200 && g.phase === 'combat' && !g.selection && !g.won && !g.defeated) {
        g.combatTick(); acc -= 1
      }
    }, COMBAT_INTERVAL_MS)
    return () => clearInterval(iv)
  }, [manager])

  return (
    <GameProvider manager={manager}>
      <div className="game-screen">
        <HexMap />
        <AudioController audio={audio} />
        <TopBar />
        <BuildPanel />
        <DraftOverlay />
        <UpgradeModal />
        <ProgressPanel />
        <MenuOverlay onExit={onExit} />
        <EndOverlay onExit={onExit} />
      </div>
    </GameProvider>
  )
}

function TopBar() {
  const game = useGame()
  const prog = game.progress
  const pct = Math.max(0, Math.min(100, (prog.value / prog.threshold) * 100))
  return (
    <div className="top-bar">
      <div className="tb-group">
        <div className="tb-stat wave">Wave <b>{game.wave}</b></div>
        <div className="tb-stat stage">{STAGES[game.stage].name}</div>
      </div>

      <div className="tb-group tb-res">
        <div className="tb-stat gold"><img src="/sprites/icons/gold.png" alt="gold" /><b>{Math.round(game.gold)}</b></div>
        <div className="tb-progress" title={`${Math.round(prog.value)} / ${prog.threshold} progress`}>
          <img src="/sprites/icons/progress.png" alt="progress" />
          <div className="tb-progbar"><span style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      <button className="tb-tracks" onClick={() => game.toggleProgress()}>Tracks</button>

      <div className="tb-group tb-speed">
        {SPEEDS.map((s) => (
          <button key={s.key} className={`tb-speed-btn${game.speed === s.key ? ' active' : ''}`}
            onClick={() => game.setSpeed(s.key)}>{s.glyph}</button>
        ))}
      </div>
    </div>
  )
}
