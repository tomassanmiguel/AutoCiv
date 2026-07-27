// Economy / expansion strategy harness.
//
//   node sims/economy.mjs            # compare strategies over short/mid/long
//   node sims/economy.mjs --trace    # per-era trace of the best strategy
//
// Every expansion is one decision with two depths:
//   WIDE — improve a fresh tile: doubles its yield AND pulls its six neighbours
//          into your control, which is what makes the NEXT expansion possible
//   TALL — upgrade an improvement into a city: no new ground, but the city's
//          population compounds forever and adds to production/gold/progress
//
// The question this answers: when is each worth it, and does the trade-off
// actually bite over 28 eras?

import { GameManager } from '../src/game/GameManager.js'
import { TICKS_PER_ERA, ERAS } from '../src/game/data/eras.js'
import { terrainOf } from '../src/game/world/terrain.js'
import { canFoundCity, foodAround } from '../src/game/world/territory.js'

const trace = process.argv.includes('--trace')
const SEEDS = [3, 11, 29]

const yieldTotal = (t) => {
  const y = terrainOf(t.terrain).yields
  return y.food + y.production + y.gold + y.progress
}

// --- strategies -------------------------------------------------------------
// Each returns { tile, mode } given the legal targets.

const bestImprove = (targets) =>
  targets.improve.slice().sort((a, b) => yieldTotal(b) - yieldTotal(a))[0]

const bestCity = (g, targets) =>
  targets.city.slice().sort((a, b) => foodAround(g.world, b) - foodAround(g.world, a))[0]

const STRATEGIES = {
  // Never build a city — pure land grab. Once land runs out it has nothing left
  // to spend on, which is exactly the point: land is finite.
  wide: (g, targets) => {
    const t = bestImprove(targets)
    return t ? { tile: t, mode: 'improve' } : null
  },

  // Wide while land remains, then tall — the fair version of `wide`, so the
  // long-horizon comparison is not just "one strategy wastes its expansions".
  wideThenTall: (g, targets) => {
    const t = bestImprove(targets)
    if (t) return { tile: t, mode: 'improve' }
    const c = bestCity(g, targets)
    return c ? { tile: c, mode: 'city' } : null
  },

  // Build a city the moment one is legal.
  tall: (g, targets) => {
    const c = bestCity(g, targets)
    if (c) return { tile: c, mode: 'city' }
    const t = bestImprove(targets)
    return t ? { tile: t, mode: 'improve' } : null
  },

  // Every Nth expansion goes tall.
  ...Object.fromEntries([2, 3, 4, 6].map((n) => [`every${n}`, (g, targets, state) => {
    state.n = (state.n ?? 0) + 1
    if (state.n % n === 0) {
      const c = bestCity(g, targets)
      if (c) return { tile: c, mode: 'city' }
    }
    const t = bestImprove(targets)
    if (t) return { tile: t, mode: 'improve' }
    const c = bestCity(g, targets)
    return c ? { tile: c, mode: 'city' } : null
  }])),

  // Wide until an era threshold, then tall for the rest of the run.
  ...Object.fromEntries([4, 8, 12, 16].map((era) => [`switch@${era}`, (g, targets) => {
    if (g.era >= era) {
      const c = bestCity(g, targets)
      if (c) return { tile: c, mode: 'city' }
    }
    const t = bestImprove(targets)
    if (t) return { tile: t, mode: 'improve' }
    const c = bestCity(g, targets)
    return c ? { tile: c, mode: 'city' } : null
  }])),

  // Take whichever single action adds the most output RIGHT NOW.
  greedy: (g, targets) => {
    let best = null
    let bestGain = -1
    for (const t of targets.improve.slice(0, 40)) {
      const y = terrainOf(t.terrain).yields
      const gain = (y.food + y.production + y.gold + y.progress) // doubling adds one more copy
      if (gain > bestGain) { bestGain = gain; best = { tile: t, mode: 'improve' } }
    }
    for (const t of targets.city.slice(0, 40)) {
      if (!canFoundCity(g.world, t)) continue
      const gain = 3 // pop 1 -> +1 production/gold/progress; the compounding is what pays later
      if (gain > bestGain) { bestGain = gain; best = { tile: t, mode: 'city' } }
    }
    return best
  },
}

