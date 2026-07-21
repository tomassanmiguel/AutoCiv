import { useGame } from '../../game/react/GameProvider.jsx'
import InfoTip from '../common/InfoTip.jsx'
import './SpeedControl.css'

const SPEEDS = [
  { key: 'paused', glyph: '❚❚', name: 'Pause', desc: 'Halt the simulation.' },
  { key: 'standard', glyph: '▶', name: 'Standard', desc: '1 tick per second.' },
  { key: 'fast', glyph: '▶▶', name: 'Fast', desc: '2 ticks per second.' },
  { key: 'super', glyph: '▶▶▶', name: 'Super', desc: '3 ticks per second.' },
  { key: 'ultra', glyph: '⚡', name: 'Ultra', desc: '5 ticks per second.' },
]

/** Speed widget (below the menu): pause + four tick speeds. */
export default function SpeedControl() {
  const game = useGame()
  const speed = game.data.speed
  return (
    <div className="speed-control">
      {SPEEDS.map((s) => (
        <InfoTip key={s.key} className="speed-tip" title={s.name} text={s.desc}>
          <button
            className={`speed-btn frame-box-dark${speed === s.key ? ' active' : ''}`}
            onClick={() => game.setSpeed(s.key)}
            aria-label={s.name}
          >
            <span className="speed-glyph">{s.glyph}</span>
          </button>
        </InfoTip>
      ))}
    </div>
  )
}
