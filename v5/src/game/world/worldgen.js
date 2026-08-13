// World generation (v3).
//
// `generateWorld(seed)` is a PURE function: same seed → same world, no React,
// no Math.random, no game state. A run persists only its seed.
//
// Shape of the world, outward from the palace at (0,0):
//   Earth      — a disc split roughly 2/3 Old World (holding the palace) and
//                1/3 New World across a wide ocean channel, with islands in it
//   Space      — a band containing the Moon and Mars discs plus asteroids
//   Deep space — the "ocean" separating Earth from the exoplanet, which is its
//                own small world embedded in the band
//   Galactic   — deep space littered with planets, stars, singularities, asteroids
//
// The battlefield ring is NOT generated here: it is derived per-stage from the
// known set (see GameManager) so it always hugs the current frontier.
//
// Generation is constraint-based: build a candidate, repair what is cheap to
// repair, validate, and re-roll if it still violates an invariant (see
// invariants.js). That is what makes the map "varied but predictable".

import { key, disc, ring, neighbors, lengthOf, toPixel, wedgeOf, SQRT3 } from '../hex/coords.js'
import { makeRng, makeNoise2D, shuffle } from './noise.js'
import {
  BANDS, BODIES, MAX_RADIUS, MAX_REVEAL_RADIUS, REVEAL_RADIUS, EXO_REACH, EXO_CORRIDOR,
  GALAXY_SHAPE, FEATURELESS_OUTER_RINGS,
  bandAt, STAGE, STAGE_COUNT, LOCAL_RADIUS, NEARBY_RADIUS, DISTANT_RADIUS,
} from './regions.js'
import { isPassable, isLand, isWater, terrainOf } from './terrain.js'
import { validate } from './invariants.js'

const MAX_ATTEMPTS = 9 // cap worst-case worldgen time; relaxed invariants pass well within this

// --- Earth shaping knobs -----------------------------------------------------
// The split axis. OW_EDGE must stay comfortably above 0 or the palace (at s=0,
// where the wobble is damped to nothing) would fall in the water. Pushing
// NW_EDGE out is therefore the only way to widen the ocean, which is why the
// main sea grows at the New World's expense rather than the Old World's.
const OW_EDGE = 0.06
const NW_EDGE = 0.58      // wider ocean channel (a bit more sea, smaller New World)
const SPLIT_WOBBLE = 0.40 // more boundary wobble so the sea reads as an irregular ocean, not a straight river
const RIM_SEA = 0.90      // radius past which Earth TENDS to sea; lower = a rounder, larger ocean at the rim
// Inland seas carve oceans INTO the continents (less landmass); higher cut = less sea.
// The Old World is the larger continent, so it gets the lower (more aggressive) cut.
const INLAND_SEA_OLD = 0.64
const INLAND_SEA_NEW = 0.80

// Climate is LATITUDINAL: an arid equator, tundra at the two poles. The polar
// axis is the world's vertical, so north/south read as up/down on the map.
const TUNDRA_LAT = 0.62
const TUNDRA_CLUSTER = 0.45 // tundra also needs a cluster field, so it forms patches
const DESERT_LAT = 0.42

const RIDGE_CUT = 0.96 // ridged-noise threshold for mountains — high, so ranges
                       // come out as sparse lines rather than blobs
const HILL_CUT = 0.60

const MAX_LOCAL_DRY = 3 // desert/tundra tiles allowed inside the opening view
const ENCAMPMENT_MIN_DIST = 6
const ENCAMPMENT_SPACING = 3
const EARTH_CAMPS_PER_WEDGE = 1

/** Build every hex in the map with its band + pixel position, terrain unset. */
function blankTiles() {
  const tiles = new Map()
  for (let d = 0; d <= MAX_RADIUS; d++) {
    for (const h of ring(0, 0, d)) {
      const { x, y } = toPixel(h.q, h.r, 1)
      tiles.set(key(h.q, h.r), {
        q: h.q,
        r: h.r,
        d,
        x,
        y,
        band: bandAt(d),
        wedge: wedgeOf(h.q, h.r),
        terrain: 'deep_space',
        region: 'deep_space',
        seaKind: null, // 'channel' | 'rim' — islands only go in the channel
        elev: 0.5,
        revealStage: Infinity, // the outermost rings are battlefield-only, never known
        encampment: null,
      })
    }
  }
  return tiles
}

// ---------------------------------------------------------------------------
// Earth
// ---------------------------------------------------------------------------

