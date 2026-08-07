// Player units (v3).
//
// ONE UNIT PER CLASS, and the class list is CONTENT — `content.unitClasses`,
// authored at /editor.html. There is no ladder of named units: a class has a
// single stat line, the techs you take raise it, and every unit of that class
// already on the board improves with it. "Create a melee unit" means place one
// more, at whatever the class currently is.
//
// (An earlier version had thirteen named units — Warrior, Spearman, Legion… —
// with `bestOfType` picking the strongest unlocked one. That contradicted the
// design's one-unit-per-class rule and meant two datasets describing the same
// thing, so it was deleted. The stats now come from exactly one place.)
//
// Class modifiers are CIVILIZATION-WIDE and STACK: Obsidian (+25%), Bronze
// (+40%) and Iron (+60%) leave every unit at +125% BASE attack. There is
// deliberately no weapon or armour tier.

import { UNIT_CLASS_DEFS } from './content.js'

export const UNIT_TYPES = UNIT_CLASS_DEFS.map((c) => c.id)

/**
 * One def per class, keyed by class. `acts` is the engine's name for speed and
 * `def` is hit points — both kept so the combat code reads unchanged.
 *
 * `placement` and `movement` are TERRAIN KEY SETS: where the unit may be
 * created, and where it may stand or walk. A class with an empty movement set
 * never moves, which is how "fortifications never move" is expressed as data
 * rather than as a special case in the engine.
 */
export const UNIT_DEFS = Object.fromEntries(UNIT_CLASS_DEFS.map((c) => [c.id, {
  key: c.id,
  name: c.name,
  type: c.id,
  def: c.def,
  atk: c.atk,
  range: c.range,
  acts: c.speed,
  icon: c.icon,
  blurb: c.description,
  placement: new Set(c.placement),
  movement: new Set(c.movement),
  // Intrinsic taunt range: how far the class pulls enemies onto itself. Only
  // fortifications taunt today (base 2); techs widen it. 0 = does not taunt.
  taunt: c.taunt ?? 0,
  // ZONE OF CONTROL: the radius a commander projects, and the base upgrade-level
  // bonus it grants units inside it (granted with zero techs). 0 = no ZOC.
  zoc: c.zoc ?? 0,
  zocBonus: c.zocBonus ?? 0,
  // A fortification is a structure and cannot be placed on a building tile
  // (other classes share a tile with a building freely).
  blockedByBuilding: c.id === 'fortification',
}]))

export const UNIT_LIST = Object.values(UNIT_DEFS)

/** The unit of a class. There is only ever one, so this is a lookup. */
export const unitOfClass = (cls) => UNIT_DEFS[cls] ?? null

/** Where a unit of this class may be created / may stand. */
export const canPlaceOn = (def, terrain) => !!def && def.placement.has(terrain)
export const canMoveOn = (def, terrain) => !!def && def.movement.has(terrain)

/**
 * A unit's kit, for the hover card: what your research has added on top of the
 * class's base line. This is where you watch a research tech land on a unit
 * that was placed twenty ticks ago. Rows worth nothing are omitted.
 */
export function equipmentOf(def, mods) {
  const rows = []
  const atkBase = mods?.unitAtkBasePct ?? 0
  const defBase = mods?.unitDefBasePct ?? 0
  // Shown as a percentage AND as what it is worth on THIS class, because the
  // whole point of a base modifier is that the same +% is worth more here than
  // it is on a weaker class.
  if (atkBase && def.atk > 0) {
    rows.push({
      slot: 'Research',
      name: `Weaponry +${Math.round(atkBase * 100)}% base`,
      bonus: `+${Math.round(def.atk * atkBase)} :attack:`,
    })
  }
  if (defBase) {
    rows.push({
      slot: 'Research',
      name: `Armour +${Math.round(defBase * 100)}% base`,
      bonus: `+${Math.round(def.def * defBase)} :defense:`,
    })
  }
  if (!def.movement.size) rows.push({ slot: 'Movement', name: 'Never moves', bonus: null })
  return rows
}

