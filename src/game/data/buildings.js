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
const templeLegit = (level = 1) => level          // :legitimacy: per tick (1 / 2 / 3 …)
const mintLegitPct = (level = 1) => 0.05 + 0.02 * Math.max(0, level - 1) // 5% / 7% / 9% … of legitimacy
const forgingProd = (level = 1) => 3 * (level + 1)      // :production: per tick (6 / 9 / 12 …)
const libraryProgress = (level = 1) => 200 * (level + 1) // end-of-combat :progress: (400 / 600 / 800 …)
const lighthouseBonus = (level = 1) => 2 + 0.5 * Math.max(0, level - 1) // +200% then +50%/level (additive)
const aqueductBase = (level = 1) => 5 * (level + 1)     // base :food:/tick (10 / 15 / 20 …), ×2 per adjacent Aqueduct
const glassworksLegit = (level = 1) => 30 + 5 * Math.max(0, level - 1) // :legitimacy: on each building completed (30 / 35 / 40 …)
// Brothel combat aura: adjacent units' :attack: multiplier by level (+10/15/20%).
const brothelAtk = (level = 1) => 0.10 + 0.05 * Math.max(0, level - 1)

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
  brothel: {
    key: 'brothel', name: 'Brothel', types: ['utility'], placement: 'land',
    hp: 6, upHp: 2,
    atkPct: brothelAtk, // adjacent-unit :attack: bonus by level
    cdReduce: 0.5,      // adjacent-unit cooldown reduction (seconds)
    effect: (level) => `Adjacent units attack 0.5s faster and gain +${Math.round(brothelAtk(level) * 100)}% :attack:.`,
  },
  embassy: {
    key: 'embassy', name: 'Embassy', types: ['utility'], placement: 'land',
    hp: 20, upHp: 6,
    mercEvery: 8, // combat-seconds between free mercenaries
    effect: 'In combat, hires a random mercenary onto an empty adjacent tile every 8 seconds.',
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
  forging: {
    key: 'forging', name: 'Forging', types: ['production'], placement: 'land',
    hp: 10, upHp: 4,
    prodPerTick: forgingProd,
    effect: (level) => `Produces ${forgingProd(level)} :production: per tick. At the end of each combat, upgrades a random adjacent unit.`,
  },
  library: {
    key: 'library', name: 'Library', types: ['progress'], placement: 'land',
    hp: 9, upHp: 3,
    outputs: (level) => [{ res: 'progress', amount: libraryProgress(level), per: 'era' }],
    effect: (level) => `At the end of each combat, gain ${libraryProgress(level)} :progress:.`,
  },
  mine: {
    key: 'mine', name: 'Mine', types: ['gold'], placement: 'land',
    hp: 12, upHp: 6,
    goldPerTick: mineGold,
    effect: (level) => `Produces ${mineGold(level)} :gold: per tick — doubled when placed on a mountain.`,
  },
  mint: {
    key: 'mint', name: 'Mint', types: ['gold'], placement: 'land',
    hp: 10, upHp: 4,
    legitPct: mintLegitPct,
    effect: (level) => `Produces :gold: each tick equal to ${Math.round(mintLegitPct(level) * 100)}% of your current :legitimacy:.`,
  },
  lighthouse: {
    key: 'lighthouse', name: 'Lighthouse', types: ['gold'], placement: 'coast',
    hp: 12, upHp: 4,
    unblockedBonus: lighthouseBonus, // +200%/+250%/+300%… (ADDITIVE) to a :naval: unit's unblocked-damage resources in its waters
    effect: (level) => `When a :naval: unit deals unblocked damage in the Lighthouse's waters, resources gained are increased by ${Math.round(lighthouseBonus(level) * 100)}%.`,
  },
  temple: {
    key: 'temple', name: 'Temple', types: ['legitimacy'], placement: 'land',
    hp: 18, upHp: 6,
    legitPerTick: templeLegit,
    effect: (level) => `Produces ${templeLegit(level)} :legitimacy: per tick.`,
  },
  farm: {
    key: 'farm', name: 'Farm', types: ['food'], placement: 'land',
    hp: 6, upHp: 2,
    effect: 'Produces +5 :food: per tick for each adjacent Plains tile (including its own).',
  },
  aqueduct: {
    key: 'aqueduct', name: 'Aqueduct', types: ['food'], placement: 'land',
    hp: 12, upHp: 5, // +5 base food per upgrade (via aqueductBase)
    base: aqueductBase,
    effect: (level) => `Produces ${aqueductBase(level)} :food: per tick — DOUBLED for each adjacent Aqueduct.`,
  },
  glassworks: {
    key: 'glassworks', name: 'Glassworks', types: ['production'], placement: 'land',
    hp: 10, upHp: 4,
    legitOnBuild: glassworksLegit,
    effect: (level) => `Produces 10 :production: per tick. Whenever you complete another building anywhere, gain ${glassworksLegit(level)} :legitimacy:.`,
  },
  colosseum: {
    key: 'colosseum', name: 'Colosseum', types: ['legitimacy'], placement: 'land',
    hp: 16, upHp: 5,
    effect: 'At the end of each combat, gain 5 :legitimacy: for each unit in your civilization.',
  },
  public_baths: {
    key: 'public_baths', name: 'Public Baths', types: ['utility'], placement: 'land',
    hp: 8, upHp: 3,
    bathsEvery: 5, bathsHealPct: 50, // every 5 combat-seconds: heal adjacent 50% of max HP …
    bathsAtk: (level = 1) => level, // … and permanently grant adjacent units +level :attack:
    effect: (level) => `Every 5 seconds in combat, heals adjacent units & buildings for 50% of their max :defense: and permanently grants adjacent units +${level} :attack:.`,
  },
  // City: an underlaid UTILITY support. `underlaidCity: true` gives it its OWN tile slot
  // (`tile.city`, independent of a Road) with no HP/combat, and lets the tile hold
  // `extraCap` additional non-underlaid buildings in `tile.extras`. City buildings are
  // additive (they never replace) and can't be replaced or overbuilt themselves.
  city: {
    key: 'city', name: 'City', types: ['utility'], placement: 'land',
    underlaidCity: true, noUpgrade: true, hp: 0, upHp: 0,
    extraCap: 2, // additional buildings the tile can hold beyond its primary occupant
    effect: 'Underlaid. Lets this tile hold 2 additional buildings. City buildings can never be replaced.',
  },
  // Road: a UTILITY building that UNDERLAPS. `underlap: true` means it lives in the
  // tile's own `underlap` slot (never replaced, no HP/combat) rather than as the
  // occupant. Links every tile it touches into one adjacency group.
  road: {
    key: 'road', name: 'Road', types: ['utility'], placement: 'land',
    underlap: true, noUpgrade: true, hp: 0, upHp: 0,
    effect: 'All tiles adjacent to the road are adjacent to each other. Underlaid.',
  },
}

