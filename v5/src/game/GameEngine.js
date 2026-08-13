// AutoCiv v5 — the engine. Framework-free; React reads it through the
// subscribe/getVersion bridge (see react/GameProvider). All game state and the
// turn loop live here; content.json (via data/content.js) drives every mechanic.
import { key as hkey, neighbors, bfs, lengthOf, disc } from './hex/coords.js'
import { generateWorld } from './world/worldgen.js'
import {
  META, TERRAIN, DEPLOYABLES, TECHS, ENEMY, progressCost,
  eraPool, wildcardPool, drawWeighted, pick, rng,
} from './data/content.js'
import { DOMAINS, ERAS, eraIndex } from './data/schema.js'
import {
  emptyScalars, armyValue, generateEnemyCard, resolveCombat,
} from './systems/combat.js'

const RES = ['production', 'gold', 'food', 'progress']
const CREATIVE_CAP = 999999 // resources/legitimacy pinned here in Creative Mode
const MERC_COST = { land: 1, sea: 2, sky: 3, space: 4 } // gold per +1 temporary attack, by domain
const GATED_REGIONS = new Set(['new_world']) // regions needing a tech to settle (Colonialism → New World)
// Bodies that act as adjacency bridges once their tech is owned: every shore of one
// connected body becomes mutually reachable (cross an ocean / space to any far coast).
const BRIDGE_TERRAINS = ['ocean', 'exosea', 'near_space', 'space', 'deep_space']

export class GameEngine {
  constructor(seed = 1) {
    this.seed = (seed >>> 0) || 1
    // v4 world generator returns { tiles:Map, list:[], palace, ... }. Normalize to
    // the shape the engine/UI expect: tiles (array) + byKey (Map), each tile with
    // key + dist. Tile objects are shared between list and Map (same refs).
    const w = generateWorld(this.seed)
    for (const t of w.list) { t.key = hkey(t.q, t.r); t.dist = t.d }
    this.world = { tiles: w.list, byKey: w.tiles, radius: w.list.length, palace: w.palace, raw: w }
    this._version = 0

    // Palace starts on a RANDOM interior plains tile with room to grow — not the map
    // centre — for variety. (Plains only occur on Earth land, so it is never on the edge.)
    const WATER = new Set(['ocean', 'coast', 'river'])
    // Interior = all six neighbours are inland Earth land (never on the coast / planet edge).
    const interior = (t) => neighbors(t.q, t.r).every((nb) => {
      const o = w.tiles.get(hkey(nb.q, nb.r))
      return o && o.band === 'earth' && !WATER.has(o.terrain)
    })
    const rand = rng((this.seed ^ 0x50a1ace) >>> 0)
    let cands = w.list.filter((t) => t.terrain === 'plains' && t.region === 'old_world' && interior(t))
    if (!cands.length) cands = w.list.filter((t) => t.terrain === 'plains' && t.region === 'old_world')
    if (!cands.length) cands = [w.tiles.get(hkey(0, 0))]
    const home = cands[Math.floor(rand() * cands.length)]
    this.palaceKey = home.key
    this.world.palace = { q: home.q, r: home.r }

    // Guarantee variety within range 2 of the palace: at least one plains, forest, and hills.
    const near2 = disc(home.q, home.r, 2).map((h) => w.tiles.get(hkey(h.q, h.r))).filter(Boolean)
    const CONVERTIBLE = new Set(['plains', 'forest', 'hills', 'desert', 'tundra'])
    const usedNear = new Set([this.palaceKey])
    const ensureNear = (terr) => {
      if (near2.some((t) => t.terrain === terr)) return
      const cand = near2.find((t) => !usedNear.has(t.key) && CONVERTIBLE.has(t.terrain))
      if (cand) { cand.terrain = terr; usedNear.add(cand.key) } // don't let a later ensure re-convert this tile
    }
    ensureNear('plains'); ensureNear('forest'); ensureNear('hills')
    this._subs = new Set()

    this.turn = 1
    this.waveCount = 0
    this.waveDelay = 0 // Calendar: pending one-turn delays that skip the next wave turn
    this.status = 'playing' // 'playing' | 'won' | 'lost'
    this.creative = false // Creative Mode: all deployables unlocked, infinite resources, no death
    this.revealAll = true // TEMP: show the whole map (fog lifted for worldgen review)
    this.selection = null // { type:'build', deployableId } while placing
    this.log = []
    this.lastCombat = null
    this.enemyCard = null
    this.rerollTokens = 0
    this.rerollsUsed = 0

    this.resources = { ...META.startResources }
    this.legitimacy = META.startLegitimacy
    this.era = 0
    this.unlocksThisEra = 0
    this.taken = new Set()
    // per-turn accumulators (Oral Tradition army growth, Hereditary Rule palace growth)
    this.armyAccum = { land: { atk: 0, def: 0, bomb: 0 }, sea: { atk: 0, def: 0, bomb: 0 }, sky: { atk: 0, def: 0, bomb: 0 }, space: { atk: 0, def: 0, bomb: 0 } }
    this.palaceAccum = { production: 0, gold: 0, food: 0, progress: 0 }
    // Mercenaries: gold bought this turn for the NEXT wave only (temporary). Attack per
    // domain, plus def granted by Diplomatic Marriage / Defensive Pact. Cleared each wave.
    this.mercAtk = { land: 0, sea: 0, sky: 0, space: 0 }
    this.mercDef = { land: 0, sea: 0, sky: 0, space: 0 }

    // Board: palace on the chosen home tile, controlled tiles, placed instances.
    this.controlled = new Set([this.palaceKey])
    this.deployed = new Map()
    this.deployed.set(this.palaceKey, { id: 'palace', level: 1, age: 0 })

    this._recomputeMods()
    this._buildOffer()
    this._applyIncome()   // turn 1 income
    this._previewWave()
  }

  // ---- React bridge (arrow fields: passed unbound) ----
  subscribe = (fn) => { this._subs.add(fn); return () => this._subs.delete(fn) }
  getVersion = () => this._version
  _emit() { if (this.creative) this._topUpCreative(); this._version++; for (const fn of this._subs) fn() }
  _topUpCreative() { for (const r of RES) this.resources[r] = CREATIVE_CAP; this.legitimacy = CREATIVE_CAP }

