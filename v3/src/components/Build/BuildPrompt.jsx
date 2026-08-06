import { useGame } from '../../game/react/GameProvider.jsx'
import { foodAround } from '../../game/world/territory.js'
import IconText from '../common/IconText.jsx'
import './BuildPrompt.css'

/**
 * :production: BUILDS. Crossing its threshold does one of two things:
 *
 *   WONDER — if you are holding one you drafted but never built, it is built
 *            now. Drafting was the decision; this is only where it stands.
 *   CITY   — otherwise you found a city. A city claims no new ground, but its
 *            population compounds forever.
 *
 * :food: is deliberately absent from this file. It expands the border on its
 * own, with no prompt — buying ground is not a decision worth stopping for.
 *
 * Either way the map highlights the legal tiles and you click one.
 */
export default function BuildPrompt() {
  const game = useGame()
  const sel = game.selection
  if (sel?.type !== 'city' && sel?.type !== 'wonder') return null

  const wonder = sel.type === 'wonder' ? sel.wonder : null
  const targets = wonder ? game.wonderTargets : game.cityTargets
  const best = !wonder && targets.length
    ? targets.reduce((a, b) => (foodAround(game.world, b) > foodAround(game.world, a) ? b : a))
    : null

  return (
    <div className={`build-prompt${wonder ? ' is-wonder' : ''}`}>
      <img className="build-icon" src={wonder ? wonder.icon : '/sprites/ui/pop.png'} alt="" />
      <div className="build-body">
        <div className="build-head">
          <b>{wonder ? wonder.name : 'Found a city'}</b>
          <span className="build-kind">{wonder ? `Wonder ${wonder.tier}` : 'Production'}</span>
        </div>
        <div className="build-effect">
          {wonder
            ? <IconText>{wonder.description}</IconText>
            : 'Population compounds forever, but claims no ground.'}
        </div>
        <div className="build-hint">
          Click a highlighted tile · {targets.length} available
          {best && <> · best: {foodAround(game.world, best)} food nearby</>}
        </div>
      </div>
      {/* A wonder cannot be skipped away: you spent a draft pick on it, and it
          stays held until there is somewhere to put it. */}
      {!wonder && <button className="build-skip" onClick={() => game.skipSelection()}>Skip</button>}
    </div>
  )
}
