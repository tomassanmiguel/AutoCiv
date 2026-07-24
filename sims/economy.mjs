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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
