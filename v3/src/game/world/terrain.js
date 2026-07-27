// Terrain registry (v3).
//
// One entry per concrete terrain. A terrain declares:
//   sprite    — file under /sprites/tiles/
//   domain    — 'land' | 'water' | 'space'  (which units/buildings may sit here)
//   passable  — can a non-flying ground unit enter? (mountains cannot)
//   yield     — { res, amount } base per-tick output of the tile, or null
//
// YIELD NUMBERS ARE PLACEHOLDERS. The v3 rule locked so far is the mapping —
// water → gold, hills → production, plains → food, forest → progress, and
// desert/tundra produce nothing. Off-world terrain is deliberately far richer
// than Earth (that is the incentive to expand outward); the exact magnitudes
// are for the economy pass.

export const RESOURCES = ['food', 'production', 'gold', 'progress']

export const RES_ICON = {
  food: '/sprites/icons/food.png',
  production: '/sprites/icons/production.png',
  gold: '/sprites/icons/gold.png',
  progress: '/sprites/icons/progress.png',
}

const T = (key, name, sprite, domain, passable, res, amount, note) => [
  key,
  { key, name, sprite, domain, passable, yield: res ? { res, amount } : null, note },
]

export const TERRAIN = Object.fromEntries([
  // --- Earth: land ---
  T('plains', 'Plains', 'plains', 'land', true, 'food', 2),
  T('forest', 'Forest', 'forest', 'land', true, 'progress', 2),
  T('hills', 'Hills', 'hills', 'land', true, 'production', 2),
  T('desert', 'Desert', 'desert', 'land', true, null, 0, 'Produces nothing on its own.'),
  T('tundra', 'Tundra', 'tundra', 'land', true, null, 0, 'Produces nothing on its own.'),
  T('mountain', 'Mountain', 'mountain', 'land', false, null, 0, 'Impassable to ground units.'),
  T('island', 'Island', 'island', 'land', true, 'food', 3),

  // --- Earth: water ---
  T('coast', 'Coast', 'full-coast', 'water', true, 'gold', 2),
  T('ocean', 'Ocean', 'ocean', 'water', true, 'gold', 3),
  T('river', 'River', 'full-coast', 'water', true, 'gold', 2, 'Blocks ground movement until bridged.'),

  // --- Space ---
  T('space', 'Space', 'space', 'space', true, null, 0),
  T('deep_space', 'Deep Space', 'deep-space', 'space', true, null, 0),
  T('asteroid', 'Asteroid', 'asteroid', 'space', true, 'production', 6),
  T('moon', 'Moon', 'moon', 'space', true, 'gold', 8),
  T('mars', 'Mars', 'mars', 'space', true, 'production', 8),

  // --- Exoplanet ---
  T('exoplains', 'Exoplains', 'exoplains', 'land', true, 'food', 12),
  T('exohills', 'Exohills', 'exohills', 'land', true, 'production', 12),
  T('exomountain', 'Exomountain', 'exomountain', 'land', false, null, 0, 'Impassable to ground units.'),
  T('exosea', 'Exosea', 'exosea', 'water', true, 'gold', 12),
  T('exodesert', 'Exodesert', 'desert', 'land', true, null, 0, 'Produces nothing on its own.'),
  T('exotundra', 'Exotundra', 'tundra', 'land', true, null, 0, 'Produces nothing on its own.'),
  T('exomoon', 'Exomoon', 'moon', 'space', true, 'gold', 15),

  // --- Outer galaxy ---
  T('planet', 'Planet', 'planet', 'space', true, 'food', 30),
  T('star', 'Star', 'star', 'space', true, 'gold', 40),
  T('singularity', 'Singularity', 'singularity', 'space', true, 'progress', 50),

  // --- Special ---
  T('battlefield', 'Battlefield', 'battlefield', 'space', true, null, 0, 'Enemy forces muster here.'),
  T('fallout', 'Fallout', 'fallout', 'land', true, null, 0, 'Poisoned ground.'),
])

export const terrainOf = (k) => TERRAIN[k] ?? TERRAIN.plains
export const spriteUrl = (k) => `/sprites/tiles/${terrainOf(k).sprite}.png`
export const isPassable = (k) => terrainOf(k).passable
export const isLand = (k) => terrainOf(k).domain === 'land'
export const isWater = (k) => terrainOf(k).domain === 'water'

// --- Travel classes --------------------------------------------------------
// What an enemy DOMAIN checks when pathing. Finer than `domain`, because empty
// space and a celestial body are both "space" for placement but very different
// for movement: EVERYTHING crosses the void, only astral walks on a body.
//
//   void    — open space; every domain crosses it (it is how a host arrives)
//   land    — ordinary ground
//   water   — needs amphibious or better
//   body    — the Moon, Mars, asteroids, planets, stars… astral only
//   blocked — mountains; astral only
const TRAVEL_BODY = new Set(['asteroid', 'moon', 'mars', 'planet', 'star', 'singularity', 'exomoon'])
const TRAVEL_BLOCKED = new Set(['mountain', 'exomountain'])
const TRAVEL_VOID = new Set(['space', 'deep_space', 'battlefield'])

export function travelClass(k) {
  if (TRAVEL_BLOCKED.has(k)) return 'blocked'
  if (TRAVEL_BODY.has(k)) return 'body'
  if (TRAVEL_VOID.has(k)) return 'void'
  return terrainOf(k).domain === 'water' ? 'water' : 'land'
}
