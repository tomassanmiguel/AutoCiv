import { useGame } from '../../game/react/GameProvider.jsx'
import { SPEEDS } from '../../game/GameManager.js'
import { TICKS_PER_ERA, ERA_COUNT } from '../../game/data/eras.js'
import InfoTip from '../common/InfoTip.jsx'
import './SpeedControl.css'

const OPTIONS = [
  { key: 'paused', glyph: '❚❚', name: 'Pause' },
  { key: 'standard', glyph: '▶', name: 'Standard' },
  { key: 'fast', glyph: '▶▶', name: 'Fast' },
  { key: 'super', glyph: '▶▶▶', name: 'Super' },
  { key: 'ultra', glyph: '⚡', name: 'Ultra' },
]

/**
 * The one pacing control for the whole game (v2 put this in the HUD too). It
 * drives the single clock: a running combat borrows it for one beat per tick,
 * otherwise it advances the development cycle.
 */
export default function SpeedControl() {
  const game = useGame()
  const left = TICKS_PER_ERA - game.tick

  return (
    <div className="speed-control">
      <InfoTip
        className="era-readout"
        title={`${game.eraName} era`}
        text={`Era ${game.era + 1} of ${ERA_COUNT}. ${left} ticks remain before the next era, which widens the map and may grant new expansion permissions.`}
      >
        <span className="era-name">{game.eraName}</span>
        <span className="era-ticks">{left}</span>
      </InfoTip>

      <div className="speed-buttons">
        {OPTIONS.map((s) => (
          <InfoTip key={s.key} title={s.name} text={`${SPEEDS[s.key]} ticks per second.`}>
            <button
              className={`speed-btn${game.speed === s.key ? ' active' : ''}`}
              onClick={() => game.setSpeed(s.key)}
              aria-label={s.name}
            >{s.glyph}</button>
          </InfoTip>
        ))}
      </div>
    </div>
  )
}
