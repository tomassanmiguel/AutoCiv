// Deterministic hex-world generation for v5.
//
// A filled disc of hexes around the palace at (0,0). Terrain is assigned from
// two seeded value-noise fields (elevation, moisture) so a run's map is varied
// but reproducible from its seed. Pure — no Math.random, no React.
import { disc, key, lengthOf, neighbors } from '../hex/coords.js'

export const WORLD_RADIUS = 6

function hash(q, r, s) {
  let x = Math.sin((q * 127.1 + r * 311.7) * 0.6 + s * 0.017) * 43758.5453
  x -= Math.floor(x)
  return x
}
// A slightly smoothed field: blend the tile hash with its neighbours so terrain
// forms small blobs rather than per-tile static.
function field(q, r, s) {
  let sum = hash(q, r, s) * 2
  let w = 2
  for (const n of neighbors(q, r)) { sum += hash(n.q, n.r, s); w += 1 }
  return sum / w
}

export function generateWorld(seed = 1) {
  const s = (seed >>> 0) || 1
  const byKey = new Map()
  const tiles = []
  for (const { q, r } of disc(0, 0, WORLD_RADIUS)) {
    const d = lengthOf(q, r)
    let terrain
    if (d <= 1) {
      terrain = 'plains'
    } else {
      const e = field(q, r, s)
      const m = field(q, r, s + 1000)
      if (e < 0.30 && d >= 2) terrain = 'coast'
      else if (e > 0.80) terrain = 'mountain'
      else if (e > 0.62) terrain = 'hills'
      else if (m < 0.28 && d >= 3) terrain = 'desert'
      else if (d >= WORLD_RADIUS - 1 && m > 0.6) terrain = 'tundra'
      else if (m > 0.66) terrain = 'forest'
      else if (m > 0.42) terrain = 'hills'
      else terrain = 'plains'
    }
    const t = { q, r, key: key(q, r), terrain, dist: d }
    tiles.push(t)
    byKey.set(t.key, t)
  }
  // Guarantee at least a little coast near the core so naval is reachable early.
  let coastCount = tiles.filter((t) => t.terrain === 'coast').length
  if (coastCount < 3) {
    for (const t of tiles) {
      if (coastCount >= 4) break
      if (t.dist >= 2 && t.dist <= 3 && t.terrain !== 'coast') { t.terrain = 'coast'; coastCount++ }
    }
  }
  return { tiles, byKey, radius: WORLD_RADIUS, palace: { q: 0, r: 0 } }
}
