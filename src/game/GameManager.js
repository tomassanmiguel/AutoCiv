import { GameData } from './GameData.js'
import { ERAS, ERA_COUNT } from './data/eras.js'
import { RESOURCE_CONFIG, TICKS_PER_ERA, nextThreshold, rubberBand } from './data/resources.js'
import { POP_TYPES, isSpecialist } from './data/pops.js'
import { POLICY_DEFS } from './data/policies.js'
import { WONDER_BUILDS, WONDER_DEFS } from './data/wonders.js'
import { CIVILIZATIONS, difficultyMult } from './data/civilizations.js'
import { ADVANCEMENTS, IMPLEMENTED, isImplemented } from './data/advancements.js'
import { UNIT_DEFS, unitStats, unitRole } from './data/units.js'
import { BUILDING_DEFS, buildingHp, buildingOutputs, buildingTickAmount, defOf } from './data/buildings.js'
import { UNIT_CATEGORIES, BUILDING_CATEGORIES } from './data/slots.js'
import { canPlaceOn, canPlaceWonder, terrainDefBonus, terrainEconYield, EARTH_TERRAINS } from './data/terrain.js'
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
  constructor(seed = 1, options = {}) {
    this.data = new GameData(seed)
    this._listeners = new Set()
    this._version = 0
    this._timer = null
    this._netsCache = null // memoized _portNets() (roads + bridges); invalidated on road/era/bridge change
    this.difficultyMult = difficultyMult(options.difficulty) // enemy budget scaler (pre-game)

    this.subscribe = (fn) => {
      this._listeners.add(fn)
      return () => this._listeners.delete(fn)
    }
    this.getVersion = () => this._version

    if (options.civ) this._applyCivilization(options.civ) // marquee policy + starting unit/building
    this._recomputeOutputs()
    this._generateEnemies() // era-0 host, visible during development
  }

  /** Apply a chosen civilization's head-start: a marquee policy in the first policy slot,
   *  plus a special starting unit or building pre-unlocked in the matching roster slot. */
  _applyCivilization(civKey) {
    const c = CIVILIZATIONS[civKey]
    if (!c) return
    const civ = this.data.civilization
    civ.civKey = civKey
    if (c.marqueePolicy && POLICY_DEFS[c.marqueePolicy]) { civ.policies[0] = { key: c.marqueePolicy }; this._grantPolicyUnlock(c.marqueePolicy) }
    if (c.startUnit && UNIT_DEFS[c.startUnit]) {
      const i = UNIT_CATEGORIES.findIndex((x) => x.key === UNIT_DEFS[c.startUnit].types[0])
      if (i >= 0) civ.units[i] = { key: c.startUnit, level: 1 }
    }
    if (c.startBuilding && BUILDING_DEFS[c.startBuilding]) {
      const i = BUILDING_CATEGORIES.findIndex((x) => x.key === BUILDING_DEFS[c.startBuilding].types[0])
      if (i >= 0) civ.buildings[i] = { key: c.startBuilding, level: 1 }
    }
  }

  _emit() {
    this._version++
    for (const fn of this._listeners) fn()
  }

  get era() { return this.data.era }
  get eraInfo() { return ERAS[this.data.era] }

  /** Development ticks this era (Calendar policy adds 5). */
  ticksPerEra() { return TICKS_PER_ERA + (this._hasPolicy('calendar') ? 5 : 0) + (this.data.civilization.modifiers.bonusTicks ?? 0) }

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
    // Negative gold (e.g. Philosophers) bleeds legitimacy: lose 1 :legitimacy: per :gold:
    // below 0, then the deficit is cleared to 0.
    if (civ.gold.value < 0) { this._damageLegitimacy(-civ.gold.value); civ.gold.value = 0 }
    civ.legitimacy.value += civ.legitimacy.output // Temples produce :legitimacy: per tick
    this._accrueBuildingTickLifetime() // per-tick buildings track a lifetime total
    if (civ.legitimacy.value <= 0) { civ.legitimacy.value = 0; this.data.defeated = true; this._restartTimer(); this._emit(); return }

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
    const isCitizen = key === 'citizen'
    const spec = isSpecialist(key)
    const robot = !!POP_TYPES[key]?.robot
    // v1 holdover policies (hardcoded — their defs carry no structured fields).
    if (isCitizen && this._hasPolicy('language')) base.progress = (base.progress ?? 0) + 1
    if (isCitizen && this._hasPolicy('trade_networks')) base.gold = (base.gold ?? 0) + 2
    // Poet: +2 :progress: per era elapsed since it was unlocked (civ.poetBonus).
    if (key === 'poet') base.progress = (base.progress ?? 0) + (this.data.civilization.poetBonus ?? 0)
    // v2 structured effects (active policies + applied bonuses): per-Citizen boosters,
    // flat per-pop boosters (Alzheimer's, non-robot prefixes Evolved/Cyborg/Psychic), and
    // the specialist-output escalator (+N to each highest output).
    let specBoost = spec && this._hasPolicy('specialization') ? 1 : 0 // v1 Specialization
    let highestPlus = 0
    for (const def of this._activeEffectDefs()) {
      if (isCitizen && def.citizenOutput) base[def.citizenOutput.res] = (base[def.citizenOutput.res] ?? 0) + def.citizenOutput.amount
      if (!robot && def.popOutputFlat) base[def.popOutputFlat.res] = (base[def.popOutputFlat.res] ?? 0) + def.popOutputFlat.amount
      if (spec && def.specialistOutput) specBoost += def.specialistOutput
      // Prohibition: each Citizen +2 to every non-:gold: output, −1 :gold:.
      if (isCitizen && def.special === 'prohibition') { base.progress = (base.progress ?? 0) + 2; base.food = (base.food ?? 0) + 2; base.production = (base.production ?? 0) + 2; base.gold = (base.gold ?? 0) - 1 }
      // Video Games: each Citizen +2 :progress:, −1 :production:.
      if (isCitizen && def.special === 'citizen_progress_production_trade') { base.progress = (base.progress ?? 0) + 2; base.production = (base.production ?? 0) - 1 }
      // Transhumanism (Psychology): +1 to each pop's highest output.
      if (def.special === 'pop_highest_plus') highestPlus += 1
      // Replicant Rights: Replicant :progress: +200% (×3).
      if (key === 'replicant' && def.special === 'replicant_progress' && base.progress) base.progress *= 3
    }
    if (spec && specBoost > 0) {
      const vals = Object.values(base)
      if (vals.length) { const max = Math.max(...vals); for (const res of Object.keys(base)) if (base[res] === max) base[res] += specBoost }
    }
    if (highestPlus > 0) {
      const vals = Object.values(base)
      if (vals.length) { const max = Math.max(...vals); for (const res of Object.keys(base)) if (base[res] === max) base[res] += highestPlus }
    }
    // Eiffel Tower wonder: all specialists +50% effective output.
    if (spec && this._hasWonder('eiffel_tower')) { const wm = this._wonderYieldMult(); for (const res of Object.keys(base)) base[res] = Math.round(base[res] * (1 + 0.5 * wm)) }
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
    // Merchant Navy: +2 gold per tick per deployed naval unit.
    totals.gold += this._navalUnitGold()
    // Columbian Exchange: +6 gold per tick per New-World unit or building.
    totals.gold += this._newWorldGold()
    // Per-tick building outputs (v2 generic def.output + v1 Ranch/Kiln/Mine/… specials).
    const bt = this._buildingTickOutputs()
    totals.progress += bt.progress
    totals.food += bt.food
    totals.production += bt.production
    totals.gold += bt.gold
    totals.legitimacy += bt.legitimacy
    // Percentage output modifiers. STACKED PERCENTAGES ARE ADDITIVE per resource:
    // sum the bonuses, then apply ×(1 + bonus). (Slavery −5% + Democracy +20% progress
    // → ×1.15, not ×0.95×1.20.) Kept as floats; the UI rounds down.
    const pct = { progress: 0, food: 0, production: 0, gold: 0, legitimacy: 0 }
    if (this._hasPolicy('slavery')) { pct.production += 0.10; pct.progress -= 0.05 }
    if (this._hasPolicy('weights_and_measures')) pct.gold += 0.50
    if (this._hasPolicy('democracy')) pct.progress += 0.20 // +20% :progress: gain
    // v2 generic policy/bonus % modifiers: additive per-resource outputPct + totalGoldPct
    // (v1 policies above have no such fields, so no double-count).
    for (const def of this._activeEffectDefs()) {
      if (def.outputPct) for (const res of Object.keys(pct)) if (def.outputPct[res]) pct[res] += def.outputPct[res]
      if (def.totalGoldPct) pct.gold += def.totalGoldPct
    }
    for (const res of Object.keys(pct)) if (pct[res]) totals[res] *= 1 + pct[res]
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

  /** POLICY_DEFS of every active effect source — policies in slots + applied ✦ bonuses —
   *  so structured fields (outputPct/citizenOutput/legitPerEra/…) are read uniformly. */
  _activeEffectDefs() {
    const civ = this.data.civilization
    const out = []
    for (const p of civ.policies) { const d = p && POLICY_DEFS[p.key]; if (d) out.push(d) }
    for (const key of civ.bonuses ?? []) { const d = POLICY_DEFS[key]; if (d) out.push(d) }
    return out
  }

  /** Reduce legitimacy by `amount` (clamped at 0). Democracy doubles ALL losses.
   *  Returns the (post-Democracy) damage applied, for display. */
  _damageLegitimacy(amount) {
    if (amount <= 0) return 0
    const civ = this.data.civilization
    const dmg = amount * (this._hasPolicy('democracy') ? 2 : 1)
    civ.legitimacy.value = Math.max(0, civ.legitimacy.value - dmg)
    return dmg
  }

  _deployedBuildingCount() {
    let n = 0
    // Traps are combat-only — they don't count as economic buildings (Ownership gold).
    for (const { occ } of this._buildingInstances()) if (!occ.damaged && !(defOf(occ.key)?.trapTrigger || defOf(occ.key)?.combatOnly)) n++
    return n
  }

  /** Merchant Navy: +2 gold/tick per deployed (non-destroyed) naval unit. */
  _navalUnitGold() {
    if (!this._activeEffectDefs().some((d) => d.special === 'naval_gold_flat')) return 0
    let g = 0
    for (const tile of this.data.tableau.tiles.values()) {
      const u = tile.unit
      if (u && !u.damaged && UNIT_DEFS[u.key]?.types.includes('naval')) g += 2
    }
    return g
  }

  /** Columbian Exchange: +6 gold/tick per (non-destroyed) unit or building on a New-World tile. */
  _newWorldGold() {
    if (!this._activeEffectDefs().some((d) => d.special === 'new_world_gold')) return 0
    let g = 0
    for (const tile of this.data.tableau.tiles.values()) {
      if (tile.label !== 'New World') continue
      if (tile.unit && !tile.unit.damaged) g += 6
      if (tile.building && !tile.building.damaged) g += 6
    }
    return g
  }

  /** Total per-tick gold from all breweries (+1 per unit within each brewery's range). */
  _breweryGold() {
    let g = 0
    for (const { tile, occ } of this._buildingInstances()) {
      if (occ.key === 'brewery' && !occ.damaged) g += this._unitsInRange(tile.row, tile.col, BUILDING_DEFS.brewery.range(occ.level))
    }
    return g
  }

  /** Per-tick resource output from deployed buildings (Ranch food, Kiln production,
   *  Mine gold). Also stashes each building's current output on occ.tickOutput so the
   *  on-tile card can display it. */
  _buildingTickOutputs() {
    const civ = this.data.civilization
    const totals = { progress: 0, food: 0, production: 0, gold: 0, legitimacy: 0 }
    const parkMult = 1 + this._nationalParkBonus() // National Parks: global terrain-yield %
    for (const { tile, occ } of this._buildingInstances()) {
      if (occ.damaged) { occ.tickOutput = null; continue } // destroyed buildings produce nothing
      const def = defOf(occ.key)
      // Traps + wonders are combat-only — no per-tick output and no terrain/economy yield.
      if (def.trapTrigger || def.combatOnly) { occ.tickOutput = null; occ.terrainYield = null; continue }
      // Region free-upgrade-levels scale a building's per-tick OUTPUT too (not just its HP).
      const effLevel = occ.level + this._regionLevelBonus(tile, 'building')
      // Neocolonialism: buildings on Exoplanet terrain produce +150% :gold: (×2.5).
      const exoGold = tile.terrain?.startsWith('exo') && this._activeEffectDefs().some((d) => d.special === 'exoplanet_gold') ? 2.5 : 1
      // Maritime Law: +500% to the water-tile :gold: terrain bonus (×6 on coast/sea tiles).
      const waterGold = (tile.def?.place === 'sea' || tile.def?.place === 'coast') && this._activeEffectDefs().some((d) => d.special === 'water_gold_bonus') ? 6 : 1
      let out = null
      // v2 data-driven per-tick output (generic). v1 buildings without def.output fall
      // through to the key-specific cases below (Ranch growth, Kiln adjacency, etc.).
      if (def.output && def.output.when === 'tick' && totals[def.output.res] != null) {
        out = { res: def.output.res, amount: buildingTickAmount(def, effLevel) }
      }
      // v2 legit-leverage buildings (per-tick output scales with current legitimacy).
      else if (occ.key === 'monastery') out = { res: 'progress', amount: Math.floor(civ.legitimacy.value / 20) }
      else if (occ.key === 'elysium') out = { res: 'gold', amount: Math.floor(civ.legitimacy.value) }
      else if (occ.key === 'ranch') out = { res: 'food', amount: 5 + (occ.ranchBonus ?? 0) }
      else if (occ.key === 'kiln') out = { res: 'production', amount: 2 + def.perAdjacent(effLevel) * this._adjacentBuildingCount(tile.row, tile.col) }
      else if (occ.key === 'mine') out = { res: 'gold', amount: def.goldPerTick(effLevel) * (tile.terrain === 'mountain' ? 2 : 1) }
      else if (occ.key === 'mint') out = { res: 'gold', amount: def.legitPct(effLevel) * civ.legitimacy.value }
      // (v2: legitimacy has NO per-tick production — the Temple now grants legit on
      //  completion + end-of-era gold; see _createInstance / _applyEraEndEffects.)
      else if (occ.key === 'farm') out = { res: 'food', amount: 5 * this._plainsAround(tile) }
      else if (occ.key === 'forging') out = { res: 'production', amount: def.prodPerTick(effLevel) }
      else if (occ.key === 'aqueduct') out = { res: 'food', amount: def.base(effLevel) * Math.pow(2, this._adjacentAqueductCount(tile)) }
      else if (occ.key === 'glassworks') out = { res: 'production', amount: 10 }
      else if (occ.key === 'shinkansen') out = { res: 'gold', amount: 3 * this._adjacentBuildingCount(tile.row, tile.col) } // +3 gold per adjacent building
      else if (occ.key === 'lighthouse') out = { res: 'gold', amount: 8 * effLevel } // coastal gold beacon (v2)
      else if (occ.key === 'lumber_mill') out = { res: 'production', amount: Math.round(4 * (terrainEconYield(tile.terrain)?.amount ?? 0) * effLevel) }
      else if (occ.key === 'harbor') out = { res: 'production', amount: 6 * this._unitsInRange(tile.row, tile.col, (def.range ?? 1) + (occ.level - 1)) }
      else if (occ.key === 'museum') out = { res: 'progress', amount: 16 * this._lineTypeCount(tile) * occ.level }
      else if (occ.key === 'hacienda' && tile.label === 'New World') { // multi-output
        totals.food += 6 * occ.level; totals.production += 6 * occ.level // food + production added directly
        out = { res: 'gold', amount: 9 * occ.level } // gold via the normal out path (added once below)
      }
      // Artificial Meat: :food: buildings double output and produce :production: instead.
      if (out && out.res === 'food' && this._activeEffectDefs().some((d) => d.special === 'artificial_meat')) out = { res: 'production', amount: out.amount * 2 }
      // Neocolonialism: boost a building's own :gold: output on Exoplanet terrain.
      if (out && out.res === 'gold' && exoGold !== 1) out = { res: 'gold', amount: Math.round(out.amount * exoGold) }
      occ.tickOutput = out
      if (out) totals[out.res] += out.amount
      // v2: every building ALSO gains a flat per-tick base yield from its terrain
      // (Plains→food, Forest→progress, Mountain→production, sea/space→gold), optionally
      // multiplied by a terrain-doubler policy (Forestry/Granaries/Mountaineering/Ecology
      // ×2, Beltalowdas ×3 on asteroid).
      const ty = terrainEconYield(tile.terrain)
      if (ty && totals[ty.res] != null) {
        let tmult = 1
        for (const def of this._activeEffectDefs()) {
          if (def.terrainDouble && (def.terrainDouble === 'all' || def.terrainDouble === tile.terrain)) tmult *= (def.terrainDouble === 'asteroid' ? 3 : 2)
        }
        // Carbon Sink (naturalGrowth, land tiles) + National Park (parkMult) + Ecumenopolis
        // (planet tiles ×10) fold into the yield.
        const natural = tile.def?.place === 'land' ? civ.naturalGrowth : 0
        const planetMult = (tile.terrain === 'planet' && this._hasWonder('ecumenopolis')) ? 10 : 1
        const scaled = (ty.amount + natural) * tmult * parkMult * planetMult
        const amt = ty.res === 'gold' ? Math.round(scaled * exoGold * waterGold) : scaled
        totals[ty.res] += amt
        occ.terrainYield = { res: ty.res, amount: amt }
      } else occ.terrainYield = null
      if (civ.bonuses.includes('gas_light')) totals.production += 2 // Gas Light bonus: every building +2 :production:/t
    }
    return totals
  }

  /** Global terrain-yield multiplier bonus from all National Parks (+parkYieldPct × level each). */
  _nationalParkBonus() {
    let b = 0
    for (const { occ } of this._buildingInstances()) {
      if (occ.damaged) continue
      const d = defOf(occ.key)
      if (d?.special === 'stacks' && d.parkYieldPct) b += d.parkYieldPct * occ.level
    }
    return b
  }

  /** Distinct unit + building keys among all tiles sharing `tile`'s row or column (Museum). */
  _lineTypeCount(tile) {
    const keys = new Set()
    for (const t of this.data.tableau.tiles.values()) {
      if (t.row !== tile.row && t.col !== tile.col) continue
      if (t.unit && !t.unit.damaged) keys.add(t.unit.key)
      if (t.building && !t.building.damaged) keys.add(t.building.key)
    }
    return keys.size
  }

  /** Count of deployed (undamaged) units on the board (Arena / Colosseum). */
  _deployedUnitCount() {
    let n = 0
    for (const tile of this.data.tableau.tiles.values()) if (tile.unit && !tile.unit.damaged) n++
    return n
  }

  /** Count of Plains tiles among a Farm's own tile + its (road-augmented) neighbours. */
  _plainsAround(tile) {
    let n = tile.terrain === 'plains' ? 1 : 0
    for (const nb of this._adjacentTiles(tile.row, tile.col)) if (nb.terrain === 'plains') n++
    return n
  }

  /** Count of undamaged Aqueducts on tiles (road-augmented) adjacent to `tile` (incl. city extras). */
  _adjacentAqueductCount(tile) {
    let n = 0
    for (const nb of this._adjacentTiles(tile.row, tile.col)) {
      for (const occ of this._buildingsOn(nb)) if (occ.key === 'aqueduct' && !occ.damaged) n++
    }
    return n
  }

  /** Count of active ECONOMIC buildings on adjacent (road-augmented) tiles (incl. city
   *  extras). Combat-only traps are excluded (they don't feed Kiln adjacency etc.). */
  _adjacentBuildingCount(r, c) {
    let n = 0
    for (const tile of this._adjacentTiles(r, c)) {
      for (const occ of this._buildingsOn(tile)) if (!occ.damaged && !(defOf(occ.key)?.trapTrigger || defOf(occ.key)?.combatOnly)) n++
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
  _componentPortSets(isMember) {
    const t = this.data.tableau
    const NBRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const memberKeys = []
    for (const tile of t.tiles.values()) if (isMember(tile)) memberKeys.push(`${tile.row},${tile.col}`)
    if (memberKeys.length === 0) return []
    const memberSet = new Set(memberKeys)
    const seen = new Set()
    const nets = []
    for (const mk of memberKeys) {
      if (seen.has(mk)) continue
      const comp = []
      const stack = [mk]
      seen.add(mk)
      while (stack.length) {
        const cur = stack.pop()
        comp.push(cur)
        const [r, c] = cur.split(',').map(Number)
        for (const [dr, dc] of NBRS) {
          const nk = `${r + dr},${c + dc}`
          if (memberSet.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk) }
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

  /** Road networks as port sets — tiles carrying a Road underlay OR a linksAdjacency building
   *  (the Shinkansen rail line). */
  _roadPortSets() {
    return this._componentPortSets((tile) =>
      tile.underlap?.key === 'road' ||
      (tile.building && !tile.building.damaged && defOf(tile.building.key)?.linksAdjacency))
  }

  /** Bridge networks from active terrain-transparency policies: Combustion (ocean), Mass
   *  Drivers (space), FTL (deep space) each turn their terrain into one adjacency network;
   *  Reuseable Rocketry makes all Moon + Earth tiles one mutually-adjacent set. */
  _bridgePortSets() {
    const defs = this._activeEffectDefs()
    const nets = []
    if (defs.some((d) => d.special === 'bridge_ocean')) nets.push(...this._componentPortSets((t) => t.terrain === 'ocean'))
    if (defs.some((d) => d.special === 'bridge_space')) nets.push(...this._componentPortSets((t) => t.terrain === 'space'))
    if (defs.some((d) => d.special === 'bridge_deep_space')) nets.push(...this._componentPortSets((t) => t.terrain === 'deep_space'))
    if (defs.some((d) => d.special === 'moon_earth_adjacent')) {
      const set = new Set()
      for (const tile of this.data.tableau.tiles.values()) {
        if (tile.terrain === 'moon' || EARTH_TERRAINS.has(tile.terrain)) set.add(`${tile.row},${tile.col}`)
      }
      if (set.size) nets.push(set)
    }
    return nets
  }

  /** Memoized combined adjacency networks: road port sets + active bridge port sets.
   *  Invalidated (_netsCache = null) on road placement, era change, and bridge-bonus gain. */
  _portNets() {
    if (this._netsCache) return this._netsCache
    this._netsCache = [...this._roadPortSets(), ...this._bridgePortSets()]
    return this._netsCache
  }

  /** Map "r,c" -> step distance for every tile within `range` steps of (sr, sc), where
   *  a road network links all its ports at distance 1 (a "shortcut"). */
  _reachableWithin(sr, sc, range) {
    const t = this.data.tableau
    const NBRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const nets = this._portNets()
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
    for (const { tile, occ } of this._buildingInstances()) {
      if (occ.key === 'brewery' && !occ.damaged &&
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

  /** Aggregate Command-building auras affecting a unit at (row, col): additive :attack:%,
   *  flat :defense:, extra ranged range, and act-twice. Each command building's aura range is
   *  its base range widened +1 per upgrade level. */
  _commandAuras(row, col) {
    let atkPct = 0, def = 0, rangedRange = 0, actTwice = false
    for (const { tile, occ } of this._buildingInstances()) {
      if (occ.damaged) continue
      const d = defOf(occ.key)
      if (!d.special?.startsWith('command_')) continue
      const range = (d.range ?? 1) + (occ.level - 1) // upgrades widen the aura +1 range/level
      if (!this._reachableWithin(tile.row, tile.col, range).has(`${row},${col}`)) continue
      if (d.special === 'command_atk') atkPct += d.commandAtk ?? 0
      else if (d.special === 'command_def') def += d.commandDef ?? 0
      else if (d.special === 'command_range') rangedRange += d.commandRange ?? 0
      else if (d.special === 'command_act_twice') actTwice = true
    }
    return { atkPct, def, rangedRange, actTwice }
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

  /** Free upgrade levels an occupant of `kind` ('unit'|'building') on `tile` gains from
   *  region effects — active policies (Colonialism/Martian Freedom/Skyscrapers/Empire of
   *  the Stars/Hive Mind) AND completed wonders (Machu Picchu/Happy Valley/Great Mirror).
   *  Folded into the effective level passed to unitStats/buildingHp; occ.level is never
   *  mutated (display + upgrade cost keep reading the real level). */
  _regionLevelBonus(tile, kind) {
    let bonus = 0
    const add = (special, b) => {
      if (!b) return
      switch (special) {
        case 'new_world_levels': if (tile.label === 'New World') bonus += b; break // both kinds
        case 'mars_levels': if (tile.terrain === 'mars') bonus += b; break // both kinds
        case 'mountain_levels': if (tile.terrain === 'mountain') bonus += b; break // both kinds (Machu Picchu)
        case 'terrestrial_levels': if (tile.def?.place === 'land') bonus += b; break // both kinds (Great Mirror)
        case 'city_levels': if (kind === 'building' && tile.city) bonus += b; break
        case 'space_levels': if (kind === 'building' && tile.def?.place === 'space') bonus += b; break
        case 'hive_mind_levels': if (kind === 'building') {
          let n = 0
          for (const nb of this._adjacentTiles(tile.row, tile.col)) for (const o of this._buildingsOn(nb)) if (!o.damaged) n++
          bonus += b * n // +b per adjacent (road-augmented, undamaged) building
        } break
      }
    }
    for (const def of this._activeEffectDefs()) add(def.special, def.levelBonus ?? 0)
    for (const key of this.data.civilization.completedWonders) { const w = WONDER_DEFS[key]; if (w?.levelBonus) add(w.special, w.levelBonus) }
    // Power buildings (Windmill/Coal/Nuclear/Fusion): +N free upgrade levels to units AND
    // buildings within range (range widens +1 per upgrade level).
    for (const { tile: pt, occ } of this._buildingInstances()) {
      const d = defOf(occ.key)
      if (occ.damaged || d?.special !== 'power' || !d.powerLevels) continue
      const range = (d.range ?? 1) + (occ.level - 1)
      if (this._reachableWithin(pt.row, pt.col, range).has(`${tile.row},${tile.col}`)) bonus += d.powerLevels
    }
    return bonus
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
    // v2 building def bonus from active POLICIES (Reinforced Construction +2). Bonus techs
    // (Cement/Occlusion) already fold into civ.modifiers.buildingHpBonus via _applyModifier,
    // so summing only policies here avoids double-counting.
    let policyBuildingDef = 0
    for (const p of civ.policies) { const d = p && POLICY_DEFS[p.key]; if (d?.buildingDefBonus) policyBuildingDef += d.buildingDefBonus }
    // Special combat modifiers read once: Defensive Pact (+1 :defense: to mercenaries),
    // Lunar Defense Stratagem (+100% :attack: to units on Moon terrain).
    let mercDef = 0, moonAtk = false
    for (const def of this._activeEffectDefs()) {
      if (def.special === 'merc_def_bonus') mercDef += 1
      if (def.special === 'moon_atk') moonAtk = true
    }
    for (const tile of this.data.tableau.tiles.values()) {
      // City extras are economic-only (never fight, never take terrain/combat bonuses), but
      // refresh their maxHp so buildingHpBonus growth (Concrete/Hereditary) shows on the strip.
      if (tile.extras) for (const ex of tile.extras) {
        const nm = Math.max(1, buildingHp(defOf(ex.key), ex.level, civ.modifiers.buildingHpBonus))
        const wasFull = ex.hp == null || ex.maxHp == null || ex.hp >= ex.maxHp
        ex.maxHp = nm
        if (!ex.damaged) ex.hp = wasFull ? nm : Math.min(nm, ex.hp)
      }
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
        // v2 additive damage %: unit-wide atk% bonuses (Steel/Composites/Liminite/Antimatter)
        // + a matching category doctrine (+50% to its role, e.g. Compound Bow → ranged). These
        // stack ADDITIVELY (SCALING §3), then multiply the base attack.
        const role = unitRole(UNIT_DEFS[occ.key])
        let dmgBonus = 0
        for (const def of this._activeEffectDefs()) {
          if (def.unitAtkPct) dmgBonus += def.unitAtkPct
          if (def.doctrine && def.doctrine.role === role) dmgBonus += def.doctrine.pct
        }
        // Fascism: a desperation doctrine — +100% :attack: while legitimacy is below 50.
        if (this._hasPolicy('fascism') && civ.legitimacy.value < 50) dmgBonus += 1.0
        // Lunar Defense Stratagem: units standing on Moon terrain deal +100% :attack:.
        if (moonAtk && tile.terrain === 'moon') dmgBonus += 1.0
        // Flat attack from special effects: Bayonets (+5 :melee:), Gunboat Diplomacy (+15 :naval:).
        // Read via _activeEffectDefs so both policies and bonus-techs (civ.bonuses) count.
        const uTypes = UNIT_DEFS[occ.key].types
        let flatAtk = civ.modifiers.unitAtkFlat ?? 0 // Eugenics: permanent +2/era to all units
        for (const def of this._activeEffectDefs()) {
          if (def.special === 'melee_flat_atk' && uTypes.includes('melee')) flatAtk += 5
          if (def.special === 'gunboat_flat_atk' && uTypes.includes('naval')) flatAtk += 15
        }
        // occ.permDef / occ.permAtk = permanent :defense: (Baker) / :attack: (Public Baths)
        // granted mid-combat; both persist across combats.
        const mercBonus = occ.mercenary ? mercDef : 0 // Defensive Pact: mercenaries +1 :defense:
        // Command-building auras: +atk% (into dmgBonus), flat +def, extra ranged range / act-twice.
        const cmd = this._commandAuras(tile.row, tile.col)
        dmgBonus += cmd.atkPct
        // Skynet wonder: military (non-utility) units +75% :attack:; the Terminator line +150%.
        if (this._hasWonder('skynet') && role !== 'utility') dmgBonus += occ.key.includes('terminator') ? 1.5 : 0.75
        occ.cmdRange = cmd.rangedRange // read by _pieceRange (ranged units only)
        occ.cmdActTwice = cmd.actTwice // read by _playerPhase
        // Region free-upgrade-levels (Colonialism/Martian Freedom/… + wonders): inflate the
        // level used for stats WITHOUT touching occ.level (display/upgrade-cost keep the real one).
        const effLevel = occ.level + this._regionLevelBonus(tile, 'unit')
        const s = unitStats(UNIT_DEFS[occ.key], effLevel, hpBonus + wb + terrainDef + (occ.permDef ?? 0) + mercBonus + cmd.def, wb + pack + (occ.permAtk ?? 0) + flatAtk)
        const wasFull = occ.hp == null || occ.maxHp == null || occ.hp >= occ.maxHp
        const posMult = (brew ? 1.1 : 1) * brothel.atkMult * (1 + dmgBonus) // Brewery × Brothel × v2 damage %
        occ.warband = wb
        occ.packAtk = pack
        occ.terrainDef = terrainDef
        occ.inBrewery = brew
        occ.dmgBonus = dmgBonus // v2 additive damage % (doctrine + atk-% policies/bonuses)
        occ.cdReduce = brothel.cd
        occ.atkMult = posMult // stored for the upgrade preview (level-independent part)
        occ.casteActive = this._hasPolicy('caste_system')
        occ.atk = Math.round(s.atk * posMult * caste)
        occ.maxHp = Math.max(1, Math.round(s.def * (brew ? 0.9 : 1)))
        if (!occ.damaged) occ.hp = wasFull ? occ.maxHp : Math.min(occ.maxHp, occ.hp)
      } else if (occ.kind === 'building' && !defOf(occ.key)?.underlap) {
        if (!this._isAnchor(tile, occ)) continue // multi-tile building: computed once, at its anchor
        const effLevel = occ.level + this._regionLevelBonus(tile, 'building') // region free-upgrade-levels
        const newMax = buildingHp(defOf(occ.key), effLevel, civ.modifiers.buildingHpBonus) + terrainDef + policyBuildingDef
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
    const mult = type === 'food' ? m.foodThresholdMult : type === 'progress' ? m.progressThresholdMult : type === 'production' ? (m.productionThresholdMult ?? 1) : 1
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
    // Pop-gain modifiers (read from active policies + bonuses): Inoculation +3 pops,
    // Biological Immortality ×2 (both routed through the growth split), Semaglutides
    // +3 flat Citizens on top. Computed order-independently.
    let add = 0, mult = 1, extraCitizens = 0
    for (const def of this._activeEffectDefs()) {
      if (def.special === 'extra_pop_gains') add += 3
      else if (def.special === 'double_pop_gains') mult *= 2
      else if (def.special === 'extra_citizen_gains') extraCitizens += 3
    }
    if (this._hasWonder('hanging_gardens')) add += 1 // Hanging Gardens: +1 more pop per gain
    n = (n + add) * mult
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
    if (extraCitizens) civ.pops.citizen = (civ.pops.citizen ?? 0) + extraCitizens
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
    // Production-builds open the normal build selection, which ALSO offers the in-flight
    // wonder as a pickable structure — the player chooses when to spend a build on it (place
    // it, then advance it toward completion). No more auto-consuming builds behind the scenes.
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
      // One wonder in flight at a time: don't offer another while one is unlocked-but-unfinished.
      .filter((a) => !(civ.wonder && IMPLEMENTED[a.name]?.kind === 'wonder'))
    const impl = avail.filter((a) => isImplemented(a.name))
    const unimpl = avail.filter((a) => !isImplemented(a.name))
    const weight = (a) => Math.pow(2, a.eraIndex)
    // Game Theory: +1 advancement option per progress pick.
    let count = 3
    for (const def of this._activeEffectDefs()) if (def.special === 'extra_advancement_option') count += 1
    const picks = weightedSample(impl, weight, count)
    if (picks.length < count) picks.push(...weightedSample(unimpl, weight, count - picks.length))
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
      case 'wonder': return '/sprites/ui/wonder.png'
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
    if (opt.unlock.kind === 'wonder') {
      this._unlockWonder(opt.unlock)
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

  /** Discard the current advancement options and draw a fresh set, spending one free
   *  reroll. No-op unless we're in the progress 'choose' stage with rerolls available.
   *  Rerolled options are NOT marked chosen, so any of them may re-appear in the draw. */
  rerollAdvancement() {
    const sel = this.data.selection
    if (!sel || sel.type !== 'progress' || sel.stage !== 'choose') return
    if (this.data.civilization.freeRerolls <= 0) return
    this.data.civilization.freeRerolls -= 1
    sel.options = this._pickProgressOptions()
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

  /** Apply a bonus/modifier's immediate/permanent effect. v2 bonuses are POLICY_DEFS
   *  entries (slot:false) with structured fields; unhandled fields (combat modifiers,
   *  special-tagged effects) simply no-op here and are wired in later passes. */
  _applyModifier(unlock) {
    const civ = this.data.civilization
    const def = POLICY_DEFS[unlock.key]
    if (!def) return
    // Track the bonus so its ongoing structured effects are read by _activeEffectDefs
    // (one-time fields below are applied once here and never re-read).
    const isNew = !civ.bonuses.includes(unlock.key)
    if (isNew) civ.bonuses.push(unlock.key)
    // Policy-slot expansion (Socialism +3, Technocracy +1, Omnicracy +1): grow the
    // policy roster so more policies can be equipped. Guarded so it can't double-add.
    if (def.policySlots && isNew) for (let k = 0; k < def.policySlots; k++) civ.policies.push(null)
    // Adjacency-bridge bonuses (Combustion/Mass Drivers/FTL/Reuseable Rocketry) change the
    // port-net graph → drop the memo so the bridge takes effect immediately.
    this._netsCache = null
    if (def.thresholdMult) {
      const { res, mult } = def.thresholdMult
      if (res === 'food') civ.modifiers.foodThresholdMult *= mult
      else if (res === 'progress') civ.modifiers.progressThresholdMult *= mult
      else if (res === 'production') civ.modifiers.productionThresholdMult *= mult
    }
    if (def.instantBuilds) this.data.pendingProduction += def.instantBuilds
    if (def.unitDefBonus) { civ.modifiers.unitHpBonus += def.unitDefBonus; this._syncUnitStats() }
    if (def.buildingDefBonus) { civ.modifiers.buildingHpBonus += def.buildingDefBonus; this._syncUnitStats() }
    if (def.ticksPerEra) civ.modifiers.bonusTicks = (civ.modifiers.bonusTicks ?? 0) + def.ticksPerEra
    if (def.special === 'pop_on_unlock') civ.pops.citizen = (civ.pops.citizen ?? 0) + 20 // Genome Mapping
    // Not yet applied here (later passes): unitAtkPct, rangedReach,
    // mercLevels, freeRerolls, terrainDouble, and every `special`-tagged effect.
  }

  // ---------------------------------------------------------------------------
  // Wonders. Unlocking one puts it in the wonder slot (placed:false). The player then picks
  // it in a production selection like any building: the FIRST pick PLACES an incomplete
  // structure on the board; each LATER pick advances it; the final pick completes it and its
  // effect turns on. A destroyed structure keeps its progress but must be repaired (3× gold)
  // before it can advance. Only one wonder in flight at a time (gated in _pickProgressOptions).
  // ---------------------------------------------------------------------------
  _unlockWonder(unlock) {
    let reduce = 0
    for (const def of this._activeEffectDefs()) if (def.wonderCostReduce) reduce += def.wonderCostReduce
    this.data.civilization.wonder = { key: unlock.key, buildsLeft: Math.max(1, WONDER_BUILDS - reduce), placed: false, inst: null }
  }

  /** Player picked the in-flight wonder during a production selection. The FIRST pick routes to
   *  placement (place the incomplete structure); LATER picks advance the placed structure. */
  pickWonder() {
    const sel = this.data.selection
    if (!sel || sel.type !== 'production' || sel.stage !== 'pick') return
    const w = this.data.civilization.wonder
    if (!w) return
    if (!w.placed) {
      sel.chosen = { kind: 'building', key: w.key, level: 1, wonder: true }
      sel.stage = 'place'
      this._emit()
      return
    }
    this.advanceWonderProgress()
  }

  /** True when the placed wonder can currently be advanced (in flight, on the board, not
   *  destroyed). A destroyed structure must be repaired before progress may continue. */
  canAdvanceWonder() {
    const w = this.data.civilization.wonder
    return !!(w && w.placed && w.inst && !w.inst.damaged)
  }

  /** Spend the current production-build advancing the placed wonder toward completion. */
  advanceWonderProgress() {
    const sel = this.data.selection
    const w = this.data.civilization.wonder
    if (!this.canAdvanceWonder()) return
    w.buildsLeft = Math.max(0, w.buildsLeft - 1)
    w.inst.buildsLeft = w.buildsLeft
    if (w.buildsLeft <= 0) this._completeWonder()
    if (sel && sel.type === 'production') this._resolveProduction()
    else this._emit()
  }

  /** The wonder's Nth build finished it: record completion, mark the on-board structure
   *  complete, and fire any on-completion effect. Ongoing effects are read via _hasWonder(). */
  _completeWonder() {
    const civ = this.data.civilization
    const w = civ.wonder
    const key = w?.key
    if (!key) return
    civ.completedWonders.push(key)
    if (w.inst) { w.inst.complete = true; delete w.inst.buildsLeft }
    civ.wonder = null
    // Immediate (on-completion) effects; ongoing effects are read via _hasWonder().
    if (key === 'hagia_sophia') civ.legitimacy.value *= (1 + this._wonderYieldMult()) // +100% legit (×2), boosted by wonder-yield policies
    // Statue of Liberty: production thresholds grow 20% slower (build more freely).
    if (key === 'statue_of_liberty') civ.modifiers.productionThresholdMult = (civ.modifiers.productionThresholdMult ?? 1) * 0.8
    this._recomputeOutputs()
    this._syncUnitStats()
  }

  /** True once a wonder is completed (its ongoing effect is active). */
  _hasWonder(key) { return this.data.civilization.completedWonders.includes(key) }

  /** Best (max) finished-wonder yield multiplier from active policies (Pilgrimage ×1.5,
   *  Tourism ×2, Star Hopping ×3); default 1 when none active. Scales wonder numeric yields. */
  _wonderYieldMult() {
    let m = 1
    for (const def of this._activeEffectDefs()) if (def.wonderYieldMult != null) m = Math.max(m, def.wonderYieldMult)
    return m
  }

  /** True when the P=NP bonus is active (combat prep shows projected :legitimacy: loss). */
  hasProjectedLegit() { return this._activeEffectDefs().some((d) => d.special === 'projected_legit') }

  /** Estimated :legitimacy: the player would lose if combat started now: each undamaged
   *  enemy in a column with no undamaged friendly blocker breaches for round(atk × Firewall)
   *  × Democracy. Mirrors the real breach rule (_enemyAct → _damageLegitimacy). Read-only;
   *  returns null when P=NP is inactive so the UI can hide the readout. */
  projectedLegitLoss() {
    if (!this.hasProjectedLegit()) return null
    const era = this.data.era
    if (!this.data.tableau.visibleBounds(era)) return 0
    const blocked = new Set()
    for (const tile of this.data.tableau.visibleTiles(era)) {
      const u = tile.unit, b = tile.building
      // A walkover trap (Caltrops/Sea Mine) never blocks — enemies march over it (mirror _enemyAct).
      const blocks = (u && !u.damaged) ||
        (b && !b.damaged && !['cross', 'first'].includes(defOf(b.key)?.trapTrigger))
      if (blocks) blocked.add(tile.col)
    }
    const fw = this._hasPolicy('firewall') ? 0.75 : 1
    const dem = this._hasPolicy('democracy') ? 2 : 1
    let loss = 0
    for (const e of (this.data.enemies || [])) {
      if (e.damaged || e.breached || blocked.has(e.col)) continue
      loss += Math.round(e.atk * fw) * dem
    }
    return loss
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
        // Slot count is dynamic — grown by Socialism/Technocracy/Omnicracy (base 5).
        return { group: 'policies', multiFill: false, slotIndices: this.data.civilization.policies.map((_, i) => i) }
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
    else if (group === 'policies') { civ.policies[i] = { key: unlock.key }; this._grantPolicyUnlock(unlock.key); this._syncUnitStats() }
    else if (group === 'population') this._unlockSpecialist(i, unlock.key)
    this._markFilled(group, i)
  }

  /** Apply a policy's on-unlock one-time grants (currently: free advancement rerolls). */
  _grantPolicyUnlock(key) {
    const def = POLICY_DEFS[key]
    if (def?.freeRerolls) this.data.civilization.freeRerolls += def.freeRerolls
  }

  _replaceSlot(group, i, unlock) {
    const civ = this.data.civilization
    if (group === 'population') { this._replaceSpecialist(i, unlock.key); this._markFilled(group, i); return }
    if (group === 'units') civ.units[i] = { key: unlock.key, level: 1 }
    else if (group === 'buildings') civ.buildings[i] = { key: unlock.key, level: 1 }
    else if (group === 'policies') { civ.policies[i] = { key: unlock.key }; this._grantPolicyUnlock(unlock.key); this._syncUnitStats() }
    this._markFilled(group, i)
  }

  _unlockSpecialist(slotIndex, key) {
    const civ = this.data.civilization
    civ.population[slotIndex] = key
    if (civ.pops[key] === undefined) civ.pops[key] = 0
    if (key === 'poet') civ.poetBonus = 0 // fresh Poets start at base +1 (bonus grows per era hereafter)
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
    if (key === 'poet') civ.poetBonus = 0 // fresh Poet baseline, same as _unlockSpecialist (replace path)
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
    // Wonders never replace — they require empty cells, so a valid wonder tile always reads green.
    if (sel.chosen.wonder) return 'valid'
    const def = defOf(sel.chosen.key)
    // Underlaid buildings (Road / City) coexist with the occupant → always a plain placement.
    if (sel.chosen.kind === 'building' && (def?.underlap || def?.underlaidCity)) return 'valid'
    // On a city tile, buildings ADD (into extra slots) and never replace, so they read green.
    if (tile.city && sel.chosen.kind === 'building') return 'valid'
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

  /** Footprint cells for a building def anchored at (row, col): the anchor plus the tiles
   *  extending right (columns) and up (rows). Single-tile buildings return just the anchor. */
  _footprintCells(def, row, col) {
    const [w, h] = def?.footprint ?? [1, 1]
    const cells = []
    for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) cells.push({ r: row + dr, c: col + dc })
    return cells
  }

  /** True if `occ` spans more than one tile. */
  _isMultiTile(def) { const fp = def?.footprint; return !!fp && (fp[0] > 1 || fp[1] > 1) }

  /** True if `tile` is `occ`'s anchor tile (or occ is single-tile). */
  _isAnchor(tile, occ) {
    if (!occ?.anchor) return true
    return occ.anchor.row === tile.row && occ.anchor.col === tile.col
  }

  /** Whether `chosen`'s terrain rule permits this tile. Wonders use the richer wonder
   *  placement vocabulary (specific-terrain requirements); plain pieces use canPlaceOn
   *  plus the Marine-Construction/Gravboots land-on-water policy exception. */
  _terrainAllows(chosen, def, tile) {
    if (chosen.wonder) return canPlaceWonder(def.placement, tile.terrain)
    return canPlaceOn(def.placement, tile.terrain) || this._buildAllowedByPolicy(chosen, def, tile)
  }

  /** Every footprint cell exists, is unlocked, has valid terrain, and is fully empty. */
  _footprintValid(chosen, def, anchor) {
    for (const { r, c } of this._footprintCells(def, anchor.row, anchor.col)) {
      const tile = this.data.tableau.tileAt(r, c)
      if (!tile || !this.data.tableau.isUnlocked(r, c, this.data.era)) return false
      if (!this._terrainAllows(chosen, def, tile)) return false
      if (tile.unit || tile.building || tile.city) return false // a multi-tile structure needs empty cells
    }
    return true
  }

  _canPlaceHere(chosen, tile) {
    const cdef = chosen.kind === 'unit' ? UNIT_DEFS[chosen.key] : defOf(chosen.key)
    // Multi-tile buildings (Shinkansen) and multi-tile wonders: validate the whole footprint.
    if (chosen.kind === 'building' && this._isMultiTile(cdef)) return this._footprintValid(chosen, cdef, tile)
    if (!this.data.tableau.isUnlocked(tile.row, tile.col, this.data.era)) return false
    const def = cdef
    if (!this._terrainAllows(chosen, def, tile)) return false
    // Wonders (single-tile) need an empty building slot — they never replace, never stack in a city.
    if (chosen.wonder) return !tile.building && !tile.city
    // Underlaid buildings coexist with the occupant but can't stack (one per slot).
    if (chosen.kind === 'building' && def.underlap) return !tile.underlap
    if (chosen.kind === 'building' && def.underlaidCity) return !tile.city
    if (tile.city) {
      // City buildings can't be replaced; extra buildings stack into free extra slots.
      if (chosen.kind === 'building') return !tile.occupant || this._cityRoom(tile) > 0
      // A unit can occupy only an empty primary slot or replace a unit — never a city building.
      return !tile.occupant || tile.occupant.kind === 'unit'
    }
    return true
  }

  /** Marine Construction / Gravboots: a plain LAND building (placement 'land', no other
   *  terrain requirement) may also be built on water / Asteroid terrain. */
  _buildAllowedByPolicy(chosen, def, tile) {
    if (chosen.kind !== 'building' || def.placement !== 'land') return false
    const place = tile.def?.place
    if ((place === 'sea' || place === 'coast') && this._activeEffectDefs().some((d) => d.special === 'build_on_water')) return true
    if (tile.terrain === 'asteroid' && this._activeEffectDefs().some((d) => d.special === 'build_on_asteroid')) return true
    return false
  }

  /** Free extra-building slots remaining on a city tile (0 on a non-city tile). */
  _cityRoom(tile) {
    if (!tile.city) return 0
    return BUILDING_DEFS.city.extraCap - (tile.extras?.length ?? 0)
  }

  /** All building instances physically on a tile: the occupant (if a building) + city extras.
   *  A multi-tile building is counted ONLY at its anchor cell (covered cells share the instance). */
  _buildingsOn(tile) {
    const out = []
    const occ = tile.occupant
    if (occ?.kind === 'building' && this._isAnchor(tile, occ)) out.push(occ)
    if (tile.extras) for (const e of tile.extras) out.push(e)
    return out
  }

  /** Every deployed building instance across the board, with its tile: [{ tile, occ }]. */
  _buildingInstances() {
    const out = []
    for (const tile of this.data.tableau.tiles.values()) {
      for (const occ of this._buildingsOn(tile)) out.push({ tile, occ })
    }
    return out
  }

  /** Build a fresh unit/building instance object (not yet placed). */
  _makeInstance(chosen) {
    const civ = this.data.civilization
    if (chosen.kind === 'unit') {
      const hp = unitStats(UNIT_DEFS[chosen.key], chosen.level, civ.modifiers.unitHpBonus).def
      return { kind: 'unit', key: chosen.key, level: chosen.level, hp, maxHp: hp, damaged: false }
    }
    const hp = buildingHp(defOf(chosen.key), chosen.level, civ.modifiers.buildingHpBonus)
    const inst = { kind: 'building', key: chosen.key, level: chosen.level, hp, maxHp: hp, damaged: false, lifetimeOutput: 0 }
    if (chosen.key === 'cave_painting') inst.storedProgress = BUILDING_DEFS.cave_painting.storedBase
    if (chosen.key === 'ranch') { inst.ranchBonus = 0; inst.ranchStep = 2 }
    return inst
  }

  _createInstance(chosen, tile) {
    const civ = this.data.civilization
    const bdef = chosen.kind === 'building' ? defOf(chosen.key) : null
    // Road: an underlapping utility in the tile's own underlap slot (adjacency only).
    if (bdef?.underlap) {
      tile.underlap = { kind: 'building', key: chosen.key, level: chosen.level }
      this._netsCache = null // road topology changed → drop the memoized port sets
      this._recomputeOutputs() // roads change brewery/kiln ranges
      this._syncUnitStats()    // and brewery-aura membership
      return
    }
    // City: an underlaid support in its own slot that grants extra building capacity.
    if (bdef?.underlaidCity) {
      tile.city = { kind: 'building', key: chosen.key, level: chosen.level }
      if (!tile.extras) tile.extras = []
      this._recomputeOutputs()
      this._syncUnitStats()
      return
    }
    // On a city tile whose primary slot is taken, a building stacks into an EXTRA slot
    // (additive — city buildings never replace). Otherwise it fills the primary slot.
    const toExtra = chosen.kind === 'building' && tile.city && !!tile.occupant
    // Overbuilding a Cave Painting (replacing the occupant) cashes in its stored progress.
    const prev = toExtra ? null : tile.occupant
    if (prev && prev.key === 'cave_painting') {
      civ.progress.value += prev.storedProgress ?? BUILDING_DEFS.cave_painting.storedBase
      this._processThresholds('progress', civ.progress) // may queue advancement choices
    }
    const inst = this._makeInstance(chosen)
    // Military / Architectural Tradition: overbuilding a unit/building keeps the replaced
    // piece's (higher) upgrade level — the invested upgrades carry over to the new piece.
    if (prev && prev.kind === chosen.kind && (prev.level ?? 1) > inst.level) {
      const keep = chosen.kind === 'unit'
        ? this._activeEffectDefs().some((d) => d.special === 'keep_upgrade_levels_unit')
        : this._activeEffectDefs().some((d) => d.special === 'keep_upgrade_levels_building')
      if (keep) {
        inst.level = prev.level
        const nm = chosen.kind === 'unit'
          ? unitStats(UNIT_DEFS[chosen.key], inst.level, civ.modifiers.unitHpBonus).def
          : Math.max(1, buildingHp(defOf(chosen.key), inst.level, civ.modifiers.buildingHpBonus))
        inst.hp = nm; inst.maxHp = nm
      }
    }
    if (toExtra) (tile.extras ??= []).push(inst)
    else tile.occupant = inst
    // Multi-tile footprint: stamp the SAME instance onto every covered cell so occupancy,
    // combat blocking and shared HP all work; _buildingsOn/_syncUnitStats process the anchor only.
    if (bdef && this._isMultiTile(bdef)) {
      inst.anchor = { row: tile.row, col: tile.col }
      inst.footprint = bdef.footprint
      for (const { r, c } of this._footprintCells(bdef, tile.row, tile.col)) {
        if (r === tile.row && c === tile.col) continue
        const t = this.data.tableau.tileAt(r, c)
        if (t) t.building = inst
      }
      if (bdef.linksAdjacency) this._netsCache = null // Shinkansen rail links the adjacency network
    }
    // Wonder: the placed structure starts INCOMPLETE. Placing it IS the first build; later
    // production picks (advanceWonderProgress) finish it. Its effect only turns on at completion.
    if (chosen.wonder) {
      inst.wonder = true
      inst.complete = false
      const w = civ.wonder
      if (w) {
        w.placed = true
        w.inst = inst
        w.buildsLeft = Math.max(0, (w.buildsLeft ?? WONDER_BUILDS) - 1)
        inst.buildsLeft = w.buildsLeft
        if (w.buildsLeft <= 0) this._completeWonder()
      }
    }
    // Alphabet: building a :progress: building upgrades it once for free (on creation).
    if (chosen.kind === 'building' && bdef.types.includes('progress') && !bdef.noUpgrade &&
        this._activeEffectDefs().some((d) => d.special === 'free_progress_upgrade')) {
      inst.level += 1
      inst.maxHp = Math.max(1, buildingHp(bdef, inst.level, civ.modifiers.buildingHpBonus))
      inst.hp = inst.maxHp
    }
    this._syncUnitStats() // board changed → refresh Warband bonuses
    this._recomputeOutputs() // …and per-tick building outputs (Ranch/Kiln/Mine/Brewery)
    if (chosen.kind === 'building') {
      // v2: a legitimacy building grants a flat legit bonus on completion (Shrine +10,
      // Monastery +30, Cathedral +40, Elysium +50).
      if (bdef.legitOnComplete) civ.legitimacy.value += bdef.legitOnComplete
      // Glassworks: completing any building grants legitimacy per OTHER deployed Glassworks.
      let legit = 0
      for (const { occ: g } of this._buildingInstances()) {
        if (g.key === 'glassworks' && !g.damaged && g !== inst) legit += BUILDING_DEFS.glassworks.legitOnBuild(g.level)
      }
      if (legit > 0) civ.legitimacy.value += legit
      // Convert-tile support (Artificial Island / Asteroid Foundry / Artificial Planet):
      // permanently transform a random visible source-terrain tile into the target terrain.
      if (bdef.special === 'convert_tile' && bdef.convertFrom && bdef.convertTo) {
        const cands = this.data.tableau.visibleTiles(this.data.era).filter((t) => t.terrain === bdef.convertFrom)
        if (cands.length) {
          cands[Math.floor(Math.random() * cands.length)].terrain = bdef.convertTo
          this._netsCache = null // terrain changed → drop the bridge/adjacency memo
        }
      }
    }
    // Midwivery: creating a unit yields production equal to its (effective) defense.
    // In development, so crossing a production threshold opens a build (may chain).
    if (chosen.kind === 'unit' && this._hasPolicy('midwivery')) {
      civ.production.value += inst.maxHp ?? 0
      this._processThresholds('production', civ.production)
    }
    // Galactic Legion (any tile) / Space Station wonder (space tiles only): producing a unit
    // copies it onto a random adjacent empty valid tile. Place the copy directly (NOT via
    // _createInstance) so it doesn't recurse endlessly.
    const legion = this._activeEffectDefs().some((d) => d.special === 'copy_unit_on_build')
    const spaceCopy = this._hasWonder('space_station') && tile.def?.place === 'space'
    if (chosen.kind === 'unit' && (legion || spaceCopy)) {
      const udef = UNIT_DEFS[chosen.key]
      const spots = this._adjacentTiles(tile.row, tile.col).filter((t) => !t.occupant && canPlaceOn(udef.placement, t.terrain))
      if (spots.length) {
        spots[Math.floor(Math.random() * spots.length)].occupant = this._makeInstance({ kind: 'unit', key: chosen.key, level: chosen.level })
        this._syncUnitStats()
      }
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
    for (const { occ } of this._buildingInstances()) {
      if (!occ.damaged && occ.tickOutput) occ.lifetimeOutput = (occ.lifetimeOutput ?? 0) + occ.tickOutput.amount
    }
  }

  /** End-of-era (`per:'era'`) economic output from deployed buildings (into resources +
   *  lifetime). Food crossings add pops immediately; :progress: is banked (its choices
   *  open in next era's development, like Burial Rites/Oral Tradition). */
  _accrueBuildingOutputs() {
    const civ = this.data.civilization
    let addedFood = 0
    for (const { tile, occ } of this._buildingInstances()) {
      if (occ.damaged) continue
      for (const o of buildingOutputs(defOf(occ.key), occ.level, this.data.era)) {
        if (!civ[o.res]) continue
        civ[o.res].value += o.amount // Pier food, Library progress, …
        occ.lifetimeOutput = (occ.lifetimeOutput ?? 0) + o.amount
        if (o.res === 'food') addedFood += o.amount
      }
      // Runtime end-of-era outputs: Observatory (progress from terrain), Arena (gold per unit),
      // Bank (interest on unspent gold).
      let extra = 0, res = null
      if (occ.key === 'observatory') { res = 'progress'; extra = Math.round(10 * (terrainEconYield(tile.terrain)?.amount ?? 0) * occ.level) }
      else if (occ.key === 'arena') { res = 'gold'; extra = 8 * this._deployedUnitCount() * occ.level }
      else if (occ.key === 'bank') { res = 'gold'; extra = Math.floor(civ.gold.value * 0.05 * occ.level) }
      if (res && extra > 0) { civ[res].value += extra; occ.lifetimeOutput = (occ.lifetimeOutput ?? 0) + extra }
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

  /** Repair cost for a damaged occupant: Code of Laws (−75%, both) × the best matching v2
   *  repair reducer (Blueprints/Rapid Reconstruction for buildings; Levee en Masse/Cortical
   *  Stacks for units). */
  repairCostFor(occ) {
    let mult = this._hasPolicy('code_of_laws') ? 0.25 : 1
    const want = occ.kind === 'building' ? 'building_repair' : 'unit_repair'
    for (const def of this._activeEffectDefs()) if (def.repairMult != null && def.special === want) mult = Math.min(mult, def.repairMult)
    return Math.round(repairCost(occ, this.data.era) * mult)
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
    const def = occ.kind === 'unit' ? UNIT_DEFS[occ.key] : defOf(occ.key)
    if (def?.noUpgrade) return // Cave Painting / wonders can't be gold-upgraded
    // Upgrade-cost reducers: the best policy discount (Modernization ×0.7 / Futurization ×0.4,
    // supersede) × The Pyramids wonder (×0.75, stacks).
    let mult = 1
    for (const d of this._activeEffectDefs()) if (d.upgradeMult != null) mult = Math.min(mult, d.upgradeMult)
    if (this._hasWonder('the_pyramids')) mult *= 0.75
    const cost = Math.round(upgradeCost(occ, this.data.era) * mult)
    const civ = this.data.civilization
    if (civ.gold.value < cost) return
    civ.gold.value -= cost
    // Entropic Reversal: each gold upgrade advances a unit by 2 levels instead of 1.
    const step = (occ.kind === 'unit' && this._activeEffectDefs().some((d) => d.special === 'double_upgrade_levels_unit')) ? 2 : 1
    occ.level += step
    const oldMax = occ.maxHp
    const newMax = occ.kind === 'unit'
      ? unitStats(UNIT_DEFS[occ.key], occ.level, civ.modifiers.unitHpBonus).def
      : buildingHp(defOf(occ.key), occ.level, civ.modifiers.buildingHpBonus)
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

  /** Info for upgrading a specialist type UP ITS CHAIN (Astrologer → Scholar → …) for gold:
   *  a one-way conversion of every pop of that type to the next tier. Null if not upgradeable
   *  (no next tier, not an unlocked slot, or zero pops). Cost = round(15·1.18^E) per pop. */
  specialistUpgradeInfo(popKey) {
    const def = POP_TYPES[popKey]
    if (!def?.next || !POP_TYPES[def.next]) return null
    const civ = this.data.civilization
    const slotIndex = civ.population.indexOf(popKey)
    const count = civ.pops[popKey] ?? 0
    if (slotIndex < 0 || count <= 0) return null
    const perPop = Math.round(15 * Math.pow(1.18, this.data.era))
    const cost = perPop * count
    return { next: def.next, nextName: POP_TYPES[def.next].name, count, cost, canAfford: civ.gold.value >= cost, slotIndex }
  }

  /** Spend gold to upgrade a specialist type to its next chain tier (one-way; converts ALL
   *  pops of that type and moves the roster slot to the new tier). */
  upgradeSpecialistChain(popKey) {
    if (!this._canEconomize()) return
    const info = this.specialistUpgradeInfo(popKey)
    if (!info || !info.canAfford) return
    const civ = this.data.civilization
    civ.gold.value -= info.cost
    civ.pops[info.next] = (civ.pops[info.next] ?? 0) + info.count
    delete civ.pops[popKey]
    civ.population[info.slotIndex] = info.next // the roster slot now holds the upgraded tier
    this._recomputeOutputs()
    this._fxSeq = (this._fxSeq ?? 0) + 1
    this.data.popFx = { key: info.next, seq: this._fxSeq }
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

  /** Mercenary hire cost: the best mercCostMult (United Nations ×0.4, Multiversal Army ×0.25). */
  mercCost() {
    let mult = this._hasPolicy('hospitality_rites') ? 0.5 : 1
    for (const def of this._activeEffectDefs()) if (def.mercCostMult != null) mult = Math.min(mult, def.mercCostMult)
    return Math.round(mercenaryCost(this.data.era) * mult)
  }

  /** Level a mercenary spawns at: Diplomatic Marriage +3, plus mercLevels bonuses
   *  (Embassies +4, Omniplomacy +6). */
  _mercLevel(baseLevel) {
    let lv = baseLevel + (this._hasPolicy('diplomatic_marriage') ? 3 : 0)
    for (const def of this._activeEffectDefs()) if (def.mercLevels) lv += def.mercLevels
    return lv
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
    this._netsCache = null // road topology changed
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
  /** Every "r,c" a piece with `placement` at (sr,sc) can reach for repositioning: its connected
   *  REGION — tiles it can stand on, reached by orthogonal adjacency — PLUS any road/bridge net that
   *  links across otherwise-blocking terrain (Combustion=ocean, Mass Drivers=space, FTL=deep space,
   *  Reuseable Rocketry=Moon↔Earth). Without a bridge tech, a unit can't leave its continent / water
   *  body / space region (and land↔Moon/Mars/exoplanet stay separate). */
  _repositionRegion(sr, sc, placement) {
    const t = this.data.tableau
    const NBRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const nets = this._portNets() // roads + active terrain bridges
    const standable = (r, c) => { const tile = t.tileAt(r, c); return !!tile && canPlaceOn(placement, tile.terrain) }
    const seen = new Set([`${sr},${sc}`])
    const q = [[sr, sc]]
    let head = 0
    while (head < q.length) {
      const [r, c] = q[head++]
      const cur = `${r},${c}`
      for (const [dr, dc] of NBRS) { const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`; if (!seen.has(nk) && standable(nr, nc)) { seen.add(nk); q.push([nr, nc]) } }
      // A bridge/road net links all its ports; hop to any standable port (the far side of the bridge).
      for (const ports of nets) if (ports.has(cur)) for (const p of ports) { if (seen.has(p)) continue; const [pr, pc] = p.split(',').map(Number); if (standable(pr, pc)) { seen.add(p); q.push([pr, pc]) } }
    }
    return seen
  }

  canReposition(fromRow, fromCol, toRow, toCol) {
    if (fromRow === toRow && fromCol === toCol) return false
    const from = this.data.tableau.tileAt(fromRow, fromCol)
    const occ = from?.occupant
    if (!occ) return false
    // Units always reposition; buildings only with the Stargate wonder (during prep).
    const buildingOk = occ.kind === 'building' && this._hasWonder('stargate') && this.data.phase === 'prep'
    if (occ.kind !== 'unit' && !buildingOk) return false
    const def = occ.kind === 'unit' ? UNIT_DEFS[occ.key] : defOf(occ.key)
    // Wonders + multi-tile buildings (Great Wall / Shinkansen / Hadron Collider / Death Star):
    // moved as a whole by their anchor to a NEW anchor whose entire footprint is already free
    // (NO swap — the space must already be available). Requires Stargate (buildingOk); `to` is
    // the destination anchor. _footprintOpenForMove handles the 1×1 wonder case too.
    if (occ.wonder || this._isMultiTile(def)) {
      if (!buildingOk) return false
      if (!this.data.tableau.tileAt(toRow, toCol) || !this.data.tableau.isUnlocked(toRow, toCol, this.data.era)) return false
      return this._footprintOpenForMove(def, occ, { row: toRow, col: toCol })
    }
    const to = this.data.tableau.tileAt(toRow, toCol)
    if (!to || !this.data.tableau.isUnlocked(toRow, toCol, this.data.era)) return false
    if (!canPlaceOn(def.placement, to.terrain)) return false // the moving piece must fit dest
    // Region restriction: the destination must be in the piece's connected region (bridged by tech).
    if (!this._repositionRegion(fromRow, fromCol, def.placement).has(`${toRow},${toCol}`)) return false
    if (!to.occupant) return true // move onto an empty tile
    // Swap: the destination must hold a piece of the SAME kind that also fits the source terrain
    // AND can reach the source tile from its own region.
    // A wonder is never a swap target (it moves only into free space); guarded above anyway.
    if (to.occupant.wonder) return false
    const toDef = to.occupant.kind === 'unit' ? UNIT_DEFS[to.occupant.key] : defOf(to.occupant.key)
    return to.occupant.kind === occ.kind && canPlaceOn(toDef.placement, from.terrain) &&
      this._repositionRegion(toRow, toCol, toDef.placement).has(`${fromRow},${fromCol}`)
  }

  moveUnit(fromRow, fromCol, toRow, toCol) {
    if (!this.canReposition(fromRow, fromCol, toRow, toCol)) return
    const from = this.data.tableau.tileAt(fromRow, fromCol)
    const to = this.data.tableau.tileAt(toRow, toCol)
    const occ = from.occupant
    const def = occ.kind === 'unit' ? UNIT_DEFS[occ.key] : defOf(occ.key)
    // Multi-tile piece: relocate the whole footprint (the 1×1 wonder falls through to the plain
    // move below, where canReposition has already guaranteed the single destination cell is free).
    if (this._isMultiTile(def)) { this._moveMultiTile(occ, def, { row: toRow, col: toCol }); return }
    const swapped = to.occupant // null = plain move; a unit = swap
    to.occupant = from.occupant
    from.occupant = swapped
    this._syncUnitStats() // positions changed → refresh Brewery-aura membership
    this._recomputeOutputs() // …and Brewery gold (units-in-range changed)
    this._emit()
  }

  /** Every destination footprint cell for MOVING an existing multi-tile/wonder piece is
   *  unlocked, terrain-valid, and free — except cells the piece already occupies (a shift may
   *  overlap its own old footprint). Requires the destination space to already be available. */
  _footprintOpenForMove(def, occ, anchor) {
    for (const { r, c } of this._footprintCells(def, anchor.row, anchor.col)) {
      const tile = this.data.tableau.tileAt(r, c)
      if (!tile || !this.data.tableau.isUnlocked(r, c, this.data.era)) return false
      if (!this._terrainAllows(occ, def, tile)) return false
      if (tile.unit || tile.city) return false
      if (tile.building && tile.building !== occ) return false // occupied by a DIFFERENT piece
    }
    return true
  }

  /** Relocate an existing multi-tile piece: clear its current footprint cells (all reference the
   *  same instance) and re-stamp that instance across the new footprint anchored at `anchor`. */
  _moveMultiTile(occ, def, anchor) {
    const old = occ.anchor ?? anchor
    for (const { r, c } of this._footprintCells(def, old.row, old.col)) {
      const t = this.data.tableau.tileAt(r, c)
      if (t && t.building === occ) t.building = null
    }
    occ.anchor = { row: anchor.row, col: anchor.col }
    for (const { r, c } of this._footprintCells(def, anchor.row, anchor.col)) {
      const t = this.data.tableau.tileAt(r, c)
      if (t) t.building = occ
    }
    if (def.linksAdjacency) this._netsCache = null
    this._syncUnitStats()
    this._recomputeOutputs()
    this._emit()
  }

  // --- Panopticon wonder: reposition ENEMY units freely during prep (drag an enemy to an
  // empty cell in the battlefield spawn zone). ---
  _liveEnemyAt(row, col) {
    return this.data.enemies.find((e) => e.row === row && e.col === col && !e.damaged && !e.breached)
  }

  canRepositionEnemy(fromRow, fromCol, toRow, toCol) {
    if (this.data.phase !== 'prep' || !this._hasWonder('panopticon')) return false
    if (fromRow === toRow && fromCol === toCol) return false
    if (!this._liveEnemyAt(fromRow, fromCol)) return false
    const t = this.data.tableau
    const bounds = t.visibleBounds(this.data.era)
    if (!bounds || toCol < bounds.minCol || toCol > bounds.maxCol) return false
    // Enemies must stay in the battlefield spawn zone (the rows above the visible grid).
    const rows = t.enemyRowCount(this.data.era)
    if (toRow <= bounds.maxRow || toRow > bounds.maxRow + rows) return false
    return true // empty cell → move; a live enemy there → SWAP (mirrors friendly-unit repositioning)
  }

  moveEnemy(fromRow, fromCol, toRow, toCol) {
    if (!this.canRepositionEnemy(fromRow, fromCol, toRow, toCol)) return
    const e = this._liveEnemyAt(fromRow, fromCol)
    const other = this._liveEnemyAt(toRow, toCol) // swap partner, if any (captured before the move)
    e.row = toRow; e.col = toCol
    if (other) { other.row = fromRow; other.col = fromCol }
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
    this._applyPreCombatMercs() // free mercenaries from Native Collaboration / Xenodiplomacy
    this._restartTimer() // clears the dev timer; prep has none
  }

  /** Spawn the free mercenaries granted by pre-combat policies (Native Collaboration:
   *  3 random mercs on empty New-World tiles; Xenodiplomacy: 6 :ranged: mercs on any empty
   *  valid tile). These disband at battle end exactly like hired mercenaries. */
  _applyPreCombatMercs() {
    const defs = this._activeEffectDefs()
    if (defs.some((d) => d.special === 'new_world_mercs')) this._spawnFreeMercs(3, { label: 'New World' })
    if (defs.some((d) => d.special === 'alien_ranged_mercs')) this._spawnFreeMercs(6, { role: 'ranged' })
  }

  /** Place up to `n` free mercenaries on empty valid tiles matching the filter
   *  (label = required tile design label; role = required unit combat role). */
  _spawnFreeMercs(n, { label = null, role = null } = {}) {
    const civ = this.data.civilization
    let placed = 0
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      if (placed >= n) break
      if (tile.occupant || (label && tile.label !== label)) continue
      let cands = this._placeableUnitsAt(tile)
      if (role) cands = cands.filter((s) => unitRole(UNIT_DEFS[s.key]) === role)
      if (!cands.length) continue
      const pick = cands[Math.floor(Math.random() * cands.length)]
      const level = this._mercLevel(pick.level)
      const hp = unitStats(UNIT_DEFS[pick.key], level, civ.modifiers.unitHpBonus).def
      tile.occupant = { kind: 'unit', key: pick.key, level, hp, maxHp: hp, damaged: false, mercenary: true }
      placed++
    }
    if (placed) this._syncUnitStats()
    return placed
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
    this.data.civilization.poetBonus += 2 // Poetry: every era, each Poet permanently gains +2 :progress:
    this._ageCavePaintings() // stored progress doubles each era after combat
    this._beginEra()
    this._emit()
  }

  /** Each surviving Cave Painting's stored :progress: doubles per era (capped). */
  _ageCavePaintings() {
    const { storedMax, storedBase } = BUILDING_DEFS.cave_painting
    for (const { occ } of this._buildingInstances()) {
      if (occ.key === 'cave_painting') occ.storedProgress = Math.min(storedMax, (occ.storedProgress ?? storedBase) * 2)
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
    // Era-start wonder effects: Sistine Chapel grants a free advancement pick; Hadron Collider
    // grants a large era-scaled :progress: lump.
    if (this._hasWonder('sistine_chapel')) this.data.pendingProgress += 1
    if (this._hasWonder('hadron_collider')) {
      this.data.civilization.progress.value += Math.round(1500 * Math.pow(1.15, this.data.era))
      this._processThresholds('progress', this.data.civilization.progress)
    }
    this._syncUnitStats() // board persists across eras; refresh Warband/maxHp
    this._generateEnemies() // fresh host, visible during development
    this._restartTimer()
    this._maybeOpenSelection() // open the Sistine free pick (if any) now that the era is set up
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
