import { useGame } from '../../game/react/GameProvider.jsx'
import { ERAS } from '../../game/data/schema.js'
import IconText from '../common/IconText.jsx'
import './ProgressOffer.css'

/**
 * Crossing a :progress: threshold offers three advancements, drawn from the
 * CURRENT ERA of each branch. The clock is paused while this is open.
 *
 * A card shows the row's authored description — the prose IS the design — and
 * the branch/era it came from, because taking it is what advances that branch's
 * clock and eventually opens the map.
 *
 * A WONDER card is marked: taking it does not build the wonder, it queues it for
 * the next :production: threshold.
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
          {sel.offers.map((row) => (
            <button
              key={row.id}
              className={`offer-card q-${row.quadrant}${row.isWonder ? ' wonder' : ''}`}
              onClick={() => game.chooseOffer(row)}
            >
              <img className="offer-icon" src={row.icon} alt="" />
              <div className="offer-name">{row.name}</div>
              <div className="offer-kind">
                {row.quadrant} · {ERAS[row.era]}
                {row.isWonder && <> · wonder {row.tier}</>}
              </div>
              <div className="offer-effect"><IconText>{row.description}</IconText></div>
              {row.isWonder && (
                <div className="offer-wonder-note">
                  Built at your next <img src="/sprites/icons/production.png" alt="production" /> threshold
                </div>
              )}
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
          {/* Skipping is a real cost here: the pool is CURRENT TIER ONLY, so
              anything passed over is gone once the branch advances. */}
          <button className="offer-skip" onClick={() => game.skipSelection()}>Skip</button>
        </footer>
      </div>
    </div>
  )
}
