// Unit definitions. A unit occupies one (or more) UNIT_CATEGORIES slots in the
// roster once unlocked, and can be deployed onto tiles during production.
//
// Displayed stats (design naming): Speed = cooldown (seconds between attacks),
// Atk = damage, Def = health (HP). Atk/HP grow linearly with upgrade level;
// cooldown is fixed. `placement` restricts which tiles a unit may be built on.
// `era` = the era the unit belongs to (era -1 = pre-Stone wildlife, enemy-only).
// `shift: true` = after attacking, the unit shifts to an adjacent empty space.

export const UNIT_DEFS = {
  warrior: {
    key: 'warrior', name: 'Warrior', era: 0, types: ['melee'], placement: 'land',
    cooldown: 3, atk: 5, hp: 11, upAtk: 1, upHp: 2,
    ability: '',
    description: 'A basic :melee: soldier — durable and dependable on the front line.',
  },
  wolf: {
    key: 'wolf', name: 'Wolf', era: 0, types: ['cavalry'], placement: 'land',
    cooldown: 2, atk: 5, hp: 10, upAtk: 1, upHp: 2,
    shift: true,
    ability: 'After attacking, shifts to an adjacent empty space if able.',
    description: 'A swift :cavalry: pack hunter that strikes and repositions.',
  },
  slinger: {
    key: 'slinger', name: 'Slinger', era: 0, types: ['ranged'], placement: 'land',
    cooldown: 4, atk: 6, hp: 8, upAtk: 1, upHp: 1,
    ability: '',
    description: 'A :ranged: skirmisher that flings stones from behind cover.',
  },

  // --- Bronze era ---
  archer: {
    key: 'archer', name: 'Archer', era: 1, types: ['ranged'], placement: 'land',
    cooldown: 4, atk: 8, hp: 9, upAtk: 1, upHp: 2,
    ability: '',
    description: 'A :ranged: bowman with more reach and punch than the Slinger.',
  },
  galley: {
    key: 'galley', name: 'Galley', era: 1, types: ['naval'], placement: 'coast', combatRole: 'melee',
    cooldown: 3, atk: 6, hp: 13, upAtk: 1, upHp: 2,
    ability: '',
    description: 'A :naval: warship deployed on the coast that rams enemies as :melee:.',
  },
  spearman: {
    key: 'spearman', name: 'Spearman', era: 1, types: ['melee'], placement: 'land',
    cooldown: 3, atk: 6, hp: 19, upAtk: 1, upHp: 3,
    ability: '',
    description: 'A bronze :melee: front-liner — far tougher than the Warrior.',
  },
  baker: {
    key: 'baker', name: 'Baker', era: 1, types: ['utility'], placement: 'land',
    cooldown: 6, atk: 0, hp: 10, upAtk: 0, upHp: 2,
    // On each "act" (its cooldown), permanently toughens adjacent units.
    bakerDef: (level = 1) => level + 1, // +2 / +3 / +4 …
    ability: 'When it acts, all adjacent units permanently gain +2/3/4/… :defense:.',
    description: 'A :utility: support that never attacks — it hands out rations, permanently toughening the units around it.',
  },

  // --- Iron era ---
  legionnaire: {
    key: 'legionnaire', name: 'Legionnaire', era: 2, types: ['melee'], placement: 'land',
    cooldown: 4, atk: 7, hp: 22, upAtk: 1, upHp: 3,
    packAtk: 3, // intrinsic +3 :attack: per OTHER Legionnaire on the tableau (see _syncUnitStats)
    ability: 'Gains +3 :attack: for every other Legionnaire on your tableau.',
    description: 'A disciplined :melee: soldier — the more Legionnaires you field, the harder each one hits.',
  },
  horseman: {
    key: 'horseman', name: 'Horseman', era: 2, types: ['cavalry'], placement: 'land',
    cooldown: 2, atk: 7, hp: 14, upAtk: 1, upHp: 2,
    // In combat, an idle Horseman can "support" (reposition to) any column on its
    // landmass that lacks a melee/cavalry front — not just an adjacent one.
    longSupport: true,
    ability: 'Supports any column on its landmass that lacks a :melee:/:cavalry: front — galloping clear across the land to plug the gap.',
    description: 'A swift :cavalry: rider with the range to reinforce your whole line.',
  },
  catapult: {
    key: 'catapult', name: 'Catapult', era: 2, types: ['siege'], placement: 'land', combatRole: 'ranged',
    cooldown: 6, atk: 10, hp: 8, upAtk: 1, upHp: 2,
    splash: 0.5, // hits the BACK enemy in the column + 50% splash to its neighbours
    ability: 'Strikes the rear-most enemy in the column and deals 50% splash to adjacent enemies.',
    description: 'A :siege: engine that lobs over the front line to shatter the enemy backfield.',
  },
  trireme: {
    key: 'trireme', name: 'Trireme', era: 2, types: ['ranged', 'naval'], placement: 'coast', combatRole: 'ranged',
    cooldown: 5, atk: 10, hp: 13, upAtk: 1, upHp: 2,
    unblockedGoldMult: 3, // triple the empty-column ("unblocked") gold
    ability: 'Earns TRIPLE :gold: when it deals unblocked damage (an empty column).',
    description: 'A :naval: warship with a :ranged: bite — plunders undefended columns for heavy :gold:.',
  },

  // Era -1 wildlife — enemy-only (no advancement unlocks them for the player).
  bear: {
    key: 'bear', name: 'Bear', era: -1, types: ['melee'], placement: 'land',
    cooldown: 6, atk: 8, hp: 16, upAtk: 1, upHp: 2,
    ability: '',
    description: 'A hulking :melee: beast.',
  },
  lion: {
    key: 'lion', name: 'Lion', era: -1, types: ['cavalry'], placement: 'land',
    cooldown: 5, atk: 6, hp: 9, upAtk: 1, upHp: 2,
    ability: '',
    description: 'A swift :cavalry: predator.',
  },
}

/** Combat behaviour of a unit — its role in battle. Defaults to the first slot
 *  category, but a unit may override via `combatRole` (e.g. a :naval: unit that
 *  fights as :melee:), so its slot and its battlefield behaviour can differ. */
export function unitRole(def) {
  return def?.combatRole ?? def?.types?.[0]
}

/** Effective stats at a given upgrade level, with optional flat HP/Atk bonuses
 *  (e.g. Clothes → hpBonus; Warband → both). */
export function unitStats(def, level = 1, hpBonus = 0, atkBonus = 0) {
  const steps = Math.max(0, level - 1)
  return {
    speed: def.cooldown,
    atk: def.atk + steps * def.upAtk + atkBonus,
    def: def.hp + steps * def.upHp + hpBonus,
  }
}

/** One-line stat summary, e.g. "Speed 3 · Atk 5 · Def 11". */
export function unitStatLine(def, level = 1, hpBonus = 0) {
  const s = unitStats(def, level, hpBonus)
  return `Speed ${s.speed} · Atk ${s.atk} · Def ${s.def}`
}
