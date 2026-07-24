// Advancement registry (v2) — AUTO-GENERATED from the content def registries.
//
// Every wireable def (UNIT_DEFS / BUILDING_DEFS / POP_TYPES / POLICY_DEFS / WONDER_DEFS)
// carries a `tech` (its unlocking advancement name) + `era`. We scan those registries to
// build:
//   - ADVANCEMENTS: the flat draw pool [{ id, name, eraId, eraIndex }] (one per tech).
//   - IMPLEMENTED : name -> { kind, key, description } for the techs we can actually wire.
//
// GATING (so unlocking never soft-locks): a building is only wired if its category has a
// real roster slot today (progress/production/food/gold/legitimacy/defense/utility);
// wall/trap/command/spawner/support are drawn as "Not Yet Implemented" filler until
// slots.js gains those categories. Wonders are filler until the Wonder slot exists.
// Everything else (units, specialists, policies, bonus modifiers) wires directly.

import { ERA_INDEX } from './eras.js'
import { UNIT_DEFS } from './units.js'
import { BUILDING_DEFS } from './buildings.js'
import { POP_TYPES } from './pops.js'
import { POLICY_DEFS, policyEffect } from './policies.js'
import { WONDER_DEFS } from './wonders.js'
import { BUILDING_CATEGORIES } from './slots.js'

// Building categories with a real roster slot today (others gate to filler).
const SLOTTED_BUILDING_CATS = new Set(BUILDING_CATEGORIES.map((c) => c.key))

// era index -> era id (for ADVANCEMENTS.eraId).
const ERA_ID_BY_INDEX = {}
for (const [id, idx] of Object.entries(ERA_INDEX)) ERA_ID_BY_INDEX[idx] = id

// tech name -> { name, eraIndex } (the draw pool) and tech -> { kind, key, description }.
const ADV_BY_TECH = {}
export const IMPLEMENTED = {}

function register(tech, era, kind, key, wireable, description) {
  if (tech == null || era == null) return
  if (!ADV_BY_TECH[tech]) ADV_BY_TECH[tech] = { name: tech, eraIndex: era }
  if (!wireable) return
  if (IMPLEMENTED[tech]) {
    // Two defs claim the same tech — keep the first, flag it in dev.
    if (typeof console !== 'undefined') console.warn(`[advancements] tech "${tech}" claimed twice (${IMPLEMENTED[tech].key} & ${key})`)
    return
  }
  IMPLEMENTED[tech] = { kind, key, description }
}

for (const d of Object.values(UNIT_DEFS)) {
  register(d.tech, d.era, 'unit', d.key, true, `Unlocks ${d.name} — a ${d.types[0]} unit.`)
}
for (const d of Object.values(BUILDING_DEFS)) {
  const wireable = SLOTTED_BUILDING_CATS.has(d.types?.[0])
  register(d.tech, d.era, 'building', d.key, wireable, `Unlocks ${d.name}.`)
}
for (const d of Object.values(POP_TYPES)) {
  register(d.tech, d.era, 'pop', d.key, true, `Unlocks the ${d.name} specialist.`)
}
for (const d of Object.values(POLICY_DEFS)) {
  const kind = d.slot === false ? 'modifier' : 'policy'
  register(d.tech, d.era, kind, d.key, true, policyEffect(d))
}
for (const d of Object.values(WONDER_DEFS)) {
  // Wonders are filler until the dedicated Wonder slot + completion mechanic exist.
  register(d.tech, d.era, 'wonder', d.key, false, `Unlocks the ${d.name} wonder.`)
}

/** The flat draw pool. `id` is tech-derived (techs are unique across the pool). */
export const ADVANCEMENTS = Object.values(ADV_BY_TECH).map((a) => ({
  id: `t:${a.name}`,
  name: a.name,
  eraId: ERA_ID_BY_INDEX[a.eraIndex] ?? null,
  eraIndex: a.eraIndex,
}))

export function isImplemented(name) {
  return Object.prototype.hasOwnProperty.call(IMPLEMENTED, name)
}
