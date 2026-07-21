import { GameData } from './GameData.js'
import { ERAS, ERA_COUNT } from './data/eras.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/**
 * Root of the game. Owns all game state (GameData) and is the single object the
 * UI talks to. Exposes a tiny subscribe/version store so React can re-render on
 * change (see GameProvider).
 */
export class GameManager {
  constructor(seed = 1) {
    this.data = new GameData(seed)
    this._listeners = new Set()
    this._version = 0

    // Bound as arrow-holding fields so the references are stable for
    // useSyncExternalStore.
    this.subscribe = (fn) => {
      this._listeners.add(fn)
      return () => this._listeners.delete(fn)
    }
    this.getVersion = () => this._version
  }

  _emit() {
    this._version++
    for (const fn of this._listeners) fn()
  }

  get era() {
    return this.data.era
  }

  get eraInfo() {
    return ERAS[this.data.era]
  }

  setEra(index) {
    const next = clamp(index, 0, ERA_COUNT - 1)
    if (next !== this.data.era) {
      this.data.era = next
      this._emit()
    }
  }

  nextEra() { this.setEra(this.data.era + 1) }
  prevEra() { this.setEra(this.data.era - 1) }
}
