// GameManager (v4) — the root game model. Framework-free (no React): the UI
// reads it through the subscribe/getVersion bridge (see react/GameProvider).
//
// The loop has NO development phase. Three phases repeat:
//   prep    — spend gold (found cities, hire units, buy upgrades), reposition
//   combat  — the cooldown clock runs; cities emit gold+progress; a progress
//             threshold pauses combat for a draft; enemies march on the palace
//   resolve — cities gain/lose pop by survival; food → pop; wave++
//
// Two currencies: GOLD (a stock, spent in prep) and PROGRESS (one pool, a
// threshold that opens a draft). POP is a per-city stat. Cities are combat
// pieces. Win = all five flavors complete; lose = the palace is destroyed.
//
// Combat lives in manager/combat.js as a mixin (installCombat at the bottom).

import { generateWorld } from './world/worldgen.js'
import { key, neighbors, disc, distance } from './hex/coords.js'
import { STAGE } from './world/regions.js'
import { BATTLEFIELD_DEPTH } from './world/regions.js'
import { terrainOf, isPassable, isLand, rangeBonusOf } from './world/terrain.js'
import { UNIT_DEFS, canPlaceUnit } from './data/units.js'
import { emptyUpgradeState, upgradeBonus, nextNode, upgradeCost } from './data/upgrades.js'
import {
  FLAVORS, advancementFor, draftOptions, isFlavorComplete, allComplete,
} from './data/progress.js'
import {
  STARTING_GOLD, PALACE_START_POP, CITY_START_POP, CITY_MIN_SPACING,
  CITY_YIELD_RADIUS, CITY_BASE_DEF, PALACE_BASE_DEF, PALACE_ATK, PALACE_RANGE,
  PROGRESS_BASE, TIER_GROWTH, DEFAULT_SPEED, ACTIVE_ERAS,
  CITY_COST, UNIT_COSTS,
} from './data/config.js'
import { installCombat } from './manager/combat.js'

// v1 caps map reveal at the Islands notch (docs/design.md §8).
const EXPANSION_STAGE_CAP = STAGE.islands

export class GameManager {
  constructor(seed = 1) {
    this.world = generateWorld(seed >>> 0)
    this.stage = STAGE.local
    this.wave = 1
    this.phase = 'prep' // 'prep' | 'combat' | 'resolve'
    this.speed = DEFAULT_SPEED

    this.gold = STARTING_GOLD
    // Single progress pool. `threshold` scales with the last pick's tier.
    this.progress = { value: 0, level: 0, threshold: this._progressThreshold(0) }

    this.branchEra = { expansion: 0, military: 0, economy: 0, science: 0, culture: 0 }
    this.taken = []
    this.lastPickEra = 0

    // Modifiers folded in by advancements.
    this.mods = {
      progressPerCitizen: 0,
      unitAtkFlat: 0, unitDefFlat: 0,
      upgradeCeiling: 0,
      cityAtkFlat: 0, cityDefFlat: 0,
      goldTileBonus: 0,
    }
    this.upgrades = emptyUpgradeState()
    this.unlockedClasses = new Set(['melee'])
    this.cityYieldRadius = CITY_YIELD_RADIUS

    this.selection = null       // { type:'placement'|'draft', ... }
    this.pendingWave = null     // mustered host preview
    this.combat = this._blankCombat()
    this.won = false
    this.defeated = false

    this._version = 0
    this._subs = new Set()
    this._nextId = 1

    this._foundPalace()
    this._recomputeKnown()
    this._giveStartingArmy()
    this._prepareWave()
  }

  // --- React bridge (arrow fields: passed unbound to useSyncExternalStore) ---
  subscribe = (fn) => { this._subs.add(fn); return () => this._subs.delete(fn) }
  getVersion = () => this._version
  _emit() { this._version++; for (const fn of this._subs) fn() }

  _id() { return this._nextId++ }

  // --- Setup ----------------------------------------------------------------
  _foundPalace() {
    const t = this.world.at(0, 0)
    t.city = { id: this._id(), palace: true, pop: PALACE_START_POP, q: 0, r: 0 }
  }

  _giveStartingArmy() {
    // Start with two melee units on passable land tiles beside the palace.
    let placed = 0
    for (const n of neighbors(0, 0)) {
      if (placed >= 2) break
      const t = this.world.at(n.q, n.r)
      if (t && !t.city && !t.unit && canPlaceUnit(UNIT_DEFS.melee, t.terrain)) {
        t.unit = { id: this._id(), cls: 'melee' }
        placed++
      }
    }
  }

  // --- Known world + battlefield ring ---------------------------------------
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

