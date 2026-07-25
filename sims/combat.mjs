// Headless test of the v2 turn-based combat engine.
const { GameManager } = await import('../src/game/GameManager.js')
const { ENEMY_DEFS } = await import('../src/game/data/enemies.js')
const { UNIT_DEFS, unitStats } = await import('../src/game/data/units.js')
const { BUILDING_DEFS, buildingHp } = await import('../src/game/data/buildings.js')
const { canPlaceOn } = await import('../src/game/data/terrain.js')
const { WONDER_BUILDS } = await import('../src/game/data/wonders.js')
const { buildingRepairCost } = await import('../src/game/data/costs.js')

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
  for (let r = b.minRow; r <= b.maxRow; r++) g.data.tableau.tileAt(r, col).terrain = 'plains' // land column → straight march
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
  for (let r = b.minRow; r <= b.maxRow; r++) g.data.tableau.tileAt(r, col).terrain = 'plains' // land column → enemy reaches the blocker
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

console.log('TEST 18: Elder Awareness — +50% damage vs Azazoth')
{
  const g = new GameManager(14); g.setEra(27)
  const mkEnemy = () => ({ key: 'azazoth', row: 1, col: 1, hp: 1000, maxHp: 1000, damaged: false })
  const e0 = mkEnemy(); g._dealDamageToEnemy(e0, 100)
  const other = { key: 'warrior', row: 1, col: 2, hp: 1000, maxHp: 1000, damaged: false }
  g.data.civilization.policies[0] = { key: 'elder_awareness' }
  const e1 = mkEnemy(); g._dealDamageToEnemy(e1, 100)
  g._dealDamageToEnemy(other, 100) // non-Azazoth: unaffected
  console.log(`  100 dmg vs Azazoth: ${1000 - e0.hp} (base) → ${1000 - e1.hp} (Elder Awareness); vs other ${1000 - other.hp}`)
  assert(1000 - e0.hp === 100, `base Azazoth dmg 100 (got ${1000 - e0.hp})`)
  assert(1000 - e1.hp === 150, `Elder Awareness +50% vs Azazoth = 150 (got ${1000 - e1.hp})`)
  assert(1000 - other.hp === 100, `non-Azazoth unaffected (got ${1000 - other.hp})`)
  g.stop()
}

console.log('TEST 19: Adaptive Strategy — units gain +5% attack per combat turn')
{
  const g = new GameManager(15); g.setEra(4)
  const b = g.data.tableau.visibleBounds(4)
  const t = g.data.tableau.tileAt(b.minRow, b.minCol)
  t.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g.data.civilization.policies[0] = { key: 'adaptive_strategy' }
  g._syncUnitStats(true); const atk = t.unit.atk
  const mkEnemy = () => ({ key: 'warrior', row: b.minRow + 1, col: b.minCol, hp: 1e6, maxHp: 1e6, damaged: false, breached: false })
  g.data.combatSeq = 0
  g.data.combatTurn = 1; let e = mkEnemy(); g.data.enemies = [e]
  g._pieceAttack({ occ: t.unit, row: t.row, col: t.col }); const d1 = 1e6 - e.hp
  t.unit.cdTimer = 0; g.data.combatTurn = 3; e = mkEnemy(); g.data.enemies = [e]
  g._pieceAttack({ occ: t.unit, row: t.row, col: t.col }); const d3 = 1e6 - e.hp
  console.log(`  atk ${atk}: turn-1 dmg ${d1}, turn-3 dmg ${d3} (expect +10%)`)
  assert(d1 === atk, `turn 1 = base atk (got ${d1} vs ${atk})`)
  assert(d3 === Math.round(atk * 1.1), `turn 3 = +10% (got ${d3} vs ${Math.round(atk * 1.1)})`)
  g.stop()
}

console.log('TEST 20: Cosmic Celebration — end-of-era effects trigger 2 extra times')
{
  const run = (policy) => {
    const g = new GameManager(18); g.setEra(6)
    g.data.civilization.pops.shaman = 1 // +10 legit per end-of-era application
    if (policy) g.data.civilization.policies[0] = { key: policy }
    const l0 = g.data.civilization.legitimacy.value
    g._endCombat() // applies end-of-era effects `times` times
    const gain = g.data.civilization.legitimacy.value - l0
    g.stop(); return gain
  }
  const base = run(null), cosmic = run('cosmic_celebration')
  console.log(`  Shaman end-of-era legit: base +${base}, Cosmic Celebration +${cosmic}`)
  assert(base === 10, `base = 1× (Shaman +10) (got +${base})`)
  assert(cosmic === 30, `Cosmic Celebration = 3× end-of-era (got +${cosmic})`)
}

console.log('TEST 21: Xenodiplomacy — hires 6 ranged mercenaries before combat')
{
  const g = new GameManager(19); g.setEra(10)
  g.data.civilization.units[1] = { key: 'slinger', level: 1 } // unlock a ranged unit
  g.data.civilization.policies[0] = { key: 'xenodiplomacy' }
  g._applyPreCombatMercs()
  const mercs = g.data.tableau.visibleTiles(10).filter((t) => t.unit?.mercenary)
  console.log(`  spawned ${mercs.length} mercenaries (expect 6, all ranged Slingers)`)
  assert(mercs.length === 6, `Xenodiplomacy spawns 6 mercs (got ${mercs.length})`)
  assert(mercs.every((t) => t.unit.key === 'slinger'), `all spawned mercs are ranged`)
  g.stop()
}

console.log('TEST 22: Native Collaboration — spawns 3 free mercs on New-World tiles')
{
  const g = new GameManager(20); g.setEra(7)
  g.data.tableau.visibleTiles(7).filter((t) => !t.occupant && t.def?.place === 'land').slice(0, 4)
    .forEach((t) => { t.label = 'New World' })
  g.data.civilization.policies[0] = { key: 'native_collaboration' }
  g._applyPreCombatMercs()
  const mercs = g.data.tableau.visibleTiles(7).filter((t) => t.unit?.mercenary)
  console.log(`  spawned ${mercs.length} New-World mercenaries (expect 3)`)
  assert(mercs.length === 3, `Native Collaboration spawns 3 (got ${mercs.length})`)
  assert(mercs.every((t) => t.label === 'New World'), `all placed on New-World tiles`)
  g.stop()
}

console.log('TEST 23: Nanite Warfare — each turn poisons all enemies for 5% max HP')
{
  const g = new GameManager(21); g.setEra(11)
  g.data.civilization.policies[0] = { key: 'nanite_warfare' }
  g.data.enemies = [
    { key: 'warrior', row: 5, col: 5, hp: 1000, maxHp: 1000, damaged: false, breached: false },
    { key: 'warrior', row: 6, col: 6, hp: 200, maxHp: 200, damaged: false, breached: false },
  ]
  g._applyPoison()
  console.log(`  after 1 poison turn: ${g.data.enemies.map((e) => e.hp).join(', ')} (expect 950, 190)`)
  assert(g.data.enemies[0].hp === 950, `1000-HP enemy loses 50 (5%) (got ${1000 - g.data.enemies[0].hp})`)
  assert(g.data.enemies[1].hp === 190, `200-HP enemy loses 10 (5%) (got ${200 - g.data.enemies[1].hp})`)
  g.stop()
}

console.log('TEST 24: Galactic Legion — producing a unit copies it to an adjacent tile')
{
  const g = new GameManager(22); g.setEra(6)
  // A tile with empty land neighbours to receive the copy.
  const tile = g.data.tableau.visibleTiles(6).find((t) => t.def?.place === 'land' && !t.occupant &&
    g._adjacentTiles(t.row, t.col).some((n) => !n.occupant && n.def?.place === 'land'))
  assert(!!tile, 'found a land tile with an empty land neighbour')
  g.data.civilization.policies[0] = { key: 'galactic_legion' }
  const before = g.data.tableau.visibleTiles(6).filter((t) => t.unit).length
  g._createInstance({ kind: 'unit', key: 'warrior', level: 1 }, tile)
  const after = g.data.tableau.visibleTiles(6).filter((t) => t.unit).length
  console.log(`  units on board ${before} → ${after} (expect +2: the built unit + a copy)`)
  assert(after - before === 2, `Galactic Legion adds the unit + 1 copy (got +${after - before})`)
  g.stop()
}

console.log('TEST 25: Automobile — all units gain +1 attack (pursuit) range')
{
  const g = new GameManager(23); g.setEra(11)
  const occ = { kind: 'unit', key: 'warrior', level: 1 }
  const r0 = g._pieceRange(occ)
  g.data.civilization.bonuses.push('automobile')
  const r1 = g._pieceRange(occ)
  console.log(`  Warrior range ${r0} → ${r1} with Automobile`)
  assert(r1 - r0 === 1, `Automobile +1 range (got +${r1 - r0})`)
  g.stop()
}

