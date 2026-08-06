// GameManager (v3) — the root of the game model.
//
// Conventions carried from v2 and still binding:
//   - all state lives here / in plain data modules, never in React state
//   - every mutator calls `_emit()` to bump the version and re-render subscribers
//   - `subscribe` / `getVersion` are ARROW FIELDS (useSyncExternalStore receives
//     them unbound)
//
// THE MAIN CYCLE — TWO CLOCKS THAT DO NOT TOUCH
//   One timer, one pacing control. Each tick either advances a running combat by
//   a beat, or advances the game: accrue output, grow cities, count down to the
//   wave.
//
//   WAVE — combat. 65 ticks of development, then the wave attacks. Thirty waves,
//   scaling on their own ladder.
//   ERA  — a tech pool, one per BRANCH, advanced only by drafting. The furthest
//   branch drives the map reveal and the expansion permissions.
//
//   Crossing a threshold does something different for each resource:
//     :progress:   — offers three advancements (PAUSES the clock)
//     :production: — founds a city, or builds a held wonder (PAUSES the clock)
//     :food:       — expands automatically, with no prompt at all
//
import { generateWorld } from './world/worldgen.js'
import { STAGE_COUNT, BATTLEFIELD_DEPTH } from './world/regions.js'
import { terrainOf, isPassable } from './world/terrain.js'
import { key, neighbors, lengthOf, disc } from './hex/coords.js'
import { initialResources, accrue } from './data/resources.js'
import { QUADRANTS, OFFER_SIZE, ERAS } from './data/schema.js'
import {
  initialDraft, drawOffers, recordPick, branchPool, branchProgress,
  revealEraOf, draftableById,
} from './data/content.js'
import {
  TICKS_PER_WAVE, WAVE_COUNT, stageForEra, unlocksForEra, EXPANSION_UNLOCKS,
} from './data/cycle.js'
import {
  initTerritory, expansionTargets, improveTile, foundCity,
  territoryYield, territoryStats, growCities, setTerritoryStage,
  layConnections, canPlaceBuilding, canPlaceUnit, placeBuilding, placeUnit,
  repairUnit, restoreTile, repairTargets, visible,
} from './world/territory.js'
import {
  unitRepairCost, tileRepairCost, unitUpgradeCost, buildingUpgradeCost, rerollCost,
  repositionCost,
} from './data/costs.js'
import { repositionField, repositionDistance } from './world/reposition.js'
import { PALACE, UNIT_DEFS, unitOfClass, unitStats } from './data/units.js'
import { buildingDef } from './data/buildings.js'
import { installCombat } from './manager/combat.js'

/** Palace HP recovered at the start of each era — damage accumulates, slowly. */
const PALACE_REGEN = 0.25

/**
 * What :gold: is worth when comparing one tile against another.
 *
 * HALF, because gold is the only resource with no threshold: it buys repairs and
 * upgrades rather than compounding into growth, so a raw sum overrates
 * gold-heavy ground.
 */
const GOLD_WEIGHT = 0.5

/**
 * What you start with. Without this, surviving era 0 depends entirely on whether
 * the web happened to offer a military node before the first wave — a coin flip
 * the player cannot influence, which is not a decision.
 */
const STARTING_CLASS = 'melee'
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

/** Hex distance between two tiles (axial). */
const lengthOfDiff = (a, b) => lengthOf(a.q - b.q, a.r - b.r)

/**
 * The accumulated effect of every advancement taken. ONE record, read by the
 * economy (`territoryYield`), combat (`unitStats`) and the expansion gates — so
 * there is never a second place a bonus could hide.
 *
 * ⚠️ Most of these fields have a consumer but no PRODUCER yet: the effect
 * registry currently holds two kinds (`unit_atk_base_pct`, `grant_unit`), and the rest of the
 * mechanics get wired one at a time. They are the engine's own accumulator, not
 * a content vocabulary — see the note at the top of `data/schema.js`.
 */
