import { useGame } from '../../game/react/GameProvider.jsx'
import './PrepBanner.css'

/**
 * The PREP phase: development is over, the wave is mustered on the frontier, and
 * nothing lands until you say so. This is the planning window — reposition your
 * army, repair, upgrade — with one prominent button to start the fight.
 *
 * Bottom-centre, above the map's drag handlers, so the tableau and panel stay
 * fully interactive behind it.
 */
export default function PrepBanner() {
  const game = useGame()
  if (!game.inPrep) return null

  const range = game.mods.repositionRange

  return (
    <div className="prep-banner">
      <div className="prep-text">
        <b>Prepare</b>
        <span>
          {range > 0
            ? <>Click a unit to reposition it — <b>{range}</b> tiles free, farther costs gold.</>
            : <>Repair, upgrade, and arrange before the wave. Reposition range comes from research.</>}
        </span>
      </div>
      <button className="prep-begin" onClick={() => game.beginWave()}>Begin Wave ⚔</button>
    </div>
  )
}
