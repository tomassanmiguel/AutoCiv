// Territory: control, improvements, cities, and what they all yield.
//
// THE MODEL
//   controlled  — the tile counts toward your output and may be expanded onto
//   improved    — an expansion was spent here: the tile's yield DOUBLES and all
//                 six neighbours become controlled
//   city        — a second expansion on an already-improved tile. A city keeps
//                 the tile's (doubled) natural yield AND adds its population to
//                 production / gold / progress
//
// So expansion is one verb with two depths: go WIDE (improve a fresh tile,
// which also grabs its neighbours) or go TALL (upgrade an improvement into a
// city, which compounds forever but grabs no ground).
//
// City growth is separate from the expansion meter: each city banks the food of
// its adjacent tiles and buys population against an exponential cost, with a
// multiplier if it can reach water.

import { neighbors } from '../hex/coords.js'
import { terrainOf, isWater } from './terrain.js'

// --- City growth knobs -----------------------------------------------------
export const CITY_POP_BASE = 260      // food for pop 2
export const CITY_POP_GROWTH = 1.85  // each further pop costs this much more
export const CITY_WATER_BONUS = 1.5  // growth multiplier with adjacent water
export const CITY_START_POP = 1

/** Food to go from `pop` to `pop + 1`. */
export const cityPopCost = (pop) => Math.round(CITY_POP_BASE * Math.pow(CITY_POP_GROWTH, pop - 1))

// Which expansion unlock a terrain needs, if any.
const TERRAIN_GATE = {
  island: 'ocean', // you need boats to reach one
  tundra: 'tundra', exotundra: 'tundra',
  desert: 'desert', exodesert: 'desert',
  mountain: 'mountain', exomountain: 'mountain',
  ocean: 'ocean',
  asteroid: 'asteroid',
  moon: 'moon', lunar_crater: 'moon',
  mars: 'mars', mars_ice: 'mars', mars_mountain: 'mars',
  exoplains: 'exoplanet', exohills: 'exoplanet', exosea: 'exoplanet', exomoon: 'exoplanet',
  planet: 'planet', star: 'star', singularity: 'singularity',
}

// Big CONTIGUOUS regions you must reach by landing on a BORDER tile first — you
// cannot appear in the middle of the New World or of Mars.
const GATED_REGIONS = {
  new_world: 'ocean',
  moon: 'moon',
  mars: 'mars',
  exoplanet: 'exoplanet',
}

// Isolated specks — an island in the channel, a lone asteroid, a distant star.
// Nothing is ever adjacent to them, so once their gate is open they are ALWAYS
// directly settleable; the border-first rule would strand them forever.
const ALWAYS_REACHABLE = new Set([
  'island', 'asteroid', 'planet', 'star', 'singularity', 'exomoon',
])

// Never expandable — empty void and the muster ring.
const NEVER = new Set(['space', 'deep_space', 'battlefield'])

/** Cities cannot sit on these even once the terrain is expandable. Water is
 *  excluded wholesale — a city is founded on land, though it may sit BESIDE
 *  water and take the growth bonus for it. */
const NO_CITY = new Set(['mountain', 'exomountain', 'mars_mountain'])

/**
 * Fresh territory: the palace holds the centre, its ring is controlled.
 *
 * Territory keeps INCREMENTAL index sets on the world (`world.terr`). Every tick
 * sums yields and every expansion enumerates targets, and rescanning 5,400 tiles
 * for both made a 28-era simulation take minutes. The sets are the same data,
 * maintained as it changes.
 */
export function initTerritory(world) {
  for (const t of world.list) {
    t.controlled = false
    t.improved = false
    t.city = null
  }
  world.terr = {
    controlled: new Set(),
    improved: new Set(),
    cities: new Set(),
    entered: new Set(), // regions that already hold an improvement
    cleared: 0,         // encampments absorbed by your borders
    borders: regionBorders(world),
    isolated: world.list.filter((t) => ALWAYS_REACHABLE.has(t.terrain) && t.revealStage !== Infinity),
    // Bumped by any improvement/city, and by a reveal — `foodAround` is memoised
    // against it, and visibility changes what counts.
    version: 0,
    // Territory may spill past the frontier, but anything not yet REVEALED is
    // inert: no yield, no expansion target, no city site. See `visible()`.
    stage: 0,
  }

  const home = world.at(0, 0)
  addControl(world, home)
  home.improved = true
  world.terr.improved.add(home)
  world.terr.entered.add(home.region)
  home.city = { pop: CITY_START_POP, food: 0, palace: true }
  world.terr.cities.add(home)
  for (const n of neighbors(0, 0)) addControl(world, world.at(n.q, n.r))
}

