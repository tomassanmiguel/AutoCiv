import { GameData } from './GameData.js'
import { ERAS, ERA_COUNT } from './data/eras.js'
import { RESOURCE_CONFIG, TICKS_PER_ERA, nextThreshold, rubberBand } from './data/resources.js'
import { POP_TYPES, isSpecialist } from './data/pops.js'
import { ADVANCEMENTS, IMPLEMENTED, isImplemented } from './data/advancements.js'
import { UNIT_DEFS, unitStats, unitRole } from './data/units.js'
import { BUILDING_DEFS, buildingHp, buildingOutputs } from './data/buildings.js'
import { UNIT_CATEGORIES, BUILDING_CATEGORIES } from './data/slots.js'
import { canPlaceOn, terrainDefBonus } from './data/terrain.js'
import { generateHost } from './data/enemies.js'
import { upgradeCost, repairCost, specialistCost, specialistConvertCount, mercenaryCost } from './data/costs.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Ticks per second for each speed setting (0 = paused). During the battle phase
// the same numbers are a TIME multiplier (1x / 3x / 5x / 10x of real time).
export const SPEED_TPS = { paused: 0, standard: 1, fast: 3, super: 5, ultra: 10 }
const THRESHOLD_TYPES = ['progress', 'food', 'production']

// Combat: a battle lasts COMBAT_DURATION combat-seconds; the loop steps every
// COMBAT_INTERVAL_MS of real time, advancing combat time by the speed multiplier.
const COMBAT_DURATION = 25
const COMBAT_INTERVAL_MS = 50
const MIN_COOLDOWN = 1 // cooldowns can be reduced by %, but never below 1s

const catIndex = (list, key) => list.findIndex((c) => c.key === key)

// Weighted sampling without replacement (weightFn -> positive number).
function weightedSample(items, weightFn, k) {
  const pool = items.slice()
  const out = []
  while (out.length < k && pool.length > 0) {
    const weights = pool.map(weightFn)
    const total = weights.reduce((s, w) => s + w, 0)
    let r = Math.random() * total
    let idx = 0
    for (; idx < pool.length - 1; idx++) {
      r -= weights[idx]
      if (r <= 0) break
    }
    out.push(pool[idx])
    pool.splice(idx, 1)
  }
  return out
}

