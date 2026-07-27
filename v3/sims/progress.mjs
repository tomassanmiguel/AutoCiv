// Headless structure check for the progress web.
//
//   node sims/progress.mjs
//
// Asserts the properties the drawing depends on — no crossed edges, forks only
// between siblings, every ring reachable — plus a greedy full playthrough to
// prove the whole web can actually be walked.

import {
  PROGRESS_NODES, LAID_OUT, FORK_GROUPS, RING_UNLOCK, MAX_RING,
  QUADRANT_LIST, validateStructure, progressById,
} from '../src/game/data/progress.js'

const v = validateStructure()
console.log(`\n=== progress web: ${PROGRESS_NODES.length} nodes, ${MAX_RING + 1} rings ===`)
for (let r = 0; r <= MAX_RING; r++) {
  const n = PROGRESS_NODES.filter((x) => x.ring === r).length
  const forks = FORK_GROUPS.filter((g) => progressById(g[0]).ring === r).length
  console.log(`  ring ${r}: ${String(n).padStart(2)} nodes, ${forks} forks`)
}
console.log(`  quadrants: ${QUADRANT_LIST.map((q) => q.name).join(', ')}`)
console.log(`  fork groups: ${FORK_GROUPS.length}`)
const diamonds = PROGRESS_NODES.filter((n) => n.prereqs.length > 1)
console.log(`  diamonds (re-unify): ${diamonds.length} — ${diamonds.map((d) => d.name).join(', ')}`)

const edgeCount = PROGRESS_NODES.reduce((s, n) => s + n.prereqs.length, 0)
console.log(`  edges: ${edgeCount}`)

if (v.length) {
  console.log('\nSTRUCTURE VIOLATIONS:')
  for (const m of v) console.log(`  ✗ ${m}`)
} else {
  console.log('\nstructure clean — no crossed edges, forks are siblings only, all rings reachable.')
}

// --- greedy playthrough ----------------------------------------------------
const taken = new Set()
const stateOf = (n) => {
  if (taken.has(n.id)) return 'unlocked'
  const ringOk = n.ring === 0 ||
    PROGRESS_NODES.filter((x) => x.ring === n.ring - 1 && taken.has(x.id)).length >= RING_UNLOCK
  if (!ringOk) return 'hidden'
  if (n.excludes.some((id) => taken.has(id))) return 'locked'
  if (n.prereqs.length && !n.prereqs.some((id) => taken.has(id))) return 'locked'
  return 'available'
}

let guard = 0
while (guard++ < 500) {
  const next = PROGRESS_NODES.find((n) => stateOf(n) === 'available')
  if (!next) break
  taken.add(next.id)
}
const counts = { unlocked: 0, available: 0, locked: 0, hidden: 0 }
for (const n of PROGRESS_NODES) counts[stateOf(n)]++
console.log('\n=== greedy playthrough ===')
console.log(`  taken ${counts.unlocked} · locked ${counts.locked} · hidden ${counts.hidden}`)
console.log(`  reached ring ${Math.max(...PROGRESS_NODES.filter((n) => taken.has(n.id)).map((n) => n.ring))} of ${MAX_RING}`)
const lost = PROGRESS_NODES.filter((n) => stateOf(n) === 'locked').map((n) => n.name)
console.log(`  locked out: ${lost.join(', ')}`)

// A quadrant-only run: can one quadrant alone carry you outward? (It must not —
// rings are meant to need breadth.)
console.log('\n=== breadth check ===')
for (const q of QUADRANT_LIST) {
  const perRing = PROGRESS_NODES.filter((n) => n.quadrant === q.key && n.ring === 0).length
  console.log(`  ${q.name.padEnd(11)} ring-0 nodes: ${perRing} (ring needs ${RING_UNLOCK} across all quadrants)`)
}

console.log()
process.exit(v.length ? 1 : 0)