console.log('TEST 26: Marine Construction / Gravboots — land buildings on water / asteroid')
{
  const g = new GameManager(24); g.setEra(14)
  const water = g.data.tableau.visibleTiles(14).find((t) => !t.occupant && g.data.tableau.isUnlocked(t.row, t.col, 14))
  water.terrain = 'ocean' // a sea tile
  const rock = g.data.tableau.visibleTiles(14).find((t) => t !== water && !t.occupant && g.data.tableau.isUnlocked(t.row, t.col, 14))
  rock.terrain = 'asteroid'
  const totem = { kind: 'building', key: 'totem', level: 1 }
  assert(!g._canPlaceHere(totem, water), 'land building blocked on water by default')
  assert(!g._canPlaceHere(totem, rock), 'land building blocked on asteroid by default')
  g.data.civilization.bonuses.push('marine_construction')
  g.data.civilization.policies[0] = { key: 'gravboots' }
  assert(g._canPlaceHere(totem, water), 'Marine Construction allows land building on water')
  assert(g._canPlaceHere(totem, rock), 'Gravboots allows land building on asteroid')
  console.log('  land building placeable on water (Marine Construction) + asteroid (Gravboots)')
  g.stop()
}

console.log('TEST 27: Wonder-yield multiplier (Pilgrimage/Tourism/Star Hopping)')
{
  const g = new GameManager(30)
  assert(g._wonderYieldMult() === 1, `default multiplier 1 (got ${g._wonderYieldMult()})`)
  g.data.civilization.policies[0] = { key: 'pilgrimage' }
  assert(g._wonderYieldMult() === 1.5, `Pilgrimage ×1.5 (got ${g._wonderYieldMult()})`)
  g.data.civilization.policies[1] = { key: 'star_hopping' }; g.data.civilization.policies[2] = { key: 'tourism' }
  assert(g._wonderYieldMult() === 3, `max wins → ×3 (got ${g._wonderYieldMult()})`)
  g.stop()
}

console.log('TEST 28: Stonehenge legit/era scales with wonder-yield')
{
  const mk = (policy) => {
    const g = new GameManager(31); g.setEra(4)
    g.data.civilization.pops = {} // remove other legit sources (shaman/priest)
    g.data.civilization.completedWonders.push('stonehenge')
    if (policy) g.data.civilization.policies[0] = { key: policy }
    const l0 = g.data.civilization.legitimacy.value
    g._endCombat()
    g.stop(); return g.data.civilization.legitimacy.value - l0
  }
  const base = mk(null), boosted = mk('pilgrimage')
  console.log(`  Stonehenge legit/era: base +${base}, Pilgrimage +${boosted}`)
  assert(base === 25, `base Stonehenge +25 (got +${base})`)
  assert(boosted === 37.5, `Pilgrimage ×1.5 → +37.5 (got +${boosted})`)
}

console.log('TEST 29: Hagia Sophia completion legit scales with wonder-yield')
{
  const mk = (policy) => {
    const g = new GameManager(32); g.setEra(5)
    g.data.civilization.wonder = { key: 'hagia_sophia', buildsLeft: 1, placed: true, inst: null }
    g.data.civilization.legitimacy.value = 100
    if (policy) g.data.civilization.policies[0] = { key: policy }
    g._completeWonder() // finish it → on-completion legit doubling
    g.stop(); return g.data.civilization.legitimacy.value
  }
  const base = mk(null), boosted = mk('tourism')
  console.log(`  Hagia completion legit (from 100): base ${base}, Tourism ${boosted}`)
  assert(base === 200, `base ×2 → 200 (got ${base})`)
  assert(boosted === 300, `Tourism ×(1+2) → 300 (got ${boosted})`)
}

console.log('TEST 30: Region upgrade-levels — Colonialism / Martian Freedom (units + buildings)')
{
  const g = new GameManager(35); g.setEra(16)
  const b = g.data.tableau.visibleBounds(16)
  const t = g.data.tableau.tileAt(b.minRow, b.minCol); t.terrain = 'plains'; t.label = 'New World'
  t.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g.data.civilization.policies[0] = { key: 'colonialism' } // +2 on New World
  g._syncUnitStats(true)
  const expect = unitStats(UNIT_DEFS.warrior, 3, 0, 0) // level 1 + 2
  console.log(`  New-World Warrior atk ${t.unit.atk} (expect ${expect.atk}), level still ${t.unit.level}`)
  assert(t.unit.atk === expect.atk && t.unit.maxHp === expect.def, `Colonialism computes at level 3`)
  assert(t.unit.level === 1, `occ.level unchanged (got ${t.unit.level})`)
  // Control: a non-New-World tile gets no bonus.
  const t2 = g.data.tableau.tileAt(b.minRow, b.minCol + 1); t2.terrain = 'plains'; t2.label = 'Old World'
  t2.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g._syncUnitStats(true)
  assert(t2.unit.atk === unitStats(UNIT_DEFS.warrior, 1, 0, 0).atk, `control unit unaffected`)
  g.stop()
}

console.log('TEST 31: Region upgrade-levels — Skyscrapers (building-only) + Hive Mind (per-neighbour)')
{
  const g = new GameManager(36); g.setEra(21)
  const b = g.data.tableau.visibleBounds(21)
  const t = g.data.tableau.tileAt(b.minRow + 1, b.minCol); t.terrain = 'plains'
  t.city = { kind: 'building', key: 'city', level: 1 } // underlaid City
  t.building = { kind: 'building', key: 'mud_wall', level: 1, hp: 10, maxHp: 10, damaged: false }
  g.data.civilization.policies[0] = { key: 'skyscrapers' } // +5 to City buildings
  g._syncUnitStats(true)
  const expWall = buildingHp(BUILDING_DEFS.mud_wall, 6, g.data.civilization.modifiers.buildingHpBonus)
  console.log(`  City Wall maxHp ${t.building.maxHp} vs expected(level 6) ${expWall}`)
  assert(t.building.maxHp === expWall, `Skyscrapers → building computed at level 6`)
  // A unit on the same city tile is NOT boosted (building-only).
  const tu = g.data.tableau.tileAt(b.minRow, b.minCol); tu.terrain = 'plains'; tu.city = { kind: 'building', key: 'city', level: 1 }
  tu.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g._syncUnitStats(true)
  assert(tu.unit.atk === unitStats(UNIT_DEFS.warrior, 1, 0, 0).atk, `unit on city tile unaffected by Skyscrapers`)
  // Hive Mind: +1 level per adjacent building.
  const g2 = new GameManager(37); g2.setEra(21)
  const bb = g2.data.tableau.visibleBounds(21)
  const c = g2.data.tableau.tileAt(bb.minRow + 1, bb.minCol + 1); c.terrain = 'plains'
  c.building = { kind: 'building', key: 'mud_wall', level: 1, hp: 10, maxHp: 10, damaged: false }
  const nbrs = g2._adjacentTiles(c.row, c.col).slice(0, 2)
  for (const nb of nbrs) { nb.terrain = 'plains'; nb.building = { kind: 'building', key: 'totem', level: 1, hp: 15, maxHp: 15, damaged: false } }
  g2.data.civilization.policies[0] = { key: 'hive_mind' }
  g2._syncUnitStats(true)
  const exp2 = buildingHp(BUILDING_DEFS.mud_wall, 1 + nbrs.length, g2.data.civilization.modifiers.buildingHpBonus)
  console.log(`  Hive Mind wall with ${nbrs.length} neighbours → level ${1 + nbrs.length}, maxHp ${c.building.maxHp}`)
  assert(c.building.maxHp === exp2, `Hive Mind +1/neighbour (level ${1 + nbrs.length})`)
  nbrs[0].building.damaged = true; g2._syncUnitStats(true)
  const exp3 = buildingHp(BUILDING_DEFS.mud_wall, 1 + (nbrs.length - 1), g2.data.civilization.modifiers.buildingHpBonus)
  assert(c.building.maxHp === exp3, `damaged neighbour drops the bonus`)
  g.stop(); g2.stop()
}

console.log('TEST 32: Region upgrade-levels via WONDER (Happy Valley, Mars +8)')
{
  const g = new GameManager(38); g.setEra(16)
  const b = g.data.tableau.visibleBounds(16)
  const t = g.data.tableau.tileAt(b.minRow, b.minCol); t.terrain = 'mars'
  t.building = { kind: 'building', key: 'mud_wall', level: 1, hp: 10, maxHp: 10, damaged: false }
  g._syncUnitStats(true); const before = t.building.maxHp
  g.data.civilization.completedWonders.push('happy_valley')
  g._syncUnitStats(true)
  const exp = buildingHp(BUILDING_DEFS.mud_wall, 9, g.data.civilization.modifiers.buildingHpBonus) // 1 + 8
  console.log(`  Mars Wall maxHp ${before} → ${t.building.maxHp} (expect ${exp}) with Happy Valley`)
  assert(t.building.maxHp === exp, `Happy Valley +8 on Mars (level 9)`)
  g.stop()
}

