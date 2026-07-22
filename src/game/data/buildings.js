// Building definitions. A building occupies one BUILDING_CATEGORIES slot once
// unlocked, and can be deployed onto tiles during production. Buildings show only
// a Def (HP) stat on the tile; their value is their economic output/effect.
// HP grows linearly with upgrade level.

// Food yielded at the end of an era (per building level), by era index.
const pierFood = (eraIndex, level = 1) => (200 + 100 * eraIndex) * level

export const BUILDING_DEFS = {
  mud_wall: {
    key: 'mud_wall', name: 'Mud Wall', types: ['defense'], placement: 'land',
    hp: 22, upHp: 8,
    effect: 'A sturdy wall that stalls the enemy advance.',
  },
  pier: {
    key: 'pier', name: 'Pier', types: ['food'], placement: 'coast',
    hp: 12, upHp: 4,
    // Dynamic: the effect describes the CURRENT era/level value, not the sequence.
    effect: (level, eraIndex) => `Produces ${pierFood(eraIndex, level)} food at the end of each era.`,
    // End-of-era economic output, at the current era/level.
    outputs: (level, eraIndex) => [{ res: 'food', amount: pierFood(eraIndex, level), per: 'era' }],
    eraFood: pierFood,
  },
}

/** Effective building HP at a given upgrade level. */
export function buildingHp(def, level = 1) {
  return def.hp + Math.max(0, level - 1) * (def.upHp ?? 0)
}

/** Current effect text for a building at a level/era (resolves dynamic effects). */
export function buildingEffect(def, level = 1, eraIndex = 0) {
  return typeof def.effect === 'function' ? def.effect(level, eraIndex) : def.effect
}

/** Current economic outputs [{ res, amount, per }] for a building, or [] if none. */
export function buildingOutputs(def, level = 1, eraIndex = 0) {
  return typeof def.outputs === 'function' ? def.outputs(level, eraIndex) : []
}
