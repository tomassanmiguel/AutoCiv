import { useGame } from '../../game/react/GameProvider.jsx'
import { terrainOf } from '../../game/world/terrain.js'
import { foodAround } from '../../game/world/territory.js'
import './ExpansionPrompt.css'

/**
 * Crossing a FOOD threshold buys one expansion, and this is where you spend it.
 *
 *   SETTLE — improve a controlled tile: doubles its yield and pulls its six
 *            neighbours into your control
 *   CITY   — turn an existing improvement into a city: no new ground, but its
 *            population compounds forever
 *
 * Picking a mode highlights the legal tiles on the map; clicking one spends it.
 */
export default function ExpansionPrompt() {
  const game = useGame()
  const sel = game.selection
  if (sel?.type !== 'expansion') return null

  const targets = game.expansionTargets
  const mode = sel.mode

  const best = (list, score) => list.slice().sort((a, b) => score(b) - score(a))[0]
  const topImprove = best(targets.improve, (t) => {
    const y = terrainOf(t.terrain).yields
    return y.food + y.production + y.gold + y.progress
  })
  const topCity = best(targets.city, (t) => foodAround(game.world, t))

  return (
    <div className="exp-prompt">
      <div className="exp-head">
        <span className="exp-title">Expand</span>
        <span className="exp-sub">
          {mode ? 'Click a highlighted tile' : 'Grow outward, or grow upward'}
        </span>
      </div>

      <div className="exp-modes">
        <button
          className={`exp-mode${mode === 'improve' ? ' active' : ''}`}
          disabled={!targets.improve.length}
          onClick={() => game.setExpansionMode('improve')}
        >
          <b>Settle</b>
          <span>{targets.improve.length} tiles</span>
          <em>Doubles the tile and claims its neighbours</em>
          {topImprove && <span className="exp-hint">best: {terrainOf(topImprove.terrain).name}</span>}
        </button>

        <button
          className={`exp-mode${mode === 'city' ? ' active' : ''}`}
          disabled={!targets.city.length}
          onClick={() => game.setExpansionMode('city')}
        >
          <b>Found City</b>
          <span>{targets.city.length} sites</span>
          <em>Population compounds forever, but claims no ground</em>
          {topCity && <span className="exp-hint">best: {foodAround(game.world, topCity)} food nearby</span>}
        </button>
      </div>

      <button className="exp-skip" onClick={() => game.skipSelection()}>Skip</button>
    </div>
  )
}
