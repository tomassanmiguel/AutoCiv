// GameManager (v3) — the root of the game model.
//
// Conventions carried from v2 and still binding:
//   - all state lives here / in plain data modules, never in React state
//   - every mutator calls `_emit()` to bump the version and re-render subscribers
//   - `subscribe` / `getVersion` are ARROW FIELDS (useSyncExternalStore receives
//     them unbound)
//
// THE MAIN CYCLE
//   One timer, one pacing control. Each tick either advances a running combat by
//   a beat, or advances the game: accrue output, grow cities, count down the era.
//   65 ticks to an era, 28 eras; the era drives the map reveal and hands out
//   expansion permissions.
//
//   Crossing a PROGRESS threshold offers three advancements; crossing a FOOD
//   threshold offers an expansion. Either offer PAUSES the clock until resolved,
//   exactly as v2's selections did.

import { generateWorld } from './world/worldgen.js'
import { STAGE_COUNT, BATTLEFIELD_DEPTH } from './world/regions.js'
import { terrainOf } from './world/terrain.js'
import { key, neighbors } from './hex/coords.js'
import { PROGRESS_NODES, RING_UNLOCK, MAX_RING } from './data/progress.js'
import { initialResources, accrue } from './data/resources.js'
import { ERAS, TICKS_PER_ERA, ERA_COUNT, stageForEra, unlocksForEra, EXPANSION_UNLOCKS } from './data/eras.js'
import {
  initTerritory, expansionTargets, improveTile, foundCity,
  territoryYield, territoryStats, growCities,
} from './world/territory.js'
import { installCombat, MAX_WAVES } from './manager/combat.js'

export const SPEEDS = { paused: 0, standard: 1, fast: 3, super: 5, ultra: 10 }