/** Effective building HP at a given upgrade level, plus a flat civ-wide bonus
 *  (Hereditary Rule / Masonry). Underlapping buildings (Road) have no HP. Walls grow
 *  HP via upHp (upgradeTarget 'def'); output buildings keep a flat HP. */
export function buildingHp(def, level = 1, hpBonus = 0) {
  return def.hp + Math.max(0, level - 1) * (def.upHp ?? 0) + hpBonus
}

/** Current effect text for a building at a level/era (resolves dynamic effects). */
export function buildingEffect(def, level = 1, eraIndex = 0) {
  return typeof def.effect === 'function' ? def.effect(level, eraIndex) : def.effect
}

/** v2 per-tick output amount for a building with a generic `output` (when: 'tick'),
 *  scaled +25% per upgrade level (upgradeTarget 'output'); 0 otherwise. Terrain base
 *  yields are added separately by the economy engine. */
export function buildingTickAmount(def, level = 1) {
  if (!def.output || def.output.when !== 'tick') return 0
  const mult = def.upgradeTarget === 'output' ? 1 + 0.25 * Math.max(0, level - 1) : 1
  return Math.round(def.output.amount * mult)
}

/** Current economic outputs [{ res, amount, per }] for a building's card display.
 *  Prefers a v1-style `outputs(level)` function; else derives from a v2 `output` whose
 *  timing is 'eraEnd' (per-tick outputs are shown live via occ.tickOutput instead). */
export function buildingOutputs(def, level = 1, eraIndex = 0) {
  if (typeof def.outputs === 'function') return def.outputs(level, eraIndex)
  if (def.output && def.output.when === 'eraEnd') {
    const mult = def.upgradeTarget === 'output' ? 1 + 0.25 * Math.max(0, level - 1) : 1
    return [{ res: def.output.res, amount: Math.round(def.output.amount * mult), per: 'era' }]
  }
  return []
}
