// Verify the auto-generated advancement registry: every implemented unlock can be
// targeted/applied without throwing or soft-locking, and every era's draw resolves.
const { GameManager } = await import('../src/game/GameManager.js')
const { IMPLEMENTED, ADVANCEMENTS, isImplemented } = await import('../src/game/data/advancements.js')

let pass = 0, fail = 0
const assert = (cond, msg) => { if (cond) { pass++ } else { fail++; console.log('  ✗ FAIL:', msg) } }

const g = new GameManager(1)

// --- Coverage summary ---
const kinds = {}
for (const u of Object.values(IMPLEMENTED)) kinds[u.kind] = (kinds[u.kind] ?? 0) + 1
const total = ADVANCEMENTS.length
const impl = ADVANCEMENTS.filter((a) => isImplemented(a.name)).length
console.log(`Advancements: ${total} total, ${impl} implemented, ${total - impl} filler`)
console.log('Implemented by kind:', JSON.stringify(kinds))

// --- TEST 1: every implemented unlock targets a slot (or applies) without throwing ---
console.log('\nTEST 1: every implemented unlock is resolvable (no soft-lock)')
let softlocks = 0
for (const [tech, unlock] of Object.entries(IMPLEMENTED)) {
  try {
    if (unlock.kind === 'modifier') { g._applyModifier(unlock); continue }
    if (unlock.kind === 'wonder') continue
    const t = g._unlockTarget(unlock)
    if (!t || !Array.isArray(t.slotIndices) || t.slotIndices.length < 1) {
      softlocks++; console.log(`  ✗ ${tech} (${unlock.kind} ${unlock.key}) → no target slot`)
    }
  } catch (e) {
    softlocks++; console.log(`  ✗ ${tech} (${unlock.kind} ${unlock.key}) threw: ${e.message}`)
  }
}
assert(softlocks === 0, `${softlocks} implemented unlocks would soft-lock / throw`)

// --- TEST 2: every era's draw produces well-formed options ---
console.log('\nTEST 2: every era draws well-formed options')
let drawFail = 0
for (let era = 0; era <= 27; era++) {
  g.setEra(era)
  const opts = g._pickProgressOptions()
  if (!Array.isArray(opts)) { drawFail++; continue }
  for (const o of opts) if (o.id == null || o.name == null) drawFail++
}
assert(drawFail === 0, `${drawFail} malformed draw options across eras`)

// --- TEST 3: a real progress unlock fills a slot end-to-end (Pack Bonding → Wolf) ---
console.log('\nTEST 3: Pack Bonding unlocks the Wolf into the Cavalry slot')
{
  const g2 = new GameManager(2)
  const wolfImpl = IMPLEMENTED['Pack Bonding']
  assert(wolfImpl && wolfImpl.kind === 'unit' && wolfImpl.key === 'wolf', 'Pack Bonding → wolf unit')
  const tgt = g2._unlockTarget(wolfImpl)
  const emptyBefore = tgt.slotIndices.some((i) => g2._slotEmpty(tgt.group, i))
  g2._fillSlot(tgt.group, tgt.slotIndices.find((i) => g2._slotEmpty(tgt.group, i)), wolfImpl)
  const filled = g2.data.civilization.units.some((u) => u && u.key === 'wolf')
  assert(emptyBefore && filled, 'Wolf fills an empty Cavalry slot')
}

// --- TEST 4: a bonus modifier applies (Basket Weaving lowers the food threshold mult) ---
console.log('\nTEST 4: Basket Weaving lowers the food threshold multiplier')
{
  const g3 = new GameManager(3)
  const bw = IMPLEMENTED['Basket Weaving']
  assert(bw && bw.kind === 'modifier', 'Basket Weaving is a modifier')
  const before = g3.data.civilization.modifiers.foodThresholdMult
  g3._applyModifier(bw)
  const after = g3.data.civilization.modifiers.foodThresholdMult
  console.log(`  foodThresholdMult ${before} → ${after}`)
  assert(after < before, 'food threshold multiplier decreased')
}

// --- TEST 5: wonder flow — unlock → advance via production-builds → complete + effect ---
console.log('\nTEST 5: wonder flow (unlock, auto-build, complete, ongoing effect)')
{
  const g = new GameManager(11)
  const wi = IMPLEMENTED['Mysticism']
  assert(wi && wi.kind === 'wonder' && wi.key === 'stonehenge', 'Mysticism → Stonehenge wonder')
  g._unlockWonder({ key: 'stonehenge' })
  assert(g.data.civilization.wonder?.key === 'stonehenge' && g.data.civilization.wonder.buildsLeft === 3, 'Stonehenge queued with 3 builds')
  g.data.pendingProduction = 3
  g.data.phase = 'development'
  g._maybeOpenSelection()
  assert(g.data.civilization.wonder === null, 'wonder completes after 3 production-builds')
  assert(g.data.civilization.completedWonders.includes('stonehenge'), 'Stonehenge completed')
  assert(!g.data.selection, 'the builds went to the wonder — no normal production selection')
  const legit0 = g.data.civilization.legitimacy.value
  g._applyEraEndEffects()
  const dl = g.data.civilization.legitimacy.value - legit0
  console.log(`  Stonehenge end-of-era legit +${dl}`)
  assert(dl === 25, `Stonehenge grants +25 legit/era (got ${dl})`)
}

// --- TEST 6: civilization + difficulty pre-game setup ---
console.log('\nTEST 6: civilization + difficulty setup')
{
  const gg = new GameManager(1, { civ: 'guild', difficulty: 'brutal' })
  assert(gg.data.civilization.policies[0]?.key === 'ownership', 'Guild starts with the Ownership policy')
  assert(gg.data.civilization.buildings.some((b) => b?.key === 'market'), 'Guild starts with a Market building')
  assert(Math.abs(gg.difficultyMult - 1.6) < 1e-9, `Brutal → enemy budget ×1.6 (got ${gg.difficultyMult})`)
  const hh = new GameManager(2, { civ: 'horde' })
  assert(hh.data.civilization.policies[0]?.key === 'tribalism', 'Horde starts with Tribalism')
  assert(hh.data.civilization.units.some((u) => u?.key === 'wolf'), 'Horde starts with a Wolf')
  assert(hh.difficultyMult === 1, 'default (Normal) difficulty ×1')
  console.log('  Guild: Ownership + Market (Brutal ×1.6); Horde: Tribalism + Wolf (Normal ×1)')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