function generateEarth(tiles, seed, rng) {
  const R = BANDS.earth.max
  const PR = SQRT3 * R // pixel radius of the Earth disc at hex size 1

  // A random split axis. The Old World always holds the palace; the New World
  // sits across the ocean channel on the far side.
  const theta = rng() * Math.PI * 2
  const ux = Math.cos(theta)
  const uy = Math.sin(theta)

  const contN = makeNoise2D(seed + 11, { scale: 5.5 })
  const rimN = makeNoise2D(seed + 23, { scale: 4.0 })
  const elevN = makeNoise2D(seed + 37, { scale: 3.2 })
  const moistN = makeNoise2D(seed + 53, { scale: 4.5 })
  const climN = makeNoise2D(seed + 67, { scale: 3.6 })
  const polarN = makeNoise2D(seed + 101, { scale: 2.6 })
  // Separate, higher-frequency field for mountains. Ridged noise (1 - |2n-1|)
  // peaks along the field's mid-contour, so a high cut yields thin RIDGELINES
  // instead of the blobs a plain elevation threshold produces.
  const ridgeN = makeNoise2D(seed + 89, { scale: 2.1 })
  const seaN = makeNoise2D(seed + 211, { scale: 3.4 }) // inland-sea field

  const earth = []
  for (const t of tiles.values()) if (t.band === 'earth') earth.push(t)

  for (const t of earth) {
    const px = t.x / PR
    const py = t.y / PR
    const s = px * ux + py * uy
    const rad = Math.hypot(px, py) // 0 at the palace, ~1 at Earth's rim
    const lat = Math.abs(py)       // 0 at the equator, ~1 at the poles

    // Continent boundary wobble, damped to zero at the centre so the palace is
    // always solidly inside the Old World.
    const cn = contN(px * 8, py * 8)
    const s2 = s + SPLIT_WOBBLE * (2 * cn - 1) * Math.min(1, rad * 2.2)

    const rn = rimN(px * 8 + 50, py * 8 + 50)
    const rimSea = rad + 0.30 * (2 * rn - 1) > RIM_SEA
    const inChannel = s2 >= OW_EDGE && s2 <= NW_EDGE

    if (rimSea || inChannel) {
      t.region = 'sea'
      t.terrain = 'ocean'
      t.seaKind = inChannel ? 'channel' : 'rim'
      continue
    }

    t.region = s2 < OW_EDGE ? 'old_world' : 'new_world'

    // Inland seas — irregular oceans that break up the continents (reduce landmass),
    // kept out of the immediate start area so the opening view isn't drowned.
    const seaField = seaN(px * 5 + 200, py * 5 + 200)
    const seaCut = t.region === 'old_world' ? INLAND_SEA_OLD : INLAND_SEA_NEW
    if (seaField > seaCut && t.d > LOCAL_RADIUS) {
      t.region = 'sea'
      t.terrain = 'ocean'
      t.seaKind = 'rim'
      continue
    }

    const e = elevN(px * 10, py * 10)
    const m = moistN(px * 9 + 30, py * 9 + 30)
    const c = climN(px * 7 + 80, py * 7 + 80)
    const pol = polarN(px * 6 + 120, py * 6 + 120)
    const ridge = 1 - Math.abs(2 * ridgeN(px * 14, py * 14) - 1)
    t.elev = e

    const tundraCut = TUNDRA_LAT + 0.10 * (2 * c - 1)
    const dryCut = 0.42 + 0.10 * (2 * c - 1)
    // Compress the moisture extremes so a dry seed isn't all desert and a wet one isn't all forest.
    const mc = 0.5 + (m - 0.5) * 0.7

    if (ridge > RIDGE_CUT && e > 0.42) t.terrain = 'mountain'
    else if (e > HILL_CUT) t.terrain = 'hills'
    else if (lat > tundraCut && pol > TUNDRA_CLUSTER) t.terrain = 'tundra'
    else if (lat < DESERT_LAT && mc < dryCut) t.terrain = 'desert'
    else if (mc > 0.56) t.terrain = 'forest'
    else t.terrain = 'plains'
  }

  scatterIslands(tiles, earth, rng)
  carveRivers(tiles, earth, rng)
  markCoasts(tiles, earth)
}

/**
 * Islands live in the CHANNEL — the wide ocean between the two continents —
 * not out in the rim sea, so crossing the divide has stepping stones.
 */
function scatterIslands(tiles, earth, rng) {
  const open = earth.filter(
    (t) => t.seaKind === 'channel' &&
      t.d > LOCAL_RADIUS && // never visible from the opening view
      neighbors(t.q, t.r).every((n) => {
        const o = tiles.get(key(n.q, n.r))
        return !o || !isLand(o.terrain)
      }),
  )
  shuffle(open, rng)
  const want = 5 + Math.floor(rng() * 3) // +2 more islands than before
  const placed = []
  for (const t of open) {
    if (placed.length >= want) break
    // Spacing 3 also guarantees no two islands end up adjacent — they read as
    // separate specks in open water, never as a clump.
    if (placed.some((p) => lengthOf(p.q - t.q, p.r - t.r) < 3)) continue
    t.region = 'island'
    t.terrain = 'island'
    placed.push(t)
  }
}

/**
 * Inland rivers: start on high ground and walk downhill, stamping water. Rivers
 * keep their continent `region` (they are part of the landmass, not the sea) so
 * the coast pass leaves them alone — and so they read as a ground-movement
 * barrier rather than as coastline.
 */
function carveRivers(tiles, earth, rng) {
  const want = 1 + Math.floor(rng() * 2) // 1..2 — they read as major features, not drainage
  const sources = earth.filter(
    (t) => isLand(t.terrain) && t.d >= 2 && t.d < BANDS.earth.max && t.elev > 0.55,
  )
  shuffle(sources, rng)

  const rivers = []
  for (const src of sources) {
    if (rivers.length >= want) break
    const path = []
    const seen = new Set()
    let cur = src
    for (let step = 0; step < 16; step++) {
      const k = key(cur.q, cur.r)
      if (seen.has(k)) break
      seen.add(k)
      if (cur.q === 0 && cur.r === 0) break   // never drown the palace
      if (isWater(cur.terrain)) break          // reached the sea or another river
      path.push(cur)

      let best = null
      let bestE = Infinity
      for (const n of neighbors(cur.q, cur.r)) {
        const o = tiles.get(key(n.q, n.r))
        if (!o || o.band !== 'earth') continue
        if (seen.has(key(o.q, o.r))) continue
        if (o.q === 0 && o.r === 0) continue
        // Water is the most attractive target (the river mouth); otherwise flow
        // to the lowest neighbour, with a jitter so channels meander.
        const h = isWater(o.terrain) ? -1 : o.elev + rng() * 0.07
        if (h < bestE) { bestE = h; best = o }
      }
      if (!best) break
      cur = best
    }
    if (path.length < 4) continue
    for (const t of path) t.terrain = 'river'
    rivers.push(path)
  }
  return rivers
}

