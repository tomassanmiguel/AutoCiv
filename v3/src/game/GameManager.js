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
import { STAGE_COUNT, BATTLEFIELD_DEPTH } from './world/regions.js'
import { yieldOf } from './world/invariants.js'
import { terrainOf } from './world/terrain.js'
import { key, neighbors } from './hex/coords.js'
import { PROGRESS_NODES, RING_UNLOCK, MAX_RING } from './data/progress.js'

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
    this.progress = new Set() // chosen advancement ids
  }

  // --- Progress web ---------------------------------------------------------

  /** How many nodes have been chosen from a given ring. */
  chosenInRing(ring) {
    let n = 0
    for (const node of PROGRESS_NODES) if (node.ring === ring && this.progress.has(node.id)) n++
    return n
  }

  /** A ring appears once RING_UNLOCK nodes from the previous one are chosen. */
  ringVisible(ring) {
    return ring === 0 || this.chosenInRing(ring - 1) >= RING_UNLOCK
  }

  /** The outermost ring currently on screen. */
  get visibleRing() {
    let r = 0
    while (r < MAX_RING && this.ringVisible(r + 1)) r++
    return r
  }

  /**
   * 'unlocked' | 'available' | 'locked' | 'hidden'.
   *
   * `prereqs` is ANY-of, which is what lets a forked branch re-unify later.
   * `excludes` is what makes a fork a real choice: taking one side locks the
   * other out permanently, and anything downstream with no other route in.
   */
  progressState(node) {
    if (this.progress.has(node.id)) return 'unlocked'
    if (!this.ringVisible(node.ring)) return 'hidden'
    if (node.excludes.some((id) => this.progress.has(id))) return 'locked'
    if (node.prereqs.length && !node.prereqs.some((id) => this.progress.has(id))) return 'locked'
    return 'available'
  }

  /** Prototype: clicking an available node simply takes it. */
  chooseProgress(node) {
    if (this.progressState(node) !== 'available') return false
    this.progress.add(node.id)
    this._emit()
    return true
  }

  resetProgress() {
    this.progress = new Set()
    this._emit()
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
   * The revealed slice of the world for the current stage, plus the battlefield
   * ring and derived readouts. Cached per (world, stage) so panning never
   * recomputes it.
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

    const { battlefield, bfSet } = this._battlefieldRing(tiles)

    this._knownCache = {
      world: this.world,
      stage: this.stage,
      tiles,
      battlefield,
      bfSet,
      all: [...tiles, ...battlefield],
      legend,
      yields: yieldOf(tiles),
      encampments: tiles.filter((t) => t.encampment),
    }
    return this._knownCache
  }

  /**
   * The muster zone, derived rather than generated: dilate the known set by
   * BATTLEFIELD_DEPTH rings. Because it is recomputed per stage it always hugs
   * the current frontier, so the threat stays visible at every map scale — and
   * the world is generated that many rings past the last revealable one so
   * there is always something to occupy.
   */
  _battlefieldRing(tiles) {
    const seen = new Set(tiles.map((t) => key(t.q, t.r)))
    const battlefield = []
    let frontier = tiles
    for (let step = 0; step < BATTLEFIELD_DEPTH; step++) {
      const next = []
      for (const t of frontier) {
        for (const n of neighbors(t.q, t.r)) {
          const k = key(n.q, n.r)
          if (seen.has(k)) continue
          const tile = this.world.tiles.get(k)
          if (!tile) continue
          seen.add(k)
          next.push(tile)
          battlefield.push(tile)
        }
      }
      frontier = next
    }
    return { battlefield, bfSet: new Set(battlefield.map((t) => key(t.q, t.r))) }
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
