// Headless test of the v2 turn-based combat engine.
const { GameManager } = await import('../src/game/GameManager.js')

function mkEnemy(key, name, col, row, hp, atk) {
  return { key, name, col, row, hp, maxHp: hp, atk, damaged: false, breached: false }
}

function runBattle(g, label) {
  g.dismissCombatIntro()
  let turns = 0
  while (g.data.phase === 'battle' && turns < 1000) { g._runTurn(); turns++ }
  console.log(`  [${label}] ended after ${turns} turns; phase=${g.data.phase} legit=${g.data.civilization.legitimacy.value.toFixed(0)} defeated=${g.data.defeated}`)
  return turns
}

let pass = 0, fail = 0
const assert = (cond, msg) => { if (cond) { pass++ } else { fail++; console.log('  ✗ FAIL:', msg) } }

// ---------------------------------------------------------------------------
console.log('TEST 1: a lone player Warrior holds the line and kills a marching enemy')
{
  const g = new GameManager(1)
  const b = g.data.tableau.visibleBounds(0)
  const col = b.minCol + 1
  // Place a Warrior at the bottom row of `col`.
  const bottom = g.data.tableau.tileAt(b.minRow, col)
  bottom.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 30, maxHp: 30, damaged: false }
  // One weak enemy in the same column, near the top spawn zone.
  g.data.enemies = [mkEnemy('warrior', 'Raider', col, b.maxRow + 1, 8, 5)]
  const legit0 = g.data.civilization.legitimacy.value
  g._startCombat()
  runBattle(g, 'hold')
  assert(g.data.enemies.every((e) => e.damaged), 'enemy should be slain, not breached')
  assert(g.data.civilization.legitimacy.value === legit0, 'no legitimacy lost when the line holds')
  assert(!g.data.defeated, 'not defeated')
}

// ---------------------------------------------------------------------------
console.log('TEST 2: an undefended enemy breaches and costs legitimacy = its atk')
{
  const g = new GameManager(1)
  const b = g.data.tableau.visibleBounds(0)
  const col = b.minCol
  const enemy = mkEnemy('warrior', 'Raider', col, b.maxRow + 1, 8, 7)
  g.data.enemies = [enemy]
  const legit0 = g.data.civilization.legitimacy.value
  g._startCombat()
  const turns = runBattle(g, 'breach')
  assert(enemy.breached, 'enemy should breach') // captured ref survives _endCombat clearing data.enemies
  const lost = legit0 - g.data.civilization.legitimacy.value
  console.log(`  legit lost = ${lost} (enemy atk = 7)`)
  assert(lost === 7 || lost === 14, 'legitimacy lost equals enemy atk (or ×2 with Democracy)')
  // Enemy started at maxRow+1, must march to minRow then off → predictable turn count.
  const dist = (b.maxRow + 1) - b.minRow + 1
  assert(turns === dist, `breach in ${dist} turns (marched the full column), got ${turns}`)
}

// ---------------------------------------------------------------------------
console.log('TEST 3: enemies queue behind a blocker (no tile-sharing)')
{
  const g = new GameManager(1)
  const b = g.data.tableau.visibleBounds(0)
  const col = b.minCol + 1
  const bottom = g.data.tableau.tileAt(b.minRow, col)
  // A very tough wall that never dies, so enemies must queue and eventually stalemate.
  bottom.building = { kind: 'building', key: 'totem', level: 1, hp: 100000, maxHp: 100000, damaged: false }
  g.data.enemies = [
    mkEnemy('warrior', 'A', col, b.maxRow + 1, 5, 3),
    mkEnemy('warrior', 'B', col, b.maxRow + 2, 5, 3),
  ]
  g._startCombat()
  g.dismissCombatIntro()
  // Step a handful of turns and check the two enemies never share a tile.
  let shared = false
  for (let i = 0; i < 12 && g.data.phase === 'battle'; i++) {
    g._runTurn()
    const live = g.data.enemies.filter((e) => !e.damaged && !e.breached)
    const seen = new Set()
    for (const e of live) { const k = `${e.row},${e.col}`; if (seen.has(k)) shared = true; seen.add(k) }
  }
  assert(!shared, 'two enemies never occupy the same tile')
  const rows = g.data.enemies.map((e) => e.row).sort((a, c) => a - c)
  console.log(`  queued enemy rows: ${rows.join(', ')} (bottom row ${b.minRow}, wall at ${b.minRow})`)
  assert(rows[0] === b.minRow + 1, 'front enemy halts one tile above the wall')
}

// ---------------------------------------------------------------------------
console.log('TEST 4: generateHost yields valid marching enemies for several eras')
{
  for (const era of [0, 2, 5]) {
    const g = new GameManager(era + 1)
    g.setEra(era)
    const b = g.data.tableau.visibleBounds(era)
    const es = g.data.enemies
    const ok = es.length > 0 && es.every((e) =>
      e.col >= b.minCol && e.col <= b.maxCol && e.row > b.maxRow &&
      e.hp > 0 && e.maxHp > 0 && e.atk >= 0 && typeof e.name === 'string')
    console.log(`  era ${era}: ${es.length} enemies, rows ${Math.min(...es.map(e=>e.row))}..${Math.max(...es.map(e=>e.row))}`)
    assert(ok, `era ${era} host is well-formed and spawns above the grid`)
  }
}

