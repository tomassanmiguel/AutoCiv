// Headless structure check for the progress web.
//
//   node sims/progress.mjs
//
// Asserts the properties the drawing depends on — one ring per age, every ring
// legible at its radius, exclusivity within a ring, no crossed edges if any
// dependencies come back — plus a greedy playthrough to prove the whole web can
// be walked.

import {
  PROGRESS_NODES, FORK_GROUPS, ringUnlock, RING_AGES, MAX_RING,
  QUADRANT_LIST, validateStructure, progressById, nodeSpacing,
} from '../src/game/data/progress.js'

const real = PROGRESS_NODES.filter((n) => !n.tbd)
const tbd = PROGRESS_NODES.length - real.length
const v = validateStructure()

console.log(`\n=== progress web: ${real.length} techs + ${tbd} TBD slots, ${RING_AGES.length} rings ===\n`)
const head = ['ring', 'age'.padEnd(13), ...QUADRANT_LIST.map((q) => q.name.slice(0, 4).padStart(5)), 'total'.padStart(6), 'opens'.padStart(6), 'gap'.padStart(5)]
console.log('  ' + head.join(' '))
for (let r = 0; r <= MAX_RING; r++) {
  const per = QUADRANT_LIST.map((q) => real.filter((n) => n.ring === r && n.quadrant === q.key).length)
  const total = per.reduce((a, b) => a + b, 0)
  // Tightest quadrant of this ring, counting TBDs — that is what has to fit.
  const widest = Math.max(...QUADRANT_LIST.map((q) => PROGRESS_NODES.filter((n) => n.ring === r && n.quadrant === q.key).length))
  const gap = nodeSpacing(r, widest)
  console.log(
    `  ${String(r).padStart(4)} ${RING_AGES[r].padEnd(13)} ` +
    per.map((n) => String(n).padStart(5)).join(' ') +
    ` ${String(total).padStart(6)} ${String(r < MAX_RING ? ringUnlock(r) : '-').padStart(6)} ${String(Math.round(gap)).padStart(5)}`,
  )
}
for (const q of QUADRANT_LIST) {
  console.log(`  ${q.name.padEnd(11)} ${real.filter((n) => n.quadrant === q.key).length} techs`)
}
const subCount = real.reduce((s, n) => s + n.sub.length, 0)
const wired = real.filter((n) => n.effects.length).length
const deps = real.reduce((s, n) => s + n.prereqs.length, 0)
console.log(`  forks: ${FORK_GROUPS.length} · dependencies: ${deps} · sub-definitions: ${subCount} · WIRED: ${wired}`)

if (v.length) {
  console.log('\nSTRUCTURE VIOLATIONS:')
  for (const m of v) console.log(`  ✗ ${m}`)
} else {
  console.log('\nstructure clean — one ring per age, every ring legible, forks within a ring.')
}

// --- greedy playthrough ----------------------------------------------------
const taken = new Set()
const stateOf = (n) => {
  if (taken.has(n.id)) return 'unlocked'
  const ringOk = n.ring === 0 ||
    PROGRESS_NODES.filter((x) => x.ring === n.ring - 1 && taken.has(x.id)).length >= ringUnlock(n.ring - 1)
  if (!ringOk) return 'hidden'
  if (n.tbd) return 'locked'
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
console.log('\n=== greedy playthrough ===')
console.log(`  taken ${taken.size} of ${real.length} techs`)
console.log(`  reached ring ${Math.max(...PROGRESS_NODES.filter((n) => taken.has(n.id)).map((n) => n.ring))} of ${MAX_RING}`)
const lost = real.filter((n) => stateOf(n) === 'locked').map((n) => n.name)
if (lost.length) console.log(`  closed off by forks: ${lost.join(', ')}`)
const picksToEnd = Array.from({ length: MAX_RING }, (_, r) => ringUnlock(r)).reduce((a, b) => a + b, 0)
console.log(`  picks needed to open the Galactic ring: ${picksToEnd}`)

console.log()
process.exit(v.length ? 1 : 0)
