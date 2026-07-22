import { GameData } from './GameData.js'
import { ERAS, ERA_COUNT } from './data/eras.js'
import { RESOURCE_CONFIG, TICKS_PER_ERA, nextThreshold, rubberBand } from './data/resources.js'
import { POP_TYPES, isSpecialist } from './data/pops.js'
import { ADVANCEMENTS, IMPLEMENTED, isImplemented } from './data/advancements.js'
import { UNIT_DEFS, unitStats } from './data/units.js'
import { BUILDING_DEFS, buildingHp, buildingOutputs } from './data/buildings.js'
import { UNIT_CATEGORIES, BUILDING_CATEGORIES } from './data/slots.js'
import { canPlaceOn } from './data/terrain.js'
import { generateHost } from './data/enemies.js'

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

  /** Recompute each resource's per-tick output from the population. */
  _recomputeOutputs() {
    const civ = this.data.civilization
    const totals = { progress: 0, food: 0, production: 0, gold: 0 }
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
    civ.gold.output = totals.gold
  }

  /** Cross any thresholds this resource has reached this tick. */
  _processThresholds(type, res) {
    const cfg = RESOURCE_CONFIG[type]
    let guard = 0
    while (res.value >= res.threshold && guard++ < 1000) {
      res.value -= res.threshold // carry the overflow into the next level
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
      case 'modifier': return '/sprites/ui/defense.png'
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

    // All relevant slots full -> replace flow (optionally gated by a confirm).
    sel.pending = { unlock: opt.unlock, group: target.group, candidates: target.slotIndices, advId: opt.id }
    if (this.data.civilization.askBeforeReplace) sel.stage = 'confirm'
    else this._beginReplace()
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
    if (unlock.key === 'clothes') this.data.civilization.modifiers.unitHpBonus += 5
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
    else if (group === 'policies') civ.policies[i] = { key: unlock.key }
    else if (group === 'population') this._unlockSpecialist(i, unlock.key)
    this._markFilled(group, i)
  }

  _replaceSlot(group, i, unlock) {
    const civ = this.data.civilization
    if (group === 'population') { this._replaceSpecialist(i, unlock.key); this._markFilled(group, i); return }
    if (group === 'units') civ.units[i] = { key: unlock.key, level: 1 }
    else if (group === 'buildings') civ.buildings[i] = { key: unlock.key, level: 1 }
    else if (group === 'policies') civ.policies[i] = { key: unlock.key }
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
    return canPlaceOn(def.placement, tile.terrain)
  }

  _createInstance(chosen, tile) {
    const civ = this.data.civilization
    if (chosen.kind === 'unit') {
      const hp = unitStats(UNIT_DEFS[chosen.key], chosen.level, civ.modifiers.unitHpBonus).def
      tile.occupant = { kind: 'unit', key: chosen.key, level: chosen.level, hp, maxHp: hp, damaged: false }
    } else {
      const hp = buildingHp(BUILDING_DEFS[chosen.key], chosen.level)
      tile.occupant = { kind: 'building', key: chosen.key, level: chosen.level, hp, maxHp: hp, damaged: false, lifetimeOutput: 0 }
    }
  }

  _resolveProduction() {
    this.data.pendingProduction = Math.max(0, this.data.pendingProduction - 1)
    this.data.selection = null
    this._afterResolve()
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
  // Phase machine
  // ---------------------------------------------------------------------------
  _endDevelopment() {
    if (this.data.phase !== 'development') return // guard against double-accrue
    this._accrueBuildingOutputs()
    this._startCombat()
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
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (!occ || occ.damaged) continue
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
    this.data.phase = 'battle'
    this._restartTimer()
  }

  _combatStep() {
    if (this.data.phase !== 'battle') return
    const mult = SPEED_TPS[this.data.speed] || 0
    if (mult <= 0) return
    const dt = (COMBAT_INTERVAL_MS / 1000) * mult
    this.data.combatTime += dt
    this.data.combatSeq++
    this.data.combatEvents = []

    const bounds = this.data.tableau.visibleBounds(this.data.era)
    const enemyRows = this.data.tableau.enemyRowCount(this.data.era)
    const list = this._combatants(bounds, enemyRows)
    list.sort((a, b) => a.y - b.y || a.col - b.col) // bottom-to-top, left-to-right

    for (const c of list) if (c.isUnit && this._isActive(c)) c.unit.cdTimer -= dt

    for (const c of list) {
      if (!c.isUnit || !this._isActive(c) || c.unit.cdTimer > 0) continue
      if (this._resolveAttack(c, bounds)) {
        c.unit.cdTimer += this._effectiveCooldown(c.unit)
        if (UNIT_DEFS[c.unit.key]?.shift) this._shift(c, bounds, enemyRows)
      }
    }

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
    const role = UNIT_DEFS[c.unit.key].types[0]
    if (c.side === 'player') {
      const front = this._frontEnemyInCol(c.col)
      if (!front) {
        this.data.civilization.gold.value += atk
        this._pushEvent({ kind: 'gold', amount: atk, col: c.col, row: c.row })
        return true
      }
      if (role === 'ranged' || c.row === this._frontPlayerUnitRow(c.col, bounds)) {
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

  _effectiveAtk(unit) { return unitStats(UNIT_DEFS[unit.key], unit.level).atk }
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
  _shift(c, bounds, enemyRows) {
    const def = UNIT_DEFS[c.unit.key]
    if (c.side === 'player') {
      const t = this.data.tableau
      const nbrs = [[c.row + 1, c.col], [c.row - 1, c.col], [c.row, c.col + 1], [c.row, c.col - 1]]
      for (const [r, col] of nbrs) {
        if (!t.isUnlocked(r, col, this.data.era)) continue
        const tile = t.tileAt(r, col)
        if (!tile || tile.occupant || !canPlaceOn(def.placement, tile.terrain)) continue
        t.tileAt(c.row, c.col).occupant = null
        tile.occupant = c.unit
        return
      }
    } else {
      const nbrs = [[c.slot + 1, c.col], [c.slot - 1, c.col], [c.slot, c.col + 1], [c.slot, c.col - 1]]
      for (const [slot, col] of nbrs) {
        if (slot < 0 || slot >= enemyRows || col < bounds.minCol || col > bounds.maxCol) continue
        if (!this._colPlaces(col).has(def.placement)) continue
        if (this.data.enemies.some((e) => e.col === col && e.slot === slot)) continue
        c.unit.col = col
        c.unit.slot = slot
        return
      }
    }
  }

  _pushEvent(ev) { this.data.combatEvents.push({ ...ev, seq: this.data.combatSeq }) }

  _endCombat() {
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (occ && !occ.damaged) { occ.hp = occ.maxHp; delete occ.cdTimer }
    }
    this.data.enemies = [] // undefeated enemies fade away
    this.data.combatTime = 0
    this.data.combatEvents = []
    this.data.phase = 'transition'
    this._restartTimer()
    this._emit()
  }

  _defeat() {
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
    this._beginEra()
    this._emit()
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
    this.data.defeated = false
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