/**
 * Root of the game. Owns all state (GameData) and drives the game loop.
 *
 * Loop per era: development (ticks, speed-controlled) -> battle (skipped, UI
 * banner only) -> transition (UI banner) -> next era. Crossing a PROGRESS
 * threshold opens an advancement `selection` (a small state machine on
 * GameData.selection) and holds the game paused until the player resolves it.
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
    this._generateEnemies() // era-0 host, visible during development
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
    if (tps <= 0 || this.data.won || this.data.defeated || this.data.selection) return
    // A pending selection / win / defeat holds the game paused.
    if (this.data.phase === 'development') {
      this._timer = setInterval(() => this.tick(), 1000 / tps)
    } else if (this.data.phase === 'battle') {
      this._timer = setInterval(() => this._combatStep(), COMBAT_INTERVAL_MS)
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
    if (this.data.phase !== 'development' || this.data.selection) return
    const civ = this.data.civilization
    this._recomputeOutputs()

    for (const type of THRESHOLD_TYPES) {
      const res = civ[type]
      res.value += res.output
      this._processThresholds(type, res)
    }
    civ.gold.value += civ.gold.output
    this._accrueBuildingTickLifetime() // per-tick buildings track a lifetime total

    // Count the tick (resources accrue exactly once per tick), then open any owed
    // choice (which pauses the game). Development ends only once nothing is
    // pending — so a threshold crossed on the FINAL tick is still presented before
    // the era ends (see _afterResolve).
    this.data.tick += 1
    this._maybeOpenSelection()
    if (this.data.selection) { this._emit(); return }
    if (this.data.tick >= TICKS_PER_ERA) { this._endDevelopment(); this._emit(); return }
    this._emit()
  }

  /** Effective per-pop, per-tick output for one pop TYPE, including policy modifiers
   *  (e.g. Language gives each Citizen +1 :progress:). Source of truth for both the
   *  economy tick and the population card display. */
  popOutput(key) {
    const base = { ...(POP_TYPES[key]?.outputs ?? {}) }
    if (key === 'citizen' && this._hasPolicy('language')) base.progress = (base.progress ?? 0) + 1
    return base
  }

  /** Recompute each resource's per-tick output from the population. */
  _recomputeOutputs() {
    const civ = this.data.civilization
    const totals = { progress: 0, food: 0, production: 0, gold: 0 }
    for (const [key, count] of Object.entries(civ.pops)) {
      if (!POP_TYPES[key]) continue
      for (const [res, per] of Object.entries(this.popOutput(key))) {
        totals[res] = (totals[res] ?? 0) + per * count
      }
    }
    // Ownership policy: every deployed building yields +2 gold per tick.
    if (this._hasPolicy('ownership')) totals.gold += 2 * this._deployedBuildingCount()
    // Breweries: +1 gold per tick per unit within each brewery's range.
    totals.gold += this._breweryGold()
    // Per-tick building outputs (Ranch food, Kiln production, Mine gold).
    const bt = this._buildingTickOutputs()
    totals.food += bt.food
    totals.production += bt.production
    totals.gold += bt.gold
    civ.progress.output = totals.progress
    civ.food.output = totals.food
    civ.production.output = totals.production
    civ.gold.output = totals.gold
  }

  /** True if an unlocked policy with this key is in a policy slot. */
  _hasPolicy(key) {
    return this.data.civilization.policies.some((p) => p && p.key === key)
  }

  _deployedBuildingCount() {
    let n = 0
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.occupant
      if (occ?.kind === 'building' && !occ.damaged) n++ // destroyed buildings don't produce
    }
    return n
  }

  /** Total per-tick gold from all breweries (+1 per unit within each brewery's range). */
  _breweryGold() {
    let g = 0
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.occupant
      if (occ?.kind === 'building' && occ.key === 'brewery' && !occ.damaged) {
        g += this._unitsInRange(tile.row, tile.col, BUILDING_DEFS.brewery.range(occ.level))
      }
    }
    return g
  }

  /** Per-tick resource output from deployed buildings (Ranch food, Kiln production,
   *  Mine gold). Also stashes each building's current output on occ.tickOutput so the
   *  on-tile card can display it. */
  _buildingTickOutputs() {
    const totals = { food: 0, production: 0, gold: 0 }
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.occupant
      if (!occ || occ.kind !== 'building') continue
      if (occ.damaged) { occ.tickOutput = null; continue } // destroyed buildings produce nothing
      const def = BUILDING_DEFS[occ.key]
      let out = null
      if (occ.key === 'ranch') out = { res: 'food', amount: 5 + (occ.ranchBonus ?? 0) }
      else if (occ.key === 'kiln') out = { res: 'production', amount: 2 + def.perAdjacent(occ.level) * this._adjacentBuildingCount(tile.row, tile.col) }
      else if (occ.key === 'mine') out = { res: 'gold', amount: def.goldPerTick(occ.level) * (tile.terrain === 'mountain' ? 2 : 1) }
      occ.tickOutput = out
      if (out) totals[out.res] += out.amount
    }
    return totals
  }

  /** Count of adjacent (road-augmented) tiles holding a real, active building. */
  _adjacentBuildingCount(r, c) {
    let n = 0
    for (const tile of this._adjacentTiles(r, c)) {
      const occ = tile.occupant
      if (occ?.kind === 'building' && !occ.damaged && !BUILDING_DEFS[occ.key]?.supplement) n++
    }
    return n
  }

  // --- Road-augmented adjacency ---------------------------------------------------
  // A Road (supplement) makes every tile it touches mutually adjacent, chaining
  // through connected roads. ALL adjacency/range queries route through
  // _reachableWithin so roads uniformly boost building ranges and unit movement.

  /** Connected road networks as PORT sets: each Set holds a network's road tiles plus
   *  their orthogonal neighbours. Any two tiles in one set are adjacent (distance 1). */
  _roadPortSets() {
    const t = this.data.tableau
    const NBRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const roadKeys = []
    for (const tile of t.tiles.values()) if (tile.supplement?.key === 'road') roadKeys.push(`${tile.row},${tile.col}`)
    if (roadKeys.length === 0) return []
    const roadSet = new Set(roadKeys)
    const seen = new Set()
    const nets = []
    for (const rk of roadKeys) {
      if (seen.has(rk)) continue
      const comp = []
      const stack = [rk]
      seen.add(rk)
      while (stack.length) {
        const cur = stack.pop()
        comp.push(cur)
        const [r, c] = cur.split(',').map(Number)
        for (const [dr, dc] of NBRS) {
          const nk = `${r + dr},${c + dc}`
          if (roadSet.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk) }
        }
      }
      const ports = new Set()
      for (const ck of comp) {
        ports.add(ck)
        const [r, c] = ck.split(',').map(Number)
        for (const [dr, dc] of NBRS) if (t.tileAt(r + dr, c + dc)) ports.add(`${r + dr},${c + dc}`)
      }
      nets.push(ports)
    }
    return nets
  }

  /** Map "r,c" -> step distance for every tile within `range` steps of (sr, sc), where
   *  a road network links all its ports at distance 1 (a "shortcut"). */
  _reachableWithin(sr, sc, range) {
    const t = this.data.tableau
    const NBRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const nets = this._roadPortSets()
    const dist = new Map([[`${sr},${sc}`, 0]])
    const q = [[sr, sc]]
    let head = 0
    while (head < q.length) {
      const [r, c] = q[head++]
      const cur = `${r},${c}`
      const d = dist.get(cur)
      if (d >= range) continue
      const nbrs = new Set()
      for (const [dr, dc] of NBRS) if (t.tileAt(r + dr, c + dc)) nbrs.add(`${r + dr},${c + dc}`)
      for (const ports of nets) if (ports.has(cur)) for (const p of ports) if (p !== cur) nbrs.add(p)
      for (const nk of nbrs) {
        if (dist.has(nk)) continue
        dist.set(nk, d + 1)
        const [nr, nc] = nk.split(',').map(Number)
        q.push([nr, nc])
      }
    }
    return dist
  }

  /** Tiles at road-augmented distance exactly 1 from (r, c). */
  _adjacentTiles(r, c) {
    const out = []
    for (const [k, d] of this._reachableWithin(r, c, 1)) {
      if (d !== 1) continue
      const [tr, tc] = k.split(',').map(Number)
      const tile = this.data.tableau.tileAt(tr, tc)
      if (tile) out.push(tile)
    }
    return out
  }

  /** Count of deployed, active player units within `range` road-augmented steps of (cr, cc). */
  _unitsInRange(cr, cc, range) {
    let n = 0
    for (const k of this._reachableWithin(cr, cc, range).keys()) {
      const [r, c] = k.split(',').map(Number)
      const occ = this.data.tableau.tileAt(r, c)?.occupant
      if (occ?.kind === 'unit' && !occ.damaged) n++
    }
    return n
  }

  /** True if (row, col) is within some undamaged brewery's (road-augmented) range. */
  _inBreweryRange(row, col) {
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.occupant
      if (occ?.kind === 'building' && occ.key === 'brewery' && !occ.damaged &&
          this._reachableWithin(tile.row, tile.col, BUILDING_DEFS.brewery.range(occ.level)).has(`${row},${col}`)) {
        return true
      }
    }
    return false
  }

  // --- Warband (Tribalism): units gain +1 atk / +1 def per OTHER deployed friendly
  // unit of the same key. Snapshotted onto occ.warband via _syncUnitStats. ---
  _deployedUnitCounts() {
    const counts = {}
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.occupant
      if (occ && occ.kind === 'unit') counts[occ.key] = (counts[occ.key] ?? 0) + 1
    }
    return counts
  }

  _warbandBonus(occ, counts) {
    if (!occ || occ.kind !== 'unit' || !this._hasPolicy('tribalism')) return 0
    return Math.max(0, (counts[occ.key] ?? 1) - 1)
  }

  /**
   * Recompute each deployed instance's effective combat stats and store them on the
   * occupant (units: occ.atk / occ.maxHp; buildings: occ.maxHp), folding in every
   * modifier:
   *   units     — flat += Clothes/Hereditary (hp), Warband (atk+hp), terrain (Forest
   *               +5 / Mountain +10 hp, combat only); mult ×= Brewery aura (+10% atk,
   *               −10% hp) in range.
   *   buildings — maxHp = base + Hereditary bonus + terrain def (combat only).
   * Full-HP instances are topped up; `inCombat` gates the terrain bonus (combat only).
   * Called on every board/policy/upgrade change and (with inCombat) at combat start.
   */
  _syncUnitStats(inCombat = this.data.phase === 'battle') {
    const civ = this.data.civilization
    const counts = this._deployedUnitCounts()
    const hpBonus = civ.modifiers.unitHpBonus
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.occupant
      if (!occ) continue
      const terrainDef = inCombat ? terrainDefBonus(tile.terrain) : 0
      if (occ.kind === 'unit') {
        const wb = this._warbandBonus(occ, counts)
        const brew = this._inBreweryRange(tile.row, tile.col)
        const s = unitStats(UNIT_DEFS[occ.key], occ.level, hpBonus + wb + terrainDef, wb)
        const wasFull = occ.hp == null || occ.maxHp == null || occ.hp >= occ.maxHp
        occ.warband = wb
        occ.terrainDef = terrainDef
        occ.inBrewery = brew
        occ.atk = Math.round(s.atk * (brew ? 1.1 : 1))
        occ.maxHp = Math.max(1, Math.round(s.def * (brew ? 0.9 : 1)))
        if (!occ.damaged) occ.hp = wasFull ? occ.maxHp : Math.min(occ.maxHp, occ.hp)
      } else if (occ.kind === 'building' && !BUILDING_DEFS[occ.key]?.supplement) {
        const newMax = buildingHp(BUILDING_DEFS[occ.key], occ.level, civ.modifiers.buildingHpBonus) + terrainDef
        const wasFull = occ.hp == null || occ.maxHp == null || occ.hp >= occ.maxHp
        occ.maxHp = Math.max(1, newMax)
        if (!occ.damaged) occ.hp = wasFull ? occ.maxHp : Math.min(occ.maxHp, occ.hp)
      }
    }
  }

  /** Cross any thresholds this resource has reached this tick. Basket Weaving / The
   *  Plough lower food thresholds via civ.modifiers.foodThresholdMult (applied to the
   *  compared/subtracted requirement). */
  _processThresholds(type, res) {
    const cfg = RESOURCE_CONFIG[type]
    const mult = type === 'food' ? this.data.civilization.modifiers.foodThresholdMult : 1
    let guard = 0
    while (res.value >= res.threshold * mult && guard++ < 1000) {
      res.value -= res.threshold * mult // carry the overflow into the next level
      res.level += 1
      if (type === 'food') this.addPops(this.data.era + 1)
      else if (type === 'progress') this.data.pendingProgress += 1
      else if (type === 'production') this.data.pendingProduction += 1
      // Grow the per-level threshold. n = global level (never resets); rubber band
      // keeps the running level near (era number) * targetPerEra.
      const expected = (this.data.era + 1) * cfg.targetPerEra
      const R = rubberBand(res.level, expected)
      res.threshold = nextThreshold(res.threshold, cfg.X, this.data.era, res.level, R)
    }
  }

  // ---------------------------------------------------------------------------
  // Population growth: every EVEN pop gained becomes a specialist (cycled
  // bottom-to-top through unlocked specialists), every ODD pop a citizen. With no
  // specialists unlocked, all growth is citizens.
  // ---------------------------------------------------------------------------
  addPops(n) {
    const civ = this.data.civilization
    for (let k = 0; k < n; k++) {
      civ.growthParity += 1
      const specialists = this._unlockedSpecialistKeys()
      if (civ.growthParity % 2 === 0 && specialists.length > 0) {
        const key = specialists[civ.specialistCursor % specialists.length]
        civ.specialistCursor += 1
        civ.pops[key] = (civ.pops[key] ?? 0) + 1
      } else {
        civ.pops.citizen = (civ.pops.citizen ?? 0) + 1
      }
    }
  }

  /** Unlocked specialist pop keys, ordered bottom-to-top (highest slot first). */
  _unlockedSpecialistKeys() {
    const civ = this.data.civilization
    const out = []
    for (let i = civ.population.length - 1; i >= 1; i--) {
      const key = civ.population[i]
      if (key && isSpecialist(key)) out.push(key)
    }
    return out
  }

  // ---------------------------------------------------------------------------
  // Advancement selection (progress threshold)
  // ---------------------------------------------------------------------------
  _maybeOpenSelection() {
    if (this.data.selection) return
    if (this.data.phase !== 'development' || this.data.won) return
    // Progress first, then production. Skip any progress choice that has no options
    // left (era pool exhausted) so an empty selection can't soft-lock the game.
    while (this.data.pendingProgress > 0) {
      const options = this._pickProgressOptions()
      if (options.length === 0) { this.data.pendingProgress -= 1; continue }
      this.data.selection = { type: 'progress', stage: 'choose', hidden: false, pending: null, options }
      this._restartTimer() // holds the game paused
      return
    }
    if (this.data.pendingProduction > 0) this._openProductionSelection()
  }

  /** After a selection resolves: open the next owed choice; else resume ticking,
   *  or end development if the era's last tick was already reached. */
  _afterResolve() {
    this._maybeOpenSelection()
    if (this.data.selection) { this._emit(); return }
    if (this.data.tick >= TICKS_PER_ERA && this.data.phase === 'development') this._endDevelopment()
    else this._restartTimer()
    this._emit()
  }

  /** Draw up to three unchosen advancements (<= current era), weighted by 2^era. */
  _pickProgressOptions() {
    const era = this.data.era
    const civ = this.data.civilization
    const avail = ADVANCEMENTS.filter((a) => a.eraIndex <= era && !civ.chosenAdvancements.has(a.id))
    const impl = avail.filter((a) => isImplemented(a.name))
    const unimpl = avail.filter((a) => !isImplemented(a.name))
    const weight = (a) => Math.pow(2, a.eraIndex)
    const picks = weightedSample(impl, weight, 3)
    if (picks.length < 3) picks.push(...weightedSample(unimpl, weight, 3 - picks.length))
    return picks.map((a) => this._makeOption(a))
  }

  _makeOption(a) {
    const unlock = IMPLEMENTED[a.name] ?? null
    return {
      id: a.id,
      name: a.name,
      eraId: a.eraId,
      eraIndex: a.eraIndex,
      implemented: !!unlock,
      unlock,
      description: unlock ? unlock.description : 'Not Yet Implemented',
      silhouette: this._optionSilhouette(unlock),
      glyph: unlock ? null : '?',
    }
  }

  _optionSilhouette(unlock) {
    if (!unlock) return null
    const catSil = (list, typeKey) => list.find((c) => c.key === typeKey)?.silhouette ?? null
    switch (unlock.kind) {
      case 'unit': return catSil(UNIT_CATEGORIES, UNIT_DEFS[unlock.key].types[0])
      case 'building': return catSil(BUILDING_CATEGORIES, BUILDING_DEFS[unlock.key].types[0])
      case 'pop': return '/sprites/ui/pop.png'
      case 'policy': return '/sprites/ui/policy.png'
      case 'modifier': return unlock.silhouette ?? '/sprites/ui/defense.png'
      default: return null
    }
  }

  /** Player picked one of the three advancement cards. */
  chooseProgress(optionIndex) {
    const sel = this.data.selection
    if (!sel || sel.type !== 'progress' || sel.stage !== 'choose') return
    const opt = sel.options[optionIndex]
    if (!opt) return

    // Nothing implemented yet, or a passive modifier: apply and resolve at once.
    if (!opt.unlock) { this._markChosen(opt.id); this._resolveProgress(); return }
    if (opt.unlock.kind === 'modifier') {
      this._applyModifier(opt.unlock)
      this._markChosen(opt.id)
      this._resolveProgress()
      return
    }

    const target = this._unlockTarget(opt.unlock)
    const empties = target.slotIndices.filter((i) => this._slotEmpty(target.group, i))
    if (empties.length > 0) {
      // Units/buildings occupy each of their own type slots (multiFill); policies
      // and specialists take a single slot, so only fill the first empty one.
      const toFill = target.multiFill ? empties : [empties[0]]
      for (const i of toFill) this._fillSlot(target.group, i, opt.unlock)
      this._markChosen(opt.id)
      this._resolveProgress()
      return
    }

    // All relevant slots full -> replace flow. With MULTIPLE candidate slots the
    // player must click one to replace, and that click IS the confirmation — so skip
    // the "are you sure". Only a single (auto) replacement keeps the confirm gate.
    sel.pending = { unlock: opt.unlock, group: target.group, candidates: target.slotIndices, advId: opt.id }
    if (target.slotIndices.length > 1 || !this.data.civilization.askBeforeReplace) this._beginReplace()
    else sel.stage = 'confirm'
    this._emit()
  }

  confirmReplace(dontAskAgain) {
    const sel = this.data.selection
    if (!sel || sel.stage !== 'confirm') return
    if (dontAskAgain) this.data.civilization.askBeforeReplace = false
    this._beginReplace()
  }

  _beginReplace() {
    const sel = this.data.selection
    const p = sel.pending
    if (p.candidates.length === 1) {
      this._replaceSlot(p.group, p.candidates[0], p.unlock)
      this._markChosen(p.advId)
      this._resolveProgress()
    } else {
      sel.stage = 'replace' // window hides; the panel flashes the candidate slots
      this._emit()
    }
  }

  /** Player clicked one of the flashing candidate slots in the panel. */
  resolveReplace(slotIndex) {
    const sel = this.data.selection
    if (!sel || sel.stage !== 'replace') return
    const p = sel.pending
    if (!p.candidates.includes(slotIndex)) return
    this._replaceSlot(p.group, slotIndex, p.unlock)
    this._markChosen(p.advId)
    this._resolveProgress()
  }

  cancelReplace() {
    const sel = this.data.selection
    if (!sel) return
    sel.pending = null
    sel.stage = 'choose'
    this._emit()
  }

  hideSelection() {
    const sel = this.data.selection
    if (sel && sel.stage === 'choose') { sel.hidden = true; this._emit() }
  }

  showSelection() {
    const sel = this.data.selection
    if (sel) { sel.hidden = false; this._emit() }
  }

  _resolveProgress() {
    this.data.pendingProgress = Math.max(0, this.data.pendingProgress - 1)
    this.data.selection = null
    this._afterResolve()
  }

  _markChosen(id) { this.data.civilization.chosenAdvancements.add(id) }

  _applyModifier(unlock) {
    const civ = this.data.civilization
    if (unlock.key === 'clothes') {
      civ.modifiers.unitHpBonus += 5
      this._syncUnitStats() // apply retroactively to deployed units (with Warband)
    } else if (unlock.key === 'basket_weaving' || unlock.key === 'plough') {
      civ.modifiers.foodThresholdMult *= 0.95 // −5% food thresholds (stacks)
    }
  }

  // --- Slot resolution helpers ---
  // Returns { group, multiFill, slotIndices }. slotIndices are the item's target
  // slots and (when full) the replace candidates; multiFill = fill EVERY empty
  // target (units/buildings occupy each of their type slots) vs. just one
  // (policies/specialists take a single slot from a generic group).
  _unlockTarget(unlock) {
    switch (unlock.kind) {
      case 'unit':
        return { group: 'units', multiFill: true, slotIndices: UNIT_DEFS[unlock.key].types.map((t) => catIndex(UNIT_CATEGORIES, t)) }
      case 'building':
        return { group: 'buildings', multiFill: true, slotIndices: BUILDING_DEFS[unlock.key].types.map((t) => catIndex(BUILDING_CATEGORIES, t)) }
      case 'policy':
        return { group: 'policies', multiFill: false, slotIndices: [0, 1, 2, 3, 4] }
      case 'pop':
        return { group: 'population', multiFill: false, slotIndices: [1, 2, 3, 4] } // slot 0 = Citizen, never replaced
      default:
        return { group: null, multiFill: false, slotIndices: [] }
    }
  }

  _slotEmpty(group, i) {
    const civ = this.data.civilization
    if (group === 'population') return civ.population[i] == null
    return civ[group][i] == null
  }

  // Flag the slot just filled so the panel can animate it + open its tab.
  _markFilled(group, i) {
    this._fillSeq = (this._fillSeq ?? 0) + 1
    this.data.justFilled = { group, index: i, seq: this._fillSeq }
  }

  _fillSlot(group, i, unlock) {
    const civ = this.data.civilization
    if (group === 'units') civ.units[i] = { key: unlock.key, level: 1 }
    else if (group === 'buildings') civ.buildings[i] = { key: unlock.key, level: 1 }
    else if (group === 'policies') { civ.policies[i] = { key: unlock.key }; this._syncUnitStats() }
    else if (group === 'population') this._unlockSpecialist(i, unlock.key)
    this._markFilled(group, i)
  }

  _replaceSlot(group, i, unlock) {
    const civ = this.data.civilization
    if (group === 'population') { this._replaceSpecialist(i, unlock.key); this._markFilled(group, i); return }
    if (group === 'units') civ.units[i] = { key: unlock.key, level: 1 }
    else if (group === 'buildings') civ.buildings[i] = { key: unlock.key, level: 1 }
    else if (group === 'policies') { civ.policies[i] = { key: unlock.key }; this._syncUnitStats() }
    this._markFilled(group, i)
  }

  _unlockSpecialist(slotIndex, key) {
    const civ = this.data.civilization
    civ.population[slotIndex] = key
    if (civ.pops[key] === undefined) civ.pops[key] = 0
    this._convertCitizenToSpecialist(key)
  }

  // Replacing a specialist: half its pops become the new type, half revert to
  // citizens (EVEN -> specialist, ODD -> citizen).
  _replaceSpecialist(slotIndex, key) {
    const civ = this.data.civilization
    const oldKey = civ.population[slotIndex]
    const oldCount = civ.pops[oldKey] ?? 0
    const toNew = Math.floor(oldCount / 2)
    const toCitizen = oldCount - toNew
    if (oldKey) delete civ.pops[oldKey]
    civ.population[slotIndex] = key
    civ.pops[key] = (civ.pops[key] ?? 0) + toNew
    civ.pops.citizen = (civ.pops.citizen ?? 0) + toCitizen
    this._convertCitizenToSpecialist(key)
  }

  /** On unlocking a specialist, convert one citizen to it if there are 2+ citizens. */
  _convertCitizenToSpecialist(key) {
    const civ = this.data.civilization
    if ((civ.pops.citizen ?? 0) >= 2) {
      civ.pops.citizen -= 1
      civ.pops[key] = (civ.pops[key] ?? 0) + 1
    }
  }

  // ---------------------------------------------------------------------------
  // Production selection (production threshold): pick a unlocked unit/building
  // from the roster, then place an instance onto a valid tile.
  // ---------------------------------------------------------------------------
  _openProductionSelection() {
    this.data.selection = {
      type: 'production',
      stage: 'pick', // 'pick' (choose from roster) | 'place' (choose a tile)
      chosen: null, // { group, index, kind, key, level }
    }
    this._restartTimer()
  }

  /** Player clicked a (flashing) buildable roster slot. */
  pickBuild(group, index) {
    const sel = this.data.selection
    if (!sel || sel.type !== 'production' || sel.stage !== 'pick') return
    if (group !== 'units' && group !== 'buildings') return
    const occ = this.data.civilization[group][index]
    if (!occ) return
    sel.chosen = { group, index, kind: group === 'units' ? 'unit' : 'building', key: occ.key, level: occ.level }
    sel.stage = 'place'
    this._emit()
  }

  /** Return from placement back to the roster picker. */
  backToBuildPick() {
    const sel = this.data.selection
    if (!sel || sel.type !== 'production') return
    sel.chosen = null
    sel.stage = 'pick'
    this._emit()
  }

  /** Skip the build entirely (safe fallback / decline). */
  cancelBuild() {
    const sel = this.data.selection
    if (!sel || sel.type !== 'production') return
    this._resolveProduction()
  }

  /** Placement state of a tile for the current build: 'valid' | 'replace' | 'invalid' | null. */
  placementState(row, col) {
    const sel = this.data.selection
    if (!sel || sel.type !== 'production' || sel.stage !== 'place' || !sel.chosen) return null
    const tile = this.data.tableau.tileAt(row, col)
    if (!tile || !this._canPlaceHere(sel.chosen, tile)) return 'invalid'
    // Supplements underlap the occupant, so they're always a plain (valid) placement.
    if (sel.chosen.kind === 'building' && BUILDING_DEFS[sel.chosen.key].supplement) return 'valid'
    return tile.occupant ? 'replace' : 'valid'
  }

  /** Player clicked a tile to build on (creates/replaces the instance). */
  placeAt(row, col) {
    const sel = this.data.selection
    if (!sel || sel.type !== 'production' || sel.stage !== 'place' || !sel.chosen) return
    const tile = this.data.tableau.tileAt(row, col)
    if (!tile || !this._canPlaceHere(sel.chosen, tile)) return
    this._createInstance(sel.chosen, tile)
    this._resolveProduction()
  }

  _canPlaceHere(chosen, tile) {
    if (!this.data.tableau.isUnlocked(tile.row, tile.col, this.data.era)) return false
    const def = chosen.kind === 'unit' ? UNIT_DEFS[chosen.key] : BUILDING_DEFS[chosen.key]
    if (!canPlaceOn(def.placement, tile.terrain)) return false
    // Supplements underlap the occupant but can't stack (one supplement per tile).
    if (chosen.kind === 'building' && def.supplement) return !tile.supplement
    return true
  }

  _createInstance(chosen, tile) {
    const civ = this.data.civilization
    // Supplement buildings (Road) underlap the occupant in their own slot — they never
    // replace and don't overbuild; placing one just re-derives adjacency-based outputs.
    if (chosen.kind === 'building' && BUILDING_DEFS[chosen.key].supplement) {
      tile.supplement = { kind: 'building', key: chosen.key, level: chosen.level }
      this._recomputeOutputs() // roads change brewery/kiln ranges
      this._syncUnitStats()    // and brewery-aura membership
      return
    }
    // Overbuilding a Cave Painting cashes in its stored progress before it's replaced.
    const prev = tile.occupant
    if (prev && prev.key === 'cave_painting') {
      civ.progress.value += prev.storedProgress ?? BUILDING_DEFS.cave_painting.storedBase
      this._processThresholds('progress', civ.progress) // may queue advancement choices
    }
    if (chosen.kind === 'unit') {
      const hp = unitStats(UNIT_DEFS[chosen.key], chosen.level, civ.modifiers.unitHpBonus).def
      tile.occupant = { kind: 'unit', key: chosen.key, level: chosen.level, hp, maxHp: hp, damaged: false }
    } else {
      const hp = buildingHp(BUILDING_DEFS[chosen.key], chosen.level, civ.modifiers.buildingHpBonus)
      tile.occupant = { kind: 'building', key: chosen.key, level: chosen.level, hp, maxHp: hp, damaged: false, lifetimeOutput: 0 }
      if (chosen.key === 'cave_painting') tile.occupant.storedProgress = BUILDING_DEFS.cave_painting.storedBase
      if (chosen.key === 'ranch') { tile.occupant.ranchBonus = 0; tile.occupant.ranchStep = 2 }
    }
    this._syncUnitStats() // board changed → refresh Warband bonuses
    this._recomputeOutputs() // …and per-tick building outputs (Ranch/Kiln/Mine/Brewery)
    // Midwivery: creating a unit yields production equal to its (effective) defense.
    // In development, so crossing a production threshold opens a build (may chain).
    if (chosen.kind === 'unit' && this._hasPolicy('midwivery')) {
      civ.production.value += tile.occupant.maxHp ?? 0
      this._processThresholds('production', civ.production)
    }
  }

  _resolveProduction() {
    this.data.pendingProduction = Math.max(0, this.data.pendingProduction - 1)
    this.data.selection = null
    this._afterResolve()
  }

  /** Add each per-tick building's current output to its lifetime total (once per dev
   *  tick; occ.tickOutput was just refreshed by _recomputeOutputs). */
  _accrueBuildingTickLifetime() {
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.occupant
      if (occ?.kind === 'building' && !occ.damaged && occ.tickOutput) {
        occ.lifetimeOutput = (occ.lifetimeOutput ?? 0) + occ.tickOutput.amount
      }
    }
  }

  /** End-of-era economic output from deployed buildings (into resources + lifetime). */
  _accrueBuildingOutputs() {
    const civ = this.data.civilization
    let addedFood = 0
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.occupant
      if (!occ || occ.kind !== 'building' || occ.damaged) continue
      for (const o of buildingOutputs(BUILDING_DEFS[occ.key], occ.level, this.data.era)) {
        if (o.res === 'food') {
          civ.food.value += o.amount
          occ.lifetimeOutput = (occ.lifetimeOutput ?? 0) + o.amount
          addedFood += o.amount
        }
      }
    }
    if (addedFood > 0) this._processThresholds('food', civ.food)
  }

  // ---------------------------------------------------------------------------
  // Gold economy: spend gold to repair / upgrade deployed instances, convert
  // citizens into specialists, hire one-battle mercenaries, and (free) reposition
  // units. Repair/upgrade/convert are allowed during development and preparation
  // (not mid-battle, not while a selection is open, and not after win/defeat).
  // ---------------------------------------------------------------------------
  _canEconomize() {
    const d = this.data
    return !d.won && !d.defeated && !d.selection && (d.phase === 'development' || d.phase === 'prep')
  }

  // Tag an instance so its on-tile card replays a one-shot "juice" animation
  // (green flash + scale) — used for upgrade / repair / mercenary spawn.
  _fxTag(occ, kind) {
    this._fxSeq = (this._fxSeq ?? 0) + 1
    occ.fxSeq = this._fxSeq
    occ.fxKind = kind
  }

  /** Repair a damaged unit/building back to full HP for gold. */
  repairOccupant(row, col) {
    if (!this._canEconomize()) return
    const occ = this.data.tableau.tileAt(row, col)?.occupant
    if (!occ || !occ.damaged || occ.mercenary) return // mercenaries are disposable, not repaired
    const cost = repairCost(occ, this.data.era)
    const civ = this.data.civilization
    if (civ.gold.value < cost) return
    civ.gold.value -= cost
    occ.damaged = false
    occ.hp = occ.maxHp
    this._recomputeOutputs() // a repaired building resumes producing
    this._fxTag(occ, 'repair')
    this._emit()
  }

  /** Upgrade an undamaged unit/building one level for gold (raises Atk/HP). */
  upgradeOccupant(row, col) {
    if (!this._canEconomize()) return
    const occ = this.data.tableau.tileAt(row, col)?.occupant
    if (!occ || occ.damaged || occ.mercenary) return // mercenaries disband; don't sink gold into them
    const def = occ.kind === 'unit' ? UNIT_DEFS[occ.key] : BUILDING_DEFS[occ.key]
    if (def?.noUpgrade) return // e.g. Cave Painting can't be upgraded
    const cost = upgradeCost(occ, this.data.era)
    const civ = this.data.civilization
    if (civ.gold.value < cost) return
    civ.gold.value -= cost
    occ.level += 1
    const oldMax = occ.maxHp
    const newMax = occ.kind === 'unit'
      ? unitStats(UNIT_DEFS[occ.key], occ.level, civ.modifiers.unitHpBonus).def
      : buildingHp(BUILDING_DEFS[occ.key], occ.level, civ.modifiers.buildingHpBonus)
    occ.maxHp = newMax
    occ.hp = Math.min(newMax, (occ.hp ?? oldMax) + (newMax - oldMax))
    if (occ.kind === 'unit') this._syncUnitStats() // re-fold in any Warband bonus
    this._recomputeOutputs() // Mine/Kiln/Brewery output scales with level
    this._fxTag(occ, 'upgrade')
    this._emit()
  }

  /** Gold cost to convert citizens into one unlocked specialist type right now. */
  specialistConvertInfo(popKey) {
    const civ = this.data.civilization
    const era = this.data.era
    const n = specialistConvertCount(era)
    const cost = specialistCost(era)
    const citizens = civ.pops.citizen ?? 0
    const unlocked = isSpecialist(popKey) && civ.population.includes(popKey)
    return { count: n, cost, canAfford: civ.gold.value >= cost, enoughCitizens: citizens >= n, unlocked }
  }

  /** Spend gold to convert (era+1) citizens into an unlocked specialist type. */
  convertSpecialistWithGold(popKey) {
    if (!this._canEconomize()) return
    const info = this.specialistConvertInfo(popKey)
    if (!info.unlocked || !info.enoughCitizens || !info.canAfford) return
    const civ = this.data.civilization
    civ.gold.value -= info.cost
    civ.pops.citizen -= info.count
    civ.pops[popKey] = (civ.pops[popKey] ?? 0) + info.count
    this._recomputeOutputs()
    this._fxSeq = (this._fxSeq ?? 0) + 1
    this.data.popFx = { key: popKey, seq: this._fxSeq }
    this._emit()
  }

  /** Unlocked roster units that could be deployed on this tile's terrain. */
  _placeableUnitsAt(tile) {
    const out = []
    for (const slot of this.data.civilization.units) {
      if (!slot) continue
      const def = UNIT_DEFS[slot.key]
      if (def && canPlaceOn(def.placement, tile.terrain)) out.push(slot)
    }
    return out
  }

  mercCost() { return mercenaryCost(this.data.era) }

  /** True if a mercenary can be hired onto this (empty, valid) tile during prep. */
  mercEligible(row, col) {
    if (this.data.phase !== 'prep') return false
    const tile = this.data.tableau.tileAt(row, col)
    if (!tile || tile.occupant) return false
    if (!this.data.tableau.isUnlocked(row, col, this.data.era)) return false
    return this._placeableUnitsAt(tile).length > 0
  }

  /** Hire a random valid roster unit onto an empty tile for gold. Mercenaries are
   *  flagged `mercenary` and disband when the battle ends. */
  hireMercenary(row, col) {
    if (!this.mercEligible(row, col)) return
    const tile = this.data.tableau.tileAt(row, col)
    const candidates = this._placeableUnitsAt(tile)
    const civ = this.data.civilization
    const cost = mercenaryCost(this.data.era)
    if (civ.gold.value < cost) return
    civ.gold.value -= cost
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    const hp = unitStats(UNIT_DEFS[pick.key], pick.level, civ.modifiers.unitHpBonus).def
    tile.occupant = { kind: 'unit', key: pick.key, level: pick.level, hp, maxHp: hp, damaged: false, mercenary: true }
    this._syncUnitStats() // the merc counts toward Warband (and vice versa)
    this._recomputeOutputs() // …and Brewery gold (a new unit may be in range)
    this._fxTag(tile.occupant, 'hire')
    this._emit()
  }

  // --- Free unit repositioning: drag a unit to an empty valid tile, OR onto
  // another unit to SWAP places (both must be able to stand on the other's terrain). ---
  canReposition(fromRow, fromCol, toRow, toCol) {
    if (fromRow === toRow && fromCol === toCol) return false
    const from = this.data.tableau.tileAt(fromRow, fromCol)
    const occ = from?.occupant
    if (!occ || occ.kind !== 'unit') return false
    const to = this.data.tableau.tileAt(toRow, toCol)
    if (!to || !this.data.tableau.isUnlocked(toRow, toCol, this.data.era)) return false
    if (!canPlaceOn(UNIT_DEFS[occ.key].placement, to.terrain)) return false // moving unit must fit dest
    if (!to.occupant) return true // move onto an empty tile
    // Swap: the destination must hold a UNIT that can also stand on the source terrain.
    return to.occupant.kind === 'unit' && canPlaceOn(UNIT_DEFS[to.occupant.key].placement, from.terrain)
  }

  moveUnit(fromRow, fromCol, toRow, toCol) {
    if (!this.canReposition(fromRow, fromCol, toRow, toCol)) return
    const from = this.data.tableau.tileAt(fromRow, fromCol)
    const to = this.data.tableau.tileAt(toRow, toCol)
    const swapped = to.occupant // null = plain move; a unit = swap
    to.occupant = from.occupant
    from.occupant = swapped
    this._syncUnitStats() // positions changed → refresh Brewery-aura membership
    this._recomputeOutputs() // …and Brewery gold (units-in-range changed)
    this._emit()
  }

  // ---------------------------------------------------------------------------
  // Phase machine
  // ---------------------------------------------------------------------------
  _endDevelopment() {
    if (this.data.phase !== 'development') return
    this._startPrep()
  }

  // Combat preparation: a holding phase where the player may spend gold (repair /
  // upgrade / hire mercenaries / convert specialists) and reposition units before
  // the fight. No ticking; the player presses "Begin Combat" to start the battle.
  _startPrep() {
    this.data.phase = 'prep'
    this._restartTimer() // clears the dev timer; prep has none
  }

  /** Player pressed "Begin Combat" on the preparation screen. */
  beginCombat() {
    if (this.data.phase !== 'prep') return
    // A paused speed would freeze the battle loop; default to standard so combat runs.
    if ((SPEED_TPS[this.data.speed] || 0) <= 0) this.data.speed = 'standard'
    this._startCombat()
    this._emit()
  }

  // ---------------------------------------------------------------------------
  // Combat (battle phase). Lasts COMBAT_DURATION combat-seconds. Units attack on
  // cooldown vs. the era's enemy host. Melee/cavalry only strike when they are the
  // front-most friendly in the column; ranged strike the front enemy at any range;
  // an empty column yields gold (player) / legitimacy damage (enemy). Attacks are
  // resolved bottom-to-top, left-to-right. Non-destroyed instances heal between
  // combats; destroyed ones stay `damaged` until repaired.
  // ---------------------------------------------------------------------------
  _generateEnemies() {
    const era = this.data.era
    const t = this.data.tableau
    const host = generateHost(era, t.enemyRowCount(era), t.columnPlaces(era))
    this.data.enemies = host.units.map((u) => ({ ...u, kind: 'unit', cdTimer: 0 }))
    this.data.enemyHostType = host.type
  }

  _startCombat() {
    this._syncUnitStats(true) // snapshot combat stats (Warband/Forest/Brewery) for this battle
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (!occ) continue
      // Remember each unit's starting tile (to shift back after the battle) and clear
      // last-attack so the thrust doesn't replay at combat start (combatSeq is monotonic).
      if (occ.kind === 'unit') { occ.homeRow = tile.row; occ.homeCol = tile.col; delete occ.lastAttackSeq }
      if (occ.damaged) continue
      occ.hp = occ.maxHp // damage doesn't persist between combats
      if (occ.kind === 'unit') occ.cdTimer = this._effectiveCooldown(occ)
    }
    for (const e of this.data.enemies) {
      if (e.damaged) continue
      e.hp = e.maxHp
      e.cdTimer = this._effectiveCooldown(e)
    }
    this.data.combatTime = 0
    this.data.combatEvents = []
    this.data.combatIntro = true // hold the fight until the "Battle" banner clears
    this.data.phase = 'battle'
    this._restartTimer()
  }

  /** Called by the UI once the "Battle" announcement has cleared — the fight begins. */
  dismissCombatIntro() {
    if (this.data.phase !== 'battle' || !this.data.combatIntro) return
    this.data.combatIntro = false
    this._emit()
  }

  _combatStep() {
    if (this.data.phase !== 'battle' || this.data.combatIntro) return
    const mult = SPEED_TPS[this.data.speed] || 0
    if (mult <= 0) return
    const dt = (COMBAT_INTERVAL_MS / 1000) * mult
    const before = this.data.combatTime
    this.data.combatTime += dt
    this.data.combatSeq++
    this.data.combatEvents = []

    const bounds = this.data.tableau.visibleBounds(this.data.era)
    const enemyRows = this.data.tableau.enemyRowCount(this.data.era)
    // Flow idle units toward reachable enemies; re-sync so their Forest/Brewery
    // bonuses reflect the NEW tile (stats are stored per-occupant by _syncUnitStats).
    if (this._combatReposition(bounds)) this._syncUnitStats(true)
    const list = this._combatants(bounds, enemyRows)
    list.sort((a, b) => a.y - b.y || a.col - b.col) // bottom-to-top, left-to-right

    for (const c of list) if (c.isUnit && this._isActive(c)) c.unit.cdTimer -= dt

    let shifted = false
    for (const c of list) {
      if (!c.isUnit || !this._isActive(c) || c.unit.cdTimer > 0) continue
      if (this._resolveAttack(c, bounds)) {
        c.unit.cdTimer += this._effectiveCooldown(c.unit)
        c.unit.lastAttackSeq = this.data.combatSeq // drives the attack "thrust" animation
        if (UNIT_DEFS[c.unit.key]?.shift && this._shift(c, bounds, enemyRows)) shifted = true
      }
    }
    if (shifted) this._syncUnitStats(true) // a Wolf shift changed a unit's tile

    // Campfire auras heal adjacent friendlies once per whole combat-second crossed.
    const secs = Math.floor(this.data.combatTime) - Math.floor(before)
    if (secs > 0) this._applyCampfireHealing(secs)

    const civ = this.data.civilization
    if (civ.legitimacy.value <= 0) { civ.legitimacy.value = 0; this._defeat(); return }
    if (this.data.combatTime >= COMBAT_DURATION) { this._endCombat(); return }
    this._emit()
  }

  _combatants(bounds, enemyRows) {
    const out = []
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (!occ) continue
      out.push({ side: 'player', unit: occ, col: tile.col, row: tile.row, y: tile.row, isUnit: occ.kind === 'unit' })
    }
    for (const e of this.data.enemies) {
      out.push({ side: 'enemy', unit: e, col: e.col, slot: e.slot, y: bounds.maxRow + (enemyRows - e.slot), isUnit: true })
    }
    return out
  }

  _isActive(c) { return !c.unit.damaged }

  _resolveAttack(c, bounds) {
    const atk = this._effectiveAtk(c.unit)
    const role = unitRole(UNIT_DEFS[c.unit.key])
    if (c.side === 'player') {
      const front = this._frontEnemyInCol(c.col)
      const isFrontUnit = c.row === this._frontPlayerUnitRow(c.col, bounds)
      if (!front) {
        // No enemy target in this column: melee/cavalry that are OBSTRUCTED by a
        // friendly unit in front don't act; only the front unit (or any ranged, which
        // shoots over) collects the "unblocked" gold (+ Hunting food).
        if (role !== 'ranged' && !isFrontUnit) return false
        this.data.civilization.gold.value += atk
        this._pushEvent({ kind: 'gold', amount: atk, col: c.col, row: c.row })
        if (this._hasPolicy('hunting')) {
          const food = this.data.civilization.food
          food.value += atk
          this._processThresholds('food', food)
          this._pushEvent({ kind: 'food', amount: atk, col: c.col, row: c.row })
        }
        return true
      }
      if (role === 'ranged' || isFrontUnit) {
        this._pushEvent({ kind: 'attack', side: 'player', col: c.col, row: c.row })
        this._dealDamage(front, atk, 'enemy', { col: front.col, slot: front.slot })
        return true
      }
      return false // melee/cavalry blocked behind a friendly UNIT (buildings don't block)
    }
    const front = this._frontPlayerInCol(c.col, bounds)
    if (!front) {
      const legit = this.data.civilization.legitimacy
      legit.value = Math.max(0, legit.value - atk)
      this._pushEvent({ kind: 'legit', amount: atk, col: c.col })
      return true
    }
    if (role === 'ranged' || c.slot === this._frontEnemySlot(c.col)) {
      this._pushEvent({ kind: 'attack', side: 'enemy', col: c.col, slot: c.slot })
      this._dealDamage(front.occ, atk, 'player', { col: c.col, row: front.row })
      return true
    }
    return false
  }

  _dealDamage(target, amount, side, loc) {
    target.hp -= amount
    const killed = target.hp <= 0
    if (killed) { target.hp = 0; target.damaged = true }
    this._pushEvent({ kind: 'damage', side, amount, killed, ...loc })
    // Burial Rites: any unit that dies yields :progress: equal to its :defense: (maxHp).
    // Banked to progress.value (NOT crossed here) — progress choices only open in
    // development, and pending choices are dropped at era change; the banked value
    // carries into next era's dev and opens the choices there.
    if (killed && this._hasPolicy('burial_rites')) {
      const p = target.maxHp ?? 0
      this.data.civilization.progress.value += p
      this._pushEvent({ kind: 'progress', amount: p, ...loc })
    }
  }

  _frontEnemyInCol(col) {
    let best = null
    for (const e of this.data.enemies) {
      if (e.col === col && !e.damaged && (best === null || e.slot > best.slot)) best = e
    }
    return best
  }
  _frontEnemySlot(col) {
    const f = this._frontEnemyInCol(col)
    return f ? f.slot : -1
  }
  _frontPlayerInCol(col, bounds) {
    for (let r = bounds.maxRow; r >= bounds.minRow; r--) {
      const occ = this.data.tableau.tileAt(r, col)?.occupant
      if (occ && !occ.damaged) return { occ, row: r }
    }
    return null
  }
  _frontPlayerRow(col, bounds) {
    const f = this._frontPlayerInCol(col, bounds)
    return f ? f.row : NaN
  }
  // Front-most friendly UNIT (buildings excluded — they shield the enemy but don't
  // block your own melee/cavalry from striking the front enemy).
  _frontPlayerUnitRow(col, bounds) {
    for (let r = bounds.maxRow; r >= bounds.minRow; r--) {
      const occ = this.data.tableau.tileAt(r, col)?.occupant
      if (occ && !occ.damaged && occ.kind === 'unit') return r
    }
    return NaN
  }

  // ---------------------------------------------------------------------------
  // Combat repositioning: a unit whose own column has NO enemies flows one column
  // over toward reachable enemies.
  //  - melee/cavalry: move to an adjacent column that HAS enemies and NO friendly
  //    melee/cavalry unit (become its front line).
  //  - ranged: move to an adjacent column that HAS enemies and friendly cover (a
  //    defensive building or a melee unit) to shoot from behind.
  // ---------------------------------------------------------------------------
  _combatReposition(bounds) {
    if (!bounds) return false
    const units = []
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (occ && occ.kind === 'unit' && !occ.damaged) units.push({ tile, occ })
    }
    units.sort((a, b) => a.tile.row - b.tile.row || a.tile.col - b.tile.col)
    let moved = false
    for (const { tile, occ } of units) {
      if (this._columnHasEnemies(tile.col)) continue // has targets here — stay
      const role = unitRole(UNIT_DEFS[occ.key])
      if (role !== 'melee' && role !== 'cavalry' && role !== 'ranged') continue
      const dest = this._repositionDest(tile, occ, role, bounds)
      if (dest) { dest.occupant = occ; tile.occupant = null; moved = true }
    }
    return moved
  }

  /** Best reposition target for an idle unit: an empty, valid tile at road-augmented
   *  distance 1 in a DIFFERENT column that has enemies and satisfies the role's rule
   *  (melee/cavalry → no friendly front there; ranged → has cover there). With no road
   *  this is exactly the same-row neighbouring column (a lateral step — never a leap to
   *  a distant row); a road bridges it to any of the network's ports. */
  _repositionDest(tile, occ, role, bounds) {
    const cands = []
    for (const [k, d] of this._reachableWithin(tile.row, tile.col, 1)) {
      if (d !== 1) continue
      const [r, c] = k.split(',').map(Number)
      if (c === tile.col || c < bounds.minCol || c > bounds.maxCol) continue
      if (!this._columnHasEnemies(c)) continue
      const dt = this.data.tableau.tileAt(r, c)
      if (!dt || dt.occupant || !this.data.tableau.isUnlocked(r, c, this.data.era)) continue
      if (!canPlaceOn(UNIT_DEFS[occ.key].placement, dt.terrain)) continue
      const ok = role === 'ranged' ? this._columnHasCover(c, bounds) : !this._columnHasFriendlyFront(c, bounds)
      if (ok) cands.push(dt)
    }
    cands.sort((a, b) => a.col - b.col || a.row - b.row)
    return cands[0] ?? null
  }

  _columnHasEnemies(col) {
    return this.data.enemies.some((e) => e.col === col && !e.damaged)
  }
  // Friendly melee/cavalry unit present in a column.
  _columnHasFriendlyFront(col, bounds) {
    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      const occ = this.data.tableau.tileAt(r, col)?.occupant
      if (occ?.kind === 'unit' && !occ.damaged) {
        const role = unitRole(UNIT_DEFS[occ.key])
        if (role === 'melee' || role === 'cavalry') return true
      }
    }
    return false
  }
  // Cover for ranged: a friendly defensive building or a melee unit in the column.
  _columnHasCover(col, bounds) {
    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      const occ = this.data.tableau.tileAt(r, col)?.occupant
      if (!occ || occ.damaged) continue
      if (occ.kind === 'building' && BUILDING_DEFS[occ.key]?.types?.includes('defense')) return true
      if (occ.kind === 'unit' && unitRole(UNIT_DEFS[occ.key]) === 'melee') return true
    }
    return false
  }
  // Player units carry a synced effective atk (occ.atk); enemies fall back to base.
  _effectiveAtk(unit) { return unit.atk ?? unitStats(UNIT_DEFS[unit.key], unit.level, 0, unit.warband ?? 0).atk }
  _effectiveCooldown(unit) {
    const def = UNIT_DEFS[unit.key] ?? BUILDING_DEFS[unit.key]
    return Math.max(MIN_COOLDOWN, def?.cooldown ?? MIN_COOLDOWN)
  }

  _colPlaces(col) {
    const b = this.data.tableau.visibleBounds(this.data.era)
    const places = new Set()
    if (!b) return places
    for (let r = b.minRow; r <= b.maxRow; r++) {
      const p = this.data.tableau.tileAt(r, col)?.def?.place
      if (p) places.add(p)
    }
    return places
  }

  // Wolf ability: after attacking, shift to an adjacent empty valid space.
  // Returns true if the unit actually moved (so the caller can re-sync stats).
  _shift(c, bounds, enemyRows) {
    const def = UNIT_DEFS[c.unit.key]
    if (c.side === 'player') {
      const t = this.data.tableau
      // Adjacent empty valid tile (road-augmented — a Road lets the Wolf shift farther).
      for (const tile of this._adjacentTiles(c.row, c.col)) {
        if (tile.occupant || !t.isUnlocked(tile.row, tile.col, this.data.era) || !canPlaceOn(def.placement, tile.terrain)) continue
        t.tileAt(c.row, c.col).occupant = null
        tile.occupant = c.unit
        return true
      }
    } else {
      const nbrs = [[c.slot + 1, c.col], [c.slot - 1, c.col], [c.slot, c.col + 1], [c.slot, c.col - 1]]
      for (const [slot, col] of nbrs) {
        if (slot < 0 || slot >= enemyRows || col < bounds.minCol || col > bounds.maxCol) continue
        if (!this._colPlaces(col).has(def.placement)) continue
        if (this.data.enemies.some((e) => e.col === col && e.slot === slot)) continue
        c.unit.col = col
        c.unit.slot = slot
        return true
      }
    }
    return false
  }

  _pushEvent(ev) { this.data.combatEvents.push({ ...ev, seq: this.data.combatSeq }) }

  /** Campfire buildings heal adjacent friendly units/buildings by a % of their max
   *  HP for each whole combat-second elapsed (`times`). */
  _applyCampfireHealing(times) {
    const t = this.data.tableau
    for (const tile of t.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (!occ || occ.kind !== 'building' || occ.key !== 'campfire' || occ.damaged) continue
      const pct = BUILDING_DEFS.campfire.heal(occ.level)
      for (const nbTile of this._adjacentTiles(tile.row, tile.col)) {
        const nb = nbTile.occupant
        if (!nb || nb.damaged || nb.hp == null || nb.maxHp == null || nb.hp >= nb.maxHp) continue
        const heal = Math.min(nb.maxHp - nb.hp, Math.max(1, Math.ceil((pct / 100) * nb.maxHp)) * times)
        if (heal <= 0) continue
        nb.hp += heal
        this._pushEvent({ kind: 'heal', amount: heal, col: nbTile.col, row: nbTile.row })
      }
    }
  }

  /** After a battle, move every unit back to the tile it started combat on (units
   *  reposition/shift during combat) and disband mercenaries. Buildings never move. */
  _restoreUnitHomes() {
    const t = this.data.tableau
    const units = []
    for (const tile of t.visibleTiles(this.data.era)) {
      if (tile.occupant?.kind === 'unit') { units.push(tile.occupant); tile.occupant = null }
    }
    for (const occ of units) {
      if (occ.mercenary) continue // disbanded — not placed back
      const home = t.tileAt(occ.homeRow, occ.homeCol)
      if (home) home.occupant = occ
    }
  }

  _endCombat() {
    this._restoreUnitHomes() // shifted units return to their starting tiles; mercs disband
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (occ && !occ.damaged) { occ.hp = occ.maxHp; delete occ.cdTimer } // survivors heal to full
    }
    // Ranch: grow its per-tick food bonus (+2/3/4/…) if it survived; reset if destroyed.
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (occ?.kind !== 'building' || occ.key !== 'ranch') continue
      if (occ.damaged) { occ.ranchBonus = 0; occ.ranchStep = 2 }
      else {
        occ.ranchBonus = (occ.ranchBonus ?? 0) + (occ.ranchStep ?? 2)
        occ.ranchStep = (occ.ranchStep ?? 2) + 1
      }
    }
    // End-of-combat legitimacy: Totems, Shamans, and Sacred Grounds' empty land.
    const civ = this.data.civilization
    let legit = 0
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (occ?.kind === 'building' && occ.key === 'totem' && !occ.damaged) {
        legit += BUILDING_DEFS.totem.combatLegit(occ.level)
      }
    }
    legit += (POP_TYPES.shaman.combatLegit ?? 10) * (civ.pops.shaman ?? 0)
    if (this._hasPolicy('sacred_grounds')) {
      for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
        if (!tile.occupant && tile.def?.place === 'land') legit += 1
      }
    }
    if (legit > 0) civ.legitimacy.value += legit
    // Oral Tradition: bank :gold: + :progress: equal to post-combat :legitimacy:
    // (progress banked like Burial Rites — its choices open in next era's development).
    if (this._hasPolicy('oral_tradition')) {
      const L = Math.floor(civ.legitimacy.value)
      civ.gold.value += L
      civ.progress.value += L
    }
    // Hereditary Rule: permanently toughen every unit & building (+1 :defense: / era).
    if (this._hasPolicy('hereditary_rule')) {
      civ.modifiers.unitHpBonus += 1
      civ.modifiers.buildingHpBonus += 1
    }
    // End-of-combat building outputs (e.g. Pier food) accrue now (= "end of era").
    this._accrueBuildingOutputs()
    this._syncUnitStats(false) // combat over: drop terrain bonus, fold in Hereditary Rule
    this.data.enemies = [] // undefeated enemies fade away
    this.data.combatTime = 0
    this.data.combatEvents = []
    this.data.combatIntro = false
    this.data.phase = 'transition'
    this._restartTimer()
    this._emit()
  }

  _defeat() {
    // _endCombat never runs on defeat, so shift units home + disband mercenaries here
    // too (the enemy host stays on the board as a record of who won).
    this._restoreUnitHomes()
    this.data.defeated = true
    this.data.combatTime = COMBAT_DURATION
    this._restartTimer()
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
    this._ageCavePaintings() // stored progress doubles each era after combat
    this._beginEra()
    this._emit()
  }

  /** Each surviving Cave Painting's stored :progress: doubles per era (capped). */
  _ageCavePaintings() {
    const { storedMax, storedBase } = BUILDING_DEFS.cave_painting
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.occupant
      if (occ && occ.key === 'cave_painting') {
        occ.storedProgress = Math.min(storedMax, (occ.storedProgress ?? storedBase) * 2)
      }
    }
  }

  _beginEra() {
    this.data.phase = 'development'
    this.data.tick = 0
    this.data.speed = 'paused'
    this.data.pendingProgress = 0
    this.data.pendingProduction = 0
    this.data.selection = null
    this.data.combatTime = 0
    this.data.combatEvents = []
    this.data.combatIntro = false
    this.data.defeated = false
    this._syncUnitStats() // board persists across eras; refresh Warband/maxHp
    this._generateEnemies() // fresh host, visible during development
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
