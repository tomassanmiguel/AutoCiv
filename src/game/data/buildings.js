// Building definitions. A building occupies one BUILDING_CATEGORIES slot once
// unlocked, and can be deployed onto tiles during production. Buildings show only
// a Def (HP) stat on the tile; their value is their economic output/effect.
// HP grows linearly with upgrade level (unless `noUpgrade`).

// Pier food is a FLAT amount by upgrade level (no era scaling): 200, +100/upgrade.
const pierFood = (level = 1) => 200 + 100 * Math.max(0, level - 1)

// Campfire combat heal: % of a neighbour's max HP restored per combat-second.
const campfireHeal = (level = 1) => 5 + 2 * Math.max(0, level - 1) // 5 / 7 / 9 / ...
// Totem legitimacy granted at the end of each combat (per level).
const totemLegit = (level = 1) => 10 + 5 * Math.max(0, level - 1) // 10 / 15 / 20 / ...
// Per-tick output buildings (resolved with instance/tile context in GameManager):
const kilnPerAdjacent = (level = 1) => level + 1 // +2 / +3 / +4 … :production: per adjacent building
const mineGold = (level = 1) => 8 * level         // :gold: per tick (×2 on a mountain)

export const BUILDING_DEFS = {
  mud_wall: {
    key: 'mud_wall', name: 'Mud Wall', types: ['defense'], placement: 'land',
    hp: 25, upHp: 10,
    effect: 'A sturdy wall that stalls the enemy advance.',
  },
  totem: {
    key: 'totem', name: 'Totem', types: ['legitimacy'], placement: 'land',
    hp: 15, upHp: 5,
    combatLegit: totemLegit,
    effect: (level) => `At the end of combat, gain ${totemLegit(level)} :legitimacy:.`,
  },
  brewery: {
    key: 'brewery', name: 'Brewery', types: ['gold'], placement: 'land',
    hp: 5, upHp: 0,
    range: (level) => level, // range 1 / 2 / 3 / … (orthogonal steps)
    effect: (level) => `+1 :gold: per tick for each unit in range ${level}. Units in range: +10% :attack:, −10% :defense:.`,
  },
  pier: {
    key: 'pier', name: 'Pier', types: ['food'], placement: 'coast',
    hp: 12, upHp: 4,
    // Flat food by level (era-independent), granted at the end of combat.
    effect: (level) => `Produces ${pierFood(level)} :food: at the end of combat.`,
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
  ranch: {
    key: 'ranch', name: 'Ranch', types: ['food'], placement: 'land',
    hp: 8, upHp: 4,
    // Per-tick food = 5 + an era-growth bonus (occ.ranchBonus); grows +2/3/4/… at each
    // combat end, resets if destroyed (see GameManager _buildingTickOutputs / _endCombat).
    effect: 'Produces :food: each tick (starts at 5, +2/3/4/… at the end of each combat). If it is destroyed, the bonus resets.',
  },
  kiln: {
    key: 'kiln', name: 'Kiln', types: ['production'], placement: 'land',
    hp: 5, upHp: 3,
    perAdjacent: kilnPerAdjacent,
    effect: (level) => `Produces 2 :production: per tick, plus ${kilnPerAdjacent(level)} for each adjacent building.`,
  },
  mine: {
    key: 'mine', name: 'Mine', types: ['gold'], placement: 'land',
    hp: 12, upHp: 6,
    goldPerTick: mineGold,
    effect: (level) => `Produces ${mineGold(level)} :gold: per tick — doubled when placed on a mountain.`,
  },
  // Supplement building: no HP, no combat. Lives in tile.supplement (underlaps the
  // occupant), never replaced. Links every tile it touches into one adjacency group.
  road: {
    key: 'road', name: 'Road', types: ['supplement'], placement: 'land',
    supplement: true, noUpgrade: true, hp: 0, upHp: 0,
    effect: 'A supplement that underlaps any building and is never replaced. All tiles touching the road become adjacent to one another — extending building ranges and unit movement.',
  },
}

/** Effective building HP at a given upgrade level, plus a flat civ-wide bonus
 *  (Hereditary Rule). Supplement buildings (Road) have no HP. */
export function buildingHp(def, level = 1, hpBonus = 0) {
  return def.hp + Math.max(0, level - 1) * (def.upHp ?? 0) + hpBonus
}

/** Current effect text for a building at a level/era (resolves dynamic effects). */
export function buildingEffect(def, level = 1, eraIndex = 0) {
  return typeof def.effect === 'function' ? def.effect(level, eraIndex) : def.effect
}

/** Current economic outputs [{ res, amount, per }] for a building, or [] if none. */
export function buildingOutputs(def, level = 1, eraIndex = 0) {
  return typeof def.outputs === 'function' ? def.outputs(level, eraIndex) : []
}
