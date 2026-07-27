// World generation (v3).
//
// `generateWorld(seed)` is a PURE function: same seed → same world, no React,
// no Math.random, no game state. A run persists only its seed.
//
// Shape of the world, outward from the palace at (0,0):
//   Earth      — a disc holding the Old World (which contains the palace), an
//                ocean channel, the New World, and islands
//   Space      — a band containing the Moon and Mars discs plus asteroids
//   Deep space — the "ocean" separating Earth from the exoplanet, which is its
//                own small round world embedded in the band
//   Galactic   — deep space scattered with planets, stars and singularities
//   Battlefield— the outermost 2 rings, where enemies muster
//
// Generation is constraint-based: build a candidate, repair what is cheap to
// repair, validate, and re-roll if it still violates an invariant (see
// invariants.js). That is what makes the map "varied but predictable".

import { key, disc, ring, neighbors, lengthOf, toPixel, wedgeOf, SQRT3 } from '../hex/coords.js'
import { makeRng, makeNoise2D, shuffle } from './noise.js'
import { BANDS, BODIES, MAX_RADIUS, bandAt, STAGE, LOCAL_RADIUS } from './regions.js'
import { TERRAIN, isPassable, isLand } from './terrain.js'
import { validate } from './invariants.js'

const MAX_ATTEMPTS = 16

// --- Earth shaping knobs -----------------------------------------------------
const OW_EDGE = 0.06   // split-axis value below which land is Old World
const NW_EDGE = 0.30   // ...above which land is New World (between = ocean channel)
const RIM_SEA = 0.80   // normalised radius past which Earth turns to open sea
const ENCAMPMENT_MIN_DIST = 6  // none closer than this to the palace
const ENCAMPMENT_SPACING = 4   // minimum gap between two encampments

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
        terrain: 'space',
        region: 'space',
        revealStage: STAGE.full_map,
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
  // sits across an ocean channel on the far side.
  const theta = rng() * Math.PI * 2
  const ux = Math.cos(theta)
  const uy = Math.sin(theta)
  const vx = -uy
  const vy = ux

  const contN = makeNoise2D(seed + 11, { scale: 5.5 })
  const rimN = makeNoise2D(seed + 23, { scale: 4.0 })
  const elevN = makeNoise2D(seed + 37, { scale: 3.2 })
  const moistN = makeNoise2D(seed + 53, { scale: 4.5 })

  const earth = []
  for (const t of tiles.values()) if (t.band === 'earth') earth.push(t)

  for (const t of earth) {
    const px = t.x / PR
    const py = t.y / PR
    const s = px * ux + py * uy
    const lat = Math.abs(px * vx + py * vy)
    const rad = Math.hypot(px, py)

    // Continent boundary wobble, damped to zero at the centre so the palace is
    // always solidly inside the Old World.
    const cn = contN(px * 8, py * 8)
    const wobble = 0.42 * (2 * cn - 1) * Math.min(1, rad * 2.2)
    const s2 = s + wobble

    const rn = rimN(px * 8 + 50, py * 8 + 50)
    const rimSea = rad + 0.18 * (2 * rn - 1) > RIM_SEA

    if (rimSea || (s2 >= OW_EDGE && s2 <= NW_EDGE)) {
      t.region = 'sea'
      t.terrain = 'ocean'
      continue
    }

    t.region = s2 < OW_EDGE ? 'old_world' : 'new_world'

    const e = elevN(px * 10, py * 10)
    const m = moistN(px * 9 + 30, py * 9 + 30)
    if (e > 0.70) t.terrain = 'mountain'
    else if (e > 0.575) t.terrain = 'hills'
    else if (lat > 0.70) t.terrain = 'tundra'
    else if (m < 0.33) t.terrain = 'desert'
    else if (m > 0.55) t.terrain = 'forest'
    else t.terrain = 'plains'
  }

  scatterIslands(tiles, earth, rng)
  markCoasts(tiles, earth)
}

/** Small island clusters out in open water (never hugging a continent). */
function scatterIslands(tiles, earth, rng) {
  const open = earth.filter(
    (t) => t.region === 'sea' && neighbors(t.q, t.r).every((n) => {
      const o = tiles.get(key(n.q, n.r))
      return !o || !isLand(o.terrain)
    }),
  )
  shuffle(open, rng)
  const want = 5 + Math.floor(rng() * 4)
  let made = 0
  const placed = []
  for (const t of open) {
    if (made >= want) break
    if (placed.some((p) => lengthOf(p.q - t.q, p.r - t.r) < 3)) continue
    t.region = 'island'
    t.terrain = 'island'
    placed.push(t)
    made++
    // occasionally a two-tile island
    if (rng() < 0.4) {
      const ns = shuffle(neighbors(t.q, t.r), rng)
      for (const n of ns) {
        const o = tiles.get(key(n.q, n.r))
        if (o && o.band === 'earth' && o.region === 'sea') {
          o.region = 'island'
          o.terrain = 'island'
          break
        }
      }
    }
  }
}