// ---------------------------------------------------------------------------
console.log('TEST 5: a real generated host runs through combat → transition (integration)')
{
  const g = new GameManager(7)
  g.setEra(2)
  const b = g.data.tableau.visibleBounds(2)
  // Deploy a defensive line of Spearmen across the bottom row.
  for (let c = b.minCol; c <= b.maxCol; c++) {
    const t = g.data.tableau.tileAt(b.minRow, c)
    if (t && t.def?.place === 'land') t.unit = { kind: 'unit', key: 'spearman', level: 3, hp: 40, maxHp: 40, damaged: false }
  }
  const nEnemies = g.data.enemies.length
  g.data.phase = 'prep'
  g.beginCombat()
  assert(g.data.phase === 'battle', 'beginCombat enters battle')
  g.dismissCombatIntro()
  let turns = 0
  while (g.data.phase === 'battle' && turns < 2000) { g._runTurn(); turns++ }
  console.log(`  ${nEnemies} enemies, resolved in ${turns} turns → phase=${g.data.phase}`)
  assert(g.data.phase === 'transition' || g.data.defeated, 'battle resolves to transition or defeat')
  assert(g.data.enemies.length === 0 || g.data.defeated, 'enemies cleared at end of combat')
  if (g.data.phase === 'transition') {
    g.completeTransition()
    assert(g.data.era === 3, 'completeTransition advances to the next era')
    assert(g.data.enemies.length > 0, 'a fresh host is generated for the new era')
  }
  g.stop()
}

// ---------------------------------------------------------------------------
console.log('TEST 6: Siege cooldown — a Ballista (cd 2) fires every 3rd turn')
{
  const g = new GameManager(3)
  g.setEra(2)
  const b = g.data.tableau.visibleBounds(2)
  const colA = b.minCol, colB = b.minCol + 1
  // Ballista in colA (range 3); a huge wall in colB halts the enemy in range of it.
  g.data.tableau.tileAt(b.minRow, colA).unit = { kind: 'unit', key: 'ballista', level: 1, hp: 50, maxHp: 50, damaged: false }
  g.data.tableau.tileAt(b.minRow, colB).building = { kind: 'building', key: 'totem', level: 1, hp: 1e9, maxHp: 1e9, damaged: false }
  const enemy = mkEnemy('warrior', 'Bruiser', colB, b.maxRow + 1, 100000, 5)
  g.data.enemies = [enemy]
  g._startCombat()
  g.dismissCombatIntro()
  // March the enemy down to the wall first (colB is minCol+1; enemy needs to reach minRow+1).
  for (let i = 0; i < 6; i++) g._runTurn()
  const hpAtStart = enemy.hp
  for (let i = 0; i < 9; i++) g._runTurn() // 9 turns → Ballista fires on turns 1,4,7 = 3 shots
  const shots = Math.round((hpAtStart - enemy.hp) / 11) // ballista atk 11
  console.log(`  enemy took ${hpAtStart - enemy.hp} dmg over 9 turns → ~${shots} Ballista shots`)
  assert(shots === 3, `Ballista fires 3× in 9 turns (cd 2), got ${shots}`)
  g.stop()
}

// ---------------------------------------------------------------------------
console.log('TEST 7: combat damage modifiers — Bushido (+50% melee) + Steel (+15% all), additive')
{
  const g = new GameManager(4)
  g.setEra(2)
  const b = g.data.tableau.visibleBounds(2)
  const t = g.data.tableau.tileAt(b.minRow, b.minCol)
  t.unit = { kind: 'unit', key: 'spearman', level: 1, hp: 3, maxHp: 3, damaged: false }
  g._syncUnitStats(true); const base = t.unit.atk
  g.data.civilization.policies[0] = { key: 'bushido' } // melee doctrine +50%
  g._syncUnitStats(true); const withDoc = t.unit.atk
  g._applyModifier({ key: 'steel' }) // +15% all units
  g._syncUnitStats(true); const withBoth = t.unit.atk
  console.log(`  spearman atk: base ${base} → +Bushido ${withDoc} → +Steel ${withBoth}`)
  assert(base === 6, `base atk 6 (got ${base})`)
  assert(withDoc === 9, `Bushido +50% → round(6*1.5)=9 (got ${withDoc})`)
  assert(withBoth === 10, `+Steel additive → round(6*1.65)=10 (got ${withBoth})`)
  g.stop()
}

// ---------------------------------------------------------------------------
console.log('TEST 8: unit-death trigger — Nationalism grants :gold: = the dead unit atk')
{
  const g = new GameManager(5); g.setEra(2)
  const b = g.data.tableau.visibleBounds(2)
  const col = b.minCol
  g.data.tableau.tileAt(b.minRow, col).unit = { kind: 'unit', key: 'warrior', level: 1, hp: 2, maxHp: 2, damaged: false }
  g.data.enemies = [mkEnemy('warrior', 'Tank', col, b.maxRow + 1, 1000, 4)] // tanky so it kills the warrior
  g.data.civilization.policies[0] = { key: 'nationalism' }
  const gold0 = g.data.civilization.gold.value
  g._startCombat(); g.dismissCombatIntro()
  let turns = 0
  while (g.data.phase === 'battle' && turns < 200) { g._runTurn(); turns++ }
  const delta = g.data.civilization.gold.value - gold0
  console.log(`  gold +${delta} (dead Warrior atk = 5)`)
  assert(delta === 5, `Nationalism grants +5 gold on the Warrior's death (got ${delta})`)
  g.stop()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
