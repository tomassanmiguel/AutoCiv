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
import { terrainOf, isLand, isPassable } from './world/terrain.js'
import { key, neighbors, lengthOf, disc } from './hex/coords.js'
import { PROGRESS_NODES, RING_UNLOCK, MAX_RING, progressById } from './data/progress.js'
import { initialResources, accrue } from './data/resources.js'
import { ERAS, TICKS_PER_ERA, ERA_COUNT, stageForEra, unlocksForEra, EXPANSION_UNLOCKS } from './data/eras.js'
import {
  initTerritory, expansionTargets, improveTile, foundCity,
  territoryYield, territoryStats, growCities, setTerritoryStage,
  layRoads, canPlaceBuilding, canPlaceUnit, placeBuilding, placeUnit,
  repairUnit, restoreTile, repairTargets,
} from './world/territory.js'
import {
  unitRepairCost, tileRepairCost, unitUpgradeCost, buildingUpgradeCost, rerollCost,
} from './data/costs.js'
import {
  PALACE, UNIT_DEFS, WEAPON_TIERS, ARMOR_TIERS, bestTier, bestOfType, unitStats,
} from './data/units.js'
import { BUILDING_DEFS } from './data/buildings.js'
import { installCombat, MAX_WAVES } from './manager/combat.js'

/** Palace HP recovered at the start of each era — damage accumulates, slowly. */
const PALACE_REGEN = 0.25

/**
 * What you start with. Without this, surviving era 0 depends entirely on whether
 * the web happened to offer a military node before the first wave — a coin flip
 * the player cannot influence, which is not a decision.
 */
const STARTING_UNIT = 'warrior'
const STARTING_UNITS = 1

/**
 * Cities muster a levy each era. Without this the army only ever SHRINKS —
 * casualties are permanent and the web grants far fewer units than a wave kills,
 * so every run died around era 5 no matter how well it was played.
 *
 * The split it creates is the point: TERRITORY gives you a line of ordinary
 * infantry; the PROGRESS WEB gives you quality (weapon and armour tiers) and the
 * arms a levy will never be — bows, horses, and walls.
 */
const MUSTER_PER_CITY = 1
const UNITS_PER_CITY_CAP = 3

const UNIT_NAME = (k) => UNIT_DEFS[k]?.name ?? k
const BUILDING_NAME = (k) => BUILDING_DEFS[k]?.name ?? k

/** Hex distance between two tiles (axial). */
const lengthOfDiff = (a, b) => lengthOf(a.q - b.q, a.r - b.r)

/** Merge a yield bag into another, allocating only when there is something to add. */
function addYields(into, y) {
  const out = into ? { ...into } : { food: 0, production: 0, gold: 0, progress: 0 }
  for (const k of ['food', 'production', 'gold', 'progress']) if (y[k]) out[k] += y[k]
  return out
}

/**
 * The accumulated effect of everything taken from the progress web. ONE record,
 * read by the economy (`territoryYield`), combat (`unitStats`) and the expansion
 * gates — so there is never a second place a bonus could hide.
 */
