// GameManager (v4 turn-based) — the root game model. Framework-free (no React):
// the UI reads it through the subscribe/getVersion bridge (see react/GameProvider).
//
// THE LOOP IS TURN-BASED. There are no phases and no wall clock. The player
// plans freely (found cities, build units/buildings, repair, reposition, pick a
// research lane), then calls endTurn(), which resolves ONE round in a fixed
// order (see manager/combat.js _resolveTurn):
//     resolve units  -> resolve resource gain -> resolve research
// then forecasts the next wave onto the frontier.
//
// Enemies are PERSISTENT (this.enemies): they muster on the frontier a turn
// ahead (this.forecast), march on the palace, raze buildings and cities, and
// kill units permanently. Two currencies: GOLD (a stock, spent while planning)
// and PROGRESS (income that fills the ACTIVE research lane). Win = complete any
// flavor's Renaissance ascendancy. Lose = the palace is razed.
//
// Combat lives in manager/combat.js as a mixin (installCombat at the bottom).

import { generateWorld } from './world/worldgen.js'
import { key, neighbors, distance, disc } from './hex/coords.js'
import { STAGE, BATTLEFIELD_DEPTH } from './world/regions.js'
import { terrainOf, isPassable, isLand, rangeBonusOf } from './world/terrain.js'
import { UNIT_DEFS, canPlaceUnit } from './data/units.js'
import { BUILDING_DEFS, canPlaceBuilding, buildingHp } from './data/buildings.js'
import { emptyUpgradeState, upgradeBonus, nextNode, upgradeCost } from './data/upgrades.js'
import {
  FLAVORS, advancementFor, researchCost, isFlavorComplete, isAscendancy,
} from './data/progress.js'
import {
  STARTING_GOLD, PALACE_START_POP, CITY_START_POP, CITY_MIN_SPACING,
  CITY_YIELD_RADIUS, PALACE_MAX_HP, PALACE_ATK, PALACE_RANGE, CITY_ATTACK_RANGE,
  FOOD_BASE, FOOD_GROWTH, RESEARCH_BASE, RESEARCH_GROWTH,
  COUNT_GROWTH, WONDER_COUNT_GROWTH, CITY_COST, UNIT_COSTS, REPAIR_PER_HP,
} from './data/config.js'
import { installCombat } from './manager/combat.js'

// The prototype charts Earth only (Stone..Renaissance). Expansion techs walk the
// reveal ladder out to Full Earth and no further.
const REVEAL_CAP = STAGE.full_earth
const MAX_YIELD_RADIUS = 3

export class GameManager {
  constructor(seed = 1) {
    this.world = generateWorld(seed >>> 0)
    this.stage = STAGE.local
    this.turn = 1

    this.gold = STARTING_GOLD

    // Research: one active flavor lane; income fills its current tech.
    this.branchEra = { military: 0, science: 0, economy: 0, culture: 0, expansion: 0 }
    this.taken = []
    this.researchFlavor = 'military'
    this.researchValue = 0
    this.lastGoldGain = 0
    this.lastProgressGain = 0

    // Modifiers folded in by advancements.
    this.mods = {
      unitAtkFlat: 0, unitDefFlat: 0,
      goldTileBonus: 0, progressPerPop: 1, cityAtkFlat: 0,
      upgradeCeiling: 99, // upgrades are a pure gold sink in the prototype
    }
    this.upgrades = emptyUpgradeState()
    this.unlockedClasses = new Set(['melee'])
    this.unlockedBuildings = new Set()
    this.cityYieldRadius = CITY_YIELD_RADIUS

    this.selection = null       // { type:'placement', kind, cost }
    this.ui = { upgrade: false, progress: false }

    this.enemies = []           // persistent hostile pieces on the board
    this.forecast = []          // next turn's arrivals (shown as ghosts)
    this.events = []            // this turn's floating numbers (rebuilt each turn)

    this.won = false
    this.defeated = false

    this._version = 0
    this._subs = new Set()
    this._nextId = 1

    this._foundPalace()
    this._recomputeKnown()
    this._giveStartingArmy()
    this._makeForecast()
  }

