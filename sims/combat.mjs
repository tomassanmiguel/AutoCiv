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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