/**
 * Water adjacent to CONTINENT land becomes shallow Coast. Islands deliberately
 * do not generate coast — a one-tile speck ringed by shallows reads wrong.
 */
function markCoasts(tiles, earth) {
  const CONTINENT = new Set(['old_world', 'new_world'])
  for (const t of earth) {
    if (t.region !== 'sea') continue
    const touchesLand = neighbors(t.q, t.r).some((n) => {
      const o = tiles.get(key(n.q, n.r))
      return o && CONTINENT.has(o.region) && isLand(o.terrain)
    })
    t.terrain = touchesLand ? 'coast' : 'ocean'
  }
}

// ---------------------------------------------------------------------------
// Space band — Moon, Mars, asteroids
// ---------------------------------------------------------------------------

function generateSpace(tiles, rng) {
  for (const t of tiles.values()) {
    if (t.band !== 'space') continue
    t.terrain = 'space'
    t.region = 'space'
  }

  const lc = pickOnRing(rng, BODIES.moon.dist)
  stampBody(tiles, lc, BODIES.moon.radius, 'moon', 'moon')
  const mc = pickOnRing(rng, BODIES.mars.dist)
  stampBody(tiles, mc, BODIES.mars.radius, 'mars', 'mars')
  const marsCenter = tiles.get(key(mc.q, mc.r))
  featureMoon(tiles, lc, rng)
  featureMars(tiles, marsCenter, rng)

  // Asteroids stay BEYOND the Moon, so the first two space stages are clean sky.
  const minAsteroid = BODIES.moon.dist + BODIES.moon.radius + 1
  const open = []
  for (const t of tiles.values()) {
    if (t.band !== 'space' || t.region !== 'space' || t.d < minAsteroid) continue
    if (!clearOfBodies(tiles, t)) continue // never hugging the Moon or Mars
    open.push(t)
  }
  shuffle(open, rng)
  scatterInto(open, [...Array(14).fill('asteroid')], 3, (t) => { t.region = 'asteroid' })

  return marsCenter
}

const BODY_REGIONS = new Set(['moon', 'mars', 'exoplanet', 'exomoon', 'mini_exo'])

/** True when no neighbour of this tile belongs to a celestial body. */
function clearOfBodies(tiles, t) {
  return neighbors(t.q, t.r).every((n) => {
    const o = tiles.get(key(n.q, n.r))
    return !o || !BODY_REGIONS.has(o.region)
  })
}

/** Exactly one crater somewhere on the Moon. */
function featureMoon(tiles, center, rng) {
  const cells = disc(center.q, center.r, BODIES.moon.radius)
    .map((h) => tiles.get(key(h.q, h.r))).filter(Boolean)
  if (!cells.length) return
  shuffle(cells, rng)[0].terrain = 'lunar_crater'
}

/**
 * Mars gets ice caps at its POLES and a few mountain ranges inland. "Pole" is
 * the extreme of the body's own local vertical, so the caps read as caps rather
 * than as scattered white tiles.
 */
function featureMars(tiles, center, rng) {
  const cells = disc(center.q, center.r, BODIES.mars.radius)
    .map((h) => tiles.get(key(h.q, h.r))).filter(Boolean)
  if (cells.length < 8) return
  const byLat = [...cells].sort((a, b) => (a.y - center.y) - (b.y - center.y))
  const caps = [...byLat.slice(0, 2), ...byLat.slice(-2)]
  for (const t of caps) t.terrain = 'mars_ice'

  const inland = shuffle(cells.filter((t) => t.terrain === 'mars'), rng)
  for (const t of inland.slice(0, 3)) t.terrain = 'mars_mountain'
}

const pickOnRing = (rng, dist) => {
  const r = ring(0, 0, dist)
  return r[Math.floor(rng() * r.length)]
}

function stampBody(tiles, center, radius, terrain, region) {
  for (const h of disc(center.q, center.r, radius)) {
    const t = tiles.get(key(h.q, h.r))
    if (!t) continue
    t.terrain = terrain
    t.region = region
  }
  return center
}

/** Drop a bag of terrains onto candidate tiles, keeping them `spacing` apart. */
function scatterInto(candidates, bag, spacing, after) {
  const placed = []
  for (const t of candidates) {
    if (!bag.length) break
    if (placed.some((p) => lengthOf(p.q - t.q, p.r - t.r) < spacing)) continue
    t.terrain = bag.pop()
    after?.(t)
    placed.push(t)
  }
  return placed
}

// ---------------------------------------------------------------------------
// Deep space + the exoplanet
// ---------------------------------------------------------------------------

