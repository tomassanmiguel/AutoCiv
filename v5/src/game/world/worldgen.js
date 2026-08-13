// Deterministic hex-world generation for v5.
//
// A filled disc of hexes around the palace at (0,0). Terrain is assigned from
// seeded fBm value-noise fields (elevation, moisture, temperature) sampled in
// pixel space, so terrain forms coherent blobs — varied but reproducible from a
// seed. Pure: no Math.random, no React.
import { disc, key, lengthOf, toPixel } from '../hex/coords.js'

export const WORLD_RADIUS = 6

// integer lattice hash → [0,1)
function h2(ix, iy, seed) {
  let n = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (seed | 0) * 1442695041
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  n = n ^ (n >>> 16)
  return (n >>> 0) / 4294967296
}
const smooth = (t) => t * t * (3 - 2 * t)
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const a = h2(ix, iy, seed), b = h2(ix + 1, iy, seed), c = h2(ix, iy + 1, seed), d = h2(ix + 1, iy + 1, seed)
  const sx = smooth(fx), sy = smooth(fy)
  const top = a + (b - a) * sx, bot = c + (d - c) * sx
  return top + (bot - top) * sy
}
function fbm(x, y, seed) {
  let v = 0, amp = 0.5, freq = 1, norm = 0
  for (let o = 0; o < 4; o++) { v += amp * vnoise(x * freq, y * freq, seed + o * 9173); norm += amp; amp *= 0.5; freq *= 2 }
  return v / norm
}
// widen the spread (fBm clusters near 0.5)
const contrast = (v, k = 1.7) => Math.min(1, Math.max(0, (v - 0.5) * k + 0.5))

export function generateWorld(seed = 1) {
  const s = (seed >>> 0) || 1
  const byKey = new Map()
  const tiles = []
  const FE = 0.34, FM = 0.30, FT = 0.26 // field frequencies

  let maxY = 1
  for (const { q, r } of disc(0, 0, WORLD_RADIUS)) { const { y } = toPixel(q, r, 1); maxY = Math.max(maxY, Math.abs(y)) }

  for (const { q, r } of disc(0, 0, WORLD_RADIUS)) {
    const d = lengthOf(q, r)
    const { x, y } = toPixel(q, r, 1)
    let terrain
    if (d <= 1) {
      terrain = 'plains'
    } else {
      const e = contrast(fbm(x * FE, y * FE, s))
      const m = contrast(fbm(x * FM + 40, y * FM - 40, s + 5555))
      const cold = fbm(x * FT - 80, y * FT + 80, s + 9999) * 0.55 + (Math.abs(y) / maxY) * 0.5 // poles + noise
      if (e < 0.30) terrain = 'coast'
      else if (e > 0.82) terrain = 'mountain'
      else if (e > 0.68) terrain = 'hills'
      else if (m < 0.30 && d >= 2) terrain = 'desert'
      else if (m > 0.58) terrain = 'forest'
      else if (m > 0.54) terrain = 'hills'
      else terrain = 'plains'
      // cold outskirts → tundra (only lowland, not the core)
      if (cold > 0.66 && (terrain === 'plains' || terrain === 'forest')) terrain = 'tundra'
    }
    const t = { q, r, key: key(q, r), terrain, dist: d }
    tiles.push(t)
    byKey.set(t.key, t)
  }

  // Guarantee a little coast near the core so naval is reachable early.
  if (tiles.filter((t) => t.terrain === 'coast').length < 3) {
    let n = 0
    for (const t of tiles) { if (n >= 3) break; if (t.dist >= 2 && t.dist <= 3 && t.terrain !== 'coast') { t.terrain = 'coast'; n++ } }
  }
  return { tiles, byKey, radius: WORLD_RADIUS, palace: { q: 0, r: 0 } }
}
