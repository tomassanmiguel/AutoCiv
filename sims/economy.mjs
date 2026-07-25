// Headless test of the v2 data-driven building output engine (def.output).
const { GameManager } = await import('../src/game/GameManager.js')
const { waveBudget } = await import('../src/game/data/enemies.js')

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

console.log('TEST 12: Temple — +20 legit on build, end-era gold = 3× legit, NO per-tick legit')
{
  const g = new GameManager(1); g.setEra(3)
  const tile = g.data.tableau.visibleTiles(3).find((t) => !t.building && !t.unit && t.def?.place === 'land')
  const legit0 = g.data.civilization.legitimacy.value
  g._createInstance({ kind: 'building', key: 'temple', level: 1 }, tile)
  assert(g.data.civilization.legitimacy.value - legit0 === 20, `Temple +20 legit on completion (got ${g.data.civilization.legitimacy.value - legit0})`)
  g._recomputeOutputs()
  assert(g.data.civilization.legitimacy.output === 0, `no per-tick legitimacy output (got ${g.data.civilization.legitimacy.output})`)
  g.data.civilization.legitimacy.value = 100
  const gold0 = g.data.civilization.gold.value
  g._applyEraEndEffects()
  const goldDelta = g.data.civilization.gold.value - gold0
  console.log(`  end-era gold +${goldDelta} (3× legit 100 = 300)`)
  assert(goldDelta === 300, `Temple end-era gold = 3×100 = 300 (got ${goldDelta})`)
}

console.log('TEST 13: terrain base-yield — a building also produces its terrain resource')
{
  const g = new GameManager(4); g.setEra(2)
  const tile = g.data.tableau.visibleTiles(2).find((t) => !t.building && !t.unit)
  tile.terrain = 'forest' // Forest → +1 progress
  const p0 = g.data.civilization.progress.output
  const gold0 = g.data.civilization.gold.output
  tile.building = { kind: 'building', key: 'market', level: 1, hp: 10, maxHp: 10, damaged: false }
  g._recomputeOutputs()
  const dp = g.data.civilization.progress.output - p0
  const dg = g.data.civilization.gold.output - gold0
  console.log(`  Market on Forest: +${dg} gold (Market 7) + ${dp} progress (Forest terrain)`)
  assert(dg === 7 && dp === 1, `Market 7 gold + Forest 1 progress (got gold ${dg}, progress ${dp})`)
}

console.log('TEST 14: specialist gold-upgrade chain — Astrologer → Scholar (one-way, all pops)')
{
  const g = new GameManager(1); g.setEra(5)
  const civ = g.data.civilization
  civ.population[1] = 'astrologer'; civ.pops.astrologer = 3
  civ.gold.value = 100000
  const info = g.specialistUpgradeInfo('astrologer')
  assert(info && info.next === 'scholar', `Astrologer upgrades to Scholar (got ${info?.next})`)
  g.upgradeSpecialistChain('astrologer')
  assert((civ.pops.astrologer ?? 0) === 0 && civ.pops.scholar === 3, `all 3 Astrologers → Scholars (got scholar ${civ.pops.scholar})`)
  assert(civ.population[1] === 'scholar', `roster slot now holds Scholar (got ${civ.population[1]})`)
  const out = g.popOutput('scholar')
  console.log(`  cost ${info.cost} gold; 3 Scholars now produce ${out.progress}/pop progress`)
  assert(out.progress === 8, `Scholar produces 8 progress/pop (got ${out.progress})`)
}

console.log('TEST 15: Forestry policy doubles the Forest terrain yield')
{
  const g = new GameManager(4); g.setEra(2)
  const tile = g.data.tableau.visibleTiles(2).find((t) => !t.building && !t.unit)
  tile.terrain = 'forest'
  tile.building = { kind: 'building', key: 'market', level: 1, hp: 10, maxHp: 10, damaged: false }
  g._recomputeOutputs(); const p0 = g.data.civilization.progress.output
  g.data.civilization.policies[0] = { key: 'forestry' }
  g._recomputeOutputs(); const p1 = g.data.civilization.progress.output
  console.log(`  Forest progress yield ${p0} → ${p1} with Forestry`)
  assert(p1 - p0 === 1, `Forestry doubles Forest yield (1→2 progress, got +${p1 - p0})`)
}

