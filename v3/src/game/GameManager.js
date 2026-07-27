// GameManager (v3) — currently a thin shell around the generated world.
//
// v3 is being rebuilt from the map outward, so this holds only what the map
// explorer needs: the world, the known-world stage, and the subscribe/version
// bridge React reads through (see react/GameProvider.jsx).
//
// The v2 contract still applies and should be kept as this grows:
//   - all game state lives here / in plain data classes, never in React state
//   - every mutator calls `_emit()` to bump the version and re-render subscribers
//   - `subscribe` / `getVersion` are ARROW FIELDS because useSyncExternalStore
//     receives them unbound.

import { generateWorld } from './world/worldgen.js'
import { STAGE_COUNT } from './world/regions.js'
import { yieldOf } from './world/invariants.js'
import { terrainOf } from './world/terrain.js'

export class GameManager {
  constructor(seed, { civ, difficulty } = {}) {
    this.civ = civ
    this.difficulty = difficulty
    this._version = 0
    this._subs = new Set()
    this._knownCache = null
    this._load(seed)
  }

  _load(seed) {
    this.seed = seed >>> 0
    this.world = generateWorld(this.seed)
    this.stage = 0
    this._knownCache = null
  }

  // --- React bridge ---------------------------------------------------------

  subscribe = (fn) => {
    this._subs.add(fn)
    return () => this._subs.delete(fn)
  }

  getVersion = () => this._version

  _emit() {
    this._version++
    for (const fn of this._subs) fn()
  }

  /** No timers yet — kept so GameScreen's unmount cleanup stays stable. */
  stop() {}

  // --- Known world ----------------------------------------------------------

  /**
   * The revealed slice of the world for the current stage, plus derived
   * readouts. Cached per (world, stage) so panning never recomputes it.
   */
  get known() {
    if (this._knownCache?.stage === this.stage && this._knownCache.world === this.world) {
      return this._knownCache
    }
    const tiles = this.world.list.filter((t) => t.revealStage <= this.stage)
    const byTerrain = new Map()
    for (const t of tiles) byTerrain.set(t.terrain, (byTerrain.get(t.terrain) ?? 0) + 1)
    const legend = [...byTerrain.entries()]
      .map(([k, count]) => ({ key: k, count, def: terrainOf(k) }))
      .sort((a, b) => b.count - a.count)

    this._knownCache = {
      world: this.world,
      stage: this.stage,
      tiles,
      legend,
      yields: yieldOf(tiles),
      encampments: tiles.filter((t) => t.encampment),
    }
    return this._knownCache
  }

  // --- Mutators -------------------------------------------------------------

  setStage(n) {
    const next = Math.max(0, Math.min(STAGE_COUNT - 1, n | 0))
    if (next === this.stage) return
    this.stage = next
    this._emit()
  }

  nextStage() { this.setStage(this.stage + 1) }
  prevStage() { this.setStage(this.stage - 1) }

  /** Debug: throw away this world and generate another. Keeps the current stage. */
  regenerate(seed = (Math.random() * 0x100000000) >>> 0) {
    const keep = this.stage
    this._load(seed)
    this.stage = Math.min(keep, STAGE_COUNT - 1)
    this._emit()
  }
}
