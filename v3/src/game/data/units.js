// Player unit roster (v3 scaffold).
//
// Deliberately generic: three archetypes with the same stat vocabulary the
// enemies use, so the turn engine can treat both sides uniformly. Real content
// comes from the progress web later — these exist so combat has something to
// simulate.
//
//   def   = HP
//   atk   = damage per attack
//   range = attack radius in hex distance
//   acts  = cells moved per turn (0 = holds position)

export const UNIT_DEFS = {
  melee: {
    key: 'melee', name: 'Warrior', type: 'melee',
    def: 22, atk: 7, range: 1, acts: 1,
    icon: '/sprites/ui/melee.png',
    blurb: 'Closes with the nearest enemy and holds the line.',
  },
  ranged: {
    key: 'ranged', name: 'Archer', type: 'ranged',
    def: 12, atk: 6, range: 3, acts: 0,
    icon: '/sprites/ui/ranged.png',
    blurb: 'Strikes from behind the line; never advances.',
  },
  cavalry: {
    key: 'cavalry', name: 'Rider', type: 'cavalry',
    def: 16, atk: 8, range: 1, acts: 2,
    icon: '/sprites/ui/cavalry.png',
    blurb: 'Fast melee — covers two tiles a turn to reach a breach.',
  },
}

export const UNIT_LIST = Object.values(UNIT_DEFS)

// The palace is the fail state: if it falls, the run ends. It fights back.
export const PALACE = {
  key: 'palace', name: 'Palace', type: 'palace',
  def: 240, atk: 10, range: 2, acts: 0,
  icon: '/sprites/ui/wonder.png',
}

/** Stats scaled for a wave. Growth matches enemy HP growth (1.25) so the two
 *  sides stay comparable and the garrison is bought against a budget instead. */
export function unitStats(def, wave) {
  const s = Math.pow(1.25, wave)
  return {
    ...def,
    def: Math.max(1, Math.round(def.def * s)),
    atk: Math.max(1, Math.round(def.atk * s)),
  }
}
