import { useGame } from '../../game/react/GameProvider.jsx'
import InfoTip from '../common/InfoTip.jsx'
import './WonderBadge.css'

/**
 * A drafted-but-unbuilt wonder, with how close :production: is to building it.
 *
 * It earns permanent screen space because holding one CHANGES TWO RULES at once
 * and both are invisible otherwise: your next :production: threshold builds this
 * instead of founding a city, and no further wonder can be offered until it is
 * standing. Without the badge a player would just see cities stop appearing.
 */
export default function WonderBadge() {
  const game = useGame()
  const w = game.heldWonder
  if (!w) return null

  const stock = game.resources.production
  const need = stock.threshold * (game.mods.threshold.production ?? 1)
  const pct = Math.max(0, Math.min(1, stock.value / need))

  return (
    <InfoTip
      className="wonder-badge"
      title={w.name}
      text={`${w.description} — built at your next :production: threshold, instead of founding a city. No other wonder can be offered until it stands.`}
    >
      <img src={w.icon} alt="" />
      <div className="wb-body">
        <span className="wb-name">{w.name}</span>
        <div className="wb-bar"><div className="wb-fill" style={{ width: `${pct * 100}%` }} /></div>
      </div>
      <span className="wb-pct">{Math.floor(pct * 100)}%</span>
    </InfoTip>
  )
}
