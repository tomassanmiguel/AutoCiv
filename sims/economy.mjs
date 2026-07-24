// Headless test of the v2 data-driven building output engine (def.output).
const { GameManager } = await import('../src/game/GameManager.js')

let pass = 0, fail = 0
const assert = (cond, msg) => { if (cond) { pass++ } else { fail++; console.log('  ✗ FAIL:', msg) } }

function placeBuilding(g, era, key, level = 1) {
  const b = g.data.tableau.visibleBounds(era)
  // Find an empty visible land tile.
  for (const tile of g.data.tableau.visibleTiles(era)) {
    if (!tile.building && !tile.unit && tile.def?.place === 'land') {
      tile.building = { kind: 'building', key, level, hp: 10, maxHp: 10, damaged: false }
      return tile
    }
  }
  throw new Error(`no free land tile in era ${era} (bounds ${JSON.stringify(b)})`)
}

console.log('TEST 1: Market produces 7 gold/tick via the generic def.output engine')
{
  const g = new GameManager(1)
  g.setEra(2) // Market era
  const gold0 = g.data.civilization.gold.output
  placeBuilding(g, 2, 'market')
  g._recomputeOutputs()
  const delta = g.data.civilization.gold.output - gold0
  console.log(`  gold.output +${delta}`)
  assert(delta === 7, `Market adds 7 gold/tick (got ${delta})`)
}

console.log('TEST 2: School produces 13 progress/tick (progress folded into per-tick totals)')
{
  const g = new GameManager(1)
  g.setEra(8)
  const p0 = g.data.civilization.progress.output
  placeBuilding(g, 8, 'school')
  g._recomputeOutputs()
  const delta = g.data.civilization.progress.output - p0
  console.log(`  progress.output +${delta}`)
  assert(delta === 13, `School adds 13 progress/tick (got ${delta})`)
}

console.log('TEST 3: upgrade scales output +25%/level (Market L3 = round(7*1.5) = 11)')
{
  const g = new GameManager(1)
  g.setEra(2)
  const gold0 = g.data.civilization.gold.output
  const t = placeBuilding(g, 2, 'market', 3)
  g._recomputeOutputs()
  const delta = g.data.civilization.gold.output - gold0
  console.log(`  L3 Market gold.output +${delta}`)
  assert(delta === 11, `Market L3 = round(7*(1+0.25*2))=11 (got ${delta})`)
  void t
}

console.log('TEST 4: end-of-era output (Theater 450 progress) accrues at combat end')
{
  const g = new GameManager(1)
  g.setEra(6)
  placeBuilding(g, 6, 'theater')
  const p0 = g.data.civilization.progress.value
  g._accrueBuildingOutputs()
  const delta = g.data.civilization.progress.value - p0
  console.log(`  progress.value +${delta}`)
  assert(delta === 450, `Theater banks 450 progress at era end (got ${delta})`)
}

console.log('TEST 5: Scriptoria (policy citizenOutput) → each Citizen +1 progress')
{
  const g = new GameManager(1); g.setEra(2)
  g.data.civilization.policies[0] = { key: 'scriptoria' }
  const out = g.popOutput('citizen')
  console.log(`  citizen progress = ${out.progress}`)
  assert(out.progress === 2, `Citizen 1→2 progress with Scriptoria (got ${out.progress})`)
}

console.log('TEST 6: Guilds (specialistOutput +2) → Farmer food 4→6')
{
  const g = new GameManager(1); g.setEra(5)
  g.data.civilization.policies[0] = { key: 'guilds' }
  const out = g.popOutput('farmer')
  console.log(`  farmer food = ${out.food}`)
  assert(out.food === 6, `Farmer 4→6 food with Guilds (got ${out.food})`)
}

console.log('TEST 7: Forced Evolution prefix (+4 food to non-robot pops; robots exempt)')
{
  const g = new GameManager(1); g.setEra(22)
  g._applyModifier({ key: 'forced_evolution' })
  const cit = g.popOutput('citizen'); const rep = g.popOutput('replicant')
  console.log(`  citizen food = ${cit.food}, replicant food = ${rep.food ?? 0}`)
  assert(cit.food === 5, `Citizen 1→5 food with Evolved (got ${cit.food})`)
  assert((rep.food ?? 0) === 0, `Replicant (robot) exempt from prefix (got ${rep.food ?? 0})`)
}

console.log('TEST 8: Theocracy (legitPerEra) → +25 legitimacy at era end')
{
  const g = new GameManager(1); g.setEra(4)
  g.data.civilization.policies[0] = { key: 'theocracy' }
  const before = g.data.civilization.legitimacy.value
  g._applyEraEndEffects()
  const delta = g.data.civilization.legitimacy.value - before
  console.log(`  legit +${delta}`)
  assert(delta === 25, `Theocracy +25 legit/era (got ${delta})`)
}

console.log('TEST 9: Usury (goldInterest 10%) → +10% of unspent gold at era end')
{
  const g = new GameManager(1); g.setEra(3)
  g.data.civilization.gold.value = 100
  g.data.civilization.policies[0] = { key: 'usury' }
  g._applyEraEndEffects()
  console.log(`  gold = ${g.data.civilization.gold.value}`)
  assert(g.data.civilization.gold.value === 110, `Usury 100→110 gold (got ${g.data.civilization.gold.value})`)
}

console.log('TEST 10: Shrine (legitOnComplete) grants +10 legitimacy when built')
{
  const g = new GameManager(1); g.setEra(0)
  const before = g.data.civilization.legitimacy.value
  g._createInstance({ kind: 'building', key: 'shrine', level: 1 }, g.data.tableau.tileAt(g.data.tableau.visibleBounds(0).minRow, g.data.tableau.visibleBounds(0).minCol))
  const delta = g.data.civilization.legitimacy.value - before
  console.log(`  legit +${delta}`)
  assert(delta === 10, `Shrine grants +10 legit on completion (got ${delta})`)
}

console.log('TEST 11: Monastery leverage → progress/t = legitimacy ÷ 20')
{
  const g = new GameManager(1); g.setEra(5)
  g.data.civilization.legitimacy.value = 100
  placeBuilding(g, 5, 'monastery')
  g._recomputeOutputs()
  console.log(`  progress.output = ${g.data.civilization.progress.output}`)
  assert(g.data.civilization.progress.output >= 5, `Monastery adds legit/20=5 progress/t (got ${g.data.civilization.progress.output})`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
