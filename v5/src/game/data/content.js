// The game's indexed view of content.json + the draft.
import raw from './content.json'
import { eraIndex } from './schema.js'

export const CONTENT = raw

// Progress cost to unlock a tech, by era index (authored curve 1,2,4,6,9 … ~×1.44).
export const PROGRESS_UNLOCK_COST = [1, 2, 4, 6, 9, 13, 19, 27, 39, 56, 81, 117, 168, 242, 349]
export const progressCost = (era) => PROGRESS_UNLOCK_COST[Math.min(era, PROGRESS_UNLOCK_COST.length - 1)]

export const TERRAIN = Object.fromEntries(CONTENT.terrain.map((t) => [t.id, t]))
export const DEPLOYABLES = Object.fromEntries(CONTENT.deployables.map((d) => [d.id, d]))
export const TECHS = Object.fromEntries(CONTENT.techs.map((t) => [t.id, t]))
export const META = CONTENT.meta
export const ENEMY = CONTENT.enemy

export const techEra = (t) => eraIndex(t.era)
export const deployableEra = (d) => eraIndex(d.era)

/** Techs in a given era, not yet taken. */
export function eraPool(era, taken) {
  return CONTENT.techs.filter((t) => techEra(t) === era && !taken.has(t.id))
}
/** Techs in any earlier era, not taken (the wildcard pool). */
export function wildcardPool(era, taken) {
  return CONTENT.techs.filter((t) => techEra(t) < era && !taken.has(t.id))
}

// Seeded RNG (mulberry32) so draws are reproducible from a run seed.
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function pick(arr, rand) {
  return arr.length ? arr[Math.floor(rand() * arr.length)] : null
}
/** Draw n distinct items, weighting later-era techs higher (2^era). */
export function drawWeighted(pool, n, rand) {
  const out = []
  const bag = [...pool]
  while (out.length < n && bag.length) {
    const weights = bag.map((t) => Math.pow(2, techEra(t)))
    let total = weights.reduce((a, b) => a + b, 0)
    let r = rand() * total
    let idx = 0
    for (; idx < bag.length; idx++) { r -= weights[idx]; if (r <= 0) break }
    out.push(bag.splice(Math.min(idx, bag.length - 1), 1)[0])
  }
  return out
}