  // ---- Creative Mode (manual testing) ----
  setCreative(on) {
    on = !!on
    if (on === this.creative) return
    if (on) { this._saved = { resources: { ...this.resources }, legitimacy: this.legitimacy } }
    else if (this._saved) { this.resources = { ...this._saved.resources }; this.legitimacy = this._saved.legitimacy; this._saved = null }
    this.creative = on
    this._recomputeMods() // the unlocked/expansions sets depend on creative
    this._previewWave()
    this._emit()
  }
  /** Creative: unlock any technology directly (bypasses the offer and its cost). */
  unlockTechDirect(id) {
    if (!this.creative || !TECHS[id] || this.taken.has(id)) return false
    this.taken.add(id)
    this._applyTechOneShots(id)
    this.unlocksThisEra++
    this._recomputeMods()
    if (this.mods.freeReroll) this.rerollTokens++
    const lastEra = maxContentEra()
    if (this.unlocksThisEra >= META.unlocksPerEra && this.era < lastEra) { this.era++; this.unlocksThisEra = 0 }
    const slot = this.offer.findIndex((o) => o.id === id)
    if (slot >= 0) this.offer.splice(slot, 1)
    this._previewWave()
    this._emit()
    return true
  }

  // ---- helpers ----
  tileAt(k) { return this.world.byKey.get(k) }
  instAt(k) { return this.deployed.get(k) || null }
  ownedCount(id) { let n = 0; for (const v of this.deployed.values()) if (v.id === id) n++; return n }
  /** One-shot effects that fire once when a tech is unlocked (Calendar's wave delay). */
  _applyTechOneShots(id) {
    for (const e of TECHS[id].effects || []) if (e.name === 'delay_next_wave') this.waveDelay += (e.amount || 1)
  }
  /** Turns until the next enemy wave actually fires (accounts for Calendar delays). */
  turnsUntilWave() {
    let base = (META.waveInterval - (this.turn % META.waveInterval)) % META.waveInterval
    if (this.waveDelay > 0) base += META.waveInterval // the upcoming wave turn will be skipped
    return base
  }
  uniqueOwned() { const s = new Set(); for (const v of this.deployed.values()) if (v.id !== 'palace') s.add(v.id); return s.size }
  militaryCount() { let n = 0; for (const v of this.deployed.values()) if (DEPLOYABLES[v.id].type === 'unit') n++; return n }

  neighborKeys(k) {
    const { q, r } = parse(k)
    return neighbors(q, r).map((n) => hkey(n.q, n.r)).filter((nk) => this.world.byKey.has(nk))
  }

  // ---- modifiers aggregated from taken techs ----
  _recomputeMods() {
    const m = {
      tileYield: {}, tileYieldMult: {}, unitsProduce: {}, upkeepReduction: 0, prodCost: { all: 0, building: 0 },
      palaceYield: {}, palaceMult: 1, vision: 0, armyFlat: [], armyFromLegit: [], onCombat: [], perUnique: {},
      settlementYield: {}, buildingSubtypeYield: {}, progressCostMult: 1,
      subtypeCombatMult: {}, subtypeCombatFlat: [], goldInterest: 0,
      armyPerSameType: [], foodDistanceFactor: 1, emptyTileCombat: [], tradeNetworks: false,
      progressPerFlavor: {}, keepNaturalProduction: false, armyGrowth: [], palaceRandomGrowth: 0,
      yieldMult: [], subtypeConvert: [], armyFromSettlement: [],
      terrainAdjSettlement: [], tileYieldFactor: {}, isolatedMult: [], subtypeCombatFromOutput: [],
      regionYieldMult: [], bridges: new Set(),
      mercenaries: false, mercDefPerHire: 0,
      critPerRanged: 0, crossBombard: [],
      regions: new Set(),
      freeReroll: false,
    }
    const unlocked = new Set(['palace', ...(META.startDeployables || [])])
    const expansions = new Set()
    for (const id of this.taken) {
      for (const e of TECHS[id].effects || []) {
        switch (e.name) {
          case 'tile_yield': (m.tileYield[e.terrain] ||= {})[e.resource] = (m.tileYield[e.terrain][e.resource] || 0) + e.amount; break
          case 'unlock_deployable': unlocked.add(e.deployable); break
          case 'enable_expansion': expansions.add(e.terrain); break
          case 'enable_region': m.regions.add(e.region); break
          case 'enable_bridge': m.bridges.add(e.terrain); break
          case 'units_produce': m.unitsProduce[e.resource] = (m.unitsProduce[e.resource] || 0) + e.amount; break
          case 'palace_yield_flat': {
            const list = e.resource === 'all' ? RES : [e.resource]
            for (const r of list) m.palaceYield[r] = (m.palaceYield[r] || 0) + e.amount
            break
          }
          case 'upkeep_reduction': m.upkeepReduction += e.amount; break
          case 'production_cost_reduction': m.prodCost[e.scope || 'all'] += e.amount; break
          case 'army_combat_flat': m.armyFlat.push({ stat: e.stat, domain: e.domain, amount: e.amount }); break
          case 'on_combat_result': m.onCombat.push(e); break
          case 'per_unique_era_deployable': m.perUnique[e.resource] = (m.perUnique[e.resource] || 0) + e.amount; break
          case 'vision_bonus': m.vision += e.amount; break
          case 'settlement_yield': m.settlementYield[e.resource] = (m.settlementYield[e.resource] || 0) + e.amount; break
          case 'building_subtype_yield': (m.buildingSubtypeYield[e.subtype] ||= {})[e.resource] = (m.buildingSubtypeYield[e.subtype][e.resource] || 0) + e.amount; break
          case 'palace_yield_mult': m.palaceMult *= e.factor; break
          case 'tile_yield_mult': (m.tileYieldMult[e.terrain] ||= {})[e.resource] = (m.tileYieldMult[e.terrain][e.resource] || 1) * e.factor; break
          case 'progress_cost_mult': m.progressCostMult *= e.factor; break
          case 'army_from_legitimacy': m.armyFromLegit.push({ stat: e.stat, domain: e.domain, divisor: e.divisor }); break
          case 'subtype_combat_mult': m.subtypeCombatMult[e.subtype] = (m.subtypeCombatMult[e.subtype] || 1) * e.factor; break
          case 'subtype_combat_flat': m.subtypeCombatFlat.push({ subtype: e.subtype, domain: e.domain, stat: e.stat, amount: e.amount }); break
          case 'gold_interest': m.goldInterest += e.amount ?? e.factor; break
          case 'army_per_same_type': m.armyPerSameType.push({ stat: e.stat, amount: e.amount }); break
          case 'food_distance_discount': m.foodDistanceFactor *= e.factor; break
          case 'empty_tile_combat': m.emptyTileCombat.push({ domain: e.domain, stat: e.stat, amount: e.amount }); break
          case 'trade_networks': m.tradeNetworks = true; break
          case 'progress_per_flavor': m.progressPerFlavor[e.flavor] = (m.progressPerFlavor[e.flavor] || 0) + e.amount; break
          case 'keep_natural_production': m.keepNaturalProduction = true; break
          case 'army_growth_per_turn': m.armyGrowth.push({ stat: e.stat, domain: e.domain, amount: e.amount }); break
          case 'palace_random_growth': m.palaceRandomGrowth += e.amount; break
          case 'subtype_yield_mult': m.yieldMult.push({ subtype: e.subtype, deployable: e.deployable, resource: e.resource, factor: e.factor }); break
          case 'subtype_convert_yield': m.subtypeConvert.push({ subtype: e.subtype, deployable: e.deployable, from: e.from, to: e.to }); break
          case 'army_from_settlement_output': m.armyFromSettlement.push({ stat: e.stat, domain: e.domain }); break
          case 'terrain_adjacent_settlement': m.terrainAdjSettlement.push({ terrain: e.terrain, resource: e.resource, amount: e.amount }); break
          case 'override_tile_yield_factor': m.tileYieldFactor[e.deployable] = e.factor; break
          case 'subtype_isolated_mult': m.isolatedMult.push({ subtype: e.subtype, deployable: e.deployable, factor: e.factor }); break
          case 'subtype_combat_from_output': m.subtypeCombatFromOutput.push({ subtype: e.subtype, deployable: e.deployable, from: e.from, domain: e.domain }); break
          case 'region_yield_mult': m.regionYieldMult.push({ region: e.region, subtype: e.subtype, deployable: e.deployable, resource: e.resource, factor: e.factor }); break
          case 'enable_mercenaries': m.mercenaries = true; break
          case 'merc_def_per_hire': m.mercDefPerHire += e.amount; break
          case 'crit_per_ranged': m.critPerRanged += (e.percent || 0) / 100; break
          case 'cross_domain_bombard': m.crossBombard.push({ from: e.from, to: e.to }); break
          case 'delay_next_wave': break // one-shot, applied at unlock time
          case 'free_reroll_on_progress': m.freeReroll = true; break
          default: break
        }
      }
    }
    if (this.creative) { for (const id in DEPLOYABLES) unlocked.add(id); for (const t of Object.values(TERRAIN)) if (t.unlock) expansions.add(t.id); for (const rg of GATED_REGIONS) m.regions.add(rg); for (const b of BRIDGE_TERRAINS) m.bridges.add(b) }
    this.mods = m
    this.unlocked = unlocked
    this.expansions = expansions
  }