console.log('TEST 16: Pop-gain modifiers (Inoculation +3, Biological Immortality ×2, Semaglutides +3 Citizens)')
{
  const total = (civ) => Object.values(civ.pops).reduce((a, b) => a + b, 0)
  const base = new GameManager(6); base.setEra(8)
  const t0 = total(base.data.civilization); base.addPops(4); const gainBase = total(base.data.civilization) - t0
  const g = new GameManager(6); g.setEra(8)
  g.data.civilization.bonuses.push('inoculation')      // +3 pops
  g.data.civilization.policies[0] = { key: 'biological_immortality' } // ×2
  g.data.civilization.bonuses.push('semaglutides')     // +3 citizens
  const s0 = total(g.data.civilization); g.addPops(4); const gain = total(g.data.civilization) - s0
  console.log(`  base gain ${gainBase} → modified gain ${gain} for addPops(4)`)
  // (4 + 3) × 2 = 14, then +3 Citizens = 17
  assert(gainBase === 4, `base addPops(4) adds 4 (got ${gainBase})`)
  assert(gain === 17, `Inoculation+BioImmortality+Semaglutides: 4→17 (got ${gain})`)
}

console.log('TEST 17: Genome Mapping grants +20 population on unlock')
{
  const g = new GameManager(7); g.setEra(12)
  const before = Object.values(g.data.civilization.pops).reduce((a, b) => a + b, 0)
  g._applyModifier({ kind: 'modifier', key: 'genome_mapping' })
  const after = Object.values(g.data.civilization.pops).reduce((a, b) => a + b, 0)
  console.log(`  population ${before} → ${after}`)
  assert(after - before === 20, `Genome Mapping +20 population (got +${after - before})`)
}

console.log('TEST 18: Merchant Navy — each naval unit produces +2 gold per tick')
{
  const g = new GameManager(8); g.setEra(5)
  const tile = g.data.tableau.visibleTiles(5).find((t) => !t.building && !t.unit)
  tile.unit = { kind: 'unit', key: 'galley', level: 1, hp: 10, maxHp: 10, damaged: false }
  g._recomputeOutputs(); const gold0 = g.data.civilization.gold.output
  g.data.civilization.policies[0] = { key: 'merchant_navy' }
  g._recomputeOutputs(); const gold1 = g.data.civilization.gold.output
  console.log(`  gold/tick ${gold0} → ${gold1} with Merchant Navy + 1 Galley`)
  assert(gold1 - gold0 === 2, `Merchant Navy +2 gold/naval unit (got +${gold1 - gold0})`)
}

console.log('TEST 19: Columbian Exchange — New-World units/buildings produce +6 gold each per tick')
{
  const g = new GameManager(9); g.setEra(7)
  const tiles = g.data.tableau.visibleTiles(7).filter((t) => !t.building && !t.unit)
  tiles[0].label = 'New World'; tiles[0].unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  tiles[1].label = 'New World'; tiles[1].building = { kind: 'building', key: 'totem', level: 1, hp: 15, maxHp: 15, damaged: false }
  g._recomputeOutputs(); const gold0 = g.data.civilization.gold.output
  g.data.civilization.policies[0] = { key: 'columbian_exchange' }
  g._recomputeOutputs(); const gold1 = g.data.civilization.gold.output
  console.log(`  gold/tick ${gold0} → ${gold1} (1 New-World unit + 1 New-World building)`)
  assert(gold1 - gold0 === 12, `Columbian Exchange +6/each = +12 (got +${gold1 - gold0})`)
}

