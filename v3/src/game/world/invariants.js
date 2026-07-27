// World invariants — the "predictable" half of "varied but predictable".
//
// `validate(world)` returns an array of human-readable violations (empty = good).
// generateWorld re-rolls until this comes back clean, and sims/worldgen.mjs runs
// it across hundreds of seeds as the regression test for map generation.
//
// Split into two kinds:
//   CORRECTNESS — a violation makes the map unplayable (sealed palace, a body
//                 spilling out of its band, a reveal stage that shows nothing).
//   VIABILITY   — a violation makes a start unfair (no forest in reach, a wedge
//                 with no encampments, a continent too small to matter).

import { key, disc, neighbors, bfs } from '../hex/coords.js'
import { BANDS, STAGES, STAGE, LOCAL_RADIUS } from './regions.js'
import { isPassable, isLand, isWater, terrainOf } from './terrain.js'

const START_RADIUS = 5
const MIN_OLD_WORLD = 60
const MIN_NEW_WORLD = 35
const MIN_STAGE_TILES = 15
// Earth must be able to sustain all four economies, not just have one tile of
// each near the palace — progress especially, since it drives the tech tree.
const MIN_EARTH_YIELD = { food: 90, production: 55, gold: 180, progress: 45 }
const ENCAMPMENT_MIN_DIST = 6
const EARLY_ENCAMPMENT_DIST = 14
const MIN_REACHABLE_FRACTION = 0.8

export function validate(world) {
  const v = []
  const at = (q, r) => world.tiles.get(key(q, r)) ?? null

  // --- CORRECTNESS ---------------------------------------------------------

  const home = at(0, 0)
  if (!home) {
    v.push('palace tile missing')
    return v
  }
  if (!isLand(home.terrain) || !isPassable(home.terrain)) {
    v.push(`palace tile is ${home.terrain} (must be passable land)`)
  }
  for (const n of neighbors(0, 0)) {
    const t = at(n.q, n.r)
    if (!t || !isPassable(t.terrain)) {
      v.push(`palace ring blocked at ${n.q},${n.r} (${t?.terrain ?? 'missing'})`)
    }
  }

  // Bodies must sit wholly inside their band, or the concentric structure breaks.
  const containment = [
    ['moon', 'space'],
    ['mars', 'space'],
    ['asteroid', 'space'],
    ['exoplanet', 'deep'],
  ]
  for (const [region, band] of containment) {
    const stray = world.list.filter((t) => t.region === region && t.band !== band)
    if (stray.length) v.push(`${region} spills outside the ${band} band (${stray.length} tiles)`)
  }

  // The palace must not be walled in by mountains: most of the Old World's
  // passable land has to be reachable on foot from home.
  const oldWorld = world.list.filter((t) => t.region === 'old_world')
  const walkable = oldWorld.filter((t) => isPassable(t.terrain))
  if (walkable.length) {
    const reach = bfs(
      [{ q: 0, r: 0 }],
      (q, r) => {
        const t = at(q, r)
        return !!t && t.region === 'old_world' && isPassable(t.terrain)
      },
    )
    const frac = reach.size / walkable.length
    if (frac < MIN_REACHABLE_FRACTION) {
      v.push(`only ${(frac * 100).toFixed(0)}% of the Old World is walkable from the palace`)
    }
  }

  // Every reveal stage must add a meaningful chunk, or the ladder has a dead notch.
  for (let i = 0; i < STAGES.length; i++) {
    const n = world.list.filter((t) => t.revealStage === i).length
    if (n < MIN_STAGE_TILES) {
      v.push(`reveal stage "${STAGES[i].name}" only adds ${n} tiles (< ${MIN_STAGE_TILES})`)
    }
  }

  // --- VIABILITY -----------------------------------------------------------

  const near = disc(0, 0, START_RADIUS).map((h) => at(h.q, h.r)).filter(Boolean)
  const hasNear = (pred) => near.some(pred)
  if (!hasNear((t) => t.terrain === 'plains')) v.push('no plains within the start radius (:food:)')
  if (!hasNear((t) => t.terrain === 'forest')) v.push('no forest within the start radius (:progress:)')
  if (!hasNear((t) => t.terrain === 'hills')) v.push('no hills within the start radius (:production:)')
  if (!hasNear((t) => isWater(t.terrain))) v.push('no water within the start radius (:gold:)')

  const earthYield = yieldOf(world.list.filter((t) => t.band === 'earth'))
  for (const [res, min] of Object.entries(MIN_EARTH_YIELD)) {
    if (earthYield[res] < min) v.push(`Earth ${res} yield too low (${earthYield[res]} < ${min})`)
  }

  const ow = oldWorld.length
  const nw = world.list.filter((t) => t.region === 'new_world').length
  if (ow < MIN_OLD_WORLD) v.push(`Old World too small (${ow} < ${MIN_OLD_WORLD})`)
  if (nw < MIN_NEW_WORLD) v.push(`New World too small (${nw} < ${MIN_NEW_WORLD})`)

  // The New World must be genuinely separated by water — otherwise the ocean
  // crossing tech has nothing to gate.
  const bridged = world.list.some(
    (t) => t.region === 'new_world' && neighbors(t.q, t.r).some((n) => at(n.q, n.r)?.region === 'old_world'),
  )
  if (bridged) v.push('New World touches the Old World (no ocean channel)')

  // Encampments: spread over all six wedges, none in the cradle, one reachable early.
  const camps = world.list.filter((t) => t.encampment)
  if (!camps.length) {
    v.push('no encampments placed')
  } else {
    const tooClose = camps.filter((t) => t.d < ENCAMPMENT_MIN_DIST)
    if (tooClose.length) v.push(`${tooClose.length} encampment(s) inside the start radius`)
    const wedges = new Set(camps.map((t) => t.wedge))
    if (wedges.size < 6) v.push(`encampments only cover ${wedges.size}/6 wedges`)
    if (!camps.some((t) => t.d <= EARLY_ENCAMPMENT_DIST)) {
      v.push('no encampment within early reach')
    }
  }

  return v
}

/** Total base yield of a set of tiles, by resource. Used by the panel readout. */
export function yieldOf(tiles) {
  const out = { food: 0, production: 0, gold: 0, progress: 0 }
  for (const t of tiles) {
    const y = terrainOf(t.terrain).yield
    if (y) out[y.res] += y.amount
  }
  return out
}

export { LOCAL_RADIUS, BANDS, STAGE }