/** Water adjacent to any land becomes shallow Coast; the rest stays Ocean. */
function markCoasts(tiles, earth) {
  for (const t of earth) {
    if (t.region !== 'sea') continue
    const touchesLand = neighbors(t.q, t.r).some((n) => {
      const o = tiles.get(key(n.q, n.r))
      return o && o.band === 'earth' && isLand(o.terrain)
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

  // Moon and Mars sit on the same ring, kept well apart angularly.
  const r = ring(0, 0, BODIES.moon.dist)
  const i1 = Math.floor(rng() * r.length)
  const i2 = (i1 + Math.floor(r.length * (0.28 + rng() * 0.44))) % r.length

  stampBody(tiles, r[i1], BODIES.moon.radius, 'moon', 'moon')
  stampBody(tiles, r[i2], BODIES.mars.radius, 'mars', 'mars')

  // Asteroids scattered through open space.
  const open = []
  for (const t of tiles.values()) if (t.band === 'space' && t.region === 'space') open.push(t)
  shuffle(open, rng)
  const want = 10 + Math.floor(rng() * 6)
  const placed = []
  for (const t of open) {
    if (placed.length >= want) break
    if (placed.some((p) => lengthOf(p.q - t.q, p.r - t.r) < 3)) continue
    t.terrain = 'asteroid'
    t.region = 'asteroid'
    placed.push(t)
  }
}

function stampBody(tiles, center, radius, terrain, region) {
  for (const h of disc(center.q, center.r, radius)) {
    const t = tiles.get(key(h.q, h.r))
    if (!t) continue
    t.terrain = terrain
    t.region = region
  }
}

// ---------------------------------------------------------------------------
// Deep space + the exoplanet
// ---------------------------------------------------------------------------

function generateDeep(tiles, seed, rng) {
  for (const t of tiles.values()) {
    if (t.band !== 'deep') continue
    t.terrain = 'deep_space'
    t.region = 'deep_space'
  }

  const r = ring(0, 0, BODIES.exoplanet.dist)
  const center = r[Math.floor(rng() * r.length)]
  const RAD = BODIES.exoplanet.radius
  const elevN = makeNoise2D(seed + 71, { scale: 2.2 })

  for (const h of disc(center.q, center.r, RAD)) {
    const t = tiles.get(key(h.q, h.r))
    if (!t) continue
    t.region = 'exoplanet'
    const dd = lengthOf(h.q - center.q, h.r - center.r) / RAD
    const e = elevN((h.q - center.q) * 1.4 + 10, (h.r - center.r) * 1.4 + 10)
    if (dd > 0.82 || e < 0.28) t.terrain = 'exosea'
    else if (e > 0.74) t.terrain = 'exomountain'
    else if (e > 0.56) t.terrain = 'exohills'
    else t.terrain = 'exoplains'
  }
}

// ---------------------------------------------------------------------------
// Outer galaxy + battlefield
// ---------------------------------------------------------------------------

function generateGalactic(tiles, rng) {
  const open = []
  for (const t of tiles.values()) {
    if (t.band !== 'galactic') continue
    t.terrain = 'deep_space'
    t.region = 'galactic'
    open.push(t)
  }
  shuffle(open, rng)

  const specials = [
    ...Array(8).fill('planet'),
    ...Array(5).fill('star'),
    ...Array(3).fill('singularity'),
  ]
  const placed = []
  for (const t of open) {
    if (!specials.length) break
    if (placed.some((p) => lengthOf(p.q - t.q, p.r - t.r) < 3)) continue
    t.terrain = specials.pop()
    placed.push(t)
  }
}

function generateBattlefield(tiles) {
  for (const t of tiles.values()) {
    if (t.band !== 'battlefield') continue
    t.terrain = 'battlefield'
    t.region = 'battlefield'
  }
}

// ---------------------------------------------------------------------------
// Repair + encampments + reveal
// ---------------------------------------------------------------------------

/**
 * Cheap fixes applied before validation: the palace and its ring must be open
 * buildable land, and the opening radius must contain at least one of each
 * Earth yield so no start is economically dead.
 */
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

  // Guarantee one of each yield-bearing Earth terrain near the start.
  const near = []
  for (const h of disc(0, 0, 5)) {
    const t = at(h.q, h.r)
    if (t) near.push(t)
  }
  const ensure = (terrain, test) => {
    if (near.some(test)) return
    const cands = near.filter((t) => t.d >= 2 && t.d <= 5 && isLand(t.terrain) && isPassable(t.terrain))
    if (!cands.length) return
    const pick = cands[Math.floor(rng() * cands.length)]
    pick.terrain = terrain
  }
  ensure('plains', (t) => t.terrain === 'plains')
  ensure('forest', (t) => t.terrain === 'forest')
  ensure('hills', (t) => t.terrain === 'hills')

  // Water within reach: convert the outermost near-tile if the start is landlocked.
  if (!near.some((t) => t.terrain === 'coast' || t.terrain === 'ocean')) {
    const cands = near.filter((t) => t.d === 5)
    if (cands.length) {
      const pick = cands[Math.floor(rng() * cands.length)]
      pick.region = 'sea'
      pick.terrain = 'coast'
    }
  }
}

/**
 * Enemy encampments: uncleared bases that add units to every wave until your
 * borders reach them. Spread across all 6 wedges so no approach is free, and
 * kept clear of the opening radius.
 */
function placeEncampments(tiles, rng) {
  const cands = []
  for (const t of tiles.values()) {
    if (t.band === 'battlefield') continue
    if (t.d < ENCAMPMENT_MIN_DIST) continue
    if (!isPassable(t.terrain)) continue
    cands.push(t)
  }

  // Round-robin over wedges so the angular spread is guaranteed, not hoped for.
  const byWedge = Array.from({ length: 6 }, () => [])
  for (const t of shuffle(cands, rng)) byWedge[t.wedge].push(t)
  for (const w of byWedge) w.sort((a, b) => a.d - b.d)

  const placed = []
  const perWedge = 5
  for (let i = 0; i < perWedge; i++) {
    for (let w = 0; w < 6; w++) {
      const pool = byWedge[w]
      const spot = pool.find(
        (t) => !t.encampment && placed.every((p) => lengthOf(p.q - t.q, p.r - t.r) >= ENCAMPMENT_SPACING),
      )
      if (!spot) continue
      // Level scales with how far out it sits.
      spot.encampment = { level: 1 + Math.floor(spot.d / 8) }
      placed.push(spot)
    }
  }
  return placed
}

/** Stamp each tile with the reveal stage that first makes it visible. */
function assignReveal(tiles) {
  const at = (q, r) => tiles.get(key(q, r))
  const touches = (t, pred) => neighbors(t.q, t.r).some((n) => {
    const o = at(n.q, n.r)
    return o && pred(o)
  })

  for (const t of tiles.values()) {
    let stage

    if (t.d <= LOCAL_RADIUS) {
      stage = STAGE.local
    } else if (t.band === 'earth') {
      if (t.region === 'old_world') stage = STAGE.old_world
      else if (t.region === 'sea' && touches(t, (o) => o.region === 'old_world')) stage = STAGE.old_world
      else if (t.region === 'island') stage = STAGE.islands
      else if (t.region === 'sea' && !touches(t, (o) => o.region === 'new_world')) stage = STAGE.islands
      else if (t.region === 'sea') stage = STAGE.new_coast
      else if (t.region === 'new_world' && touches(t, (o) => o.region === 'sea' || o.region === 'island')) stage = STAGE.new_coast
      else stage = STAGE.full_earth
    } else if (t.band === 'space') {
      if (t.region === 'moon') stage = STAGE.moon
      else if (t.region === 'mars' || t.region === 'asteroid') stage = STAGE.mars
      else stage = STAGE.space
    } else if (t.band === 'deep') {
      if (t.region === 'exoplanet') {
        stage = t.terrain === 'exosea' || touches(t, (o) => o.terrain === 'exosea')
          ? STAGE.exo_coast
          : STAGE.full_exo
      } else {
        stage = STAGE.deep
      }
    } else if (t.band === 'galactic') {
      const mid = (BANDS.galactic.min + BANDS.galactic.max) / 2
      stage = t.d <= mid ? STAGE.galaxy1 : STAGE.full_map
    } else {
      stage = STAGE.full_map
    }

    t.revealStage = stage
  }
}

// ---------------------------------------------------------------------------

function buildWorld(seed) {
  const rng = makeRng(seed)
  const tiles = blankTiles()

  generateEarth(tiles, seed, rng)
  generateSpace(tiles, rng)
  generateDeep(tiles, seed, rng)
  generateGalactic(tiles, rng)
  generateBattlefield(tiles)
  repairStart(tiles, rng)
  const encampments = placeEncampments(tiles, rng)
  assignReveal(tiles)

  const list = [...tiles.values()]
  return {
    seed,
    tiles,
    list,
    palace: { q: 0, r: 0 },
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

export { TERRAIN }
