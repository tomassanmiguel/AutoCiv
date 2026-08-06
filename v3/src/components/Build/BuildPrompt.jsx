import { useGame } from '../../game/react/GameProvider.jsx'
import { foodAround } from '../../game/world/territory.js'
import IconText from '../common/IconText.jsx'
import './BuildPrompt.css'

/**
 * :food: EXPANDS — and now it is a manual choice again. Crossing a food
 * threshold opens this prompt; the map lights two disjoint sets and you click:
 *
 *   SETTLE (green) — improve a border tile into an outpost. Its yield doubles and
 *                    its neighbours come under your control (pushing outward).
 *   CITY   (gold)  — found a city on an existing improvement. No new ground, but
 *                    its population compounds forever.
 *
 * You may also Skip, forfeiting this expansion. (:production: is currently inert;
 * it will build wonders later.)
 */
export default function BuildPrompt() {
  const game = useGame()
  const sel = game.selection
  // 'wonder' kept for when :production: is re-enabled; 'city' is folded into 'expand'.
  if (sel?.type === 'wonder') return <WonderPrompt game={game} wonder={sel.wonder} />
  if (sel?.type !== 'expand') return null

  const settle = game.expandTargets
  const cities = game.cityTargets
  const best = settle.length
    ? settle.reduce((a, b) => (foodAround(game.world, b) > foodAround(game.world, a) ? b : a))
    : null

  return (
    <div className="build-prompt">
      <img className="build-icon" src="/sprites/icons/food.png" alt="" />
      <div className="build-body">
        <div className="build-head">
          <b>Expand your borders</b>
          <span className="build-kind">Food</span>
        </div>
        <div className="build-effect">
          Settle an outpost (<span className="build-swatch settle" />) or found a city
          (<span className="build-swatch city" />).
        </div>
        <div className="build-hint">
          {settle.length} to settle · {cities.length} to build a city
          {best && <> · best: {foodAround(game.world, best)} food nearby</>}
        </div>
      </div>
      <button className="build-skip" onClick={() => game.skipSelection()}>Skip</button>
    </div>
  )
}

function WonderPrompt({ game, wonder }) {
  const targets = game.wonderTargets
  return (
    <div className="build-prompt is-wonder">
      <img className="build-icon" src={wonder.icon} alt="" />
      <div className="build-body">
        <div className="build-head">
          <b>{wonder.name}</b>
          <span className="build-kind">Wonder {wonder.tier}</span>
        </div>
        <div className="build-effect"><IconText>{wonder.description}</IconText></div>
        <div className="build-hint">Click a highlighted tile · {targets.length} available</div>
      </div>
    </div>
  )
}
