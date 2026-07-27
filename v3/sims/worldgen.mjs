// Headless world-generation harness.
//
//   node sims/worldgen.mjs            # 200 seeds, invariant report + sample map
//   node sims/worldgen.mjs 500        # more seeds
//   node sims/worldgen.mjs 200 --map=7  # dump the Earth map for seed 7
//
// This is the regression test for map generation: worldgen must produce a
// playable, viable map for every seed, and this proves it without a browser.

import { generateWorld } from '../src/game/world/worldgen.js'
import { validate, yieldOf } from '../src/game/world/invariants.js'
import { BANDS, STAGES } from '../src/game/world/regions.js'
import { terrainOf } from '../src/game/world/terrain.js'
import { key } from '../src/game/hex/coords.js'

const args = process.argv.slice(2)
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 200)
const mapArg = args.find((a) => a.startsWith('--map='))

const GLYPH = {
  plains: '"', forest: '^', hills: 'n', mountain: 'A', desert: '.', tundra: '-',
  island: 'o', coast: '~', ocean: '≈',
  space: ' ', deep_space: '·', asteroid: '*', moon: 'M', mars: 'R',
  exoplains: 'e', exohills: 'E', exomountain: 'X', exosea: 's',
  planet: 'P', star: 'S', singularity: '@', battlefield: '#', fallout: '%',
}

function asciiMap(world, maxD) {
  const cells = new Map()
  let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity
  for (const t of world.list) {
    if (t.d > maxD) continue
    const col = t.q
    const row = t.r + Math.floor(t.q / 2)
    minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row)
    minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col)
    let g = GLYPH[t.terrain] ?? '?'
    if (t.encampment) g = '!'
    if (t.q === 0 && t.r === 0) g = '0'
    cells.set(`${row}|${col}`, g)
  }
  const lines = []
  for (let row = minRow; row <= maxRow; row++) {
    let s = ''
    for (let col = minCol; col <= maxCol; col++) {
      // flat-top: odd columns sit half a row lower — pad odd columns for legibility
      s += (cells.get(`${row}|${col}`) ?? ' ') + ' '
    }
    lines.push((col0Pad(row) + s).replace(/\s+$/, ''))
  }
  return lines.join('\n')
}
const col0Pad = () => ''

function pct(n, d) { return d ? `${((n / d) * 100).toFixed(1)}%` : '—' }

// --- Sweep -----------------------------------------------------------------

console.log(`\n=== worldgen sweep: ${N} seeds ===`)
const violations = new Map()
let clean = 0
let attemptsTotal = 0
const t0 = Date.now()
const stageCounts = STAGES.map(() => [])
const yieldTotals = []

for (let s = 1; s <= N; s++) {
  const w = generateWorld(s)
  attemptsTotal += w.attempt
  const v = w.violations ?? validate(w)
  if (!v.length) clean++
  for (const msg of v) {
    const norm = msg.replace(/\d+(\.\d+)?/g, 'N')
    violations.set(norm, (violations.get(norm) ?? 0) + 1)
  }
  STAGES.forEach((_, i) => {
    stageCounts[i].push(w.list.filter((t) => t.revealStage === i).length)
  })
  yieldTotals.push(yieldOf(w.list.filter((t) => t.band === 'earth')))
}
const ms = Date.now() - t0

console.log(`clean maps      : ${clean}/${N}  (${pct(clean, N)})`)
console.log(`re-rolls needed : ${attemptsTotal} total across ${N} seeds`)
console.log(`time            : ${ms}ms  (${(ms / N).toFixed(1)}ms per world)`)

if (violations.size) {
  console.log('\nresidual violations (after re-rolls):')
  for (const [msg, n] of [...violations].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}x  ${msg}`)
  }
} else {
  console.log('\nno residual violations — every seed produced a valid map.')
}

// --- Reveal ladder ---------------------------------------------------------

console.log('\n=== reveal ladder (tiles added per stage) ===')
let running = 0
STAGES.forEach((st, i) => {
  const arr = stageCounts[i]
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length
  const min = Math.min(...arr)
  running += avg
  const bar = '#'.repeat(Math.max(1, Math.round(avg / 18)))
  console.log(
    `${String(i).padStart(2)} ${st.name.padEnd(21)} +${avg.toFixed(0).padStart(5)}  ` +
    `(min ${String(min).padStart(4)})  total ${running.toFixed(0).padStart(5)}  ${bar}`,
  )
})

// --- Earth yield balance ---------------------------------------------------

console.log('\n=== Earth base yield (sum over all Earth tiles) ===')
for (const res of ['food', 'production', 'gold', 'progress']) {
  const vals = yieldTotals.map((y) => y[res])
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  console.log(`  ${res.padEnd(11)} avg ${avg.toFixed(0).padStart(5)}   min ${Math.min(...vals)}   max ${Math.max(...vals)}`)
}

// --- Sample map ------------------------------------------------------------

const sampleSeed = mapArg ? Number(mapArg.split('=')[1]) : 1
const sample = generateWorld(sampleSeed)
console.log(`\n=== Earth, seed ${sampleSeed} (0 palace, ! encampment) ===`)
console.log(asciiMap(sample, BANDS.earth.max))

const st = sample.stats
console.log(`\ntotal tiles: ${st.total}`)
console.log('regions    :', Object.entries(st.byRegion).map(([k, n]) => `${k}=${n}`).join('  '))
console.log('encampments:', sample.encampments.length, 'in wedges', [...new Set(sample.encampments.map((t) => t.wedge))].sort().join(','))
if (sample.violations?.length) console.log('violations :', sample.violations)
console.log()
