import { useGame } from '../../game/react/GameProvider.jsx'
import { UNIT_DEFS, unitStats } from '../../game/data/units.js'
import { BUILDING_DEFS, buildingEffectText } from '../../game/data/buildings.js'
import IconText from '../common/IconText.jsx'
import './PlacementPrompt.css'

/**
 * A progress node granted something that needs a tile. The map highlights the
 * legal ones; this bar says WHAT is being placed and why the spot matters.
 *
 * Buildings care intensely about their neighbours, so the card leads with the
 * adjacency rule — that is the whole decision.
 */
export default function PlacementPrompt() {
  const game = useGame()
  const sel = game.selection
  if (sel?.type !== 'placement') return null

  const { kind, key } = sel.item
  const def = kind === 'building' ? BUILDING_DEFS[key] : UNIT_DEFS[key]
  if (!def) return null

  const stats = kind === 'unit' ? unitStats(def, game.era, game.mods) : null
  const queued = game.grants.length - 1

  return (
    <div className="place-prompt">
      <img className="place-icon" src={def.icon} alt="" />
      <div className="place-body">
        <div className="place-head">
          <b>{def.name}</b>
          <span className="place-kind">{kind === 'building' ? 'Building' : `${def.type} unit`}</span>
          {queued > 0 && <span className="place-queue">+{queued} more to place</span>}
        </div>

        <div className="place-effect">
          <IconText>
            {kind === 'building' ? buildingEffectText(def) : def.blurb}
          </IconText>
        </div>

        {stats && (
          <div className="place-stats">
            <span><img src="/sprites/icons/defense.png" alt="def" />{stats.def}</span>
            {stats.atk > 0 && <span><img src="/sprites/icons/attack.png" alt="atk" />{stats.atk}</span>}
            {stats.range > 0 && <span><img src="/sprites/icons/range.png" alt="range" />{stats.range}</span>}
            {stats.acts > 0 && <span><img src="/sprites/icons/speed.png" alt="moves" />{stats.acts}</span>}
          </div>
        )}

        <div className="place-hint">
          Click a highlighted tile · {game.placementTargets.length} available
        </div>
      </div>
      <button className="place-skip" onClick={() => game.skipSelection()}>Discard</button>
    </div>
  )
}