  // ---- economy ----
  terrainYield(t) {
    const def = TERRAIN[t.terrain]
    if (!def) return {} // terrain rendered on the map but not in the economy (space/ocean/…)
    const base = { ...(def.yield || {}) }
    const bonus = this.mods.tileYield[t.terrain]
    if (bonus) for (const r in bonus) base[r] = (base[r] || 0) + bonus[r]
    const mult = this.mods.tileYieldMult[t.terrain]
    if (mult) for (const r in mult) base[r] = (base[r] || 0) * mult[r]
    if (t.region === 'new_world') for (const r in base) base[r] *= 2 // New World tiles yield double
    return base
  }
  adjCount(k, filter) {
    let n = 0
    for (const nk of this.neighborKeys(k)) {
      const t = this.world.byKey.get(nk)
      const inst = this.deployed.get(nk)
      const dep = inst && DEPLOYABLES[inst.id]
      switch (filter) {
        case 'building': if (dep && dep.type === 'building') n++; break
        case 'settlement': if (dep && dep.subtype === 'settlement') n++; break
        case 'military': if (dep && dep.type === 'unit') n++; break
        case 'forest_or_mountain': if (t.terrain === 'forest' || t.terrain === 'mountain') n++; break
        case 'water': if (t.terrain === 'coast' || t.terrain === 'ocean' || t.terrain === 'river') n++; break
        case 'hills': if (t.terrain === 'hills') n++; break
        case 'desert': if (t.terrain === 'desert') n++; break
        case 'mountain': if (t.terrain === 'mountain') n++; break
        case 'any': n++; break
        default: break
      }
    }
    return n
  }
  _countTerrainInRange(k, terrain, range) {
    const { q, r } = parse(k)
    let n = 0
    for (const h of disc(q, r, range)) { const o = this.world.byKey.get(hkey(h.q, h.r)); if (o && o.terrain === terrain) n++ }
    return n
  }
  _countProgressTilesInRange(k, range) {
    const { q, r } = parse(k)
    let n = 0
    for (const h of disc(q, r, range)) {
      const nk = hkey(h.q, h.r)
      if (!this.controlled.has(nk)) continue
      const t = this.world.byKey.get(nk); const inst = this.deployed.get(nk)
      const prog = inst ? (DEPLOYABLES[inst.id].subtype === 'progress' || (DEPLOYABLES[inst.id].econ || []).some((e) => e.resource === 'progress')) : (this.terrainYield(t).progress || 0) > 0
      if (prog) n++
    }
    return n
  }
  /** Sum of the natural terrain yield of `resource` over controlled tiles adjacent to k (Bridge). */
  _adjacentTileYield(k, resource) {
    let sum = 0
    for (const nk of this.neighborKeys(k)) {
      if (!this.controlled.has(nk)) continue
      const y = this.terrainYield(this.world.byKey.get(nk))
      sum += y[resource] || 0
    }
    return sum
  }
  _settlementOutputTotal() {
    let sum = 0
    for (const [k, v] of this.deployed) if (DEPLOYABLES[v.id].subtype === 'settlement') { const o = this.tileOutput(k); if (o) for (const rr in o) sum += o[rr] }
    return sum
  }
  computeEconomy() {
    const income = { production: 0, gold: 0, food: 0, progress: 0, legitimacy: 0 }
    const palaceInc = { production: 0, gold: 0, food: 0, progress: 0, legitimacy: 0 }
    let upkeep = 0
    // controlled tiles: natural yield if empty, else the deployable's econ. The palace
    // accumulates separately so its whole yield can be multiplied (Absolute Monarchy).
    for (const k of this.controlled) {
      const t = this.world.byKey.get(k)
      const inst = this.deployed.get(k)
      if (!inst) {
        const y = this.terrainYield(t)
        for (const r in y) income[r] += y[r]
        // Feudalism: a producing terrain tile adjacent to a settlement gains extra yield.
        for (const fs of this.mods.terrainAdjSettlement) {
          if (t.terrain === fs.terrain && (y[fs.resource] || 0) > 0 && this.adjCount(k, 'settlement') > 0) income[fs.resource] += fs.amount
        }
        continue
      }
      const dep = DEPLOYABLES[inst.id]
      if (!dep.unique) upkeep += Math.max(0, dep.upkeep - this.mods.upkeepReduction)
      const bucket = k === this.palaceKey ? palaceInc : income
      const out = { production: 0, gold: 0, food: 0, progress: 0, legitimacy: 0 }
      // Ecology: a deployable no longer removes the tile's natural production.
      if (this.mods.keepNaturalProduction && k !== this.palaceKey) { const y = this.terrainYield(t); if (y.production) out.production += y.production }
      for (const e of dep.econ || []) {
        switch (e.name) {
          case 'self_yield': out[e.resource] += e.amount; break
          case 'per_adjacent': out[e.resource] += e.amount * this.adjCount(k, e.filter); break
          case 'growth_per_turn': out[e.resource] += e.amount * (inst.age || 0); break
          case 'count_scaling': out[e.resource] += e.amount * this.ownedCount(inst.id); break
          case 'double_tile_yield': { const y = this.terrainYield(t); const f = this.mods.tileYieldFactor[inst.id] || 2; for (const r in y) out[r] += y[r] * f; break }
          case 'gold_from_army': out.gold += Math.ceil(this.playerScalars().land.atk * (e.percent / 100)); break
          case 'self_per_terrain_in_range': out[e.resource] += e.amount * this._countTerrainInRange(k, e.terrain, e.range); break
          case 'self_per_progress_tile_in_range': out[e.resource] += e.amount * this._countProgressTilesInRange(k, e.range); break
          case 'aura_tile_yield_mult': out[e.resource] += (e.factor - 1) * this._adjacentTileYield(k, e.resource); break
          default: break
        }
      }
      // buildings of a subtype boosted by tech (Alphabet, Specialization…)
      if (dep.type === 'building') {
        const by = this.mods.buildingSubtypeYield[dep.subtype]
        if (by) for (const r in by) out[r] += by[r]
      }
      // deployable-intrinsic conditional multiplier (Monastery: halved if any adjacent building)
      for (const e of dep.econ || []) if (e.name === 'self_output_mult_if_adjacent' && this.adjCount(k, e.filter) > 0) for (const r in out) out[r] *= e.factor
      // tech conversions (Monotheism: temple gold = its progress) then multipliers (Tithing, Citizenship, Scientific Method)
      const hit = (m) => m.deployable ? dep.id === m.deployable : dep.subtype === m.subtype
      for (const cv of this.mods.subtypeConvert) if (hit(cv)) out[cv.to] += out[cv.from] || 0
      for (const mv of this.mods.yieldMult) if (hit(mv)) { if (mv.resource === 'all') { for (const r in out) out[r] *= mv.factor } else out[mv.resource] *= mv.factor }
      // Pilgrimage: shrine with no adjacent building multiplies its whole output.
      for (const im of this.mods.isolatedMult) if (hit(im) && this.adjCount(k, 'building') === 0) for (const r in out) out[r] *= im.factor
      // Evangelism: multiply matching deployables' output on a given region (New World temples).
      for (const rm of this.mods.regionYieldMult) if (hit(rm) && t.region === rm.region) { if (rm.resource === 'all') { for (const r in out) out[r] *= rm.factor } else out[rm.resource] *= rm.factor }
      for (const r in out) bucket[r] += out[r]
    }
    // palace flat bonuses + accrued Hereditary Rule growth, then the whole palace yield ×palaceMult
    if (this.deployed.has(this.palaceKey)) {
      for (const r in this.mods.palaceYield) palaceInc[r] += this.mods.palaceYield[r]
      for (const r in this.palaceAccum) palaceInc[r] += this.palaceAccum[r]
      for (const r in palaceInc) income[r] += palaceInc[r] * this.mods.palaceMult
    }
    // per-settlement yields (Democracy, Census, Slavery…)
    if (Object.keys(this.mods.settlementYield).length) {
      let settlements = 0
      for (const v of this.deployed.values()) if (DEPLOYABLES[v.id].subtype === 'settlement') settlements++
      for (const r in this.mods.settlementYield) income[r] += this.mods.settlementYield[r] * settlements
    }
    // Trade Networks: gold equal to the farthest controlled ring from the palace.
    if (this.mods.tradeNetworks) {
      let far = 0
      for (const k of this.controlled) { const r = this.ringFromPalace(this.world.byKey.get(k)); if (r > far) far = r }
      income.gold += far
    }
    // Philosophy: +progress per owned tech of a flavor.
    if (Object.keys(this.mods.progressPerFlavor).length) {
      const byFlavor = {}
      for (const id of this.taken) { const f = TECHS[id]?.flavor; if (f) byFlavor[f] = (byFlavor[f] || 0) + 1 }
      for (const f in this.mods.progressPerFlavor) income.progress += this.mods.progressPerFlavor[f] * (byFlavor[f] || 0)
    }
    // units-produce + per-unique-era
    const mil = this.militaryCount()
    for (const r in this.mods.unitsProduce) income[r] += this.mods.unitsProduce[r] * mil
    const uniq = this.uniqueOwned()
    for (const r in this.mods.perUnique) income[r] += this.mods.perUnique[r] * uniq
    return { income, upkeep }
  }
  /** Per-turn accruals: Oral Tradition (army +atk) and Hereditary Rule (palace +random). */
  _accrueGrowth() {
    for (const g of this.mods.armyGrowth) {
      const ds = g.domain === 'all' ? DOMAINS : [g.domain]
      for (const d of ds) this.armyAccum[d][g.stat] += g.amount
    }
    if (this.mods.palaceRandomGrowth) {
      const rs = RES
      const r = rs[Math.floor(rng((this.seed ^ (this.turn * 7919)) >>> 0)() * rs.length)]
      this.palaceAccum[r] += this.mods.palaceRandomGrowth
    }
  }
  _applyIncome() {
    for (const inst of this.deployed.values()) inst.age = (inst.age || 0) + 1
    const { income, upkeep } = this.computeEconomy()
    for (const r of RES) this.resources[r] += income[r]
    this.resources.gold -= upkeep
    this.legitimacy += income.legitimacy
    if (this.mods.goldInterest && this.resources.gold > 0) this.resources.gold += Math.floor(this.resources.gold * this.mods.goldInterest)
  }

