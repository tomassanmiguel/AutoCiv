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

    this.tableau = new TableauData(seed)
    this.civilization = new CivilizationData()
  }
}
