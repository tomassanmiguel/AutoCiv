// World invariants — the "predictable" half of "varied but predictable".
//
// `validate(world)` returns an array of human-readable violations (empty = good).
// generateWorld re-rolls until this comes back clean, and sims/worldgen.mjs runs
// it across hundreds of seeds as the regression test for map generation.
//
// Split into two kinds:
//   CORRECTNESS — a violation makes the map unplayable or structurally wrong
//                 (sealed palace, a body spilling out of its band, a hole in
//                 the known world, a disconnected exoplanet landmass).
//   VIABILITY   — a violation makes a start unfair or a promised feature absent
//                 (no forest in reach, no river, no desert belt, a wedge with
//                 no encampments).

import { key, disc, neighbors, bfs } from '../hex/coords.js'
import { BANDS, BODIES, STAGES, STAGE, STAGE_COUNT, MAX_RADIUS, LOCAL_RADIUS } from './regions.js'
import { isPassable, isLand, isWater, terrainOf } from './terrain.js'

const START_RADIUS = 5
// Earth is split roughly 2/3 Old World, 1/3 New World across the ocean channel.
const MIN_OLD_WORLD = 80
const MIN_NEW_WORLD = 45
const MIN_ISLANDS = 3
const MAX_TUNDRA_FRACTION = 0.22
// Earth is only ~400 tiles, so its region-shaped stages are naturally small;
// this floor exists to catch a DEAD notch, not to enforce an even ladder.
const MIN_STAGE_TILES = 8
const MIN_REACHABLE_FRACTION = 0.8
const ENCAMPMENT_MIN_DIST = 6
const EARLY_ENCAMPMENT_DIST = 12
const EARTH_MARS_GAP = 2

// Earth must sustain all four economies, not merely have one tile of each near
// the palace — progress especially, since it drives the tech tree.
const MIN_EARTH_YIELD = { food: 70, production: 45, gold: 160, progress: 45 }

// Mountains are gameplay obstacles, so they must exist but stay sparse.
const MOUNTAIN_FRACTION = { min: 0.015, max: 0.15 }

const MIN_RIVER_TILES = 4
const MIN_RIVER_RUN = 4
const MIN_CLIMATE_TILES = 3