  // --- React bridge ---------------------------------------------------------
  subscribe = (fn) => { this._subs.add(fn); return () => this._subs.delete(fn) }
  getVersion = () => this._version
  _emit() { this._version++; for (const fn of this._subs) fn() }
  _id() { return this._nextId++ }

  // --- Setup ----------------------------------------------------------------
  _foundPalace() {
    const t = this.world.at(0, 0)
    t.city = { id: this._id(), palace: true, pop: PALACE_START_POP, q: 0, r: 0, hp: PALACE_MAX_HP, foodStore: 0 }
  }

  _giveStartingArmy() {
    // A single Warrior on a passable land tile beside the palace.
    for (const n of neighbors(0, 0)) {
      const t = this.world.at(n.q, n.r)
      if (t && !t.city && !t.unit && canPlaceUnit(UNIT_DEFS.melee, t.terrain)) {
        t.unit = { id: this._id(), cls: 'melee', hp: this.unitStats('melee').def }
        return
      }
    }
  }

  // --- Known world + frontier ring ------------------------------------------
  _recomputeKnown() {
    const list = this.world.list
    const tiles = list.filter((t) => t.revealStage <= this.stage)
    const knownSet = new Set(tiles.map((t) => key(t.q, t.r)))
    const bf = new Map()
    let frontier = tiles
    for (let d = 0; d < BATTLEFIELD_DEPTH; d++) {
      const next = []
      for (const t of frontier) {
        for (const n of neighbors(t.q, t.r)) {
          const nk = key(n.q, n.r)
          if (knownSet.has(nk) || bf.has(nk)) continue
          const o = this.world.at(n.q, n.r)
          if (!o) continue
          bf.set(nk, o)
          next.push(o)
        }
      }
      frontier = next
    }
    const bfTiles = [...bf.values()]
    this.known = { tiles, all: tiles.concat(bfTiles), bfSet: new Set(bf.keys()) }
  }

  isKnown(q, r) {
    const t = this.world.at(q, r)
    return !!t && (t.revealStage <= this.stage || this.known.bfSet.has(key(q, r)))
  }

  // --- Economy readers ------------------------------------------------------
  cityRadiusTiles(city) {
    const out = []
    for (const h of disc(city.q, city.r, this.cityYieldRadius)) {
      const t = this.world.at(h.q, h.r)
      if (t && t.revealStage <= this.stage) out.push(t)
    }
    return out
  }

  cityGold(city) {
    let g = 0
    for (const t of this.cityRadiusTiles(city)) {
      const base = terrainOf(t.terrain).yields.gold
      if (base > 0) g += base + this.mods.goldTileBonus
    }
    return g
  }

  cityProgress(city) {
    let p = city.pop * this.mods.progressPerPop
    for (const t of this.cityRadiusTiles(city)) p += terrainOf(t.terrain).yields.progress
    return p
  }

  cityFood(city) {
    let f = 0
    for (const t of this.cityRadiusTiles(city)) f += terrainOf(t.terrain).yields.food
    return f
  }

  foodThreshold(pop) { return Math.round(FOOD_BASE * Math.pow(FOOD_GROWTH, pop)) }

  /** A city's combat stats. Palace has a real HP pool; cities use pop attrition. */
  cityStats(city) {
    if (city.palace) {
      return { maxHp: PALACE_MAX_HP, atk: PALACE_ATK + this.mods.cityAtkFlat, range: PALACE_RANGE }
    }
    const atk = this.mods.cityAtkFlat
    return { maxHp: 0, atk, range: atk > 0 ? CITY_ATTACK_RANGE : 0 }
  }

  // --- Units + buildings ----------------------------------------------------
  unitStats(cls) {
    const d = UNIT_DEFS[cls]
    const atk = d.atk + this.mods.unitAtkFlat + upgradeBonus(this.upgrades, cls, 'atk')
    const def = d.def + this.mods.unitDefFlat + upgradeBonus(this.upgrades, cls, 'def')
    return { atk, def, range: d.range, splash: d.splash ?? 0 }
  }

  /** UI: live stats for the unit on a tile, incl. its terrain range bonus. */
  unitBoardStats(tile) {
    if (!tile.unit) return null
    const s = this.unitStats(tile.unit.cls)
    return { ...s, range: s.range + rangeBonusOf(tile.terrain), cls: tile.unit.cls, hp: tile.unit.hp }
  }

