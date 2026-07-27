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
import {
  BANDS, STAGES, STAGE_COUNT, MAX_RADIUS, MAX_REVEAL_RADIUS,
  LOCAL_RADIUS, FEATURELESS_OUTER_RINGS,
} from './regions.js'
import { isPassable, isLand, isWater, terrainOf } from './terrain.js'

// Celestial bodies asteroids must not touch, and the terrains that count as a
// "feature" for the clean-edge rule.
const BODY_REGIONS = new Set(['moon', 'mars', 'exoplanet', 'exomoon'])
const FEATURE_TERRAIN = new Set(['planet', 'star', 'singularity', 'asteroid'])

const START_RADIUS = 5
// The main ocean is wide, so the New World is the smaller share by design.
const MIN_OLD_WORLD = 65
const MIN_NEW_WORLD = 28
const MIN_ISLANDS = 2
const MAX_TUNDRA_FRACTION = 0.22
// Earth is only ~400 tiles, so its region-shaped stages are naturally small;
// this floor exists to catch a DEAD notch, not to enforce an even ladder.
const MIN_STAGE_TILES = 8
const ENCAMPMENT_MIN_DIST = 6
const EARLY_ENCAMPMENT_DIST = 12
const MOON_GAP = 1  // the Moon hangs exactly one ring beyond Earth
const MARS_INNER_GAP = 2 // rings of space between Earth's rim and Mars
const MARS_OUTER_GAP = 1 // at least one layer of space beyond Mars before deep space

// Earth must sustain all four economies, not merely have one tile of each near
// the palace — progress especially, since it drives the tech tree.
const MIN_EARTH_YIELD = { food: 55, production: 35, gold: 130, progress: 35 }

// Mountains are gameplay obstacles, so they must exist but stay sparse.
const MOUNTAIN_FRACTION = { min: 0.015, max: 0.15 }

