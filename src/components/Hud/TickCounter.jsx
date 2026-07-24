import { useGame } from '../../game/react/GameProvider.jsx'
import InfoTip from '../common/InfoTip.jsx'
import './TickCounter.css'

/** Ticks remaining in development, a crossed-swords glyph during preparation,
 *  enemies remaining in a battle, or "—" while the era transition banner plays. */
export default function TickCounter() {
  const game = useGame()
  const phase = game.data.phase
  let value, title, tip
  if (phase === 'battle') {
    const left = game.data.enemies.filter((e) => !e.damaged && !e.breached).length
    value = `☠${left}`
    title = 'Enemies remaining'
    tip = 'Enemies still marching. The battle ends when all are slain or have broken through.'
  } else if (phase === 'prep') {
    value = '⚔'
    title = 'Preparation'
    tip = 'Prepare your forces, then begin combat.'
  } else if (phase === 'development') {
    value = Math.max(0, game.ticksPerEra() - game.data.tick)
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
