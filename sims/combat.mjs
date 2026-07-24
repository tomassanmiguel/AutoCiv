// Headless test of the v2 turn-based combat engine.
const { GameManager } = await import('../src/game/GameManager.js')
const { ENEMY_DEFS } = await import('../src/game/data/enemies.js')

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

// ---------------------------------------------------------------------------
console.log('TEST 9: hand-authored enemy host scales HP ×1.25^E and breach atk +E (elites ×2)')
{
  const era = 4
  const g = new GameManager(9); g.setEra(era)
  const scale = Math.pow(1.25, era)
  let ok = g.data.enemies.length > 0
  for (const e of g.data.enemies) {
    const base = ENEMY_DEFS[e.key]
    if (!base) { ok = false; console.log(`  ✗ ${e.key} not in ENEMY_DEFS`); continue }
    const m = e.elite ? 2 : 1
    const expHp = Math.max(1, Math.round(base.def * scale)) * m
    const expAtk = (base.atk + era) * m
    if (e.maxHp !== expHp || e.atk !== expAtk) { ok = false; console.log(`  ✗ ${e.key} hp ${e.maxHp}≠${expHp} atk ${e.atk}≠${expAtk}`) }
    if (base.era > era) { ok = false; console.log(`  ✗ ${e.key} from future era ${base.era}`) }
    if (base.boss) { ok = false; console.log(`  ✗ boss ${e.key} in a normal wave`) }
  }
  const e0 = g.data.enemies[0]
  console.log(`  era-${era} host: ${g.data.enemies.length} enemies; e.g. ${e0?.name} HP ${e0?.maxHp} atk ${e0?.atk}`)
  assert(ok, 'every enemy is a non-boss ≤era with era-scaled HP/atk')
  g.stop()
}

// ---------------------------------------------------------------------------
console.log('TEST 10: Siege splash — Catapult hits the target in full + neighbours at 50%')
{
  const g = new GameManager(6); g.setEra(4)
  const b = g.data.tableau.visibleBounds(4)
  const col = b.minCol + 1, r = b.minRow + 1
  g.data.tableau.tileAt(r, col).unit = { kind: 'unit', key: 'catapult', level: 1, hp: 5, maxHp: 5, damaged: false }
  const target = mkEnemy('raider', 'T', col, r + 1, 1000, 3)
  const nb1 = mkEnemy('raider', 'N1', col + 1, r + 1, 1000, 3)
  const nb2 = mkEnemy('raider', 'N2', col, r + 2, 1000, 3)
  g.data.enemies = [target, nb1, nb2]
  g._startCombat(); g.dismissCombatIntro()
  g._runTurn()
  const dT = 1000 - target.hp, dN1 = 1000 - nb1.hp, dN2 = 1000 - nb2.hp
  console.log(`  target ${dT} dmg; neighbours ${dN1}, ${dN2} (Catapult atk 14, splash 0.5)`)
  assert(dT === 14, `target takes full 14 (got ${dT})`)
  assert(dN1 === 7 && dN2 === 7, `neighbours take 7 splash (got ${dN1}, ${dN2})`)
  g.stop()
}

// ---------------------------------------------------------------------------
console.log('TEST 11: Fascism — +100% atk while legitimacy < 50')
{
  const g = new GameManager(7); g.setEra(11)
  const b = g.data.tableau.visibleBounds(11)
  const t = g.data.tableau.tileAt(b.minRow, b.minCol)
  t.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g.data.civilization.policies[0] = { key: 'fascism' }
  g.data.civilization.legitimacy.value = 100
  g._syncUnitStats(true); const high = t.unit.atk
  g.data.civilization.legitimacy.value = 30
  g._syncUnitStats(true); const low = t.unit.atk
  console.log(`  Warrior atk: legit 100 → ${high}, legit 30 → ${low}`)
  assert(low === high * 2, `Fascism doubles atk below 50 legit (got ${low} vs ${high})`)
  g.stop()
}