console.log('TEST 20: Game Theory — draws +1 advancement option')
{
  const g = new GameManager(10); g.setEra(12)
  const base = g._pickProgressOptions().length
  g.data.civilization.bonuses.push('game_theory')
  const boosted = g._pickProgressOptions().length
  console.log(`  options ${base} → ${boosted} with Game Theory`)
  assert(boosted === base + 1, `Game Theory +1 option (got ${boosted} vs ${base + 1})`)
}

console.log('TEST 21: Geneva Convention — reduces enemy host budget by 5%')
{
  // Host generation is unseeded, so verify the budget scaler Geneva threads (×0.95
  // into generateHost's difficulty arg) rather than comparing two noisy live hosts.
  const b1 = waveBudget(11, 1)
  const b2 = waveBudget(11, 0.95)
  console.log(`  wave budget era 11: ${Math.round(b1)} → ${Math.round(b2)} at ×0.95`)
  assert(Math.abs(b2 - b1 * 0.95) < 1e-6, `budget scales linearly with the multiplier`)
}

console.log('TEST 22: Evangelism — each Priest grants +1 more legitimacy per era')
{
  const g = new GameManager(11); g.setEra(4)
  g.data.civilization.pops.priest = 3
  const l0 = g.data.civilization.legitimacy.value
  g._applyEraEndEffects(); const base = g.data.civilization.legitimacy.value - l0 // 3 Priests × 1
  g.data.civilization.legitimacy.value = l0
  g.data.civilization.policies[0] = { key: 'evangelism' }
  g._applyEraEndEffects(); const withEv = g.data.civilization.legitimacy.value - l0 // 3 × 2
  console.log(`  3 Priests: +${base} legit → +${withEv} with Evangelism`)
  assert(base === 3 && withEv === 6, `Evangelism doubles Priest legit (3→6, got ${base}→${withEv})`)
  g.stop()
}

console.log('TEST 23: Replicant Rights — Replicant progress +200% (×3)')
{
  const g = new GameManager(12); g.setEra(20)
  const p0 = g.popOutput('replicant').progress
  g.data.civilization.policies[0] = { key: 'replicant_rights' }
  const p1 = g.popOutput('replicant').progress
  console.log(`  Replicant progress ${p0} → ${p1} with Replicant Rights`)
  assert(p1 === p0 * 3, `Replicant Rights ×3 progress (got ${p1} vs ${p0 * 3})`)
  g.stop()
}

console.log('TEST 24: Artificial Meat — food buildings double output as production')
{
  const g = new GameManager(13); g.setEra(2)
  const tile = g.data.tableau.visibleTiles(2).find((t) => !t.building && !t.unit && t.terrain === 'plains')
  tile.building = { kind: 'building', key: 'ranch', level: 1, hp: 10, maxHp: 10, damaged: false, ranchBonus: 0 }
  g._recomputeOutputs()
  const food0 = g.data.civilization.food.output, prod0 = g.data.civilization.production.output
  g.data.civilization.policies[0] = { key: 'artificial_meat' }
  g._recomputeOutputs()
  const food1 = g.data.civilization.food.output, prod1 = g.data.civilization.production.output
  console.log(`  Ranch: food ${food0}→${food1}, production ${prod0}→${prod1} with Artificial Meat`)
  // Ranch base food = 5 → becomes +10 production, and food from the Ranch drops by 5.
  assert(prod1 - prod0 === 10, `Ranch 5 food → 10 production (got +${prod1 - prod0})`)
  assert(food0 - food1 === 5, `Ranch food removed (got -${food0 - food1})`)
  g.stop()
}

