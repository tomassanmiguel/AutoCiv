// Gold costs (v3) — every price in one place.
//
// Gold is the ONLY resource you spend by hand: food buys expansions on a
// threshold, production and progress arrive on their own. So gold is where the
// moment-to-moment decisions live, and it has four sinks:
//
//   REPAIR  — bring back a unit that fell, or ground that was razed
//   UPGRADE — raise a unit's or building's level, permanently
//   REROLL  — redraw the three advancements on offer
//
// Formulas are v2's, with the era term kept (E = 0-based era) since v3 has eras.
// Repair is cheap and flat-ish; upgrading is superlinear in level, so the third
// upgrade on one unit costs more than a first upgrade on three.

const pow = Math.pow

/** Restore a unit that was destroyed in combat. */
export const unitRepairCost = (era) => Math.round((25 + 15 * era) * pow(1.15, era))

/** Restore razed ground. A city is the expensive one — it was two expansions. */
export const RAZE_COST_MULT = { improvement: 1, building: 1.6, city: 3 }
export const tileRepairCost = (era, kind) =>
  Math.round((40 + 20 * era) * pow(1.15, era) * (RAZE_COST_MULT[kind] ?? 1))

/** Level L → L+1. */
export const unitUpgradeCost = (era, level) => Math.round(50 * pow(1.25, era) * pow(level, 1.5))
export const buildingUpgradeCost = (era, level) => Math.round(100 * pow(1.25, era) * pow(level, 1.5))

/**
 * Redraw the advancement offer. The price climbs WITHIN a selection so rerolling
 * is a real decision rather than a slot machine you pull until you like it; it
 * resets when the next threshold opens.
 */
export const rerollCost = (era, rerollsThisOffer) =>
  Math.round(30 * pow(1.25, era) * pow(2, rerollsThisOffer))

/** Level scaling shared by units and buildings: +25% of base per level above 1. */
export const levelMult = (level) => 1 + 0.25 * (level - 1)

/**
 * Repositioning a unit costs :gold: per tile of distance BEYOND your free range,
 * scaling with the wave like every other spend. Deliberately cheaper per tile
 * than a repair, so a short shuffle is affordable but hauling the whole army
 * across the map is a real bill.
 *
 * `tiles` is the paid distance (already net of free range); `mult` is the
 * reduction from Logistics-style techs (1 = full price, 0.5 = half).
 */
export const repositionPerTile = (wave) => Math.round((12 + 8 * wave) * pow(1.12, wave))
export const repositionCost = (wave, tiles, mult = 1) =>
  tiles <= 0 ? 0 : Math.max(1, Math.round(repositionPerTile(wave) * tiles * mult))