// ---------------------------------------------------------------------------
console.log('TEST 12: Manhattan Project — combat-start nuke, fallout tile, fallout march-damage')
{
  const g = new GameManager(13); g.setEra(11)
  g.data.civilization.completedWonders.push('manhattan_project')
  const b = g.data.tableau.visibleBounds(11)
  g.data.enemies = [mkEnemy('raider', 'A', b.minCol, b.maxRow + 1, 500, 5)]
  g._startCombat()
  const nuked = g.data.enemies[0].damaged
  const falloutTiles = g.data.tableau.visibleTiles(11).filter((t) => t.terrain === 'fallout').length
  console.log(`  nuke killed the 500-HP enemy: ${nuked}; fallout tiles laid: ${falloutTiles}`)
  assert(nuked, 'the 2000 nuke kills a 500-HP enemy')
  assert(falloutTiles === 1, 'one permanent fallout tile laid at combat start')
  g.stop()

  const g2 = new GameManager(14); g2.setEra(11)
  const b2 = g2.data.tableau.visibleBounds(11)
  const col = b2.minCol
  g2.data.tableau.tileAt(b2.maxRow, col).terrain = 'fallout'
  const e = mkEnemy('raider', 'F', col, b2.maxRow + 1, 500, 5)
  g2.data.enemies = [e]
  g2.data.phase = 'battle'; g2.data.combatIntro = false
  g2._enemyPhase(b2)
  console.log(`  enemy marching onto fallout took ${500 - e.hp} dmg`)
  assert(e.row === b2.maxRow && (500 - e.hp) === 100, `enemy entering fallout takes 100 (got ${500 - e.hp})`)
  g2.stop()
}

// ---------------------------------------------------------------------------
console.log('TEST 13: Bayonets bonus — melee units +5 flat attack')
{
  const g = new GameManager(8); g.setEra(2)
  const b = g.data.tableau.visibleBounds(2)
  const t = g.data.tableau.tileAt(b.minRow, b.minCol)
  t.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g._syncUnitStats(true); const a0 = t.unit.atk
  g._applyModifier({ key: 'bayonets' }) // ✦ bonus → civ.bonuses
  g._syncUnitStats(true); const a1 = t.unit.atk
  console.log(`  Warrior atk ${a0} → ${a1} with Bayonets`)
  assert(a1 - a0 === 5, `Bayonets +5 melee atk (got +${a1 - a0})`)
  g.stop()
}

// ---------------------------------------------------------------------------
console.log('TEST 14: Eugenics — end-of-era permanent +2 attack to all units')
{
  const g = new GameManager(9); g.setEra(10)
  const b = g.data.tableau.visibleBounds(10)
  const t = g.data.tableau.tileAt(b.minRow, b.minCol)
  t.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g.data.civilization.policies[0] = { key: 'eugenics' }
  g._syncUnitStats(true); const a0 = t.unit.atk
  g._applyEraEndEffects() // +2 permanent
  g._syncUnitStats(true); const a1 = t.unit.atk
  console.log(`  Warrior atk ${a0} → ${a1} after one era with Eugenics`)
  assert(a1 - a0 === 2, `Eugenics +2 atk/era (got +${a1 - a0})`)
  g.stop()
}

console.log('TEST 15: Poetry — end-of-era :progress: = total attack of surviving units')
{
  const g = new GameManager(10); g.setEra(3)
  const b = g.data.tableau.visibleBounds(3)
  g.data.tableau.tileAt(b.minRow, b.minCol).unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g.data.civilization.policies[0] = { key: 'poetry' }
  g._syncUnitStats(true)
  const p0 = g.data.civilization.progress.value
  g._applyEraEndEffects()
  const dp = g.data.civilization.progress.value - p0
  console.log(`  Poetry progress +${dp} (surviving Warrior atk 5)`)
  assert(dp === 5, `Poetry grants progress = surviving atk 5 (got +${dp})`)
  g.stop()
}

console.log('TEST 16: Lunar Defense Stratagem — Moon-terrain units deal +100% attack')
{
  const g = new GameManager(12); g.setEra(14)
  const b = g.data.tableau.visibleBounds(14)
  const t = g.data.tableau.tileAt(b.minRow, b.minCol)
  t.terrain = 'plains'
  t.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g._syncUnitStats(true); const a0 = t.unit.atk
  t.terrain = 'moon'
  g.data.civilization.policies[0] = { key: 'lunar_defense_stratagem' }
  g._syncUnitStats(true); const a1 = t.unit.atk
  console.log(`  Warrior atk ${a0} (plains) → ${a1} (moon + Lunar Defense)`)
  assert(a1 === a0 * 2, `Moon units +100% atk (got ${a1} vs ${a0 * 2})`)
  g.stop()
}

console.log('TEST 17: Defensive Pact — mercenaries gain +1 defense')
{
  const g = new GameManager(13); g.setEra(4)
  const b = g.data.tableau.visibleBounds(4)
  const t = g.data.tableau.tileAt(b.minRow, b.minCol)
  t.terrain = 'plains'
  t.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false, mercenary: true }
  g._syncUnitStats(false); const d0 = t.unit.maxHp
  g.data.civilization.policies[0] = { key: 'defensive_pact' }
  g._syncUnitStats(false); const d1 = t.unit.maxHp
  console.log(`  merc Warrior def ${d0} → ${d1} with Defensive Pact`)
  assert(d1 - d0 === 1, `Defensive Pact +1 merc def (got +${d1 - d0})`)
  g.stop()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