  // ---- combat scalar aggregation ----
  _instScalars(k, inst) {
    const dep = DEPLOYABLES[inst.id]
    const t = this.world.byKey.get(k)
    const out = emptyScalars()
    for (const c of dep.combat || []) if (c.name === 'combat_scalar') out[c.domain][c.stat] += c.amount
    for (const c of dep.combat || []) {
      if (c.name === 'combat_count_scaling') out[c.domain][c.stat] += c.amount * this.ownedCount(inst.id)
      else if (c.name === 'combat_per_adjacent') out[c.domain][c.stat] += c.amount * this._adjCombat(k, inst, c.filter)
      else if (c.name === 'combat_on_terrain' && t.terrain === c.terrain) {
        if (c.mode === 'double') out[c.domain][c.stat] += out[c.domain][c.stat]
        else out[c.domain][c.stat] += c.amount || 0
      } else if (c.name === 'combat_mult_empty_adjacent') {
        let empty = 0
        for (const nk of this.neighborKeys(k)) { const nt = this.world.byKey.get(nk); if (nt.terrain === c.terrain && !this.deployed.has(nk)) empty++ }
        out[c.domain][c.stat] = out[c.domain][c.stat] * empty
      } else if (c.name === 'combat_when_surrounded') {
        const nks = this.neighborKeys(k)
        if (nks.length && nks.every((nk) => this.deployed.has(nk))) out[c.domain][c.stat] += c.amount
      } else if (c.name === 'combat_from_legitimacy') {
        out[c.domain][c.stat] += Math.floor(this.legitimacy / c.divisor)
      } else if (c.name === 'combat_per_empty_tile') {
        let empties = 0
        for (const ck of this.controlled) if (!this.deployed.has(ck)) empties++
        out[c.domain][c.stat] += c.amount * empties
      }
    }
    const db = TERRAIN[t.terrain].defBonus || 0
    if (db) out.land.def += db
    // Tribalism: every unit +scalar per OTHER unit of the same type.
    if (dep.type === 'unit') for (const a of this.mods.armyPerSameType) out.land[a.stat] += a.amount * Math.max(0, this.ownedCount(inst.id) - 1)
    // per-subtype flat bonuses (Bayonets, Hedgerows…) applied before the subtype multiplier
    for (const f of this.mods.subtypeCombatFlat) if (f.subtype === dep.subtype) out[f.domain][f.stat] += f.amount
    // Inquisition: a deployable gains atk & def equal to one of its own outputs.
    if (this.mods.subtypeCombatFromOutput.length) {
      const oh = (m) => m.deployable ? dep.id === m.deployable : dep.subtype === m.subtype
      for (const f of this.mods.subtypeCombatFromOutput) {
        if (!oh(f)) continue
        const o = this.tileOutput(k)
        const v = (o && o[f.from]) || 0
        out[f.domain].atk += v; out[f.domain].def += v
      }
    }
    // tech multipliers on a whole subtype (Flying Buttress, Shipbuilding…)
    const smult = this.mods.subtypeCombatMult[dep.subtype]
    if (smult) for (const d of DOMAINS) for (const st of ['atk', 'def', 'bomb']) out[d][st] *= smult
    return out
  }
  _adjCombat(k, inst, filter) {
    let n = 0
    for (const nk of this.neighborKeys(k)) {
      const ni = this.deployed.get(nk)
      if (!ni) continue
      const nd = DEPLOYABLES[ni.id]
      switch (filter) {
        case 'fortification': if (nd.subtype === 'defense') n++; break
        case 'building': if (nd.type === 'building') n++; break
        case 'same_type': if (ni.id === inst.id) n++; break
        case 'cavalry': if (nd.subtype === 'cavalry') n++; break
        case 'military': if (nd.type === 'unit') n++; break
        default: break
      }
    }
    return n
  }
  playerScalars() {
    const s = emptyScalars()
    for (const [k, inst] of this.deployed) {
      const cs = this._instScalars(k, inst)
      for (const d of DOMAINS) for (const st of ['atk', 'def', 'bomb']) s[d][st] += cs[d][st]
    }
    const mil = this.militaryCount()
    for (const f of this.mods.armyFlat) {
      const ds = f.domain === 'all' ? DOMAINS : [f.domain]
      for (const d of ds) s[d][f.stat] += f.amount * mil
    }
    // army bonus scaled from legitimacy (Crusades, Nationalism) — applied once
    for (const f of this.mods.armyFromLegit) {
      const add = Math.floor(this.legitimacy / f.divisor)
      const ds = f.domain === 'all' ? DOMAINS : [f.domain]
      for (const d of ds) s[d][f.stat] += add
    }
    // Sacred Grounds: empty controlled tiles add combat.
    if (this.mods.emptyTileCombat.length) {
      let empties = 0
      for (const k of this.controlled) if (!this.deployed.has(k)) empties++
      for (const f of this.mods.emptyTileCombat) s[f.domain][f.stat] += f.amount * empties
    }
    // accrued army growth (Oral Tradition)
    for (const d of DOMAINS) for (const st of ['atk', 'def', 'bomb']) s[d][st] += this.armyAccum[d][st]
    // Civil Service: army scalar equal to total settlement output.
    if (this.mods.armyFromSettlement.length) {
      const so = this._settlementOutputTotal()
      for (const f of this.mods.armyFromSettlement) { const ds = f.domain === 'all' ? DOMAINS : [f.domain]; for (const d of ds) s[d][f.stat] += so }
    }
    // gold-debt penalty: negative gold subtracts that much from every scalar
    const debt = this.resources.gold < 0 ? -this.resources.gold : 0
    if (debt) for (const d of DOMAINS) for (const st of ['atk', 'def', 'bomb']) s[d][st] = Math.max(0, s[d][st] - debt)
    return s
  }

