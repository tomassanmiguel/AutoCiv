// Enemy roster (v4). SIX classes, each meant to punish one player strategy so
// waves force adaptation (docs/design.md §14). Composition is a CLASS × DOMAIN,
// bought against a per-wave HP budget that scales without bound. Enemies muster
// on the derived battlefield ring and march INWARD toward the palace.
//
// Combat fields read by manager/combat.js:
//   hp/maxHp — base def × 1.25^wave × ... ; atk — (base + 2·wave)
//   cd       — cooldown in ticks between acts (lower = faster)
//   range    — attack radius in hex distance
//   domain   — which travel classes it may path through (all cross the void)
//   prefersCity  — veers toward the nearest city (Raider)
//   embarkAttack — may attack while embarked on water/space (Specialist)

import { travelClass } from '../world/terrain.js'

// Base profiles (placeholders). `def` is the base HP before wave scaling.
export const ENEMY_CLASSES = {
  grunt:      { key: 'grunt',      name: 'Grunt',      def: 20,  atk: 6,  cd: 8,  range: 1, weight: () => 6 },
  scout:      { key: 'scout',      name: 'Scout',      def: 10,  atk: 4,  cd: 4,  range: 1, weight: (w) => Math.max(2, 6 - 0.3 * w) },
  raider:     { key: 'raider',     name: 'Raider',     def: 40,  atk: 8,  cd: 10, range: 1, prefersCity: true, weight: (w) => 2 + 0.3 * w },
  ranger:     { key: 'ranger',     name: 'Ranger',     def: 14,  atk: 6,  cd: 8,  range: 3, marches: true, weight: (w) => 2 + 0.2 * w },
  juggernaut: { key: 'juggernaut', name: 'Juggernaut', def: 120, atk: 16, cd: 18, range: 1, weight: (w) => Math.max(0, (w - 2) * 0.5) },
  specialist: { key: 'specialist', name: 'Specialist', def: 24,  atk: 8,  cd: 10, range: 2, embarkAttack: true, weight: (w) => 1 + 0.2 * w },
}

// Travel classes each domain may cross (see terrain.js `travelClass`). Every
// domain crosses the VOID; amphibious adds water; astral adds bodies + mountains.
export const ENEMY_DOMAINS = {
  default: { domain: 'default', prefix: '', buckets: new Set(['land', 'void']), weight: () => 6 },
  amphibious: { domain: 'amphibious', prefix: 'Amphibious ', buckets: new Set(['land', 'void', 'water']), weight: (w) => (w < 2 ? 0 : 2 + 0.4 * w) },
  astral: { domain: 'astral', prefix: 'Astral ', buckets: new Set(['land', 'void', 'water', 'body', 'blocked']), weight: (w) => Math.max(0, (w - 10) * 0.8) },
}

export function domainCanTraverse(domain, terrainKey) {
  const d = ENEMY_DOMAINS[domain] ?? ENEMY_DOMAINS.default
  return d.buckets.has(travelClass(terrainKey))
}

/** Build one enemy piece. */
export function makeEnemy(id, cls, dom, wave, cell) {
  const scale = Math.pow(1.25, wave)
  const hp = Math.max(1, Math.round(cls.def * scale))
  const atk = Math.max(1, Math.round(cls.atk + 2 * wave))
  return {
    id,
    side: 'enemy',
    cls: cls.key,
    key: `${dom.domain}_${cls.key}`,
    name: dom.prefix + cls.name,
    domain: dom.domain,
    q: cell.q, r: cell.r,
    hp, maxHp: hp, atk,
    range: cls.range, cd: cls.cd, cdTimer: cls.cd,
    prefersCity: !!cls.prefersCity,
    embarkAttack: !!cls.embarkAttack,
    marches: !!cls.marches,
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
 * `reachable(domain,q,r)` reports whether that domain can path from the cell to
 * the palace, so a land-only class is never stranded on a space tile.
 */
export function generateHost(wave, spawns, reachable, rng = Math.random, strength = 1) {
  if (!spawns.length) return []
  const budget = waveBudget(wave, strength)

  const viable = {}
  for (const d of Object.values(ENEMY_DOMAINS)) {
    viable[d.domain] = spawns.filter((c) => domainCanTraverse(d.domain, c.terrain) && reachable(d.domain, c.q, c.r))
  }

  const combos = []
  let totalW = 0
  for (const cls of Object.values(ENEMY_CLASSES)) {
    for (const d of Object.values(ENEMY_DOMAINS)) {
      if (!viable[d.domain].length) continue
      const onlyWayIn = Object.values(ENEMY_DOMAINS).every((o) => o.domain === d.domain || !viable[o.domain].length)
      const dw = onlyWayIn ? Math.max(1, d.weight(wave)) : d.weight(wave)
      const cw = cls.weight(wave)
      const w = dw * cw
      if (w <= 0) continue
      combos.push({ cls, d, w })
      totalW += w
    }
  }
  if (!combos.length) return []
  const pick = () => {
    let r = rng() * totalW
    for (const c of combos) { r -= c.w; if (r <= 0) return c }
    return combos[combos.length - 1]
  }

  const free = spawns.slice()
  const units = []
  let spent = 0
  let id = 0
  let guard = 0
  while (spent < budget && free.length && guard++ < 6000) {
    const { cls, d } = pick()
    const okIdx = []
    for (let i = 0; i < free.length; i++) {
      if (domainCanTraverse(d.domain, free[i].terrain) && reachable(d.domain, free[i].q, free[i].r)) okIdx.push(i)
    }
    if (!okIdx.length) continue
    const idx = okIdx[Math.floor(rng() * okIdx.length)]
    const cell = free.splice(idx, 1)[0]
    const e = makeEnemy(id++, cls, d, wave, cell)
    units.push(e)
    spent += e.hp
  }
  return units
}

export const ENEMY_DEFS = {}
for (const cls of Object.values(ENEMY_CLASSES)) {
  for (const d of Object.values(ENEMY_DOMAINS)) {
    ENEMY_DEFS[`${d.domain}_${cls.key}`] = { key: `${d.domain}_${cls.key}`, name: d.prefix + cls.name, cls: cls.key, domain: d.domain }
  }
}