function addControl(world, t) {
  if (!t || t.controlled) return
  if (t.revealStage === Infinity || NEVER.has(t.terrain)) return
  t.controlled = true
  world.terr.controlled.add(t)
  // Bringing an encampment inside your borders CLEARS it — that is the whole
  // reason to push toward one.
  if (t.encampment) {
    t.encampment = null
    world.terr.cleared = (world.terr.cleared ?? 0) + 1
  }
}

/** Border tiles of each gated region, computed once — they never change. */
function regionBorders(world) {
  const out = {}
  for (const region of Object.keys(GATED_REGIONS)) out[region] = []
  for (const t of world.list) {
    if (!(t.region in out)) continue
    if (neighbors(t.q, t.r).some((n) => world.at(n.q, n.r)?.region !== t.region)) {
      out[t.region].push(t)
    }
  }
  return out
}

/**
 * Is this tile part of the known world yet?
 *
 * Improving a tile claims its six neighbours, and some of those can lie beyond
 * the current reveal — out in what is drawn as enemy battlefield. Those tiles
 * stay claimed but count for NOTHING until the map catches up: they produce no
 * yield, cannot be expanded onto, and cannot host a city.
 */
export const visible = (world, t) => !!t && t.revealStage <= world.terr.stage

/** Tell territory which reveal stage is current. Bumps the memo version. */
export function setTerritoryStage(world, stage) {
  if (!world.terr || world.terr.stage === stage) return
  world.terr.stage = stage
  world.terr.version++
}

const gateFor = (t) => TERRAIN_GATE[t.terrain] ?? null
const regionEntered = (world, region) => world.terr.entered.has(region)
const isRegionBorder = (world, t) => (world.terr.borders[t.region] ?? []).includes(t)

/**
 * May an expansion be placed here at all? Checks terrain gating and the
 * border-first rule; `expansionTargets` adds the adjacency/control rule.
 */
export function canExpandOnto(world, t, unlocks) {
  if (!t || NEVER.has(t.terrain)) return false
  if (!visible(world, t)) return false
  const gate = gateFor(t)
  if (gate && !unlocks.has(gate)) return false
  if (ALWAYS_REACHABLE.has(t.terrain)) return true

  const regionGate = GATED_REGIONS[t.region]
  if (regionGate) {
    if (!unlocks.has(regionGate)) return false
    // First footing in a region must be on its border.
    if (!regionEntered(world, t.region) && !isRegionBorder(world, t)) return false
  }
  return true
}

/**
 * Everything a single expansion could be spent on right now.
 *
 *  improve — a controlled, unimproved tile, OR a legal FOOTHOLD: the border of
 *            a gated region you have not entered, reachable without adjacency
 *            (that is what "expand across the ocean" buys you)
 *  city    — an improved tile that may become a city
 */
export function expansionTargets(world, unlocks) {
  const improve = []
  const city = []
  const seen = new Set()

  // Ordinary expansion: anything you already control that is not yet improved.
  for (const t of world.terr.controlled) {
    if (t.improved || seen.has(t)) continue
    if (!canExpandOnto(world, t, unlocks)) continue
    seen.add(t)
    improve.push(t)
  }

  // Footholds: the border of a gated region you have not entered yet. This is
  // the only expansion that ignores adjacency — it is what "expand across the
  // ocean" actually buys.
  for (const [region, gate] of Object.entries(GATED_REGIONS)) {
    if (!unlocks.has(gate) || regionEntered(world, region)) continue
    for (const t of world.terr.borders[region] ?? []) {
      if (t.improved || seen.has(t)) continue
      if (!canExpandOnto(world, t, unlocks)) continue
      seen.add(t)
      improve.push(t)
    }
  }

  // Isolated specks stay reachable for the whole run, not just the first time.
  for (const t of world.terr.isolated) {
    if (t.improved || seen.has(t)) continue
    if (!canExpandOnto(world, t, unlocks)) continue
    seen.add(t)
    improve.push(t)
  }

  for (const t of world.terr.improved) if (canFoundCity(world, t)) city.push(t)
  return { improve, city }
}

/**
 * City rules: an improved, city-less tile, not on a mountain, not adjacent to
 * another city, and with food within reach — a city has to be able to eat.
 * The tile's OWN food counts, so a city on plains is always valid.
 */
