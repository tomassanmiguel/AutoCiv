// Endgame analysis.
//
//   node sims/endgame.mjs
//
// Answers two questions the strategy sweep does not:
//   1. What population do cities actually reach by the last era?
//   2. Is pushing out to the space-age tiles worth the expansions, or is it
//      better to keep compounding cities back on Earth?
//
// Q2 is answered by pitting an EARTH-ONLY strategy against ones that chase the
// off-world yields, and by breaking the final output down by region.

import { GameManager } from '../src/game/GameManager.js'
import { terrainOf } from '../src/game/world/terrain.js'
import { foodAround, tileYield, cityPopCost } from '../src/game/world/territory.js'

const SEEDS = [3, 11, 29]
const EARTH_REGIONS = new Set(['old_world', 'new_world', 'island', 'sea'])

const yieldTotal = (t) => {
  const y = terrainOf(t.terrain).yields
  return y.food + y.production + y.gold + y.progress
}
const sum = (o) => o.food + o.production + o.gold + o.progress

// Strategies differ only in WHERE they are willing to settle.
const pickImprove = (targets, allow) => {
  const pool = targets.improve.filter(allow)
  return pool.sort((a, b) => yieldTotal(b) - yieldTotal(a))[0]
}
const pickCity = (g, targets) =>
  targets.city.slice().sort((a, b) => foodAround(g.world, b) - foodAround(g.world, a))[0]

const anywhere = () => true
const earthOnly = (t) => EARTH_REGIONS.has(t.region)

const STRATEGIES = {
  // Chase the best tile anywhere, city every 4th expansion (the sweep's winner).
  'reach-out': (g, targets, st) => {
    st.n = (st.n ?? 0) + 1
    if (st.n % 4 === 0) { const c = pickCity(g, targets); if (c) return { tile: c, mode: 'city' } }
    const t = pickImprove(targets, anywhere)
    if (t) return { tile: t, mode: 'improve' }
    const c = pickCity(g, targets)
    return c ? { tile: c, mode: 'city' } : null
  },
  // Never leave Earth; once Earth is full, everything goes into cities.
  'earth-only': (g, targets, st) => {
    st.n = (st.n ?? 0) + 1
    if (st.n % 4 === 0) { const c = pickCity(g, targets); if (c) return { tile: c, mode: 'city' } }
    const t = pickImprove(targets, earthOnly)
    if (t) return { tile: t, mode: 'improve' }
    const c = pickCity(g, targets)
    return c ? { tile: c, mode: 'city' } : null
  },
  // Off-world the moment it is legal, cities only as a fallback.
  'space-rush': (g, targets) => {
    const off = pickImprove(targets, (t) => !EARTH_REGIONS.has(t.region))
    if (off) return { tile: off, mode: 'improve' }
    const t = pickImprove(targets, anywhere)
    if (t) return { tile: t, mode: 'improve' }
    const c = pickCity(g, targets)
    return c ? { tile: c, mode: 'city' } : null
  },
}

function run(seed, name) {
  const g = new GameManager(seed, {})
  const strat = STRATEGIES[name]
  const st = {}
  let total = 0
  let guard = 0
  while (g.era < 28 && guard++ < 400000) {
    if (g.selection) {
      if (g.selection.type === 'progress') {
        const p = g.selection.offers[0]
        if (p) g.chooseOffer(p); else g.skipSelection()
      } else {
        const mv = strat(g, g.expansionTargets, st)
        if (mv) g.expandOnto(mv.tile, mv.mode); else g.skipSelection()
      }
      continue
    }
    total += sum(g.output)
    g.gameTick()
  }
  const pops = [...g.world.terr.cities].map((t) => t.city.pop).sort((a, b) => b - a)

  // Final output split by TERRAIN, not region — the scattered planets and stars
  // sit inside the 'deep_space' region, so a region breakdown credits the yield
  // to empty space and reads as nonsense.
  const byRegion = {}
  for (const t of g.world.terr.controlled) {
    const y = sum(tileYield(g.world, t))
    if (y <= 0) continue
    const bucket = EARTH_REGIONS.has(t.region) ? `earth: ${t.terrain}` : t.terrain
    byRegion[bucket] = (byRegion[bucket] ?? 0) + y
  }
  const offworldTiles = [...g.world.terr.controlled].filter((t) => !EARTH_REGIONS.has(t.region)).length
  const out = { total, rate: sum(g.output), pops, byRegion, offworldTiles, ...g.stats }
  g.stop()
  return out
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)

console.log('\n=== endgame: where does the output come from? ===\n')
console.log('  strategy      cumulative   rate/tick   tiles  off-world  cities   pop')
const results = {}
for (const name of Object.keys(STRATEGIES)) {
  const rs = SEEDS.map((s) => run(s, name))
  results[name] = rs
  console.log(
    `  ${name.padEnd(12)} ${Math.round(avg(rs.map((r) => r.total))).toLocaleString().padStart(11)}` +
    ` ${Math.round(avg(rs.map((r) => r.rate))).toLocaleString().padStart(11)}` +
    ` ${avg(rs.map((r) => r.controlled)).toFixed(0).padStart(7)}` +
    ` ${avg(rs.map((r) => r.offworldTiles)).toFixed(0).padStart(10)}` +
    ` ${avg(rs.map((r) => r.cities)).toFixed(0).padStart(7)}` +
    ` ${avg(rs.map((r) => r.pop)).toFixed(0).padStart(5)}`)
}

console.log('\n=== city populations at era 27 (reach-out, seed 11) ===')
const sample = results['reach-out'][SEEDS.indexOf(11)]
const p = sample.pops
console.log(`  cities ${p.length} · total pop ${p.reduce((a, b) => a + b, 0)}`)
console.log(`  largest ${p[0]} · median ${p[Math.floor(p.length / 2)]} · smallest ${p[p.length - 1]}`)
const spread = {}
for (const v of p) spread[v] = (spread[v] ?? 0) + 1
console.log(`  distribution: ${Object.entries(spread).sort((a, b) => b[0] - a[0]).map(([k, n]) => `pop ${k}×${n}`).join(', ')}`)
console.log(`  next pop after ${p[0]} would cost ${cityPopCost(p[0]).toLocaleString()} food`)

console.log('\n=== final output by region (reach-out, averaged) ===')
const regionTotals = {}
for (const r of results['reach-out']) {
  for (const [k, v] of Object.entries(r.byRegion)) regionTotals[k] = (regionTotals[k] ?? 0) + v / SEEDS.length
}
const grand = Object.values(regionTotals).reduce((a, b) => a + b, 0)
for (const [k, v] of Object.entries(regionTotals).sort((a, b) => b[1] - a[1])) {
  const share = ((v / grand) * 100).toFixed(1)
  console.log(`  ${k.padEnd(12)} ${Math.round(v).toLocaleString().padStart(8)} /tick  ${share.padStart(5)}%  ${'#'.repeat(Math.max(1, Math.round(v / grand * 50)))}`)
}
console.log()