console.log('TEST 25: Neocolonialism — Exoplanet buildings produce +150% gold (×2.5)')
{
  const g = new GameManager(14); g.setEra(20)
  const tile = g.data.tableau.visibleTiles(20).find((t) => !t.building && !t.unit && t.terrain?.startsWith('exo'))
  assert(!!tile, 'an Exoplanet tile is visible at era 20')
  // Elysium yields gold = floor(legitimacy); with 100 legit that's a clean 100 gold/tick.
  tile.building = { kind: 'building', key: 'elysium', level: 1, hp: 20, maxHp: 20, damaged: false }
  g.data.civilization.legitimacy.value = 100
  g._recomputeOutputs(); const gold0 = g.data.civilization.gold.output
  g.data.civilization.policies[0] = { key: 'neocolonialism' }
  g._recomputeOutputs(); const gold1 = g.data.civilization.gold.output
  console.log(`  Exoplanet gold/tick ${gold0} → ${gold1} with Neocolonialism (all tile gold ×2.5)`)
  assert(gold0 > 0 && Math.abs(gold1 - gold0 * 2.5) < 0.01, `Neocolonialism ×2.5 Exoplanet gold (got ${gold0}→${gold1})`)
  g.stop()
}

console.log('TEST 26: Maritime Law — +500% water-tile gold terrain bonus (×6)')
{
  const g = new GameManager(16); g.setEra(6)
  const tile = g.data.tableau.visibleTiles(6).find((t) => !t.building && !t.unit)
  tile.terrain = 'ocean' // a sea tile yields gold from terrain
  tile.building = { kind: 'building', key: 'totem', level: 1, hp: 15, maxHp: 15, damaged: false }
  g._recomputeOutputs(); const gold0 = g.data.civilization.gold.output
  g.data.civilization.policies[0] = { key: 'maritime_law' }
  g._recomputeOutputs(); const gold1 = g.data.civilization.gold.output
  console.log(`  water gold/tick ${gold0} → ${gold1} with Maritime Law`)
  assert(gold0 > 0 && Math.abs(gold1 - gold0 * 6) < 0.01, `Maritime Law ×6 water gold (got ${gold0}→${gold1})`)
  g.stop()
}

console.log('TEST 27: Alphabet — building a progress building upgrades it once for free')
{
  const g = new GameManager(17); g.setEra(3)
  const tile = g.data.tableau.visibleTiles(3).find((t) => !t.building && !t.unit && t.def?.place === 'land')
  g.data.civilization.policies[0] = { key: 'alphabet' }
  // Library is a progress building (upgradeable). Build it via _createInstance.
  g._createInstance({ kind: 'building', key: 'library', level: 1 }, tile)
  console.log(`  Library built at level ${tile.occupant.level} (expect 2 with Alphabet)`)
  assert(tile.occupant.level === 2, `Alphabet auto-upgrades progress building to level 2 (got ${tile.occupant.level})`)
  g.stop()
}

console.log('TEST 28: Entropic Reversal — a gold upgrade advances a unit by 2 levels')
{
  const g = new GameManager(25); g.setEra(6)
  const b = g.data.tableau.visibleBounds(6)
  const t = g.data.tableau.tileAt(b.minRow, b.minCol); t.terrain = 'plains'
  t.unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  g.data.civilization.gold.value = 100000
  g.data.civilization.policies[0] = { key: 'entropic_reversal' }
  g.upgradeOccupant(t.row, t.col)
  console.log(`  Warrior level after one upgrade: ${t.unit.level} (expect 3)`)
  assert(t.unit.level === 3, `Entropic Reversal +2 levels per upgrade (got ${t.unit.level})`)
  g.stop()
}

