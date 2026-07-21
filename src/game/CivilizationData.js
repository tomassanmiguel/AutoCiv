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
 * Population is tracked as counts per pop type in `pops`; the population slot
 * array marks which pop types are unlocked (slot 0 = the auto-unlocked Citizen).
 */
export class CivilizationData {
  constructor() {
    this.legitimacy = { value: 50, output: 0 } // the civ's "HP"
    this.gold = { value: 0, output: 0 }

    this.food = makeThresholdResource('food')
    this.production = makeThresholdResource('production')
    this.progress = makeThresholdResource('progress')

    // Population counts by type (all Citizens for now).
    this.pops = { citizen: STARTING_CITIZENS }

    this.units = new Array(9).fill(null)
    this.buildings = new Array(7).fill(null)
    this.policies = new Array(5).fill(null)
    // Population slot 0 holds the auto-unlocked Citizen; the rest are empty.
    this.population = new Array(5).fill(null)
    this.population[0] = POP_TYPES.citizen.key
  }
}