function generateDeep(tiles, seed, rng) {
  for (const t of tiles.values()) {
    if (t.band !== 'deep') continue
    t.terrain = 'outer_space' // the space between Earth and the exoplanet (distinct from deep space)
    t.region = 'deep_space'
  }

  const c = pickOnRing(rng, BODIES.exoplanet.dist)
  const center = tiles.get(key(c.q, c.r))
  const RAD = BODIES.exoplanet.radius
  const elevN = makeNoise2D(seed + 71, { scale: 2.0 })
  const moistN = makeNoise2D(seed + 97, { scale: 2.4 })
  const seaN = makeNoise2D(seed + 113, { scale: 1.7 })
  const ridgeN = makeNoise2D(seed + 131, { scale: 1.5 })

  const cells = []
  for (const h of disc(center.q, center.r, RAD)) {
    const t = tiles.get(key(h.q, h.r))
    if (!t) continue
    t.region = 'exoplanet'
    const lq = h.q - center.q
    const lr = h.r - center.r
    const dd = lengthOf(lq, lr) / RAD
    const e = elevN(lq * 1.5 + 10, lr * 1.5 + 10)
    const m = moistN(lq * 1.5 + 40, lr * 1.5 + 40)
    const w = seaN(lq * 1.6 + 70, lr * 1.6 + 70)
    const ridge = 1 - Math.abs(2 * ridgeN(lq * 2.2, lr * 2.2) - 1)
    t.elev = e

    // Irregular inland seas and lakes — NOT a ring of water round the rim, and
    // the exoplanet is free to touch open space at its edge.
    if (w < 0.38) t.terrain = 'exosea'
    else if (ridge > 0.93 && e > 0.45) t.terrain = 'exomountain'
    else if (e > 0.62) t.terrain = 'exohills'
    else if (dd > 0.86) t.terrain = 'exotundra'
    else if (m < 0.28) t.terrain = 'exodesert'
    else t.terrain = 'exoplains'
    cells.push(t)
  }

  connectExoLand(tiles, cells)

  // The exoplanet's moon always sits on its BACKSIDE — same bearing, further
  // out — so you always meet the planet before its moon.
  const bearing = Math.atan2(center.y, center.x)
  const md = BODIES.exomoon.dist
  const moonRing = ring(0, 0, md)
  let best = moonRing[0]
  let bestDa = Infinity
  for (const h of moonRing) {
    const t = tiles.get(key(h.q, h.r))
    let da = Math.abs(Math.atan2(t.y, t.x) - bearing)
    if (da > Math.PI) da = 2 * Math.PI - da
    if (da < bestDa) { bestDa = da; best = h }
  }
  stampBody(tiles, best, BODIES.exomoon.radius, 'exomoon', 'exomoon')

  // A SECOND exomoon ADJACENT to the exoplanet — touching it without overlapping —
  // and clear of the first moon.
  const R = BODIES.exomoon.radius
  const near = []
  for (const t of tiles.values()) {
    if (t.band !== 'deep' || t.region === 'exoplanet' || t.region === 'exomoon') continue
    const cells = disc(t.q, t.r, R)
    if (cells.some((h) => tiles.get(key(h.q, h.r))?.region === 'exoplanet')) continue // no overlap
    const touches = cells.some((h) => neighbors(h.q, h.r).some((n) => tiles.get(key(n.q, n.r))?.region === 'exoplanet'))
    if (!touches) continue
    if (lengthOf(t.q - best.q, t.r - best.r) < R + 3) continue // clear of the first moon
    near.push(t)
  }
  if (near.length) stampBody(tiles, near[Math.floor(rng() * near.length)], R, 'exomoon', 'exomoon')

  return center
}

/**
 * A few SMALL, moonless exoplanets scattered through deep space — a fraction the
 * size of the main exoplanet, so there is more to reach out there.
 */
function scatterMiniExoplanets(tiles, exoCenter, seed, rng) {
  const elevN = makeNoise2D(seed + 301, { scale: 2.2 })
  const moistN = makeNoise2D(seed + 317, { scale: 2.6 })
  const seaN = makeNoise2D(seed + 331, { scale: 1.9 })
  const ridgeN = makeNoise2D(seed + 349, { scale: 1.7 })
  const shapeN = makeNoise2D(seed + 367, { scale: 2.4 })
  const want = 3
  const placed = []
  const cands = []
  for (const t of tiles.values()) {
    if (t.band !== 'deep') continue
    if (t.region === 'exoplanet' || t.region === 'exomoon' || t.region === 'mini_exo') continue
    if (lengthOf(t.q - exoCenter.q, t.r - exoCenter.r) < 12) continue // well clear of the main exoplanet
    cands.push(t)
  }
  shuffle(cands, rng)
  for (const c of cands) {
    if (placed.length >= want) break
    const rad = 2 + Math.floor(rng() * 2) // 2..3 — bigger than before, still a fraction of the main (5)
    const strange = rng() < 0.5    // half get an irregular, non-disc outline
    const halo = disc(c.q, c.r, rad + 1)
    if (halo.some((h) => { const o = tiles.get(key(h.q, h.r)); return o && (BODY_REGIONS.has(o.region) || o.region === 'exoplanet') })) continue
    if (placed.some((p) => lengthOf(p.q - c.q, p.r - c.r) < rad + 8)) continue
    for (const h of disc(c.q, c.r, rad)) {
      const t = tiles.get(key(h.q, h.r)); if (!t) continue
      const lq = h.q - c.q, lr = h.r - c.r
      const dd = lengthOf(lq, lr) / rad
      if (strange && dd > 0.45 && shapeN(h.q * 1.4, h.r * 1.4) < 0.45) continue // bite chunks out of the edge
      const e = elevN(lq * 1.6 + 10, lr * 1.6 + 10)
      const m = moistN(lq * 1.6 + 40, lr * 1.6 + 40)
      const w = seaN(lq * 1.7 + 70, lr * 1.7 + 70)
      const ridge = 1 - Math.abs(2 * ridgeN(lq * 2.4, lr * 2.4) - 1)
      t.region = 'mini_exo' // own region so it doesn't break the main-exoplanet invariants
      if (w < 0.34) t.terrain = 'exosea'
      else if (ridge > 0.92 && e > 0.45) t.terrain = 'exomountain'
      else if (e > 0.62) t.terrain = 'exohills'
      else if (dd > 0.85) t.terrain = 'exotundra'
      else if (m < 0.28) t.terrain = 'exodesert'
      else t.terrain = 'exoplains'
    }
    placed.push(c)
  }
  return placed
}