  // ---- mercenaries (Hospitality Rites, Embassy, Diplomatic Marriage, Defensive Pact) ----
  mercUnlocked() { return this.creative || this.mods.mercenaries }
  mercCostOf(domain) { return MERC_COST[domain] }
  /** Domains where we already field some military presence (required to hire there). */
  domainPresence() {
    const p = { land: false, sea: false, sky: false, space: false }
    for (const [k, inst] of this.deployed) { const cs = this._instScalars(k, inst); for (const d of DOMAINS) if (cs[d].atk || cs[d].def || cs[d].bomb) p[d] = true }
    if (this.militaryCount() > 0) for (const f of this.mods.armyFlat) { const ds = f.domain === 'all' ? DOMAINS : [f.domain]; for (const d of ds) p[d] = true }
    return p
  }
  /** Free attack (+matching def from Marriage/Pact) auto-hired by every Embassy each combat. */
  _embassyMercAttack() {
    let atk = 0
    for (const [k, inst] of this.deployed) for (const c of DEPLOYABLES[inst.id].combat || []) {
      if (c.name !== 'auto_mercenaries') continue
      let unc = 0
      for (const nk of this.neighborKeys(k)) if (!this.controlled.has(nk)) unc++
      atk += (c.base || 0) + (c.per_uncontrolled || 0) * unc
    }
    return { atk, def: atk * this.mods.mercDefPerHire }
  }
  /** Buy `count` temporary attack in a domain with gold. Returns how many were hired. */
  hireMerc(domain, count = 1) {
    if (!this.mercUnlocked() || this.status !== 'playing' || !DOMAINS.includes(domain)) return 0
    if (!this.domainPresence()[domain]) return 0
    const unit = MERC_COST[domain]
    let hired = 0
    for (let i = 0; i < count; i++) {
      if (this.resources.gold < unit) break
      this.resources.gold -= unit
      this.mercAtk[domain] += 1
      this.mercDef[domain] += this.mods.mercDefPerHire
      hired++
    }
    if (hired) this._emit()
    return hired
  }
  resetMercs() { this.mercAtk = { land: 0, sea: 0, sky: 0, space: 0 }; this.mercDef = { land: 0, sea: 0, sky: 0, space: 0 } }
  /** Effective combat scalars the player fights with: board army + hired + Embassy mercs.
   *  The enemy card is generated from playerScalars (board only), so mercs are a real edge. */
  _rangedCount() { let n = 0; for (const v of this.deployed.values()) if (DEPLOYABLES[v.id].subtype === 'ranged') n++; return n }
  combatScalars() {
    const s = this.playerScalars()
    for (const d of DOMAINS) { s[d].atk += this.mercAtk[d]; s[d].def += this.mercDef[d] }
    const emb = this._embassyMercAttack()
    if (emb.atk) for (const d of DOMAINS) { s[d].atk += emb.atk; s[d].def += emb.def }
    // Composite Bows: expected-value crit — all player damage (atk & bomb) scaled by 1% per ranged unit.
    if (this.mods.critPerRanged > 0) {
      const m = 1 + this.mods.critPerRanged * this._rangedCount()
      for (const d of DOMAINS) { s[d].atk = Math.round(s[d].atk * m); s[d].bomb = Math.round(s[d].bomb * m) }
    }
    // Physics: one domain's bombardment also strikes another (land → sea).
    for (const cb of this.mods.crossBombard) s[cb.to].bomb += s[cb.from].bomb
    return s
  }
  /** Snapshot for the merc UI: cost, presence, and current hires per domain. */
  mercInfo() {
    const pres = this.domainPresence()
    const emb = this._embassyMercAttack()
    return DOMAINS.map((d) => ({
      domain: d, cost: MERC_COST[d], present: pres[d], atk: this.mercAtk[d], def: this.mercDef[d],
      canAfford1: this.resources.gold >= MERC_COST[d], embassy: emb.atk,
    }))
  }