function freshMods() {
  return {
    terrain: {},            // terrain key -> extra yields
    improved: null,         // extra yields on every improvement
    mult: { food: 0, production: 0, gold: 0, progress: 0 }, // ADDITIVE percentages
    threshold: { food: 1, production: 1, progress: 1 },     // multipliers, <1 is cheaper
    // Civilization-wide and STACKING. There is no weapon or armour tier.
    //
    // ATTACK IS TWO LAYERS (`YIELD_MODEL`):
    //   atk = (base + unitAtkFlat) × (1 + unitAtkBasePct) × (1 + unitAtkPct)
    //
    // `unitAtkBasePct` raises the BASE itself, so a high-base class gains more
    // from it than a low-base one and the classes keep their identity. Each sum
    // is additive; the two layers multiply. ⚠️ Only `unitAtkBasePct` has a
    // producer today — the other two are the slots the formula needs and are
    // consumed correctly the moment an effect fills them.
    unitAtkFlat: 0,
    unitAtkBasePct: 0,
    unitAtkPct: 0,
    // DEFENCE IS HIT POINTS, and runs the identical two-layer formula.
    unitDefFlat: 0,
    unitDefBasePct: 0,
    unitDefPct: 0,
    // CRIT is a single flat dial: chances from every tech ADD (no layering), and
    // the multiplier is a fixed engine constant (`CRIT_MULT` in combat). Read
    // live at attack resolution; capped at 100% there.
    unitCritChancePct: 0,
    // Per-CLASS crit chance (like the universal dial, scoped) + the class riders.
    classCritChance: {},              // class -> fraction added to crit chance
    goldOnClassCrit: {},              // class -> fraction of damage gained as gold
    unitAtkEarnedOnClassCrit: {},     // class -> permanent +atk per crit (earned-flat)
    classPlacementAdd: {},            // class -> Set of extra placement terrain

    // --- ranged theme: poison ---
    rangedPoisonApply: 0,             // stacks a ranged hit applies
    rangedPoisonSlow: { amount: 0, min: 0 },
    poisonSpreadOnApply: 0,
    poisonDamageMult: 1,              // multiplies per-stack tick damage
    poisonBonusStacksOnApply: 0,      // Omniphage: the applied amount escalates by this
    // --- ranged theme: range / fortification synergy ---
    rangedRangeFlat: 0,
    rangedRangeBonusAdjacentFort: 0,
    rangedRangeInfiniteTerrain: new Set(),
    rangedRangePer: null,             // { amount, combats } — +range per N stationary combats
    fortDefPctPerAdjacentRanged: 0,
    // --- ranged theme: preloaded shots ---
    rangedPreloadStart: 0,
    rangedPreloadStartPerAdjacentRanged: 0,
    rangedPreloadOnCrit: 0,
    rangedPreloadPerIdleTurn: 0,
    // --- ranged theme: shot chaining ---
    rangedChainFlat: 0,
    rangedChainRemoveFalloff: false,
    // Combat movement (+acts). Zero-movement classes ignore it.
    unitSpeed: 0,
    // Per-unit FORMATION flat: +atk / +def for each other friendly unit inside
    // reposition range, resolved at combat start.
    formationAtk: 0,
    formationDef: 0,
    // Repositioning (prep phase). `range` is free tiles; `domains` are terrain
    // classes free to cross; `costReduction` sums the Logistics-style discounts;
    // `teleport` makes reposition distance straight-line.
    repositionRange: 0,
    repositionDomains: new Set(),
    repositionCostReduction: 0,
    repositionTeleport: false,
    // City connections. `connectionGold` is the base :gold: every route tile
    // earns (1 even with no road tech); road techs raise it. `connectionProd`
    // is Maglev's rider — route tiles also earn :production: equal to their gold.
    connectionGold: 1,
    connectionProd: false,
    units: new Set(),
    buildings: new Set(),
    settle: new Set(),
    cityGrowth: 1,
    cityYields: null,
    palaceDef: 0,
  }
}

export const SPEEDS = { paused: 0, standard: 1, fast: 3, super: 5, ultra: 10 }