/**
 * The exoplanet's landmass must be a single connected component (its water can
 * be as strange as it likes). Rather than re-rolling on every disconnection,
 * bridge the stragglers: walk from each orphan component to the main one and
 * convert the water in between to land.
 */
function connectExoLand(tiles, cells) {
  const inExo = new Set(cells.map((t) => key(t.q, t.r)))
  const landOf = (t) => t && isLand(t.terrain) && inExo.has(key(t.q, t.r))

  const components = () => {
    const seen = new Set()
    const out = []
    for (const t of cells) {
      const k = key(t.q, t.r)
      if (!landOf(t) || seen.has(k)) continue
      const comp = []
      const stack = [t]
      seen.add(k)
      while (stack.length) {
        const c = stack.pop()
        comp.push(c)
        for (const n of neighbors(c.q, c.r)) {
          const nk = key(n.q, n.r)
          const o = tiles.get(nk)
          if (!landOf(o) || seen.has(nk)) continue
          seen.add(nk)
          stack.push(o)
        }
      }
      out.push(comp)
    }
    return out
  }

  for (let guard = 0; guard < 12; guard++) {
    const comps = components()
    if (comps.length <= 1) return
    comps.sort((a, b) => b.length - a.length)
    const main = new Set(comps[0].map((t) => key(t.q, t.r)))
    const orphan = comps[1]

    const prev = new Map()
    const queue = []
    for (const t of orphan) {
      prev.set(key(t.q, t.r), null)
      queue.push(t)
    }
    let hit = null
    for (let i = 0; i < queue.length && !hit; i++) {
      const c = queue[i]
      for (const n of neighbors(c.q, c.r)) {
        const nk = key(n.q, n.r)
        if (prev.has(nk) || !inExo.has(nk)) continue
        const o = tiles.get(nk)
        prev.set(nk, key(c.q, c.r))
        if (main.has(nk)) { hit = o; break }
        queue.push(o)
      }
    }
    if (!hit) return
    let cur = prev.get(key(hit.q, hit.r))
    while (cur) {
      const t = tiles.get(cur)
      if (t && isWater(t.terrain)) t.terrain = 'exoplains'
      cur = prev.get(cur)
    }
  }
}

// ---------------------------------------------------------------------------
// Outer specials — spread through deep space AND the galactic band
// ---------------------------------------------------------------------------

/**
 * Planets, stars, singularities and asteroids are scattered across the WHOLE
 * outer world rather than ringed at its edge, so the far map does not read as a
 * band of empties with treasure round the rim.
 *
 * They deliberately avoid the exoplanet corridor: everything outside it stays
 * dark until "Outer Galaxy I", which is what keeps them a surprise.
 */
function generateOuterSpecials(tiles, rng, inCorridor) {
  const open = []
  for (const t of tiles.values()) {
    if (t.band === 'galactic' && t.region !== 'exoplanet' && t.region !== 'mini_exo') { t.region = 'galactic'; t.terrain = 'deep_space' }
    if (t.band !== 'deep' && t.band !== 'galactic') continue
    // Leave the outermost revealable ring featureless so the map edge reads clean.
    if (t.d > MAX_REVEAL_RADIUS - FEATURELESS_OUTER_RINGS) continue
    if (t.region === 'exoplanet' || t.region === 'mini_exo') continue
    if (inCorridor(t)) continue
    if (!clearOfBodies(tiles, t)) continue
    open.push(t)
  }
  shuffle(open, rng)
  scatterInto(
    open,
    [
      ...Array(16).fill('planet'),
      ...Array(9).fill('star'),
      ...Array(5).fill('singularity'),
      ...Array(22).fill('asteroid'),
    ],
    3,
  )
}

// ---------------------------------------------------------------------------
// Repair + encampments + reveal
// ---------------------------------------------------------------------------

