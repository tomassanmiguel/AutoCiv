// Placeholder threshold so the Food/Production/Progress bars have a denominator
// to render against. Real per-upgrade thresholds arrive with those systems.
const PLACEHOLDER_THRESHOLD = 100

/**
 * All data backing the right-hand UI panel. Owned by GameData.
 *
 * Resource shapes:
 *  - legitimacy / gold: { value, output }   (output = per-tick delta)
 *  - food / production / progress: { value, output, threshold }
 *    (threshold = amount needed to unlock the next upgrade; shown as a bar)
 *
 * The four slot groups are the panel's dropdowns; each entry is null (empty
 * slot) for now and will later hold an unlocked item.
 */
export class CivilizationData {
  constructor() {
    this.legitimacy = { value: 50, output: 0 } // the civ's "HP"
    this.gold = { value: 0, output: 0 }

    this.food = { value: 0, output: 0, threshold: PLACEHOLDER_THRESHOLD }
    this.production = { value: 0, output: 0, threshold: PLACEHOLDER_THRESHOLD }
    this.progress = { value: 0, output: 0, threshold: PLACEHOLDER_THRESHOLD }

    // Units/Buildings slots are indexed to match UNIT_CATEGORIES /
    // BUILDING_CATEGORIES in data/slots.js (9 unit categories, 7 building
    // categories). null = empty slot. (Units are era-gated in the UI.)
    this.units = new Array(9).fill(null)
    this.buildings = new Array(7).fill(null)
    this.policies = new Array(5).fill(null)
    this.population = new Array(5).fill(null)
  }
}
