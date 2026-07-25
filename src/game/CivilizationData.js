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
    this.legitimacy = { value: 100, output: 0 } // the civ's "HP"
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
    // Buildings index-aligned to BUILDING_CATEGORIES (12: 6 typed + two Utility + Trap +
    // Command + Spawner + Support); Totem pre-unlocked (Legitimacy = index 4).
    this.buildings = new Array(12).fill(null)
    this.buildings[4] = { key: 'totem', level: 1 }
    this.policies = new Array(5).fill(null)
    // Population slot 0 holds the auto-unlocked Citizen; the rest are specialists.
    this.population = new Array(5).fill(null)
    this.population[0] = POP_TYPES.citizen.key

    // Wonders: at most one in flight ({ key, buildsLeft }); production-builds advance it
    // until buildsLeft hits 0, then it moves to completedWonders and its effect turns on.
    this.wonder = null
    this.completedWonders = []

    // Civilization-wide passives applied by advancements.
    //  unitHpBonus / buildingHpBonus — flat :defense: added to every unit / building
    //    (Clothes, and +1 each combat from Hereditary Rule).
    //  foodThresholdMult — multiplies every :food: threshold (Basket Weaving / The
    //    Plough each ×0.95, stacking).
    this.modifiers = { unitHpBonus: 0, buildingHpBonus: 0, unitAtkFlat: 0, foodThresholdMult: 1, progressThresholdMult: 1, productionThresholdMult: 1, bonusTicks: 0 }

    // Applied bonus techs (slot-less ✦ modifiers) by key — their ongoing structured
    // effects (citizenOutput/popOutputFlat/legitPerEra/…) are read alongside active
    // policies via GameManager._activeEffectDefs().
    this.bonuses = []

    // Poet escalator: +2 :progress: per Poet added at each era end (reset to 0 when the
    // Poet specialist is first unlocked so a fresh Poet starts at its base +1).
    this.poetBonus = 0

    // Carbon Sink: a permanent, stacking flat bonus added to every terrestrial tile's terrain
    // yield (grows by each Carbon Sink's level at the end of each combat).
    this.naturalGrowth = 0

    // Advancement bookkeeping.
    this.chosenAdvancements = new Set() // ids chosen (removed from the pool)
    this.askBeforeReplace = true        // "are you sure" before overwriting a full slot
    // Free advancement rerolls granted by reroll policies (State Alchemists / Autonomous
    // Governance / Chronoscopy); spent in the progress-choose stage via rerollAdvancement().
    this.freeRerolls = 0

    // Population-growth split state (see GameManager.addPops): every EVEN pop
    // gained becomes a specialist (cycled bottom-to-top), every ODD a citizen.
    this.growthParity = 0
    this.specialistCursor = 0
  }
}
