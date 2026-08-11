import { UNIT_DEFS } from '../../game/data/units.js'
import './TileCard.css'

const ATK = '/sprites/icons/attack.png'
const DEF = '/sprites/icons/defense.png'

/**
 * What sits ON a tile out of combat: a CITY (name + pop + def, palace flagged) or
 * a UNIT (a coloured badge with atk/def). One piece per tile in v4, so only one
 * of the two renders. Gold is spent from the build panel / upgrade modal, not on
 * the tile, so there are no on-tile action buttons.
 */
export default function TileCard({ game, tile, compact = false }) {
  const city = tile.city
  const unit = tile.unit
  if (!city && !unit) return null

  if (city) {
    const info = game.cityInfo(tile)
    return (
      <div className={`tile-card city-tc${city.palace ? ' palace' : ''}`}>
        <div className="tc-cname">{city.palace ? 'Palace' : 'City'}</div>
        <div className="tc-cpop">👤 {city.pop}</div>
        <div className="tc-cyield">
          {info.gold > 0 && <span className="tc-res gold"><img src="/sprites/icons/gold.png" alt="g" />{info.gold}</span>}
          {info.progress > 0 && <span className="tc-res progress"><img src="/sprites/icons/progress.png" alt="p" />{info.progress}</span>}
        </div>
      </div>
    )
  }

  const d = UNIT_DEFS[unit.cls]
  const s = game.unitBoardStats(tile)
  return (
    <div className={`tile-card unit-tc${compact ? ' compact' : ''}`}>
      <div className="tc-unit" style={{ '--flavor': d.flavor }}>
        <span className="tc-uname">{d.name}</span>
      </div>
      {!compact && (
        <>
          <span className="tc-stat atk"><img src={ATK} alt="atk" />{s.atk}</span>
          <span className="tc-stat def"><img src={DEF} alt="def" />{s.def}</span>
        </>
      )}
    </div>
  )
}