export function validate(world) {
  const v = []
  const at = (q, r) => world.tiles.get(key(q, r)) ?? null
  const earthR = BANDS.earth.max

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
  for (const [region, band] of [['moon', 'space'], ['mars', 'space'], ['asteroid', 'space'], ['exoplanet', 'deep']]) {
    const stray = world.list.filter((t) => t.region === region && t.band !== band)
    if (stray.length) v.push(`${region} spills outside the ${band} band (${stray.length} tiles)`)
  }

  // Open space must separate Earth from its neighbours.
  const marsMin = Math.min(...world.list.filter((t) => t.region === 'mars').map((t) => t.d), Infinity)
  const moonMin = Math.min(...world.list.filter((t) => t.region === 'moon').map((t) => t.d), Infinity)
  if (marsMin - earthR - 1 < EARTH_MARS_GAP) v.push(`Mars only ${marsMin - earthR - 1} rings clear of Earth`)
  if (moonMin - earthR - 1 < EARTH_MARS_GAP) v.push(`Moon only ${moonMin - earthR - 1} rings clear of Earth`)

  // The palace must not be walled in: most of the Old World has to be reachable
  // on foot. Only mountains block (rivers will be bridgeable).
  const oldWorld = world.list.filter((t) => t.region === 'old_world')
  const walkable = oldWorld.filter((t) => t.terrain !== 'mountain')
  if (walkable.length) {
    const reach = bfs([{ q: 0, r: 0 }], (q, r) => {
      const t = at(q, r)
      return !!t && t.region === 'old_world' && t.terrain !== 'mountain'
    })
    const frac = reach.size / walkable.length
    if (frac < MIN_REACHABLE_FRACTION) {
      v.push(`only ${(frac * 100).toFixed(0)}% of the Old World is walkable from the palace`)
    }
  }

  // Every reveal stage must add a meaningful chunk.
  const stageCounts = new Array(STAGE_COUNT).fill(0)
  for (const t of world.list) if (t.revealStage < STAGE_COUNT) stageCounts[t.revealStage]++
  for (let s = 0; s < STAGE_COUNT; s++) {
    if (stageCounts[s] < MIN_STAGE_TILES) {
      v.push(`reveal stage "${STAGES[s].name}" only adds ${stageCounts[s]} tiles (< ${MIN_STAGE_TILES})`)
    }
  }

  // The known set must never enclose a pocket of unrevealed tiles. Earth's
  // stages are region-shaped and the exoplanet stages are corridor-shaped, so
  // every stage gets a real (radius-bounded) flood.
  for (let s = 0; s < STAGE_COUNT; s++) {
    const holes = enclosedUnknown(world, s)
    if (holes) v.push(`stage "${STAGES[s].name}" encloses ${holes} unrevealed tiles`)
  }

  // The exoplanet's landmass must be one piece (its water may be as odd as it likes).
  const exoLand = world.list.filter((t) => t.region === 'exoplanet' && isLand(t.terrain))
  if (exoLand.length) {
    const start = exoLand[0]
    const reach = bfs([{ q: start.q, r: start.r }], (q, r) => {
      const t = at(q, r)
      return !!t && t.region === 'exoplanet' && isLand(t.terrain)
    })
    if (reach.size < exoLand.length) {
      v.push(`exoplanet landmass is split (${reach.size}/${exoLand.length} connected)`)
    }
  } else {
    v.push('exoplanet has no land')
  }

  // --- VIABILITY -----------------------------------------------------------

  const near = disc(0, 0, START_RADIUS).map((h) => at(h.q, h.r)).filter(Boolean)
  const hasNear = (pred) => near.some(pred)
  if (!hasNear((t) => t.terrain === 'plains')) v.push('no plains within the start radius (food)')
  if (!hasNear((t) => t.terrain === 'forest')) v.push('no forest within the start radius (progress)')
  if (!hasNear((t) => t.terrain === 'hills')) v.push('no hills within the start radius (production)')
  if (!hasNear((t) => isWater(t.terrain))) v.push('no water within the start radius (gold)')

  const earth = world.list.filter((t) => t.band === 'earth')
  const earthYield = yieldOf(earth)
  for (const [res, min] of Object.entries(MIN_EARTH_YIELD)) {
    if (earthYield[res] < min) v.push(`Earth ${res} yield too low (${earthYield[res]} < ${min})`)
  }

  const ow = oldWorld.length
  const nw = world.list.filter((t) => t.region === 'new_world').length
  if (ow < MIN_OLD_WORLD) v.push(`Old World too small (${ow} < ${MIN_OLD_WORLD})`)
  if (nw < MIN_NEW_WORLD) v.push(`New World too small (${nw} < ${MIN_NEW_WORLD})`)

  const bridged = world.list.some(
    (t) => t.region === 'new_world' && neighbors(t.q, t.r).some((n) => at(n.q, n.r)?.region === 'old_world'),
  )
  if (bridged) v.push('New World touches the Old World (no ocean channel)')

  // Climate is latitudinal: an arid equator, tundra confined to the two poles.
  const PR = Math.sqrt(3) * earthR
  const latOf = (t) => Math.abs(t.y) / PR
  const desertMid = earth.filter((t) => t.terrain === 'desert' && latOf(t) < 0.5).length
  const tundra = earth.filter((t) => t.terrain === 'tundra')
  const tundraPolar = tundra.filter((t) => latOf(t) > 0.5).length
  if (desertMid < MIN_CLIMATE_TILES) v.push(`too little desert near Earth's equator (${desertMid})`)
  if (tundraPolar < MIN_CLIMATE_TILES) v.push(`too little polar tundra (${tundraPolar})`)
  if (tundra.length && tundraPolar / tundra.length < 0.85) {
    v.push(`tundra is not confined to the poles (${tundraPolar}/${tundra.length} polar)`)
  }
  const earthLandAll = earth.filter((t) => isLand(t.terrain)).length
  if (earthLandAll && tundra.length / earthLandAll > MAX_TUNDRA_FRACTION) {
    v.push(`too much tundra (${((tundra.length / earthLandAll) * 100).toFixed(0)}% of land)`)
  }

  // Islands belong in the channel between the continents, not the rim sea.
  const islands = world.list.filter((t) => t.region === 'island')
  if (islands.length < MIN_ISLANDS) v.push(`too few islands (${islands.length})`)
  const strayIslands = islands.filter((t) => t.seaKind === 'rim').length
  if (strayIslands) v.push(`${strayIslands} island(s) outside the ocean channel`)

  // Mountains: present, but sparse enough to leave the map open.
  const earthLand = earth.filter((t) => isLand(t.terrain)).length
  const mountains = earth.filter((t) => t.terrain === 'mountain').length
  if (earthLand) {
    const frac = mountains / earthLand
    if (frac < MOUNTAIN_FRACTION.min) v.push(`almost no mountains (${(frac * 100).toFixed(1)}% of land)`)
    if (frac > MOUNTAIN_FRACTION.max) v.push(`too many mountains (${(frac * 100).toFixed(1)}% of land)`)
  }

  // Rivers: most maps should have real inland waterways.
  const rivers = earth.filter((t) => t.terrain === 'river')
  if (rivers.length < MIN_RIVER_TILES) {
    v.push(`too little river (${rivers.length} tiles < ${MIN_RIVER_TILES})`)
  } else if (longestRun(world, rivers) < MIN_RIVER_RUN) {
    v.push('no single river run long enough')
  }

  // Encampments: land only, spread over all six wedges, clear of the cradle.
  const camps = world.list.filter((t) => t.encampment)
  if (!camps.length) {
    v.push('no encampments placed')
  } else {
    const offLand = camps.filter((t) => !isLand(t.terrain))
    if (offLand.length) v.push(`${offLand.length} encampment(s) not on land`)
    const banned = camps.filter((t) => t.region === 'moon' || t.region === 'mars' || t.region === 'asteroid')
    if (banned.length) v.push(`${banned.length} encampment(s) on the Moon/Mars/asteroids`)
    const tooClose = camps.filter((t) => t.band === 'earth' && t.d < ENCAMPMENT_MIN_DIST)
    if (tooClose.length) v.push(`${tooClose.length} encampment(s) inside the start radius`)
    const wedges = new Set(camps.filter((t) => t.band === 'earth').map((t) => t.wedge))
    if (wedges.size < 6) v.push(`Earth encampments only cover ${wedges.size}/6 wedges`)
    if (!camps.some((t) => t.d <= EARLY_ENCAMPMENT_DIST)) v.push('no encampment within early reach')
    if (!camps.some((t) => t.region === 'exoplanet')) v.push('no encampments on the exoplanet')
  }

  return v
}

