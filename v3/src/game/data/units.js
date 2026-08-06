// Player units (v3).
//
// Four flavours. The first three fight and move; a DEFENSIVE CONSTRUCTION is a
// unit that never moves and never attacks — it is a wall with hit points, meant
// to soak a lane while your ranged units work.
//
// Units are granted by advancements, which also apply CIVILIZATION-WIDE
// modifiers. Those modifiers STACK and never replace: Obsidian (+3), Bronze
// (+5) and Iron (+7) leave every unit at +15 attack. There is deliberately no
// weapon or armour tier — an earlier version had one, and it contradicted the
// design's central rule that everything stacks.

export const UNIT_TYPES = ['melee', 'ranged', 'cavalry', 'defense']

export const UNIT_DEFS = {
  // --- melee ---
  warrior: { key: 'warrior', name: 'Warrior', type: 'melee', def: 22, atk: 7, range: 1, acts: 1,
    icon: '/sprites/ui/melee.png', blurb: 'Closes with the nearest enemy and holds the line.' },
  spearman: { key: 'spearman', name: 'Spearman', type: 'melee', def: 30, atk: 9, range: 1, acts: 1,
    icon: '/sprites/ui/melee.png', blurb: 'A braced line that punishes chargers.' },
  legion: { key: 'legion', name: 'Legion', type: 'melee', def: 42, atk: 14, range: 1, acts: 1,
    icon: '/sprites/ui/melee.png', blurb: 'Disciplined heavy infantry.' },

  // --- ranged ---
  slinger: { key: 'slinger', name: 'Slinger', type: 'ranged', def: 12, atk: 6, range: 2, acts: 0,
    icon: '/sprites/ui/ranged.png', blurb: 'Strikes from behind the line; never advances.' },
  archer: { key: 'archer', name: 'Archer', type: 'ranged', def: 15, atk: 9, range: 3, acts: 0,
    icon: '/sprites/ui/ranged.png', blurb: 'Longer reach, still glass.' },
  crossbowman: { key: 'crossbowman', name: 'Crossbowman', type: 'ranged', def: 20, atk: 14, range: 3, acts: 0,
    icon: '/sprites/ui/ranged.png', blurb: 'Punches through armour at range.' },

  // --- cavalry ---
  rider: { key: 'rider', name: 'Rider', type: 'cavalry', def: 16, atk: 8, range: 1, acts: 2,
    icon: '/sprites/ui/cavalry.png', blurb: 'Fast melee — reaches a breach in a turn.' },
  chariot: { key: 'chariot', name: 'Chariot', type: 'cavalry', def: 24, atk: 12, range: 1, acts: 2,
    icon: '/sprites/ui/cavalry.png', blurb: 'A bronze war chariot.' },
  horseman: { key: 'horseman', name: 'Horseman', type: 'cavalry', def: 30, atk: 15, range: 1, acts: 3,
    icon: '/sprites/ui/cavalry.png', blurb: 'Rides down stragglers across the map.' },

  // --- defensive constructions: never move, never attack ---
  mudbrick: { key: 'mudbrick', name: 'Mud Brick Wall', type: 'defense', def: 60, atk: 0, range: 0, acts: 0,
    icon: '/sprites/ui/defense.png', blurb: 'Does not move or strike. Soaks a lane while your line works.' },
  palisade: { key: 'palisade', name: 'Palisade', type: 'defense', def: 95, atk: 0, range: 0, acts: 0,
    icon: '/sprites/ui/defense.png', blurb: 'A timber wall. Cheap bulk in a chokepoint.' },
  watchtower: { key: 'watchtower', name: 'Watchtower', type: 'defense', def: 70, atk: 6, range: 3, acts: 0,
    icon: '/sprites/ui/defense.png', blurb: 'The one construction that shoots back.' },
  stonewall: { key: 'stonewall', name: 'Stone Wall', type: 'defense', def: 160, atk: 0, range: 0, acts: 0,
    icon: '/sprites/ui/defense.png', blurb: 'Masonry. Very little gets through it quickly.' },
}

// What each unit carries of its own, on top of the civilization-wide tiers.
// Named rather than derived: a Slinger's weapon IS a sling, and inventing a
// "bow tier" out of the ranged attack modifier would be fiction.
const OWN_GEAR = {
  slinger: { weapon: 'Sling' },
  archer: { weapon: 'Bow' },
  crossbowman: { weapon: 'Crossbow' },
  rider: { steed: 'Pony' },
  chariot: { steed: 'Chariot Team' },
  horseman: { steed: 'Warhorse' },
  mudbrick: { weapon: null },
  palisade: { weapon: null },
  stonewall: { weapon: null },
  watchtower: { weapon: 'Mounted Bow' },
}

/**
 * A unit's kit, for the hover card: what it carries of its own, then what your
 * research has added on top.
 *
 * The research rows are the STACKED civilization-wide bonuses, so this is where
 * you watch a `unit_atk` tech land on a unit that was placed twenty ticks ago.
 * Rows worth nothing are omitted rather than shown as zero.
 */
export function equipmentOf(def, mods) {
  const own = OWN_GEAR[def.key] ?? {}
  const rows = []

  if (own.weapon) rows.push({ slot: 'Weapon', name: own.weapon, bonus: null })
  else if (own.weapon === null) rows.push({ slot: 'Weapon', name: 'None — it does not strike', bonus: null })
  if (def.type === 'cavalry' && own.steed) rows.push({ slot: 'Steed', name: own.steed, bonus: null })

  const atk = mods?.unitAtk ?? 0
  if (atk && def.atk > 0) rows.push({ slot: 'Research', name: 'Weaponry', bonus: `+${atk} :attack:` })
  const hp = mods?.unitDef ?? 0
  if (hp) rows.push({ slot: 'Research', name: 'Armour', bonus: `+${hp} :defense:` })

  return rows
}

export const UNIT_LIST = Object.values(UNIT_DEFS)

/** The unit a class opens with, when a bare troop grant finds it empty. */
export const BASE_OF_TYPE = {
  melee: 'warrior', ranged: 'slinger', cavalry: 'rider', defense: 'mudbrick',
}

/** Rough worth, used to pick the best unlocked unit of a class. */
const worth = (d) => d.def + d.atk * 3

/** The strongest unlocked unit of a class, or its base if none is unlocked. */
export function bestOfType(type, unlocked) {
  const owned = UNIT_LIST.filter((d) => d.type === type && unlocked?.has(d.key))
  if (!owned.length) return UNIT_DEFS[BASE_OF_TYPE[type]]
  return owned.sort((a, b) => worth(b) - worth(a))[0]
}

// The palace is the fail state. It fights, and its HP persists between eras.
export const PALACE = {
  key: 'palace', name: 'Palace', type: 'palace',
  def: 240, atk: 10, range: 2, acts: 0,
  icon: '/sprites/ui/wonder.png',
}

/**
 * A unit's live stats: its base, scaled by the WAVE it is fighting in and by its
 * own gold upgrade LEVEL, plus the flat civilization-wide bonuses your research
 * has stacked up (`mods.unitAtk` / `mods.unitDef`).
 *
 * Stats are computed fresh every time, never stored on the tile — that is what
 * makes a +:attack: tech improve a unit placed long before it.
 *
 * A unit with no attack (a wall) stays at zero: a flat bonus must never turn a
 * construction into something that strikes back.
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
