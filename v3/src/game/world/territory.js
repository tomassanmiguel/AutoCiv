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

import { neighbors, key as hkey, lengthOf, disc } from '../hex/coords.js'
import { terrainOf, isWater, isLand, isPassable, travelClass } from './terrain.js'
import { buildingYield, buildingDef } from '../data/buildings.js'
import { UNIT_DEFS } from '../data/units.js'

// --- City growth knobs -----------------------------------------------------
export const CITY_POP_BASE = 260      // food for pop 2
export const CITY_POP_GROWTH = 1.85  // each further pop costs this much more
export const CITY_WATER_BONUS = 1.5  // growth multiplier with adjacent water
export const CITY_START_POP = 1

/** Food to go from `pop` to `pop + 1`. */
export const cityPopCost = (pop) => Math.round(CITY_POP_BASE * Math.pow(CITY_POP_GROWTH, pop - 1))

// Which expansion unlock a terrain needs, if any.
// ⚠️ No WATER terrain appears here, and that is not an oversight: an outpost can
// never be on water at all (`canExpandOnto`), so a gate for ocean or exosea
// would be dead configuration that reads as a rule.
const TERRAIN_GATE = {
  island: 'ocean', // you need boats to reach one
  tundra: 'tundra', exotundra: 'tundra',
  desert: 'desert', exodesert: 'desert',
  mountain: 'mountain', exomountain: 'mountain',
  asteroid: 'asteroid',
  moon: 'moon', lunar_crater: 'moon',
  mars: 'mars', mars_ice: 'mars', mars_mountain: 'mars',
  exoplains: 'exoplanet', exohills: 'exoplanet', exomoon: 'exoplanet',
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
  // AN OUTPOST IS NEVER ON WATER. Water still yields once your border reaches
  // it — control spreads onto it and it pays its :gold: — but it can never be
  // settled, and so can never be built on either. This replaces the old `ocean`
  // TERRAIN_GATE path: crossing the sea is done by landing on a gated region's
  // BORDER, not by settling a chain of ocean tiles.
  if (isWater(t.terrain)) return false
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
 * SETTLE ANYTHING YOU CAN SEE THAT TOUCHES YOU. Three ways in, and no others:
 *
 *  1. ADJACENT — a visible tile next to ground you control. Note this is
 *     adjacency to the CONTROLLED border, not to an improvement, so it reaches
 *     one ring further out than the old "must already be controlled" rule.
 *  2. FOOTHOLD — the border of a gated region you have not entered yet (the
 *     New World, the Moon, Mars, the exoplanet). This is the ONLY way in: you
 *     cannot appear in the middle of Mars, and since outposts can no longer sit
 *     on water you cannot walk a chain of ocean tiles there either.
 *  3. SPECK — an isolated island/asteroid/star that nothing is ever adjacent to.
 *     The border-first rule would strand these forever.
 *
 *  city — an improved tile that may become a city
 */
export function expansionTargets(world, unlocks) {
  const improve = []
  const city = []
  const seen = new Set()

  const offer = (t) => {
    if (!t || t.improved || seen.has(t)) return
    if (!canExpandOnto(world, t, unlocks)) return
    seen.add(t)
    improve.push(t)
  }

  // 1. Adjacent: the controlled tiles themselves, and everything touching them.
  for (const t of world.terr.controlled) {
    offer(t)
    for (const n of neighbors(t.q, t.r)) offer(world.at(n.q, n.r))
  }

  // 2. Footholds: the border of a gated region you have not entered yet.
  for (const [region, gate] of Object.entries(GATED_REGIONS)) {
    if (!unlocks.has(gate) || regionEntered(world, region)) continue
    for (const t of world.terr.borders[region] ?? []) offer(t)
  }

  // 3. Isolated specks stay reachable for the whole run, not just the first time.
  for (const t of world.terr.isolated) offer(t)

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
// City connections
// ---------------------------------------------------------------------------
//
// Cities wire themselves together automatically — no tech required — and every
// tile ON a connection route earns bonus gold (see tileYield / mods.connectionGold).
// Road techs only make the routes richer and extend reposition range; they do
// not create the network.
//
// The topology (see docs/design.md § Road network):
//   - ON THE OLD WORLD, a city connects to the PALACE by the shortest land route,
//     UNLESS some other city C' is both nearer the palace than it is AND nearer to
//     it than the palace is — then it connects to every such C' instead. (Those
//     hook toward the palace themselves, so the whole thing stays joined while
//     hugging the terrain instead of firing spokes from the capital.)
//   - ANYWHERE ELSE — a separate landmass with no palace to root on — a city
//     connects to its two nearest cities on the SAME landmass.
//   - Routes are LAND ONLY: passable, controlled, and neither water nor open void
//     (celestial-body surfaces are fine). A tile on two routes still counts once.

/** May a connection route run through this tile? Land you control, no sea/void. */
function routable(world, t) {
  return t && t.controlled && visible(world, t) && isPassable(t.terrain) &&
    !isWater(t.terrain) && travelClass(t.terrain) !== 'void'
}

/**
 * Shortest routable path between two tiles as an ordered tile list (inclusive),
 * or null if there is none. Plain BFS — routes are short and recomputed rarely.
 */
function routeBetween(world, from, to) {
  if (!routable(world, from) || !routable(world, to)) return null
  const prev = new Map()
  const seen = new Set([from])
  const q = [from]
  while (q.length) {
    const t = q.shift()
    if (t === to) break
    for (const n of neighbors(t.q, t.r)) {
      const o = world.tiles.get(hkey(n.q, n.r))
      if (!o || seen.has(o) || !routable(world, o)) continue
      seen.add(o)
      prev.set(o, t)
      q.push(o)
    }
  }
  if (!seen.has(to)) return null
  const path = []
  for (let t = to; t; t = prev.get(t)) { path.push(t); if (t === from) break }
  return path
}

/** Route distances from `city` to every other city (Infinity if unreachable). */
function cityDistances(world, city, others) {
  const dist = new Map([[city, 0]])
  const seen = new Set([city])
  const q = [city]
  const targets = new Set(others)
  let found = 0
  while (q.length && found < targets.size) {
    const t = q.shift()
    for (const n of neighbors(t.q, t.r)) {
      const o = world.tiles.get(hkey(n.q, n.r))
      if (!o || seen.has(o) || !routable(world, o)) continue
      seen.add(o)
      dist.set(o, dist.get(t) + 1)
      if (targets.has(o)) found++
      q.push(o)
    }
  }
  return (other) => (dist.has(other) ? dist.get(other) : Infinity)
}

/**
 * (Re)compute the whole connection network from the current city list. Rebuilt,
 * not grown: the old-world rule depends on where every OTHER city sits, so a new
 * city can re-route an old one.
 */
export function layConnections(world) {
  const roads = world.terr.roads
  for (const t of roads) t.road = false
  roads.clear()

  const cities = [...world.terr.cities]
  const palace = world.at(0, 0)
  const paint = (from, to) => {
    const path = routeBetween(world, from, to)
    if (path) for (const t of path) { t.road = true; roads.add(t) }
  }

  for (const city of cities) {
    if (city === palace) continue
    const others = cities.filter((c) => c !== city)

    if (city.region === 'old_world') {
      const distTo = cityDistances(world, city, [palace, ...others])
      const dPalace = distTo(palace)
      // Cities that shortcut this one toward the palace.
      const relays = others.filter((c) =>
        c.region === 'old_world' &&
        distTo(c) < dPalace &&                         // nearer to us than the palace is
        cityDistances(world, c, [palace])(palace) < dPalace) // and nearer the palace than we are
      if (relays.length) { for (const r of relays) paint(city, r) }
      else if (dPalace < Infinity) paint(city, palace)
    } else {
      // Off the old world: nearest two cities on the same landmass.
      const kin = others.filter((c) => c.region === city.region)
      if (!kin.length) continue
      const distTo = cityDistances(world, city, kin)
      const nearest = kin
        .map((c) => ({ c, d: distTo(c) }))
        .filter((x) => x.d < Infinity)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
      for (const { c } of nearest) paint(city, c)
    }
  }
  world.terr.version++
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
  // A city-connection route tile earns BASE gold (1 even with no road tech, more
  // with them), so an outpost on the route doubles it along with the terrain.
  if (t.road && mods) out.gold += mods.connectionGold ?? 0
  if (t.improved) { out.food *= 2; out.production *= 2; out.gold *= 2; out.progress *= 2 }

  if (t.improved && mods?.improved) addInto(out, mods.improved)
  if (t.building) addInto(out, buildingYield(world, t))
  if (t.city) {
    // A city keeps its tile's natural yield and adds its population on top.
    out.production += t.city.pop
    out.gold += t.city.pop
    out.progress += t.city.pop
    if (mods?.cityYields) addInto(out, mods.cityYields)
  }
  // Maglev's rider: a connection tile also earns production equal to the gold it
  // ends up making. Last, so it sees the full (doubled, teched) gold.
  if (t.road && mods?.connectionProd) out.production += out.gold
  return out
}

// ---------------------------------------------------------------------------
// Building effects — a continuous, per-tick yield pass
// ---------------------------------------------------------------------------
//
// Unlike tech effects (one-shot at draft time), a building's effects are ALWAYS
// ACTIVE: they add to tile yields, which then feed the normal accrual. This pass
// reads current board state every tick. See docs/design.md § Buildings.

/** Hex distance from `t` to the nearest OTHER building; a cap when it is alone. */
function distanceToNearestBuilding(world, t, buildings) {
  let best = Infinity
  for (const o of buildings) {
    if (o === t) continue
    const d = lengthOf(t.q - o.q, t.r - o.r)
    if (d < best) best = d
  }
  // No other building anywhere: cap at ~the map radius (implementer's call).
  return Number.isFinite(best) ? best : 40
}

/** Bonus EFFECT LEVELS a building gets from nearby units (Castle Towns / Hybridism). */
function bonusEffectLevels(world, t, mods) {
  let lv = 0
  // Castle Towns: buildings ADJACENT to a class gain effect levels.
  const belc = mods?.buildingEffectLevelAdjacentClass
  if (belc) {
    for (const cls in belc) {
      const amt = belc[cls]
      if (!amt) continue
      if (neighbors(t.q, t.r).some((n) => {
        const o = world.tiles.get(hkey(n.q, n.r))
        return o?.unit && !o.unit.destroyed && o.unit.key === cls
      })) lv += amt
    }
  }
  // Hybridism: a commander's ZOC upgrade bonus ALSO raises the effect level of
  // buildings inside its radius (the same counter, applied to a building target).
  const zocToBuildings = mods?.classZocUpgradeToBuildings
  if (zocToBuildings) {
    for (const cls in zocToBuildings) {
      if (!zocToBuildings[cls]) continue
      const base = UNIT_DEFS[cls]?.zoc ?? 0
      const radius = base + (mods.signalRangeBonus ?? 0) // Communications widens the ZOC
      const bonus = (UNIT_DEFS[cls]?.zocBonus ?? 0) + (mods.classZocUpgradeBonus?.[cls] ?? 0)
      if (base <= 0 || bonus <= 0) continue
      for (const c of world.terr.controlled) {
        if (c.unit?.key === cls && !c.unit.destroyed && lengthOf(t.q - c.q, t.r - c.r) <= radius) { lv += bonus; break }
      }
    }
  }
  return lv
}

/**
 * The per-tile yield bonus contributed by every building on the board, keyed by
 * tile. `era` is the current reveal era (for age-based effects).
 *
 * EFFECT LEVEL scales every one of a building's effect magnitudes by +25% per
 * level, additive. Effective level = its paid upgrade level PLUS any bonus effect
 * levels from adjacent units (Castle Towns) — the two are the same currency, so
 * an unpaid bonus level is worth exactly a paid upgrade for the effects.
 */
/**
 * Evaluate ONE building's effects, calling `add(tile, resource, amount)` for each
 * yield it contributes — with the building's EFFECT-LEVEL multiplier already
 * folded in. Shared by `buildingBonuses` (the board-wide pass) and
 * `buildingOutput` (one building's total, for the card).
 */
function evalBuildingEffects(world, mods, era, t, buildings, add) {
  const def = buildingDef(t.building?.key)
  if (!def?.effects) return
  const effLevel = (t.building.level ?? 1) + bonusEffectLevels(world, t, mods)
  const mult = 1 + 0.25 * (effLevel - 1)
  const put = (tile, res, amt) => { if (amt && res) add(tile, res, amt * mult) }
  // COMMUNICATIONS: every building RADIUS reaches `signalRangeBonus` further.
  const sig = mods?.signalRangeBonus ?? 0
  const disc_ = (tt, radius) => {
    const out = []
    for (const c of disc(tt.q, tt.r, radius + sig)) { const o = world.tiles.get(hkey(c.q, c.r)); if (o) out.push(o) }
    return out
  }
  for (const f of def.effects) {
    switch (f.kind) {
      case 'self_tile_yield_bonus':
        put(t, f.resource, f.amount)
        break
      case 'radius_tile_yield_bonus':
        for (const o of disc_(t, f.radius)) {
          if (f.terrainFilter && o.terrain !== f.terrainFilter) continue
          if (f.hasUnitFilter && !(o.unit && !o.unit.destroyed)) continue
          put(o, f.resource, f.amount)
        }
        break
      case 'radius_city_yield_bonus_per_citizen':
        for (const o of disc_(t, f.radius)) {
          if (!o.city) continue
          put(o, f.resource, (f.flatAmount ?? 0) + (f.perCitizen ?? 0) * (o.city.pop ?? 0))
        }
        break
      case 'yield_growth_per_wave_survived':
        put(t, f.resource, (t.building.wavesSurvived ?? 0) * (f.amount ?? 0))
        break
      case 'yield_growth_per_nearby_unit_death':
        put(t, f.resource, t.building.deathBonus ?? 0)
        break
      case 'radius_yield_bonus_per_building_age':
        for (const o of disc_(t, f.radius)) {
          if (!o.building) continue
          put(o, f.resource, (f.amount ?? 0) * Math.max(0, era - (o.building.builtEra ?? era)))
        }
        break
      case 'self_yield_bonus_per_distance_to_nearest_building':
        put(t, f.resource, (f.perTile ?? 0) * distanceToNearestBuilding(world, t, buildings))
        break
      case 'radius_yield_from_other_base_yields':
        for (const o of disc_(t, f.radius)) {
          const y = terrainOf(o.terrain).yields
          put(o, 'progress', y.food + y.production + y.gold) // "other" base yields = everything but progress
        }
        break
      default:
        break
    }
  }
}

export function buildingBonuses(world, mods = null, era = 0) {
  const bonus = new Map()
  const add = (tile, res, amt) => {
    const b = bonus.get(tile) ?? { food: 0, production: 0, gold: 0, progress: 0 }
    b[res] += amt
    bonus.set(tile, b)
  }
  const buildings = [...world.terr.buildings]
  for (const t of buildings) evalBuildingEffects(world, mods, era, t, buildings, add)
  return bonus
}

/** ONE building's total per-tick output (summed across every tile it feeds). */
export function buildingOutput(world, t, mods = null, era = 0) {
  const out = { food: 0, production: 0, gold: 0, progress: 0 }
  const buildings = [...world.terr.buildings]
  evalBuildingEffects(world, mods, era, t, buildings, (_tile, res, amt) => { out[res] += amt })
  return out
}

/**
 * Summed per-tick output of everything you control, INCLUDING building effects.
 *
 * Percentage modifiers are ADDITIVE per resource and applied ONCE at the end —
 * sum the bonuses, then ×(1 + bonus). Chaining them multiplicatively is how v2's
 * late game ran away, so don't.
 */
export function territoryYield(world, mods, era = 0) {
  const bonus = buildingBonuses(world, mods, era)
  const csty = mods?.classSelfTileYield
  const out = { food: 0, production: 0, gold: 0, progress: 0 }
  for (const t of world.terr.controlled) {
    const y = tileYield(world, t, mods)
    out.food += y.food
    out.production += y.production
    out.gold += y.gold
    out.progress += y.progress
    // Building bonuses (and a unit's class self-tile yield) are flat adds on top,
    // and only for tiles that actually yield (controlled AND revealed).
    if (!visible(world, t)) continue
    const b = bonus.get(t)
    if (b) { out.food += b.food; out.production += b.production; out.gold += b.gold; out.progress += b.progress }
    // A unit of a class with a self-tile yield (Corvee Garrisons) adds to its own
    // tile — the unit equivalent of a building's self_tile_yield_bonus.
    if (csty && t.unit && !t.unit.destroyed) {
      const uy = csty[t.unit.key]
      if (uy) for (const k of ['food', 'production', 'gold', 'progress']) if (uy[k]) out[k] += uy[k]
    }
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

/**
 * A building's placement RULES, evaluated against a tile. A key the engine does
 * not implement is permissive (returns true), so a wonder's descriptive rule
 * never blocks placement — only the rules that mean something are enforced.
 */
const PLACEMENT_PREDICATES = {
  land: (w, t) => isLand(t.terrain),
  water: (w, t) => isWater(t.terrain),
  coast: (w, t) => t.terrain === 'coast',
  tundra: (w, t) => t.terrain === 'tundra' || t.terrain === 'exotundra',
  desert: (w, t) => t.terrain === 'desert' || t.terrain === 'exodesert',
  hills: (w, t) => t.terrain === 'hills' || t.terrain === 'exohills',
  mountain: (w, t) => t.terrain === 'mountain' || t.terrain === 'exomountain' || t.terrain === 'mars_mountain',
  space: (w, t) => t.terrain === 'space' || t.terrain === 'deep_space',
  exoplanet: (w, t) => t.region === 'exoplanet',
  singularity: (w, t) => t.terrain === 'singularity',
  new_world: (w, t) => t.region === 'new_world',
  off_earth: (w, t) => t.band && t.band !== 'earth',
  city: (w, t) => !!t.city,
  adjacent_city: (w, t) => neighbors(t.q, t.r).some((n) => w.at(n.q, n.r)?.city),
}
export const matchesPlacement = (world, t, key) =>
  PLACEMENT_PREDICATES[key] ? PLACEMENT_PREDICATES[key](world, t) : true

/**
 * May a granted BUILDING go here? Controlled, revealed, passable, nothing there
 * yet — and matching every rule in the building's `placement` list. When a
 * building declares a placement (e.g. `space`), those rules are the authority
 * and OVERRIDE the default open-void exclusion, so a Space Telescope can sit on
 * open space while an unrestricted building still cannot.
 */
export function canPlaceBuilding(world, t, def = null) {
  if (!t || !t.controlled || !visible(world, t) || t.building || !isPassable(t.terrain)) return false
  const rules = def?.placement
  if (rules && rules.length) return rules.every((k) => matchesPlacement(world, t, k))
  return !NEVER.has(t.terrain)
}

/**
 * May a granted UNIT stand here? Same as a building, but one may sit underneath
 * it — and never on the palace tile, where combat's occupancy map already holds
 * the palace and would shadow the unit.
 *
 * `def` is the unit CLASS being placed; its `placement` terrain set is the rule
 * that keeps a naval unit at sea and everything else off it. Passing no def
 * falls back to "any passable ground you control", which is what the palace
 * garrison and the debug paths want.
 */
export function canPlaceUnit(world, t, def = null) {
  if (!t || !t.controlled || !visible(world, t) || t.unit) return false
  if (t.q === 0 && t.r === 0) return false
  if (NEVER.has(t.terrain)) return false
  // A unit and a building share a tile freely — EXCEPT a fortification, which is
  // a structure in its own right and cannot stand on top of a building.
  if (def?.blockedByBuilding && t.building) return false
  // `unrestricted` (Admiralty) drops the class's terrain restriction: anywhere
  // passable you control is legal.
  if (def) return def.unrestricted ? isPassable(t.terrain) : def.placement.has(t.terrain)
  return isPassable(t.terrain)
}

export function placeBuilding(world, t, key, def = null, builtEra = 0) {
  if (!canPlaceBuilding(world, t, def)) return false
  // Per-building state for the effect passes: when it was built (Museum), the
  // waves it has weathered (Library), and permanent bonuses it has accrued
  // (Gazette's death growth). See data/buildings.js § building effects.
  t.building = { key, level: 1, builtEra, wavesSurvived: 0, deathBonus: 0 }
  world.terr.buildings.add(t)
  world.terr.version++
  return true
}

export function placeUnit(world, t, key, def = null) {
  if (!canPlaceUnit(world, t, def)) return false
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
    // Preserve `builtEra` so a rebuild keeps its age; the growth counters
    // (waves survived, death bonus) are lost with the instance and start fresh.
    ruin = { kind: 'building', key: t.building.key, level: t.building.level ?? 1, builtEra: t.building.builtEra ?? 0 }
    t.building = null
    terr.buildings.delete(t)
  } else if (t.city) {
    // A razed city comes back one pop SMALLER, permanently — and, being a ruin,
    // grows no population at all until gold rebuilds it (it is out of the growth
    // set). Never below 1: a city is at least a hamlet.
    ruin = { kind: 'city', pop: Math.max(1, (t.city.pop ?? 1) - 1), food: t.city.food }
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
    t.building = { key: ruin.key, level: ruin.level, builtEra: ruin.builtEra ?? 0, wavesSurvived: 0, deathBonus: 0 }
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

/**
 * City tooltip data: per-tick food income (the same `rate` growCities banks),
 * the cost of the next pop, and how many ticks until it arrives.
 */
export function cityGrowthInfo(world, t, growthMult = 1) {
  if (!t.city) return null
  const rate = foodAround(world, t) * (waterAround(world, t) ? CITY_WATER_BONUS : 1) * growthMult
  const cost = cityPopCost(t.city.pop)
  const remaining = Math.max(0, cost - (t.city.food ?? 0))
  const ticks = rate > 0 ? Math.ceil(remaining / rate) : Infinity
  return { rate, cost, food: t.city.food ?? 0, pop: t.city.pop, ticks }
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
