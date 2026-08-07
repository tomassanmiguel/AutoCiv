import { useGame } from '../../game/react/GameProvider.jsx'
import IconText from '../common/IconText.jsx'
import '../Progress/ProgressOffer.css'

/**
 * Crossing a :production: threshold reaches into the next WONDER TIER and offers
 * its wonders as a choice. Pick one to build (then place it on the map); the rest
 * of that tier are gone. Once every tier is exhausted, production instead feeds
 * :progress: and this never opens.
 *
 * Reuses the ProgressOffer panel styling — it is the same "pick one card" shape.
 */
export default function WonderOffer() {
  const game = useGame()
  const sel = game.selection
  if (sel?.type !== 'wonder' || sel.stage !== 'choose') return null

  return (
    <div className="offer-backdrop">
      <div className="offer-panel">
        <header className="offer-head">
          <h2>Wonder</h2>
          <span className="offer-sub">Choose a Tier {game.nextWonderTierName ?? sel.tier + 1} wonder to build</span>
        </header>

        <div className="offer-cards">
          {sel.offers.map((row) => (
            <button
              key={row.id}
              className={`offer-card q-${row.quadrant} wonder`}
              onClick={() => game.chooseWonder(row)}
            >
              <img className="offer-icon" src={row.icon} alt="" />
              <div className="offer-name">{row.name}</div>
              <div className="offer-kind">wonder {row.tier}</div>
              <div className="offer-effect"><IconText>{row.description}</IconText></div>
            </button>
          ))}
        </div>

        <footer className="offer-foot">
          <span className="offer-purse">
            <img src="/sprites/icons/production.png" alt="production" />
          </span>
          {/* Skipping forfeits this build; the tier waits for your next threshold. */}
          <button className="offer-skip" onClick={() => game.skipSelection()}>Skip</button>
        </footer>
      </div>
    </div>
  )
}
