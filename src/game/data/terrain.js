import { GRID, ROWS, COLS, COLUMN_SPECIALS } from './map.js'

// ---------------------------------------------------------------------------
// Concrete terrain registry. `key` is used internally; `name` shows in the
// tooltip; `sprite` is the served image path (or null -> flat color fallback).
// ---------------------------------------------------------------------------
export const TERRAIN = {
  plains:     { name: 'Plains',     sprite: '/sprites/tiles/plains.png',     color: '#5a7d3a' },
  forest:     { name: 'Forest',     sprite: '/sprites/tiles/forest.png',     color: '#2f5a2f' },
  mountain:   { name: 'Mountain',   sprite: '/sprites/tiles/mountain.png',   color: '#6b6b6b' },
  coast:      { name: 'Coast',      sprite: '/sprites/tiles/coast.png',      color: '#3a6b7d' },
  ocean:      { name: 'Ocean',      sprite: '/sprites/tiles/ocean.png',      color: '#1f3a6b' },
  island:     { name: 'Island',     sprite: '/sprites/tiles/island.png',     color: '#3a6b5a' },
  space:      { name: 'Space',      sprite: '/sprites/tiles/space.png',      color: '#0a0a1a' },
  deep_space: { name: 'Deep Space', sprite: '/sprites/tiles/deep-space.png', color: '#05050f' },
  asteroid:   { name: 'Asteroid',   sprite: '/sprites/tiles/asteroid.png',   color: '#4a4a55' },
  mars:       { name: 'Mars',       sprite: '/sprites/tiles/mars.png',       color: '#8a4a30' },
  moon:       { name: 'Moon',       sprite: '/sprites/tiles/moon.png',       color: '#8a8a92' },
  exohills:   { name: 'Exo Hills',  sprite: '/sprites/tiles/exohills.png',   color: '#6b4a7d' },
  exoplains:  { name: 'Exo Plains', sprite: '/sprites/tiles/exoplains.png',  color: '#7d5a8a' },
  exosea:     { name: 'Exo Sea',    sprite: '/sprites/tiles/exosea.png',     color: '#3a4a8a' },
  planet:     { name: 'Planet',     sprite: '/sprites/tiles/planet.png',     color: '#4a5a9a' },
  star:       { name: 'Star',       sprite: '/sprites/tiles/star.png',       color: '#d8b24b' },
  singularity:{ name: 'Singularity',sprite: '/sprites/tiles/singularity.png',color: '#1a0a2a' },
}

// Labels that count as "earth" or "moon/mars" for the Space asteroid adjacency
// rule ("Space asteroids cannot be adjacent to any earth tile or moon/mars").
const NON_SPACE_LABELS = new Set([
  'Coast', 'Ocean', 'Old World', 'New World', 'Mountains', 'Moon', 'Mars',
])

// --- Deterministic RNG (mulberry32) so the resolved map is stable. ---
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(arr, rng) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const key = (r, c) => `${r},${c}`

function cellsWithLabel(label) {
  const out = []
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      if (GRID[r][c - 1] === label) out.push([r, c])
    }
  }
  return out
}

// Build a pool of exactly `total` concrete keys matching the given weighted
// mix, distributing any rounding remainder to the largest-weight entries.
function weightedPool(total, weights) {
  const sum = weights.reduce((s, w) => s + w.weight, 0)
  const pool = []
  const counts = weights.map((w) => Math.floor((total * w.weight) / sum))
  let assigned = counts.reduce((s, n) => s + n, 0)
  // Distribute leftovers to entries with the largest weight first.
  const order = weights.map((w, i) => i).sort((a, b) => weights[b].weight - weights[a].weight)
  let oi = 0
  while (assigned < total) {
    counts[order[oi % order.length]]++
    assigned++
    oi++
  }
  weights.forEach((w, i) => {
    for (let n = 0; n < counts[i]; n++) pool.push(w.key)
  })
  return pool
}

