// Headless campaign harness — plays the WHOLE v4 loop with a greedy AI.
//
//   node sims/campaign.mjs           # 6 seeds, per-seed arc + aggregate
//   node sims/campaign.mjs 12        # more seeds
//   node sims/campaign.mjs 6 --v     # verbose (per-wave lines)
//
// This is the balance + correctness instrument: does the assembled game survive,
// does content reach the player, and does the run reach a WIN or a LOSS? It stays
// green from the first skeleton onward.

import { GameManager } from '../src/game/GameManager.js'
import { UNIT_COSTS } from '../src/game/data/config.js'
import { distance } from '../src/game/hex/coords.js'

const args = process.argv.slice(2)
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 6)
const VERBOSE = args.includes('--v')
const MAX_WAVES = 80

const nearPalace = (ts) => ts.slice().sort((a, b) => distance(a.q, a.r, 0, 0) - distance(b.q, b.r, 0, 0))

function prep(g) {
  // Upgrade unlocked classes a little (cheap tiers first).
  for (const cls of g.unlockedClasses) for (const tree of ['def', 'atk']) if (g.canUpgrade(cls, tree)) g.buyUpgrade(cls, tree)
  // Found a city if we can.
  if (g.canBuild('city')) { g.beginBuild('city'); const t = nearPalace(g.placementTargets())[0]; if (t) g.placeAt(t); else g.cancelSelection() }
  // Hire units, cheapest first, until we can't (a real player spends).
  const classes = [...g.unlockedClasses].sort((a, b) => (UNIT_COSTS[a] || 0) - (UNIT_COSTS[b] || 0))
  for (let guard = 0; guard < 30; guard++) {
    let bought = false
    for (const cls of classes) {
      if (g.canBuild(cls)) { g.beginBuild(cls); const t = nearPalace(g.placementTargets())[0]; if (t) { g.placeAt(t); bought = true; break } else g.cancelSelection() }
    }
    if (!bought) break
  }
}

function runCombat(g) {
  let prompts = 0, guard = 0
  while (g.phase === 'combat' && !g.won && !g.defeated && guard++ < 400000) {
    if (g.selection?.type === 'draft') { prompts++; g.draftPick(g.selection.options[0]); continue }
    g.combatTick()
  }
  return prompts
}

function playSeed(seed) {
  const g = new GameManager(seed)
  let waves = 0, prompts = 0
  while (!g.won && !g.defeated && waves < MAX_WAVES) {
    prep(g)
    g.beginWave()
    prompts += runCombat(g)
    waves = g.wave - 1
    if (VERBOSE) {
      const eras = Object.entries(g.branchEra).map(([f, e]) => `${f[0]}${e}`).join(' ')
      console.log(`   w${String(waves).padStart(2)} ${g.won ? 'WIN ' : g.defeated ? 'LOSS' : 'ok  '} gold ${String(Math.round(g.gold)).padStart(5)} cities ${g.cityCount()} pop ${g.world.at(0, 0).city?.pop ?? '-'} | ${eras}`)
    }
  }
  return { seed, won: g.won, defeated: g.defeated, waves, prompts, cities: g.cityCount(), branchEra: { ...g.branchEra } }
}

console.log(`=== v4 campaign: ${N} seeds ===`)
const results = []
for (let s = 1; s <= N; s++) {
  if (VERBOSE) console.log(`\n-- seed ${s} --`)
  const r = playSeed(s)
  results.push(r)
  const eras = Object.entries(r.branchEra).map(([f, e]) => `${f[0]}${e}`).join(' ')
  console.log(`seed ${String(s).padStart(2)}: ${r.won ? 'WIN 🏆' : r.defeated ? 'LOSS 💀' : 'timeout'} in ${r.waves} waves · ${r.cities} cities · ${r.prompts} drafts · ${eras}`)
}

const wins = results.filter((r) => r.won).length
const losses = results.filter((r) => r.defeated).length
const avg = (f) => (results.reduce((a, r) => a + f(r), 0) / results.length).toFixed(1)
console.log(`\n=== aggregate ===`)
console.log(`wins ${wins}/${N} · losses ${losses}/${N}`)
console.log(`avg waves ${avg((r) => r.waves)} · avg drafts ${avg((r) => r.prompts)} · avg drafts/wave ${(results.reduce((a, r) => a + r.prompts, 0) / results.reduce((a, r) => a + Math.max(1, r.waves), 0)).toFixed(2)}`)
