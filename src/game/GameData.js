import { TableauData } from './TableauData.js'
import { CivilizationData } from './CivilizationData.js'

/**
 * The complete current status of a game. Owned by GameManager.
 *
 * The game loop runs per era: a development phase (ticks accumulate resources),
 * then a preparation phase (spend gold / arrange the board), then a battle phase,
 * then an era transition. Phase state:
 *  - phase: 'development' | 'prep' | 'battle' | 'transition'
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
    this.justFilled = null // { group, index, seq } — last roster slot filled (for the fill animation)
    this.popFx = null // { key, seq } — last specialist gold-converted (for a pop-card flash)

    // Combat: a fresh enemy host is generated each era (visible during development,
    // fights during the battle phase). See GameManager combat methods.
    this.enemies = [] // enemy instances { key, level, role, col, slot, hp, maxHp, damaged, cdTimer }
    this.enemyHostType = null // composition type of the current host
    this.combatTime = 0 // seconds elapsed in the current battle (0..COMBAT_DURATION)
    this.combatEvents = [] // transient per-step events for UI animation (attacks/damage/deaths)
    this.combatSeq = 0 // bumps each combat step (lets the UI key/replay transient effects)
    this.defeated = false // legitimacy hit 0 — game over (mirror of `won`)

    this.tableau = new TableauData(seed)
    this.civilization = new CivilizationData()
  }
}
