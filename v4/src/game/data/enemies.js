// Enemy roster (v4 turn-based). Enemies muster on the frontier (the battlefield
// ring just past the known world) and march INWARD toward the palace, one round
// per End Turn. Each acts once per turn: attack a target in range, else advance
// up to `moves` steps along a flow field routed AROUND player pieces.
//
// The host escalates with the TURN NUMBER (not with the player's tech), so the
// pressure rises with time no matter which flavor you rush. A per-turn HP budget
// buys bodies; per-enemy stats also creep so late bodies are tanky.
//
// Combat fields read by manager/combat.js:
//   hp/maxHp — base def * ENEMY_HP_GROWTH^turn ; atk — base + ENEMY_ATK_PER_TURN*turn
//   range    — attack radius in hexes ; moves — steps advanced per turn
//   prefersCity — veers toward cities (Raider) ; marches — advances while shooting (Ranger)

import { travelClass } from '../world/terrain.js'
import { SPAWN_BASE, SPAWN_GROWTH, ENEMY_HP_GROWTH, ENEMY_ATK_PER_TURN } from './config.js'

// Base profiles. `def` is base HP before turn scaling. `weight(turn)` shapes the
// mix over a run — scouts harass early, brutes pile in late.
export const ENEMY_CLASSES = {
  scout: { key: 'scout', name: 'Scout', icon: '/sprites/ui/cavalry.png', def: 10, atk: 3, range: 1, moves: 2, weight: (t) => Math.max(2, 8 - 0.25 * t) },
  grunt: { key: 'grunt', name: 'Grunt', icon: '/sprites/ui/melee.png', def: 18, atk: 5, range: 1, moves: 1, weight: () => 6 },
  raider: { key: 'raider', name: 'Raider', icon: '/sprites/ui/melee.png', def: 30, atk: 7, range: 1, moves: 1, prefersCity: true, weight: (t) => 2 + 0.2 * t },
  ranger: { key: 'ranger', name: 'Ranger', icon: '/sprites/ui/ranged.png', def: 12, atk: 5, range: 2, moves: 1, marches: true, weight: (t) => 2 + 0.15 * t },
  brute: { key: 'brute', name: 'Brute', icon: '/sprites/ui/utility.png', def: 90, atk: 13, range: 1, moves: 1, weight: (t) => Math.max(0, (t - 4) * 0.35) },
}

// What an enemy may path through: land, water (embarking) and the void. Blocked
// terrain (mountains, singularities) and celestial bodies are walls here.
export function enemyTraversable(terrainKey) {
  const c = travelClass(terrainKey)
  return c === 'land' || c === 'water' || c === 'void'
}

/** Build one enemy piece for a given turn on a given cell. */
export function makeEnemy(id, cls, turn, cell) {
  const hp = Math.max(1, Math.round(cls.def * Math.pow(ENEMY_HP_GROWTH, turn)))
  const atk = Math.max(1, Math.round(cls.atk + ENEMY_ATK_PER_TURN * turn))
  return {
    id, side: 'enemy', cls: cls.key, key: cls.key, name: cls.name, icon: cls.icon, color: '#d85a5a',
    q: cell.q, r: cell.r,
    hp, maxHp: hp, atk, range: cls.range, moves: cls.moves,
    prefersCity: !!cls.prefersCity, marches: !!cls.marches,
    dead: false, lastAttackSeq: null, lastAttackDir: null,
  }
}

/** HP budget a turn's host may spend. */
export function spawnBudget(turn, strength = 1) {
  return SPAWN_BASE * Math.pow(SPAWN_GROWTH, Math.max(0, turn - 1)) * strength
}

/**
 * Compose the host that forecasts for `turn`. `spawns` is [{q,r,terrain}] (the
 * frontier ring); `reachable(q,r)` reports whether an enemy could path from a
 * cell to the palace. `nextId()` yields unique ids. Returns [] when nothing is
 * affordable yet (the early-game grace period).
 */
export function generateHost(turn, spawns, reachable, rng, nextId, strength = 1) {
  if (!spawns.length) return []
  const budget = spawnBudget(turn, strength)

  const viable = spawns.filter((c) => enemyTraversable(c.terrain) && reachable(c.q, c.r))
  if (!viable.length) return []

  const classes = Object.values(ENEMY_CLASSES)
  const weights = classes.map((c) => Math.max(0, c.weight(turn)))
  const totalW = weights.reduce((a, b) => a + b, 0) || 1
  const pick = () => {
    let r = rng() * totalW
    for (let i = 0; i < classes.length; i++) { r -= weights[i]; if (r <= 0) return classes[i] }
    return classes[0]
  }

  const free = viable.slice()
  const units = []
  let spent = 0, guard = 0
  while (spent < budget && free.length && guard++ < 4000) {
    const cls = pick()
    const idx = Math.floor(rng() * free.length)
    const cell = free.splice(idx, 1)[0]
    const e = makeEnemy(nextId(), cls, turn, cell)
    // Only commit a body we can afford; otherwise skip this roll and keep the cell.
    if (spent + e.hp > budget && units.length) { free.push(cell); if (guard > 200) break; continue }
    units.push(e)
    spent += e.hp
  }
  return units
}