console.log('TEST 33: Adjacency bridging (Combustion ocean, isolation, Reuseable Rocketry moon↔earth)')
{
  const key = (t) => `${t.row},${t.col}`
  // Combustion: an ocean tile between two land tiles bridges them.
  const g = new GameManager(40); g.setEra(14)
  const b = g.data.tableau.visibleBounds(14)
  const A = g.data.tableau.tileAt(b.minRow, b.minCol)
  const C = g.data.tableau.tileAt(b.minRow, b.minCol + 1)
  const B = g.data.tableau.tileAt(b.minRow, b.minCol + 2)
  A.terrain = 'plains'; C.terrain = 'ocean'; B.terrain = 'plains'; g._netsCache = null
  assert(!g._reachableWithin(A.row, A.col, 1).has(key(B)), 'A–B not adjacent across ocean (baseline)')
  g._applyModifier({ kind: 'modifier', key: 'combustion' })
  assert(g._reachableWithin(A.row, A.col, 1).has(key(B)), 'Combustion bridges A–B across ocean')
  // Isolation: Mass Drivers bridges space, NOT ocean.
  const g2 = new GameManager(41); g2.setEra(14)
  const b2 = g2.data.tableau.visibleBounds(14)
  const A2 = g2.data.tableau.tileAt(b2.minRow, b2.minCol), C2 = g2.data.tableau.tileAt(b2.minRow, b2.minCol + 1), B2 = g2.data.tableau.tileAt(b2.minRow, b2.minCol + 2)
  A2.terrain = 'plains'; C2.terrain = 'ocean'; B2.terrain = 'plains'
  g2._applyModifier({ kind: 'modifier', key: 'mass_drivers' })
  assert(!g2._reachableWithin(A2.row, A2.col, 1).has(key(B2)), 'Mass Drivers does NOT bridge ocean')
  // Reuseable Rocketry: any moon tile becomes adjacent to any earth tile.
  const g3 = new GameManager(42); g3.setEra(14)
  const b3 = g3.data.tableau.visibleBounds(14)
  const M = g3.data.tableau.tileAt(b3.minRow, b3.minCol); M.terrain = 'moon'
  const E = g3.data.tableau.tileAt(b3.maxRow, b3.maxCol); E.terrain = 'plains'; g3._netsCache = null
  assert(!g3._reachableWithin(M.row, M.col, 1).has(key(E)), 'moon–earth not adjacent (baseline)')
  g3._applyModifier({ kind: 'modifier', key: 'reuseable_rocketry' })
  console.log(`  Combustion/Mass Drivers isolation OK; moon↔earth bridged = ${g3._reachableWithin(M.row, M.col, 1).has(key(E))}`)
  assert(g3._reachableWithin(M.row, M.col, 1).has(key(E)), 'Reuseable Rocketry: moon adjacent to earth')
  g.stop(); g2.stop(); g3.stop()
}

console.log('TEST 34: P=NP projected legitimacy loss')
{
  const g = new GameManager(43)
  assert(g.projectedLegitLoss() === null && g.hasProjectedLegit() === false, 'null when P=NP inactive')
  g.data.civilization.bonuses.push('p_np')
  assert(g.hasProjectedLegit() === true, 'active after bonus')
  const b = g.data.tableau.visibleBounds(0)
  g.data.enemies = [
    mkEnemy('warrior', 'A', b.minCol, b.maxRow + 1, 100, 7),     // blocked column
    mkEnemy('warrior', 'B', b.minCol + 1, b.maxRow + 1, 100, 4), // open column
  ]
  g.data.tableau.tileAt(b.minRow, b.minCol).unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  const l0 = g.data.civilization.legitimacy.value
  assert(g.projectedLegitLoss() === 4, `only open-column enemy (atk 4) counts (got ${g.projectedLegitLoss()})`)
  g.data.civilization.policies.push({ key: 'firewall' })
  assert(g.projectedLegitLoss() === 3, `Firewall ×0.75 → 3 (got ${g.projectedLegitLoss()})`)
  g.data.civilization.policies.pop()
  g.data.civilization.policies.push({ key: 'democracy' })
  assert(g.projectedLegitLoss() === 8, `Democracy ×2 → 8 (got ${g.projectedLegitLoss()})`)
  g.data.civilization.policies.pop()
  g.data.enemies[1].damaged = true
  assert(g.projectedLegitLoss() === 0, 'damaged enemy excluded')
  assert(g.data.civilization.legitimacy.value === l0, 'projection is read-only')
  // Walkover trap (Caltrops) does NOT block the column in the projection (mirrors _enemyAct).
  g.data.enemies[1].damaged = false
  g.data.tableau.tileAt(b.minRow, b.minCol + 1).building = { kind: 'building', key: 'caltrops', level: 1, hp: 1, maxHp: 1, damaged: false }
  assert(g.projectedLegitLoss() === 4, `Caltrops-only column still projects breach (got ${g.projectedLegitLoss()})`)
  console.log('  projection mirrors breach math (blockers, Firewall, Democracy, walkover-traps); read-only')
  g.stop()
}

console.log('TEST 35: Trap subsystem — Caltrops / Sea Mine / Powder Magazine / Discombobulator + Guerilla Warfare')
{
  const marchTrap = (key, seed) => {
    const g = new GameManager(seed); g.setEra(8)
    const b = g.data.tableau.visibleBounds(8)
    const col = b.minCol
    const tt = g.data.tableau.tileAt(b.minRow, col); tt.terrain = 'plains'
    tt.building = { kind: 'building', key, level: 1, hp: 1, maxHp: 1, damaged: false }
    const e = mkEnemy('warrior', 'X', col, b.minRow + 1, 100000, 5)
    g.data.enemies = [e]
    g._startCombat(); g.dismissCombatIntro()
    g._runTurn() // enemy marches onto the trap tile
    return { g, e, tt }
  }
  // Caltrops: 20 on every crossing.
  let r = marchTrap('caltrops', 44)
  console.log(`  Caltrops dmg = ${100000 - r.e.hp} (expect 20)`)
  assert(100000 - r.e.hp === 20, `Caltrops deals 20 (got ${100000 - r.e.hp})`); r.g.stop()
  // Guerilla Warfare doubles it.
  {
    const g = new GameManager(45); g.setEra(8)
    const b = g.data.tableau.visibleBounds(8); const col = b.minCol
    g.data.tableau.tileAt(b.minRow, col).building = { kind: 'building', key: 'caltrops', level: 1, hp: 1, maxHp: 1, damaged: false }
    g.data.civilization.policies[0] = { key: 'guerilla_warfare' }
    const e = mkEnemy('warrior', 'X', col, b.minRow + 1, 100000, 5); g.data.enemies = [e]
    g._startCombat(); g.dismissCombatIntro(); g._runTurn()
    console.log(`  Caltrops + Guerilla Warfare dmg = ${100000 - e.hp} (expect 40)`)
    assert(100000 - e.hp === 40, `Guerilla Warfare doubles trap damage (got ${100000 - e.hp})`); g.stop()
  }
  // Sea Mine: 89 to the first enemy, then consumed.
  r = marchTrap('sea_mine', 46)
  console.log(`  Sea Mine dmg = ${100000 - r.e.hp} (expect 89); consumed = ${r.tt.building === null}`)
  assert(100000 - r.e.hp === 89, `Sea Mine deals 89 (got ${100000 - r.e.hp})`)
  assert(r.tt.building === null, 'Sea Mine consumed after firing'); r.g.stop()
  // Powder Magazine: blocks, explodes for 45 AoE when destroyed.
  {
    const g = new GameManager(47); g.setEra(8)
    const b = g.data.tableau.visibleBounds(8); const col = b.minCol
    g.data.tableau.tileAt(b.minRow, col).building = { kind: 'building', key: 'powder_magazine', level: 1, hp: 1, maxHp: 1, damaged: false }
    const e = mkEnemy('warrior', 'X', col, b.minRow + 1, 100000, 5); g.data.enemies = [e]
    g._startCombat(); g.dismissCombatIntro()
    g._runTurn() // enemy chips the hp-1 magazine → destroyed → 45 AoE (enemy is adjacent)
    console.log(`  Powder Magazine AoE dmg = ${100000 - e.hp} (expect 45)`)
    assert(100000 - e.hp === 45, `Powder Magazine explodes for 45 (got ${100000 - e.hp})`); g.stop()
  }
  // Discombobulator: stuns nearby enemies (skipTurns).
  {
    const g = new GameManager(48); g.setEra(14)
    const b = g.data.tableau.visibleBounds(14); const col = b.minCol
    g.data.tableau.tileAt(b.minRow, col).building = { kind: 'building', key: 'discombobulator', level: 1, hp: 2, maxHp: 2, damaged: false }
    const e = mkEnemy('warrior', 'X', col, b.minRow + 1, 100, 5); g.data.enemies = [e]
    g._applyTrapTriggers()
    console.log(`  Discombobulator set enemy skipTurns = ${e.skipTurns} (expect 1)`)
    assert(e.skipTurns === 1, `Discombobulator stuns nearby enemy (got ${e.skipTurns})`); g.stop()
  }
}

