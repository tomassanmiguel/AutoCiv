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

    // Combat (v2 turn-based tower defense): a fresh enemy host is generated each era
    // (previewed during development, fights during the battle phase). Enemies march
    // DOWN the shared grid one tile per turn; player units/buildings are stationary
    // towers that strike enemies in range. See GameManager combat methods.
    this.enemies = [] // enemy instances { key, name, col, row, hp, maxHp, atk, damaged, breached }
    this.enemyHostType = null // composition type of the current host
    this.combatTurn = 0 // discrete turns elapsed in the current battle
    this.combatAccum = 0 // real-time accumulator: fires one turn when it crosses 1
    this.combatTime = 0 // legacy field kept for HUD compat (unused by the turn engine)
    this.combatEvents = [] // transient per-turn events for UI animation (attacks/damage/deaths/marches)
    this.combatSeq = 0 // bumps each combat turn (lets the UI key/replay transient effects)
    this.combatIntro = false // true while the "Battle" banner shows — the loop waits to start
    this.defeated = false // legitimacy hit 0 — game over (mirror of `won`)

    this.tableau = new TableauData(seed)
    this.civilization = new CivilizationData()
  }
}
