// Buildings (v4 turn-based). Buildings are placed on tiles like units and are
// combat pieces: they have HP, can be RAZED by enemies (removed at 0 HP), and
// are REPAIRED with gold. Most produce a per-turn yield; some fight.
//
// Fields:
//   yield  — { gold?, progress? } added each turn while the building lives
//   atk/range — a defensive building that strikes enemies (Watchtower)
//   blocker   — occupies a tile and walls enemy pathing but does not attack
//   wonder    — a very expensive, one-per-feel building (steeper cost curve)
//
// hp scales with level (level is fixed at 1 in the prototype; the field is kept
// so upgrades can raise it later).

import { TERRAIN } from '../world/terrain.js'

const LAND = new Set(
  Object.values(TERRAIN).filter((t) => t.domain === 'land' && t.passable).map((t) => t.key),
)

// Display order in the build menu.
export const BUILDING_ORDER = ['market', 'library', 'wall', 'watchtower', 'wonder']

export const BUILDING_DEFS = {
  market: {
    key: 'market', name: 'Market', icon: '/sprites/ui/building.png', flavor: '#d9b45a',
    hp: 24, cost: 100, placement: LAND, yield: { gold: 6 },
    blurb: 'Generates +6 :gold: every turn.',
  },
  library: {
    key: 'library', name: 'Library', icon: '/sprites/ui/utility-building.png', flavor: '#6ad9a0',
    hp: 24, cost: 110, placement: LAND, yield: { progress: 5 },
    blurb: 'Generates +5 :progress: every turn.',
  },
  wall: {
    key: 'wall', name: 'Wall', icon: '/sprites/ui/building.png', flavor: '#9aa0a6',
    hp: 80, cost: 90, placement: LAND, blocker: true,
    blurb: 'A tough blocker (80 :defense:). Walls off enemy paths; does not attack.',
  },
  watchtower: {
    key: 'watchtower', name: 'Watchtower', icon: '/sprites/ui/utility-building.png', flavor: '#d85a5a',
    hp: 34, cost: 150, placement: LAND, atk: 9, range: 2,
    blurb: 'Strikes enemies within 2 tiles for 9 :attack:.',
  },
  wonder: {
    key: 'wonder', name: 'Grand Wonder', icon: '/sprites/ui/wonder.png', flavor: '#b06ad9',
    hp: 120, cost: 900, placement: LAND, wonder: true, yield: { gold: 12, progress: 10 },
    blurb: 'A costly marvel: +12 :gold: and +10 :progress: every turn.',
  },
}

export const isBuildingKey = (k) => !!BUILDING_DEFS[k]

/** May a building be placed on this terrain? */
export function canPlaceBuilding(def, terrainKey) {
  return !!def && def.placement.has(terrainKey)
}

/** A building instance's max HP (level kept for future upgrades). */
export function buildingHp(def, level = 1) {
  return Math.round(def.hp * (1 + 0.5 * (level - 1)))
}