/** How many advancements a progress threshold offers. */
export const PROGRESS_OFFERS = OFFER_SIZE

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

    // THE COMBAT CLOCK. 0-based; the wave you fight is `wave + 1`.
    this.wave = 0
    this.tick = 0
    this.speed = 'paused'

    // THE TECH CLOCK — three of them, one per branch, moved only by drafting.
    this.draft = initialDraft()
    this.stage = stageForEra(this.revealEra)
    setTerritoryStage(this.world, this.stage)
    this._knownCache = null

    this.mods = freshMods()
    this.grants = []      // queued placements from advancements
    this.resources = initialResources()
    // { type: 'progress' | 'city' | 'wonder' | 'placement', ... }
    this.selection = null
    this.pending = { progress: 0, production: 0 }
    this.log = []

    this.phase = 'development' // 'development' | 'combat'
    this.defeated = false
    this.palaceHp = PALACE.def

    this._garrisonStart()
    this.pendingWave = null

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

  start() {
    // The very first wave has no era transition to muster it.
    if (!this.pendingWave && !this.combat.active) this.prepareWave()
    this._restartTimer()
  }

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
    // Prep is a HELD phase: development is over but the wave has not begun, and
    // nothing accrues until the player presses Begin.
    if (this.selection || this.defeated || this.combat.active || this.phase !== 'development') return
    const out = this.output
    const gained = accrue(this.resources, out, this.mods.threshold)
    growCities(this.world, this.mods.cityGrowth)

    // Each threshold resource does something different, and only two of the
    // three stop the clock. See `docs/design.md` §3.
    if (gained.progress > 0) this.pending.progress += gained.progress
    if (gained.production > 0) this.pending.production += gained.production
    // FOOD IS AUTOMATIC AND SILENT. It buys ground, which is never a decision
    // worth a modal: the best available outpost is simply created.
    for (let i = 0; i < gained.food; i++) this._autoExpand()

    this.tick++
    if (this.tick >= TICKS_PER_WAVE) this._startPrep()

    this._openNextSelection()
    this._emit()
  }

  // --- Prep & the wave ------------------------------------------------------

  /**
   * Development ends, but the wave does not land immediately: it lands when YOU
   * say so. The prep phase is the planning window — the clock stops accruing,
   * the mustered host is on the frontier, and you arrange the board: reposition
   * units, repair, upgrade. `beginWave` sets the fight going.
   */
  _startPrep() {
    if (this.phase !== 'development') return
    this.phase = 'prep'
    // Nothing accrues in prep; the player acts, then begins the wave. The clock
    // is left alone so combat can run at whatever speed was set.
  }

  get inPrep() { return this.phase === 'prep' && !this.combat.active && !this.defeated }

  /** Leave prep and start the wave. The player's "Begin Wave" button. */
  beginWave() {
    if (this.phase !== 'prep' || this.combat.active) return false
    // Combat borrows the clock; if it was paused the fight would freeze, so make
    // sure it is running.
    if (this.speed === 'paused') this.speed = 'standard'
    this._startWave()
    this._restartTimer()
    this._emit()
    return true
  }

  /**
   * The wave is sized by how many waves have already come, NOT by how far your
   * tech has run — outrunning the ladder is a legitimate way to win. Every
   * revealed encampment adds a garrison on top.
   */
  _startWave() {
    this.phase = 'combat'
    this.startCombat(this.wave + 1, 1, { scratch: false })
    this.log.push({ wave: this.wave, text: `A host musters on the frontier.` })
  }

  /**
   * Crossing a :food: threshold pushes the border outward on its own — the
   * highest-yield outpost available, with no prompt. An outpost DOUBLES the
   * tile's yield, so the best tile to settle is simply the best tile.
   *
   * ⚠️ :gold: COUNTS HALF. It is the only resource with no threshold — it buys
   * repairs and upgrades rather than compounding into growth — so a raw sum
   * overrates gold-heavy ground. At full weight, desert (3 :gold:) outranked
   * plains and hills; at half it does not.
   *
   * Ties break OUTWARD, since the design's word for what food buys is "pushing
   * your borders outward" and hugging the palace is the opposite of that.
   *
   * Water needs no special case here: an outpost can never be on it
   * (`canExpandOnto`), so it is never in `targets` at all.
   */
  _autoExpand() {
    const targets = expansionTargets(this.world, this.unlocks).improve
    if (!targets.length) return false
    const yieldOf = (t) => {
      const y = terrainOf(t.terrain).yields
      return y.food + y.production + y.progress + y.gold * GOLD_WEIGHT
    }
    const best = targets.reduce((a, b) => {
      const d = yieldOf(b) - yieldOf(a)
      return d > 0 || (d === 0 && b.d > a.d) ? b : a
    })
    if (!improveTile(this.world, best)) return false
    // New controlled land can shorten a connection route, so re-lay.
    layConnections(this.world)
    this._knownCache = null
    this.log.push({ wave: this.wave, text: `Settled ${terrainOf(best.terrain).name}.` })
    return true
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
      this.log.push({ wave: this.wave, text: 'The palace has fallen.' })
      this._emit()
      return
    }
    const bits = []
    if (losses) bits.push(`${losses} lost`)
    if (razed) bits.push(`${razed} razed`)
    if (breaches) bits.push(`${breaches} breaches`)
    this.log.push({
      wave: this.wave,
      text: `Wave ${this.wave + 1} ${result === 'won' ? 'repelled' : 'ground to a halt'}${bits.length ? ` — ${bits.join(', ')}` : ''}.`,
    })
    this._advanceWave()
    this._emit()
  }

  _advanceWave() {
    if (this.wave >= WAVE_COUNT - 1) { this.tick = TICKS_PER_WAVE; this.setSpeed('paused'); return }
    this.wave++
    this.tick = 0
    // Masonry holds; the palace patches itself between waves but never fully.
    this.palaceHp = Math.min(this.palaceMaxHp, this.palaceHp + this.palaceMaxHp * PALACE_REGEN)
    this._musterFromCities()
    this.log.push({ wave: this.wave, text: `Wave ${this.wave + 1} approaches.` })
    // Muster the coming wave NOW, so it is visible all through development.
    this.prepareWave()
  }

  /**
   * Pull the map reveal up to whatever the furthest branch has reached. Called
   * on every draft pick — the reveal is a consequence of research, never of the
   * wave counter.
   */
  _syncReveal() {
    const stage = stageForEra(this.revealEra)
    if (stage === this.stage) return false
    this.stage = stage
    this._knownCache = null
    // Territory claimed past the old frontier comes alive as the map catches up.
    setTerritoryStage(this.world, stage)
    layConnections(this.world)
    // ⚠️ RE-MUSTER. The battlefield ring is derived from the known set, so a
    // reveal moves it outward — and the mustered host is standing on the OLD
    // ring, with flow fields computed against the old map. Under the era clock
    // this could only happen at the rollover, immediately before the muster;
    // now a draft can advance a branch at any point in development, so the host
    // has to be rebuilt where the frontier actually is.
    if (!this.combat.active) this.prepareWave()
    return true
  }

  /**
   * ⚠️ THE PALACE IS NOT A UNIT. `unitDef*` deliberately does not appear here:
   * the unit research lines do not touch it, because the palace gets a tech
   * line of its own. `palaceDef` is the slot that line will fill.
   */
  get palaceMaxHp() { return PALACE.def + this.mods.palaceDef }

  /**
   * Each city raises one levy, up to a cap set by how many cities you hold.
   * The levy is always MELEE — ranged, cavalry and walls stay things the draft
   * has to grant you.
   */
  _musterFromCities() {
    const cities = [...this.world.terr.cities]
    if (!cities.length) return 0
    // Destroyed units do NOT count against the cap — otherwise a bad wave locks
    // you out of replacements at exactly the moment you need them.
    const held = [...this.world.terr.controlled].filter((t) => t.unit && !t.unit.destroyed).length
    let room = cities.length * UNITS_PER_CITY_CAP - held
    if (room <= 0) return 0

    const levy = unitOfClass('melee')
    if (!levy) return 0

    let raised = 0
    for (const city of cities) {
      if (room <= 0) break
      for (let i = 0; i < MUSTER_PER_CITY && room > 0; i++) {
        // Nearest free ground to that city, so the levy defends its own home.
        const spot = [...this.world.terr.controlled]
          .filter((t) => canPlaceUnit(this.world, t, levy))
          .sort((a, b) => lengthOfDiff(a, city) - lengthOfDiff(b, city))[0]
        if (!spot) break
        placeUnit(this.world, spot, levy.key, levy)
        raised++
        room--
      }
    }
    if (raised) this.log.push({ wave: this.wave, text: `${raised} ${levy.name}${raised > 1 ? 's' : ''} mustered.` })
    return raised
  }

  /** Ring the palace with the opening garrison, nearest tiles first. */
  _garrisonStart() {
    const start = unitOfClass(STARTING_CLASS)
    if (!start) return
    this.mods.units.add(STARTING_CLASS)
    const spots = [...this.world.terr.controlled]
      .filter((t) => canPlaceUnit(this.world, t, start))
      .sort((a, b) => a.d - b.d)
    for (let i = 0; i < STARTING_UNITS && i < spots.length; i++) {
      placeUnit(this.world, spots[i], STARTING_CLASS, start)
    }
  }

  // --- The three tech clocks ------------------------------------------------

  /** The furthest branch. Drives the reveal and the expansion permissions. */
  get revealEra() { return revealEraOf(this.draft) }

  get eraName() { return ERAS[this.revealEra] }

  /** Per-branch era, count toward the next, and what is left to draft there. */
  get branches() {
    return QUADRANTS.map((q) => {
      const { have, need } = branchProgress(this.draft, q)
      const era = this.draft.branchEra[q]
      return {
        quadrant: q, era, eraName: ERAS[era], have, need,
        remaining: branchPool(this.draft, q).length,
        // A branch with nothing left in its tier cannot advance. That is the
        // designed dead-end of a current-tier-only pool, and the panel says so
        // rather than leaving the player waiting for an offer that never comes.
        stalled: branchPool(this.draft, q).length === 0 && need > 0,
      }
    })
  }

  /** Everything drafted, newest last — for the three-column panel. */
  get takenRows() {
    const out = []
    for (const id of this.draft.taken) {
      const row = draftableById(id)
      if (row) out.push(row)
    }
    return out
  }

  get heldWonder() { return this.draft.heldWonder }

  /** Expansion permissions, granted by the reveal era. */
  get unlocks() {
    const s = unlocksForEra(this.revealEra)
    for (const k of this.mods.settle) s.add(k)
    return s
  }

  get newUnlocksThisEra() {
    return EXPANSION_UNLOCKS.filter((u) => u.era === this.revealEra)
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
      // An exhausted pool silently skips rather than opening an empty choice.
      if (offers.length) { this.selection = { type: 'progress', offers, rerolls: 0 }; this._restartTimer(); return }
    }
    // :production: BUILDS. A held wonder takes precedence over founding a city —
    // you drafted it, so it is already the choice you made.
    if (this.pending.production > 0) {
      this.pending.production--
      if (this.draft.heldWonder) {
        this.selection = { type: 'wonder', wonder: this.draft.heldWonder }
        this._restartTimer()
        return
      }
      if (this.cityTargets.length) {
        this.selection = { type: 'city' }
        this._restartTimer()
        return
      }
    }
  }

  _drawProgressOffers(exclude = null) {
    return drawOffers(this.draft, PROGRESS_OFFERS, Math.random, exclude)
  }

  /** Where a city could be founded right now. */
  get cityTargets() { return expansionTargets(this.world, this.unlocks).city }

  /**
   * Where the held wonder may stand. Its `placement` rules are content, and
   * nothing in the engine reads them yet — so for now a wonder goes wherever a
   * building could. ⚠️ Wire `PLACEMENTS` here when placement rules are built.
   */
  get wonderTargets() {
    const out = []
    for (const t of this.world.terr.controlled) if (canPlaceBuilding(this.world, t)) out.push(t)
    return out
  }

  /** Found a city, spending the pending :production:. */
  foundCityAt(tile) {
    if (this.selection?.type !== 'city') return false
    if (!foundCity(this.world, tile)) return false
    // A new city rewires the whole network (the old-world relay rule is global).
    layConnections(this.world)
    this.log.push({ wave: this.wave, text: `Founded a city on ${terrainOf(tile.terrain).name}.` })
    this.selection = null
    this._knownCache = null
    this._openNextSelection()
    this._restartTimer()
    this._emit()
    return true
  }

  /**
   * Build the held wonder. Drafting a wonder does not build it — this does, and
   * clearing `heldWonder` is what lets wonders back into the offer.
   */
  buildWonderAt(tile) {
    const sel = this.selection
    if (sel?.type !== 'wonder') return false
    if (!placeBuilding(this.world, tile, sel.wonder.id)) return false
    tile.building.wonder = true
    this.draft.heldWonder = null
    this.log.push({ wave: this.wave, text: `Built ${sel.wonder.name}.` })
    this.selection = null
    this._knownCache = null
    this._openNextSelection()
    this._restartTimer()
    this._emit()
    return true
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
    return rerollCost(this.wave, this.selection.rerolls ?? 0)
  }

  /** Spend gold to redraw the three advancements. */
  rerollOffers() {
    const sel = this.selection
    if (sel?.type !== 'progress') return false
    // Rerolling is allowed mid-selection, when `canSpend` is otherwise false.
    const cost = rerollCost(this.wave, sel.rerolls ?? 0)
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
      const cost = unitRepairCost(this.wave)
      out.push({ kind: 'repair-unit', label: `Repair ${UNIT_NAME(t.unit.key)}`, cost, afford: g >= cost })
    } else if (t.unit) {
      const cost = unitUpgradeCost(this.wave, t.unit.level ?? 1)
      out.push({ kind: 'upgrade-unit', label: `Upgrade ${UNIT_NAME(t.unit.key)}`, cost, afford: g >= cost, level: t.unit.level ?? 1 })
    }
    if (t.ruin) {
      const cost = tileRepairCost(this.wave, t.ruin.kind)
      out.push({ kind: 'rebuild', label: `Rebuild ${t.ruin.kind}`, cost, afford: g >= cost })
    } else if (t.building) {
      const cost = buildingUpgradeCost(this.wave, t.building.level ?? 1)
      out.push({ kind: 'upgrade-building', label: `Upgrade ${buildingDef(t.building.key)?.name ?? t.building.key}`, cost, afford: g >= cost, level: t.building.level ?? 1 })
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

  // --- Repositioning (prep phase) -------------------------------------------

  /** Repositioning is a prep-phase action: not during development or combat. */
  get canReposition() { return this.inPrep }

  /**
   * Where the unit on `from` could be repositioned, with the gold cost of each.
   *
   *   free   — within your reposition range, costs nothing
   *   cost   — gold for the tiles beyond the free range (0 when free)
   *
   * A destination must be empty and legal for the unit's class. Distance uses
   * the reposition metric (domains free to cross; straight-line when teleport).
   */
  repositionTargets(from) {
    const u = from?.unit
    if (!u || u.destroyed || !this.canReposition) return []
    const def = this._placeDef(UNIT_DEFS[u.key])
    if (!def) return []

    const range = this.mods.repositionRange
    const opts = { domains: this.mods.repositionDomains, teleport: this.mods.repositionTeleport }
    // One field for the whole pick (unless teleporting, which is per-tile O(1)).
    const field = this.mods.repositionTeleport ? null : repositionField(this.world, from, opts)

    const out = []
    for (const t of this.world.terr.controlled) {
      if (t === from || !canPlaceUnit(this.world, t, def)) continue
      const d = field
        ? (field.get(key(t.q, t.r)) ?? Infinity)
        : repositionDistance(this.world, from, t, opts)
      if (!Number.isFinite(d)) continue
      const paid = Math.max(0, d - range)
      const cost = repositionCost(this.wave, paid, this.repositionCostMult)
      out.push({ tile: t, dist: d, free: paid === 0, cost, afford: cost <= this.resources.gold.value })
    }
    return out
  }

  /** The gold cost of moving the unit on `from` to `to` (null if illegal). */
  repositionCostTo(from, to) {
    return this.repositionTargets(from).find((r) => r.tile === to) ?? null
  }

  /** Move a placed unit to another tile, paying if it is beyond free range. */
  repositionUnit(from, to) {
    const info = this.repositionCostTo(from, to)
    if (!info) return false
    if (info.cost > 0 && !this._spend(info.cost)) return false
    to.unit = from.unit
    from.unit = null
    // Moving resets the "dug in" counter (Entrenchment's range bonus).
    to.unit.stationaryCombats = 0
    this.world.terr.version++
    this._knownCache = null
    this.log.push({ wave: this.wave, text: `Repositioned ${UNIT_NAME(to.unit.key)}${info.cost ? ` (${info.cost} gold)` : ''}.` })
    this._emit()
    return true
  }

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
    const s = unitStats(def, this.wave, this.mods, u.level ?? 1)

    // The class's own movement terrain, so the preview matches what combat will
    // actually let it do. A class with an empty movement set shows no blue.
    const walkable = (t) => !!t && def.movement.has(t.terrain) &&
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

  /**
   * Take one of the three offered advancements.
   *
   * A WONDER is not built here — it is held, and the next :production: threshold
   * builds it. Everything else applies immediately.
   */
  chooseOffer(row) {
    if (this.selection?.type !== 'progress') return false
    if (!this.selection.offers.some((o) => o.id === row.id)) return false

    const { advanced } = recordPick(this.draft, row)
    if (row.isWonder) this.draft.heldWonder = row
    else this._applyEffects(row)
    // Advancing a branch is what opens the map — the reveal follows research.
    if (advanced) this._syncReveal()
    this.log.push({ wave: this.wave, text: `Researched ${row.name}.` })

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
    const out = []
    if (item.kind === 'building') {
      for (const t of this.world.terr.controlled) if (canPlaceBuilding(this.world, t)) out.push(t)
      return out
    }
    // A unit's own class decides its ground — that is what keeps naval units at
    // sea and everything else off it (widened by placement-grant techs).
    const def = this._placeDef(this.grantDef(item))
    for (const t of this.world.terr.controlled) if (canPlaceUnit(this.world, t, def)) out.push(t)
    return out
  }

  get placementTargets() { return this._placementTargets(this.selection?.item) }

  /**
   * Tiles that would be legal for the queued grant but already hold one of its
   * kind — ONE building and ONE unit per tile, always.
   *
   * Surfaced separately from the legal targets because "not glowing" is not an
   * explanation: a full tile looked identical to sea, mountain, and ground you
   * do not own. These get their own marker so the rule is visible.
   */
  get placementBlocked() {
    const item = this.selection?.type === 'placement' ? this.selection.item : null
    if (!item) return []
    const out = []
    for (const t of this.world.terr.controlled) {
      if (!visible(this.world, t) || !isPassable(t.terrain)) continue
      if (item.kind === 'building' ? t.building : t.unit) out.push(t)
    }
    return out
  }

  /** What a queued grant actually puts down — class grants resolve here. */
  grantDef(item) {
    if (!item) return null
    if (item.kind === 'building') return buildingDef(item.key)
    return UNIT_DEFS[item.key ?? item.type] ?? null
  }

  /**
   * A class's placement terrain, WIDENED by any `class_placement_terrain_add`
   * tech (Solar Battery lets a ranged unit stand on a star). Returns the def
   * unchanged when nothing was added, so the common path allocates nothing.
   */
  _placeDef(def) {
    const add = def && this.mods.classPlacementAdd[def.key]
    if (!add || !add.size) return def
    return { ...def, placement: new Set([...def.placement, ...add]) }
  }

  /** Put the granted unit/building down. */
  placeGrant(tile) {
    const sel = this.selection
    if (sel?.type !== 'placement') return false
    const def = this.grantDef(sel.item)
    if (!def) return false
    const ok = sel.item.kind === 'building'
      ? placeBuilding(this.world, tile, def.key)
      : placeUnit(this.world, tile, def.key, this._placeDef(def))
    if (!ok) return false
    this.grants.shift()
    this.selection = null
    this._knownCache = null
    this.log.push({ wave: this.wave, text: `Placed ${def.name} on ${terrainOf(tile.terrain).name}.` })
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

  // --- Effects ---------------------------------------------------------------

  /**
   * Fold an advancement's effects into `this.mods`.
   *
   * ⚠️ THIS SWITCH IS THE OTHER HALF OF `EFFECT_KINDS` in `data/schema.js`. An
   * effect kind exists in the registry only because there is a case for it here;
   * add the two together or the editor will happily author something that does
   * nothing. `validateContent` rejects a kind with no case, which is the check
   * that keeps them in step.
   */
  _applyEffects(row) {
    for (const f of row.effects ?? []) this._applyEffect(f)
    this.world.terr.version++
  }

  _applyEffect(f) {
    switch (f.kind) {
      // A BASE MODIFIER on every unit, present and future. Base modifiers ADD
      // to each other — Obsidian, Bronze and Iron together are +125% base, not
      // ×1.25×1.40×1.60 — and the summed base is then multiplied by the
      // ordinary modifier layer. Nothing is stored on the units: their stats
      // are computed from `mods` at read time, so this reaches units placed
      // long before the tech was taken.
      case 'unit_atk_base_pct':
        this.mods.unitAtkBasePct += (f.amount ?? 0) / 100
        break
      // The same, for hit points. UNITS ONLY — the palace has its own line.
      case 'unit_def_base_pct':
        this.mods.unitDefBasePct += (f.amount ?? 0) / 100
        break
      // Crit CHANCE only — a flat additive dial. The 2× multiplier is fixed in
      // the combat engine and no tech touches it.
      case 'unit_crit_chance_pct':
        this.mods.unitCritChancePct += (f.amount ?? 0) / 100
        break

      // --- class-scoped crit & earned stats ---
      case 'class_crit_chance_pct':
        this.mods.classCritChance[f.unitClass] = (this.mods.classCritChance[f.unitClass] ?? 0) + (f.amount ?? 0) / 100
        break
      case 'gold_on_class_crit_pct':
        this.mods.goldOnClassCrit[f.unitClass] = (this.mods.goldOnClassCrit[f.unitClass] ?? 0) + (f.amount ?? 0) / 100
        break
      case 'unit_atk_earned_on_class_crit':
        this.mods.unitAtkEarnedOnClassCrit[f.unitClass] = (this.mods.unitAtkEarnedOnClassCrit[f.unitClass] ?? 0) + (f.amount ?? 0)
        break
      case 'class_placement_terrain_add':
        (this.mods.classPlacementAdd[f.unitClass] ??= new Set()).add(f.terrain)
        break

      // --- ranged: poison ---
      case 'ranged_poison_apply':
        this.mods.rangedPoisonApply += f.amount ?? 0
        break
      case 'ranged_poison_slow':
        this.mods.rangedPoisonSlow = {
          amount: this.mods.rangedPoisonSlow.amount + (f.amount ?? 0),
          min: Math.max(this.mods.rangedPoisonSlow.min, f.min ?? 0),
        }
        break
      case 'poison_spread_on_apply':
        this.mods.poisonSpreadOnApply += f.amount ?? 0
        break
      case 'poison_damage_mult':
        this.mods.poisonDamageMult *= f.amount ?? 1
        break
      case 'poison_bonus_stacks_on_apply':
        this.mods.poisonBonusStacksOnApply += f.amount ?? 0
        break

      // --- ranged: range / fort synergy ---
      case 'ranged_range_flat':
        this.mods.rangedRangeFlat += f.amount ?? 0
        break
      case 'ranged_range_bonus_adjacent_fort':
        this.mods.rangedRangeBonusAdjacentFort += f.amount ?? 0
        break
      case 'ranged_range_infinite_on_terrain':
        this.mods.rangedRangeInfiniteTerrain.add(f.terrain)
        break
      case 'ranged_range_per_stationary_combats':
        this.mods.rangedRangePer = this.mods.rangedRangePer
          ? { amount: this.mods.rangedRangePer.amount + (f.amount ?? 0), combats: Math.min(this.mods.rangedRangePer.combats, f.combats ?? 1) }
          : { amount: f.amount ?? 0, combats: f.combats ?? 1 }
        break
      case 'fort_def_pct_per_adjacent_ranged':
        this.mods.fortDefPctPerAdjacentRanged += f.amount ?? 0
        break

      // --- ranged: preloaded shots ---
      case 'ranged_preload_start':
        this.mods.rangedPreloadStart += f.amount ?? 0
        break
      case 'ranged_preload_start_per_adjacent_ranged':
        this.mods.rangedPreloadStartPerAdjacentRanged += f.amount ?? 0
        break
      case 'ranged_preload_on_crit':
        this.mods.rangedPreloadOnCrit += f.amount ?? 0
        break
      case 'ranged_preload_per_idle_turn':
        this.mods.rangedPreloadPerIdleTurn += f.amount ?? 0
        break

      // --- ranged: shot chaining ---
      case 'ranged_chain_flat':
        this.mods.rangedChainFlat += f.amount ?? 0
        break
      case 'ranged_chain_remove_falloff':
        this.mods.rangedChainRemoveFalloff = true
        break
      // A CLASS grant, never a named unit: which unit it becomes is resolved by
      // `grantDef` at placement time from the best one unlocked, so a grant
      // queued before an upgrade still benefits from it. Each queued item opens
      // its own placement selection.
      case 'grant_unit':
        for (let i = 0; i < (f.count ?? 1); i++) {
          this.grants.push({ kind: 'unit', type: f.unitClass })
        }
        break
      // +combat movement, units only (the palace has its own line).
      case 'unit_speed':
        this.mods.unitSpeed += f.amount ?? 0
        break

      // --- repositioning ---
      case 'reposition_range':
        this.mods.repositionRange += f.amount ?? 0
        break
      case 'reposition_domain':
        this.mods.repositionDomains.add(f.domain)
        break
      case 'reposition_cost':
        // Reductions ADD, then clamp so a move is never fully free this way.
        this.mods.repositionCostReduction = Math.min(0.9, this.mods.repositionCostReduction + (f.pct ?? 0) / 100)
        break
      case 'reposition_teleport':
        this.mods.repositionTeleport = true
        break

      // --- formations: per-unit flat resolved at combat start ---
      case 'formation':
        this.mods.formationAtk += f.atk ?? 0
        this.mods.formationDef += f.def ?? 0
        break

      // --- city connections ---
      case 'road_network':
        this.mods.connectionGold += f.gold ?? 0
        if (f.prodFromGold) this.mods.connectionProd = true
        // A richer network changes tile yields; the road tiles themselves do not
        // move, so no need to re-lay — just bump the memo version.
        this.world.terr.version++
        break

      default:
        // Unreachable via valid content; loud rather than silent if it happens.
        console.warn(`[GameManager] no case for effect kind "${f.kind}"`)
    }
  }

  /** The live gold-cost multiplier on repositioning (Logistics etc.). */
  get repositionCostMult() { return Math.max(0.1, 1 - this.mods.repositionCostReduction) }

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

  /**
   * Jump the COMBAT clock. It does not touch the tech clocks — the whole point
   * of the split is that you can be on wave 12 in the Stone era, or the reverse.
   */
  jumpToWave(n) {
    this.wave = Math.max(0, Math.min(WAVE_COUNT - 1, n | 0))
    this.tick = 0
    this._knownCache = null
    this.defeated = false
    this.phase = 'development'
    this.combat = { ...this.combat, active: false, result: null }
    this.prepareWave()
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
    const keepWave = this.wave
    this._load(seed)
    this.jumpToWave(keepWave)
  }

  setWave(n) { this.combat.wave = Math.max(1, Math.min(WAVE_COUNT, n | 0)); this._emit() }
  setStrength(v) { this.combat.strength = Math.max(0.25, Math.min(3, v)); this._emit() }
}

installCombat(GameManager)