  buildingStats(bkey) {
    const d = BUILDING_DEFS[bkey]
    return { maxHp: buildingHp(d), atk: d.atk ?? 0, range: d.range ?? 0 }
  }

  allCities() { return this.world.list.filter((t) => t.city).map((t) => ({ tile: t, city: t.city })) }
  cityCount() { return this.world.list.reduce((n, t) => n + (t.city && !t.city.palace ? 1 : 0), 0) }
  countUnits(cls) { return this.world.list.reduce((n, t) => n + (t.unit?.cls === cls ? 1 : 0), 0) }
  countBuildings(bkey) { return this.world.list.reduce((n, t) => n + (t.building?.key === bkey ? 1 : 0), 0) }

  /** UI: tiles a hovered unit could strike (stationary towers). */
  unitReachCells(tile) {
    if (!tile?.unit) return null
    const s = this.unitBoardStats(tile)
    const attack = new Set()
    for (const h of disc(tile.q, tile.r, s.range)) {
      if (h.q === tile.q && h.r === tile.r) continue
      if (this.isKnown(h.q, h.r)) attack.add(key(h.q, h.r))
    }
    return { move: new Set(), attack, threat: new Set() }
  }

  /** UI: a city/palace's live economy + defence for the hover card. */
  cityInfo(tile) {
    if (!tile?.city) return null
    const c = tile.city
    const s = this.cityStats(c)
    return {
      pop: c.pop, palace: !!c.palace,
      gold: Math.round(this.cityGold(c)),
      progress: Math.round(this.cityProgress(c)),
      food: Math.round(this.cityFood(c)),
      threshold: this.foodThreshold(c.pop),
      hp: c.hp ?? null, ...s,
    }
  }

  // --- Research (commit-a-lane) ---------------------------------------------
  setResearch(flavor) {
    if (!FLAVORS.includes(flavor) || isFlavorComplete(this.branchEra, flavor)) return
    this.researchFlavor = flavor
    // Overflow may already complete the newly picked tech.
    this._drainResearch()
    this._emit()
  }

  researchInfo() {
    const f = this.researchFlavor
    if (!f || isFlavorComplete(this.branchEra, f)) return { flavor: null, value: this.researchValue }
    const era = this.branchEra[f]
    return {
      flavor: f, era, adv: advancementFor(f, era),
      cost: researchCost(era, RESEARCH_BASE, RESEARCH_GROWTH),
      value: this.researchValue,
    }
  }

  _advanceResearch(amount) {
    this.researchValue += amount
    this._drainResearch()
  }

  _drainResearch() {
    let guard = 0
    while (this.researchFlavor && !isFlavorComplete(this.branchEra, this.researchFlavor) && guard++ < 30) {
      const f = this.researchFlavor
      const era = this.branchEra[f]
      const cost = researchCost(era, RESEARCH_BASE, RESEARCH_GROWTH)
      if (this.researchValue < cost) break
      this.researchValue -= cost
      this._completeResearch(f, era)
      if (this.won) break
    }
  }

  _completeResearch(flavor, era) {
    const adv = advancementFor(flavor, era)
    if (!adv) return
    this.taken.push(adv.id)
    this.branchEra[flavor] = era + 1
    for (const e of adv.effects) this._applyEffect(e)
    if (isAscendancy(era)) this.won = true
  }

  _applyEffect(e) {
    switch (e.kind) {
      case 'reveal_next':
        if (this.stage < REVEAL_CAP) { this.stage++; this._recomputeKnown() }
        break
      case 'unlock_unit': this.unlockedClasses.add(e.cls); break
      case 'unit_flat':
        this.mods.unitAtkFlat += e.atk; this.mods.unitDefFlat += e.def
        // Retroactively toughen every unit already on the board.
        for (const t of this.world.list) if (t.unit) t.unit.hp += e.def
        break
      case 'gold_tile_bonus': this.mods.goldTileBonus += e.amount; break
      case 'progress_per_pop': this.mods.progressPerPop += e.amount; break
      case 'unlock_building': this.unlockedBuildings.add(e.key); break
      case 'city_atk': this.mods.cityAtkFlat += e.atk; break
      case 'yield_radius': this.cityYieldRadius = Math.min(MAX_YIELD_RADIUS, this.cityYieldRadius + e.amount); break
      default: break
    }
  }

