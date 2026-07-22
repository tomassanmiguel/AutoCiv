import { GameData } from './GameData.js'
import { ERAS, ERA_COUNT } from './data/eras.js'
import { RESOURCE_CONFIG, TICKS_PER_ERA, nextThreshold, rubberBand } from './data/resources.js'
import { POP_TYPES, isSpecialist } from './data/pops.js'
import { ADVANCEMENTS, IMPLEMENTED, isImplemented } from './data/advancements.js'
import { UNIT_DEFS, unitStats, unitRole } from './data/units.js'
import { BUILDING_DEFS, buildingHp, buildingOutputs } from './data/buildings.js'
import { UNIT_CATEGORIES, BUILDING_CATEGORIES } from './data/slots.js'
import { canPlaceOn, terrainDefBonus } from './data/terrain.js'
import { upgradeCost, repairCost, specialistCost, specialistConvertCount, mercenaryCost } from './data/costs.js'
import { installCombat, SPEED_TPS, COMBAT_INTERVAL_MS } from './manager/combat.js'

// Combat methods live in ./manager/combat.js and are installed onto the prototype
// at the bottom of this file. SPEED_TPS is re-exported from its original home for compat.
export { SPEED_TPS }

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const THRESHOLD_TYPES = ['progress', 'food', 'production']

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
    this._roadNetsCache = null // memoized _roadPortSets(); invalidated when a Road is placed

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

  /** Development ticks this era (Calendar policy adds 5). */
  ticksPerEra() { return TICKS_PER_ERA + (this._hasPolicy('calendar') ? 5 : 0) }

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
    civ.legitimacy.value += civ.legitimacy.output // Temples produce :legitimacy: per tick
    this._accrueBuildingTickLifetime() // per-tick buildings track a lifetime total

    // Count the tick (resources accrue exactly once per tick), then open any owed
    // choice (which pauses the game). Development ends only once nothing is
    // pending — so a threshold crossed on the FINAL tick is still presented before
    // the era ends (see _afterResolve).
    this.data.tick += 1
    this._maybeOpenSelection()
    if (this.data.selection) { this._emit(); return }
    if (this.data.tick >= this.ticksPerEra()) { this._endDevelopment(); this._emit(); return }
    this._emit()
  }

  /** Effective per-pop, per-tick output for one pop TYPE, including policy modifiers
   *  (e.g. Language gives each Citizen +1 :progress:). Source of truth for both the
   *  economy tick and the population card display. */
  popOutput(key) {
    const base = { ...(POP_TYPES[key]?.outputs ?? {}) }
    if (key === 'citizen' && this._hasPolicy('language')) base.progress = (base.progress ?? 0) + 1
    if (key === 'citizen' && this._hasPolicy('trade_networks')) base.gold = (base.gold ?? 0) + 2
    // Specialization: each non-citizen (specialist) pop produces +1 of each of its
    // highest outputs (all tied maxima get +1).
    if (isSpecialist(key) && this._hasPolicy('specialization')) {
      const vals = Object.values(base)
      if (vals.length) {
        const max = Math.max(...vals)
        for (const res of Object.keys(base)) if (base[res] === max) base[res] += 1
      }
    }
    return base
  }

  /** Recompute each resource's per-tick output from the population. */
  _recomputeOutputs() {
    const civ = this.data.civilization
    const totals = { progress: 0, food: 0, production: 0, gold: 0, legitimacy: 0 }
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
    // Per-tick building outputs (Ranch/Farm food, Kiln production, Mine/Mint gold, Temple legitimacy).
    const bt = this._buildingTickOutputs()
    totals.food += bt.food
    totals.production += bt.production
    totals.gold += bt.gold
    totals.legitimacy += bt.legitimacy
    // Slavery: +10% :production:, −5% :progress: (kept as floats; UI rounds down).
    if (this._hasPolicy('slavery')) {
      totals.production *= 1.10
      totals.progress *= 0.95
    }
    // Weights and Measures: +50% :gold: outputs.
    if (this._hasPolicy('weights_and_measures')) totals.gold *= 1.5
    civ.progress.output = totals.progress
    civ.food.output = totals.food
    civ.production.output = totals.production
    civ.gold.output = totals.gold
    civ.legitimacy.output = totals.legitimacy
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
    const civ = this.data.civilization
    const totals = { food: 0, production: 0, gold: 0, legitimacy: 0 }
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.occupant
      if (!occ || occ.kind !== 'building') continue
      if (occ.damaged) { occ.tickOutput = null; continue } // destroyed buildings produce nothing
      const def = BUILDING_DEFS[occ.key]
      let out = null
      if (occ.key === 'ranch') out = { res: 'food', amount: 5 + (occ.ranchBonus ?? 0) }
      else if (occ.key === 'kiln') out = { res: 'production', amount: 2 + def.perAdjacent(occ.level) * this._adjacentBuildingCount(tile.row, tile.col) }
      else if (occ.key === 'mine') out = { res: 'gold', amount: def.goldPerTick(occ.level) * (tile.terrain === 'mountain' ? 2 : 1) }
      else if (occ.key === 'mint') out = { res: 'gold', amount: def.legitPct(occ.level) * civ.legitimacy.value }
      else if (occ.key === 'temple') out = { res: 'legitimacy', amount: def.legitPerTick(occ.level) }
      else if (occ.key === 'farm') out = { res: 'food', amount: 5 * this._plainsAround(tile) }
      else if (occ.key === 'forging') out = { res: 'production', amount: def.prodPerTick(occ.level) }
      else if (occ.key === 'aqueduct') out = { res: 'food', amount: def.base(occ.level) * Math.pow(2, this._adjacentAqueductCount(tile)) }
      else if (occ.key === 'glassworks') out = { res: 'production', amount: 10 }
      occ.tickOutput = out
      if (out) totals[out.res] += out.amount
    }
    return totals
  }

  /** Count of Plains tiles among a Farm's own tile + its (road-augmented) neighbours. */
  _plainsAround(tile) {
    let n = tile.terrain === 'plains' ? 1 : 0
    for (const nb of this._adjacentTiles(tile.row, tile.col)) if (nb.terrain === 'plains') n++
    return n
  }

  /** Count of undamaged Aqueducts on tiles (road-augmented) adjacent to `tile`. */
  _adjacentAqueductCount(tile) {
    let n = 0
    for (const nb of this._adjacentTiles(tile.row, tile.col)) {
      if (nb.occupant?.kind === 'building' && nb.occupant.key === 'aqueduct' && !nb.occupant.damaged) n++
    }
    return n
  }

  /** Count of adjacent (road-augmented) tiles holding a real, active building. */
  _adjacentBuildingCount(r, c) {
    let n = 0
    for (const tile of this._adjacentTiles(r, c)) {
      const occ = tile.occupant
      if (occ?.kind === 'building' && !occ.damaged && !BUILDING_DEFS[occ.key]?.underlap) n++
    }
    return n
  }

  // --- Road-augmented adjacency ---------------------------------------------------
  // A Road (an underlapping utility) makes every tile it touches mutually adjacent,
  // chaining through connected roads. ALL adjacency/range queries route through
  // _reachableWithin so roads uniformly boost building ranges and unit movement.

  /** Connected road networks as PORT sets: each Set holds a network's road tiles plus
   *  their orthogonal neighbours. Any two tiles in one set are adjacent (distance 1).
   *  Memoized (roads only change on placement) so a whole combat step / stat sync reuses
   *  one computation instead of rescanning the grid per query. */
  _roadPortSets() {
    if (this._roadNetsCache) return this._roadNetsCache
    const t = this.data.tableau
    const NBRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const roadKeys = []
    for (const tile of t.tiles.values()) if (tile.underlap?.key === 'road') roadKeys.push(`${tile.row},${tile.col}`)
    if (roadKeys.length === 0) { this._roadNetsCache = []; return this._roadNetsCache }
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
    this._roadNetsCache = nets
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

  /** Combat aura at (row, col) from adjacent Brothels: an :attack: multiplier + a flat
   *  cooldown reduction (non-stacking — the best adjacent brothel wins). */
  _brothelAura(row, col) {
    let atkPct = 0, cd = 0
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.occupant
      if (occ?.kind === 'building' && occ.key === 'brothel' && !occ.damaged &&
          this._reachableWithin(tile.row, tile.col, 1).has(`${row},${col}`)) {
        atkPct = Math.max(atkPct, BUILDING_DEFS.brothel.atkPct(occ.level))
        cd = BUILDING_DEFS.brothel.cdReduce
      }
    }
    return { atkMult: 1 + atkPct, cd }
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
        // Legion: an intrinsic +packAtk :attack: per OTHER same-key unit (e.g. Legionnaire).
        const pack = (UNIT_DEFS[occ.key].packAtk ?? 0) * Math.max(0, (counts[occ.key] ?? 1) - 1)
        const brew = this._inBreweryRange(tile.row, tile.col)
        const brothel = this._brothelAura(tile.row, tile.col) // { atkMult, cd }
        const caste = (this._hasPolicy('caste_system') && occ.level > 1) ? 1.25 : 1 // upgraded units +25% atk
        // Composite Bows: +50% :attack: to ranged-role units (incl. Catapult/Trireme).
        const rangedBoost = (this._hasPolicy('composite_bows') && unitRole(UNIT_DEFS[occ.key]) === 'ranged') ? 1.5 : 1
        // occ.permDef = permanent :defense: granted by a Baker (persists across combats).
        const s = unitStats(UNIT_DEFS[occ.key], occ.level, hpBonus + wb + terrainDef + (occ.permDef ?? 0), wb + pack)
        const wasFull = occ.hp == null || occ.maxHp == null || occ.hp >= occ.maxHp
        const posMult = (brew ? 1.1 : 1) * brothel.atkMult * rangedBoost // level-independent atk mult (Brewery × Brothel × Composite Bows)
        occ.warband = wb
        occ.packAtk = pack
        occ.terrainDef = terrainDef
        occ.inBrewery = brew
        occ.rangedBoost = rangedBoost > 1
        occ.cdReduce = brothel.cd
        occ.atkMult = posMult // stored for the upgrade preview (level-independent part)
        occ.casteActive = this._hasPolicy('caste_system')
        occ.atk = Math.round(s.atk * posMult * caste)
        occ.maxHp = Math.max(1, Math.round(s.def * (brew ? 0.9 : 1)))
        if (!occ.damaged) occ.hp = wasFull ? occ.maxHp : Math.min(occ.maxHp, occ.hp)
      } else if (occ.kind === 'building' && !BUILDING_DEFS[occ.key]?.underlap) {
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
    const m = this.data.civilization.modifiers
    const mult = type === 'food' ? m.foodThresholdMult : type === 'progress' ? m.progressThresholdMult : 1
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
    if (this.data.tick >= this.ticksPerEra() && this.data.phase === 'development') this._endDevelopment()
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
    if (unlock.key === 'clothes' || unlock.key === 'leatherwork') {
      civ.modifiers.unitHpBonus += unlock.key === 'clothes' ? 5 : 8
      this._syncUnitStats() // apply retroactively to deployed units (with Warband)
    } else if (unlock.key === 'masonry' || unlock.key === 'concrete') {
      civ.modifiers.buildingHpBonus += unlock.key === 'masonry' ? 10 : 12
      this._syncUnitStats() // retroactively toughen deployed buildings
    } else if (unlock.key === 'basket_weaving' || unlock.key === 'plough') {
      civ.modifiers.foodThresholdMult *= 0.95 // −5% food thresholds (stacks)
    } else if (unlock.key === 'alphabet') {
      civ.modifiers.progressThresholdMult *= 0.95 // −5% progress thresholds (stacks)
    } else if (unlock.key === 'mathematics') {
      this.data.pendingProduction += 2 // "produce twice" — two immediate build opportunities
    }
  }

  // --- Slot resolution helpers ---
  // Returns { group, multiFill, slotIndices }. slotIndices are the item's target
  // slots and (when full) the replace candidates; multiFill = fill EVERY empty
  // target (units/buildings occupy each of their type slots) vs. just one
  // (policies/specialists take a single slot from a generic group).
  _unlockTarget(unlock) {
    switch (unlock.kind) {
      case 'unit': {
        // Fill the first EMPTY slot whose category matches a type (a multi-type unit like
        // the Trireme = ranged/naval goes in either); full → those become replace candidates.
        const types = UNIT_DEFS[unlock.key].types
        const slotIndices = UNIT_CATEGORIES.map((c, i) => i).filter((i) => types.includes(UNIT_CATEGORIES[i].key))
        return { group: 'units', multiFill: false, slotIndices }
      }
      case 'building': {
        // Fill the first EMPTY slot whose category matches the building's type (Utility
        // has two slots); when all are full those slots become the replace candidates.
        const types = BUILDING_DEFS[unlock.key].types
        const slotIndices = BUILDING_CATEGORIES.map((c, i) => i).filter((i) => types.includes(BUILDING_CATEGORIES[i].key))
        return { group: 'buildings', multiFill: false, slotIndices }
      }
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
    // Underlapping buildings coexist with the occupant, so they're always a plain (valid) placement.
    if (sel.chosen.kind === 'building' && BUILDING_DEFS[sel.chosen.key].underlap) return 'valid'
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
    // An underlapping building coexists with the occupant but can't stack (one per tile).
    if (chosen.kind === 'building' && def.underlap) return !tile.underlap
    return true
  }

  _createInstance(chosen, tile) {
    const civ = this.data.civilization
    // Underlapping buildings (Road) share the tile in their own slot — they never
    // replace and don't overbuild; placing one just re-derives adjacency-based outputs.
    if (chosen.kind === 'building' && BUILDING_DEFS[chosen.key].underlap) {
      tile.underlap = { kind: 'building', key: chosen.key, level: chosen.level }
      this._roadNetsCache = null // road topology changed → drop the memoized port sets
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
    // Glassworks: completing any building grants legitimacy per OTHER deployed Glassworks.
    if (chosen.kind === 'building') {
      let legit = 0
      for (const t of this.data.tableau.tiles.values()) {
        const g = t.occupant
        if (g?.kind === 'building' && g.key === 'glassworks' && !g.damaged && g !== tile.occupant) {
          legit += BUILDING_DEFS.glassworks.legitOnBuild(g.level)
        }
      }
      if (legit > 0) civ.legitimacy.value += legit
    }
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

  /** End-of-era (`per:'era'`) economic output from deployed buildings (into resources +
   *  lifetime). Food crossings add pops immediately; :progress: is banked (its choices
   *  open in next era's development, like Burial Rites/Oral Tradition). */
  _accrueBuildingOutputs() {
    const civ = this.data.civilization
    let addedFood = 0
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.occupant
      if (!occ || occ.kind !== 'building' || occ.damaged) continue
      for (const o of buildingOutputs(BUILDING_DEFS[occ.key], occ.level, this.data.era)) {
        if (!civ[o.res]) continue
        civ[o.res].value += o.amount // Pier food, Library progress, …
        occ.lifetimeOutput = (occ.lifetimeOutput ?? 0) + o.amount
        if (o.res === 'food') addedFood += o.amount
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

  /** Repair cost for a damaged occupant, with the Code of Laws discount (−75%). */
  repairCostFor(occ) {
    return Math.round(repairCost(occ, this.data.era) * (this._hasPolicy('code_of_laws') ? 0.25 : 1))
  }

  /** Repair a damaged unit/building back to full HP for gold. */
  repairOccupant(row, col) {
    if (!this._canEconomize()) return
    const occ = this.data.tableau.tileAt(row, col)?.occupant
    if (!occ || !occ.damaged || occ.mercenary) return // mercenaries are disposable, not repaired
    const cost = this.repairCostFor(occ)
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

  /** Unlocked roster units that could be hired as a mercenary onto this tile's terrain.
   *  Excludes utility units (e.g. Baker) — a mercenary is a disposable COMBAT unit. */
  _placeableUnitsAt(tile) {
    const out = []
    for (const slot of this.data.civilization.units) {
      if (!slot) continue
      const def = UNIT_DEFS[slot.key]
      if (def && unitRole(def) !== 'utility' && canPlaceOn(def.placement, tile.terrain)) out.push(slot)
    }
    return out
  }

  /** Mercenary hire cost (Hospitality Rites halves it). */
  mercCost() {
    return Math.round(mercenaryCost(this.data.era) * (this._hasPolicy('hospitality_rites') ? 0.5 : 1))
  }

  /** Level a mercenary spawns at (Diplomatic Marriage adds 3 levels). */
  _mercLevel(baseLevel) {
    return baseLevel + (this._hasPolicy('diplomatic_marriage') ? 3 : 0)
  }

  /** Surveying: lay a Road (underlap) on a random visible land tile that has none. */
  _layRandomRoad() {
    const cands = []
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      if (!tile.underlap && tile.def?.place === 'land') cands.push(tile)
    }
    if (cands.length === 0) return
    const tile = cands[Math.floor(Math.random() * cands.length)]
    tile.underlap = { kind: 'building', key: 'road', level: 1 }
    this._roadNetsCache = null // road topology changed
  }

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
    const cost = this.mercCost() // includes the Hospitality Rites discount
    if (civ.gold.value < cost) return
    civ.gold.value -= cost
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    const level = this._mercLevel(pick.level)
    const hp = unitStats(UNIT_DEFS[pick.key], level, civ.modifiers.unitHpBonus).def
    tile.occupant = { kind: 'unit', key: pick.key, level, hp, maxHp: hp, damaged: false, mercenary: true }
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

installCombat(GameManager)
