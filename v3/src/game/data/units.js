// Player units (v3).
//
// Four flavours. The first three fight and move; a DEFENSIVE CONSTRUCTION is a
// unit that never moves and never attacks — it is a wall with hit points, meant
// to soak a lane while your ranged units work.
//
// Units are granted by progress nodes, which also apply global modifiers:
// WEAPONS raise every unit's attack, ARMOR raises every unit's HP, and per-type
// mods (Horseback Riding) touch one flavour.

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
 * A unit's kit, for the hover card: what it fights with, what it wears, and
 * what it rides. Weapon and armour tiers are civilization-wide (the progress
 * web re-arms everyone at once); the rest is the unit's own.
 */
export function equipmentOf(def, mods) {
  const own = OWN_GEAR[def.key] ?? {}
  const rows = []

  if (WEAPON_TYPES.has(def.type)) {
    const w = weaponTier(mods?.weapon)
    rows.push({ slot: 'Weapon', name: w.name, bonus: w.atk ? `+${w.atk} :attack:` : null })
  } else if (own.weapon !== undefined && own.weapon !== null) {
    rows.push({ slot: 'Weapon', name: own.weapon, bonus: null })
  } else if (own.weapon === null) {
    rows.push({ slot: 'Weapon', name: 'None — it does not strike', bonus: null })
  }

  const a = armorTier(mods?.armor)
  rows.push({ slot: 'Armour', name: a.name, bonus: a.hp ? `+${a.hp} :defense:` : null })

  if (def.type === 'cavalry' && own.steed) {
    const extra = mods?.unitMod?.cavalry?.acts ?? 0
    rows.push({ slot: 'Steed', name: own.steed, bonus: extra ? `+${extra} :speed:` : null })
  }

  // Anything the web trained into this class specifically.
  const m = mods?.unitMod?.[def.type] ?? {}
  const drills = Object.entries(m)
    .filter(([k, v]) => v && !(def.type === 'cavalry' && k === 'acts'))
    .map(([k, v]) => `+${v} ${DRILL_LABEL[k] ?? k}`)
  if (drills.length) rows.push({ slot: 'Training', name: drills.join(', '), bonus: null })

  return rows
}

const DRILL_LABEL = { atk: ':attack:', hp: ':defense:', range: 'range', acts: ':speed:' }

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

// ---------------------------------------------------------------------------
// WEAPONS and ARMOR — tiers, not stacks
// ---------------------------------------------------------------------------
// You start with Clubs and a progress node UPGRADES you to Bronze, then Iron,
// then Steel. Taking a higher tier REPLACES the lower one rather than adding to
// it, so "Bronze Weapons" reads as re-arming the whole civilization — which is
// the story — instead of as a stacking trinket.
//
// Weapons arm the units that swing them: MELEE and CAVALRY. Ranged units get
// their own line through per-type mods (Archery, Ballistics), so bows and blades
// improve separately.

export const WEAPON_TIERS = [
  { key: 'clubs', name: 'Clubs', atk: 0 },
  { key: 'bronze', name: 'Bronze Weapons', atk: 6 },
  { key: 'iron', name: 'Iron Weapons', atk: 14 },
  { key: 'steel', name: 'Steel Weapons', atk: 26 },
]
export const ARMOR_TIERS = [
  { key: 'hides', name: 'Hides', hp: 0 },
  { key: 'leather', name: 'Leatherwork', hp: 10 },
  { key: 'bronzemail', name: 'Bronze Mail', hp: 24 },
  { key: 'ironmail', name: 'Iron Mail', hp: 44 },
]

const tierIndex = (tiers, key) => Math.max(0, tiers.findIndex((t) => t.key === key))
export const weaponTier = (key) => WEAPON_TIERS[tierIndex(WEAPON_TIERS, key)]
export const armorTier = (key) => ARMOR_TIERS[tierIndex(ARMOR_TIERS, key)]
/** Only ever move FORWARD along a tier chain. */
export const bestTier = (tiers, a, b) =>
  tiers[Math.max(tierIndex(tiers, a), tierIndex(tiers, b))].key

/** Which unit types a weapon upgrade actually arms. */
export const WEAPON_TYPES = new Set(['melee', 'cavalry'])

/**
 * A unit's live stats: its base, scaled by era and by its own upgrade LEVEL,
 * plus the civilization-wide weapon/armour tiers and per-type mods.
 */
export function unitStats(def, era, mods, level = 1) {
  const s = Math.pow(1.18, era) * (1 + 0.25 * (level - 1))
  const typeMod = mods?.unitMod?.[def.type] ?? {}
  const weap = WEAPON_TYPES.has(def.type) ? weaponTier(mods?.weapon).atk : 0
  const arm = armorTier(mods?.armor).hp
  return {
    ...def,
    level,
    def: Math.max(1, Math.round(def.def * s) + arm + (typeMod.hp ?? 0)),
    atk: def.atk === 0 ? 0 : Math.max(1, Math.round(def.atk * s) + weap + (typeMod.atk ?? 0)),
    range: def.range + (typeMod.range ?? 0),
    acts: def.acts === 0 ? 0 : def.acts + (typeMod.acts ?? 0),
  }
}
