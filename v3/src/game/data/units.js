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
// Class modifiers are CIVILIZATION-WIDE and STACK: Obsidian (+3), Bronze (+5)
// and Iron (+7) leave every unit at +15 attack. There is deliberately no weapon
// or armour tier.

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
}]))

export const UNIT_LIST = Object.values(UNIT_DEFS)

/** The unit of a class. There is only ever one, so this is a lookup. */
export const unitOfClass = (cls) => UNIT_DEFS[cls] ?? null

/** Where a unit of this class may be created / may stand. */
export const canPlaceOn = (def, terrain) => !!def && def.placement.has(terrain)
export const canMoveOn = (def, terrain) => !!def && def.movement.has(terrain)

/**
 * A unit's kit, for the hover card: what your research has added on top of the
 * class's base line. This is where you watch a `unit_atk` tech land on a unit
 * that was placed twenty ticks ago. Rows worth nothing are omitted.
 */
export function equipmentOf(def, mods) {
  const rows = []
  const atk = mods?.unitAtk ?? 0
  const hp = mods?.unitDef ?? 0
  if (atk && def.atk > 0) rows.push({ slot: 'Research', name: 'Weaponry', bonus: `+${atk} :attack:` })
  if (hp) rows.push({ slot: 'Research', name: 'Armour', bonus: `+${hp} :defense:` })
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
 * A unit's live stats: the class base, scaled by the WAVE it is fighting in and
 * by its own gold upgrade LEVEL, plus the flat civilization-wide bonuses your
 * research has stacked up (`mods.unitAtk` / `mods.unitDef`).
 *
 * Stats are computed fresh every time, never stored on the tile — that is what
 * makes a +:attack: tech improve a unit placed long before it.
 *
 * A class with no attack (a wall, a command unit) stays at zero: a flat bonus
 * must never turn one into something that strikes back.
 */
export function unitStats(def, wave, mods, level = 1) {
  const s = Math.pow(1.18, wave) * (1 + 0.25 * (level - 1))
  const atkBonus = mods?.unitAtk ?? 0
  const defBonus = mods?.unitDef ?? 0
  return {
    ...def,
    level,
    def: Math.max(1, Math.round(def.def * s) + defBonus),
    atk: def.atk === 0 ? 0 : Math.max(1, Math.round(def.atk * s) + atkBonus),
    range: def.range,
    acts: def.acts,
  }
}
