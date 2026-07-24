import { useGame } from '../../game/react/GameProvider.jsx'
import IconText from '../common/IconText.jsx'
import './CombatPrep.css'

/**
 * Combat preparation: a non-blocking bar pinned to the BOTTOM of the tableau during
 * the 'prep' phase (between development and battle) — kept out of the way so it
 * never covers the enemy formation at the top. The tableau and panel stay
 * interactive so the player can spend gold — repair / upgrade deployed instances,
 * hire mercenaries on empty tiles, convert specialists — and reposition units.
 * "Begin Combat" starts the fight. The enemy host is visible throughout.
 */
export default function CombatPrep() {
  const game = useGame()
  if (game.data.phase !== 'prep') return null
  const gold = Math.floor(game.data.civilization.gold.value)
  const projLegit = game.projectedLegitLoss() // null unless the P=NP bonus is active

  return (
    <div className="prep-wrap">
      <div className="prep-panel frame-box">
        <div className="prep-body">
          <div className="prep-title">Prepare for Battle</div>
          <div className="prep-hint">
            <IconText>{'Spend :gold: on repairs, upgrades, specialists & mercenaries.'}</IconText>
          </div>
          {projLegit != null && (
            <div className="prep-proj">
              <IconText>{`Projected :legitimacy: loss: ${projLegit}`}</IconText>
            </div>
          )}
        </div>
        <div className="prep-gold">
          <img src="/sprites/icons/gold.png" alt="Gold" />{gold}
        </div>
        <button className="prep-begin frame-box-dark" onClick={() => game.beginCombat()}>
          Begin Combat
        </button>
      </div>
    </div>
  )
}
