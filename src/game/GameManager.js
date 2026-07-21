import { GameData } from './GameData.js'
import { ERAS, ERA_COUNT } from './data/eras.js'
import { RESOURCE_CONFIG, TICKS_PER_ERA, nextThreshold, rubberBand } from './data/resources.js'
import { POP_TYPES, isSpecialist } from './data/pops.js'
import { ADVANCEMENTS, IMPLEMENTED, isImplemented } from './data/advancements.js'
import { UNIT_DEFS } from './data/units.js'
import { BUILDING_DEFS } from './data/buildings.js'
import { UNIT_CATEGORIES, BUILDING_CATEGORIES } from './data/slots.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Ticks per second for each speed setting (0 = paused).
export const SPEED_TPS = { paused: 0, standard: 1, fast: 3, super: 5, ultra: 10 }
const THRESHOLD_TYPES = ['progress', 'food', 'production']

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
    // A pending selection holds the game paused regardless of the chosen speed.
    if (tps > 0 && this.data.phase === 'development' && !this.data.won && !this.data.selection) {
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
    if (this.data.phase !== 'development' || this.data.selection) return
    const civ = this.data.civilization
    this._recomputeOutputs()

    for (const type of THRESHOLD_TYPES) {
      const res = civ[type]
      res.value += res.output
      this._processThresholds(type, res)
    }
    civ.gold.value += civ.gold.output

    // Count the tick FIRST (resources accrue exactly once per tick), THEN — if a
    // progress threshold crossed this tick — open the choice, which pauses the
    // game. Resuming continues on the next tick, so no tick's output is
    // double-counted (the pause is a genuinely free pause).
    this.data.tick += 1
    if (this.data.tick >= TICKS_PER_ERA) { this._endDevelopment(); this._emit(); return }
    this._maybeOpenSelection()
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
    if (this.data.pendingProgress > 0) this._openProgressSelection()
    // production selections land in the next slice.
  }

  _openProgressSelection() {
    this.data.selection = {
      type: 'progress',
      stage: 'choose', // 'choose' | 'confirm' | 'replace'
      hidden: false,
      pending: null,
      options: this._pickProgressOptions(),
    }
    this._restartTimer() // holds the game paused
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
    this._maybeOpenSelection()
    if (!this.data.selection) this._restartTimer() // resume at the chosen speed
    this._emit()
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

  _fillSlot(group, i, unlock) {
    const civ = this.data.civilization
    if (group === 'units') civ.units[i] = { key: unlock.key, level: 1 }
    else if (group === 'buildings') civ.buildings[i] = { key: unlock.key, level: 1 }
    else if (group === 'policies') civ.policies[i] = { key: unlock.key }
    else if (group === 'population') this._unlockSpecialist(i, unlock.key)
  }

  _replaceSlot(group, i, unlock) {
    const civ = this.data.civilization
    if (group === 'population') { this._replaceSpecialist(i, unlock.key); return }
    if (group === 'units') civ.units[i] = { key: unlock.key, level: 1 }
    else if (group === 'buildings') civ.buildings[i] = { key: unlock.key, level: 1 }
    else if (group === 'policies') civ.policies[i] = { key: unlock.key }
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
    this.data.pendingProgress = 0
    this.data.pendingProduction = 0
    this.data.selection = null
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