function repairStart(tiles, rng) {
  const at = (q, r) => tiles.get(key(q, r))

  const home = at(0, 0)
  home.region = 'old_world'
  home.terrain = 'plains'
  for (const n of neighbors(0, 0)) {
    const t = at(n.q, n.r)
    t.region = 'old_world'
    if (!isLand(t.terrain) || !isPassable(t.terrain)) t.terrain = 'plains'
  }

  // The palace is a city, so its yield radius (the tile + its 6 neighbours) MUST
  // hold both a food tile and a gold tile or the opening economy is dead (v4
  // design §2). The palace tile is plains → food is covered; guarantee gold by
  // making one neighbour hills if none of the radius yields any.
  const palaceRadius = disc(0, 0, 1).map((h) => at(h.q, h.r)).filter(Boolean)
  if (!palaceRadius.some((t) => terrainOf(t.terrain).yields.gold > 0)) {
    const cand = palaceRadius.find((t) => t.d === 1 && isLand(t.terrain) && isPassable(t.terrain))
    if (cand) cand.terrain = 'hills'
  }
  if (!palaceRadius.some((t) => terrainOf(t.terrain).yields.food > 0)) {
    const cand = palaceRadius.find((t) => t.d === 1 && isLand(t.terrain) && isPassable(t.terrain) && terrainOf(t.terrain).yields.gold === 0)
    if (cand) cand.terrain = 'plains'
  }

  // Local-view guarantees. The opening screen must not read as a wasteland, and
  // should show at least one mountain so the terrain looks varied from turn one.
  // Runs BEFORE the yield `ensure` pass below, so anything it breaks gets fixed.
  const local = disc(0, 0, LOCAL_RADIUS).map((h) => at(h.q, h.r)).filter(Boolean)
  const dry = shuffle(local.filter((t) => t.terrain === 'desert' || t.terrain === 'tundra'), rng)
  while (dry.length > MAX_LOCAL_DRY) dry.pop().terrain = 'plains'
  if (!local.some((t) => t.terrain === 'mountain')) {
    // Never on the palace ring — that has to stay passable.
    const cands = local.filter((t) => t.d >= 2 && isLand(t.terrain) && isPassable(t.terrain))
    if (cands.length) cands[Math.floor(rng() * cands.length)].terrain = 'mountain'
  }

  const near = disc(0, 0, 5).map((h) => at(h.q, h.r)).filter(Boolean)
  const ensure = (terrain, test) => {
    if (near.some(test)) return
    const cands = near.filter((t) => t.d >= 2 && t.d <= 5 && isLand(t.terrain) && isPassable(t.terrain))
    if (!cands.length) return
    cands[Math.floor(rng() * cands.length)].terrain = terrain
  }
  ensure('plains', (t) => t.terrain === 'plains')
  ensure('forest', (t) => t.terrain === 'forest')
  ensure('hills', (t) => t.terrain === 'hills')

  if (!near.some((t) => isWater(t.terrain))) {
    const cands = near.filter((t) => t.d === 5)
    if (cands.length) {
      const pick = cands[Math.floor(rng() * cands.length)]
      pick.region = 'sea'
      pick.seaKind = 'rim'
      pick.terrain = 'coast'
    }
  }
}

/**
 * Every Old World land tile must be walkable from the palace — territory you
 * cannot expand into is dead space. Mountains and rivers (and, rarely, a strait)
 * can cut a pocket off, so rather than re-rolling we BRIDGE it: BFS from each
 * orphaned pocket back to the reachable mass and convert whatever blocks the
 * shortest way (mountain -> hills, water -> plains). Because BFS takes the
 * shortest path it naturally crosses at the thinnest point, reading as a pass or
 * a ford rather than a bulldozed corridor.
 */
function connectOldWorldLand(tiles) {
  const home = tiles.get(key(0, 0))
  const walkable = (t) => !!t && t.region === 'old_world' && isLand(t.terrain) && isPassable(t.terrain)
  const all = [...tiles.values()].filter(walkable)

  for (let guard = 0; guard < 24; guard++) {
    const seen = new Set([key(0, 0)])
    const stack = [home]
    while (stack.length) {
      const t = stack.pop()
      for (const n of neighbors(t.q, t.r)) {
        const nk = key(n.q, n.r)
        if (seen.has(nk)) continue
        const o = tiles.get(nk)
        if (!walkable(o)) continue
        seen.add(nk)
        stack.push(o)
      }
    }
    const orphans = all.filter((t) => !seen.has(key(t.q, t.r)))
    if (!orphans.length) return

    const prev = new Map()
    const queue = []
    for (const t of orphans) {
      prev.set(key(t.q, t.r), null)
      queue.push(t)
    }
    let hit = null
    for (let i = 0; i < queue.length && !hit; i++) {
      const c = queue[i]
      for (const n of neighbors(c.q, c.r)) {
        const nk = key(n.q, n.r)
        if (prev.has(nk)) continue
        const o = tiles.get(nk)
        if (!o || o.band !== 'earth') continue
        prev.set(nk, key(c.q, c.r))
        if (seen.has(nk)) { hit = o; break }
        queue.push(o)
      }
    }
    if (!hit) return

    let cur = prev.get(key(hit.q, hit.r))
    while (cur) {
      const t = tiles.get(cur)
      if (t && !walkable(t)) {
        t.terrain = t.terrain === 'mountain' ? 'hills' : 'plains'
        t.region = 'old_world'
        t.seaKind = null
      }
      cur = prev.get(cur)
    }
  }
}

/**
 * Enemy encampments: uncleared bases that add units to every wave until your
 * borders reach them. LAND ONLY — Earth's continents/islands and the exoplanet.
 * The Moon, Mars, asteroids and open space stay clear.
 */
function placeEncampments(tiles, rng, marsCenter) {
  const LAND_REGIONS = new Set(['old_world', 'new_world', 'island'])
  const eligible = (t) => isLand(t.terrain) && isPassable(t.terrain)

  const earthCands = []
  const exoCands = []
  const localCands = []
  for (const t of tiles.values()) {
    if (!eligible(t)) continue
    // Exactly one camp sits inside the opening view — close enough to teach the
    // clear-by-expanding mechanic in the first few expansions. Kept off the
    // palace ring so it is a short march rather than a free gift.
    if (LAND_REGIONS.has(t.region) && t.d >= 2 && t.d <= LOCAL_RADIUS) localCands.push(t)
    else if (LAND_REGIONS.has(t.region) && t.d >= ENCAMPMENT_MIN_DIST) earthCands.push(t)
    else if (t.region === 'exoplanet') exoCands.push(t)
  }

  const placed = []
  const tryPlace = (t) => {
    if (t.encampment) return false
    if (placed.some((p) => lengthOf(p.q - t.q, p.r - t.r) < ENCAMPMENT_SPACING)) return false
    t.encampment = { level: 1 + Math.floor(t.d / 8) }
    placed.push(t)
    return true
  }

  const local = shuffle(localCands, rng)[0]
  if (local) tryPlace(local)

  const byWedge = Array.from({ length: 6 }, () => [])
  for (const t of shuffle(earthCands, rng)) byWedge[t.wedge].push(t)
  for (const w of byWedge) w.sort((a, b) => a.d - b.d)

  // ONE per wedge on Earth. Every revealed camp fields a garrison in every
  // wave, so a dozen of them inside the Old World turned the classical eras into
  // a siege you could not answer. Six plus the local one is enough to point in
  // every direction and still be clearable.
  for (let i = 0; i < EARTH_CAMPS_PER_WEDGE; i++) {
    for (let w = 0; w < 6; w++) {
      const spot = byWedge[w].find((t) => !t.encampment && tryPlace(t))
      if (spot) continue
    }
  }

  for (const t of shuffle(exoCands, rng)) {
    if (placed.filter((p) => p.region === 'exoplanet').length >= 4) break
    tryPlace(t)
  }

  // Mars is otherwise encampment-free, but its dead centre always holds one —
  // a fixed prize sitting in the middle of the red planet.
  if (marsCenter) {
    marsCenter.encampment = { level: 1 + Math.floor(marsCenter.d / 8) }
    placed.push(marsCenter)
  }
  return placed
}