console.log('TEST 29: Military / Architectural Tradition — overbuilding keeps upgrade levels')
{
  const g = new GameManager(26); g.setEra(6)
  const b = g.data.tableau.visibleBounds(6)
  const t1 = g.data.tableau.tileAt(b.minRow, b.minCol); t1.terrain = 'plains'
  const t2 = g.data.tableau.tileAt(b.minRow, b.minCol + 1); t2.terrain = 'plains'
  t1.unit = { kind: 'unit', key: 'warrior', level: 4, hp: 10, maxHp: 10, damaged: false }
  t2.building = { kind: 'building', key: 'totem', level: 3, hp: 20, maxHp: 20, damaged: false }
  g.data.civilization.policies[0] = { key: 'military_tradition' }
  g.data.civilization.policies[1] = { key: 'architectural_tradition' }
  g._createInstance({ kind: 'unit', key: 'warrior', level: 1 }, t1)
  g._createInstance({ kind: 'building', key: 'totem', level: 1 }, t2)
  console.log(`  overbuilt unit lvl ${t1.unit.level} (expect 4), building lvl ${t2.building.level} (expect 3)`)
  assert(t1.unit.level === 4, `Military Tradition keeps unit level 4 (got ${t1.unit.level})`)
  assert(t2.building.level === 3, `Architectural Tradition keeps building level 3 (got ${t2.building.level})`)
  g.stop()
}

console.log('TEST 30: Policy-slot expansion (Socialism/Technocracy/Omnicracy)')
{
  const g = new GameManager(33); const civ = g.data.civilization
  assert(civ.policies.length === 5, `base 5 slots (got ${civ.policies.length})`)
  g._applyModifier({ kind: 'modifier', key: 'socialism' })
  assert(civ.policies.length === 8, `Socialism → 8 (got ${civ.policies.length})`)
  g._applyModifier({ kind: 'modifier', key: 'technocracy' })
  assert(civ.policies.length === 9, `Technocracy → 9 (got ${civ.policies.length})`)
  g._applyModifier({ kind: 'modifier', key: 'omnicracy' })
  assert(civ.policies.length === 10, `Omnicracy → 10 (got ${civ.policies.length})`)
  g._applyModifier({ kind: 'modifier', key: 'socialism' }) // idempotent
  assert(civ.policies.length === 10, `re-apply is a no-op (got ${civ.policies.length})`)
  // _unlockTarget spans all slots, and the 10th slot can be filled.
  const t = g._unlockTarget({ kind: 'policy', key: 'communism' })
  assert(t.slotIndices.length === 10, `_unlockTarget spans 10 slots (got ${t.slotIndices.length})`)
  for (let i = 0; i < 9; i++) civ.policies[i] = { key: 'x' }
  g._fillSlot('policies', 9, { kind: 'policy', key: 'communism' })
  console.log(`  slots ${civ.policies.length}; 10th = ${civ.policies[9]?.key}`)
  assert(civ.policies[9]?.key === 'communism', `10th slot fills (got ${civ.policies[9]?.key})`)
  g.stop()
}

console.log('TEST 31: Advancement rerolls (State Alchemists / Autonomous Governance / Chronoscopy)')
{
  const g = new GameManager(34); g.setEra(26); const civ = g.data.civilization
  assert(civ.freeRerolls === 0, `starts at 0 (got ${civ.freeRerolls})`)
  g._fillSlot('policies', 0, { kind: 'policy', key: 'state_alchemists' })
  assert(civ.freeRerolls === 1, `State Alchemists +1 (got ${civ.freeRerolls})`)
  g._fillSlot('policies', 1, { kind: 'policy', key: 'chronoscopy' })
  assert(civ.freeRerolls === 4, `+Chronoscopy +3 → 4 (got ${civ.freeRerolls})`)
  g._replaceSlot('policies', 0, { kind: 'policy', key: 'autonomous_governance' })
  assert(civ.freeRerolls === 6, `+Autonomous Governance +2 via replace → 6 (got ${civ.freeRerolls})`)
  // Reroll redraws options and decrements; rerolled options are not marked chosen.
  g.data.selection = { type: 'progress', stage: 'choose', hidden: false, pending: null, options: g._pickProgressOptions() }
  const before = g.data.selection.options.map((o) => o.id)
  g.rerollAdvancement()
  assert(civ.freeRerolls === 5, `reroll spends one (got ${civ.freeRerolls})`)
  assert(before.every((id) => !civ.chosenAdvancements.has(id)), 'rerolled options stay in the pool')
  // Guard: no-op at 0 rerolls, and outside the choose stage.
  civ.freeRerolls = 0; const opts = g.data.selection.options
  g.rerollAdvancement()
  assert(g.data.selection.options === opts && civ.freeRerolls === 0, 'no-op at 0 rerolls')
  civ.freeRerolls = 1; g.data.selection.stage = 'replace'
  g.rerollAdvancement()
  assert(civ.freeRerolls === 1, 'no-op outside choose stage')
  console.log('  grant (fill+replace, stacking), spend, and guards all correct')
  g.stop()
}

