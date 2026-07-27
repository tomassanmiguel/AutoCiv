// Enemy roster (v3 scaffold) — the v2 composition system, adapted to the hex map.
//
// An enemy is a TYPE (melee / cavalry / ranged) × a DOMAIN (default / amphibious
// / astral), rolled with a spawn TIER (grunt / normal / elite). `generateHost`
// buys them against a per-wave HP budget, exactly as v2 did.
//
// What changed from v2: there are no columns and no rows. Enemies muster on the
// derived battlefield ring and march INWARD toward the palace, so spawn cells are
// ring tiles and pathing is a flow field rather than "decrement row".
//
// Per-enemy combat fields (read directly by manager/combat.js):
//   hp/maxHp = base def × 1.25^wave × tier-mult
//   atk      = (base atk + 2·wave) × tier-mult   (v2's curve, kept as-is)
//   acts     = cells moved per turn (melee 1, cavalry 2, ranged 1)
//   range    = attack radius in hex distance
//   domain   = which travel classes it may path through (all cross the void)

import { travelClass } from '../world/terrain.js'

export const ENEMY_TYPES = {
  melee: { type: 'melee', name: 'Raider', def: 16, atk: 6, acts: 1, range: () => 1 },
  cavalry: { type: 'cavalry', name: 'Cavalry', def: 10, atk: 4, acts: 2, range: () => 1 },
  ranged: { type: 'ranged', name: 'Ranger', def: 6, atk: 6, acts: 1, range: (w) => 2 + Math.floor(w / 8) },
}

// Travel classes each domain may cross (see terrain.js `travelClass`).
//
// EVERY domain crosses the VOID — open space is how a host reaches you, not a
// barrier. What the higher domains add is the ability to set foot on things:
// amphibious adds water, and astral adds celestial BODIES (Moon, Mars,
// asteroids, planets, stars) and mountains. So astral is a strict superset,
// not a separate "space-only" lane.
export const ENEMY_DOMAINS = {
  default: { domain: 'default', prefix: '', buckets: new Set(['land', 'void']), weight: () => 6 },
  amphibious: { domain: 'amphibious', prefix: 'Amphibious ', buckets: new Set(['land', 'void', 'water']), weight: (w) => (w < 3 ? 0 : 2 + 0.4 * w) },
  astral: { domain: 'astral', prefix: 'Astral ', buckets: new Set(['land', 'void', 'water', 'body', 'blocked']), weight: (w) => Math.max(0, (w - 10) * 0.8) },
}

/** Whether an enemy DOMAIN can traverse a terrain. */
export function domainCanTraverse(domain, terrainKey) {
  const d = ENEMY_DOMAINS[domain] ?? ENEMY_DOMAINS.default
  return d.buckets.has(travelClass(terrainKey))
}

// Grunts (½) are cheap bodies; elites (×2) are rare walls.
const TIERS = [
  { key: 'grunt', prefix: 'Grunt ', mult: 0.5, p: 0.5 },
  { key: 'normal', prefix: '', mult: 1, p: 0.4 },
  { key: 'elite', prefix: 'Elite ', mult: 2, p: 0.1 },
]
function rollTier(rng) {
  let r = rng()
  for (const t of TIERS) { if (r < t.p) return t; r -= t.p }
  return TIERS[1]
}

/** HP budget a wave may spend. `strength` is the UI slider (0.25 … 3). */
// Budget growth (1.34) deliberately OUTPACES per-enemy HP growth (1.25), so the
// host grows in BODIES as waves rise rather than staying a constant handful of
// ever-fatter units. v2 landed on the same split for the same reason.
export function waveBudget(wave, strength = 1) {
  return 45 * Math.pow(1.34, wave) * strength
}

/**
 * Compose a host for a wave.
 *
 * `spawns` is [{ q, r, terrain }] — the battlefield ring. `reachable(domain, q, r)`
 * must report whether that domain can actually path from the cell to the palace;
 * cells that fail are skipped, so a land-only Raider is never stranded on a
 * space tile with no route in.
 */
export function generateHost(wave, spawns, reachable, rng = Math.random, strength = 1) {
  if (!spawns.length) return []
  const scale = Math.pow(1.25, wave)
  const budget = waveBudget(wave, strength)

  // Which domains can actually get in from somewhere on the ring? A domain with
  // no viable entry is dropped and its weight redistributed — otherwise an
  // all-space frontier would produce an empty wave.
  const viable = {}
  for (const d of Object.values(ENEMY_DOMAINS)) {
    viable[d.domain] = spawns.filter((c) => domainCanTraverse(d.domain, c.terrain) && reachable(d.domain, c.q, c.r))
  }
  const combos = []
  let totalW = 0
  for (const t of Object.values(ENEMY_TYPES)) {
    for (const d of Object.values(ENEMY_DOMAINS)) {
      if (!viable[d.domain].length) continue
      // Astral is the fallback when nothing else can reach: if it is the only
      // way in, it spawns regardless of how early the wave is.
      const onlyWayIn = Object.values(ENEMY_DOMAINS).every((o) => o.domain === d.domain || !viable[o.domain].length)
      const w = onlyWayIn ? Math.max(1, d.weight(wave)) : d.weight(wave)
      if (w <= 0) continue
      combos.push({ t, d, w })
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

  while (spent < budget && free.length && guard++ < 4000) {
    const { t, d } = pick()
    // Only cells this domain can actually march inward from.
    const okIdx = []
    for (let i = 0; i < free.length; i++) {
      if (domainCanTraverse(d.domain, free[i].terrain) && reachable(d.domain, free[i].q, free[i].r)) okIdx.push(i)
    }
    if (!okIdx.length) continue
    const idx = okIdx[Math.floor(rng() * okIdx.length)]
    const cell = free.splice(idx, 1)[0]

    const tier = rollTier(rng)
    const hp = Math.max(1, Math.round(Math.round(t.def * scale) * tier.mult))
    const atk = Math.max(1, Math.round((t.atk + 2 * wave) * tier.mult))
    units.push({
      id: id++,
      side: 'enemy',
      key: `${d.domain}_${t.type}`,
      name: tier.prefix + d.prefix + t.name,
      type: t.type, domain: d.domain, tier: tier.key,
      q: cell.q, r: cell.r,
      hp, maxHp: hp, atk,
      range: t.range(wave), acts: t.acts,
      dead: false, lastAttackSeq: null, lastAttackDir: null,
    })
    spent += hp
  }
  return units
}

export const ENEMY_DEFS = {}
for (const t of Object.values(ENEMY_TYPES)) {
  for (const d of Object.values(ENEMY_DOMAINS)) {
    ENEMY_DEFS[`${d.domain}_${t.type}`] = { key: `${d.domain}_${t.type}`, name: d.prefix + t.name, type: t.type, domain: d.domain }
  }
}
