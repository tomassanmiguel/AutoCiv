// Terrain registry (v3).
//
// One entry per concrete terrain:
//   sprite/ext — file under /sprites/tiles/
//   domain     — 'land' | 'water' | 'space'  (placement bucket)
//   passable   — can a ground unit enter? (mountains cannot)
//   yields     — BASE per-tick output of a CONTROLLED tile, by resource
//
// Yields are multi-resource: a forest gives food AND progress. A tile with an
// IMPROVEMENT doubles these (see world/territory.js); a city adds its population
// to production / gold / progress on top of the tile's natural yield.
//
// Off-world terrain is deliberately an order of magnitude richer than Earth —
// that is the whole incentive to push outward.

export const RESOURCES = ['food', 'production', 'gold', 'progress']

export const RES_ICON = {
  food: '/sprites/icons/food.png',
  production: '/sprites/icons/production.png',
  gold: '/sprites/icons/gold.png',
  progress: '/sprites/icons/progress.png',
}

const Y = (food = 0, production = 0, gold = 0, progress = 0) => ({ food, production, gold, progress })

const T = (key, name, sprite, domain, passable, yields, opts = {}) => [
  key, { key, name, sprite, domain, passable, yields, ...opts },
]

export const TERRAIN = Object.fromEntries([
  // --- Earth: land ---
  T('plains', 'Plains', 'plains', 'land', true, Y(2)),
  T('forest', 'Forest', 'forest', 'land', true, Y(1, 0, 0, 1)),
  T('hills', 'Hills', 'hills', 'land', true, Y(1, 1)),
  T('desert', 'Desert', 'desert', 'land', true, Y(0, 0, 3)),
  T('tundra', 'Tundra', 'tundra', 'land', true, Y(0, 0, 0, 2)),
  T('mountain', 'Mountain', 'mountain', 'land', false, Y(0, 2), { note: 'Impassable to ground units. Cities cannot be founded here.' }),
  T('island', 'Island', 'island', 'land', true, Y(2, 0, 1)),

  // --- Earth: water ---
  T('coast', 'Coast', 'full-coast', 'water', true, Y(1, 0, 2)),
  T('ocean', 'Ocean', 'ocean', 'water', true, Y(0, 0, 2)),
  T('river', 'River', 'full-coast', 'water', true, Y(1, 0, 2), { note: 'Blocks ground movement until bridged.' }),

  // --- Space ---
  T('space', 'Space', 'space', 'space', true, Y()),
  T('deep_space', 'Deep Space', 'deep-space', 'space', true, Y()),
  T('asteroid', 'Asteroid', 'asteroid', 'space', true, Y(0, 25, 25)),
  T('moon', 'Moon', 'moon', 'space', true, Y(0, 0, 15)),
  T('lunar_crater', 'Lunar Crater', 'lunar-crater', 'space', true, Y(0, 0, 0, 25), { ext: 'jpg' }),
  T('mars', 'Martian Plains', 'mars', 'space', true, Y(0, 0, 0, 10)),
  T('mars_mountain', 'Martian Mountains', 'mars-mountains', 'space', false, Y(0, 10), { note: 'Impassable to ground units.' }),
  T('mars_ice', 'Martian Ice Cap', 'mars-ice-cap', 'space', true, Y(3), { ext: 'jfif' }),

  // --- Exoplanet: 10x the Earth equivalent ---
  T('exoplains', 'Exoplains', 'exoplains', 'land', true, Y(20)),
  T('exohills', 'Exohills', 'exohills', 'land', true, Y(10, 10)),
  T('exomountain', 'Exomountain', 'exomountain', 'land', false, Y(0, 20), { note: 'Impassable to ground units. Cities cannot be founded here.' }),
  T('exosea', 'Exosea', 'exosea', 'water', true, Y(10, 0, 20)),
  T('exodesert', 'Exodesert', 'desert', 'land', true, Y(0, 0, 30)),
  T('exotundra', 'Exotundra', 'tundra', 'land', true, Y(0, 0, 0, 20)),
  T('exomoon', 'Exomoon', 'moon', 'space', true, Y(0, 0, 150)),

  // --- Outer galaxy ---
  T('planet', 'Planet', 'planet', 'space', true, Y(75, 75, 75)),
  T('star', 'Star', 'star', 'space', true, Y(0, 150, 150)),
  T('singularity', 'Singularity', 'singularity', 'space', true, Y(0, 0, 0, 250)),

  // --- Special ---
  T('battlefield', 'Battlefield', 'battlefield', 'space', true, Y(), { note: 'Enemy forces muster here.' }),
  T('fallout', 'Fallout', 'fallout', 'land', true, Y(), { note: 'Poisoned ground.' }),
])

export const terrainOf = (k) => TERRAIN[k] ?? TERRAIN.plains
export const spriteUrl = (k) => {
  const d = terrainOf(k)
  return `/sprites/tiles/${d.sprite}.${d.ext ?? 'png'}`
}
export const isPassable = (k) => terrainOf(k).passable
export const isLand = (k) => terrainOf(k).domain === 'land'
export const isWater = (k) => terrainOf(k).domain === 'water'

/** Total of a terrain's base yields — handy for sorting/among-tile comparisons. */
export const yieldTotal = (k) => {
  const y = terrainOf(k).yields
  return y.food + y.production + y.gold + y.progress
}

// --- Travel classes --------------------------------------------------------
// What an enemy DOMAIN checks when pathing. Finer than `domain`, because open
// space and a celestial body are both "space" for placement but very different
// for movement: EVERYTHING crosses the void, only astral walks on a body.
//
//   void    — open space; every domain crosses it (it is how a host arrives)
//   land    — ordinary ground
//   water   — needs amphibious or better
//   body    — the Moon, Mars, asteroids, planets, stars… astral only
//   blocked — mountains; astral only
const TRAVEL_BODY = new Set([
  'asteroid', 'moon', 'lunar_crater', 'mars', 'mars_ice', 'planet', 'star', 'singularity', 'exomoon',
])
const TRAVEL_BLOCKED = new Set(['mountain', 'exomountain', 'mars_mountain'])
const TRAVEL_VOID = new Set(['space', 'deep_space', 'battlefield'])

export function travelClass(k) {
  if (TRAVEL_BLOCKED.has(k)) return 'blocked'
  if (TRAVEL_BODY.has(k)) return 'body'
  if (TRAVEL_VOID.has(k)) return 'void'
  return terrainOf(k).domain === 'water' ? 'water' : 'land'
}