const MIN_RIVER_TILES = 4
const MIN_RIVER_RUN = 4
const MIN_CLIMATE_TILES = 3
const MAX_LOCAL_DRY = 3

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
  const containment = [
    ['moon', 'space'], ['mars', 'space'], ['asteroid', 'space'],
    ['exoplanet', 'deep'], ['exomoon', 'deep'],
  ]
  for (const [region, band] of containment) {
    const stray = world.list.filter((t) => t.region === region && t.band !== band)
    if (stray.length) v.push(`${region} spills outside the ${band} band (${stray.length} tiles)`)
  }

  const spanOf = (region) => {
    const ds = world.list.filter((t) => t.region === region).map((t) => t.d)
    return ds.length ? { min: Math.min(...ds), max: Math.max(...ds) } : null
  }
  const moon = spanOf('moon')
  const mars = spanOf('mars')
  const exo = spanOf('exoplanet')
  const exomoon = spanOf('exomoon')

  // The Moon hangs exactly one ring of open space beyond Earth's rim.
  if (!moon) v.push('no Moon')
  else if (moon.min - earthR - 1 !== MOON_GAP) {
    v.push(`Moon is ${moon.min - earthR - 1} rings clear of Earth (want ${MOON_GAP})`)
  }

  // Mars must float in open space — clear of Earth AND of deep space.
  if (!mars) v.push('no Mars')
  else {
    if (mars.min - earthR - 1 < MARS_INNER_GAP) v.push(`Mars only ${mars.min - earthR - 1} rings clear of Earth`)
    if (BANDS.space.max - mars.max < MARS_OUTER_GAP) {
      v.push(`Mars only ${BANDS.space.max - mars.max} rings clear of deep space`)
    }
    if (moon && mars.min <= moon.max) v.push('Mars and the Moon overlap in radius')
  }

  // The exoplanet's moon sits on its BACKSIDE — strictly further out.
  if (!exomoon) v.push('no exomoon')
  else if (exo && exomoon.min <= exo.max) v.push('exomoon is not beyond the exoplanet')

  // No asteroid may appear before the Moon does, or hug a celestial body.
  if (moon) {
    const early = world.list.filter((t) => t.region === 'asteroid' && t.d <= moon.max).length
    if (early) v.push(`${early} asteroid(s) sit at or inside the Moon's ring`)
  }
  const hugging = world.list.filter(
    (t) => t.region === 'asteroid' &&
      neighbors(t.q, t.r).some((n) => BODY_REGIONS.has(at(n.q, n.r)?.region)),
  ).length
  if (hugging) v.push(`${hugging} asteroid(s) adjacent to the Moon/Mars/exoplanet`)

  // The outermost revealable ring stays featureless so the map edge reads clean.
  const edgeFeatures = world.list.filter(
    (t) => t.d > MAX_REVEAL_RADIUS - FEATURELESS_OUTER_RINGS && t.d <= MAX_REVEAL_RADIUS &&
      FEATURE_TERRAIN.has(t.terrain),
  ).length
  if (edgeFeatures) v.push(`${edgeFeatures} feature(s) on the map's final ring`)

  // EVERY Old World land tile must be walkable from the palace. Territory you
  // can never expand into is dead space, so this is exact, not a percentage —
  // mountains, rivers and straits all count as blockers.
  const oldWorld = world.list.filter((t) => t.region === 'old_world')
  const owLand = oldWorld.filter((t) => isLand(t.terrain) && isPassable(t.terrain))
  if (owLand.length) {
    const reach = bfs([{ q: 0, r: 0 }], (q, r) => {
      const t = at(q, r)
      return !!t && t.region === 'old_world' && isLand(t.terrain) && isPassable(t.terrain)
    })
    if (reach.size < owLand.length) {
      v.push(`${owLand.length - reach.size} Old World land tile(s) unreachable from the palace`)
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

  // Two things must hold of the known set at EVERY stage:
  //   - it encloses no pocket of unrevealed tiles (a hole)
  //   - it is one connected piece (no fragment adrift across the battlefield)
  for (let s = 0; s < STAGE_COUNT; s++) {
    const holes = enclosedUnknown(world, s)
    if (holes) v.push(`stage "${STAGES[s].name}" encloses ${holes} unrevealed tiles`)

    const known = world.list.filter((t) => t.revealStage <= s).length
    const reach = bfs([{ q: 0, r: 0 }], (q, r) => (world.tiles.get(key(q, r))?.revealStage ?? Infinity) <= s)
    if (reach.size < known) {
      v.push(`stage "${STAGES[s].name}" leaves ${known - reach.size} revealed tiles disconnected`)
    }
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

  // The opening view must read well: not a wasteland, and visibly varied.
  const localTiles = disc(0, 0, LOCAL_RADIUS).map((h) => at(h.q, h.r)).filter(Boolean)
  const localDry = localTiles.filter((t) => t.terrain === 'desert' || t.terrain === 'tundra').length
  if (localDry > MAX_LOCAL_DRY) v.push(`${localDry} desert/tundra tiles in the local view (max ${MAX_LOCAL_DRY})`)
  if (!localTiles.some((t) => t.terrain === 'mountain')) v.push('no mountain in the local view')

  // Islands belong in the channel between the continents, not the rim sea —
  // and they read as separate specks, never a clump or a local-view landmark.
  const islands = world.list.filter((t) => t.region === 'island')
  if (islands.length < MIN_ISLANDS) v.push(`too few islands (${islands.length})`)
  const strayIslands = islands.filter((t) => t.seaKind === 'rim').length
  if (strayIslands) v.push(`${strayIslands} island(s) outside the ocean channel`)
  const clumped = islands.filter(
    (t) => neighbors(t.q, t.r).some((n) => at(n.q, n.r)?.region === 'island'),
  ).length
  if (clumped) v.push(`${clumped} island(s) adjacent to another island`)
  const localIslands = islands.filter((t) => t.d <= LOCAL_RADIUS).length
  if (localIslands) v.push(`${localIslands} island(s) visible in the local view`)

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
    // Land only, with ONE deliberate exception: a guaranteed camp dead centre
    // on Mars.
    const marsCamps = camps.filter((t) => t.region === 'mars')
    if (marsCamps.length !== 1) v.push(`Mars should hold exactly 1 encampment (has ${marsCamps.length})`)
    const offLand = camps.filter((t) => !isLand(t.terrain) && t.region !== 'mars')
    if (offLand.length) v.push(`${offLand.length} encampment(s) not on land`)
    const banned = camps.filter((t) => t.region === 'moon' || t.region === 'asteroid' || t.region === 'exomoon')
    if (banned.length) v.push(`${banned.length} encampment(s) on the Moon/asteroids/exomoon`)
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

export { LOCAL_RADIUS, BANDS }
