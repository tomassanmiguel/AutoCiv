// Player unit classes (v4 turn-based prototype). Land-focused Stone..Renaissance
// roster of FIVE classes. Units are STATIONARY towers: each acts once per turn,
// striking the best enemy in range. Death is PERMANENT — a unit reduced to 0 HP
// is gone (no post-combat heal). Placement is a terrain-key set.
//
// Stats:
//   atk   — damage dealt per attack (reduced by target-terrain dmg mult)
//   def   — HIT POINTS (def IS the HP pool; no armor mitigation)
//   range — attack radius in hexes (+terrain rangeBonus while stationed)
//   splash — siege only: fraction of atk dealt to tiles around the target

import { TERRAIN } from '../world/terrain.js'

const LAND = new Set(
  Object.values(TERRAIN).filter((t) => t.domain === 'land' && t.passable).map((t) => t.key),
)

// Display order = the order classes appear in the build panel.
export const UNIT_ORDER = ['melee', 'ranged', 'cavalry', 'siege', 'heavy']

export const UNIT_DEFS = {
  melee: {
    key: 'melee', name: 'Warrior', flavor: '#d98a5a', icon: '/sprites/ui/melee.png',
    atk: 8, def: 32, range: 1,
    placement: LAND,
    blurb: 'A cheap, tough frontline wall that hits hard up close.',
  },
  ranged: {
    key: 'ranged', name: 'Archer', flavor: '#8ac06a', icon: '/sprites/ui/ranged.png',
    atk: 7, def: 18, range: 2,
    placement: LAND,
    blurb: 'Strikes from a distance — the backbone of a kill-zone.',
  },
  cavalry: {
    key: 'cavalry', name: 'Rider', flavor: '#c86ad9', icon: '/sprites/ui/cavalry.png',
    atk: 14, def: 24, range: 1,
    placement: LAND,
    blurb: 'A hard-hitting shock unit. Great value against tough bodies.',
  },
  siege: {
    key: 'siege', name: 'Catapult', flavor: '#d9a35a', icon: '/sprites/ui/siege.png',
    atk: 20, def: 16, range: 2, splash: 0.5,
    placement: LAND,
    blurb: 'Hits its target and everything around it — clears packed hosts.',
  },
  heavy: {
    key: 'heavy', name: 'Pikeman', flavor: '#6a8ad9', icon: '/sprites/ui/utility.png',
    atk: 10, def: 48, range: 1,
    placement: LAND,
    blurb: 'A heavy wall that soaks enormous damage and holds a chokepoint.',
  },
}

export const PALACE_ICON = '/sprites/ui/wonder.png'
export const CITY_ICON = '/sprites/ui/building.png'

/** May a unit of this class be CREATED on this terrain? */
export function canPlaceUnit(def, terrainKey) {
  if (!def) return TERRAIN[terrainKey]?.passable ?? false
  return def.placement.has(terrainKey)
}
