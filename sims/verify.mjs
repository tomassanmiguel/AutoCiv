// Verification pass: every content def is well-formed, every advancement→unlock
// reference resolves, and a coverage report of which policy/bonus effects are actually
// WIRED into the engine vs. still stubbed (special-tag only). Run: node sims/verify.mjs
const { UNIT_DEFS } = await import('../src/game/data/units.js')
const { BUILDING_DEFS } = await import('../src/game/data/buildings.js')
const { POP_TYPES } = await import('../src/game/data/pops.js')
const { POLICY_DEFS } = await import('../src/game/data/policies.js')
const { WONDER_DEFS } = await import('../src/game/data/wonders.js')
const { ENEMY_DEFS } = await import('../src/game/data/enemies.js')
const { IMPLEMENTED, ADVANCEMENTS, isImplemented } = await import('../src/game/data/advancements.js')
const { TERRAIN } = await import('../src/game/data/terrain.js')

let problems = 0
const bad = (msg) => { problems++; console.log('  ✗', msg) }

// --- 1. Every def well-formed ---
console.log('1. Def well-formedness')
for (const [k, d] of Object.entries(UNIT_DEFS)) {
  if (d.key !== k) bad(`unit ${k}: key mismatch`)
  if (typeof d.era !== 'number') bad(`unit ${k}: missing era`)
  if (!Array.isArray(d.types) || !d.types.length) bad(`unit ${k}: missing types`)
  if (typeof d.atk !== 'number') bad(`unit ${k}: missing atk`)
  if (typeof d.def !== 'number') bad(`unit ${k}: missing def`)
  if (typeof d.range !== 'number') bad(`unit ${k}: missing range`)
}
for (const [k, d] of Object.entries(BUILDING_DEFS)) {
  if (d.key !== k) bad(`building ${k}: key mismatch`)
  if (!Array.isArray(d.types) || !d.types.length) bad(`building ${k}: missing types`)
  if (typeof d.hp !== 'number') bad(`building ${k}: missing hp`)
}
for (const [k, d] of Object.entries(POP_TYPES)) {
  if (d.key !== k) bad(`pop ${k}: key mismatch`)
  if (typeof d.outputs !== 'object') bad(`pop ${k}: missing outputs`)
  if (d.specialist && typeof d.era !== 'number' && !d.combatLegit && !['shaman', 'philosopher', 'poet'].includes(k)) bad(`pop ${k}: specialist missing era`)
}
for (const [k, d] of Object.entries(POLICY_DEFS)) {
  if (d.key !== k) bad(`policy ${k}: key mismatch`)
  if (!(d.effect || d.description)) bad(`policy ${k}: no effect/description text`)
}
for (const [k, d] of Object.entries(WONDER_DEFS)) {
  if (d.key !== k) bad(`wonder ${k}: key mismatch`)
  if (typeof d.era !== 'number' || !d.tech || !d.effect) bad(`wonder ${k}: missing era/tech/effect`)
}
for (const [k, d] of Object.entries(ENEMY_DEFS)) {
  if (d.key !== k) bad(`enemy ${k}: key mismatch`)
  if (typeof d.atk !== 'number' || typeof d.def !== 'number') bad(`enemy ${k}: missing atk/def`)
}
console.log(`   units ${Object.keys(UNIT_DEFS).length}, buildings ${Object.keys(BUILDING_DEFS).length}, pops ${Object.keys(POP_TYPES).length}, policies ${Object.keys(POLICY_DEFS).length}, wonders ${Object.keys(WONDER_DEFS).length}, enemies ${Object.keys(ENEMY_DEFS).length}`)

