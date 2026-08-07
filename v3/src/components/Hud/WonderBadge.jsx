import { useGame } from '../../game/react/GameProvider.jsx'
import InfoTip from '../common/InfoTip.jsx'
import './WonderBadge.css'

/**
 * The :production: → wonder track. Production no longer founds cities or sits
 * inert: each threshold reaches into the next WONDER TIER and lets you build one.
 * This badge shows how close the next threshold is and what it will offer — or,
 * once every tier is built, that production now feeds :progress: instead.
 *
 * It earns permanent screen space because the rule is otherwise invisible: a
 * player would just see production fill and nothing happen.
 */
export default function WonderBadge() {
  const game = useGame()
  const tier = game.nextWonderTierName // Roman numeral, or null when all built

  const stock = game.resources.production
  const need = stock.threshold * (game.mods.threshold.production ?? 1)
  const pct = Math.max(0, Math.min(1, stock.value / need))

  const label = tier ? `Wonder · Tier ${tier}` : 'Production → Progress'
  const tip = tier
    ? `Your next :production: threshold offers a Tier ${tier} wonder to build.`
    : 'Every wonder tier is built — :production: now converts into :progress: advancements.'

  return (
    <InfoTip className="wonder-badge" title={label} text={tip}>
      <img src="/sprites/ui/wonder.png" alt="" />
      <div className="wb-body">
        <span className="wb-name">{label}</span>
        <div className="wb-bar"><div className="wb-fill" style={{ width: `${pct * 100}%` }} /></div>
      </div>
      <span className="wb-pct">{Math.floor(pct * 100)}%</span>
    </InfoTip>
  )
}
