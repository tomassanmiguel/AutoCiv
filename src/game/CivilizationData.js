import { RESOURCE_CONFIG } from './data/resources.js'
import { POP_TYPES } from './data/pops.js'

// Starting population (all Citizens). Tunable.
const STARTING_CITIZENS = 1

// A resource that accumulates toward a growing per-level threshold:
//  value  — progress toward the current level (resets, carrying overflow, on level-up)
//  output — per-tick delta (sum of pop outputs)
//  level  — number of thresholds reached (also the `n` in the threshold formula)
//  threshold — amount needed for the current level (grows each level)
function makeThresholdResource(type) {
  return { value: 0, output: 0, level: 0, threshold: RESOURCE_CONFIG[type].T0 }
}

/**
 * All data backing the right-hand UI panel. Owned by GameData.
 *
 * Resource shapes:
 *  - legitimacy / gold: { value, output }
 *  - food / production / progress: threshold resources (see makeThresholdResource)
 *
 * Roster slots (units / buildings / policies) hold `{ key, level }` (level starts
 * at 1; upgrades come later) or null. A unit/building key indexes UNIT_DEFS /
 * BUILDING_DEFS; a multi-type item is stored in each of its category slots.
 * `population` marks which pop types are unlocked (slot 0 = the Citizen); actual
 * counts live in `pops`.
 */
export class CivilizationData {
  constructor() {
    this.legitimacy = { value: 50, output: 0 } // the civ's "HP"
    this.gold = { value: 0, output: 0 }

    this.food = makeThresholdResource('food')
    this.production = makeThresholdResource('production')
    this.progress = makeThresholdResource('progress')

    // Population counts by type (all Citizens to start).
    this.pops = { citizen: STARTING_CITIZENS }

    // Roster: index-aligned to UNIT_CATEGORIES (9) / BUILDING_CATEGORIES (7) /
    // 5 policy slots. Warrior is unlocked from the start (Melee = index 0).
    this.units = new Array(9).fill(null)
    this.units[0] = { key: 'warrior', level: 1 }
    // Buildings index-aligned to BUILDING_CATEGORIES; Totem pre-unlocked (Legitimacy = index 4).
    this.buildings = new Array(7).fill(null)
    this.buildings[4] = { key: 'totem', level: 1 }
    this.policies = new Array(5).fill(null)
    // Population slot 0 holds the auto-unlocked Citizen; the rest are specialists.
    this.population = new Array(5).fill(null)
    this.population[0] = POP_TYPES.citizen.key

    // Civilization-wide passives applied by advancements.
    this.modifiers = { unitHpBonus: 0 }

    // Advancement bookkeeping.
    this.chosenAdvancements = new Set() // ids chosen (removed from the pool)
    this.askBeforeReplace = true        // "are you sure" before overwriting a full slot

    // Population-growth split state (see GameManager.addPops): every EVEN pop
    // gained becomes a specialist (cycled bottom-to-top), every ODD a citizen.
    this.growthParity = 0
    this.specialistCursor = 0
  }
}
