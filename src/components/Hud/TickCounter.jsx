import { useGame } from '../../game/react/GameProvider.jsx'
import { TICKS_PER_ERA } from '../../game/data/resources.js'
import InfoTip from '../common/InfoTip.jsx'
import './TickCounter.css'

const COMBAT_DURATION = 25

/** Ticks remaining in development, or seconds remaining during a battle. */
export default function TickCounter() {
  const game = useGame()
  const battle = game.data.phase === 'battle'
  const value = battle
    ? `${Math.max(0, Math.ceil(COMBAT_DURATION - game.data.combatTime))}s`
    : Math.max(0, TICKS_PER_ERA - game.data.tick)
  const tip = battle
    ? 'Seconds left in this battle.'
    : "Ticks left before this era's development phase ends."
  return (
    <InfoTip title={battle ? 'Battle time' : 'Ticks remaining'} text={tip}>
      <div className="tick-counter frame-box">
        <span className="tick-counter-value">{value}</span>
      </div>
    </InfoTip>
  )
}
