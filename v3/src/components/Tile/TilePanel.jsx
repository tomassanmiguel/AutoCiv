import { useGame } from '../../game/react/GameProvider.jsx'
import { UNIT_DEFS, unitStats } from '../../game/data/units.js'
import { BUILDING_DEFS, buildingYield } from '../../game/data/buildings.js'
import { terrainOf } from '../../game/world/terrain.js'
import './TilePanel.css'

/**
 * Click a tile you control and this is where gold gets spent — the only
 * moment-to-moment decision in the game, since food/production/progress all
 * spend themselves on thresholds.
 *
 * Repair brings back what a wave destroyed; upgrade makes something permanently
 * better. Both show the price and grey out when you cannot afford them.
 */
export default function TilePanel() {
  const game = useGame()
  const t = game.inspected
  if (!t) return null

  const actions = game.tileActions(t)
  const unit = t.unit && UNIT_DEFS[t.unit.key]
  const building = t.building && BUILDING_DEFS[t.building.key]
  const stats = unit ? unitStats(unit, game.era, game.mods, t.unit.level ?? 1) : null
  const nothingHere = !unit && !building && !t.ruin

  return (
    <div className="tile-panel">
      <button className="tp-close" onClick={() => game.inspect(null)}>×</button>

      <div className="tp-head">
        <span className="tp-title">{terrainOf(t.terrain).name}</span>
        <span className="tp-sub">ring {t.d}{t.improved && ' · improved'}{t.road && ' · road'}</span>
      </div>

      {t.ruin && (
        <div className="tp-row ruin">
          <span className="tp-name">Ruined {t.ruin.kind}</span>
          <span className="tp-note">Razed in the last wave. Nothing here produces.</span>
        </div>
      )}

      {unit && (
        <div className={`tp-row${t.unit.destroyed ? ' destroyed' : ''}`}>
          <img className="tp-icon" src={unit.icon} alt="" />
          <div>
            <span className="tp-name">
              {unit.name}
              {(t.unit.level ?? 1) > 1 && <b className="tp-level">L{t.unit.level}</b>}
            </span>
            <div className="tp-stats">
              <span><img src="/sprites/icons/defense.png" alt="def" />{stats.def}</span>
              {stats.atk > 0 && <span><img src="/sprites/icons/attack.png" alt="atk" />{stats.atk}</span>}
              {stats.range > 0 && <span><img src="/sprites/icons/range.png" alt="rng" />{stats.range}</span>}
              {stats.acts > 0 && <span><img src="/sprites/icons/speed.png" alt="mv" />{stats.acts}</span>}
            </div>
            {t.unit.destroyed && <span className="tp-note danger">Destroyed — will not fight until repaired.</span>}
          </div>
        </div>
      )}

      {building && (
        <div className="tp-row">
          <img className="tp-icon" src={building.icon} alt="" />
          <div>
            <span className="tp-name">
              {building.name}
              {(t.building.level ?? 1) > 1 && <b className="tp-level">L{t.building.level}</b>}
            </span>
            <div className="tp-stats">
              {Object.entries(buildingYield(game.world, t)).filter(([, v]) => v > 0)
                .map(([r, v]) => <span key={r}>+{v} {r}</span>)}
            </div>
          </div>
        </div>
      )}

      {nothingHere && <div className="tp-note">Nothing here to repair or upgrade.</div>}

      {actions.length > 0 && (
        <div className="tp-actions">
          {actions.map((a) => (
            <button
              key={a.kind}
              className={`tp-action${a.afford ? '' : ' poor'}`}
              disabled={!a.afford}
              onClick={() => game.doTileAction(t, a.kind)}
            >
              <span>{a.label}{a.level ? ` → L${a.level + 1}` : ''}</span>
              <span className="tp-cost">
                <img src="/sprites/icons/gold.png" alt="gold" />{a.cost}
              </span>
            </button>
          ))}
        </div>
      )}
      {!game.canSpend && (unit || building || t.ruin) && (
        <div className="tp-note">Gold cannot be spent during a battle.</div>
      )}
    </div>
  )
}