export function canFoundCity(world, t) {
  if (!t.improved || t.city) return false
  if (!visible(world, t)) return false
  if (NO_CITY.has(t.terrain) || isWater(t.terrain)) return false
  if (neighbors(t.q, t.r).some((n) => world.at(n.q, n.r)?.city)) return false
  return foodAround(world, t) > 0
}

/**
 * Food from a tile and its neighbours — what a city there could live on.
 * Memoised against `terr.version`, since it only changes when something is
 * improved and it is otherwise recomputed for every city on every tick.
 */
export function foodAround(world, t) {
  const v = world.terr.version
  if (t._foodVersion === v) return t._foodAround
  let food = visible(world, t) ? terrainOf(t.terrain).yields.food * (t.improved ? 2 : 1) : 0
  for (const n of neighbors(t.q, t.r)) {
    const o = world.at(n.q, n.r)
    if (!o || !visible(world, o)) continue
    food += terrainOf(o.terrain).yields.food * (o.improved ? 2 : 1)
  }
  t._foodVersion = v
  t._foodAround = food
  return food
}

/** Memoised "is there water in reach" — same reasoning as foodAround. */
function waterAround(world, t) {
  const v = world.terr.version
  if (t._waterVersion === v) return t._waterAround
  const w = isWater(t.terrain) || neighbors(t.q, t.r).some((n) => {
    const o = world.at(n.q, n.r)
    return o && isWater(o.terrain)
  })
  t._waterVersion = v
  t._waterAround = w
  return w
}

/** Spend an expansion: improve a tile and pull its neighbours into control. */
export function improveTile(world, t) {
  if (t.improved || !visible(world, t)) return false
  t.improved = true
  world.terr.version++
  world.terr.improved.add(t)
  world.terr.entered.add(t.region)
  addControl(world, t)
  for (const n of neighbors(t.q, t.r)) addControl(world, world.at(n.q, n.r))
  return true
}

/** Spend an expansion: turn an improvement into a city. */
export function foundCity(world, t) {
  if (!canFoundCity(world, t)) return false
  t.city = { pop: CITY_START_POP, food: 0, palace: false }
  world.terr.version++
  world.terr.cities.add(t)
  return true
}

/** Per-tick yield of one tile, given control / improvement / city. */
export function tileYield(world, t) {
  const out = { food: 0, production: 0, gold: 0, progress: 0 }
  // Claimed but not yet revealed produces nothing — see `visible`.
  if (!t.controlled || !visible(world, t)) return out
  const base = terrainOf(t.terrain).yields
  const mult = t.improved ? 2 : 1
  out.food = base.food * mult
  out.production = base.production * mult
  out.gold = base.gold * mult
  out.progress = base.progress * mult
  if (t.city) {
    // A city keeps its tile's natural yield and adds its population on top.
    out.production += t.city.pop
    out.gold += t.city.pop
    out.progress += t.city.pop
  }
  return out
}

/** Summed per-tick output of everything you control. */
export function territoryYield(world) {
  const out = { food: 0, production: 0, gold: 0, progress: 0 }
  for (const t of world.terr.controlled) {
    const y = tileYield(world, t)
    out.food += y.food
    out.production += y.production
    out.gold += y.gold
    out.progress += y.progress
  }
  return out
}

/**
 * One tick of city growth. Each city banks the food around it — ×
 * CITY_WATER_BONUS if it can reach water — and buys population against an
 * exponential cost.
 */
export function growCities(world) {
  const grew = []
  for (const t of world.terr.cities) {
    const rate = foodAround(world, t) * (waterAround(world, t) ? CITY_WATER_BONUS : 1)
    t.city.food += rate
    let guard = 0
    while (t.city.food >= cityPopCost(t.city.pop) && guard++ < 50) {
      t.city.food -= cityPopCost(t.city.pop)
      t.city.pop += 1
      grew.push(t)
    }
  }
  return grew
}

/** Counts for the HUD / sims. */
export function territoryStats(world) {
  let pop = 0
  for (const t of world.terr.cities) pop += t.city.pop
  let live = 0
  for (const t of world.terr.controlled) if (visible(world, t)) live++
  return {
    controlled: live,
    claimedBeyondFrontier: world.terr.controlled.size - live,
    improved: world.terr.improved.size,
    cities: world.terr.cities.size,
    cleared: world.terr.cleared ?? 0,
    pop,
  }
}


export { NO_CITY, GATED_REGIONS }
