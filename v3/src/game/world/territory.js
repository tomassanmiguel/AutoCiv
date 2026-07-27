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

import { neighbors, key as hkey } from '../hex/coords.js'
import { terrainOf, isWater, isPassable } from './terrain.js'
import { buildingYield } from '../data/buildings.js'

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
    t.building = null
    t.road = false
    t.unit = null
    t.ruin = null
  }
  world.terr = {
    controlled: new Set(),
    improved: new Set(),
    cities: new Set(),
    buildings: new Set(),
    roads: new Set(),
    ruins: new Set(),
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

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

/**
 * Lay the road network: every city joined to the palace along the shortest route
 * through ground you control. Called when roads unlock and whenever a city is
 * founded, so the network always reflects the current city list.
 *
 * The network GROWS rather than being rebuilt: each city is joined to the
 * nearest tile already carrying road, which is what makes it read as a road
 * system and not a bundle of separate spokes out of the capital.
 */
export function layRoads(world) {
  const roads = world.terr.roads
  const home = world.at(0, 0)
  if (!roads.size) { home.road = true; roads.add(home) }

  const passable = (t) => t && t.controlled && visible(world, t) && isPassable(t.terrain)
  // Nearest-first, so short spurs are absorbed before long ones are drawn.
  const todo = [...world.terr.cities].filter((t) => !t.road).sort((a, b) => a.d - b.d)

  for (const target of todo) {
    if (target.road) continue
    // BFS outward from the whole existing network at once.
    const prev = new Map()
    const q = [...roads]
    const seen = new Set(q)
    let hit = null
    while (q.length && !hit) {
      const t = q.shift()
      for (const n of neighbors(t.q, t.r)) {
        const o = world.tiles.get(hkey(n.q, n.r))
        if (!o || seen.has(o) || !passable(o)) continue
        seen.add(o)
        prev.set(o, t)
        if (o === target) { hit = o; break }
        q.push(o)
      }
    }
    if (!hit) continue // unreachable overland (another continent) — no road
    for (let t = hit; t && !t.road; t = prev.get(t)) { t.road = true; roads.add(t) }
  }
  world.terr.version++
}

/** Memoised "does this tile touch the road network" — same reasoning as foodAround. */
function roadAround(world, t) {
  const v = world.terr.version
  if (t._roadVersion === v) return t._roadAround
  const r = t.road || neighbors(t.q, t.r).some((n) => world.tiles.get(hkey(n.q, n.r))?.road)
  t._roadVersion = v
  t._roadAround = r
  return r
}

// ---------------------------------------------------------------------------
// Yield
// ---------------------------------------------------------------------------

const addInto = (out, y, n = 1) => {
  if (y.food) out.food += y.food * n
  if (y.production) out.production += y.production * n
  if (y.gold) out.gold += y.gold * n
  if (y.progress) out.progress += y.progress * n
  return out
}

/**
 * Per-tick yield of one tile.
 *
 * ORDER MATTERS, and it is: (terrain + terrain bonuses) × improvement, then the
 * flat adders — improvement bonus, roads, buildings, city population. So a
 * progress node that buffs forests is worth double on an improved forest, while
 * a building's output does not silently double.
 *
 * `mods` is the GameManager's accumulated progress-web state; it is optional so
 * the worldgen sims can price raw terrain without a game running.
 */
export function tileYield(world, t, mods) {
  const out = { food: 0, production: 0, gold: 0, progress: 0 }
  // Claimed but not yet revealed produces nothing — see `visible`.
  if (!t.controlled || !visible(world, t)) return out
  addInto(out, terrainOf(t.terrain).yields)
  const tb = mods?.terrain?.[t.terrain]
  if (tb) addInto(out, tb)
  if (t.improved) { out.food *= 2; out.production *= 2; out.gold *= 2; out.progress *= 2 }

  if (t.improved && mods?.improved) addInto(out, mods.improved)
  if (mods?.roadYield && roadAround(world, t)) addInto(out, mods.roadYield)
  if (t.building) addInto(out, buildingYield(world, t))
  if (t.city) {
    // A city keeps its tile's natural yield and adds its population on top.
    out.production += t.city.pop
    out.gold += t.city.pop
    out.progress += t.city.pop
    if (mods?.cityYields) addInto(out, mods.cityYields)
  }
  return out
}

/**
 * Summed per-tick output of everything you control.
 *
 * Percentage modifiers are ADDITIVE per resource and applied ONCE at the end —
 * sum the bonuses, then ×(1 + bonus). Chaining them multiplicatively is how v2's
 * late game ran away, so don't.
 */
export function territoryYield(world, mods) {
  const out = { food: 0, production: 0, gold: 0, progress: 0 }
  for (const t of world.terr.controlled) {
    const y = tileYield(world, t, mods)
    out.food += y.food
    out.production += y.production
    out.gold += y.gold
    out.progress += y.progress
  }
  if (mods?.mult) {
    for (const k of ['food', 'production', 'gold', 'progress']) {
      out[k] = Math.round(out[k] * (1 + (mods.mult[k] ?? 0)))
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Placement (buildings and units granted by the progress web)
// ---------------------------------------------------------------------------

/** May a granted BUILDING go here? Controlled, revealed, land, nothing there yet. */
export function canPlaceBuilding(world, t) {
  return !!t && t.controlled && visible(world, t) && !t.building
    && isPassable(t.terrain) && !NEVER.has(t.terrain)
}

/**
 * May a granted UNIT stand here? Same as a building, but one may sit underneath
 * it — and never on the palace tile, where combat's occupancy map already holds
 * the palace and would shadow the unit.
 */
export function canPlaceUnit(world, t) {
  return !!t && t.controlled && visible(world, t) && !t.unit
    && !(t.q === 0 && t.r === 0)
    && isPassable(t.terrain) && !NEVER.has(t.terrain)
}

export function placeBuilding(world, t, key) {
  if (!canPlaceBuilding(world, t)) return false
  t.building = { key, level: 1 }
  world.terr.buildings.add(t)
  world.terr.version++
  return true
}

export function placeUnit(world, t, key) {
  if (!canPlaceUnit(world, t)) return false
  // `destroyed` is the repairable state: the unit fell in combat and stands as a
  // ruin on its tile until gold brings it back. hp comes from live stats at
  // combat start, so it is not stored.
  t.unit = { key, level: 1, destroyed: false }
  world.terr.version++
  return true
}

// ---------------------------------------------------------------------------
// Damage and repair
// ---------------------------------------------------------------------------

/**
 * Raze the most valuable thing on a tile and leave a RUIN behind. The ruin is
 * what makes gold matter: losing ground is a bill, not an erasure, so a bad wave
 * costs you the gold to rebuild rather than the work itself.
 *
 * @returns the kind razed, or null if there was nothing to take.
 */
export function razeTile(world, t) {
  if (!t || !t.controlled || (t.q === 0 && t.r === 0)) return null
  const terr = world.terr
  let ruin = null
  if (t.building) {
    ruin = { kind: 'building', key: t.building.key, level: t.building.level ?? 1 }
    t.building = null
    terr.buildings.delete(t)
  } else if (t.city) {
    ruin = { kind: 'city', pop: t.city.pop, food: t.city.food }
    t.city = null
    terr.cities.delete(t)
  } else if (t.improved) {
    ruin = { kind: 'improvement' }
    t.improved = false
    terr.improved.delete(t)
  } else {
    return null
  }
  // Only the most recent loss is repairable — ruins do not stack up on one tile.
  t.ruin = ruin
  terr.ruins.add(t)
  terr.version++
  return ruin.kind
}

/** Rebuild whatever was razed here. */
export function restoreTile(world, t) {
  const ruin = t.ruin
  if (!ruin) return false
  if (ruin.kind === 'building') {
    t.building = { key: ruin.key, level: ruin.level }
    world.terr.buildings.add(t)
  } else if (ruin.kind === 'city') {
    // The population comes back with it — you are rebuilding, not refounding.
    t.improved = true
    world.terr.improved.add(t)
    t.city = { pop: ruin.pop, food: ruin.food, palace: false }
    world.terr.cities.add(t)
  } else {
    t.improved = true
    world.terr.improved.add(t)
  }
  t.ruin = null
  world.terr.ruins.delete(t)
  world.terr.version++
  return true
}

/** Bring a destroyed unit back to the field. */
export function repairUnit(world, t) {
  if (!t.unit?.destroyed) return false
  t.unit.destroyed = false
  world.terr.version++
  return true
}

/** Everything on the board that gold could currently fix. */
export function repairTargets(world) {
  const units = []
  const tiles = []
  for (const t of world.terr.controlled) {
    if (!visible(world, t)) continue
    if (t.unit?.destroyed) units.push(t)
    if (t.ruin) tiles.push(t)
  }
  return { units, tiles }
}

/**
 * One tick of city growth. Each city banks the food around it — ×
 * CITY_WATER_BONUS if it can reach water — and buys population against an
 * exponential cost.
 */
export function growCities(world, growthMult = 1) {
  const grew = []
  for (const t of world.terr.cities) {
    const rate = foodAround(world, t) * (waterAround(world, t) ? CITY_WATER_BONUS : 1) * growthMult
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
    buildings: world.terr.buildings.size,
    roads: world.terr.roads.size,
    ruins: world.terr.ruins.size,
    cleared: world.terr.cleared ?? 0,
    pop,
  }
}


export { NO_CITY, GATED_REGIONS }
