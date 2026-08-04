// Headless structure check for the progress web.
//
//   node sims/progress.mjs
//
// Asserts the properties the drawing depends on — ring sizes, parents one ring
// inside, no crossed edges, exclusivity within a ring — plus a greedy full
// playthrough to prove the whole web can actually be walked.

import {
  PROGRESS_NODES, FORK_GROUPS, ringUnlock, ringSlots, MAX_RING,
  QUADRANT_LIST, validateStructure, progressById,
} from '../src/game/data/progress.js'

const v = validateStructure()
const slots = QUADRANT_LIST.length * Array.from({ length: MAX_RING + 1 }, (_, r) => ringSlots(r)).reduce((a, b) => a + b, 0)
console.log(`\n=== progress web: ${PROGRESS_NODES.length} nodes in ${slots} slots, ${MAX_RING + 1} rings ===`)
for (let r = 0; r <= MAX_RING; r++) {
  const n = PROGRESS_NODES.filter((x) => x.ring === r).length
  const cap = ringSlots(r) * QUADRANT_LIST.length
  const rootless = PROGRESS_NODES.filter((x) => x.ring === r && !x.prereqs.length).length
  const forks = FORK_GROUPS.filter((g) => progressById(g[0])?.ring === r).length
  console.log(
    `  ring ${r}: ${String(n).padStart(2)}/${String(cap).padStart(2)} nodes` +
    ` · ${String(cap - n).padStart(2)} gaps · ${String(rootless).padStart(2)} rootless` +
    ` · ${forks} forks · opens ring ${r + 1} at ${ringUnlock(r)}`,
  )
}
for (const q of QUADRANT_LIST) {
  const n = PROGRESS_NODES.filter((x) => x.quadrant === q.key).length
  console.log(`  ${q.name.padEnd(11)} ${n} nodes`)
}
const edgeCount = PROGRESS_NODES.reduce((s, n) => s + n.prereqs.length, 0)
const subCount = PROGRESS_NODES.reduce((s, n) => s + n.sub.length, 0)
const wired = PROGRESS_NODES.filter((n) => n.effects.length).length
console.log(`  edges: ${edgeCount} · sub-definitions referenced: ${subCount} · WIRED nodes: ${wired}`)

if (v.length) {
  console.log('\nSTRUCTURE VIOLATIONS:')
  for (const m of v) console.log(`  ✗ ${m}`)
} else {
  console.log('\nstructure clean — ring sizes exact, no crossed edges, forks within a ring, all rings reachable.')
}

// --- greedy playthrough ----------------------------------------------------
const taken = new Set()
const stateOf = (n) => {
  if (taken.has(n.id)) return 'unlocked'
  const ringOk = n.ring === 0 ||
    PROGRESS_NODES.filter((x) => x.ring === n.ring - 1 && taken.has(x.id)).length >= ringUnlock(n.ring - 1)
  if (!ringOk) return 'hidden'
  if (n.excludes.some((id) => taken.has(id))) return 'locked'
  if (n.prereqs.length && !n.prereqs.some((id) => taken.has(id))) return 'locked'
  return 'available'
}

let guard = 0
while (guard++ < 1000) {
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
if (lost.length) console.log(`  closed off by forks: ${lost.join(', ')}`)

console.log()
process.exit(v.length ? 1 : 0)
