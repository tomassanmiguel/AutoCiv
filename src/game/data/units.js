// Unit definitions. A unit occupies one (or more) UNIT_CATEGORIES slots in the
// roster once unlocked, and can be deployed onto tiles during production.
//
// Displayed stats (design naming): Speed = cooldown (seconds between attacks),
// Atk = damage, Def = health (HP). Atk/HP grow linearly with upgrade level;
// cooldown is fixed. `placement` restricts which tiles a unit may be built on.

export const UNIT_DEFS = {
  warrior: {
    key: 'warrior', name: 'Warrior', types: ['melee'], placement: 'land',
    cooldown: 3, atk: 5, hp: 11, upAtk: 1, upHp: 2,
    ability: '',
    description: 'A basic melee soldier — durable and dependable on the front line.',
  },
  wolf: {
    key: 'wolf', name: 'Wolf', types: ['cavalry'], placement: 'land',
    cooldown: 2, atk: 5, hp: 10, upAtk: 1, upHp: 2,
    ability: 'After attacking, moves to a random adjacent empty space.',
    description: 'A swift pack hunter that strikes and repositions.',
  },
  slinger: {
    key: 'slinger', name: 'Slinger', types: ['ranged'], placement: 'land',
    cooldown: 4, atk: 6, hp: 8, upAtk: 1, upHp: 1,
    ability: '',
    description: 'A ranged skirmisher that flings stones from behind cover.',
  },
}

/** Effective stats at a given upgrade level, with an optional flat HP bonus (e.g. Clothes). */
export function unitStats(def, level = 1, hpBonus = 0) {
  const steps = Math.max(0, level - 1)
  return {
    speed: def.cooldown,
    atk: def.atk + steps * def.upAtk,
    def: def.hp + steps * def.upHp + hpBonus,
  }
}

/** One-line stat summary, e.g. "Speed 3 · Atk 5 · Def 11". */
export function unitStatLine(def, level = 1, hpBonus = 0) {
  const s = unitStats(def, level, hpBonus)
  return `Speed ${s.speed} · Atk ${s.atk} · Def ${s.def}`
}