  // ---- territory ----
  visionSet() {
    const starts = [...this.controlled].map((k) => parse(k))
    const dist = bfs(starts, (q, r) => this.world.byKey.has(hkey(q, r)), 1 + this.mods.vision)
    return new Set(dist.keys())
  }
  /** Connected components of each bridge terrain, cached (terrain is static per game).
   *  Each = { terrain, members:Set(body tiles), shore:Set(tiles touching the body) }. */
  _bridgeComponents() {
    if (this._bridgeCompCache) return this._bridgeCompCache
    const comps = []
    const seen = new Set()
    for (const t of this.world.tiles) {
      if (!BRIDGE_TERRAINS.includes(t.terrain) || seen.has(t.key)) continue
      const members = new Set(); const shore = new Set(); const queue = [t.key]; seen.add(t.key)
      while (queue.length) {
        const ck = queue.pop(); members.add(ck)
        for (const nk of this.neighborKeys(ck)) {
          const nt = this.world.byKey.get(nk)
          if (nt.terrain === t.terrain) { if (!seen.has(nk)) { seen.add(nk); queue.push(nk) } }
          else shore.add(nk)
        }
      }
      comps.push({ terrain: t.terrain, members, shore })
    }
    this._bridgeCompCache = comps
    return comps
  }
  /** The frontier you may settle: tiles ADJACENT to controlled (keeps the empire
   *  connected), PLUS — once a body's bridge tech is owned — every shore of any
   *  connected ocean/space body you already touch (Astronomy/Satelites/… let you cross). */
  expandFrontier() {
    const out = new Set()
    for (const k of this.controlled) for (const nk of this.neighborKeys(k)) if (!this.controlled.has(nk)) out.add(nk)
    if (this.mods.bridges.size) {
      for (const comp of this._bridgeComponents()) {
        if (!this.mods.bridges.has(comp.terrain)) continue
        if (![...comp.shore].some((s) => this.controlled.has(s))) continue // must already touch this body
        for (const s of comp.shore) if (!this.controlled.has(s)) out.add(s)
      }
    }
    return out
  }
  ringFromPalace(t) { return lengthOf(t.q - this.world.palace.q, t.r - this.world.palace.r) }
  expandCost(t) {
    const ter = TERRAIN[t.terrain]
    const dist = Math.floor(Math.max(0, this.ringFromPalace(t) - 1) * this.mods.foodDistanceFactor)
    return ter.expandBase + dist
  }
  expandTargets() {
    const out = []
    for (const k of this.expandFrontier()) {
      const t = this.world.byKey.get(k)
      const ter = TERRAIN[t.terrain]
      if (!ter) continue // only content terrains are settleable (Earth land + coast)
      if (ter.unlock && !this.expansions.has(t.terrain)) continue
      if (GATED_REGIONS.has(t.region) && !this.mods.regions.has(t.region)) continue // Colonialism gates the New World
      const cost = this.expandCost(t)
      out.push({ key: k, terrain: t.terrain, cost, affordable: this.resources.food >= cost })
    }
    return out
  }
  expandAt(k) {
    if (this.status !== 'playing') return false
    const t = this.tileAt(k)
    if (!t || this.controlled.has(k)) return false
    if (!this.expandFrontier().has(k)) return false // must stay connected (direct or bridged)
    const ter = TERRAIN[t.terrain]
    if (!ter) return false
    if (ter.unlock && !this.expansions.has(t.terrain)) return false
    if (GATED_REGIONS.has(t.region) && !this.mods.regions.has(t.region)) return false
    const cost = this.expandCost(t)
    if (this.resources.food < cost) return false
    this.resources.food -= cost
    this.controlled.add(k)
    this._previewWave()
    this._emit()
    return true
  }

