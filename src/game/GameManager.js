import { GameData } from './GameData.js'
import { ERAS, ERA_COUNT } from './data/eras.js'
import { RESOURCE_CONFIG, TICKS_PER_ERA, nextThreshold, rubberBand } from './data/resources.js'
import { POP_TYPES } from './data/pops.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Ticks per second for each speed setting (0 = paused).
export const SPEED_TPS = { paused: 0, standard: 1, fast: 3, super: 5, ultra: 10 }
const THRESHOLD_TYPES = ['progress', 'food', 'production']

/**
 * Root of the game. Owns all state (GameData) and drives the game loop.
 *
 * Loop per era: development (ticks, speed-controlled) -> battle (skipped, UI
 * banner only) -> transition (UI banner) -> next era. The development ticking is
 * timer-driven here; the battle/transition phases are advanced by the UI once
 * their banner animations finish (endBattle / completeTransition).
 */
export class GameManager {
  constructor(seed = 1) {
    this.data = new GameData(seed)
    this._listeners = new Set()
    this._version = 0
    this._timer = null

    this.subscribe = (fn) => {
      this._listeners.add(fn)
      return () => this._listeners.delete(fn)
    }
    this.getVersion = () => this._version

    this._recomputeOutputs()
  }

  _emit() {
    this._version++
    for (const fn of this._listeners) fn()
  }

  get era() { return this.data.era }
  get eraInfo() { return ERAS[this.data.era] }

  // ---------------------------------------------------------------------------
  // Speed / ticking (development phase)
  // ---------------------------------------------------------------------------
  setSpeed(speed) {
    if (!(speed in SPEED_TPS)) return
    this.data.speed = speed
    this._restartTimer()
    this._emit()
  }

  _restartTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    const tps = SPEED_TPS[this.data.speed]
    if (tps > 0 && this.data.phase === 'development' && !this.data.won) {
      this._timer = setInterval(() => this.tick(), 1000 / tps)
    }
  }

  /** Stop the loop (e.g. on unmount). */
  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  }

  // ---------------------------------------------------------------------------
  // One development tick
  // ---------------------------------------------------------------------------
  tick() {
    if (this.data.phase !== 'development') return
    const civ = this.data.civilization
    this._recomputeOutputs()

    for (const type of THRESHOLD_TYPES) {
      const res = civ[type]
      res.value += res.output
      this._processThresholds(type, res)
    }

    this.data.tick += 1
    if (this.data.tick >= TICKS_PER_ERA) this._endDevelopment()
    this._emit()
  }

  /** Recompute each resource's per-tick output from the population. */
  _recomputeOutputs() {
    const civ = this.data.civilization
    const totals = { progress: 0, food: 0, production: 0 }
    for (const [key, count] of Object.entries(civ.pops)) {
      const pop = POP_TYPES[key]
      if (!pop) continue
      for (const [res, per] of Object.entries(pop.outputs)) {
        totals[res] = (totals[res] ?? 0) + per * count
      }
    }
    civ.progress.output = totals.progress
    civ.food.output = totals.food
    civ.production.output = totals.production
  }

  /** Cross any thresholds this resource has reached this tick. */
  _processThresholds(type, res) {
    const cfg = RESOURCE_CONFIG[type]
    let guard = 0
    while (res.value >= res.threshold && guard++ < 1000) {
      res.value -= res.threshold // carry the overflow into the next level
      res.level += 1
      if (type === 'food') this._onFoodThreshold()
      // Grow the per-level threshold. n = global level (never resets); rubber band
      // keeps the running level near (era number) * targetPerEra.
      const expected = (this.data.era + 1) * cfg.targetPerEra
      const R = rubberBand(res.level, expected)
      res.threshold = nextThreshold(res.threshold, cfg.X, this.data.era, res.level, R)
    }
  }

  /** Food threshold reached: add population equal to the current era number. */
  _onFoodThreshold() {
    const civ = this.data.civilization
    civ.pops.citizen = (civ.pops.citizen ?? 0) + (this.data.era + 1)
  }

  // ---------------------------------------------------------------------------
  // Phase machine
  // ---------------------------------------------------------------------------
  _endDevelopment() {
    this.data.phase = 'battle'
    this._restartTimer() // stops ticking
  }

  /** Called by the UI after the "Battle" banner animation. */
  endBattle() {
    if (this.data.phase !== 'battle') return
    this.data.phase = 'transition'
    this._emit()
  }

  /** Called by the UI after the era-transition banner animation. */
  completeTransition() {
    if (this.data.phase !== 'transition') return
    if (this.data.era >= ERA_COUNT - 1) {
      this.data.won = true
      this.data.phase = 'development'
      this.data.speed = 'paused'
      this._emit()
      return
    }
    this.data.era += 1
    this._beginEra()
    this._emit()
  }

  _beginEra() {
    this.data.phase = 'development'
    this.data.tick = 0
    this.data.speed = 'paused'
    this._restartTimer()
  }

  // ---------------------------------------------------------------------------
  // Debug: jump to an era (used by the temporary era widget). Instant, no banner.
  // ---------------------------------------------------------------------------
  setEra(index) {
    const next = clamp(index, 0, ERA_COUNT - 1)
    if (next !== this.data.era) {
      this.data.era = next
      this.data.won = false
    }
    this._beginEra()
    this._emit()
  }
  nextEra() { this.setEra(this.data.era + 1) }
  prevEra() { this.setEra(this.data.era - 1) }
}
