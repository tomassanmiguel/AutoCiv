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

import { key, disc, ring, neighbors, lengthOf, toPixel, wedgeOf, SQRT3, bfs } from '../hex/coords.js'
import { makeRng, makeNoise2D, shuffle } from './noise.js'
import {
  BANDS, BODIES, MAX_RADIUS, MAX_REVEAL_RADIUS, REVEAL_RADIUS, FEATURELESS_OUTER_RINGS,
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
const NW_EDGE = 0.68      // very wide ocean channel — a big open sea fully dividing the continents
const SPLIT_WOBBLE = 0.40 // more boundary wobble so the sea reads as an irregular ocean, not a straight river
const RIM_SEA = 0.90      // radius past which Earth TENDS to sea; lower = a rounder, larger ocean at the rim
// Inland seas carve oceans INTO the continents (less landmass); higher cut = less sea.
// The Old World is the larger continent, so it gets the lower (more aggressive) cut.
const INLAND_SEA_OLD = 0.64
const INLAND_SEA_NEW = 0.80

// Climate is LATITUDINAL: an arid equator, tundra at the two poles. The polar
// axis is the world's vertical, so north/south read as up/down on the map.
const TUNDRA_LAT = 0.74      // base polar latitude; tundra fills everything POLEWARD of the wavy boundary (a modest cap, leaving temperate room)
const TUNDRA_TENDRIL = 0.12  // how far that boundary wobbles equatorward, so tundra forms blocs that tendril toward the equator
const DESERT_LAT = 0.42

const RIDGE_CUT = 0.94 // sparse ridge PEAKS to seed ranges; the frequency repair then grows them into
                       // connected ranges up to the minimum, leaving the odd unseeded peak lonely
const HILL_CUT = 0.60

// Pixel latitude scale — |y|/EARTH_PR is normalised latitude (0 equator … 1 pole).
const EARTH_PR = SQRT3 * BANDS.earth.max
// Minimum share each terrain must reach among a CONTINENT's land tiles.
const EARTH_MINS = { plains: 0.20, forest: 0.19, hills: 0.15, mountain: 0.10, desert: 0.08, tundra: 0.08 }

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

    // Higher-frequency climate fields ⇒ SMALLER biome clusters and a more mixed map.
    const e = elevN(px * 14, py * 14)
    const m = moistN(px * 13 + 30, py * 13 + 30)
    const c = climN(px * 7 + 80, py * 7 + 80)
    // Ridge field for mountains — kept a touch lower frequency so ranges still read
    // as ranges, but shorter than before. The frequency repair grows them modestly.
    const ridge = 1 - Math.abs(2 * ridgeN(px * 11, py * 11) - 1)
    t.elev = e
    t.moist = m
    t.ridge = ridge

    // The polar boundary is a smooth latitude sampled HORIZONTALLY (fixed vertical
    // coord), so it reads as one wavy line: everything POLEWARD of it is solid
    // tundra, never a plains/forest/desert tile stranded nearer the pole than
    // tundra. The low-frequency polar field gives larger blocs that tendril
    // equatorward. Mountains are the only non-tundra land allowed past it.
    const polarBoundary = TUNDRA_LAT + TUNDRA_TENDRIL * (2 * polarN(px * 3.0, 7.0) - 1)
    const dryCut = 0.42 + 0.10 * (2 * c - 1)
    // Compress the moisture extremes so a dry seed isn't all desert and a wet one isn't all forest.
    const mc = 0.5 + (m - 0.5) * 0.7

    const isMountain = ridge > RIDGE_CUT && e > 0.42
    if (isMountain) t.terrain = 'mountain'
    else if (lat > polarBoundary) t.terrain = 'tundra'
    else if (e > HILL_CUT) t.terrain = 'hills'
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
  // Islands live in DEEP ocean, never against the shore: no land (continent OR a
  // fellow island) within two tiles, so they can't strip a continent's coast or
  // read as an outcrop of it. (Coast forms later against continent land, so a
  // range-2 land clearance keeps their surrounding water open ocean.)
  const deepOpen = (t) =>
    disc(t.q, t.r, 2).every((h) => {
      const o = tiles.get(key(h.q, h.r))
      return !o || !isLand(o.terrain)
    })
  const open = earth.filter(
    (t) => t.seaKind === 'channel' && t.d > LOCAL_RADIUS && deepOpen(t),
  )
  shuffle(open, rng)
  const want = 4 + Math.floor(rng() * 6) // 4..9 — wider swing in how many islands appear
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

const ISLE_TERRAIN = ['plains', 'plains', 'forest', 'forest', 'hills', 'hills', 'mountain']

/**
 * Two big offshore ISLANDS (their own `isle` region so the island-speck invariants
 * ignore them): a 5–9 tile one hugging the Old World whose coast joins the Old
 * World's, and a 4–8 tile one off the New World. Both are proper little landmasses
 * ringed by coast, one water tile off their continent so the shallows connect.
 */
function placeLargeIslands(tiles, rng) {
  // The dividing ocean must fully separate the two SIDES — Old World + its island
  // vs New World + its island — so each island is kept >=4 tiles off the OTHER
  // side (an open-ocean tile always lies between).
  const earthPassable = (q, r) => { const t = tiles.get(key(q, r)); return !!t && t.band === 'earth' }
  const landOf = (...regions) => {
    const s = []
    for (const t of tiles.values()) if (regions.includes(t.region) && isLand(t.terrain)) s.push({ q: t.q, r: t.r })
    return s
  }
  // Old World island: hugs the Old World, >=4 from the New World.
  placeLargeIsland(tiles, rng, 'old_world', 5, 9, bfs(landOf('new_world'), earthPassable))
  // New World island: >=4 from the OLD SIDE (Old World continent + the old island).
  const oldSideDist = bfs(landOf('old_world', 'isle'), earthPassable)
  if (!placeLargeIsland(tiles, rng, 'new_world', 4, 8, oldSideDist)) carveNewWorldIsland(tiles, rng, oldSideDist, 4, 8)
}

/**
 * Fallback New World island: sever a small cluster of the New World's FAR edge
 * (well clear of the Old World) from the mainland with a one-tile moat, leaving a
 * coast-ringed New World island. Guarantees a New World island even when the
 * channel is too tight for a free-floating one, without touching the ocean strip.
 */
function carveNewWorldIsland(tiles, rng, oppositeDist, minN, maxN) {
  const size = minN + Math.floor(rng() * (maxN - minN + 1))
  const dof = (t) => oppositeDist.get(key(t.q, t.r)) ?? Infinity
  const nwLand = [...tiles.values()].filter((t) => t.region === 'new_world' && isLand(t.terrain))
  const seeds = nwLand.filter((t) => dof(t) >= 6).sort((a, b) => dof(b) - dof(a))
  for (const seed of seeds) {
    const cluster = [seed]; const inC = new Set([key(seed.q, seed.r)])
    while (cluster.length < size) {
      let added = false
      for (const b of cluster) {
        const cand = neighbors(b.q, b.r).map((n) => tiles.get(key(n.q, n.r)))
          .find((o) => o && o.region === 'new_world' && isLand(o.terrain) && !inC.has(key(o.q, o.r)) && dof(o) >= 5)
        if (cand) { inC.add(key(cand.q, cand.r)); cluster.push(cand); added = true; break }
      }
      if (!added) break
    }
    if (cluster.length < minN) continue
    // Moat: every mainland tile touching the cluster becomes water, isolating it.
    for (const t of cluster) for (const n of neighbors(t.q, t.r)) {
      const o = tiles.get(key(n.q, n.r))
      if (o && !inC.has(key(o.q, o.r)) && o.region === 'new_world' && isLand(o.terrain)) { o.region = 'sea'; o.seaKind = 'channel'; o.terrain = 'ocean' }
    }
    // Ring the island with coast (the moat and any open water around it).
    for (const t of cluster) for (const n of neighbors(t.q, t.r)) {
      const o = tiles.get(key(n.q, n.r))
      if (o && o.region === 'sea' && o.terrain === 'ocean') o.terrain = 'coast'
    }
    return cluster
  }
  return null
}

function placeLargeIsland(tiles, rng, nearRegion, minN, maxN, oppositeDist) {
  const size = minN + Math.floor(rng() * (maxN - minN + 1))
  const openSea = (t) => !!t && t.band === 'earth' && t.region === 'sea'
  const touchesContinent = (t) => neighbors(t.q, t.r).some((n) => {
    const o = tiles.get(key(n.q, n.r))
    return o && o.region === nearRegion && isLand(o.terrain)
  })
  // A blob tile must stay open sea and NOT hug any landmass — so exactly one water
  // tile (the shared coast) always separates the isle from its continent, islands,
  // or a fellow isle — AND stay >=4 tiles off the opposite side, so it never
  // bridges the dividing ocean.
  const blobbable = (t, inBlob) => openSea(t) && !inBlob.has(key(t.q, t.r)) &&
    (oppositeDist.get(key(t.q, t.r)) ?? Infinity) > 3 &&
    !neighbors(t.q, t.r).some((n) => {
      const o = tiles.get(key(n.q, n.r))
      return o && (o.region === 'old_world' || o.region === 'new_world' || o.region === 'island' || o.region === 'isle')
    })
  // Seeds: open sea one tile out from a coast tile that touches this continent — so
  // the isle sits just offshore and shares that coast tile with the continent. If
  // that shoreline is too crowded, fall back to the nearest open sea to the
  // continent (still ringed by coast, just not sharing the continent's shallows).
  const offshore = [...tiles.values()].filter((t) => blobbable(t, new Set()) &&
    neighbors(t.q, t.r).some((n) => { const o = tiles.get(key(n.q, n.r)); return openSea(o) && touchesContinent(o) }))
  shuffle(offshore, rng)
  const landOf = [...tiles.values()].filter((t) => t.region === nearRegion && isLand(t.terrain))
  const distToContinent = (t) => Math.min(...landOf.map((l) => lengthOf(l.q - t.q, l.r - t.r)))
  const fallback = landOf.length
    ? [...tiles.values()].filter((t) => blobbable(t, new Set())).sort((a, b) => distToContinent(a) - distToContinent(b))
    : []
  for (const seed of [...offshore, ...fallback]) {
    const inBlob = new Set([key(seed.q, seed.r)])
    const blob = [seed]
    // Grow a compact blob outward from the seed.
    while (blob.length < size) {
      let added = false
      const frontier = shuffle([...blob], rng)
      for (const b of frontier) {
        const nbs = shuffle(neighbors(b.q, b.r).map((n) => tiles.get(key(n.q, n.r))), rng)
        const cand = nbs.find((o) => o && blobbable(o, inBlob))
        if (cand) { inBlob.add(key(cand.q, cand.r)); blob.push(cand); added = true; break }
      }
      if (!added) break
    }
    if (blob.length < minN) continue
    // Stamp the landmass with varied terrain, then ring it with coast. The New
    // World island IS New World (so it earns the New World ×2 tag/yield); the Old
    // World island stays its own `isle` region — it can't be Old World, since every
    // Old World tile must be reachable from the palace by land and this is offshore.
    const isleRegion = nearRegion === 'new_world' ? 'new_world' : 'isle'
    for (const t of blob) { t.region = isleRegion; t.seaKind = null; t.terrain = ISLE_TERRAIN[Math.floor(rng() * ISLE_TERRAIN.length)] }
    for (const t of blob) for (const n of neighbors(t.q, t.r)) {
      const o = tiles.get(key(n.q, n.r))
      if (o && o.region === 'sea' && o.terrain === 'ocean') o.terrain = 'coast'
    }
    return blob
  }
  return null
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

/** Continent land (a continent's own ground) — what shallow Coast forms against. */
const isContinentLand = (o) =>
  !!o && (o.region === 'old_world' || o.region === 'new_world') && isLand(o.terrain)

/**
 * Enforce the polar rule EXACTLY, after every land-creating step (continent
 * shaping AND the connectOldWorldLand bridges, which drop plains that can land
 * poleward of tundra): no non-tundra land tile may sit poleward of tundra, save
 * for mountains. Flood tundra outward toward the poles — any land tile with a
 * more-equatorward tundra neighbour joins it — to a fixpoint.
 */
function enforcePolarTundra(tiles) {
  const earth = []
  for (const t of tiles.values()) if (t.band === 'earth') earth.push(t)
  let spreading = true
  while (spreading) {
    spreading = false
    for (const t of earth) {
      if (t.terrain === 'tundra' || t.terrain === 'mountain' || !isLand(t.terrain)) continue
      for (const n of neighbors(t.q, t.r)) {
        const o = tiles.get(key(n.q, n.r))
        if (o && o.terrain === 'tundra' && Math.abs(o.y) < Math.abs(t.y)) { t.terrain = 'tundra'; spreading = true; break }
      }
    }
  }
}

/**
 * Convert land tiles so each listed terrain reaches a minimum COUNT. A donor is a
 * land tile whose current terrain is above its OWN minimum (or has no minimum) and
 * is not protected; among donors the best candidate for the target (highest
 * `scoreOf`, −Infinity = ineligible) is converted. `terrain` is processed in the
 * order given. Because the mountain score rewards adjacency to existing mountains,
 * mountains grow into RANGES rather than scattered peaks.
 */
function enforceTerrainMins(tiles, land, mins, scoreOf, protectedTerr, protect) {
  const N = land.length
  if (!N) return
  const count = {}
  for (const t of land) count[t.terrain] = (count[t.terrain] || 0) + 1
  const target = {}
  for (const k in mins) target[k] = Math.ceil(mins[k] * N) // ceil so the achieved share actually MEETS the minimum
  // Serve the MOST-deficient terrain first (by fraction of its target still owed),
  // so no single terrain is fully satisfied at the others' expense — important on
  // the small New World, where a strict order would starve later terrains.
  const stuck = new Set()
  for (let guard = 0; guard < N * 6; guard++) {
    let worst = null, worstDef = 0
    for (const terr in target) {
      if (stuck.has(terr)) continue
      const def = (target[terr] - (count[terr] || 0)) / target[terr]
      if (def > worstDef) { worstDef = def; worst = terr }
    }
    if (!worst) break
    let best = null, bestS = -Infinity
    for (const t of land) {
      if (t.terrain === worst || (protect && protect(t))) continue
      const cur = t.terrain
      if (protectedTerr.has(cur)) continue // never strip a protected terrain (mountains, tundra)
      if (cur in target && (count[cur] || 0) <= target[cur]) continue // donor must be in surplus
      const s = scoreOf(worst, t)
      if (s > bestS) { bestS = s; best = t }
    }
    if (!best || bestS === -Infinity) { stuck.add(worst); continue } // geography/supply won't allow more
    count[best.terrain]--
    best.terrain = worst
    count[worst] = (count[worst] || 0) + 1
  }
}

/** Extend tundra equatorward from the poles until it reaches `minCount`, most-
 *  poleward land first — so it never strands a non-tundra tile poleward of tundra. */
function extendTundra(land, minCount, protect) {
  let have = land.filter((t) => t.terrain === 'tundra').length
  if (have >= minCount) return
  const cands = land
    .filter((t) => t.terrain !== 'tundra' && t.terrain !== 'mountain' && !(protect && protect(t)))
    .sort((a, b) => Math.abs(b.y) - Math.abs(a.y))
  for (const t of cands) {
    if (have >= minCount) break
    t.terrain = 'tundra'; have++
  }
}

/**
 * Enforce the per-continent terrain minimums (EARTH_MINS). Runs AFTER the palace
 * repair, so it leaves the opening view (d ≤ LOCAL_RADIUS) untouched. Tundra is
 * grown from the poles first (respecting the polar rule); the rest are grown by
 * their defining field, with mountains forming ranges.
 */
function balanceEarthTerrain(tiles) {
  const protect = (t) => t.d <= LOCAL_RADIUS // don't disturb the guaranteed opening view
  const scoreEarth = (terr, t) => {
    const latN = Math.abs(t.y) / EARTH_PR
    switch (terr) {
      case 'mountain': {
        let s = t.ridge ?? 0.5
        for (const nb of neighbors(t.q, t.r)) if (tiles.get(key(nb.q, nb.r))?.terrain === 'mountain') { s += 1; break } // smaller ranges
        return s
      }
      case 'forest': return t.moist ?? 0.5
      case 'hills': return t.elev ?? 0.5
      case 'desert': return latN > 0.6 ? -Infinity : (1 - (t.moist ?? 0.5)) - latN * 0.2 // prefer dry & equatorial; allow up to mid-latitude
      case 'tundra': return -Infinity // tundra is placed poleward by extendTundra only — never here
      default: return 0 // plains — any surplus donor will do
    }
  }
  // Only tundra is protected from donation (removing it would strand non-tundra
  // poleward). Surplus mountains ABOVE their minimum may be donated to feed other
  // terrains; connectOldWorldLand reopens any pass this closes.
  const protectedTerr = new Set(['tundra'])
  const continents = ['old_world', 'new_world'].map((region) => ({
    region, land: [...tiles.values()].filter((t) => t.region === region && isLand(t.terrain)),
  })).filter((c) => c.land.length)
  // 1) Grow each continent's tundra cap from the poles to the minimum.
  for (const c of continents) extendTundra(c.land, Math.ceil(EARTH_MINS.tundra * c.land.length), protect)
  // 2) LOCK the polar zones as tundra now, so step 3 can never place forest/hills
  //    poleward of tundra (which a later flood would only eat back).
  enforcePolarTundra(tiles)
  // 3) Grow the remaining minimums from equatorward donors; mountains form ranges.
  for (const c of continents) enforceTerrainMins(tiles, c.land, EARTH_MINS, scoreEarth, protectedTerr, protect)
}

/**
 * Guarantee a strip of OPEN OCEAN fully separates the two continents: erode any
 * New World land within 3 tiles of the Old World back into ocean, so the nearest
 * New World land is ≥4 tiles away and an ocean tile (adjacent to neither
 * continent) always sits in the gap — no thin coast-only pinch bridging them.
 */
function separateContinents(tiles) {
  const src = []
  for (const t of tiles.values()) if (t.region === 'old_world' && isLand(t.terrain)) src.push({ q: t.q, r: t.r })
  if (!src.length) return
  const dist = bfs(src, (q, r) => { const t = tiles.get(key(q, r)); return !!t && t.band === 'earth' })
  for (const t of tiles.values()) {
    if (t.region === 'new_world' && isLand(t.terrain) && (dist.get(key(t.q, t.r)) ?? Infinity) <= 3) {
      t.region = 'sea'; t.seaKind = 'channel'; t.terrain = 'ocean'
    }
  }
}

/**
 * Global polar caps: NOTHING non-tundra may sit poleward of the tundra extremes.
 * Any land tile — continent, island or isle — north of the northernmost tundra
 * tile or south of the southernmost becomes tundra, so the ice caps are the true
 * poleward edge of all land.
 */
function enforceGlobalPolarCaps(tiles) {
  const land = [...tiles.values()].filter((t) => t.band === 'earth' && isLand(t.terrain))
  const tundra = land.filter((t) => t.terrain === 'tundra')
  if (!tundra.length) return
  const yN = Math.max(...tundra.map((t) => t.y)) // northernmost tundra
  const yS = Math.min(...tundra.map((t) => t.y)) // southernmost tundra
  for (const t of land) {
    if (t.terrain !== 'tundra' && (t.y > yN || t.y < yS)) t.terrain = 'tundra'
  }
}

/** Guarantee tundra in BOTH hemispheres: if a hemisphere's continent land has no
 *  tundra, turn its most-poleward land into a small tundra cap. */
function guaranteeBothPoles(tiles) {
  const land = [...tiles.values()].filter((t) => t.band === 'earth' && (t.region === 'old_world' || t.region === 'new_world') && isLand(t.terrain))
  for (const sign of [1, -1]) {
    const hemi = land.filter((t) => (t.y >= 0 ? 1 : -1) === sign)
    if (!hemi.length || hemi.some((t) => t.terrain === 'tundra')) continue
    hemi.sort((a, b) => Math.abs(b.y) - Math.abs(a.y))
    const seed = hemi[0]
    if (Math.abs(seed.y) / EARTH_PR < 0.45) continue // no polar land here — forcing tundra would break confinement
    seed.terrain = 'tundra'
    for (const nb of neighbors(seed.q, seed.r)) {
      const o = tiles.get(key(nb.q, nb.r))
      if (o && isLand(o.terrain) && o.terrain !== 'mountain' && Math.abs(o.y) >= Math.abs(seed.y) - 1.5) o.terrain = 'tundra'
    }
  }
}

/**
 * Water adjacent to CONTINENT land becomes shallow Coast. Islands deliberately
 * do not generate coast — they carry their own shore in the island sprite, so a
 * speck in open water reads as an island, not as land ringed by shallows. Coast
 * only appears next to an island when that same tile also touches continent land.
 */
function markCoasts(tiles, earth) {
  for (const t of earth) {
    if (t.region !== 'sea') continue
    const touchesLand = neighbors(t.q, t.r).some((n) => isContinentLand(tiles.get(key(n.q, n.r))))
    t.terrain = touchesLand ? 'coast' : 'ocean'
  }
}

/**
 * Final Earth water pass, AFTER land bridges (connectOldWorldLand) may have created
 * land next to an island: revert any island touching continent land back to sea, then
 * re-derive coast so every earth water tile adjacent to CONTINENT land reads as coast
 * (islands, again, keep their own shore and don't spread coast into open water).
 */
function finalizeEarthCoasts(tiles) {
  for (const t of tiles.values()) {
    if (t.region !== 'island') continue
    const touchesContinent = neighbors(t.q, t.r).some((n) => isContinentLand(tiles.get(key(n.q, n.r))))
    if (touchesContinent) { t.region = 'sea'; t.seaKind = 'channel'; t.terrain = 'ocean' }
  }
  for (const t of tiles.values()) {
    if (t.band !== 'earth' || t.region !== 'sea') continue
    const touchesLand = neighbors(t.q, t.r).some((n) => isContinentLand(tiles.get(key(n.q, n.r))))
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

const BODY_REGIONS = new Set(['moon', 'mars', 'exoplanet', 'exomoon'])

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
// Deep space + the exoplanets
// ---------------------------------------------------------------------------
//
// Deep space is one region (no outer/deep distinction). Scattered through it are
// EXO_COUNT exoplanets — peers, no "main" one — of varying size, shape and
// PERSONALITY (a different terrain mix each), at least one in every angular third
// of the map, each with one or two moons.

const EXO_COUNT = 6
const EXO_PER_THIRD = 2 // >= this many exoplanets in each 120° third (2 * 3 = 6)

// A personality skews an exoplanet's terrain. sea/desert: higher cutoff => more of
// it. mtn: LOWER ridge cutoff => more mountains. hill: lower elevation cutoff =>
// more hills. tundraRim: lower => tundra reaches further from the rim inward.
const EXO_PERSONALITIES = [
  { name: 'alpine',   sea: 0.30, mtn: 0.72, hill: 0.48, tundraRim: 0.80, desert: 0.14 },
  { name: 'oceanic',  sea: 0.58, mtn: 0.92, hill: 0.66, tundraRim: 0.92, desert: 0.12 },
  { name: 'verdant',  sea: 0.34, mtn: 0.90, hill: 0.60, tundraRim: 0.92, desert: 0.06 },
  { name: 'arid',     sea: 0.24, mtn: 0.90, hill: 0.58, tundraRim: 0.94, desert: 0.52 },
  { name: 'frozen',   sea: 0.30, mtn: 0.86, hill: 0.56, tundraRim: 0.55, desert: 0.10 },
  { name: 'balanced', sea: 0.38, mtn: 0.85, hill: 0.60, tundraRim: 0.86, desert: 0.26 },
]

const exoTerrainOf = (p, e, m, w, ridge, dd) => {
  if (w < p.sea) return 'exosea'
  if (ridge > p.mtn && e > 0.42) return 'exomountain'
  if (e > p.hill) return 'exohills'
  if (dd > p.tundraRim) return 'exotundra'
  if (m < p.desert) return 'exodesert'
  return 'exoplains'
}

function generateDeep(tiles, seed, rng) {
  for (const t of tiles.values()) {
    if (t.band !== 'deep' && t.band !== 'galactic') continue
    t.terrain = 'deep_space'
    t.region = 'deep_space'
  }
  return scatterExoplanets(tiles, seed, rng)
}

/** Angular third of the map (0/1/2) a tile falls in. */
const thirdOf = (t) => {
  const a = Math.atan2(t.y, t.x) // -PI..PI
  return a < -Math.PI / 3 ? 0 : a < Math.PI / 3 ? 1 : 2
}

function scatterExoplanets(tiles, seed, rng) {
  const personalities = shuffle([...EXO_PERSONALITIES], rng)
  const planets = [] // { q, r, rad }
  let idx = 0

  const placeOne = (third) => {
    const rad = 2 + Math.floor(rng() * 4) // 2..5 — varied sizes
    const strange = rng() < 0.5
    const p = personalities[idx % personalities.length]
    const cands = []
    for (const t of tiles.values()) {
      if (t.region !== 'deep_space') continue
      if (third !== undefined && thirdOf(t) !== third) continue
      cands.push(t)
    }
    shuffle(cands, rng)
    for (const c of cands) {
      if (!bodyFitsDeep(tiles, c, rad)) continue
      if (planets.some((q) => lengthOf(q.q - c.q, q.r - c.r) < q.rad + rad + 4)) continue
      const cells = stampExoplanet(tiles, c, rad, strange, p, seed + idx * 53)
      if (cells.length < 3) continue
      connectExoLand(tiles, cells) // the planet's land must be one piece
      planets.push({ q: c.q, r: c.r, rad })
      idx++
      return true
    }
    return false
  }

  // At least EXO_PER_THIRD in every third, then top up to EXO_COUNT anywhere.
  for (let third = 0; third < 3; third++) for (let k = 0; k < EXO_PER_THIRD; k++) placeOne(third)
  let guard = 40
  while (planets.length < EXO_COUNT && guard-- > 0) if (!placeOne(undefined)) break

  // One or two moons per exoplanet, nestled in the deep space around it.
  for (const planet of planets) {
    const moons = 1 + (rng() < 0.5 ? 1 : 0)
    const near = [...tiles.values()].filter((t) => t.region === 'deep_space' &&
      lengthOf(t.q - planet.q, t.r - planet.r) <= planet.rad + 4)
    shuffle(near, rng)
    let put = 0
    for (const t of near) {
      if (put >= moons) break
      if (bodyFitsDeep(tiles, t, 1)) { stampBody(tiles, t, 1, 'exomoon', 'exomoon'); put++ }
    }
  }
  return planets
}

/**
 * Stamp one exoplanet at `c` with radius `rad`, personality `p`, an optionally
 * strange outline, then repair it: fill interior holes, keep only the centre
 * component, and round the edge so no tile keeps more than 3 space neighbours.
 * Returns the land+sea cells it occupies.
 */
function stampExoplanet(tiles, c, rad, strange, p, nseed) {
  const elevN = makeNoise2D(nseed + 1, { scale: 2.0 })
  const moistN = makeNoise2D(nseed + 2, { scale: 2.4 })
  const seaN = makeNoise2D(nseed + 3, { scale: 1.7 })
  const ridgeN = makeNoise2D(nseed + 4, { scale: 1.5 })
  const shapeN = makeNoise2D(nseed + 5, { scale: 2.4 })
  const body = roundedBody(c, rad, strange, shapeN)

  const cells = []
  for (const h of disc(c.q, c.r, rad)) {
    const k = key(h.q, h.r)
    if (!body.has(k)) continue
    const t = tiles.get(k); if (!t) continue
    const lq = h.q - c.q, lr = h.r - c.r
    const dd = lengthOf(lq, lr) / rad
    const e = elevN(lq * 1.6 + 10, lr * 1.6 + 10)
    const m = moistN(lq * 1.6 + 40, lr * 1.6 + 40)
    const w = seaN(lq * 1.7 + 70, lr * 1.7 + 70)
    const ridge = 1 - Math.abs(2 * ridgeN(lq * 1.7, lr * 1.7) - 1)
    t.region = 'exoplanet'
    t.elev = e; t.moist = m; t.ridge = ridge; t.rim = dd
    t.terrain = exoTerrainOf(p, e, m, w, ridge, dd)
    cells.push(t)
  }
  return cells
}

/**
 * Compute a rounded, hole-free, centre-connected body outline: an optional strange
 * nibble of the outer edge, then fill enclosed empties, keep the centre component,
 * and erode any tile with more than 3 space (non-body) neighbours to a fixpoint.
 */
function roundedBody(c, rad, strange, shapeN) {
  const kept = new Set()
  for (const h of disc(c.q, c.r, rad)) {
    const dd = lengthOf(h.q - c.q, h.r - c.r) / rad
    if (strange && dd > 0.6 && shapeN(h.q * 1.4, h.r * 1.4) < 0.45) continue
    kept.add(key(h.q, h.r))
  }
  // Reclaim enclosed empties (no interior holes).
  const exterior = new Set()
  const stack = ring(c.q, c.r, rad + 1).map((h) => key(h.q, h.r))
  while (stack.length) {
    const k = stack.pop()
    if (exterior.has(k) || kept.has(k)) continue
    exterior.add(k)
    const [q, r] = k.split(',').map(Number)
    if (lengthOf(q - c.q, r - c.r) > rad + 1) continue
    for (const nb of neighbors(q, r)) stack.push(key(nb.q, nb.r))
  }
  for (const h of disc(c.q, c.r, rad)) {
    const k = key(h.q, h.r)
    if (!exterior.has(k)) kept.add(k)
  }
  const centreKey = key(c.q, c.r)
  const centreComponent = (set) => {
    const comp = new Set([centreKey]); const st = [{ q: c.q, r: c.r }]
    while (st.length) {
      const cur = st.pop()
      for (const nb of neighbors(cur.q, cur.r)) {
        const nk = key(nb.q, nb.r)
        if (comp.has(nk) || !set.has(nk)) continue
        comp.add(nk); st.push(nb)
      }
    }
    return comp
  }
  let body = centreComponent(kept)
  for (let pass = 0; pass < 6; pass++) {
    let eroded = false
    for (const k of [...body]) {
      if (k === centreKey) continue
      const [q, r] = k.split(',').map(Number)
      let space = 0
      for (const nb of neighbors(q, r)) if (!body.has(key(nb.q, nb.r))) space++
      if (space > 3) { body.delete(k); eroded = true }
    }
    if (!eroded) break
    body = centreComponent(body)
  }
  return body
}

/**
 * Whether a body of `radius` fits centred at `t`: its whole disc exists, lies in
 * deep/galactic space, touches no other celestial body, and never borders the
 * regular earth space band (the Moon/Mars/asteroid ring).
 */
function bodyFitsDeep(tiles, center, radius) {
  const body = disc(center.q, center.r, radius).map((h) => tiles.get(key(h.q, h.r)))
  if (body.some((t) => !t || (t.band !== 'deep' && t.band !== 'galactic') || BODY_REGIONS.has(t.region))) return false
  for (const t of body) {
    for (const n of neighbors(t.q, t.r)) {
      const o = tiles.get(key(n.q, n.r))
      if (!o) continue
      if (BODY_REGIONS.has(o.region)) return false // never hug another body
      if (o.band === 'space') return false // never border regular earth space
    }
  }
  return true
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
 * They are scattered through the deep/galactic void, clear of the exoplanets and
 * their moons.
 */
function generateOuterSpecials(tiles, rng) {
  const open = []
  for (const t of tiles.values()) {
    if (t.band === 'galactic' && !BODY_REGIONS.has(t.region)) { t.region = 'galactic'; t.terrain = 'deep_space' }
    if (t.band !== 'deep' && t.band !== 'galactic') continue
    // Leave the outermost revealable ring featureless so the map edge reads clean.
    if (t.d > MAX_REVEAL_RADIUS - FEATURELESS_OUTER_RINGS) continue
    if (BODY_REGIONS.has(t.region)) continue
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
function assignReveal(tiles) {
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
      else if (t.region === 'island' || t.region === 'isle') t.revealStage = STAGE.islands
      else if (t.region === 'sea' && !touches(t, (o) => o.region === 'new_world')) t.revealStage = STAGE.islands
      // Making landfall: the coastal stage shows the waters AND the shore, so
      // "New World Coastline" actually shows you the new continent.
      else if (t.region === 'sea') t.revealStage = STAGE.new_coast
      else if (t.region === 'new_world' && touches(t, (o) => o.region === 'sea' || o.region === 'island')) {
        t.revealStage = STAGE.new_coast
      } else t.revealStage = STAGE.full_earth
      continue
    }

    // Everything past Earth is charted in concentric rings for now (a placeholder
    // until the probe/caravel exploration mechanic drives the reveal). The
    // scattered exoplanets and their moons fall out of these rings by distance.
    const near = concentric.find((st) => t.d <= REVEAL_RADIUS[st])
    if (near !== undefined) { t.revealStage = near; continue }
    t.revealStage = t.d > MAX_REVEAL_RADIUS ? Infinity : STAGE.full_map
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
  const exoplanets = generateDeep(tiles, seed, rng) // 6 scattered exoplanets, no "main" one

  generateOuterSpecials(tiles, rng)
  repairStart(tiles, rng)
  connectOldWorldLand(tiles)
  finalizeEarthCoasts(tiles)
  enforcePolarTundra(tiles) // AFTER the land bridges, so their plains obey the polar rule too
  separateContinents(tiles) // carve the dividing open-ocean strip
  finalizeEarthCoasts(tiles) // re-coast the continents after eroding the pinch tiles
  placeLargeIslands(tiles, rng) // two big offshore islands, ringed by coast (new-world one kept clear of the old world)
  // Balance terrain to the per-continent minimums AFTER the ocean strip and islands
  // exist, so it sees the final continents (incl. the New World island, which is New
  // World). Iterated so each pass tops up the ±1 tile the connectivity/flood trimmed.
  for (let i = 0; i < 2; i++) {
    balanceEarthTerrain(tiles) // per-continent minimums + mountain ranges (leaves the opening view alone)
    connectOldWorldLand(tiles)
    enforcePolarTundra(tiles)
  }
  guaranteeBothPoles(tiles)
  enforceGlobalPolarCaps(tiles) // no non-tundra land (incl. islands) beyond the tundra extremes
  const encampments = placeEncampments(tiles, rng, marsCenter)
  assignReveal(tiles)

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
    exoplanets,
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
