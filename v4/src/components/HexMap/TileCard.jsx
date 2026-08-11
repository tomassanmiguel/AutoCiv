import { UNIT_DEFS, PALACE_ICON, CITY_ICON } from '../../game/data/units.js'
import './TileCard.css'

const ATK = '/sprites/icons/attack.png'
const DEF = '/sprites/icons/defense.png'
const POP = '/sprites/ui/pop.png'

/**
 * What sits ON a tile out of combat.
 *
 * A CITY / PALACE is ONE cohesive panel — type icon + pop on top, its per-cooldown
 * yields in a row below — so nothing floats. A UNIT is a flavour-rimmed badge with
 * its class symbol and atk/def. One piece per tile in v4.
 */
export default function TileCard({ game, tile, compact = false }) {
  const city = tile.city
  const unit = tile.unit
  if (!city && !unit) return null

  if (city) {
    const info = game.cityInfo(tile)
    return (
      <div className="tile-card">
        <div className={`city-card${city.palace ? ' palace' : ''}`}>
          <div className="cc-head">
            <img className="cc-type" src={city.palace ? PALACE_ICON : CITY_ICON} alt={city.palace ? 'Palace' : 'City'} />
            <span className="cc-pop"><img src={POP} alt="pop" />{city.pop}</span>
          </div>
          <div className="cc-yields">
            {info.food > 0 && <span className="cc-y food"><img src="/sprites/icons/food.png" alt="food" />{info.food}</span>}
            {info.gold > 0 && <span className="cc-y gold"><img src="/sprites/icons/gold.png" alt="gold" />{info.gold}</span>}
            {info.progress > 0 && <span className="cc-y progress"><img src="/sprites/icons/progress.png" alt="progress" />{info.progress}</span>}
          </div>
        </div>
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
