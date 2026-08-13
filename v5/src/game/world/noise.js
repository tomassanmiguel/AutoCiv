// Seeded RNG + value noise for world generation.
//
// Everything here is deterministic from a seed: the same seed always produces
// the same world, so a run only needs to persist its seed. No Math.random().

/** mulberry32 — small, fast, good enough for terrain. */
export function makeRng(seed) {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Integer hash → [0,1). */
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177)
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t) => t * t * (3 - 2 * t)

/** Single-octave value noise over a unit grid. */
function value2(x, y, seed) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const a = hash2(x0, y0, seed)
  const b = hash2(x0 + 1, y0, seed)
  const c = hash2(x0, y0 + 1, seed)
  const d = hash2(x0 + 1, y0 + 1, seed)
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

/**
 * Fractal (fBm) value noise → a function (x, y) => [0,1].
 * `scale` is the size of one base feature in the caller's units.
 */
export function makeNoise2D(seed, { scale = 6, octaves = 4, persistence = 0.5 } = {}) {
  return (x, y) => {
    let amp = 1
    let freq = 1 / scale
    let sum = 0
    let norm = 0
    for (let o = 0; o < octaves; o++) {
      sum += amp * value2(x * freq, y * freq, seed + o * 7919)
      norm += amp
      amp *= persistence
      freq *= 2
    }
    return sum / norm
  }
}

/** Fisher–Yates using a seeded rng. Shuffles in place and returns the array. */
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