  flavorStatus() {
    return FLAVORS.map((f) => ({
      flavor: f,
      era: this.branchEra[f],
      total: this.branchEra[f], // filled below for clarity
      complete: isFlavorComplete(this.branchEra, f),
      active: f === this.researchFlavor && !isFlavorComplete(this.branchEra, f),
      adv: isFlavorComplete(this.branchEra, f) ? null : advancementFor(f, this.branchEra[f]),
      cost: isFlavorComplete(this.branchEra, f) ? 0 : researchCost(this.branchEra[f], RESEARCH_BASE, RESEARCH_GROWTH),
    }))
  }

  // --- Build (found city / hire unit / raise building) ----------------------
  buildKinds() {
    return {
      city: true,
      units: [...this.unlockedClasses],
      buildings: [...this.unlockedBuildings],
    }
  }

  buildCost(kind) {
    if (kind === 'city') return Math.round(CITY_COST * Math.pow(COUNT_GROWTH, this.cityCount()))
    if (UNIT_COSTS[kind] != null) return Math.round(UNIT_COSTS[kind] * Math.pow(COUNT_GROWTH, this.countUnits(kind)))
    const b = BUILDING_DEFS[kind]
    if (b) {
      const growth = b.wonder ? WONDER_COUNT_GROWTH : COUNT_GROWTH
      return Math.round(b.cost * Math.pow(growth, this.countBuildings(kind)))
    }
    return 9999
  }

  canBuild(kind) {
    if (this.selection || this.won || this.defeated) return false
    if (UNIT_COSTS[kind] != null && !this.unlockedClasses.has(kind)) return false
    if (BUILDING_DEFS[kind] && !this.unlockedBuildings.has(kind)) return false
    return this.gold >= this.buildCost(kind)
  }

  beginBuild(kind) {
    if (!this.canBuild(kind)) return
    this.selection = { type: 'placement', kind, cost: this.buildCost(kind) }
    this._emit()
  }

  cancelSelection() {
    if (this.selection?.type === 'placement') { this.selection = null; this._emit() }
  }

  placementTargets() {
    if (this.selection?.type !== 'placement') return []
    const out = []
    for (const t of this.known.tiles) if (this._canPlace(this.selection.kind, t)) out.push(t)
    return out
  }

  _canPlace(kind, t) {
    if (t.unit || t.city || t.building) return false // one piece per tile
    if (kind === 'city') {
      if (!isLand(t.terrain) || !isPassable(t.terrain)) return false
      for (const { city } of this.allCities()) {
        if (distance(t.q, t.r, city.q, city.r) < CITY_MIN_SPACING) return false
      }
      // Interior only: every neighbour revealed, so the yield radius doesn't
      // spill into the frontier.
      for (const n of neighbors(t.q, t.r)) {
        const o = this.world.at(n.q, n.r)
        if (!o || o.revealStage > this.stage) return false
      }
      return this.cityRadiusTiles({ q: t.q, r: t.r }).some((x) => terrainOf(x.terrain).yields.food > 0)
    }
    if (BUILDING_DEFS[kind]) return canPlaceBuilding(BUILDING_DEFS[kind], t.terrain)
    return canPlaceUnit(UNIT_DEFS[kind], t.terrain)
  }

  placeAt(tile) {
    const sel = this.selection
    if (sel?.type !== 'placement' || !this._canPlace(sel.kind, tile)) return
    if (this.gold < sel.cost) return
    this.gold -= sel.cost
    if (sel.kind === 'city') {
      tile.city = { id: this._id(), palace: false, pop: CITY_START_POP, q: tile.q, r: tile.r, foodStore: 0 }
    } else if (BUILDING_DEFS[sel.kind]) {
      tile.building = { id: this._id(), key: sel.kind, hp: buildingHp(BUILDING_DEFS[sel.kind]) }
    } else {
      tile.unit = { id: this._id(), cls: sel.kind, hp: this.unitStats(sel.kind).def }
    }
    this.selection = null
    this._emit()
  }

