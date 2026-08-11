// Enemy roster (v4). SIX classes, each meant to punish one player strategy so
// waves force adaptation (docs/design.md §14). Bought against a per-wave HP
// budget that scales without bound. Enemies muster on the derived battlefield
// ring and march INWARD toward the palace.
//
// v4 simplification: there are NO domain variants (the old Amphibious/Astral
// riders are gone). Every enemy can cross land, water and open space — it just
// EMBARKS while on water or in space (can't attack, exposed) and makes landfall
// on the first land tile. Mountains and singularities are hard walls for all.
// The Specialist is the exception that can attack while embarked.
//
// Combat fields read by manager/combat.js:
//   hp/maxHp — base def × 1.25^wave ; atk — base + 2·wave
//   cd       — cooldown in ticks between acts (lower = faster)
//   range    — attack radius in hex distance
//   prefersCity  — veers toward the nearest city (Raider)
//   embarkAttack — may attack while embarked (Specialist)
//   marches      — advances every act while it shoots (Ranger)

import { travelClass } from '../world/terrain.js'

// Base profiles (placeholders). `def` is base HP before wave scaling.
export const ENEMY_CLASSES = {
  grunt:      { key: 'grunt',      name: 'Grunt',      def: 20,  atk: 6,  cd: 8,  range: 1, weight: () => 6 },
  scout:      { key: 'scout',      name: 'Scout',      def: 10,  atk: 4,  cd: 4,  range: 1, weight: (w) => Math.max(2, 6 - 0.3 * w) },
  raider:     { key: 'raider',     name: 'Raider',     def: 40,  atk: 8,  cd: 10, range: 1, prefersCity: true, weight: (w) => 2 + 0.3 * w },
  ranger:     { key: 'ranger',     name: 'Ranger',     def: 14,  atk: 6,  cd: 8,  range: 3, marches: true, weight: (w) => 2 + 0.2 * w },
  juggernaut: { key: 'juggernaut', name: 'Juggernaut', def: 120, atk: 16, cd: 18, range: 1, weight: (w) => Math.max(0, (w - 2) * 0.5) },
  specialist: { key: 'specialist', name: 'Specialist', def: 24,  atk: 8,  cd: 10, range: 2, embarkAttack: true, weight: (w) => 1 + 0.2 * w },
}

// What an enemy may path through: land, water (embarking) and the void. Blocked
// terrain (mountains, singularities) and celestial bodies are walls in v1.
export function enemyTraversable(terrainKey) {
  const c = travelClass(terrainKey)
  return c === 'land' || c === 'water' || c === 'void'
}

/** Build one enemy piece. */
export function makeEnemy(id, cls, wave, cell) {
  const scale = Math.pow(1.25, wave)
  const hp = Math.max(1, Math.round(cls.def * scale))
  const atk = Math.max(1, Math.round(cls.atk + 2 * wave))
  return {
    id,
    side: 'enemy',
    cls: cls.key,
    key: cls.key,
    name: cls.name,
    q: cell.q, r: cell.r,
    hp, maxHp: hp, atk,
    range: cls.range, cd: cls.cd, cdTimer: cls.cd,
    prefersCity: !!cls.prefersCity,
    embarkAttack: !!cls.embarkAttack,
    marches: !!cls.marches,
    embarked: false,
    dead: false, lastAttackSeq: null, lastAttackDir: null,
  }
}

// Budget growth OUTPACES per-enemy HP growth, so a host grows in BODIES as waves
// rise rather than staying a handful of ever-fatter units.
const BUDGET_BASE = 25
const BUDGET_GROWTH = 1.28

/** HP budget a wave may spend. `strength` is a UI/debug multiplier. */
export function waveBudget(wave, strength = 1) {
  return BUDGET_BASE * Math.pow(BUDGET_GROWTH, wave) * strength
}

/**
 * Compose a host for a wave. `spawns` is [{q,r,terrain}] (the battlefield ring);
 * `reachable(q,r)` reports whether an enemy can path from the cell to the palace.
 */
export function generateHost(wave, spawns, reachable, rng = Math.random, strength = 1) {
  if (!spawns.length) return []
  const budget = waveBudget(wave, strength)

  const viable = spawns.filter((c) => enemyTraversable(c.terrain) && reachable(c.q, c.r))
  if (!viable.length) return []

  const classes = Object.values(ENEMY_CLASSES)
  const weights = classes.map((c) => Math.max(0, c.weight(wave)))
  const totalW = weights.reduce((a, b) => a + b, 0)
  const pick = () => {
    let r = rng() * totalW
    for (let i = 0; i < classes.length; i++) { r -= weights[i]; if (r <= 0) return classes[i] }
    return classes[0]
  }

  const free = viable.slice()
  const units = []
  let spent = 0, id = 0, guard = 0
  while (spent < budget && free.length && guard++ < 6000) {
    const cls = pick()
    const idx = Math.floor(rng() * free.length)
    const cell = free.splice(idx, 1)[0]
    const e = makeEnemy(id++, cls, wave, cell)
    units.push(e)
    spent += e.hp
  }
  return units
}

export const ENEMY_DEFS = {}
for (const cls of Object.values(ENEMY_CLASSES)) {
  ENEMY_DEFS[cls.key] = { key: cls.key, name: cls.name, cls: cls.key }
}
