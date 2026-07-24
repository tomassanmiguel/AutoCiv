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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