console.log('TEST 36: Command auras — Command Post atk%, Deflector def, Star Fort range, Chronobooster act-twice')
{
  const g = new GameManager(52); g.setEra(22)
  const b = g.data.tableau.visibleBounds(22)
  const ut = g.data.tableau.tileAt(b.minRow, b.minCol); ut.terrain = 'plains'
  ut.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g._syncUnitStats(true); const atk0 = ut.unit.atk, def0 = ut.unit.maxHp
  // Command Post adjacent → +50% attack.
  const ct = g.data.tableau.tileAt(b.minRow, b.minCol + 1); ct.terrain = 'plains'
  ct.building = { kind: 'building', key: 'command_post', level: 1, hp: 2, maxHp: 2, damaged: false }
  g._syncUnitStats(true)
  console.log(`  Command Post: atk ${atk0} → ${ut.unit.atk} (expect ×1.5)`)
  assert(ut.unit.atk === Math.round(atk0 * 1.5), `Command Post +50% atk (got ${ut.unit.atk} vs ${Math.round(atk0 * 1.5)})`)
  // Swap in a Deflector Array → +2 defense.
  ct.building = { kind: 'building', key: 'deflector_array', level: 1, hp: 2, maxHp: 2, damaged: false }
  g._syncUnitStats(true)
  assert(ut.unit.maxHp === def0 + 2, `Deflector Array +2 def (got ${ut.unit.maxHp} vs ${def0 + 2})`)
  // Star Fort → +1 range to a ranged unit.
  ut.unit = { kind: 'unit', key: 'slinger', level: 1, hp: 3, maxHp: 3, damaged: false }
  g._syncUnitStats(true); const r0 = g._pieceRange(ut.unit)
  ct.building = { kind: 'building', key: 'star_fort', level: 1, hp: 2, maxHp: 2, damaged: false }
  g._syncUnitStats(true); const r1 = g._pieceRange(ut.unit)
  console.log(`  Star Fort: Slinger range ${r0} → ${r1} (expect +1)`)
  assert(r1 - r0 === 1, `Star Fort +1 ranged range (got +${r1 - r0})`)
  // Chronobooster → warrior fires twice per turn.
  const g2 = new GameManager(53); g2.setEra(26)
  const bb = g2.data.tableau.visibleBounds(26)
  const wt = g2.data.tableau.tileAt(bb.minRow, bb.minCol); wt.terrain = 'plains'
  wt.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g2.data.tableau.tileAt(bb.minRow, bb.minCol + 1).building = { kind: 'building', key: 'chronobooster', level: 1, hp: 1, maxHp: 1, damaged: false }
  const e = mkEnemy('warrior', 'X', bb.minCol, bb.minRow + 1, 100000, 5)
  g2.data.enemies = [e]
  g2._startCombat(); g2.dismissCombatIntro()
  const wAtk = wt.unit.atk
  g2.data.combatEvents = []
  g2._playerPhase()
  console.log(`  Chronobooster: warrior atk ${wAtk}, enemy took ${100000 - e.hp} in one player phase (expect 2×)`)
  assert(100000 - e.hp === wAtk * 2, `Chronobooster: two attacks/turn (got ${100000 - e.hp} vs ${wAtk * 2})`)
  g.stop(); g2.stop()
}

console.log('TEST 37: Spawner — Stables creates a cavalry unit every 8 turns')
{
  const g = new GameManager(54); g.setEra(6)
  const cavKey = Object.values(UNIT_DEFS).find((d) => d.types.includes('cavalry') && d.era <= 6)?.key
  assert(!!cavKey, 'a cavalry unit exists by era 6')
  g.data.civilization.units[2] = { key: cavKey, level: 1 } // cavalry = slot index 2
  const b = g.data.tableau.visibleBounds(6)
  const st = g.data.tableau.tileAt(b.minRow + 1, b.minCol); st.terrain = 'plains'
  st.building = { kind: 'building', key: 'stables', level: 2, hp: 2, maxHp: 2, damaged: false }
  for (const nb of g._adjacentTiles(st.row, st.col)) { nb.terrain = 'plains' } // ensure a land landing spot
  g._startCombat(); g.dismissCombatIntro()
  const before = g.data.tableau.visibleTiles(6).filter((t) => t.unit).length
  for (let i = 0; i < 7; i++) g._applySpawners()
  const mid = g.data.tableau.visibleTiles(6).filter((t) => t.unit).length
  g._applySpawners() // 8th tick fires
  const after = g.data.tableau.visibleTiles(6).filter((t) => t.unit).length
  console.log(`  units ${before} → (7 ticks) ${mid} → (8th) ${after}`)
  assert(mid === before, 'no spawn before the 8th turn')
  assert(after === before + 1, `Stables spawns on the 8th turn (got +${after - before})`)
  const spawned = g.data.tableau.visibleTiles(6).find((t) => t.unit?.mercenary && t.unit.key === cavKey)
  assert(spawned && spawned.unit.level === 2, `spawned a level-2 (spawner level) mercenary cavalry`)
  g.stop()
}

console.log('TEST 38: Power building (Windmill) grants +1 free upgrade level to a unit in range')
{
  const g = new GameManager(55); g.setEra(6)
  const b = g.data.tableau.visibleBounds(6)
  const ut = g.data.tableau.tileAt(b.minRow, b.minCol); ut.terrain = 'plains'
  ut.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g._syncUnitStats(true); const a0 = ut.unit.atk
  const wt = g.data.tableau.tileAt(b.minRow, b.minCol + 1); wt.terrain = 'plains'
  wt.building = { kind: 'building', key: 'windmill', level: 1, hp: 2, maxHp: 2, damaged: false }
  g._syncUnitStats(true)
  const expect = unitStats(UNIT_DEFS.warrior, 2, 0, 0).atk // level 1 + 1
  console.log(`  Windmill: warrior atk ${a0} → ${ut.unit.atk} (expect ${expect})`)
  assert(ut.unit.atk === expect && ut.unit.level === 1, `Windmill +1 in-range level (got ${ut.unit.atk})`)
  g.stop()
}

console.log('TEST 39: Wonders — Skynet, Taj Mahal, Death Star, Panopticon, Great Wall')
{
  // Skynet: military unit +75% attack.
  const g = new GameManager(60); g.setEra(15)
  const b = g.data.tableau.visibleBounds(15)
  const t = g.data.tableau.tileAt(b.minRow, b.minCol); t.terrain = 'plains'
  t.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g._syncUnitStats(true); const a0 = t.unit.atk
  g.data.civilization.completedWonders.push('skynet'); g._syncUnitStats(true)
  console.log(`  Skynet: warrior atk ${a0} → ${t.unit.atk} (expect ×1.75)`)
  assert(t.unit.atk === Math.round(a0 * 1.75), `Skynet +75% military atk (got ${t.unit.atk})`)
  g.stop()
  // Taj Mahal: bank dead-unit attack → progress at era end.
  const g2 = new GameManager(61); g2.setEra(7)
  g2.data.civilization.completedWonders.push('taj_mahal')
  const dead = { kind: 'unit', key: 'warrior', level: 1, atk: 5, hp: 0, maxHp: 3, damaged: true }
  g2._onUnitDeath(dead, { row: 1, col: 1 })
  assert(g2.data.civilization.tajBank === 5, `Taj Mahal banks atk 5 (got ${g2.data.civilization.tajBank})`)
  const p0 = g2.data.civilization.progress.value; g2._applyEraEndEffects()
  assert(g2.data.civilization.progress.value - p0 === 5, `Taj Mahal era-end progress = bank`)
  g2.stop()
  // Death Star: vaporize a random enemy + 5000 to Azazoth.
  const g3 = new GameManager(62); g3.setEra(24)
  g3.data.enemies = [mkEnemy('warrior', 'A', 1, 5, 100, 5), { key: 'azazoth', row: 6, col: 2, hp: 20000, maxHp: 20000, damaged: false, breached: false }]
  g3._applyDeathStar()
  const vaporized = g3.data.enemies.filter((e) => e.damaged).length
  console.log(`  Death Star: vaporized ${vaporized} enemy; Azazoth hp ${g3.data.enemies[1].hp}`)
  assert(vaporized >= 1, 'Death Star vaporizes an enemy')
  assert(g3.data.enemies[1].hp <= 15000, `Death Star hits Azazoth for 5000 (got ${20000 - g3.data.enemies[1].hp})`)
  g3.stop()
  // Panopticon: reposition an enemy to an empty battlefield cell during prep.
  const g4 = new GameManager(63); g4.setEra(21); g4.data.phase = 'prep'
  g4.data.civilization.completedWonders.push('panopticon')
  const eb = g4.data.tableau.visibleBounds(21)
  const eA = { key: 'warrior', name: 'A', row: eb.maxRow + 1, col: eb.minCol, hp: 100, maxHp: 100, damaged: false, breached: false }
  const eB = { key: 'warrior', name: 'B', row: eb.maxRow + 1, col: eb.minCol + 2, hp: 80, maxHp: 80, damaged: false, breached: false }
  g4.data.enemies = [eA, eB]
  // Move A to an empty cell.
  assert(g4.canRepositionEnemy(eA.row, eA.col, eb.maxRow + 1, eb.minCol + 1), 'enemy repositionable to an empty cell')
  g4.moveEnemy(eA.row, eA.col, eb.maxRow + 1, eb.minCol + 1)
  assert(eA.col === eb.minCol + 1, `Panopticon moved the enemy (col ${eA.col})`)
  // SWAP A and B (both live enemies) — mirrors friendly-unit swapping.
  assert(g4.canRepositionEnemy(eA.row, eA.col, eB.row, eB.col), 'enemies can swap')
  g4.moveEnemy(eA.row, eA.col, eB.row, eB.col)
  assert(eA.col === eb.minCol + 2 && eB.col === eb.minCol + 1, `Panopticon swapped the two enemies (A@${eA.col}, B@${eB.col})`)
  g4.data.phase = 'battle'
  assert(!g4.canRepositionEnemy(eA.row, eA.col, eb.maxRow + 1, eb.minCol), 'no enemy reposition outside prep')
  g4.stop()
  // Stargate: buildings become repositionable during prep.
  const g6 = new GameManager(65); g6.setEra(20); g6.data.phase = 'prep'
  const sb = g6.data.tableau.visibleBounds(20)
  const src = g6.data.tableau.tileAt(sb.minRow, sb.minCol); src.terrain = 'plains'
  src.building = { kind: 'building', key: 'totem', level: 1, hp: 15, maxHp: 15, damaged: false }
  const dst = g6.data.tableau.tileAt(sb.minRow, sb.minCol + 1); dst.terrain = 'plains'
  assert(!g6.canReposition(src.row, src.col, dst.row, dst.col), 'building NOT repositionable without Stargate')
  g6.data.civilization.completedWonders.push('stargate')
  assert(g6.canReposition(src.row, src.col, dst.row, dst.col), 'Stargate → building repositionable in prep')
  g6.moveUnit(src.row, src.col, dst.row, dst.col)
  assert(dst.building?.key === 'totem' && !src.building, 'Stargate moved the building')
  g6.stop()
}

