// World generation (v3).
//
// `generateWorld(seed)` is a PURE function: same seed → same world, no React,
// no Math.random, no game state. A run persists only its seed.
//
// Shape of the world, outward from the palace at (0,0):
//   Earth      — a disc holding the Old World (which contains the palace), an
//                ocean channel, the New World, islands and inland rivers
//   Space      — a band containing the Moon and Mars discs plus asteroids
//   Deep space — the "ocean" separating Earth from the exoplanet, which is its
//                own small world embedded in the band
//   Galactic   — deep space littered throughout with planets, stars, singularities
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
  BANDS, BODIES, MAX_RADIUS, MAX_REVEAL_RADIUS, REVEAL_RADIUS,
  bandAt, STAGE, STAGE_COUNT, LOCAL_RADIUS,
} from './regions.js'
import { isPassable, isLand, isWater } from './terrain.js'
import { validate } from './invariants.js'

const MAX_ATTEMPTS = 16

// --- Earth shaping knobs -----------------------------------------------------
const OW_EDGE = 0.02    // split-axis value below which land is Old World
const NW_EDGE = 0.28    // ...above which land is New World (between = ocean channel)
const RIM_SEA = 0.88    // normalised radius past which Earth TENDS to open sea.
                        // Deliberately loose + noisy: land reaching the rim is fine.
const RIDGE_CUT = 0.96  // ridged-noise threshold for mountains — high, so ranges
                        // come out as sparse lines rather than blobs
const HILL_CUT = 0.60