// The palace is the fail state. It fights, and its HP persists between waves.
export const PALACE = {
  key: 'palace', name: 'Palace', type: 'palace',
  def: 240, atk: 10, range: 2, acts: 0,
  icon: '/sprites/ui/wonder.png',
}

/**
 * A unit's live stats: the class base, raised by your research, then scaled by
 * the WAVE it is fighting in and by its own gold upgrade LEVEL.
 *
 * ATTACK IS TWO LAYERS (`YIELD_MODEL` in schema.js):
 *
 *     atk = (base + flat) × (1 + Σ base modifiers) × (1 + Σ modifiers)
 *
 * A BASE MODIFIER raises the base itself, so a Siege unit (base 20) gains four
 * times what a Ranged unit (base 5) does from the same tech — that is what stops
 * the classes collapsing into each other by the late game. The flat term is
 * folded in FIRST, so a "+2 :attack: on a kill" is multiplied by everything you
 * have researched rather than being washed out by it.
 *
 * Stats are computed fresh every time, never stored on the tile — that is what
 * makes a research tech improve a unit placed long before it.
 *
 * A class with no attack (a wall, a command unit) stays at zero: no bonus of any
 * kind may turn one into something that strikes back.
 */
export function unitStats(def, wave, mods, level = 1, extra = null) {
  // The per-LEVEL value is a shared, tunable constant (Schematics / Radical
  // Perfection raise it) — the SAME one buildings use for their effect level.
  const perLevel = mods?.upgradeLevelValue ?? 0.25
  const s = Math.pow(1.18, wave) * (1 + perLevel * (level - 1))

  // `extra` carries PER-UNIT modifiers — Formations (`atkFlat`/`defFlat`) and the
  // EARNED-FLAT slot (`earnedAtk`, e.g. Marksmanship, permanent across combats).
  //
  // Attack has THREE tiers now:
  //   atk = ((base + flat) × (1 + basePct) + EARNED) × (1 + ordinaryPct)
  // The flat (tech-wide + formation) folds into the base before the base-%; the
  // earned flat sits AFTER it, before the ordinary-%. See docs/design.md.
  // `classAtkFlat` is the attack twin of `classDefFlat` — a per-class raw addition
  // to the flat slot (Ascendancy), folded in before the base-% so it stacks.
  const atkFlat = (mods?.unitAtkFlat ?? 0) + (mods?.classAtkFlat?.[def.type] ?? 0) + (extra?.atkFlat ?? 0)
  // `classDefFlat` is a per-class raw addition to the same flat slot (Masonry
  // etc.): folded into the base before the base-%, so it stacks with %-based def
  // rather than being swallowed by it.
  const defFlat = (mods?.unitDefFlat ?? 0) + (mods?.classDefFlat?.[def.type] ?? 0) + (extra?.defFlat ?? 0)

  const baseAtk = ((def.atk + atkFlat) * (1 + (mods?.unitAtkBasePct ?? 0)) + (extra?.earnedAtk ?? 0)) *
    (1 + (mods?.unitAtkPct ?? 0))

  // Defence IS hit points, and runs the identical formula. Unlike attack there
  // is no zero case: every unit has hit points, including the ones that never
  // strike — a wall is nothing BUT hit points. The EARNED-DEF slot (Defensive
  // Tactics) mirrors earned-atk: after the base-%, before the ordinary-%.
  const baseDef = ((def.def + defFlat) * (1 + (mods?.unitDefBasePct ?? 0)) + (extra?.earnedDef ?? 0)) *
    (1 + (mods?.unitDefPct ?? 0))

  return {
    ...def,
    level,
    def: Math.max(1, Math.round(baseDef * s)),
    atk: def.atk === 0 ? 0 : Math.max(1, Math.round(baseAtk * s)),
    range: def.range,
    // +speed from research, but a class with no movement terrain still can't
    // move — the extra step has nowhere to go. `classSpeedFlat` (Ascendancy) is
    // class-scoped and applies on top (a class made mobile also gains its speed).
    acts: def.acts + (def.movement.size ? (mods?.unitSpeed ?? 0) : 0) + (mods?.classSpeedFlat?.[def.type] ?? 0),
  }
}
