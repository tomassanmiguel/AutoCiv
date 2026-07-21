import { useGame } from '../../game/react/GameProvider.jsx'
import { TICKS_PER_ERA } from '../../game/data/resources.js'
import InfoTip from '../common/InfoTip.jsx'
import './TickCounter.css'

/** Ticks remaining in this era's development phase, counting down in a box. */
export default function TickCounter() {
  const game = useGame()
  const remaining = Math.max(0, TICKS_PER_ERA - game.data.tick)
  return (
    <InfoTip title="Ticks remaining" text="Ticks left before this era's development phase ends.">
      <div className="tick-counter frame-box">
        <span className="tick-counter-value">{remaining}</span>
      </div>
    </InfoTip>
  )
}