  // --- Repair (heal a living unit or building to full, for gold) ------------
  repairInfo(tile) {
    let cur, max
    if (tile?.unit) { cur = tile.unit.hp; max = this.unitStats(tile.unit.cls).def }
    else if (tile?.building) { cur = tile.building.hp; max = this.buildingStats(tile.building.key).maxHp }
    else return null
    const missing = Math.max(0, max - cur)
    return { missing, max, cost: Math.round(missing * REPAIR_PER_HP), damaged: missing > 0 }
  }

  canRepair(tile) {
    if (this.selection || this.won || this.defeated) return false
    const info = this.repairInfo(tile)
    return !!info && info.damaged && this.gold >= info.cost
  }

  repairOccupant(tile) {
    if (!this.canRepair(tile)) return
    const info = this.repairInfo(tile)
    this.gold -= info.cost
    if (tile.unit) tile.unit.hp = info.max
    else if (tile.building) tile.building.hp = info.max
    this._emit()
  }

  // --- Reposition (planning, free) ------------------------------------------
  get canReposition() { return !this.selection && !this.won && !this.defeated }

  repositionTargets(fromTile) {
    if (!this.canReposition || !fromTile?.unit) return []
    const def = UNIT_DEFS[fromTile.unit.cls]
    const out = []
    for (const t of this.known.tiles) {
      if (t === fromTile || t.unit || t.city || t.building) continue
      if (canPlaceUnit(def, t.terrain)) out.push({ tile: t, free: true, afford: true, cost: 0 })
    }
    return out
  }

  repositionUnit(fromTile, toTile) {
    if (!this.canReposition || !fromTile?.unit) return
    if (toTile.unit || toTile.city || toTile.building) return
    if (!canPlaceUnit(UNIT_DEFS[fromTile.unit.cls], toTile.terrain)) return
    toTile.unit = fromTile.unit
    fromTile.unit = null
    this._emit()
  }

  // --- Upgrades (per-class atk/def gold sink) -------------------------------
  canUpgrade(cls, tree) {
    if (this.selection || this.won || this.defeated) return false
    const node = nextNode(this.upgrades, cls, tree)
    if (!node) return false
    return this.gold >= upgradeCost(node.level)
  }

  upgradeInfo(cls, tree) {
    const node = nextNode(this.upgrades, cls, tree)
    if (!node) return { node: null, maxed: true }
    return { node, cost: upgradeCost(node.level), affordable: this.gold >= upgradeCost(node.level), unlocked: true }
  }

  buyUpgrade(cls, tree) {
    if (!this.canUpgrade(cls, tree)) return
    const node = nextNode(this.upgrades, cls, tree)
    this.gold -= upgradeCost(node.level)
    this.upgrades[cls][tree] = node.tier
    // Toughen living units of this class so a def buy tops them up.
    if (tree === 'def') for (const t of this.world.list) if (t.unit?.cls === cls) t.unit.hp += node.add
    this._emit()
  }

  // --- City growth (food -> pop) --------------------------------------------
  _growCities() {
    for (const { tile, city } of this.allCities()) {
      if (city.pop <= 0) continue
      city.foodStore = (city.foodStore ?? 0) + this.cityFood(city)
      let guard = 0
      while (city.foodStore >= this.foodThreshold(city.pop) && guard++ < 50) {
        city.foodStore -= this.foodThreshold(city.pop)
        city.pop++
      }
      void tile
    }
  }

  // --- Menu / debug ---------------------------------------------------------
  toggleUpgrade() { this.ui.upgrade = !this.ui.upgrade; this._emit() }
  toggleProgress() { this.ui.progress = !this.ui.progress; this._emit() }
  closeUi() { this.ui.upgrade = false; this.ui.progress = false; this._emit() }

  get seed() { return this.world.seed }

  /** Debug: jump the reveal stage (MenuOverlay slider). */
  setStage(stage) {
    this.stage = Math.max(0, Math.min(stage, REVEAL_CAP))
    this._recomputeKnown()
    this._makeForecast()
    this._emit()
  }
  prevStage() { this.setStage(this.stage - 1) }
  nextStage() { this.setStage(this.stage + 1) }
}

installCombat(GameManager)