  // ---- building ----
  buildCost(id) {
    const dep = DEPLOYABLES[id]
    const ramp = ((n) => (n <= 1 ? 0 : 1 + ((n - 2) * (n - 1)) / 2))(this.ownedCount(id) + 1)
    const red = dep.type === 'building' ? this.mods.prodCost.all + this.mods.prodCost.building : this.mods.prodCost.all
    return Math.max(0, dep.production + ramp - red)
  }
  canBuild(id) { return this.unlocked.has(id) && this.status === 'playing' && this.resources.production >= this.buildCost(id) }
  beginBuild(id) { if (this.canBuild(id)) { this.selection = { type: 'build', deployableId: id }; this._emit() } }
  cancelSelection() { if (this.selection) { this.selection = null; this._emit() } }
  placementValid(id, k) {
    const t = this.tileAt(k)
    if (!t || !this.controlled.has(k) || this.deployed.has(k)) return false
    const ter = TERRAIN[t.terrain]
    if (!ter) return false
    const p = DEPLOYABLES[id].placement || {}
    const kind = ter.kind
    if (p.kind === 'land' && kind !== 'land') return false
    if (p.kind === 'water' && kind !== 'water') return false
    if (p.only && !p.only.includes(t.terrain)) return false
    if (p.not && p.not.includes(t.terrain)) return false
    return true
  }
  placeAt(k) {
    const sel = this.selection
    if (!sel || sel.type !== 'build') return false
    const id = sel.deployableId
    if (!this.placementValid(id, k)) return false
    const cost = this.buildCost(id)
    if (this.resources.production < cost) return false
    this.resources.production -= cost
    this.deployed.set(k, { id, level: 1, age: 0 })
    // one-shot on-build effects (Cathedral +legitimacy…)
    for (const e of DEPLOYABLES[id].build || []) {
      if (e.name === 'on_build') { if (e.resource === 'legitimacy') this.legitimacy += e.amount; else this.resources[e.resource] += e.amount }
    }
    this.selection = null
    this._previewWave()
    this._emit()
    return true
  }

  // ---- tech draft ----
  _buildOffer() {
    const rand = rng(this.seed ^ (this.turn * 0x9e3779b1))
    const main = drawWeighted(eraPool(this.era, this.taken), 3, rand).map((t) => ({ id: t.id, wildcard: false }))
    const offer = [...main]
    if (META.wildcardOption) {
      const w = pick(wildcardPool(this.era, this.taken), rand)
      if (w) offer.push({ id: w.id, wildcard: true })
    }
    this.offer = offer
  }
  progressCostOf(era) { return Math.floor(progressCost(eraIndex(era)) * (this.mods.progressCostMult || 1)) }
  offerData() {
    return this.offer.map((o) => {
      const t = TECHS[o.id]
      const cost = this.progressCostOf(t.era)
      return { ...o, tech: t, cost, affordable: this.resources.progress >= cost }
    })
  }
  unlockTech(id) {
    const slot = this.offer.findIndex((o) => o.id === id)
    if (slot < 0 || this.status !== 'playing') return false
    const t = TECHS[id]
    const cost = this.progressCostOf(t.era)
    if (this.resources.progress < cost) return false
    this.resources.progress -= cost
    this.taken.add(id)
    this._applyTechOneShots(id)
    this.unlocksThisEra++
    this._recomputeMods()
    if (this.mods.freeReroll) this.rerollTokens++
    // advance era after enough unlocks (only while a later era still has content)
    const lastEra = maxContentEra()
    if (this.unlocksThisEra >= META.unlocksPerEra && this.era < lastEra) { this.era++; this.unlocksThisEra = 0 }
    // The offer does NOT refill on unlock — consume the slot. A fresh 3 (+wildcard)
    // are drawn at the start of the next turn.
    this.offer.splice(slot, 1)
    this._previewWave()
    this._emit()
    return true
  }
  _redrawSlot(slot) {
    const o = this.offer[slot]
    const inOffer = new Set(this.offer.map((x) => x.id))
    const rand = rng(this.seed ^ (this.turn * 131 + slot * 977 + this.taken.size * 17))
    const poolFn = o && o.wildcard ? wildcardPool(this.era, this.taken) : eraPool(this.era, this.taken)
    const fresh = poolFn.filter((t) => !inOffer.has(t.id))
    const p = pick(fresh, rand)
    if (p) this.offer[slot] = { id: p.id, wildcard: !!(o && o.wildcard) }
    else this.offer.splice(slot, 1)
  }
  reroll(slot) {
    if (this.status !== 'playing' || slot < 0 || slot >= this.offer.length) return false
    if (this.rerollTokens > 0) this.rerollTokens--
    else { const c = 5 + 5 * this.rerollsUsed; if (this.resources.gold < c) return false; this.resources.gold -= c; this.rerollsUsed++ }
    this._redrawSlot(slot)
    this._emit()
    return true
  }