// --- 2. Every IMPLEMENTED reference resolves to a real def ---
console.log('2. Registry references resolve')
const REG = { unit: UNIT_DEFS, building: BUILDING_DEFS, pop: POP_TYPES, policy: POLICY_DEFS, modifier: POLICY_DEFS, wonder: WONDER_DEFS }
for (const [name, u] of Object.entries(IMPLEMENTED)) {
  const reg = REG[u.kind]
  if (!reg) { bad(`${name}: unknown kind ${u.kind}`); continue }
  if (!reg[u.key]) bad(`${name}: ${u.kind} '${u.key}' not found in its registry`)
}
// Every ADVANCEMENTS entry has an era id.
for (const a of ADVANCEMENTS) if (a.eraId == null) bad(`advancement ${a.name}: null eraId`)

// --- 3. Effect-wiring coverage (policies/bonuses) ---
console.log('3. Effect-wiring coverage (policies + bonuses)')
// Structured fields the engine actually applies + specials with a handler.
const WIRED_FIELDS = ['outputPct', 'totalGoldPct', 'citizenOutput', 'popOutputFlat', 'specialistOutput',
  'thresholdMult', 'instantBuilds', 'unitDefBonus', 'buildingDefBonus', 'ticksPerEra', 'legitPerEra',
  'goldInterest', 'endEraGoldFromLegit', 'unitDeath', 'doctrine', 'unitAtkPct', 'wonderCostReduce', 'upgradeMult',
  'terrainDouble', 'repairMult', 'mercCostMult', 'mercLevels', 'rangedReach']
const WIRED_SPECIALS = new Set(['low_legit_atk', 'melee_flat_atk', 'gunboat_flat_atk', 'building_production_flat',
  'enemy_atk_reduce', 'prohibition', 'citizen_progress_production_trade', 'pop_highest_plus', 'eugenics_atk',
  'end_era_progress_from_atk', 'end_combat_gold_from_atk'])
// v1-name policies wired by hardcoded _hasPolicy(key) checks rather than a structured field.
const HARDCODED_WIRED = new Set(['slavery', 'weights_and_measures', 'ownership', 'specialization',
  'language', 'festivals', 'tribalism', 'caste_system', 'calendar', 'code_of_laws', 'diplomatic_marriage', 'midwivery'])
// v1 policies kept in POLICY_DEFS but NOT registered (no tech → unreachable; superseded in v2).
const UNREACHABLE = new Set(['trade_networks', 'sacred_grounds', 'oral_tradition', 'hereditary_rule',
  'surveying', 'hospitality_rites', 'hunting', 'composite_bows', 'democracy'])
const registeredKeys = new Set(Object.values(IMPLEMENTED).map((u) => u.key))
const stubs = []
let wired = 0, vestigial = 0
for (const [k, d] of Object.entries(POLICY_DEFS)) {
  if (UNREACHABLE.has(k) && !registeredKeys.has(k)) { vestigial++; continue }
  const ok = WIRED_FIELDS.some((f) => d[f] != null) || (d.special && WIRED_SPECIALS.has(d.special)) || HARDCODED_WIRED.has(k)
  if (ok) wired++
  else stubs.push(`${k}${d.special ? `:${d.special}` : ''}`)
}
const reachable = Object.keys(POLICY_DEFS).length - vestigial
console.log(`   ${wired}/${reachable} reachable policies/bonuses WIRED; ${stubs.length} stubbed; ${vestigial} vestigial (unreachable v1)`)

// Fallout terrain present (Manhattan Project).
if (!TERRAIN.fallout) bad('TERRAIN.fallout missing (Manhattan Project)')

// --- Summary ---
const implCount = ADVANCEMENTS.filter((a) => isImplemented(a.name)).length
console.log(`\nAdvancements: ${ADVANCEMENTS.length} total, ${implCount} implemented`)
console.log(`Stubbed policy/bonus effects (${stubs.length}):`)
console.log('   ' + stubs.join(', '))
console.log(`\n${problems === 0 ? '✓ VERIFY PASSED' : `✗ ${problems} PROBLEMS`}`)
process.exit(problems ? 1 : 0)
