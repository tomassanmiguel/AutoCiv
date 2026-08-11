import { useGame } from '../../game/react/GameProvider.jsx'
import './EndOverlay.css'

/** Win (all five tracks complete) or loss (palace destroyed). */
export default function EndOverlay({ onExit }) {
  const game = useGame()
  if (!game.won && !game.defeated) return null
  const win = game.won
  return (
    <div className="end-backdrop">
      <div className={`end-panel ${win ? 'win' : 'lose'}`}>
        <h2>{win ? 'Victory' : 'Defeat'}</h2>
        <p>{win
          ? 'All five tracks complete — your civilization ascends.'
          : `The palace fell on wave ${game.wave}.`}</p>
        <div className="end-stats">Wave {game.wave} · {game.cityCount()} cities</div>
        <button className="end-exit" onClick={onExit}>Return to Title</button>
      </div>
    </div>
  )
}