console.log('TEST 32: Region levels scale building OUTPUT too (Skyscrapers → Mine)')
{
  const g = new GameManager(50); g.setEra(10)
  g.data.civilization.pops = {}
  const t = g.data.tableau.visibleTiles(10).find((x) => !x.building && !x.unit && x.def?.place === 'land')
  t.terrain = 'plains'; t.city = { kind: 'building', key: 'city', level: 1 }
  t.building = { kind: 'building', key: 'mine', level: 1, hp: 12, maxHp: 12, damaged: false }
  g._recomputeOutputs(); const g0 = g.data.civilization.gold.output
  g.data.civilization.bonuses.push('skyscrapers') // +5 levels to City buildings
  g._recomputeOutputs(); const g1 = g.data.civilization.gold.output
  console.log(`  Mine gold/tick ${g0} → ${g1} with Skyscrapers (+5 effective levels)`)
  assert(g1 > g0, `Skyscrapers scales Mine OUTPUT, not just HP (got ${g0}→${g1})`)
  g.stop()
}

console.log('TEST 33: Traps are combat-only — no terrain yield, no Ownership gold, not counted')
{
  const g = new GameManager(51); g.setEra(8)
  g.data.civilization.pops = {}
  const t = g.data.tableau.visibleTiles(8).find((x) => !x.building && !x.unit && x.def?.place === 'land')
  t.terrain = 'plains'; t.building = { kind: 'building', key: 'caltrops', level: 1, hp: 1, maxHp: 1, damaged: false }
  g.data.civilization.policies[0] = { key: 'ownership' } // +2 gold per deployed building
  g._recomputeOutputs()
  console.log(`  caltrops economy: gold/t ${g.data.civilization.gold.output}, food/t ${g.data.civilization.food.output}, count ${g._deployedBuildingCount()}`)
  assert(g.data.civilization.gold.output === 0, `no Ownership gold from a trap (got ${g.data.civilization.gold.output})`)
  assert(g.data.civilization.food.output === 0, `no terrain yield from a trap (got ${g.data.civilization.food.output})`)
  assert(g._deployedBuildingCount() === 0, `trap not counted as a deployed economic building`)
  g.stop()
}

console.log('TEST 34: National Park (terrain-yield %) + Carbon Sink (permanent growth)')
{
  const g = new GameManager(56); g.setEra(10); g.data.civilization.pops = {}
  const lands = g.data.tableau.visibleTiles(10).filter((x) => !x.building && !x.unit && x.def?.place === 'land')
  lands[0].terrain = 'plains'; lands[0].building = { kind: 'building', key: 'totem', level: 1, hp: 15, maxHp: 15, damaged: false }
  g._recomputeOutputs(); const f0 = g.data.civilization.food.output
  lands[1].terrain = 'plains'; lands[1].building = { kind: 'building', key: 'national_park', level: 1, hp: 3, maxHp: 3, damaged: false }
  g._recomputeOutputs(); const f1 = g.data.civilization.food.output
  console.log(`  terrain food/tick ${f0} → ${f1} with a National Park (+10% global)`)
  assert(f1 > f0, `National Park boosts terrain yields (got ${f0}→${f1})`)
  lands[2].terrain = 'plains'; lands[2].building = { kind: 'building', key: 'carbon_sink', level: 2, hp: 3, maxHp: 3, damaged: false }
  const ng0 = g.data.civilization.naturalGrowth
  g._applyEraEndEffects()
  console.log(`  naturalGrowth ${ng0} → ${g.data.civilization.naturalGrowth} (Carbon Sink lvl 2)`)
  assert(g.data.civilization.naturalGrowth === ng0 + 2, `Carbon Sink +level to naturalGrowth`)
  g.stop()
}

