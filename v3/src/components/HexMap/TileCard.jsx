import { UNIT_DEFS } from '../../game/data/units.js'
import { buildingDef } from '../../game/data/buildings.js'
import { RESOURCES, RES_ICON } from '../../game/world/terrain.js'
import './TileCard.css'

/**
 * What sits ON a tile, and what gold can do to it.
 *
 * A UNIT is a hexagon badge with its type icon in the middle — it echoes the
 * board it stands on, and reads at a glance from any zoom. A BUILDING is a small
 * name card, since which building it is matters more than what it looks like.
 *
 * The gold actions live HERE rather than in a side panel: repair and upgrade are
 * the only things you spend gold on, so they belong on the thing being spent on.
 * A tile can hold BOTH a unit and a building, so the two sets of actions sit on
 * OPPOSITE sides — unit gold on the left, building gold on the right — and each
 * upgrade says which thing it upgrades. Buttons only appear on hover.
 */
export default function TileCard({ game, tile, hovered, onHover }) {
  const actions = hovered ? game.tileActions(tile) : []
  const unitDef = tile.unit && UNIT_DEFS[tile.unit.key]
  const buildDef = tile.building && buildingDef(tile.building.key)
  if (!unitDef && !buildDef && !tile.ruin) return null

  // TRUE current stats — Formations, earned flats and fortification synergy folded
  // in, so the card shows what the unit actually fights at, not the class line.
  const stats = unitDef ? game.unitBoardStats(tile) : null
  const unitActions = actions.filter((a) => a.kind === 'repair-unit' || a.kind === 'upgrade-unit')
  const buildActions = actions.filter((a) => a.kind === 'rebuild' || a.kind === 'upgrade-building')

  return (
    <div className="tile-card">
      {buildDef && (() => {
        const y = game.buildingOutput(tile)
        const earning = RESOURCES.filter((r) => y[r] > 0)
        return (
          <div className={`tc-building${tile.city ? ' with-city' : ''}`}>
            <span className="tc-bname">{buildDef.name}</span>
            {earning.length > 0 ? (
              <span className="tc-byield">
                {earning.map((r) => (
                  <span key={r} className={`tc-res ${r}`}>
                    <img src={RES_ICON[r]} alt={r} />{Math.round(y[r])}
                  </span>
                ))}
              </span>
            ) : <span className="tc-bidle">idle</span>}
            {(tile.building.level ?? 1) > 1 && <span className="tc-level">{tile.building.level}</span>}
          </div>
        )
      })()}

      {tile.ruin && <div className="tc-ruin">Ruined {tile.ruin.kind}</div>}

      {/* The badge is clip-pathed to a hexagon, and a clip-path clips its
          DESCENDANTS — so the stat pills and the level pip have to be siblings
          of it, not children, or they get sliced off at the hex edge. */}
      {unitDef && stats && (
        <div className="tc-unit-wrap">
          <div className={`tc-unit ${unitDef.type}${tile.unit.destroyed ? ' destroyed' : ''}`}>
            <img className="tc-uicon" src={unitDef.icon} alt={unitDef.name} />
          </div>
          {(tile.unit.level ?? 1) > 1 && <span className="tc-level">{tile.unit.level}</span>}
          {/* Attack bottom-left, defence bottom-right — the same two corners
              every time, so the numbers are read by position, not by label. */}
          {!tile.unit.destroyed && stats.atk > 0 && (
            <span className="tc-stat atk">
              <img src="/sprites/icons/attack.png" alt="attack" />{stats.atk}
            </span>
          )}
          {!tile.unit.destroyed && (
            <span className="tc-stat def">
              <img src="/sprites/icons/defense.png" alt="defense" />{stats.def}
            </span>
          )}
        </div>
      )}

      {/* Unit gold LEFT, building gold RIGHT — so on a tile with both, the two
          never stack and each upgrade names its target. */}
      {unitActions.length > 0 && <ActionBar side="left" actions={unitActions} game={game} tile={tile} onHover={onHover} />}
      {buildActions.length > 0 && <ActionBar side="right" actions={buildActions} game={game} tile={tile} onHover={onHover} />}
    </div>
  )
}

function ActionBar({ side, actions, game, tile, onHover }) {
  return (
    // The buttons are the only part that takes the pointer, so moving onto one
    // leaves the hex and would unmount it — re-assert hover on enter AND move.
    <div className={`tc-actions ${side}`} onMouseEnter={onHover} onMouseMove={onHover} onMouseOver={onHover}>
      {actions.map((a) => (
        <button
          key={a.kind}
          className={`tc-action${a.afford ? '' : ' poor'}`}
          disabled={!a.afford}
          onClick={(e) => { e.stopPropagation(); game.doTileAction(tile, a.kind) }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {ACTION_LABEL[a.kind]}
          <img src="/sprites/icons/gold.png" alt="gold" />
          {a.cost}
        </button>
      ))}
    </div>
  )
}

const ACTION_LABEL = {
  'repair-unit': 'Repair Unit',
  'rebuild': 'Rebuild',
  'upgrade-unit': 'Upgrade Unit',
  'upgrade-building': 'Upgrade Building',
}