console.log('TEST 40: Machine Gun underlay — the unit on its tile attacks +level extra times')
{
  const g = new GameManager(73); g.setEra(9)
  const b = g.data.tableau.visibleBounds(9)
  const t = g.data.tableau.tileAt(b.minRow, b.minCol); t.terrain = 'plains'
  t.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  t.building = { kind: 'building', key: 'machine_gun', level: 2, hp: 4, maxHp: 4, damaged: false } // +2 extra attacks
  const e = mkEnemy('warrior', 'X', b.minCol, b.minRow + 1, 100000, 5)
  g.data.enemies = [e]
  g._startCombat(); g.dismissCombatIntro()
  const wAtk = t.unit.atk
  g.data.combatEvents = []
  g._playerPhase()
  console.log(`  Machine Gun lvl 2: warrior atk ${wAtk}, enemy took ${100000 - e.hp} (expect 3× = base + 2 extra)`)
  assert(100000 - e.hp === wAtk * 3, `Machine Gun +2 extra attacks → 3 total (got ${100000 - e.hp} vs ${wAtk * 3})`)
  g.stop()
}

console.log('TEST 41: Impassable building (Moon Base) — enemies cannot pass or destroy it')
{
  const g = new GameManager(74); g.setEra(14)
  const b = g.data.tableau.visibleBounds(14)
  const wt = g.data.tableau.tileAt(b.minRow, b.minCol); wt.terrain = 'plains'
  wt.building = { kind: 'building', key: 'moon_base', level: 1, hp: 3, maxHp: 3, damaged: false }
  const e = mkEnemy('warrior', 'X', b.minCol, b.minRow + 1, 100, 5)
  g.data.enemies = [e]
  g._startCombat(); g.dismissCombatIntro()
  const l0 = g.data.civilization.legitimacy.value
  for (let i = 0; i < 30; i++) g._runTurn()
  console.log(`  after combat: enemy breached=${e.breached}, Moon Base intact=${wt.building && !wt.building.damaged}, legit lost=${l0 - g.data.civilization.legitimacy.value}`)
  assert(!e.breached, 'enemy never breaches past the Moon Base')
  assert(wt.building && !wt.building.damaged, 'Moon Base is never destroyed by a normal enemy')
  assert(g.data.civilization.legitimacy.value === l0, 'no legitimacy lost')
  g.stop()
}

console.log('TEST 42: Support combat buildings — Campfire heal + Embassy free mercenary')
{
  const g = new GameManager(75); g.setEra(3)
  const b = g.data.tableau.visibleBounds(3)
  // Campfire heals an adjacent damaged unit.
  const ct = g.data.tableau.tileAt(b.minRow, b.minCol); ct.terrain = 'plains'
  ct.building = { kind: 'building', key: 'campfire', level: 1, hp: 1, maxHp: 1, damaged: false }
  const nb = g._adjacentTiles(ct.row, ct.col).find((t) => t.def?.place === 'land' && !t.unit && !t.building)
  nb.terrain = 'plains'; nb.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 1, maxHp: 20, damaged: false }
  const hp0 = nb.unit.hp
  g._applySupportBuildings()
  console.log(`  Campfire: adjacent unit hp ${hp0} → ${nb.unit.hp}`)
  assert(nb.unit.hp > hp0, `Campfire heals adjacent unit (got ${hp0}→${nb.unit.hp})`)
  g.stop()
  // Embassy hires a free mercenary every 8 turns onto an adjacent tile.
  const g2 = new GameManager(76); g2.setEra(4)
  const b2 = g2.data.tableau.visibleBounds(4)
  const et = g2.data.tableau.tileAt(b2.minRow, b2.minCol); et.terrain = 'plains'
  et.building = { kind: 'building', key: 'embassy', level: 1, hp: 20, maxHp: 20, damaged: false }
  for (const t of g2._adjacentTiles(et.row, et.col)) t.terrain = 'plains'
  const before = g2.data.tableau.visibleTiles(4).filter((t) => t.unit).length
  for (let i = 0; i < 7; i++) g2._applySupportBuildings()
  const mid = g2.data.tableau.visibleTiles(4).filter((t) => t.unit).length
  g2._applySupportBuildings() // 8th → spawn
  const after = g2.data.tableau.visibleTiles(4).filter((t) => t.unit).length
  console.log(`  Embassy: units ${before} → (7) ${mid} → (8th) ${after}`)
  assert(mid === before && after === before + 1, `Embassy spawns a merc on the 8th turn`)
  g2.stop()
}

console.log('TEST 43: Reposition is region-limited by default; bridge techs cross regions')
{
  const g = new GameManager(80); g.setEra(9); g.data.phase = 'prep'
  const b = g.data.tableau.visibleBounds(9)
  const strait = b.minCol + 1
  for (let r = 1; r <= 9; r++) { const tl = g.data.tableau.tileAt(r, strait); if (tl) tl.terrain = 'ocean' } // full-height ocean strait
  const A = g.data.tableau.tileAt(b.minRow, b.minCol); A.terrain = 'plains'
  const D = g.data.tableau.tileAt(b.minRow + 1, b.minCol); D.terrain = 'plains' // same continent as A
  const C = g.data.tableau.tileAt(b.minRow, b.minCol + 2); C.terrain = 'plains' // across the strait
  g._netsCache = null
  A.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  assert(g.canReposition(A.row, A.col, D.row, D.col), 'within-continent reposition allowed')
  assert(!g.canReposition(A.row, A.col, C.row, C.col), 'cross-ocean reposition blocked by default')
  g._applyModifier({ kind: 'modifier', key: 'combustion' })
  console.log(`  land unit across an ocean strait: blocked by default, allowed with Combustion`)
  assert(g.canReposition(A.row, A.col, C.row, C.col), 'Combustion bridges the ocean → cross reposition allowed')
  g.stop()
}

