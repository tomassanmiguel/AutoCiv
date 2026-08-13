// AutoCiv v5 — the engine. Framework-free; React reads it through the
// subscribe/getVersion bridge (see react/GameProvider). All game state and the
// turn loop live here; content.json (via data/content.js) drives every mechanic.
import { key as hkey, neighbors, bfs } from './hex/coords.js'
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
    const landNeighbors = (t) => neighbors(t.q, t.r).reduce((n, nb) => {
      const o = w.tiles.get(hkey(nb.q, nb.r)); const d = o && TERRAIN[o.terrain]
      return n + (d && d.kind === 'land' ? 1 : 0)
    }, 0)
    const rand = rng((this.seed ^ 0x50a1ace) >>> 0)
    const plains = w.list.filter((t) => t.terrain === 'plains' && landNeighbors(t) >= 2)
    const home = plains.length ? plains[Math.floor(rand() * plains.length)] : w.tiles.get(hkey(0, 0))
    this.palaceKey = home.key
    this.world.palace = { q: home.q, r: home.r }
    this._subs = new Set()

    this.turn = 1
    this.waveCount = 0
    this.status = 'playing' // 'playing' | 'won' | 'lost'
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
  _emit() { this._version++; for (const fn of this._subs) fn() }

  // ---- helpers ----
  tileAt(k) { return this.world.byKey.get(k) }
  instAt(k) { return this.deployed.get(k) || null }
  ownedCount(id) { let n = 0; for (const v of this.deployed.values()) if (v.id === id) n++; return n }
  uniqueOwned() { const s = new Set(); for (const v of this.deployed.values()) if (v.id !== 'palace') s.add(v.id); return s.size }
  militaryCount() { let n = 0; for (const v of this.deployed.values()) if (DEPLOYABLES[v.id].type === 'unit') n++; return n }

  neighborKeys(k) {
    const { q, r } = parse(k)
    return neighbors(q, r).map((n) => hkey(n.q, n.r)).filter((nk) => this.world.byKey.has(nk))
  }

  // ---- modifiers aggregated from taken techs ----
  _recomputeMods() {
    const m = {
      tileYield: {}, unitsProduce: {}, upkeepReduction: 0, prodCost: { all: 0, building: 0 },
      palaceYield: {}, vision: 0, armyFlat: [], onCombat: [], perUnique: {},
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
          case 'free_reroll_on_progress': m.freeReroll = true; break
          default: break
        }
      }
    }
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
        case 'water': if (t.terrain === 'coast') n++; break
        case 'any': n++; break
        default: break
      }
    }
    return n
  }
  computeEconomy() {
    const income = { production: 0, gold: 0, food: 0, progress: 0, legitimacy: 0 }
    let upkeep = 0
    // controlled tiles: natural yield if empty, else the deployable's econ
    for (const k of this.controlled) {
      const t = this.world.byKey.get(k)
      const inst = this.deployed.get(k)
      if (!inst) { const y = this.terrainYield(t); for (const r in y) income[r] += y[r]; continue }
      const dep = DEPLOYABLES[inst.id]
      if (!dep.unique) upkeep += Math.max(0, dep.upkeep - this.mods.upkeepReduction)
      for (const e of dep.econ || []) {
        switch (e.name) {
          case 'self_yield': income[e.resource] += e.amount; break
          case 'per_adjacent': income[e.resource] += e.amount * this.adjCount(k, e.filter); break
          case 'growth_per_turn': income[e.resource] += e.amount * (inst.age || 0); break
          case 'count_scaling': income[e.resource] += e.amount * this.ownedCount(inst.id); break
          case 'double_tile_yield': { const y = this.terrainYield(t); for (const r in y) income[r] += y[r] * 2; break }
          default: break
        }
      }
    }
    // palace flat bonuses
    if (this.deployed.has(this.palaceKey)) for (const r in this.mods.palaceYield) income[r] += this.mods.palaceYield[r]
    // units-produce + per-unique-era
    const mil = this.militaryCount()
    for (const r in this.mods.unitsProduce) income[r] += this.mods.unitsProduce[r] * mil
    const uniq = this.uniqueOwned()
    for (const r in this.mods.perUnique) income[r] += this.mods.perUnique[r] * uniq
    return { income, upkeep }
  }
  _applyIncome() {
    for (const inst of this.deployed.values()) inst.age = (inst.age || 0) + 1
    const { income, upkeep } = this.computeEconomy()
    for (const r of RES) this.resources[r] += income[r]
    this.resources.gold -= upkeep
    this.legitimacy += income.legitimacy
  }

  // ---- combat scalar aggregation ----
  _instScalars(k, inst) {
    const dep = DEPLOYABLES[inst.id]
    const t = this.world.byKey.get(k)
    const out = emptyScalars()
    for (const c of dep.combat || []) if (c.name === 'combat_scalar') out[c.domain][c.stat] += c.amount
    for (const c of dep.combat || []) {
      if (c.name === 'combat_per_adjacent') out[c.domain][c.stat] += c.amount * this._adjCombat(k, inst, c.filter)
      else if (c.name === 'combat_on_terrain' && t.terrain === c.terrain) {
        if (c.mode === 'double') out[c.domain][c.stat] += out[c.domain][c.stat]
        else out[c.domain][c.stat] += c.amount || 0
      } else if (c.name === 'combat_mult_empty_adjacent') {
        let empty = 0
        for (const nk of this.neighborKeys(k)) { const nt = this.world.byKey.get(nk); if (nt.terrain === c.terrain && !this.deployed.has(nk)) empty++ }
        out[c.domain][c.stat] = out[c.domain][c.stat] * empty
      }
    }
    const db = TERRAIN[t.terrain].defBonus || 0
    if (db) out.land.def += db
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
    // gold-debt penalty: negative gold subtracts that much from every scalar
    const debt = this.resources.gold < 0 ? -this.resources.gold : 0
    if (debt) for (const d of DOMAINS) for (const st of ['atk', 'def', 'bomb']) s[d][st] = Math.max(0, s[d][st] - debt)
    return s
  }

  // ---- territory ----
  visionSet() {
    const starts = [...this.controlled].map((k) => parse(k))
    const dist = bfs(starts, (q, r) => this.world.byKey.has(hkey(q, r)), 1 + this.mods.vision)
    return new Set(dist.keys())
  }
  /** The frontier you may settle: tiles ADJACENT to controlled (keeps the empire
   *  connected). Independent of vision range — Surveying widens sight, not reach. */
  expandFrontier() {
    const out = new Set()
    for (const k of this.controlled) for (const nk of this.neighborKeys(k)) if (!this.controlled.has(nk)) out.add(nk)
    return out
  }
  expandTargets() {
    const out = []
    for (const k of this.expandFrontier()) {
      const t = this.world.byKey.get(k)
      const ter = TERRAIN[t.terrain]
      if (!ter) continue // only content terrains are settleable (Earth land + coast)
      if (ter.unlock && !this.expansions.has(t.terrain)) continue
      const cost = ter.expandBase + Math.max(0, t.dist - 1)
      out.push({ key: k, terrain: t.terrain, cost, affordable: this.resources.food >= cost })
    }
    return out
  }
  expandAt(k) {
    if (this.status !== 'playing') return false
    const t = this.tileAt(k)
    if (!t || this.controlled.has(k)) return false
    if (!this.neighborKeys(k).some((nk) => this.controlled.has(nk))) return false // must stay connected
    const ter = TERRAIN[t.terrain]
    if (!ter) return false
    if (ter.unlock && !this.expansions.has(t.terrain)) return false
    const cost = ter.expandBase + Math.max(0, t.dist - 1)
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
  offerData() {
    return this.offer.map((o) => {
      const t = TECHS[o.id]
      const cost = progressCost(eraIndex(t.era))
      return { ...o, tech: t, cost, affordable: this.resources.progress >= cost }
    })
  }
  unlockTech(id) {
    const slot = this.offer.findIndex((o) => o.id === id)
    if (slot < 0 || this.status !== 'playing') return false
    const t = TECHS[id]
    const cost = progressCost(eraIndex(t.era))
    if (this.resources.progress < cost) return false
    this.resources.progress -= cost
    this.taken.add(id)
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
    const P = this.playerScalars()
    const enemy = generateEnemyCard(armyValue(P), n, ENEMY, this._waveRng(n))
    const result = resolveCombat(P, enemy.scalars)
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
    this.lastCombat = { wave: n, enemy, player: P, result, bonus }
    this.log.unshift(`Wave ${n}: −${result.legitimacyLost} legitimacy, +${result.goldGained} gold`)
    if (this.legitimacy <= 0) { this.legitimacy = 0; this.status = 'lost' }
  }

  // ---- turn loop ----
  endTurn() {
    if (this.status !== 'playing') return
    this.selection = null
    if (this.isWaveTurn()) this._resolveWave()
    if (this.status !== 'playing') { this._emit(); return }
    this.turn++
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
        case 'double_tile_yield': { const y = this.terrainYield(t); for (const r in y) add(r, y[r] * 2); break }
        default: break
      }
    }
    return out
  }
  /** Combat scalar contribution of the deployable on a tile. */
  instScalars(k) { const inst = this.deployed.get(k); return inst ? this._instScalars(k, inst) : null }
  /** Predicted outcome of the upcoming wave against the current board (no effects). */
  previewCombat() { return this.enemyCard ? resolveCombat(this.playerScalars(), this.enemyCard.scalars) : null }

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