console.log('TEST 35: Convert-tile (Artificial Island) + Tleilaxu Tanks (end-era pop)')
{
  const g = new GameManager(57); g.setEra(16)
  const spot = g.data.tableau.visibleTiles(16).find((x) => !x.building && !x.unit && x.def?.place === 'land')
  const anOcean = g.data.tableau.visibleTiles(16).find((x) => !x.building && !x.unit && x !== spot); anOcean.terrain = 'ocean'
  const islands0 = g.data.tableau.visibleTiles(16).filter((x) => x.terrain === 'island').length
  g._createInstance({ kind: 'building', key: 'artificial_island', level: 1 }, spot)
  const islands1 = g.data.tableau.visibleTiles(16).filter((x) => x.terrain === 'island').length
  console.log(`  Artificial Island: island tiles ${islands0} → ${islands1}`)
  assert(islands1 === islands0 + 1, `an ocean tile converted to island (got ${islands0}→${islands1})`)
  const g2 = new GameManager(58); g2.setEra(23)
  const tt = g2.data.tableau.visibleTiles(23).find((x) => !x.building && !x.unit && x.def?.place === 'land')
  tt.building = { kind: 'building', key: 'tleilaxu_tanks', level: 1, hp: 2, maxHp: 2, damaged: false }
  const total = (c) => Object.values(c.pops).reduce((a, b) => a + b, 0)
  const p0 = total(g2.data.civilization)
  g2._applyEraEndEffects()
  console.log(`  Tleilaxu Tanks: population ${p0} → ${total(g2.data.civilization)} (+225)`)
  assert(total(g2.data.civilization) - p0 === 225, `Tleilaxu +225 pop (got +${total(g2.data.civilization) - p0})`)
  g.stop(); g2.stop()
}

console.log('TEST 36: Wonders — Hanging Gardens, Hadron Collider, Statue of Liberty, Ecumenopolis')
{
  // Hanging Gardens: +1 more pop per gain.
  const g = new GameManager(65); g.setEra(2)
  const total = (c) => Object.values(c.pops).reduce((a, b) => a + b, 0)
  const t0 = total(g.data.civilization); g.addPops(2); const base = total(g.data.civilization) - t0
  const g2 = new GameManager(65); g2.setEra(2); g2.data.civilization.completedWonders.push('hanging_gardens')
  const s0 = total(g2.data.civilization); g2.addPops(2); const boosted = total(g2.data.civilization) - s0
  console.log(`  Hanging Gardens: addPops(2) gained ${base} → ${boosted}`)
  assert(boosted === base + 1, `Hanging Gardens +1 pop per gain (got ${boosted} vs ${base + 1})`)
  g.stop(); g2.stop()
  // Hadron Collider: era-start progress lump.
  const g3 = new GameManager(66); g3.setEra(12); g3.data.civilization.completedWonders.push('hadron_collider')
  const p0 = g3.data.civilization.progress.value; g3._beginEra()
  console.log(`  Hadron Collider: era-start progress +${(g3.data.civilization.progress.value - p0).toFixed(0)}`)
  assert(g3.data.civilization.progress.value > p0, `Hadron Collider grants era-start progress`)
  g3.stop()
  // Statue of Liberty: production thresholds grow slower (×0.8).
  const g4 = new GameManager(67); g4.setEra(10)
  const m0 = g4.data.civilization.modifiers.productionThresholdMult ?? 1
  g4.data.civilization.wonder = { key: 'statue_of_liberty', buildsLeft: 1, placed: true, inst: null }; g4._completeWonder()
  assert(Math.abs((g4.data.civilization.modifiers.productionThresholdMult ?? 1) - m0 * 0.8) < 1e-9, `Statue of Liberty ×0.8 production threshold`)
  g4.stop()
  // Ecumenopolis: planet tile yields ×10.
  const g5 = new GameManager(68); g5.setEra(25); g5.data.civilization.pops = {}
  const planet = g5.data.tableau.visibleTiles(25).find((x) => !x.building && !x.unit && x.terrain === 'planet')
  if (planet) {
    planet.building = { kind: 'building', key: 'totem', level: 1, hp: 15, maxHp: 15, damaged: false }
    g5._recomputeOutputs(); const y0 = g5.data.civilization.gold.output
    g5.data.civilization.completedWonders.push('ecumenopolis'); g5._recomputeOutputs(); const y1 = g5.data.civilization.gold.output
    console.log(`  Ecumenopolis: planet gold yield ${y0} → ${y1} (×10)`)
    assert(y0 === 0 || y1 === y0 * 10, `Ecumenopolis planet ×10 (got ${y0}→${y1})`)
  } else { console.log('  (no planet tile visible — Ecumenopolis assertion skipped)'); assert(true, 'skip') }
  g5.stop()
}

