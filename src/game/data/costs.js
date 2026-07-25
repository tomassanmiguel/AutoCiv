// Gold cost formulas for the economy (spending gold). E = era index (0-based),
// L = the occupant's current upgrade level. All costs are rounded to whole gold.
//
//  Unit upgrade:        50  × 1.25^E × L^1.5
//  Building upgrade:    100 × 1.25^E × L^1.5
//  Unit repair:         25 + 15E
//  Building repair:     40 + 20E
//  Specialist convert: (75 + 25E) × 1.25^E
//  Mercenary hire:     (50 + 25E) × 1.25^E   (NOT specified in the brief — chosen
//                       to sit between a repair and a specialist, since a mercenary
//                       is a one-battle disposable unit.)

const eraMul = (era) => Math.pow(1.25, era)

// A wonder is far costlier to repair than an ordinary building — a destroyed wonder keeps
// its build progress but repairing the massive structure costs 3× a normal building repair.
export const WONDER_REPAIR_MULT = 3

export function unitUpgradeCost(level, era) {
  return Math.round(50 * eraMul(era) * Math.pow(level, 1.5))
}
export function buildingUpgradeCost(level, era) {
  return Math.round(100 * eraMul(era) * Math.pow(level, 1.5))
}
export function unitRepairCost(era) {
  return Math.round(25 + 15 * era)
}
export function buildingRepairCost(era) {
  return Math.round(40 + 20 * era)
}
export function specialistCost(era) {
  return Math.round((75 + 25 * era) * eraMul(era))
}
export function mercenaryCost(era) {
  return Math.round((50 + 25 * era) * eraMul(era))
}
// Gold to reroll an advancement draw when no FREE reroll is available (era-scaled).
export function rerollCost(era) {
  return Math.round(40 * eraMul(era))
}

/** Upgrade cost for an occupant (unit or building) at its current level. */
export function upgradeCost(occ, era) {
  return occ.kind === 'unit' ? unitUpgradeCost(occ.level, era) : buildingUpgradeCost(occ.level, era)
}
/** Repair cost for a damaged occupant (unit or building). A wonder structure costs 3×. */
export function repairCost(occ, era) {
  if (occ.kind === 'unit') return unitRepairCost(era)
  return Math.round(buildingRepairCost(era) * (occ.wonder ? WONDER_REPAIR_MULT : 1))
}

/** How many citizens one gold-funded specialist conversion turns over: era+1
 *  (matches food-driven pop growth, which adds era+1 pops). */
export function specialistConvertCount(era) {
  return era + 1
}
