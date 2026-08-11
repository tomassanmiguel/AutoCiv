// Axial hex coordinates (q, r), FLAT-TOP orientation.
//
// This is the single source of truth for hex geometry — every distance, range,
// adjacency and pixel-layout question in v3 routes through here. Nothing else
// should do row/col style arithmetic.
//
//   neighbours : 6 fixed offsets (DIRS)
//   distance   : (|dq| + |dr| + |dq+dr|) / 2
//   pixel      : x = size * 3/2 * q,  y = size * sqrt(3) * (r + q/2)
//
// `size` is the hex CIRCUMRADIUS (centre → corner). A flat-top hex is therefore
// 2*size wide and sqrt(3)*size tall.

export const DIRS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
]

export const SQRT3 = Math.sqrt(3)

/** Map/Set key for a hex. */
export const key = (q, r) => `${q},${r}`

export function parseKey(k) {
  const i = k.indexOf(',')
  return { q: Number(k.slice(0, i)), r: Number(k.slice(i + 1)) }
}

/** Axial length (distance from the origin). */
export const lengthOf = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2

/** Distance between two hexes. */
export const distance = (aq, ar, bq, br) => lengthOf(aq - bq, ar - br)

/** The 6 neighbours of a hex. */
export function neighbors(q, r) {
  const out = []
  for (const [dq, dr] of DIRS) out.push({ q: q + dq, r: r + dr })
  return out
}

/** Hexes at EXACTLY radius n from (cq, cr), walked in order around the ring. */
export function ring(cq, cr, n) {
  if (n <= 0) return [{ q: cq, r: cr }]
  const out = []
  let q = cq + DIRS[4][0] * n
  let r = cr + DIRS[4][1] * n
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < n; j++) {
      out.push({ q, r })
      q += DIRS[i][0]
      r += DIRS[i][1]
    }
  }
  return out
}

/** Every hex within radius n of (cq, cr) — a filled disc. */
export function disc(cq, cr, n) {
  const out = []
  for (let dq = -n; dq <= n; dq++) {
    const lo = Math.max(-n, -dq - n)
    const hi = Math.min(n, -dq + n)
    for (let dr = lo; dr <= hi; dr++) out.push({ q: cq + dq, r: cr + dr })
  }
  return out
}

/** Axial → pixel (centre of the hex). */
export function toPixel(q, r, size) {
  return { x: size * 1.5 * q, y: size * SQRT3 * (r + q / 2) }
}

/** Round fractional axial coords to the nearest hex. */
export function round(qf, rf) {
  const xf = qf
  const zf = rf
  const yf = -qf - rf
  let x = Math.round(xf)
  let y = Math.round(yf)
  let z = Math.round(zf)
  const dx = Math.abs(x - xf)
  const dy = Math.abs(y - yf)
  const dz = Math.abs(z - zf)
  if (dx > dy && dx > dz) x = -y - z
  else if (dy > dz) y = -x - z
  else z = -x - y
  return { q: x, r: z }
}

/** Pixel → axial (inverse of toPixel, rounded to a real hex). */
export function fromPixel(x, y, size) {
  const q = (2 / 3) * x / size
  const r = (-x / 3 + (SQRT3 / 3) * y) / size
  return round(q, r)
}

/**
 * Which of the 6 wedges a hex falls in (0..5), by angle around the origin.
 * Wedges are the natural "approach sectors" of a radial map — enemies arrive
 * from one, and defence is organised by them.
 */
export function wedgeOf(q, r) {
  const { x, y } = toPixel(q, r, 1)
  if (x === 0 && y === 0) return 0
  const a = Math.atan2(y, x) // -PI..PI
  return Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 3)) % 6
}

/**
 * Breadth-first distances from a set of start hexes over a caller-supplied
 * passability test. Returns Map<key, steps>. This is the primitive that enemy
 * flow-fields and territory reachability will both be built on.
 */
export function bfs(starts, passable, maxSteps = Infinity) {
  const dist = new Map()
  let frontier = []
  for (const s of starts) {
    const k = key(s.q, s.r)
    if (dist.has(k)) continue
    dist.set(k, 0)
    frontier.push(s)
  }
  let step = 0
  while (frontier.length && step < maxSteps) {
    step++
    const next = []
    for (const h of frontier) {
      for (const n of neighbors(h.q, h.r)) {
        const nk = key(n.q, n.r)
        if (dist.has(nk)) continue
        if (!passable(n.q, n.r)) continue
        dist.set(nk, step)
        next.push(n)
      }
    }
    frontier = next
  }
  return dist
}