  // ---- waves ----
  _waveRng(n) { return rng((this.seed ^ (n * 0x27d4eb2f)) >>> 0) }
  _previewWave() {
    const n = this.waveCount + 1
    const pv = armyValue(this.playerScalars())
    this.enemyCard = generateEnemyCard(pv, n, ENEMY, this._waveRng(n))
    this.enemyCard.wave = n
    this.waveDueIn = (META.waveInterval - (this.turn % META.waveInterval)) % META.waveInterval || 0
  }
  isWaveTurn() { return this.turn % META.waveInterval === 0 }
  _resolveWave() {
    const n = this.waveCount + 1
    const P = this.playerScalars()       // board army — the enemy card scales to THIS
    const enemy = generateEnemyCard(armyValue(P), n, ENEMY, this._waveRng(n))
    const C = this.combatScalars()       // board + mercenaries — what actually fights
    const result = resolveCombat(C, enemy.scalars)
    this.resources.gold += result.goldGained
    this.legitimacy -= result.legitimacyLost
    // event-triggered techs
    let bonus = { production: 0, gold: 0, food: 0, progress: 0, legitimacy: 0 }
    for (const e of this.mods.onCombat) {
      const list = e.when === 'win' ? result.won : result.lost
      const times = e.per === 'domain' ? list.length : (list.length > 0 ? 1 : 0)
      if (times) bonus[e.resource] = (bonus[e.resource] || 0) + e.amount * times
    }
    for (const r of RES) this.resources[r] += bonus[r] || 0
    this.legitimacy += bonus.legitimacy || 0
    this.waveCount++
    this.lastCombat = { wave: n, enemy, player: C, result, bonus }
    this.resetMercs() // temporary hires are spent by this wave
    this.log.unshift(`Wave ${n}: −${result.legitimacyLost} legitimacy, +${result.goldGained} gold`)
    if (this.legitimacy <= 0 && !this.creative) { this.legitimacy = 0; this.status = 'lost' }
  }

  // ---- turn loop ----
  endTurn() {
    if (this.status !== 'playing') return
    this.selection = null
    if (this.isWaveTurn()) {
      if (this.waveDelay > 0) { this.waveDelay--; this.log.unshift(`Turn ${this.turn}: enemy attack delayed (Calendar).`) }
      else this._resolveWave()
    }
    if (this.status !== 'playing') { this._emit(); return }
    this.turn++
    this._accrueGrowth()
    this._applyIncome()
    this._buildOffer()
    this._previewWave()
    this._emit()
  }

  // ---- selectors for UI ----
  /** Per-turn income, upkeep, and net (gold net of upkeep). */
  perTurn() {
    const { income, upkeep } = this.computeEconomy()
    const net = { ...income }
    net.gold -= upkeep
    return { income, upkeep, net }
  }
  /** Per-turn output of the deployable on a tile (only nonzero resources). */
  tileOutput(k) {
    const inst = this.deployed.get(k)
    if (!inst) return null
    const dep = DEPLOYABLES[inst.id]
    const t = this.world.byKey.get(k)
    const out = {}
    const add = (r, v) => { if (v) out[r] = (out[r] || 0) + v }
    for (const e of dep.econ || []) {
      switch (e.name) {
        case 'self_yield': add(e.resource, e.amount); break
        case 'per_adjacent': add(e.resource, e.amount * this.adjCount(k, e.filter)); break
        case 'growth_per_turn': add(e.resource, e.amount * (inst.age || 0)); break
        case 'count_scaling': add(e.resource, e.amount * this.ownedCount(inst.id)); break
        case 'double_tile_yield': { const y = this.terrainYield(t); const f = this.mods.tileYieldFactor[inst.id] || 2; for (const r in y) add(r, y[r] * f); break }
        case 'aura_tile_yield_mult': add(e.resource, (e.factor - 1) * this._adjacentTileYield(k, e.resource)); break
        default: break
      }
    }
    // mirror the tech conversions/multipliers computeEconomy applies, so cards match income
    for (const e of dep.econ || []) if (e.name === 'self_output_mult_if_adjacent' && this.adjCount(k, e.filter) > 0) for (const r in out) out[r] *= e.factor
    const hit = (m) => m.deployable ? dep.id === m.deployable : dep.subtype === m.subtype
    for (const cv of this.mods.subtypeConvert) if (hit(cv)) add(cv.to, out[cv.from] || 0)
    for (const mv of this.mods.yieldMult) if (hit(mv)) { if (mv.resource === 'all') { for (const r in out) out[r] *= mv.factor } else if (out[mv.resource]) out[mv.resource] *= mv.factor }
    for (const im of this.mods.isolatedMult) if (hit(im) && this.adjCount(k, 'building') === 0) for (const r in out) out[r] *= im.factor
    for (const rm of this.mods.regionYieldMult) if (hit(rm) && t.region === rm.region) { if (rm.resource === 'all') { for (const r in out) out[r] *= rm.factor } else if (out[rm.resource]) out[rm.resource] *= rm.factor }
    return out
  }
  /** Combat scalar contribution of the deployable on a tile. */
  instScalars(k) { const inst = this.deployed.get(k); return inst ? this._instScalars(k, inst) : null }
  /** Predicted outcome of the upcoming wave — includes hired + Embassy mercenaries. */
  previewCombat() { return this.enemyCard ? resolveCombat(this.combatScalars(), this.enemyCard.scalars) : null }

  buildableList() {
    return [...this.unlocked].filter((id) => id !== 'palace').map((id) => ({
      id, dep: DEPLOYABLES[id], cost: this.buildCost(id), affordable: this.canBuild(id),
    })).sort((a, b) => eraIndex(a.dep.era) - eraIndex(b.dep.era) || a.dep.name.localeCompare(b.dep.name))
  }
  eraName() { return ERAS[this.era] }
}

function parse(k) { const i = k.indexOf(','); return { q: Number(k.slice(0, i)), r: Number(k.slice(i + 1)) } }
function maxContentEra() {
  let m = 0
  for (const id in TECHS) m = Math.max(m, eraIndex(TECHS[id].era))
  return m
}