function freshMods() {
  return {
    terrain: {},            // terrain key -> extra yields
    improved: null,         // extra yields on every improvement
    mult: { food: 0, production: 0, gold: 0, progress: 0 }, // ADDITIVE percentages
    threshold: { food: 1, production: 1, progress: 1 },     // multipliers, <1 is cheaper
    // You begin the game armed with clubs and dressed in hides. Both are TIERS:
    // a node replaces the tier, it does not stack on it.
    weapon: 'clubs',
    armor: 'hides',
    unitMod: { melee: {}, ranged: {}, cavalry: {}, defense: {} },
    units: new Set(),
    buildings: new Set(),
    roads: false,
    roadYield: null,
    settle: new Set(),
    cityGrowth: 1,
    cityYields: null,
    palaceDef: 0,
  }
}

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
    setTerritoryStage(this.world, this.stage)
    this._knownCache = null

    this.progress = new Set()
    this.mods = freshMods()
    this.grants = []      // queued placements from progress nodes
    this.resources = initialResources()
    this.selection = null // { type: 'progress' | 'expansion' | 'placement', ... }
    this.pending = { progress: 0, expansion: 0 }
    this.log = []

    this.phase = 'development' // 'development' | 'combat'
    this.defeated = false
    this.palaceHp = PALACE.def

    this._garrisonStart()

    this.stopCombatTimer?.()
    this.combat = {
      active: false, wave: 1, strength: 1, scratch: false,
      turn: 0, beat: 0, actionSeq: 0, result: null,
      queue: [], phase: null, acting: null,
      enemies: [], units: [], palace: null, events: [],
      breaches: 0, razed: 0, losses: 0, fallen: [],
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
    if (this.defeated) { this.setSpeed('paused'); return }
    // A running combat borrows the clock — one beat per tick.
    if (this.combat.active) {
      if (this.combat.result) { this._resolveWave(); return }
      this.combatStep()
      if (this.combat.result) this._emit()
      return
    }
    this.gameTick()
  }

  /** One tick of the development cycle. Safe to call headlessly (sims do). */
  gameTick() {
    if (this.selection || this.defeated || this.combat.active) return
    const out = this.output
    const gained = accrue(this.resources, out, this.mods.threshold)
    growCities(this.world, this.mods.cityGrowth)

    if (gained.progress > 0) this.pending.progress += gained.progress
    if (gained.food > 0) this.pending.expansion += gained.food

    this.tick++
    if (this.tick >= TICKS_PER_ERA) this._startEraWave()

    this._openNextSelection()
    this._emit()
  }

  // --- The era's battle -----------------------------------------------------

  /**
   * The era ends in a fight. The wave is sized by the era you have reached, so
   * dawdling does not make it easier — and every revealed encampment adds a
   * garrison on top, which is the pressure to expand toward them.
   */
  _startEraWave() {
    this.phase = 'combat'
    this.startCombat(this.era + 1, 1, { scratch: false })
    this.log.push({ era: this.era, text: `A host masters on the frontier.` })
  }

  /** The wave is over: bank the outcome, then roll into the next era. */
  _resolveWave() {
    const { result, razed, breaches } = this.combat
    this.endCombat() // writes casualties back — read `losses` AFTER it
    const { losses } = this.combat
    this.phase = 'development'

    if (result === 'lost') {
      this.defeated = true
      this.setSpeed('paused')
      this.log.push({ era: this.era, text: 'The palace has fallen.' })
      this._emit()
      return
    }
    const bits = []
    if (losses) bits.push(`${losses} lost`)
    if (razed) bits.push(`${razed} razed`)
    if (breaches) bits.push(`${breaches} breaches`)
    this.log.push({
      era: this.era,
      text: `Wave ${this.era + 1} ${result === 'won' ? 'repelled' : 'ground to a halt'}${bits.length ? ` — ${bits.join(', ')}` : ''}.`,
    })
    this._advanceEra()
    this._emit()
  }

  _advanceEra() {
    if (this.era >= ERA_COUNT - 1) { this.tick = TICKS_PER_ERA; this.setSpeed('paused'); return }
    this.era++
    this.tick = 0
    // Masonry holds; the palace patches itself between eras but never fully.
    this.palaceHp = Math.min(this.palaceMaxHp, this.palaceHp + this.palaceMaxHp * PALACE_REGEN)
    this._musterFromCities()
    const stage = stageForEra(this.era)
    if (stage !== this.stage) {
      this.stage = stage
      this._knownCache = null
      // Territory claimed past the old frontier comes alive as the map catches up.
      setTerritoryStage(this.world, stage)
      if (this.mods.roads) layRoads(this.world)
    }
    this.log.push({ era: this.era, text: `Entered the ${this.eraName} era.` })
  }

  get palaceMaxHp() { return PALACE.def + this.mods.palaceDef }

  /**
   * Each city raises one levy, up to a cap set by how many cities you hold.
   * The levy is always the best unlocked MELEE unit — the tech tree's ranged,
   * cavalry and constructions stay things you have to be granted.
   */
  _musterFromCities() {
    const cities = [...this.world.terr.cities]
    if (!cities.length) return 0
    // Destroyed units do NOT count against the cap — otherwise a bad wave locks
    // you out of replacements at exactly the moment you need them.
    const held = [...this.world.terr.controlled].filter((t) => t.unit && !t.unit.destroyed).length
    let room = cities.length * UNITS_PER_CITY_CAP - held
    if (room <= 0) return 0

    const levy = [...this.mods.units]
      .map((k) => UNIT_DEFS[k])
      .filter((d) => d?.type === 'melee')
      .sort((a, b) => (b.atk + b.def) - (a.atk + a.def))[0]
    if (!levy) return 0

    let raised = 0
    for (const city of cities) {
      if (room <= 0) break
      for (let i = 0; i < MUSTER_PER_CITY && room > 0; i++) {
        // Nearest free ground to that city, so the levy defends its own home.
        const spot = [...this.world.terr.controlled]
          .filter((t) => canPlaceUnit(this.world, t))
          .sort((a, b) => lengthOfDiff(a, city) - lengthOfDiff(b, city))[0]
        if (!spot) break
        placeUnit(this.world, spot, levy.key)
        raised++
        room--
      }
    }
    if (raised) this.log.push({ era: this.era, text: `${raised} ${levy.name}${raised > 1 ? 's' : ''} mustered.` })
    return raised
  }

  /** Ring the palace with the opening garrison, nearest tiles first. */
  _garrisonStart() {
    this.mods.units.add(STARTING_UNIT)
    const spots = [...this.world.terr.controlled]
      .filter((t) => canPlaceUnit(this.world, t))
      .sort((a, b) => a.d - b.d)
    for (let i = 0; i < STARTING_UNITS && i < spots.length; i++) {
      placeUnit(this.world, spots[i], STARTING_UNIT)
    }
  }

  get eraName() { return ERAS[this.era] }

  /** Expansion permissions: the era hands some out, the progress web the rest. */
  get unlocks() {
    const s = unlocksForEra(this.era)
    for (const k of this.mods.settle) s.add(k)
    return s
  }

  get newUnlocksThisEra() {
    return EXPANSION_UNLOCKS.filter((u) => u.era === this.era)
  }

  // --- Output ---------------------------------------------------------------

  /** Per-tick output of everything you control, with every progress modifier. */
  get output() { return territoryYield(this.world, this.mods) }

  get stats() { return territoryStats(this.world) }

  // --- Selections -----------------------------------------------------------

  _openNextSelection() {
    if (this.selection) return
    // Placements come first — a granted unit or building is dead weight sitting
    // in a queue, and the player just chose it.
    if (this.grants.length) {
      const item = this.grants[0]
      if (this._placementTargets(item).length) {
        this.selection = { type: 'placement', item }
        this._restartTimer()
        return
      }
      this.grants.shift() // nowhere legal to put it — drop it rather than jam
    }
    if (this.pending.progress > 0) {
      const offers = this._drawProgressOffers()
      this.pending.progress--
      // An exhausted web silently skips rather than opening an empty choice.
      if (offers.length) { this.selection = { type: 'progress', offers, rerolls: 0 }; this._restartTimer(); return }
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

  _drawProgressOffers(exclude = null) {
    const avail = PROGRESS_NODES.filter((n) => this.progressState(n) === 'available')
    // A reroll that can hand back the same three cards is not a reroll. Only
    // drop the old ones if there is enough left to fill a fresh hand.
    const pool = exclude && avail.length > PROGRESS_OFFERS
      ? avail.filter((n) => !exclude.includes(n))
      : avail.slice()
    const out = []
    // Deterministic enough for a prototype; the real draw will be weighted.
    while (out.length < PROGRESS_OFFERS && pool.length) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    }
    return out
  }

  // --- Gold ------------------------------------------------------------------

  /** Gold may only be spent while nothing is in the way and nobody is attacking. */
  get canSpend() {
    return !this.defeated && !this.combat.active
  }

  get gold() { return Math.floor(this.resources.gold.value) }

  _spend(cost) {
    if (!this.canSpend || cost > this.resources.gold.value) return false
    this.resources.gold.value -= cost
    return true
  }

  /** Cost of redrawing the current offer, or null if that is not a thing now. */
  get rerollCost() {
    if (this.selection?.type !== 'progress') return null
    return rerollCost(this.era, this.selection.rerolls ?? 0)
  }

  /** Spend gold to redraw the three advancements. */
  rerollOffers() {
    const sel = this.selection
    if (sel?.type !== 'progress') return false
    // Rerolling is allowed mid-selection, when `canSpend` is otherwise false.
    const cost = rerollCost(this.era, sel.rerolls ?? 0)
    if (this.defeated || cost > this.resources.gold.value) return false
    this.resources.gold.value -= cost
    this.selection = {
      ...sel,
      offers: this._drawProgressOffers(sel.offers),
      rerolls: (sel.rerolls ?? 0) + 1,
    }
    this._emit()
    return true
  }

  /**
   * What gold could do to this tile right now, with prices. One place, so the
   * UI never has to re-derive an affordability rule.
   */
  tileActions(t) {
    const out = []
    if (!t || !t.controlled || !this.canSpend) return out
    const g = this.resources.gold.value
    if (t.unit?.destroyed) {
      const cost = unitRepairCost(this.era)
      out.push({ kind: 'repair-unit', label: `Repair ${UNIT_NAME(t.unit.key)}`, cost, afford: g >= cost })
    } else if (t.unit) {
      const cost = unitUpgradeCost(this.era, t.unit.level ?? 1)
      out.push({ kind: 'upgrade-unit', label: `Upgrade ${UNIT_NAME(t.unit.key)}`, cost, afford: g >= cost, level: t.unit.level ?? 1 })
    }
    if (t.ruin) {
      const cost = tileRepairCost(this.era, t.ruin.kind)
      out.push({ kind: 'rebuild', label: `Rebuild ${t.ruin.kind}`, cost, afford: g >= cost })
    } else if (t.building) {
      const cost = buildingUpgradeCost(this.era, t.building.level ?? 1)
      out.push({ kind: 'upgrade-building', label: `Upgrade ${BUILDING_NAME(t.building.key)}`, cost, afford: g >= cost, level: t.building.level ?? 1 })
    }
    return out
  }

  /** Run one of `tileActions`. */
  doTileAction(t, kind) {
    const action = this.tileActions(t).find((a) => a.kind === kind)
    if (!action || !this._spend(action.cost)) return false
    switch (kind) {
      case 'repair-unit': repairUnit(this.world, t); break
      case 'rebuild': restoreTile(this.world, t); break
      case 'upgrade-unit': t.unit.level = (t.unit.level ?? 1) + 1; break
      case 'upgrade-building': t.building.level = (t.building.level ?? 1) + 1; break
      default: return false
    }
    this.world.terr.version++
    this._knownCache = null
    this._emit()
    return true
  }

  get repairTargets() { return repairTargets(this.world) }

  /**
   * Where the unit on `tile` could go and what it could hit — for the hover
   * highlight.
   *
   *   move   — tiles it can walk to this turn (`acts` steps over passable land)
   *   attack — tiles it can strike from where it stands
   *   threat — extra tiles it could strike after moving first
   *
   * Split into three because "how far can it reach" and "what can it hit right
   * now" are different questions, and a ranged unit that never moves answers
   * them very differently from cavalry.
   */
  unitReachCells(tile) {
    const u = tile?.unit
    if (!u || u.destroyed) return null
    const def = UNIT_DEFS[u.key]
    if (!def) return null
    const s = unitStats(def, this.era, this.mods, u.level ?? 1)

    const walkable = (t) => !!t && isLand(t.terrain) && isPassable(t.terrain) &&
      t.revealStage <= this.stage && !(t.q === 0 && t.r === 0)

    const move = new Set()
    let frontier = [tile]
    const seen = new Set([key(tile.q, tile.r)])
    for (let step = 0; step < s.acts; step++) {
      const next = []
      for (const c of frontier) {
        for (const n of neighbors(c.q, c.r)) {
          const k = key(n.q, n.r)
          if (seen.has(k)) continue
          const o = this.world.tiles.get(k)
          if (!walkable(o)) continue
          seen.add(k)
          move.add(k)
          next.push(o)
        }
      }
      frontier = next
    }

    const attack = new Set()
    if (s.atk > 0 && s.range > 0) {
      for (const c of disc(tile.q, tile.r, s.range)) attack.add(key(c.q, c.r))
      attack.delete(key(tile.q, tile.r))
    }
    // Reach after moving — only interesting for a unit that can actually move.
    const threat = new Set()
    if (s.atk > 0 && s.range > 0) {
      for (const mk of move) {
        const [q, r] = mk.split(',').map(Number)
        for (const c of disc(q, r, s.range)) {
          const k = key(c.q, c.r)
          if (!attack.has(k) && !move.has(k) && k !== key(tile.q, tile.r)) threat.add(k)
        }
      }
    }
    return { move, attack, threat, stats: s }
  }

  /** Resolve a progress offer: take the node and apply everything it grants. */
  chooseOffer(node) {
    if (this.selection?.type !== 'progress') return false
    if (!this.chooseProgress(node, true)) return false
    this.selection = null
    this._openNextSelection()
    this._restartTimer()
    this._emit()
    return true
  }

  // --- Placement ------------------------------------------------------------

  /** Legal tiles for the granted item at the head of the queue. */
  _placementTargets(item) {
    if (!item) return []
    const ok = item.kind === 'building' ? canPlaceBuilding : canPlaceUnit
    const out = []
    for (const t of this.world.terr.controlled) if (ok(this.world, t)) out.push(t)
    return out
  }

  get placementTargets() { return this._placementTargets(this.selection?.item) }

  /** What a queued grant actually puts down — class grants resolve here. */
  grantDef(item) {
    if (!item) return null
    if (item.kind === 'building') return BUILDING_DEFS[item.key] ?? null
    return item.key ? UNIT_DEFS[item.key] : bestOfType(item.type, this.mods.units)
  }

  /** Put the granted unit/building down. */
  placeGrant(tile) {
    const sel = this.selection
    if (sel?.type !== 'placement') return false
    const def = this.grantDef(sel.item)
    if (!def) return false
    const ok = sel.item.kind === 'building'
      ? placeBuilding(this.world, tile, def.key)
      : placeUnit(this.world, tile, def.key)
    if (!ok) return false
    this.grants.shift()
    this.selection = null
    this._knownCache = null
    this.log.push({ era: this.era, text: `Placed ${def.name} on ${terrainOf(tile.terrain).name}.` })
    this._openNextSelection()
    this._restartTimer()
    this._emit()
    return true
  }

  skipSelection() {
    // Declining a placement discards the grant — it does not queue up forever.
    if (this.selection?.type === 'placement') this.grants.shift()
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
    // A new city joins the road network; new ground may open a shorter route.
    if (this.mods.roads) layRoads(this.world)
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
    this._applyEffects(node)
    if (!viaOffer) { this._openNextSelection(); this._restartTimer(); this._emit() }
    return true
  }

  /**
   * Fold a node's effects into `this.mods` — the single accumulated record of
   * everything the web has given you. Grants (units, buildings) are pushed onto
   * the placement queue instead, since they need a tile.
   */
  _applyEffects(node) {
    const m = this.mods
    for (const f of node.effects) {
      switch (f.kind) {
        case 'terrain': m.terrain[f.terrain] = addYields(m.terrain[f.terrain], f.yields); break
        case 'improved': m.improved = addYields(m.improved, f.yields); break
        case 'mult': m.mult[f.res] += f.pct; break
        // Clamped: stacked reductions must never make a threshold free.
        case 'threshold': m.threshold[f.res] = Math.max(0.25, m.threshold[f.res] + f.pct); break
        // Tiers only ever move forward, so taking Bronze after Iron is a no-op
        // rather than a downgrade.
        case 'weapon': m.weapon = bestTier(WEAPON_TIERS, m.weapon, f.tier); break
        case 'armor': m.armor = bestTier(ARMOR_TIERS, m.armor, f.tier); break
        case 'unitMod':
          for (const [k, v] of Object.entries(f.mod)) {
            m.unitMod[f.type][k] = (m.unitMod[f.type][k] ?? 0) + v
          }
          break
        case 'settle': m.settle.add(f.settle); break
        case 'palace':
          m.palaceDef += f.mod.def ?? 0
          this.palaceHp += f.mod.def ?? 0 // the new masonry is not pre-damaged
          break
        case 'city':
          if (f.mod.growth) m.cityGrowth += f.mod.growth
          if (f.mod.yields) m.cityYields = addYields(m.cityYields, f.mod.yields)
          break
        case 'road':
          m.roads = true
          m.roadYield = addYields(m.roadYield, f.yields)
          layRoads(this.world)
          break
        case 'unit':
          m.units.add(f.unit)
          for (let i = 0; i < f.grant; i++) this.grants.push({ kind: 'unit', key: f.unit, name: UNIT_NAME(f.unit) })
          break
        // A bare class grant resolves to the best unlocked unit of that class
        // AT PLACEMENT TIME, so troops queued before an upgrade still benefit
        // from it. If the class is still empty it opens with the base unit, so
        // a grant can never be stranded.
        case 'troops':
          for (let i = 0; i < f.grant; i++) this.grants.push({ kind: 'unit', type: f.type })
          break
        case 'building':
          m.buildings.add(f.building)
          for (let i = 0; i < f.grant; i++) this.grants.push({ kind: 'building', key: f.building, name: BUILDING_NAME(f.building) })
          break
        default: break
      }
    }
    this.world.terr.version++
  }

  /** Every node taken so far, newest last — for the "what have I got" panel. */
  get takenNodes() {
    return [...this.progress].map(progressById).filter(Boolean)
  }

  resetProgress() {
    this.progress = new Set()
    this.mods = freshMods()
    this.grants = []
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
    this.defeated = false
    this.phase = 'development'
    this.combat = { ...this.combat, active: false, result: null }
    setTerritoryStage(this.world, this.stage)
    if (this.mods.roads) layRoads(this.world)
    this._emit()
  }

  /** The debug "Simulate Combat" bar — a scratch army, never the real board. */
  simulateCombat() {
    this.startCombat(this.combat.wave, this.combat.strength, { scratch: true })
  }

  setStage(n) {
    const next = Math.max(0, Math.min(STAGE_COUNT - 1, n | 0))
    if (next === this.stage) return
    this.stage = next
    this._knownCache = null
    setTerritoryStage(this.world, next)
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