const ENCAMPMENT_MIN_DIST = 6
const ENCAMPMENT_SPACING = 3

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
  // sits across an ocean channel on the far side.
  const theta = rng() * Math.PI * 2
  const ux = Math.cos(theta)
  const uy = Math.sin(theta)

  const contN = makeNoise2D(seed + 11, { scale: 5.5 })
  const rimN = makeNoise2D(seed + 23, { scale: 4.0 })
  const elevN = makeNoise2D(seed + 37, { scale: 3.2 })
  const moistN = makeNoise2D(seed + 53, { scale: 4.5 })
  const climN = makeNoise2D(seed + 67, { scale: 3.6 })
  // Separate, higher-frequency field for mountains. Ridged noise (1 - |2n-1|)
  // peaks along the field's mid-contour, so a high cut yields thin RIDGELINES
  // instead of the blobs a plain elevation threshold produces.
  const ridgeN = makeNoise2D(seed + 89, { scale: 2.1 })

  const earth = []
  for (const t of tiles.values()) if (t.band === 'earth') earth.push(t)

  for (const t of earth) {
    const px = t.x / PR
    const py = t.y / PR
    const s = px * ux + py * uy
    const rad = Math.hypot(px, py) // 0 at the palace, ~1 at Earth's rim

    // Continent boundary wobble, damped to zero at the centre so the palace is
    // always solidly inside the Old World.
    const cn = contN(px * 8, py * 8)
    const wobble = 0.42 * (2 * cn - 1) * Math.min(1, rad * 2.2)
    const s2 = s + wobble

    const rn = rimN(px * 8 + 50, py * 8 + 50)
    const rimSea = rad + 0.30 * (2 * rn - 1) > RIM_SEA

    if (rimSea || (s2 >= OW_EDGE && s2 <= NW_EDGE)) {
      t.region = 'sea'
      t.terrain = 'ocean'
      continue
    }

    t.region = s2 < OW_EDGE ? 'old_world' : 'new_world'

    const e = elevN(px * 10, py * 10)
    const m = moistN(px * 9 + 30, py * 9 + 30)
    const c = climN(px * 7 + 80, py * 7 + 80)
    const ridge = 1 - Math.abs(2 * ridgeN(px * 14, py * 14) - 1)
    t.elev = e

    // Climate is CONCENTRIC on a radial map: an arid belt through the middle,
    // tundra out towards the rim. Both boundaries are noise-wobbled.
    const tundraEdge = 0.70 + 0.13 * (2 * c - 1)
    const aridEdge = 0.58
    const dryCut = 0.50 + 0.12 * (2 * c - 1)

    if (ridge > RIDGE_CUT && e > 0.42) t.terrain = 'mountain'
    else if (e > HILL_CUT) t.terrain = 'hills'
    else if (rad > tundraEdge) t.terrain = 'tundra'
    else if (rad < aridEdge && m < dryCut) t.terrain = 'desert'
    else if (m > 0.54) t.terrain = 'forest'
    else t.terrain = 'plains'
  }

  scatterIslands(tiles, earth, rng)
  carveRivers(tiles, earth, rng)
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
  const want = 4 + Math.floor(rng() * 4)
  const placed = []
  for (const t of open) {
    if (placed.length >= want) break
    if (placed.some((p) => lengthOf(p.q - t.q, p.r - t.r) < 3)) continue
    t.region = 'island'
    t.terrain = 'island'
    placed.push(t)
    if (rng() < 0.4) {
      for (const n of shuffle(neighbors(t.q, t.r), rng)) {
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

/**
 * Inland rivers: start on high ground and walk downhill, stamping water. Rivers
 * keep their continent `region` (they are part of the landmass, not the sea) so
 * the coast pass leaves them alone — and so they read as a ground-movement
 * barrier rather than as coastline.
 */
function carveRivers(tiles, earth, rng) {
  const want = 2 + Math.floor(rng() * 3) // 2..4
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

  stampBody(tiles, pickOnRing(rng, BODIES.moon.dist), BODIES.moon.radius, 'moon', 'moon')
  stampBody(tiles, pickOnRing(rng, BODIES.mars.dist), BODIES.mars.radius, 'mars', 'mars')

  const open = []
  for (const t of tiles.values()) if (t.band === 'space' && t.region === 'space') open.push(t)
  shuffle(open, rng)
  const want = 12 + Math.floor(rng() * 7)
  const placed = []
  for (const t of open) {
    if (placed.length >= want) break
    if (placed.some((p) => lengthOf(p.q - t.q, p.r - t.r) < 3)) continue
    t.terrain = 'asteroid'
    t.region = 'asteroid'
    placed.push(t)
  }
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

// ---------------------------------------------------------------------------
// Deep space + the exoplanet
// ---------------------------------------------------------------------------

function generateDeep(tiles, seed, rng) {
  for (const t of tiles.values()) {
    if (t.band !== 'deep') continue
    t.terrain = 'deep_space'
    t.region = 'deep_space'
  }

  const center = pickOnRing(rng, BODIES.exoplanet.dist)
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
    else if (dd > 0.72) t.terrain = 'exotundra'
    else if (m < 0.38) t.terrain = 'exodesert'
    else t.terrain = 'exoplains'
    cells.push(t)
  }

  connectExoLand(tiles, cells)
  return center
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

    // BFS from the orphan across the whole exoplanet until we touch the main
    // component, then convert the water along the way back into land.
    const prev = new Map()
    const queue = []
    for (const t of orphan) {
      const k = key(t.q, t.r)
      prev.set(k, null)
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
    if (!hit) return // nothing to bridge to; leave it (the invariant will catch it)
    let cur = prev.get(key(hit.q, hit.r))
    while (cur) {
      const t = tiles.get(cur)
      if (t && isWater(t.terrain)) t.terrain = 'exoplains'
      cur = prev.get(cur)
    }
  }
}

// ---------------------------------------------------------------------------
// Outer galaxy — specials littered through deep space, not ringing the edge
// ---------------------------------------------------------------------------

function generateGalactic(tiles, rng) {
  const open = []
  for (const t of tiles.values()) {
    if (t.band !== 'galactic') continue
    t.terrain = 'deep_space'
    t.region = 'galactic'
    if (t.d <= MAX_REVEAL_RADIUS) open.push(t)
  }
  shuffle(open, rng)

  const specials = [
    ...Array(14).fill('planet'),
    ...Array(8).fill('star'),
    ...Array(4).fill('singularity'),
  ]
  const placed = []
  for (const t of open) {
    if (!specials.length) break
    if (placed.some((p) => lengthOf(p.q - t.q, p.r - t.r) < 3)) continue
    t.terrain = specials.pop()
    placed.push(t)
  }
}

// ---------------------------------------------------------------------------
// Repair + encampments + reveal
// ---------------------------------------------------------------------------

/**
 * Cheap fixes before validation: the palace and its ring must be open buildable
 * land, and the opening radius must contain at least one of each Earth yield so
 * no start is economically dead.
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
      pick.terrain = 'coast'
    }
  }
}

/**
 * Enemy encampments: uncleared bases that add units to every wave until your
 * borders reach them. LAND ONLY — Earth's continents/islands and the exoplanet.
 * The Moon, Mars, asteroids and open space stay clear.
 *
 * Earth's are spread round-robin over the six wedges so no approach is free.
 */
function placeEncampments(tiles, rng) {
  const LAND_REGIONS = new Set(['old_world', 'new_world', 'island'])
  const eligible = (t) => isLand(t.terrain) && isPassable(t.terrain)

  const earthCands = []
  const exoCands = []
  for (const t of tiles.values()) {
    if (!eligible(t)) continue
    if (LAND_REGIONS.has(t.region) && t.d >= ENCAMPMENT_MIN_DIST) earthCands.push(t)
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

  const byWedge = Array.from({ length: 6 }, () => [])
  for (const t of shuffle(earthCands, rng)) byWedge[t.wedge].push(t)
  for (const w of byWedge) w.sort((a, b) => a.d - b.d)

  const perWedge = 3
  for (let i = 0; i < perWedge; i++) {
    for (let w = 0; w < 6; w++) {
      const spot = byWedge[w].find((t) => !t.encampment && tryPlaceable(t, placed))
      if (spot) tryPlace(spot)
    }
  }

  for (const t of shuffle(exoCands, rng)) {
    if (placed.filter((p) => p.region === 'exoplanet').length >= 4) break
    tryPlace(t)
  }
  return placed
}

const tryPlaceable = (t, placed) =>
  !placed.some((p) => lengthOf(p.q - t.q, p.r - t.r) < ENCAMPMENT_SPACING)

/**
 * Stamp each tile with the reveal stage that first makes it visible.
 *
 * Earth's stages are region-shaped (Old World → islands → New World coast →
 * everything); beyond Earth the reveal is purely CONCENTRIC, which is what
 * keeps the Moon, Mars and the exoplanet from ever being holes.
 */
function assignReveal(tiles) {
  const at = (q, r) => tiles.get(key(q, r))
  const touches = (t, pred) => neighbors(t.q, t.r).some((n) => {
    const o = at(n.q, n.r)
    return o && pred(o)
  })

  const outerStages = Object.keys(REVEAL_RADIUS)
    .map(Number)
    .sort((a, b) => a - b)

  for (const t of tiles.values()) {
    if (t.d <= LOCAL_RADIUS) { t.revealStage = STAGE.local; continue }

    if (t.band === 'earth') {
      if (t.region === 'old_world') t.revealStage = STAGE.old_world
      else if (t.region === 'sea' && touches(t, (o) => o.region === 'old_world')) t.revealStage = STAGE.old_world
      else if (t.region === 'island') t.revealStage = STAGE.islands
      else if (t.region === 'sea' && !touches(t, (o) => o.region === 'new_world')) t.revealStage = STAGE.islands
      // You chart the WATERS off the New World first, then make landfall. Giving
      // the coastal stage the sea (rather than the sea plus the shore ring) is
      // what keeps "Full Earth" substantial — a small New World is nearly all
      // coastline, so splitting the land across both stages starved the last one.
      else if (t.region === 'sea') t.revealStage = STAGE.new_coast
      else t.revealStage = STAGE.full_earth
      continue
    }

    const s = outerStages.find((st) => t.d <= REVEAL_RADIUS[st])
    t.revealStage = s === undefined ? Infinity : s
  }
}

/**
 * Close any hole in the known set.
 *
 * Earth's region-shaped stages can enclose a pocket of not-yet-revealed tiles
 * (a lake inside a continent, an enclave across a strait). At every stage we
 * flood the UNKNOWN region inward from the map's outer rim; anything unknown
 * that the flood cannot reach is enclosed, and gets pulled into this stage.
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
      // Never-revealable outer rings stay battlefield-only, holes or not.
      if (t.revealStage === Infinity) continue
    }
  }
}

// ---------------------------------------------------------------------------

export function buildWorld(seed) {
  const rng = makeRng(seed)
  const tiles = blankTiles()

  generateEarth(tiles, seed, rng)
  generateSpace(tiles, rng)
  generateDeep(tiles, seed, rng)
  generateGalactic(tiles, rng)
  repairStart(tiles, rng)
  const encampments = placeEncampments(tiles, rng)
  assignReveal(tiles)

  const list = [...tiles.values()]
  sealReveal(tiles, list)

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
