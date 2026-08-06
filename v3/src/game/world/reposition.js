// Repositioning distance — the graph that reposition range and Formations both
// read. See docs/design.md § Repositioning.
//
// A unit may be moved to any tile it could be PLACED on; the QUESTION this module
// answers is how far that is, so the caller can decide whether it is free (within
// your reposition range) or what it costs.
//
// REPOSITION DISTANCE from an origin is a 0-1 BFS over the revealed hex grid:
//   - entering a tile whose terrain is in a granted DOMAIN costs 0
//     ("across water" makes an ocean free to hop),
//   - entering any other tile costs 1.
// Nothing hard-blocks a path — you can always PAY to move anywhere — so domains
// only ever make a move cheaper, never impossible.
//
// TELEPORT replaces the whole metric with straight-line hex distance: obstacles
// stop lengthening the move.

import { key, neighbors, lengthOf } from '../hex/coords.js'
import { REPOSITION_DOMAIN_TERRAINS } from '../data/schema.js'

/** The union of terrain keys made free by a set of domain names. */
export function domainTerrainSet(domains) {
  const out = new Set()
  for (const d of domains ?? []) {
    for (const k of REPOSITION_DOMAIN_TERRAINS[d] ?? []) out.add(k)
  }
  return out
}

const hexDist = (a, b) => lengthOf(a.q - b.q, a.r - b.r)

/**
 * Reposition distances from `origin`, as a Map of tileKey → distance.
 *
 * `maxDist` bounds the search (the free range, or the range past which the caller
 * stops caring) so Formations does not sweep the whole map per unit. Tiles beyond
 * it are simply absent from the map.
 *
 * With `teleport`, there is no field to build — distance is straight-line — so
 * callers should special-case it; `repositionDistance` below does.
 */
export function repositionField(world, origin, { domains, maxDist = Infinity } = {}) {
  const free = domainTerrainSet(domains)
  const dist = new Map([[key(origin.q, origin.r), 0]])
  // 0-1 BFS: a deque, cost-0 steps pushed to the front, cost-1 to the back.
  let deque = [origin]
  while (deque.length) {
    const t = deque.shift()
    const d = dist.get(key(t.q, t.r))
    if (d >= maxDist) continue
    for (const n of neighbors(t.q, t.r)) {
      const o = world.tiles.get(key(n.q, n.r))
      if (!o || o.revealStage > world.terr.stage) continue
      const step = free.has(o.terrain) ? 0 : 1
      const nd = d + step
      const k = key(o.q, o.r)
      if (nd < (dist.get(k) ?? Infinity) && nd <= maxDist) {
        dist.set(k, nd)
        if (step === 0) deque.unshift(o); else deque.push(o)
      }
    }
  }
  return dist
}

/**
 * Distance from `origin` to one `dest`. Straight-line when teleporting; otherwise
 * a bounded field lookup. Returns Infinity if `dest` is unreachable within
 * `maxDist` (only possible when bounded).
 */
export function repositionDistance(world, origin, dest, { domains, teleport, maxDist = Infinity } = {}) {
  if (teleport) return hexDist(origin, dest)
  const field = repositionField(world, origin, { domains, maxDist })
  return field.get(key(dest.q, dest.r)) ?? Infinity
}