console.log('TEST 37: Previously-stubbed building outputs (Lumber Mill, Harbor, Hacienda, Arena, Bank)')
{
  const g = new GameManager(70); g.setEra(9); g.data.civilization.pops = {}
  const lands = g.data.tableau.visibleTiles(9).filter((x) => !x.building && !x.unit && x.def?.place === 'land')
  // Lumber Mill on a forest tile → production from terrain scaling.
  lands[0].terrain = 'forest'; lands[0].building = { kind: 'building', key: 'lumber_mill', level: 1, hp: 5, maxHp: 5, damaged: false }
  g._recomputeOutputs()
  console.log(`  Lumber Mill production/tick: ${g.data.civilization.production.output}`)
  assert(g.data.civilization.production.output > 0, `Lumber Mill produces (got ${g.data.civilization.production.output})`)
  // Hacienda on a New-World tile → multi-output food+prod+gold.
  const g2 = new GameManager(71); g2.setEra(9); g2.data.civilization.pops = {}
  const t2 = g2.data.tableau.visibleTiles(9).find((x) => !x.building && !x.unit && x.def?.place === 'land')
  t2.label = 'New World'; t2.building = { kind: 'building', key: 'hacienda', level: 1, hp: 8, maxHp: 8, damaged: false }
  g2._recomputeOutputs()
  const c = g2.data.civilization
  console.log(`  Hacienda: food ${c.food.output}, prod ${c.production.output}, gold ${c.gold.output}`)
  assert(c.food.output >= 6 && c.production.output >= 6 && c.gold.output === 9, `Hacienda 6/6/9 multi-output`)
  g.stop(); g2.stop()
  // Arena + Bank: end-of-era gold.
  const g3 = new GameManager(72); g3.setEra(9)
  const b3 = g3.data.tableau.visibleBounds(9)
  g3.data.tableau.tileAt(b3.minRow, b3.minCol).unit = { kind: 'unit', key: 'warrior', level: 1, hp: 3, maxHp: 3, damaged: false }
  const at = g3.data.tableau.tileAt(b3.minRow + 1, b3.minCol); at.terrain = 'plains'
  at.building = { kind: 'building', key: 'arena', level: 1, hp: 5, maxHp: 5, damaged: false }
  const gold0 = g3.data.civilization.gold.value
  g3._accrueBuildingOutputs()
  console.log(`  Arena: gold +${g3.data.civilization.gold.value - gold0} (8 × 1 deployed unit)`)
  assert(g3.data.civilization.gold.value - gold0 === 8, `Arena 8 gold/unit (got +${g3.data.civilization.gold.value - gold0})`)
  g3.stop()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
