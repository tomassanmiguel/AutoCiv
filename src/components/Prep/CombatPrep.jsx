import { useGame } from '../../game/react/GameProvider.jsx'
import IconText from '../common/IconText.jsx'
import './CombatPrep.css'

/**
 * Combat preparation screen: a non-blocking banner shown during the 'prep' phase
 * (between development and battle). The tableau and panel stay interactive so the
 * player can spend gold — repair / upgrade deployed instances, hire mercenaries on
 * empty tiles, convert specialists — and reposition units. "Begin Combat" starts
 * the fight. The enemy host is visible on the battlefield throughout.
 */
export default function CombatPrep() {
  const game = useGame()
  if (game.data.phase !== 'prep') return null
  const gold = Math.floor(game.data.civilization.gold.value)

  return (
    <div className="prep-wrap">
      <div className="prep-panel frame-box">
        <button className="prep-begin frame-box-dark" onClick={() => game.beginCombat()}>
          Begin Combat
        </button>
        <div className="prep-body">
          <div className="prep-title">Prepare for Battle</div>
          <div className="prep-hint">
            <IconText>{'Spend :gold: to repair, upgrade, convert specialists, or hire mercenaries — then begin.'}</IconText>
          </div>
          <div className="prep-gold">
            <img src="/sprites/icons/gold.png" alt="Gold" />{gold}
          </div>
        </div>
      </div>
    </div>
  )
}