// --- runner -----------------------------------------------------------------

const HORIZONS = [
  { name: 'short  (eras 0-5)', era: 6 },
  { name: 'medium (eras 0-14)', era: 15 },
  { name: 'long   (eras 0-27)', era: 28 },
]

const sum = (t) => t.food + t.production + t.gold + t.progress

/** One full run, recording cumulative output at each horizon. */
function run(seed, strategyName) {
  const g = new GameManager(seed, {})
  const strat = STRATEGIES[strategyName]
  const state = {}
  let total = 0
  const marks = {}
  const perEra = []
  let guard = 0

  while (g.era < 28 && guard++ < 400000) {
    if (g.selection) {
      if (g.selection.type === 'progress') {
        const pick = g.selection.offers[0]
        if (pick) g.chooseOffer(pick); else g.skipSelection()
      } else {
        const move = strat(g, g.expansionTargets, state)
        if (move) g.expandOnto(move.tile, move.mode); else g.skipSelection()
      }
      continue
    }
    const eraBefore = g.era
    const out = g.output
    total += sum(out)
    g.gameTick()
    if (g.era !== eraBefore) {
      perEra.push({ era: eraBefore, rate: sum(out), ...g.stats })
      for (const h of HORIZONS) {
        if (g.era === h.era) marks[h.era] = { total, rate: sum(g.output), ...g.stats }
      }
    }
  }
  marks[28] = marks[28] ?? { total, rate: sum(g.output), ...g.stats }
  g.stop()
  return { marks, perEra }
}

// --- comparison -------------------------------------------------------------

console.log('\n=== expansion strategy comparison ===')
console.log(`averaged over ${SEEDS.length} seeds; "cumulative" sums output over every tick to that point\n`)

const names = Object.keys(STRATEGIES)
const runs = {}
for (const n of names) runs[n] = SEEDS.map((s) => run(s, n))

for (const h of HORIZONS) {
  const rows = names.map((n) => {
    const ms = runs[n].map((r) => r.marks[h.era]).filter(Boolean)
    const avg = (f) => ms.reduce((a, m) => a + f(m), 0) / (ms.length || 1)
    return {
      n,
      total: avg((m) => m.total), rate: avg((m) => m.rate),
      improved: avg((m) => m.improved), cities: avg((m) => m.cities), pop: avg((m) => m.pop),
    }
  }).sort((a, b) => b.total - a.total)

  console.log(`--- ${h.name} ---`)
  console.log('  strategy     cumulative   rate/tick   improved  cities   pop')
  for (const r of rows) {
    console.log(
      `  ${r.n.padEnd(12)} ${Math.round(r.total).toLocaleString().padStart(10)}` +
      `   ${Math.round(r.rate).toLocaleString().padStart(9)}` +
      `   ${r.improved.toFixed(0).padStart(8)} ${r.cities.toFixed(1).padStart(7)} ${r.pop.toFixed(0).padStart(5)}`)
  }
  console.log()
}

if (trace) {
  console.log('=== per-era trace (seed 11) ===')
  for (const n of ['wide', 'tall', 'every3']) {
    const r = runs[n][SEEDS.indexOf(11)] ?? run(11, n)
    console.log(`
${n}:`)
    console.log('  era  name             rate/tick  improved  cities  pop')
    for (const e of r.perEra) {
      if (e.era % 4 && e.era !== 27) continue
      console.log(`  ${String(e.era).padStart(3)}  ${ERAS[e.era].padEnd(16)} ${String(Math.round(e.rate)).padStart(9)}` +
        `  ${String(e.improved).padStart(8)} ${String(e.cities).padStart(7)} ${String(e.pop).padStart(4)}`)
    }
  }
}
console.log(`
(${TICKS_PER_ERA} ticks per era)
`)
