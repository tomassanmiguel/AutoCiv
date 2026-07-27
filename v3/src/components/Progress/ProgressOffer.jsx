import { useGame } from '../../game/react/GameProvider.jsx'
import IconText from '../common/IconText.jsx'
import './ProgressOffer.css'

/**
 * Crossing a PROGRESS threshold offers three advancements — v2's flow. The clock
 * is paused while this is open, and taking one applies its effects and may open
 * the next ring of the web.
 *
 * Gold can REDRAW the hand. The price doubles with each reroll inside one offer
 * so it stays a decision rather than a slot machine, and resets at the next
 * threshold.
 */
export default function ProgressOffer() {
  const game = useGame()
  const sel = game.selection
  if (sel?.type !== 'progress') return null

  const cost = game.rerollCost
  const canReroll = cost != null && game.gold >= cost

  return (
    <div className="offer-backdrop">
      <div className="offer-panel">
        <header className="offer-head">
          <h2>Progress</h2>
          <span className="offer-sub">Choose an advancement</span>
        </header>

        <div className="offer-cards">
          {sel.offers.map((n) => (
            <button key={n.id} className={`offer-card q-${n.quadrant}`} onClick={() => game.chooseOffer(n)}>
              <img className="offer-icon" src={n.icon} alt={n.kind} />
              <div className="offer-name">{n.name}</div>
              <div className="offer-kind">{n.quadrant} · {n.kind}</div>
              <div className="offer-unlocks">Unlocks <b>{n.unlocks}</b></div>
              <div className="offer-effect"><IconText>{n.effect}</IconText></div>
            </button>
          ))}
        </div>

        <footer className="offer-foot">
          <button
            className={`offer-reroll${canReroll ? '' : ' poor'}`}
            disabled={!canReroll}
            onClick={() => game.rerollOffers()}
            title={canReroll ? '' : 'Not enough gold'}
          >
            Reroll
            <span className="offer-cost"><img src="/sprites/icons/gold.png" alt="gold" />{cost}</span>
          </button>
          <span className="offer-purse">
            <img src="/sprites/icons/gold.png" alt="gold" />{game.gold}
          </span>
          <button className="offer-skip" onClick={() => game.skipSelection()}>Skip</button>
        </footer>
      </div>
    </div>
  )
}
