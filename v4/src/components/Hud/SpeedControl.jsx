import { useGame } from '../../game/react/GameProvider.jsx'
import { SPEEDS } from '../../game/GameManager.js'
import { TICKS_PER_WAVE, WAVE_COUNT } from '../../game/data/cycle.js'
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
  const left = TICKS_PER_WAVE - game.tick

  return (
    <div className="speed-control">
      {/* TWO CLOCKS, shown as two readouts, because they move independently:
          the WAVE is the fight coming for you, the ERA is how far your research
          has run. Merging them into one number would hide the whole design. */}
      <InfoTip
        className="era-readout"
        title={`Wave ${game.wave + 1}`}
        text={`Wave ${game.wave + 1} of ${WAVE_COUNT}. ${left} ticks until it attacks. Wave difficulty scales on its own — it does NOT wait for your research.`}
      >
        <span className="era-name">Wave {game.wave + 1}</span>
        <span className="era-ticks">{left}</span>
      </InfoTip>

      <InfoTip
        className="era-readout"
        title={`${game.eraName} era`}
        text={'The furthest of your three branches. The map reveals to this era, and so do your expansion permissions. Advance it by drafting :progress: advancements.'}
      >
        <span className="era-name">{game.eraName}</span>
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
