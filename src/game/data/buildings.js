// Building definitions. A building occupies one BUILDING_CATEGORIES slot once
// unlocked, and can be deployed onto tiles during production. Buildings show only
// a Def (HP) stat on the tile; their value is their economic output/effect.
// HP grows linearly with upgrade level (unless `noUpgrade`).

// Pier food is a FLAT amount by upgrade level (no era scaling): 200, +100/upgrade.
const pierFood = (level = 1) => 200 + 100 * Math.max(0, level - 1)

// Campfire combat heal: % of a neighbour's max HP restored per combat-second.
const campfireHeal = (level = 1) => 5 + 2 * Math.max(0, level - 1) // 5 / 7 / 9 / ...

export const BUILDING_DEFS = {
  mud_wall: {
    key: 'mud_wall', name: 'Mud Wall', types: ['defense'], placement: 'land',
    hp: 25, upHp: 10,
    effect: 'A sturdy wall that stalls the enemy advance.',
  },
  pier: {
    key: 'pier', name: 'Pier', types: ['food'], placement: 'coast',
    hp: 12, upHp: 4,
    // Flat food by level (era-independent).
    effect: (level) => `Produces ${pierFood(level)} :food: at the end of each era.`,
    outputs: (level) => [{ res: 'food', amount: pierFood(level), per: 'era' }],
    eraFood: pierFood,
  },
  campfire: {
    key: 'campfire', name: 'Campfire', types: ['utility'], placement: 'land',
    hp: 1, upHp: 0,
    heal: campfireHeal, // % of max HP healed per combat-second
    effect: (level) => `Each second in combat, heals adjacent units & buildings for ${campfireHeal(level)}% of their max :defense:.`,
  },
  cave_painting: {
    key: 'cave_painting', name: 'Cave Painting', types: ['progress'], placement: 'land',
    hp: 8, upHp: 0, noUpgrade: true,
    storedBase: 5, storedMax: 50000, // starts at 5 :progress:, doubles each era, capped
    effect: 'When overbuilt, grants its stored :progress: (starts at 5, doubles each era after combat, max 50000).',
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