  // --- Economy --------------------------------------------------------------
  /** Tiles a city harvests: the disc of its yield radius, KNOWN tiles only. */
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
    let p = city.pop * (1 + this.mods.progressPerCitizen)
    for (const t of this.cityRadiusTiles(city)) p += terrainOf(t.terrain).yields.progress
    return p
  }

  cityFood(city) {
    let f = 0
    for (const t of this.cityRadiusTiles(city)) f += terrainOf(t.terrain).yields.food
    return f
  }

  /** A city's combat stats (HP pool + attack). Palace is tougher and attacks. */
  cityStats(city) {
    const maxHp = (city.palace ? PALACE_BASE_DEF : CITY_BASE_DEF) + this.mods.cityDefFlat
    const atk = city.palace ? PALACE_ATK + this.mods.cityAtkFlat : 0
    const range = city.palace ? PALACE_RANGE : 0
    return { maxHp, atk, range }
  }

  // --- Units ----------------------------------------------------------------
  unitStats(cls) {
    const d = UNIT_DEFS[cls]
    const atk = d.atk + this.mods.unitAtkFlat + upgradeBonus(this.upgrades, cls, 'atk')
    const def = d.def + this.mods.unitDefFlat + upgradeBonus(this.upgrades, cls, 'def')
    return { atk, def, range: d.range, cd: d.cd }
  }

  /** UI: live stats for the unit on a tile, incl. its terrain range bonus. */
  unitBoardStats(tile) {
    if (!tile.unit) return null
    const s = this.unitStats(tile.unit.cls)
    return { ...s, range: s.range + rangeBonusOf(tile.terrain), cls: tile.unit.cls }
  }

  allCities() { return this.world.list.filter((t) => t.city).map((t) => ({ tile: t, city: t.city })) }
  cityCount() { return this.world.list.reduce((n, t) => n + (t.city ? 1 : 0), 0) }

  // --- Progress threshold + draft -------------------------------------------
  _progressThreshold(lastEra) {
    return Math.round(PROGRESS_BASE * Math.pow(TIER_GROWTH, lastEra))
  }

  /** Add progress; if the threshold is crossed and no draft is open, open one. */
  _addProgress(amount) {
    this.progress.value += amount
    if (!this.selection && this.progress.value >= this.progress.threshold) this._openDraft()
  }

  _openDraft() {
    const rng = this._draftRng()
    const options = draftOptions(this.branchEra, rng)
    if (!options.length) {
      // Everything is complete (win) or nothing offerable — consume and move on.
      this.progress.value -= this.progress.threshold
      this.progress.level++
      this.progress.threshold = this._progressThreshold(this.lastPickEra)
      return
    }
    this.selection = { type: 'draft', options }
  }

  _draftRng() {
    // Deterministic-ish but varied per draft, and node-safe (no Math.random ban).
    let s = (this.world.seed ^ (this.progress.level * 2654435761) ^ (this.wave * 40503)) >>> 0
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000 }
  }

  draftPick(advancement) {
    if (this.selection?.type !== 'draft') return
    this.progress.value -= this.progress.threshold
    this.progress.level++
    this._takeAdvancement(advancement)
    this.progress.threshold = this._progressThreshold(this.lastPickEra)
    this.selection = null
    // A new crossing (overflow) may open the next draft immediately.
    if (this.progress.value >= this.progress.threshold) this._openDraft()
    this._checkWin()
    this._emit()
  }

  draftSkip() {
    if (this.selection?.type !== 'draft') return
    this.progress.value -= this.progress.threshold
    this.progress.level++
    this.progress.threshold = this._progressThreshold(this.lastPickEra)
    this.selection = null
    if (this.progress.value >= this.progress.threshold) this._openDraft()
    this._emit()
  }

  _takeAdvancement(a) {
    this.taken.push(a.id)
    this.branchEra[a.flavor] = a.era + 1
    this.lastPickEra = a.era
    for (const e of a.effects) this._applyEffect(e)
  }

  _applyEffect(e) {
    switch (e.kind) {
      case 'progress_per_citizen': this.mods.progressPerCitizen += e.amount; break
      case 'unit_flat': this.mods.unitAtkFlat += e.atk; this.mods.unitDefFlat += e.def; break
      case 'upgrade_ceiling': this.mods.upgradeCeiling += e.amount; break
      case 'unlock_class': this.unlockedClasses.add(e.cls); break
      case 'city_flat': this.mods.cityAtkFlat += e.atk; this.mods.cityDefFlat += e.def; break
      case 'gold_tile_bonus': this.mods.goldTileBonus += e.amount; break
      case 'reveal_next':
        if (this.stage < EXPANSION_STAGE_CAP) { this.stage++; this._recomputeKnown() }
        break
      default: break
    }
  }

  _checkWin() {
    if (allComplete(this.branchEra)) { this.won = true; this.combat.active = false }
  }

  // --- Placement (found city / hire unit) -----------------------------------
  buildCost(kind) { return kind === 'city' ? CITY_COST : (UNIT_COSTS[kind] ?? 40) }

  canBuild(kind) {
    if (this.phase !== 'prep' || this.selection || this.won || this.defeated) return false
    if (kind !== 'city' && !this.unlockedClasses.has(kind)) return false
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

  /** Legal placement tiles for the current selection. */
  placementTargets() {
    const sel = this.selection
    if (sel?.type !== 'placement') return []
    const out = []
    for (const t of this.known.tiles) {
      if (this._canPlace(sel.kind, t)) out.push(t)
    }
    return out
  }

  _canPlace(kind, t) {
    if (t.unit || t.city) return false // one piece per tile
    if (kind === 'city') {
      if (!isLand(t.terrain) || !isPassable(t.terrain)) return false
      // No city within CITY_MIN_SPACING of another city/palace.
      for (const { city } of this.allCities()) {
        if (distance(t.q, t.r, city.q, city.r) < CITY_MIN_SPACING) return false
      }
      // Must have food in reach to grow.
      return this.cityRadiusTiles({ q: t.q, r: t.r }).some((x) => terrainOf(x.terrain).yields.food > 0)
    }
    return canPlaceUnit(UNIT_DEFS[kind], t.terrain)
  }

  placeAt(tile) {
    const sel = this.selection
    if (sel?.type !== 'placement' || !this._canPlace(sel.kind, tile)) return
    if (this.gold < sel.cost) return
    this.gold -= sel.cost
    if (sel.kind === 'city') tile.city = { id: this._id(), palace: false, pop: CITY_START_POP, q: tile.q, r: tile.r }
    else tile.unit = { id: this._id(), cls: sel.kind }
    this.selection = null
    this._emit()
  }

  // --- Upgrades -------------------------------------------------------------
  canUpgrade(cls, tree) {
    if (this.phase !== 'prep' || this.won || this.defeated) return false
    const node = nextNode(this.upgrades, cls, tree)
    if (!node) return false
    if (node.level > 1 + this.mods.upgradeCeiling) return false // ceiling = 1 + Military picks
    return this.gold >= upgradeCost(node.level)
  }

  upgradeInfo(cls, tree) {
    const node = nextNode(this.upgrades, cls, tree)
    if (!node) return { node: null, maxed: true }
    return {
      node,
      cost: upgradeCost(node.level),
      affordable: this.gold >= upgradeCost(node.level),
      unlocked: node.level <= 1 + this.mods.upgradeCeiling,
    }
  }

  buyUpgrade(cls, tree) {
    if (!this.canUpgrade(cls, tree)) return
    const node = nextNode(this.upgrades, cls, tree)
    this.gold -= upgradeCost(node.level)
    this.upgrades[cls][tree] = node.tier
    this._emit()
  }

  // --- Reposition (prep, free in v1) ----------------------------------------
  get canReposition() { return this.phase === 'prep' && !this.selection && !this.won && !this.defeated }

  repositionTargets(fromTile) {
    if (!this.canReposition || !fromTile?.unit) return []
    const def = UNIT_DEFS[fromTile.unit.cls]
    const out = []
    for (const t of this.known.tiles) {
      if (t === fromTile || t.unit || t.city) continue
      if (canPlaceUnit(def, t.terrain)) out.push({ tile: t, free: true, afford: true, cost: 0 })
    }
    return out
  }

  repositionUnit(fromTile, toTile) {
    if (!this.canReposition || !fromTile?.unit) return
    if (toTile.unit || toTile.city) return
    if (!canPlaceUnit(UNIT_DEFS[fromTile.unit.cls], toTile.terrain)) return
    toTile.unit = fromTile.unit
    fromTile.unit = null
    this._emit()
  }

  // --- Speed / debug --------------------------------------------------------
  setSpeed(speed) { this.speed = speed; this._emit() }

  /** Debug: jump the reveal stage (MenuOverlay slider). */
  setStage(stage) {
    this.stage = Math.max(0, Math.min(stage, STAGE.full_map))
    this._recomputeKnown()
    if (this.phase === 'prep') this._prepareWave()
    this._emit()
  }

  // --- Flavors summary (UI) -------------------------------------------------
  flavorStatus() {
    return FLAVORS.map((f) => ({
      flavor: f,
      era: this.branchEra[f],
      complete: isFlavorComplete(this.branchEra, f),
      total: ACTIVE_ERAS,
      current: isFlavorComplete(this.branchEra, f) ? null : advancementFor(f, this.branchEra[f]),
    }))
  }
}

installCombat(GameManager)