console.log('TEST 44: Reposition region — naval along a connected shoreline, not to an isolated coast')
{
  const g = new GameManager(81); g.setEra(20); g.data.phase = 'prep'
  const b = g.data.tableau.visibleBounds(20)
  // Naval units stand on COAST tiles; their region is the connected shoreline.
  const W1 = g.data.tableau.tileAt(b.minRow, b.minCol); W1.terrain = 'coast'
  const W2 = g.data.tableau.tileAt(b.minRow, b.minCol + 1); W2.terrain = 'coast' // same shoreline (adjacent)
  const EX = g.data.tableau.tileAt(b.maxRow, b.maxCol); EX.terrain = 'coast'    // a coast island…
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nt = g.data.tableau.tileAt(EX.row + dr, EX.col + dc); if (nt) nt.terrain = 'space' } // …isolated by space
  g._netsCache = null
  const naval = Object.values(UNIT_DEFS).find((d) => d.types.includes('naval') && d.era <= 20)?.key
  W1.unit = { kind: 'unit', key: naval, level: 1, hp: 5, maxHp: 5, damaged: false }
  assert(g.canReposition(W1.row, W1.col, W2.row, W2.col), 'naval reposition along a connected shoreline allowed')
  assert(!g.canReposition(W1.row, W1.col, EX.row, EX.col), 'naval cannot reach a disconnected (space-isolated) coast')
  g.stop()
}

console.log('TEST 45: Naval placement domains — coast-bound vs open-water (exosea = open ocean)')
{
  assert(canPlaceOn('water', 'ocean') && canPlaceOn('water', 'exosea') && canPlaceOn('water', 'coast'), 'open-water: ocean + exosea + coast')
  assert(!canPlaceOn('water', 'plains') && !canPlaceOn('water', 'space'), 'open-water: not land or space')
  assert(canPlaceOn('coast', 'coast') && !canPlaceOn('coast', 'ocean') && !canPlaceOn('coast', 'exosea'), 'coast-bound: coast only')
  // Blue-water ships/buildings are 'water'; coastal ones stay 'coast'.
  assert(UNIT_DEFS.longship.placement === 'water' && UNIT_DEFS.leviathan.placement === 'water', 'longship/leviathan open-water')
  assert(UNIT_DEFS.galley.placement === 'coast' && UNIT_DEFS.trireme.placement === 'coast', 'galley/trireme coast-bound')
  assert(BUILDING_DEFS.sea_mine.placement === 'water' && BUILDING_DEFS.aircraft_carrier.placement === 'water', 'sea mine / carrier open-water')
  assert(BUILDING_DEFS.pier.placement === 'coast' && BUILDING_DEFS.drydock.placement === 'coast', 'pier/drydock coast-bound')
  console.log('  water = ocean/exosea/coast; coast = coast only; exosea treated as open ocean')
}

console.log('TEST 46: Multi-tile footprint building (Shinkansen 3×1) — placement, occupancy, shared HP, adjacency')
{
  const g = new GameManager(90); g.setEra(13)
  const b = g.data.tableau.visibleBounds(13)
  const anchor = g.data.tableau.tileAt(b.minRow, b.minCol)
  for (let dc = 0; dc < 3; dc++) g.data.tableau.tileAt(b.minRow, b.minCol + dc).terrain = 'plains'
  // Placement is blocked if any footprint cell is occupied.
  const mid = g.data.tableau.tileAt(b.minRow, b.minCol + 1); mid.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  assert(!g._canPlaceHere({ kind: 'building', key: 'shinkansen', level: 1 }, anchor), '3×1 placement blocked by an occupied cell')
  mid.unit = null
  assert(g._canPlaceHere({ kind: 'building', key: 'shinkansen', level: 1 }, anchor), '3×1 placement valid when cells are clear')
  // Place it — occupies 3 tiles with the SAME instance.
  g._createInstance({ kind: 'building', key: 'shinkansen', level: 1 }, anchor)
  const cells = [0, 1, 2].map((dc) => g.data.tableau.tileAt(b.minRow, b.minCol + dc))
  assert(cells.every((t) => t.building && t.building === cells[0].building), 'all 3 cells share one instance')
  assert(cells[0].building.anchor.col === b.minCol, 'anchor recorded')
  // Counted ONCE (not 3×) as a deployed building.
  const bcount = g.data.tableau.visibleTiles(13).filter((t) => t.building && g._isAnchor(t, t.building)).length
  assert(bcount === 1, `multi-tile building counted once (got ${bcount} anchors)`)
  // Shared HP: damaging via any cell hits the one shared instance.
  cells[2].building.hp -= 2
  assert(cells[0].building.hp === cells[0].building.maxHp - 2, 'HP is shared across all cells')
  // Links adjacency: the 3 rail tiles + their neighbours are one adjacency network.
  assert(g._reachableWithin(b.minRow, b.minCol, 1).has(`${b.minRow},${b.minCol + 2}`), 'Shinkansen links its span into one adjacency net')
  g.stop()
}

console.log('TEST 47: Great Wall wonder — player places a real 4-lane shared-HP blocker')
{
  const g = new GameManager(91); g.setEra(3)
  g._unlockWonder({ key: 'great_wall' })
  const b = g.data.tableau.visibleBounds(3)
  // Force a 4-wide empty land strip on the front row and place the wall there.
  const row = b.minRow
  for (let c = b.minCol; c <= b.minCol + 3; c++) { const t = g.data.tableau.tileAt(row, c); t.terrain = 'plains'; t.unit = null; t.building = null }
  const anchor = g.data.tableau.tileAt(row, b.minCol)
  assert(g._canPlaceHere({ kind: 'building', key: 'great_wall', wonder: true }, anchor), 'great wall placeable on a 4-wide land strip')
  // The first production pick PLACES the incomplete structure (placement = build #1).
  g._createInstance({ kind: 'building', key: 'great_wall', level: 1, wonder: true }, anchor)
  const wall = anchor.building
  const span = g.data.tableau.visibleTiles(3).filter((t) => t.building === wall)
  console.log(`  Great Wall spans ${span.length} tiles (footprint ${wall.footprint}), shared HP ${wall.maxHp}`)
  assert(span.length === 4, `structure spans 4 tiles (got ${span.length})`)
  assert(wall.wonder && !wall.complete, 'placed wall is an incomplete wonder')
  assert(g.data.civilization.wonder && g.data.civilization.wonder.placed, 'wonder marked placed, still in flight')
  // Subsequent production picks advance it to completion.
  let guard = 10
  while (g.data.civilization.wonder && guard-- > 0) g.advanceWonderProgress()
  assert(g._hasWonder('great_wall') && wall.complete, 'wonder marked complete after its builds')
  // The Great Wall keeps its explicit 20 :defense: (still no level/region/Hereditary inflation).
  g._syncUnitStats(true)
  assert(wall.maxHp === 20, `Great Wall has 20 def (got ${wall.maxHp})`)
  // Shared HP: damaging via any cell hits the one shared instance.
  span[2].building.hp -= 1
  assert(span[0].building.hp === span[0].building.maxHp - 1, 'HP is shared across all 4 lanes')
  // It blocks an enemy in one of its lanes for its HP worth of turns (combat-only, no economy).
  const wallTile = span.find((t) => t.row === b.minRow) || span[0]
  const e = mkEnemy('warrior', 'X', wallTile.col, wallTile.row + 1, 100, 5)
  g.data.enemies = [e]
  g._startCombat(); g.dismissCombatIntro()
  const l0 = g.data.civilization.legitimacy.value
  for (let i = 0; i < 2; i++) g._runTurn() // the 20-HP wall easily absorbs 2 chips
  console.log(`  enemy in a wall lane: breached=${e.breached}, legit lost=${l0 - g.data.civilization.legitimacy.value}`)
  assert(!e.breached && l0 === g.data.civilization.legitimacy.value, 'the wall blocks its lane while it stands')
  g.stop()
}

console.log('TEST 50: wonders keep a flat 2 def (Death Star 5) despite level/region/Hereditary inflation')
{
  const g = new GameManager(94); g.setEra(14)
  // Stack every building-HP inflation source: Great Mirror (terrestrial +2 levels), Hereditary Rule
  // building def, and a high upgrade level — none must touch a wonder's HP.
  g.data.civilization.modifiers.buildingHpBonus = 999
  g.data.civilization.completedWonders.push('great_mirror') // terrestrial_levels +2 via _regionLevelBonus
  const b = g.data.tableau.visibleBounds(14)
  const t1 = g.data.tableau.tiles.get(`${b.minRow},${b.minCol}`); t1.terrain = 'mountain'; t1.unit = null; t1.building = null
  g._createInstance({ kind: 'building', key: 'stonehenge', level: 9, wonder: true }, t1)
  g._syncUnitStats(true)
  console.log(`  Stonehenge (lvl 9, +999 bonus, Great Mirror, on mountain) def = ${t1.building.maxHp}`)
  assert(t1.building.maxHp === 2, `Stonehenge stays 2 def (got ${t1.building.maxHp})`)
  // Death Star gets 5.
  const g2 = new GameManager(95); g2.setEra(24)
  const b2 = g2.data.tableau.visibleBounds(24)
  // find a 2x2 deep-space anchor
  let anchor2 = null
  for (let r = b2.minRow; r <= b2.maxRow - 1 && !anchor2; r++)
    for (let c = b2.minCol; c <= b2.maxCol - 1; c++) {
      const cells = [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]].map(([rr, cc]) => g2.data.tableau.tiles.get(`${rr},${cc}`))
      if (cells.every((x) => x)) { cells.forEach((x) => { x.terrain = 'deep_space'; x.unit = null; x.building = null }); anchor2 = cells[0]; break }
    }
  if (anchor2) {
    g2.data.civilization.modifiers.buildingHpBonus = 999
    g2._createInstance({ kind: 'building', key: 'death_star', level: 5, wonder: true }, anchor2)
    g2._syncUnitStats(true)
    console.log(`  Death Star (lvl 5, +999 bonus) def = ${anchor2.building.maxHp}`)
    assert(anchor2.building.maxHp === 5, `Death Star stays 5 def (got ${anchor2.building.maxHp})`)
  } else {
    console.log('  (skipped Death Star — no 2x2 deep-space anchor at era 24)')
  }
  g.stop(); g2.stop()
}

