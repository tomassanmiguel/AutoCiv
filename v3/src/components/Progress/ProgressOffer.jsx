import { useGame } from '../../game/react/GameProvider.jsx'
import IconText from '../common/IconText.jsx'
import './ProgressOffer.css'

/**
 * Crossing a PROGRESS threshold offers a few advancements — v2's flow. The
 * clock is paused while this is open.
 *
 * Taking one adds it to the web (which may open the next ring). The node's own
 * effect is still a TODO: the tree is being redesigned, so an unlock currently
 * only opens more of the web.
 */
export default function ProgressOffer() {
  const game = useGame()
  const sel = game.selection
  if (sel?.type !== 'progress') return null

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

        <button className="offer-skip" onClick={() => game.skipSelection()}>Skip</button>
      </div>
    </div>
  )
}