/**
 * Stamp each tile with the reveal stage that first makes it visible.
 *
 * Three shapes:
 *  - Earth's stages are REGION-shaped (Old World → islands → the New World's
 *    coast → its interior)
 *  - most off-Earth stages are CONCENTRIC (see REVEAL_RADIUS)
 *  - the two exoplanet stages are a CORRIDOR: a cone reaching out through deep
 *    space towards the exoplanet, leaving the rest of the far map dark
 */
function assignReveal(tiles, inCorridorAt, galaxyReach) {
  const at = (q, r) => tiles.get(key(q, r))
  const touches = (t, pred) => neighbors(t.q, t.r).some((n) => {
    const o = at(n.q, n.r)
    return o && pred(o)
  })

  const concentric = Object.keys(REVEAL_RADIUS).map(Number).sort((a, b) => a - b)

  for (const t of tiles.values()) {
    if (t.d <= LOCAL_RADIUS) { t.revealStage = STAGE.local; continue }

    if (t.band === 'earth') {
      // The Old World is charted in three outward steps before the rest of it.
      const oldish = t.region === 'old_world' ||
        (t.region === 'sea' && touches(t, (o) => o.region === 'old_world'))
      if (oldish) {
        t.revealStage = t.d <= NEARBY_RADIUS ? STAGE.nearby
          : t.d <= DISTANT_RADIUS ? STAGE.distant
            : STAGE.old_world
      }
      else if (t.region === 'island') t.revealStage = STAGE.islands
      else if (t.region === 'sea' && !touches(t, (o) => o.region === 'new_world')) t.revealStage = STAGE.islands
      // Making landfall: the coastal stage shows the waters AND the shore, so
      // "New World Coastline" actually shows you the new continent.
      else if (t.region === 'sea') t.revealStage = STAGE.new_coast
      else if (t.region === 'new_world' && touches(t, (o) => o.region === 'sea' || o.region === 'island')) {
        t.revealStage = STAGE.new_coast
      } else t.revealStage = STAGE.full_earth
      continue
    }

    // Whatever the concentric ladder already covers is settled first.
    const near = concentric.find((st) => t.d <= REVEAL_RADIUS[st])
    if (near !== undefined) { t.revealStage = near; continue }

    // Then the exoplanet, its moon, and the corridor out to them.
    if (t.region === 'exomoon') { t.revealStage = STAGE.full_exo; continue }
    if (t.region === 'exoplanet') {
      t.revealStage = t.d <= EXO_REACH[STAGE.exo_coast] ? STAGE.exo_coast : STAGE.full_exo
      continue
    }
    if (inCorridorAt(t, EXO_CORRIDOR.approach, EXO_REACH[STAGE.exo_coast])) {
      t.revealStage = STAGE.exo_coast
      continue
    }
    if (inCorridorAt(t, EXO_CORRIDOR.arrival, EXO_REACH[STAGE.full_exo])) {
      t.revealStage = STAGE.full_exo
      continue
    }

    if (t.d > MAX_REVEAL_RADIUS) { t.revealStage = Infinity; continue }
    // Outer Galaxy I is a smooth TEARDROP that swallows the corridor rather than
    // a disc it would poke out of; Full Map then rounds the world back out.
    t.revealStage = t.d <= galaxyReach(t) ? STAGE.galaxy1 : STAGE.full_map
  }
}

/**
 * Keep the known world CONTIGUOUS at every stage.
 *
 * sealReveal closes holes (unknown enclosed by known); this closes the opposite
 * failure — a fragment of known world floating free of the rest, cut off by
 * battlefield. Islands were the usual culprit: an island reveals with its stage
 * while the water around it waits for a later one, leaving a speck adrift.
 *
 * For each stage we find the component holding the palace and, for anything
 * else, pull the shortest connecting path into that stage.
 */
