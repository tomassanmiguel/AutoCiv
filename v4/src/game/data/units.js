// Player unit classes (v4). SIX classes, one unit per class. Techs on the
// Military track unlock classes and raise a per-class atk/def upgrade line; a
// class's stat line improves every unit of it already on the board.
//
// Units are mostly STATIONARY towers (empty movement set). CAVALRY is the sole
// exception: it attacks, then retreats a step toward safety. Placement/movement
// are TERRAIN KEY SETS, enforced by the manager.
//
// Stats (all placeholders, docs/design.md §15):
//   atk   — damage dealt per attack (direct; reduced by target-terrain dmg mult)
//   def   — HIT POINTS (there is no armor mitigation; def IS the HP pool)
//   range — attack radius in hex distance (+terrain rangeBonus while stationed)
//   cd    — cooldown in ticks between acts (lower = faster)

import { TERRAIN } from '../world/terrain.js'

const byDomain = (domain) =>
  new Set(Object.values(TERRAIN).filter((t) => t.domain === domain && t.passable).map((t) => t.key))

const LAND = byDomain('land')
const WATER = byDomain('water')
const SPACE = byDomain('space')
const ANY = new Set([...LAND, ...WATER, ...SPACE])

// Display order = the order classes appear in the build panel.
export const UNIT_ORDER = ['melee', 'ranged', 'cavalry', 'naval', 'aerial', 'astral']

export const UNIT_DEFS = {
  melee: {
    key: 'melee', name: 'Warrior', flavor: '#d98a5a', icon: '/sprites/ui/melee.png',
    atk: 8, def: 30, range: 1, cd: 8,
    placement: LAND, move: new Set(),
    blurb: 'A stationary frontline wall. Cheap, tough, hits hard up close.',
  },
  ranged: {
    key: 'ranged', name: 'Archer', flavor: '#8ac06a', icon: '/sprites/ui/ranged.png',
    atk: 6, def: 18, range: 2, cd: 10, aoe: 0,
    placement: LAND, move: new Set(),
    blurb: 'Strikes from a distance. The backbone of a kill-zone.',
  },
  cavalry: {
    key: 'cavalry', name: 'Rider', flavor: '#c86ad9', icon: '/sprites/ui/cavalry.png',
    atk: 10, def: 24, range: 1, cd: 6, retreat: true,
    placement: LAND, move: LAND,
    blurb: 'Fast. Attacks, then retreats a step toward safety.',
  },
  naval: {
    key: 'naval', name: 'Galley', flavor: '#5a9ad9', icon: '/sprites/ui/boat.png',
    atk: 8, def: 24, range: 2, cd: 10, canHitEmbarked: true,
    placement: WATER, move: new Set(),
    blurb: 'Fights on the water and punishes embarked hosts at sea.',
  },
  aerial: {
    key: 'aerial', name: 'Skyship', flavor: '#d9cf5a', icon: '/sprites/ui/aerial.png',
    atk: 8, def: 20, range: 2, cd: 8, canHitEmbarked: true,
    placement: LAND, move: new Set(),
    blurb: 'Ranges over any terrain and strikes embarked hosts.',
  },
  astral: {
    key: 'astral', name: 'Starcraft', flavor: '#9a9adf', icon: '/sprites/ui/astral.png',
    atk: 10, def: 26, range: 2, cd: 10, canHitEmbarked: true,
    placement: SPACE, move: new Set(),
    blurb: 'Operates in space and on celestial bodies; reaches the deep map.',
  },
}

export const PALACE_ICON = '/sprites/ui/wonder.png'
export const CITY_ICON = '/sprites/ui/building.png'

export const ALL_TERRAIN = ANY

/** May a unit of this class be CREATED on this terrain? */
export function canPlaceUnit(def, terrainKey) {
  if (!def) return TERRAIN[terrainKey]?.passable ?? false
  return def.placement.has(terrainKey)
}
