import { useGame } from '../../game/react/GameProvider.jsx'
import { TICKS_PER_ERA } from '../../game/data/resources.js'
import InfoTip from '../common/InfoTip.jsx'
import './TickCounter.css'

const COMBAT_DURATION = 25

/** Ticks remaining in development, seconds remaining in a battle, or "—" while
 *  the era transition banner plays. */
export default function TickCounter() {
  const game = useGame()
  const phase = game.data.phase
  let value, title, tip
  if (phase === 'battle') {
    value = `${Math.max(0, Math.ceil(COMBAT_DURATION - game.data.combatTime))}s`
    title = 'Battle time'
    tip = 'Seconds left in this battle.'
  } else if (phase === 'development') {
    value = Math.max(0, TICKS_PER_ERA - game.data.tick)
    title = 'Ticks remaining'
    tip = "Ticks left before this era's development phase ends."
  } else {
    value = '—'
    title = 'Advancing era'
    tip = 'Moving to the next era.'
  }
  return (
    <InfoTip title={title} text={tip}>
      <div className="tick-counter frame-box">
        <span className="tick-counter-value">{value}</span>
      </div>
    </InfoTip>
  )
}