console.log('TEST 48: wonder lifecycle — pick→place→advance→complete; destroy retains progress, repair 3×')
{
  // Find a valid empty land tile for a 1×1 wonder in the current view.
  const landSpot = (g, era) => {
    for (const t of g.data.tableau.visibleTiles(era)) {
      if (!t.unit && !t.building && !t.underlay) { t.terrain = 'plains'; return t }
    }
    return null
  }
  // (a) Full flow via the production selection: pick the wonder, place it, keep picking to finish.
  const g = new GameManager(101); g.setEra(0)
  g._unlockWonder({ key: 'stonehenge' })
  assert(g.data.civilization.wonder && !g.data.civilization.wonder.placed, 'unlocked into the wonder slot, not placed')
  g.data.pendingProduction = 5
  g._openProductionSelection()
  g.pickWonder()
  assert(g.data.selection.stage === 'place' && g.data.selection.chosen.wonder, 'pickWonder routes to the place stage')
  const spot = landSpot(g, 0)
  g.placeAt(spot.row, spot.col)
  const inst = spot.building
  assert(inst && inst.wonder && !inst.complete, 'an incomplete wonder now sits on the board')
  assert(g.data.civilization.wonder.buildsLeft === WONDER_BUILDS - 1, 'placement counts as the first build')
  let guard = 10
  while (g.data.civilization.wonder && guard-- > 0) { g._openProductionSelection(); g.pickWonder() }
  assert(g._hasWonder('stonehenge') && inst.complete, `completed after ${WONDER_BUILDS} production picks`)
  g.stop()

  // (b) Destroyed incomplete wonder: progress remains, advance blocked, repair costs 3× and unblocks.
  const g2 = new GameManager(102); g2.setEra(0)
  g2._unlockWonder({ key: 'stonehenge' })
  const spot2 = landSpot(g2, 0)
  g2._createInstance({ kind: 'building', key: 'stonehenge', level: 1, wonder: true }, spot2)
  const inst2 = spot2.building
  const leftBefore = g2.data.civilization.wonder.buildsLeft
  inst2.damaged = true // enemies destroyed it mid-build
  assert(!g2.canAdvanceWonder(), 'a destroyed wonder cannot be advanced')
  g2.advanceWonderProgress()
  assert(g2.data.civilization.wonder.buildsLeft === leftBefore, 'build progress is retained through destruction')
  const wcost = g2.repairCostFor(inst2)
  assert(wcost === buildingRepairCost(0) * 3, `wonder repair is 3× a building repair (got ${wcost} vs ${buildingRepairCost(0) * 3})`)
  g2.data.phase = 'prep'; g2.data.civilization.gold.value = wcost
  g2.repairOccupant(spot2.row, spot2.col)
  assert(!inst2.damaged && g2.canAdvanceWonder(), 'repairing un-damages it → progress can continue')
  g2.stop()
}

console.log('TEST 49: Stargate — a multi-tile wonder repositions into free space (no swap)')
{
  const g = new GameManager(93); g.setEra(13)
  g.data.civilization.completedWonders.push('stargate') // enables building reposition in prep
  g.data.phase = 'prep'
  const b = g.data.tableau.visibleBounds(13)
  const row = b.minRow
  // Clear the whole front row to land so we have room for the 4-wide wall + a move target.
  for (let c = b.minCol; c <= b.maxCol; c++) { const t = g.data.tableau.tileAt(row, c); t.terrain = 'plains'; t.unit = null; t.building = null }
  const anchor = g.data.tableau.tileAt(row, b.minCol)
  g.data.civilization.wonder = { key: 'great_wall', buildsLeft: WONDER_BUILDS, placed: false, inst: null }
  g._createInstance({ kind: 'building', key: 'great_wall', level: 1, wonder: true }, anchor)
  const wall = anchor.building
  const destCol = b.minCol + 4
  if (destCol + 3 <= b.maxCol) {
    assert(g.canReposition(row, b.minCol, row, destCol), 'wall repositionable to a free 4-wide strip')
    g.moveUnit(row, b.minCol, row, destCol)
    const newAnchor = g.data.tableau.tileAt(row, destCol)
    assert(newAnchor.building === wall && !anchor.building, 'wall moved to the new anchor; old cells cleared')
    const span = g.data.tableau.visibleTiles(13).filter((t) => t.building === wall)
    assert(span.length === 4 && wall.anchor.col === destCol, `wall still spans 4 tiles at new anchor (got ${span.length})`)
    // Space must be available: a unit sitting in the target footprint blocks the move.
    g.data.tableau.tileAt(row, b.minCol).unit = { kind: 'unit', key: 'warrior', level: 1, hp: 10, maxHp: 10, damaged: false }
    assert(!g.canReposition(row, destCol, row, b.minCol), 'blocked — destination footprint is not free (no swap)')
  } else {
    console.log('  (skipped move assertions — board too narrow at era 13)')
  }
  g.stop()
}

console.log('TEST 51: a DESTROYED wonder procs no end-of-era effect (until repaired)')
{
  const mk = (damaged) => {
    const g = new GameManager(96); g.setEra(4)
    g.data.civilization.pops = {} // isolate Stonehenge as the only legit source
    const b = g.data.tableau.visibleBounds(4)
    const t = g.data.tableau.tiles.get(`${b.minRow},${b.minCol}`); t.terrain = 'plains'; t.unit = null; t.building = null
    g._createInstance({ kind: 'building', key: 'stonehenge', level: 1, wonder: true }, t) // registers wonderInsts
    g.data.civilization.completedWonders.push('stonehenge')
    t.building.damaged = damaged
    const l0 = g.data.civilization.legitimacy.value
    g._endCombat()
    g.stop(); return g.data.civilization.legitimacy.value - l0
  }
  const alive = mk(false), destroyed = mk(true)
  console.log(`  Stonehenge end-of-era legit: alive +${alive}, destroyed +${destroyed}`)
  assert(alive === 25, `alive Stonehenge grants +25 (got +${alive})`)
  assert(destroyed === 0, `DESTROYED Stonehenge grants nothing (got +${destroyed})`)
}

console.log('TEST 52: Colosseum end-of-combat legit counts only LIVE deployed units')
{
  const g = new GameManager(97); g.setEra(3)
  g.data.civilization.pops = {}
  const b = g.data.tableau.visibleBounds(3)
  const t0 = g.data.tableau.tiles.get(`${b.minRow},${b.minCol}`); t0.terrain = 'plains'
  t0.building = { kind: 'building', key: 'colosseum', level: 1, hp: 20, maxHp: 20, damaged: false }
  // Two units: one live, one destroyed. Only the live one should count (5 legit each).
  const a = g.data.tableau.tiles.get(`${b.minRow},${b.minCol + 1}`); a.terrain = 'plains'
  a.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 10, maxHp: 10, damaged: false }
  const d = g.data.tableau.tiles.get(`${b.minRow + 1},${b.minCol + 1}`); d.terrain = 'plains'
  d.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 0, maxHp: 10, damaged: true }
  const l0 = g.data.civilization.legitimacy.value
  g._applyEraEndEffects()
  const gained = g.data.civilization.legitimacy.value - l0
  console.log(`  Colosseum legit with 1 live + 1 destroyed unit = +${gained}`)
  assert(gained === 5, `only the live unit counts → +5 (got +${gained})`)
  g.stop()
}

