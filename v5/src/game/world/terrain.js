// Terrain registry (v4).
//
// One entry per concrete terrain:
//   sprite/ext — file under /sprites/tiles/
//   domain     — 'land' | 'water' | 'space'  (placement bucket)
//   passable   — can a ground unit enter / a city be founded? (mountains cannot)
//   yields     — BASE per-tick output a tile contributes to a NEARBY CITY, as
//                { food, gold, progress }. food → pop growth, gold → the city's
//                gold output, progress → the city's progress output.
//
// Combat modifiers (opts), applied to whatever unit STANDS on the tile:
//   dmgTakenMult — multiply incoming damage (forest 0.75)
//   rangeBonus   — +attack range while stationed here (hills +1)
//   hpDrainFrac  — lose this fraction of max HP each turn (desert 0.05)
//
// v4 changes from v3: production is GONE (folded into gold/progress); the `star`
// terrain is removed (redundant with the singularity); yields follow the v4
// terrain table in docs/design.md §2a. Off-world terrain is an order of magnitude
// richer than Earth — the incentive to push outward. Progress from TERRAIN is
// off-Earth only; early progress comes from city pop.

export const RESOURCES = ['food', 'gold', 'progress']

export const RES_ICON = {
  food: '/sprites/icons/food.png',
  gold: '/sprites/icons/gold.png',
  progress: '/sprites/icons/progress.png',
}

const Y = (food = 0, gold = 0, progress = 0) => ({ food, gold, progress })

const T = (key, name, sprite, domain, passable, yields, opts = {}) => [
  key, { key, name, sprite, domain, passable, yields, ...opts },
]

export const TERRAIN = Object.fromEntries([
  // --- Earth: land ---
  T('plains', 'Plains', 'plains', 'land', true, Y(3)),
  T('hills', 'Hills', 'hills', 'land', true, Y(1, 10), { rangeBonus: 1, note: '+1 :range: to units stationed here.' }),
  T('forest', 'Forest', 'forest', 'land', true, Y(1, 10), { dmgTakenMult: 0.75, note: 'Units here take 25% less damage.' }),
  T('desert', 'Desert', 'desert', 'land', true, Y(), { hpDrainFrac: 0.05, note: 'Units here lose 5% max HP each turn.' }),
  T('tundra', 'Tundra', 'tundra', 'land', true, Y(1)),
  T('mountain', 'Mountain', 'mountain', 'land', false, Y(0, 20), { note: 'Impassable to ground units. A nearby city still harvests its :gold:.' }),
  T('island', 'Island', 'island', 'land', true, Y(2, 5)),

  // --- Earth: water (enemies EMBARK here; cannot be built on) ---
  T('coast', 'Coast', 'full-coast', 'water', true, Y(2, 5)),
  T('ocean', 'Ocean', 'ocean', 'water', true, Y(1, 20)),
  T('river', 'River', 'full-coast', 'water', true, Y(1, 5), { note: 'Blocks ground movement — a natural channel.' }),

  // --- Space ---
  T('space', 'Space', 'space', 'space', true, Y()),
  T('deep_space', 'Deep Space', 'deep-space', 'space', true, Y()),
  T('outer_space', 'Outer Space', 'deep-space', 'space', true, Y()), // same sprite as deep space, distinct name
  T('asteroid', 'Asteroid', 'asteroid', 'space', true, Y(0, 1000)),
  T('moon', 'Moon', 'moon', 'space', true, Y(0, 0, 50)),
  T('lunar_crater', 'Lunar Crater', 'lunar-crater', 'space', true, Y(0, 500), { ext: 'jpg' }),
  T('mars', 'Martian Plains', 'mars', 'space', true, Y(0, 0, 50)),
  T('mars_mountain', 'Martian Mountains', 'mars-mountains', 'space', false, Y(0, 20), { note: 'Impassable to ground units.' }),
  T('mars_ice', 'Martian Ice Cap', 'mars-ice-cap', 'space', true, Y(2), { ext: 'jfif' }),

  // --- Exoplanet: 4x the Earth equivalent ---
  T('exoplains', 'Exoplains', 'exoplains', 'land', true, Y(12)),
  T('exohills', 'Exohills', 'exohills', 'land', true, Y(4, 40), { rangeBonus: 1, note: '+1 :range: to units stationed here.' }),
  T('exomountain', 'Exomountain', 'exomountain', 'land', false, Y(0, 80), { note: 'Impassable to ground units.' }),
  T('exosea', 'Exosea', 'exosea', 'water', true, Y(4, 80)),
  T('exodesert', 'Exodesert', 'desert', 'land', true, Y(), { hpDrainFrac: 0.05, note: 'Units here lose 5% max HP each turn.' }),
  T('exotundra', 'Exotundra', 'tundra', 'land', true, Y(4)),
  T('exomoon', 'Exomoon', 'moon', 'space', true, Y(0, 0, 200)),

  // --- Outer galaxy ---
  T('planet', 'Planet', 'planet', 'space', true, Y(100, 1000, 1000)),
  T('star', 'Star', 'star', 'space', true, Y(0, 1000)),
  T('singularity', 'Singularity', 'singularity', 'space', false, Y(), { note: 'Impassable — a chokepoint. No yield.' }),

  // --- Special ---
  T('battlefield', 'Battlefield', 'battlefield', 'space', true, Y(), { note: 'Enemy forces muster here.' }),
])

export const terrainOf = (k) => TERRAIN[k] ?? TERRAIN.plains
export const spriteUrl = (k) => {
  const d = terrainOf(k)
  return `/sprites/tiles/${d.sprite}.${d.ext ?? 'png'}`
}
export const isPassable = (k) => terrainOf(k).passable
export const isLand = (k) => terrainOf(k).domain === 'land'
export const isWater = (k) => terrainOf(k).domain === 'water'

/** Combat: multiply incoming damage on this terrain (forest softens hits). */
export const dmgTakenMult = (k) => terrainOf(k).dmgTakenMult ?? 1
/** Combat: +attack range while stationed on this terrain (hills). */
export const rangeBonusOf = (k) => terrainOf(k).rangeBonus ?? 0
/** Combat: fraction of max HP lost each turn on this terrain (desert). */
export const hpDrainFrac = (k) => terrainOf(k).hpDrainFrac ?? 0

/** Total of a terrain's base yields — handy for sorting/among-tile comparisons. */
export const yieldTotal = (k) => {
  const y = terrainOf(k).yields
  return y.food + y.gold + y.progress
}

// --- Travel classes --------------------------------------------------------
// What an enemy DOMAIN checks when pathing. Finer than `domain`, because open
// space and a celestial body are both "space" for placement but very different
// for movement: EVERYTHING crosses the void, only astral walks on a body.
//
//   void    — open space; every domain crosses it (it is how a host arrives)
//   land    — ordinary ground
//   water   — needs amphibious or better
//   body    — the Moon, Mars, asteroids, planets… astral only
//   blocked — mountains & singularities; astral only (singularity is a hard wall)
const TRAVEL_BODY = new Set([
  'asteroid', 'moon', 'lunar_crater', 'mars', 'mars_ice', 'planet', 'exomoon',
])
const TRAVEL_BLOCKED = new Set(['mountain', 'exomountain', 'mars_mountain', 'singularity'])
const TRAVEL_VOID = new Set(['space', 'deep_space', 'battlefield'])

export function travelClass(k) {
  if (TRAVEL_BLOCKED.has(k)) return 'blocked'
  if (TRAVEL_BODY.has(k)) return 'body'
  if (TRAVEL_VOID.has(k)) return 'void'
  return terrainOf(k).domain === 'water' ? 'water' : 'land'
}