function connectReveal(tiles, list) {
  const home = tiles.get(key(0, 0))
  for (let s = 0; s < STAGE_COUNT; s++) {
    for (let guard = 0; guard < 24; guard++) {
      const known = list.filter((t) => t.revealStage <= s)
      if (!known.length) break

      const main = new Set([key(0, 0)])
      const stack = [home]
      while (stack.length) {
        const t = stack.pop()
        for (const n of neighbors(t.q, t.r)) {
          const nk = key(n.q, n.r)
          if (main.has(nk)) continue
          const o = tiles.get(nk)
          if (!o || o.revealStage > s) continue
          main.add(nk)
          stack.push(o)
        }
      }
      const orphans = known.filter((t) => !main.has(key(t.q, t.r)))
      if (!orphans.length) break

      const prev = new Map()
      const queue = []
      for (const t of orphans) {
        prev.set(key(t.q, t.r), null)
        queue.push(t)
      }
      let hit = null
      for (let i = 0; i < queue.length && !hit; i++) {
        const c = queue[i]
        for (const n of neighbors(c.q, c.r)) {
          const nk = key(n.q, n.r)
          if (prev.has(nk)) continue
          const o = tiles.get(nk)
          // Never route through the battlefield rings — they are never known.
          if (!o || o.revealStage === Infinity) continue
          prev.set(nk, key(c.q, c.r))
          if (main.has(nk)) { hit = o; break }
          queue.push(o)
        }
      }
      if (!hit) break

      let cur = prev.get(key(hit.q, hit.r))
      while (cur) {
        const t = tiles.get(cur)
        if (t && t.revealStage > s) t.revealStage = s
        cur = prev.get(cur)
      }
    }
  }
}

/**
 * Close any hole in the known set.
 *
 * Region- and corridor-shaped stages can enclose a pocket of not-yet-revealed
 * tiles. At every stage we flood the UNKNOWN region inward from the map's outer
 * rim; anything unknown the flood cannot reach is enclosed, and is pulled into
 * this stage.
 */
function sealReveal(tiles, list) {
  for (let s = 0; s < STAGE_COUNT; s++) {
    const reached = new Set()
    const stack = []
    for (const t of list) {
      if (t.d === MAX_RADIUS && t.revealStage > s) {
        reached.add(key(t.q, t.r))
        stack.push(t)
      }
    }
    while (stack.length) {
      const t = stack.pop()
      for (const n of neighbors(t.q, t.r)) {
        const nk = key(n.q, n.r)
        if (reached.has(nk)) continue
        const o = tiles.get(nk)
        if (!o || o.revealStage <= s) continue
        reached.add(nk)
        stack.push(o)
      }
    }
    for (const t of list) {
      if (t.revealStage > s && t.revealStage !== Infinity && !reached.has(key(t.q, t.r))) {
        t.revealStage = s
      }
    }
  }
}

// ---------------------------------------------------------------------------

export function buildWorld(seed) {
  const rng = makeRng(seed)
  const tiles = blankTiles()

  generateEarth(tiles, seed, rng)
  const marsCenter = generateSpace(tiles, rng)
  const exoCenter = generateDeep(tiles, seed, rng)
  scatterMiniExoplanets(tiles, exoCenter, seed, rng)

  // Cone test towards the exoplanet, shared by the reveal and the special-scatter.
  const exoAngle = Math.atan2(exoCenter.y, exoCenter.x)
  const inCorridorAt = (t, halfAngle, maxD) => {
    if (t.d > maxD || t.d <= BANDS.space.max) return false
    let da = Math.abs(Math.atan2(t.y, t.x) - exoAngle)
    if (da > Math.PI) da = 2 * Math.PI - da
    return da <= halfAngle
  }
  const inWidestCorridor = (t) =>
    inCorridorAt(t, EXO_CORRIDOR.arrival, EXO_REACH[STAGE.full_exo])

  // Smooth teardrop for "Outer Galaxy I": eases from `base` on the far side up
  // to `max` towards the exoplanet. The floor at the corridor's half-angle is a
  // safety net so a tuning change can never re-expose the spike.
  const smoothstep = (x) => x * x * (3 - 2 * x)
  const galaxyReach = (t) => {
    let da = Math.abs(Math.atan2(t.y, t.x) - exoAngle)
    if (da > Math.PI) da = 2 * Math.PI - da
    const w = smoothstep(Math.max(0, 1 - da / GALAXY_SHAPE.spread))
    const r = GALAXY_SHAPE.base + (GALAXY_SHAPE.max - GALAXY_SHAPE.base) * w
    return da <= EXO_CORRIDOR.arrival ? Math.max(r, EXO_REACH[STAGE.full_exo]) : r
  }

  generateOuterSpecials(tiles, rng, inWidestCorridor)
  repairStart(tiles, rng)
  connectOldWorldLand(tiles)
  const encampments = placeEncampments(tiles, rng, marsCenter)
  assignReveal(tiles, inCorridorAt, galaxyReach)

  const list = [...tiles.values()]
  // Contiguity first (it only ever adds tiles, so it cannot re-open a hole),
  // then hole-sealing.
  connectReveal(tiles, list)
  sealReveal(tiles, list)

  return {
    seed,
    tiles,
    list,
    palace: { q: 0, r: 0 },
    exoCenter,
    encampments,
    at: (q, r) => tiles.get(key(q, r)) ?? null,
    stats: summarize(list),
  }
}

function summarize(list) {
  const byTerrain = {}
  const byRegion = {}
  for (const t of list) {
    byTerrain[t.terrain] = (byTerrain[t.terrain] ?? 0) + 1
    byRegion[t.region] = (byRegion[t.region] ?? 0) + 1
  }
  return { total: list.length, byTerrain, byRegion }
}

/**
 * Generate a validated world. Re-rolls (deterministically, seed+n) until the
 * invariants pass, then returns the world with any residual violations attached
 * so callers/sims can see what was tolerated.
 */
export function generateWorld(seed) {
  let last = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const world = buildWorld((seed + attempt * 0x9e3779b9) >>> 0)
    const violations = validate(world)
    world.violations = violations
    world.attempt = attempt
    world.requestedSeed = seed
    if (!violations.length) return world
    last = world
  }
  return last
}
