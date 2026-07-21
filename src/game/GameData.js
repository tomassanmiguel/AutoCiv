import { TableauData } from './TableauData.js'
import { CivilizationData } from './CivilizationData.js'

/**
 * The complete current status of a game. Owned by GameManager.
 *
 * The game loop runs per era: a development phase (ticks accumulate resources),
 * then a battle phase (skipped for now), then an era transition. Phase state:
 *  - phase: 'development' | 'battle' | 'transition'
 *  - tick:  current tick within the era (0..TICKS_PER_ERA)
 *  - speed: 'paused' | 'standard' | 'fast' | 'super' | 'ultra'
 */
export class GameData {
  constructor(seed = 1) {
    this.era = 0 // era index into ERAS (0 = Stone)
    this.phase = 'development'
    this.tick = 0
    this.speed = 'paused'
    this.won = false

    // Advancement / build choices owed but not yet resolved (a progress/production
    // threshold was crossed). While a `selection` is open the game holds paused.
    this.pendingProgress = 0
    this.pendingProduction = 0
    this.selection = null // active choice overlay state machine (see GameManager)

    this.tableau = new TableauData(seed)
    this.civilization = new CivilizationData()
  }
}