/**
 * Resolve every design label in the grid to a concrete terrain key.
 * Returns a Map keyed "row,col" -> terrain key. Deterministic for a given seed.
 */
export function resolveTerrainGrid(seed = 1) {
  const rng = mulberry32(seed)
  const out = new Map()

  // Straight concrete labels.
  const direct = {
    Coast: 'coast',
    Mountains: 'mountain',
    Mars: 'mars',
    Exosea: 'exosea',
    Moon: 'moon',
    Asteroid: 'asteroid',
  }

  // 1) Direct concretes + base fills for region metas.
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      const label = GRID[r][c - 1]
      if (direct[label]) out.set(key(r, c), direct[label])
      else if (label === 'Ocean') out.set(key(r, c), 'ocean')
      else if (label === 'Deep Space') out.set(key(r, c), 'deep_space')
      else if (label === 'Space') out.set(key(r, c), 'space')
      else if (label === 'Galactic') out.set(key(r, c), 'deep_space')
      // Old World / New World / Exoplanet handled by pool below.
    }
  }

  // 2) Old World -> 50/50 plains/forest across the whole region.
  const oldWorld = cellsWithLabel('Old World')
  const owPool = shuffle(weightedPool(oldWorld.length, [
    { key: 'plains', weight: 1 }, { key: 'forest', weight: 1 },
  ]), rng)
  shuffle(oldWorld, rng).forEach(([r, c], i) => out.set(key(r, c), owPool[i]))

  // 3) New World -> plains/forest/mountain in a 5/5/6 ratio.
  const newWorld = cellsWithLabel('New World')
  const nwPool = shuffle(weightedPool(newWorld.length, [
    { key: 'plains', weight: 5 }, { key: 'forest', weight: 5 }, { key: 'mountain', weight: 6 },
  ]), rng)
  shuffle(newWorld, rng).forEach(([r, c], i) => out.set(key(r, c), nwPool[i]))

  // 4) Exoplanet -> 50/50 exoplains/exohills.
  const exo = cellsWithLabel('Exoplanet')
  const exoPool = shuffle(weightedPool(exo.length, [
    { key: 'exoplains', weight: 1 }, { key: 'exohills', weight: 1 },
  ]), rng)
  shuffle(exo, rng).forEach(([r, c], i) => out.set(key(r, c), exoPool[i]))

  // 5) Ocean -> two random island tiles.
  scatter(cellsWithLabel('Ocean'), 2, 'island', out, rng)

  // 6) Deep Space -> two random asteroid tiles.
  scatter(cellsWithLabel('Deep Space'), 2, 'asteroid', out, rng)

  // 7) Space -> two random asteroid tiles, not adjacent to earth/moon/mars.
  const spaceCells = cellsWithLabel('Space').filter(([r, c]) => !adjacentToNonSpace(r, c))
  scatter(spaceCells, 2, 'asteroid', out, rng)

  // 8) Galactic columns -> deep space with per-column special tiles scattered in
  //    (planets / star / singularity), independently per far-right column.
  for (const [colStr, specials] of Object.entries(COLUMN_SPECIALS)) {
    const col = Number(colStr)
    const cells = []
    for (let r = 1; r <= ROWS; r++) {
      if (GRID[r][col - 1] === 'Galactic') cells.push([r, col])
    }
    const pool = shuffle(cells, rng)
    let i = 0
    for (const [terrainKey, count] of Object.entries(specials)) {
      for (let n = 0; n < count && i < pool.length; n++, i++) {
        out.set(key(pool[i][0], pool[i][1]), terrainKey)
      }
    }
  }

  return out
}

function scatter(cells, count, terrainKey, out, rng) {
  shuffle(cells, rng).slice(0, count).forEach(([r, c]) => out.set(key(r, c), terrainKey))
}

function adjacentToNonSpace(r, c) {
  const neighbors = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]
  return neighbors.some(([nr, nc]) => {
    if (nr < 1 || nr > ROWS || nc < 1 || nc > COLS) return false
    return NON_SPACE_LABELS.has(GRID[nr][nc - 1])
  })
}