/** How many advancements a progress threshold offers. */
export const PROGRESS_OFFERS = 3

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
    initTerritory(this.world)

    this.era = 0
    this.tick = 0
    this.speed = 'paused'
    this.stage = stageForEra(0)
    this._knownCache = null

    this.progress = new Set()
    this.resources = initialResources()
    this.selection = null // { type: 'progress' | 'expansion', ... }
    this.pending = { progress: 0, expansion: 0 }
    this.log = []

    this.stopCombatTimer?.()
    this.combat = {
      active: false, wave: 1, strength: 1,
      turn: 0, beat: 0, actionSeq: 0, result: null,
      queue: [], phase: null, acting: null,
      enemies: [], units: [], palace: null, events: [], breaches: 0,
    }
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

  // --- Clock ----------------------------------------------------------------

  setSpeed(sp) {
    if (!(sp in SPEEDS)) return
    this.speed = sp
    this._restartTimer()
    this._emit()
  }

  /** The clock runs only while nothing is waiting on the player. */
  _restartTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    const rate = SPEEDS[this.speed]
    if (rate > 0 && !this.selection) {
      this._timer = setInterval(() => this._onTick(), 1000 / rate)
    }
  }

  start() { this._restartTimer() }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    this.stopCombatTimer()
  }

  _onTick() {
    // A running combat borrows the clock — one beat per tick.
    if (this.combat.active && !this.combat.result) { this.combatStep(); return }
    this.gameTick()
  }

  /** One tick of the development cycle. Safe to call headlessly (sims do). */
  gameTick() {
    if (this.selection) return
    const out = this.output
    const before = { ...this.resources }
    const gained = accrue(this.resources, out)
    growCities(this.world)

    if (gained.progress > 0) this.pending.progress += gained.progress
    if (gained.food > 0) this.pending.expansion += gained.food
    void before

    this.tick++
    if (this.tick >= TICKS_PER_ERA) this._advanceEra()

    this._openNextSelection()
    this._emit()
  }

  _advanceEra() {
    if (this.era >= ERA_COUNT - 1) { this.tick = TICKS_PER_ERA; this.setSpeed('paused'); return }
    this.era++
    this.tick = 0
    const stage = stageForEra(this.era)
    if (stage !== this.stage) { this.stage = stage; this._knownCache = null }
    this.log.push({ era: this.era, text: `Entered the ${this.eraName} era.` })
  }

  get eraName() { return ERAS[this.era] }

  get unlocks() { return unlocksForEra(this.era) }

  get newUnlocksThisEra() {
    return EXPANSION_UNLOCKS.filter((u) => u.era === this.era)
  }

  // --- Output ---------------------------------------------------------------

  /** Per-tick output of everything you control. */
  get output() { return territoryYield(this.world) }

  get stats() { return territoryStats(this.world) }

  // --- Selections -----------------------------------------------------------

  _openNextSelection() {
    if (this.selection) return
    if (this.pending.progress > 0) {
      const offers = this._drawProgressOffers()
      this.pending.progress--
      // An exhausted web silently skips rather than opening an empty choice.
      if (offers.length) { this.selection = { type: 'progress', offers }; this._restartTimer(); return }
    }
    if (this.pending.expansion > 0) {
      const targets = expansionTargets(this.world, this.unlocks)
      this.pending.expansion--
      if (targets.improve.length || targets.city.length) {
        this.selection = { type: 'expansion', mode: null }
        this._restartTimer()
        return
      }
    }
  }

  _drawProgressOffers() {
    const avail = PROGRESS_NODES.filter((n) => this.progressState(n) === 'available')
    const pool = avail.slice()
    const out = []
    // Deterministic enough for a prototype; the real draw will be weighted.
    while (out.length < PROGRESS_OFFERS && pool.length) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    }
    return out
  }

  /** Resolve a progress offer. TODO: apply the node's actual effect. */
  chooseOffer(node) {
    if (this.selection?.type !== 'progress') return false
    if (!this.chooseProgress(node, true)) return false
    this.selection = null
    this._openNextSelection()
    this._restartTimer()
    this._emit()
    return true
  }

  skipSelection() {
    this.selection = null
    this._openNextSelection()
    this._restartTimer()
    this._emit()
  }

  get expansionTargets() { return expansionTargets(this.world, this.unlocks) }

  /** Which half of the expansion choice the player is aiming with. */
  setExpansionMode(mode) {
    if (this.selection?.type !== 'expansion') return
    this.selection = { ...this.selection, mode }
    this._emit()
  }

  /** Spend the pending expansion on a tile — improve it, or make it a city. */
  expandOnto(tile, mode) {
    if (this.selection?.type !== 'expansion') return false
    const ok = mode === 'city' ? foundCity(this.world, tile) : improveTile(this.world, tile)
    if (!ok) return false
    this.log.push({
      era: this.era,
      text: mode === 'city'
        ? `Founded a city on ${terrainOf(tile.terrain).name}.`
        : `Improved ${terrainOf(tile.terrain).name}.`,
    })
    this.selection = null
    this._knownCache = null
    this._openNextSelection()
    this._restartTimer()
    this._emit()
    return true
  }

  // --- Progress web ---------------------------------------------------------

  chosenInRing(ring) {
    let n = 0
    for (const node of PROGRESS_NODES) if (node.ring === ring && this.progress.has(node.id)) n++
    return n
  }

  ringVisible(ring) {
    return ring === 0 || this.chosenInRing(ring - 1) >= RING_UNLOCK
  }

  get visibleRing() {
    let r = 0
    while (r < MAX_RING && this.ringVisible(r + 1)) r++
    return r
  }

  progressState(node) {
    if (this.progress.has(node.id)) return 'unlocked'
    if (!this.ringVisible(node.ring)) return 'hidden'
    if (node.excludes.some((id) => this.progress.has(id))) return 'locked'
    if (node.prereqs.length && !node.prereqs.some((id) => this.progress.has(id))) return 'locked'
    return 'available'
  }

  /**
   * Take a node. Still allowed by direct click in the web (handy while the tree
   * is being designed); `viaOffer` marks the real path.
   */
  chooseProgress(node, viaOffer = false) {
    if (this.progressState(node) !== 'available') return false
    this.progress.add(node.id)
    // TODO: apply the node's actual effect — the tree is still being designed,
    // so unlocking currently only opens the rest of the web.
    if (!viaOffer) this._emit()
    return true
  }

  resetProgress() {
    this.progress = new Set()
    this._emit()
  }

  // --- Known world ----------------------------------------------------------

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
      world: this.world, stage: this.stage,
      tiles, battlefield, bfSet, all: [...tiles, ...battlefield], legend,
      encampments: tiles.filter((t) => t.encampment),
    }
    return this._knownCache
  }

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

  // --- Debug ----------------------------------------------------------------

  setEra(n) {
    this.era = Math.max(0, Math.min(ERA_COUNT - 1, n | 0))
    this.tick = 0
    this.stage = stageForEra(this.era)
    this._knownCache = null
    this._emit()
  }

  setStage(n) {
    const next = Math.max(0, Math.min(STAGE_COUNT - 1, n | 0))
    if (next === this.stage) return
    this.stage = next
    this._knownCache = null
    this._emit()
  }

  nextStage() { this.setStage(this.stage + 1) }
  prevStage() { this.setStage(this.stage - 1) }

  regenerate(seed = (Math.random() * 0x100000000) >>> 0) {
    const keepEra = this.era
    this._load(seed)
    this.setEra(keepEra)
  }

  setWave(n) { this.combat.wave = Math.max(1, Math.min(MAX_WAVES, n | 0)); this._emit() }
  setStrength(v) { this.combat.strength = Math.max(0.25, Math.min(3, v)); this._emit() }
}

installCombat(GameManager)
