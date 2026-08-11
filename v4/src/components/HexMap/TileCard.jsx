import { UNIT_DEFS, PALACE_ICON, CITY_ICON } from '../../game/data/units.js'
import './TileCard.css'

const ATK = '/sprites/icons/attack.png'
const DEF = '/sprites/icons/defense.png'

/**
 * What sits ON a tile out of combat: a CITY (icon + pop + yields, palace flagged)
 * or a UNIT (a flavour-rimmed badge with its CLASS SYMBOL and atk/def). One piece
 * per tile in v4. Gold is spent from the build panel / upgrade modal, so there are
 * no on-tile action buttons.
 */
export default function TileCard({ game, tile, compact = false }) {
  const city = tile.city
  const unit = tile.unit
  if (!city && !unit) return null

  if (city) {
    const info = game.cityInfo(tile)
    return (
      <div className={`tile-card city-tc${city.palace ? ' palace' : ''}`}>
        <div className="tc-badge city">
          <img className="tc-icon" src={city.palace ? PALACE_ICON : CITY_ICON} alt={city.palace ? 'Palace' : 'City'} />
          <span className="tc-pop">{city.pop}</span>
        </div>
        {!compact && (
          <div className="tc-cyield">
            {info.food > 0 && <span className="tc-res food"><img src="/sprites/icons/food.png" alt="f" />{info.food}</span>}
            {info.gold > 0 && <span className="tc-res gold"><img src="/sprites/icons/gold.png" alt="g" />{info.gold}</span>}
            {info.progress > 0 && <span className="tc-res progress"><img src="/sprites/icons/progress.png" alt="p" />{info.progress}</span>}
          </div>
        )}
      </div>
    )
  }

  const d = UNIT_DEFS[unit.cls]
  const s = game.unitBoardStats(tile)
  return (
    <div className={`tile-card unit-tc${compact ? ' compact' : ''}`}>
      <div className="tc-badge unit" style={{ '--flavor': d.flavor }}>
        <img className="tc-icon" src={d.icon} alt={d.name} />
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