console.log('TEST 53: land enemies route around water; naval enemies cross it')
{
  const g = new GameManager(98); g.setEra(7)
  const b = g.data.tableau.visibleBounds(7)
  const cW = b.minCol, cL = b.minCol + 1
  for (let r = b.minRow; r <= b.maxRow; r++) {
    const tw = g.data.tableau.tileAt(r, cW); tw.terrain = 'ocean'; tw.unit = null; tw.building = null
    const tl = g.data.tableau.tileAt(r, cL); tl.terrain = 'plains'; tl.unit = null; tl.building = null
  }
  g.data.phase = 'battle'; g.data.combatIntro = false
  const land = mkEnemy('raider', 'L', cW, b.maxRow + 1, 500, 5) // melee land enemy over a water column
  g.data.enemies = [land]
  let steppedOnWater = false
  for (let i = 0; i < 40 && !land.breached; i++) {
    g._enemyPhase(b)
    if (land.row >= b.minRow && land.row <= b.maxRow && g.data.tableau.tileAt(land.row, land.col)?.terrain === 'ocean') steppedOnWater = true
  }
  console.log(`  land raider: final col=${land.col} (land col ${cL}), breached=${land.breached}, everOnWater=${steppedOnWater}`)
  assert(!steppedOnWater, 'land enemy never stands on water')
  assert(land.col === cL, `land enemy rerouted to the land column (got ${land.col}, want ${cL})`)
  assert(land.breached, 'land enemy eventually breaches down the land column')
  g.stop()

  const g2 = new GameManager(99); g2.setEra(7)
  const b2 = g2.data.tableau.visibleBounds(7)
  const wc = b2.minCol
  for (let r = b2.minRow; r <= b2.maxRow; r++) { const tw = g2.data.tableau.tileAt(r, wc); tw.terrain = 'ocean'; tw.unit = null; tw.building = null }
  g2.data.phase = 'battle'; g2.data.combatIntro = false
  const navy = mkEnemy('corsair', 'N', wc, b2.maxRow + 1, 500, 5) // naval enemy — crosses water
  g2.data.enemies = [navy]
  for (let i = 0; i < 40 && !navy.breached; i++) g2._enemyPhase(b2)
  console.log(`  naval corsair: final col=${navy.col} (start ${wc}), breached=${navy.breached}`)
  assert(navy.col === wc, 'naval enemy stays in its water column')
  assert(navy.breached, 'naval enemy crosses water and breaches')
  g2.stop()
}

console.log('TEST 54: a wall shields a unit sharing its tile — enemies chip the wall first')
{
  const g = new GameManager(100); g.setEra(2)
  const b = g.data.tableau.visibleBounds(2)
  const col = b.minCol
  for (let r = b.minRow; r <= b.maxRow; r++) g.data.tableau.tileAt(r, col).terrain = 'plains'
  const t = g.data.tableau.tileAt(b.minRow, col)
  t.building = { kind: 'building', key: 'stone_wall', level: 1, hp: 4, maxHp: 4, damaged: false }
  t.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 10, maxHp: 10, damaged: false }
  g.data.enemies = [mkEnemy('sentinel', 'S', col, b.minRow + 1, 1000, 5)] // right above the wall+unit tile
  g.data.phase = 'battle'; g.data.combatIntro = false
  g._enemyPhase(b)
  console.log(`  after 1 chip: wall ${t.building.hp}/${t.building.maxHp}, unit ${t.unit.hp}/${t.unit.maxHp}`)
  assert(t.building.hp < t.building.maxHp && t.unit.hp === t.unit.maxHp, 'the wall is chipped, the unit is untouched')
  // Bring the wall to the brink, destroy it, then the unit behind it becomes the blocker.
  t.building.hp = 1
  g._enemyPhase(b)
  assert(t.building.damaged, 'wall destroyed once chipped out')
  g._enemyPhase(b)
  console.log(`  after the wall falls: unit ${t.unit.hp}/${t.unit.maxHp}`)
  assert(t.unit.hp < t.unit.maxHp, 'once the wall falls the unit behind it is chipped')
  g.stop()
}

console.log('TEST 55: enemy abilities — Swarm, Warper, Berserker, speed modifiers')
{
  const g = new GameManager(110); g.setEra(5)
  const b = g.data.tableau.visibleBounds(5)
  g.data.phase = 'battle'; g.data.combatIntro = false; g.data.combatSeq = 1
  const sw = mkEnemy('swarm', 'W', b.minCol, b.maxRow + 1, 5, 50)
  g.data.enemies = [sw]
  g._dealDamageToEnemy(sw, 100) // huge hit → capped to 1
  assert(sw.hp === 4, `Swarm takes only 1 damage per hit (lost ${5 - sw.hp})`)
  assert(g.data.enemies.length === 2, 'Swarm splits (spawns another Swarm) when damaged')
  g.stop()

  // Warper: teleports somewhere else when damaged.
  const g2 = new GameManager(111); g2.setEra(24)
  const b2 = g2.data.tableau.visibleBounds(24)
  g2.data.phase = 'battle'; g2.data.combatIntro = false
  const wp = mkEnemy('enemy_warper', 'T', b2.minCol + 1, b2.maxRow, 100, 9); wp.types = ['astral']
  g2.data.enemies = [wp]
  const r0 = wp.row, c0 = wp.col
  g2._dealDamageToEnemy(wp, 10)
  assert(wp.row !== r0 || wp.col !== c0, 'Warper teleports when damaged')
  g2.stop()

  // Berserker: breach attack grows by its missing HP.
  const g3 = new GameManager(112); g3.setEra(5)
  assert(g3._enemyBreachAtk({ key: 'berserker', maxHp: 20, hp: 8, atk: 7 }) === 19, 'Berserker breach atk = base + missing HP')
  g3.stop()

  // Speed modifiers: Mongol ×2, Dervish ×3, Juggernaut skips even turns.
  const g4 = new GameManager(113); g4.setEra(6)
  g4.data.combatTurn = 1
  assert(g4._enemyActsThisTurn({ key: 'mongol' }) === 2, 'Mongol acts twice (double speed)')
  assert(g4._enemyActsThisTurn({ key: 'dervish' }) === 3, 'Dervish acts thrice (triple speed)')
  assert(g4._enemyActsThisTurn({ key: 'juggernaut' }) === 1, 'Juggernaut acts on an odd turn')
  g4.data.combatTurn = 2
  assert(g4._enemyActsThisTurn({ key: 'juggernaut' }) === 0, 'Juggernaut skips an even turn')
  g4.stop()
}

console.log('TEST 56: enemy abilities — blockers, ranged chip, auras')
{
  // Obliterator instantly destroys the blocker below it.
  const g = new GameManager(120); g.setEra(9)
  const b = g.data.tableau.visibleBounds(9)
  const col = b.minCol
  for (let r = b.minRow; r <= b.maxRow; r++) g.data.tableau.tileAt(r, col).terrain = 'plains'
  g.data.phase = 'battle'; g.data.combatIntro = false; g.data.combatSeq = 1
  const wall = { kind: 'building', key: 'stone_wall', level: 1, hp: 50, maxHp: 50, damaged: false }
  g.data.tableau.tileAt(b.minRow, col).building = wall
  const ob = mkEnemy('obliterator', 'O', col, b.minRow + 1, 100, 20)
  g.data.enemies = [ob]
  g._enemyAct(ob, b)
  assert(wall.damaged, 'Obliterator destroys a blocker instantly')
  g.stop()

  // Deadeye chips a blocker two tiles away without moving (ranged chip r4).
  const g2 = new GameManager(121); g2.setEra(9)
  const b2 = g2.data.tableau.visibleBounds(9)
  const c2 = b2.minCol
  for (let r = b2.minRow; r <= b2.maxRow; r++) g2.data.tableau.tileAt(r, c2).terrain = 'plains'
  const u = { kind: 'unit', key: 'warrior', level: 1, hp: 10, maxHp: 10, damaged: false }
  g2.data.tableau.tileAt(b2.maxRow - 1, c2).unit = u
  const de = mkEnemy('deadeye', 'D', c2, b2.maxRow + 1, 100, 3) // two tiles above the unit
  g2.data.enemies = [de]
  g2.data.phase = 'battle'; g2.data.combatIntro = false
  const dr0 = de.row
  g2._enemyAct(de, b2)
  assert(u.hp < u.maxHp && de.row === dr0, 'Deadeye chips a blocker at range without moving')
  g2.stop()

  // Leader buffs an adjacent enemy's breach attack (x2); Shaman heals an adjacent one.
  const g3 = new GameManager(122); g3.setEra(9)
  const b3 = g3.data.tableau.visibleBounds(9)
  const ld = mkEnemy('leader', 'L', b3.minCol, b3.maxRow + 1, 100, 3)
  const buddy = mkEnemy('raider', 'R', b3.minCol + 1, b3.maxRow + 1, 50, 5)
  const sh = mkEnemy('enemy_shaman', 'S', b3.minCol + 2, b3.maxRow + 1, 100, 1)
  const hurt = mkEnemy('raider', 'H', b3.minCol + 3, b3.maxRow + 1, 100, 5); hurt.hp = 50
  g3.data.enemies = [ld, buddy, sh, hurt]
  g3.data.phase = 'battle'; g3.data.combatIntro = false
  g3._applyEnemyAuras()
  assert(buddy.buffed === true && g3._enemyBreachAtk(buddy) === 10, 'Leader buffs adjacent enemy (x2 breach)')
  assert(hurt.hp > 50, 'Shaman heals an adjacent damaged enemy')
  g3.stop()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
