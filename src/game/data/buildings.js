// Building definitions. A building occupies one BUILDING_CATEGORIES slot once
// unlocked, and can be deployed onto tiles during production. Buildings show only
// a Def (HP) stat on the tile; their value is their economic output/effect.
// HP grows linearly with upgrade level.

export const BUILDING_DEFS = {
  mud_wall: {
    key: 'mud_wall', name: 'Mud Wall', types: ['defense'], placement: 'land',
    hp: 22, upHp: 8,
    effect: 'A sturdy wall that stalls the enemy advance.',
  },
  pier: {
    key: 'pier', name: 'Pier', types: ['food'], placement: 'coast',
    hp: 12, upHp: 4,
    effect: 'At the end of each era, produces food (200/300/400/… by era).',
    // Food yielded at the end of an era (per building level), by era index.
    eraFood: (eraIndex, level = 1) => (200 + 100 * eraIndex) * level,
  },
}

/** Effective building HP at a given upgrade level. */
export function buildingHp(def, level = 1) {
  return def.hp + Math.max(0, level - 1) * (def.upHp ?? 0)
}
