import { UNIT_DEFS, unitStats } from '../../game/data/units.js'
import { BUILDING_DEFS, buildingYield } from '../../game/data/buildings.js'
import './TileCard.css'

/**
 * What sits ON a tile, and what gold can do to it.
 *
 * A UNIT is a hexagon badge with its type icon in the middle — it echoes the
 * board it stands on, and reads at a glance from any zoom. A BUILDING is a small
 * name card, since which building it is matters more than what it looks like.
 *
 * The gold action lives HERE rather than in a side panel: repair and upgrade are
 * the only things you spend gold on, so they belong on the thing being spent on.
 * The button only appears on hover, so a quiet board stays quiet.
 */
export default function TileCard({ game, tile, hovered, onHover }) {
  const actions = hovered ? game.tileActions(tile) : []
  const unitDef = tile.unit && UNIT_DEFS[tile.unit.key]
  const buildDef = tile.building && BUILDING_DEFS[tile.building.key]
  if (!unitDef && !buildDef && !tile.ruin) return null

  const stats = unitDef ? unitStats(unitDef, game.era, game.mods, tile.unit.level ?? 1) : null

  return (
    <div className="tile-card">
      {buildDef && (
        <div className={`tc-building${tile.city ? ' with-city' : ''}`}>
          <span className="tc-bname">{buildDef.name}</span>
          <span className="tc-byield">
            {Object.values(buildingYield(game.world, tile)).filter((v) => v > 0)
              .map((v) => `+${v}`).join(' ') || '—'}
          </span>
          {(tile.building.level ?? 1) > 1 && <span className="tc-level">{tile.building.level}</span>}
        </div>
      )}

      {tile.ruin && <div className="tc-ruin">Ruined {tile.ruin.kind}</div>}

      {unitDef && (
        <div className={`tc-unit ${unitDef.type}${tile.unit.destroyed ? ' destroyed' : ''}`}>
          <img src={unitDef.icon} alt={unitDef.name} />
          {(tile.unit.level ?? 1) > 1 && <span className="tc-level">{tile.unit.level}</span>}
          {hovered && !tile.unit.destroyed && (
            <span className="tc-stats">
              <b>{stats.atk || '—'}</b>/<b>{stats.def}</b>
            </span>
          )}
        </div>
      )}

      {actions.length > 0 && (
        // The buttons are the only part that takes the pointer, so moving onto
        // one would otherwise leave the hex, clear `hover`, and unmount the
        // button out from under the cursor. Re-assert the hover here.
        <div className="tc-actions" onMouseEnter={onHover} onMouseMove={onHover}>
          {actions.map((a) => (
            <button
              key={a.kind}
              className={`tc-action${a.afford ? '' : ' poor'}`}
              disabled={!a.afford}
              // The tile underneath is a click target for expansion/placement.
              onClick={(e) => { e.stopPropagation(); game.doTileAction(tile, a.kind) }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {ACTION_LABEL[a.kind]}
              <img src="/sprites/icons/gold.png" alt="gold" />
              {a.cost}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const ACTION_LABEL = {
  'repair-unit': 'Repair',
  'rebuild': 'Rebuild',
  'upgrade-unit': 'Upgrade',
  'upgrade-building': 'Upgrade',
}