/**
 * Count unrevealed tiles that are completely enclosed by the known world at a
 * given stage — flood the unknown region inward from the map's rim; anything
 * unknown the flood cannot reach is a hole.
 */
function enclosedUnknown(world, stage) {
  // A hole can only sit inside the known frontier, so bound the flood one ring
  // past it rather than sweeping the whole 4900-tile map.
  let maxKnown = 0
  for (const t of world.list) if (t.revealStage <= stage && t.d > maxKnown) maxKnown = t.d
  const bound = Math.min(maxKnown + 1, MAX_RADIUS)

  const reached = new Set()
  const stack = []
  for (const t of world.list) {
    if (t.d === bound && t.revealStage > stage) {
      reached.add(key(t.q, t.r))
      stack.push(t)
    }
  }
  while (stack.length) {
    const t = stack.pop()
    for (const n of neighbors(t.q, t.r)) {
      const nk = key(n.q, n.r)
      if (reached.has(nk)) continue
      const o = world.tiles.get(nk)
      if (!o || o.d > bound || o.revealStage <= stage) continue
      reached.add(nk)
      stack.push(o)
    }
  }
  let holes = 0
  for (const t of world.list) {
    if (t.d <= bound && t.revealStage > stage && !reached.has(key(t.q, t.r))) holes++
  }
  return holes
}

/** Longest connected run among a set of tiles. */
function longestRun(world, tiles) {
  const inSet = new Set(tiles.map((t) => key(t.q, t.r)))
  const seen = new Set()
  let best = 0
  for (const t of tiles) {
    const k = key(t.q, t.r)
    if (seen.has(k)) continue
    let n = 0
    const stack = [t]
    seen.add(k)
    while (stack.length) {
      const c = stack.pop()
      n++
      for (const nb of neighbors(c.q, c.r)) {
        const nk = key(nb.q, nb.r)
        if (!inSet.has(nk) || seen.has(nk)) continue
        seen.add(nk)
        stack.push(world.tiles.get(nk))
      }
    }
    best = Math.max(best, n)
  }
  return best
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

export { LOCAL_RADIUS, BANDS, BODIES }
