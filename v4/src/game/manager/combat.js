// Turn resolution (v4 turn-based), installed onto GameManager.prototype.
//
// One round per End Turn, resolved in a fixed order:
//   1. materialize the forecast (last turn's telegraphed arrivals become real)
//   2. player pieces act  — units, buildings and cities strike enemies in range
//   3. enemies act        — attack a target in range, else march on the palace,
//                           routing AROUND player pieces via a flow field
//   4. cleanup            — dead enemies removed; dead units gone (permadeath);
//                           razed buildings & depopulated cities removed
//   5. resource gain      — surviving cities + buildings yield gold/progress
//   6. research           — progress fills the active lane; growth banks food
//   7. forecast           — next turn's host is mustered onto the frontier
//
// Players act BEFORE enemies so well-placed towers get the first shot — good
// positioning is rewarded. Enemies persist on this.enemies between turns; player
// pieces live on tiles (tile.unit / tile.building / tile.city) and carry their
// own HP. Combat is auto-resolved — the player never hand-moves a unit.

import { key, neighbors, distance, toPixel } from '../hex/coords.js'
import { terrainOf, dmgTakenMult, rangeBonusOf, hpDrainFrac } from '../world/terrain.js'
import { generateHost, enemyTraversable } from '../data/enemies.js'
import { UNIT_DEFS } from '../data/units.js'
import { BUILDING_DEFS } from '../data/buildings.js'

export function installCombat(GM) {
  const P = GM.prototype

  // --- Forecast (muster next turn's host onto the frontier) -----------------
  P._forecastRng = function () {
    let s = (this.world.seed ^ (this.turn * 2654435761)) >>> 0
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000 }
  }

  // Reachable-from-palace set over KNOWN traversable terrain, ignoring blockers
  // (muster-time): rejects spawns nothing could path in from.
  P._computeReachSet = function () {
    const seen = new Set([key(0, 0)])
    let frontier = [{ q: 0, r: 0 }]
    while (frontier.length) {
      const next = []
      for (const t of frontier) {
        for (const n of neighbors(t.q, t.r)) {
          const nk = key(n.q, n.r)
          if (seen.has(nk)) continue
          const o = this.world.at(n.q, n.r)
          if (!o || !this.isKnown(n.q, n.r) || !enemyTraversable(o.terrain)) continue
          seen.add(nk)
          next.push(n)
        }
      }
      frontier = next
    }
    this._reachSet = seen
  }

  P._makeForecast = function () {
    this._computeReachSet()
    const spawns = this.known.all
      .filter((t) => this.known.bfSet.has(key(t.q, t.r)))
      .map((t) => ({ q: t.q, r: t.r, terrain: t.terrain }))
    const rng = this._forecastRng()
    const reachable = (q, r) => this._reachSet.has(key(q, r))
    this.forecast = generateHost(this.turn, spawns, reachable, rng, () => this._id())
  }

  // --- The turn (resolved one actor at a time, driven by the UI) ------------
  // endTurn() sets the round up and queues every actor; stepTurn() executes ONE
  // actor and emits, so the UI can pause between them and you can follow the
  // action; when the queue drains, _finalizeTurn() banks income + research.
  P.endTurn = function () {
    if (this.selection || this.pickingResearch || this.resolving || this.won || this.defeated) return
    this.events = []
    this._bashSeq = (this._bashSeq ?? 0)

    // Materialize the forecast (last turn's telegraphed arrivals become real).
    for (const e of this.forecast) this.enemies.push(e)
    this.forecast = []

    // Occupied tiles (units / buildings / cities) — the enemy target pool.
    this._occupied = this.world.list.filter((t) => t.unit || t.building || t.city)
    this._blocked = this._computeBlocked()
    this._fieldCache = null
    this._field()

    // Action order: player pieces first (towers get the first shot), then
    // enemies by proximity to the palace.
    const q = []
    for (const t of this.world.list) if (t.unit && !t.unit._dead) q.push({ kind: 'unit', tile: t })
    for (const t of this.world.list) if (t.building && !t.building._dead) q.push({ kind: 'building', tile: t })
    for (const { tile, city } of this.allCities()) q.push({ kind: 'city', tile, city })
    for (const e of this._enemiesByProximity()) q.push({ kind: 'enemy', enemy: e })
    this._queue = q
    this.resolving = true
    this._emit()
  }

  // Execute one actor. Returns true if it did something visible (attacked or
  // moved), so the UI can skip the pause on no-op actors.
  P.stepTurn = function () {
    if (!this.resolving) return false
    if (this.defeated || !this._queue.length) { this._finalizeTurn(); return false }
    const item = this._queue.shift()
    let acted = false
    switch (item.kind) {
      case 'unit': if (item.tile.unit && !item.tile.unit._dead) acted = this._unitAct(item.tile); break
      case 'building': if (item.tile.building && !item.tile.building._dead) acted = this._buildingAct(item.tile); break
      case 'city': if (item.tile.city && !item.tile.city._dead) acted = this._cityAct(item.city, item.tile); break
      case 'enemy': if (!item.enemy.dead) acted = this._enemyAct(item.enemy); break
      default: break
    }
    this._emit()
    return acted
  }

  P._finalizeTurn = function () {
    this.resolving = false
    this._queue = null
    this._cleanupDead()

    if (!this.defeated) {
      let gold = 0, progress = 0
      for (const { tile, city } of this.allCities()) {
        const g = this.cityGold(city), p = this.cityProgress(city)
        gold += g; progress += p
        if (g > 0) this._pushEvent('gold', tile.q, tile.r, g)
        if (p > 0) this._pushEvent('progress', tile.q, tile.r, p)
      }
      for (const t of this.world.list) {
        if (!t.building) continue
        const y = BUILDING_DEFS[t.building.key].yield
        if (!y) continue
        gold += y.gold ?? 0; progress += y.progress ?? 0
        if (y.gold) this._pushEvent('gold', t.q, t.r, y.gold)
        if (y.progress) this._pushEvent('progress', t.q, t.r, y.progress)
      }
      gold = Math.round(gold); progress = Math.round(progress)
      this.gold += gold
      this.lastGoldGain = gold
      this.lastProgressGain = progress
      this._advanceResearch(progress)
      this._growCities()
    }

    if (!this.won && !this.defeated) {
      this.turn++
      this._recomputeKnown()
      this._makeForecast()
      // A completed tech left no active lane — prompt a fresh pick at turn end.
      if (!this.researchFlavor) this.pickingResearch = true
    }
    this._emit()
  }

  // --- Flow field (route-around pathing) ------------------------------------
  P._computeBlocked = function () {
    const b = new Set()
    for (const t of this._occupied) {
      if (t.q === 0 && t.r === 0) continue // the palace is the goal, not a wall
      if ((t.unit && !t.unit._dead) || (t.building && !t.building._dead) || (t.city && !t.city._dead)) {
        b.add(key(t.q, t.r))
      }
    }
    return b
  }

  P._field = function () {
    if (this._fieldCache) return this._fieldCache
    const field = new Map([[key(0, 0), 0]])
    let frontier = [{ q: 0, r: 0 }]
    while (frontier.length) {
      const next = []
      for (const t of frontier) {
        const d = field.get(key(t.q, t.r))
        for (const n of neighbors(t.q, t.r)) {
          const nk = key(n.q, n.r)
          if (field.has(nk)) continue
          const o = this.world.at(n.q, n.r)
          if (!o || !this.isKnown(n.q, n.r) || !enemyTraversable(o.terrain)) continue
          if (this._blocked.has(nk)) continue
          field.set(nk, d + 1)
          next.push(n)
        }
      }
      frontier = next
    }
    this._fieldCache = field
    return field
  }

  P._enemiesByProximity = function () {
    return this.enemies.slice().sort((a, b) => distance(a.q, a.r, 0, 0) - distance(b.q, b.r, 0, 0))
  }

  // --- Enemy behaviour ------------------------------------------------------
  P._embarkedTerrain = function (terrainKey) {
    const d = terrainOf(terrainKey)
    if (d.domain === 'water') return true
    return terrainKey === 'space' || terrainKey === 'deep_space' || terrainKey === 'battlefield'
  }

  P._applyTerrainDrain = function (e) {
    const frac = hpDrainFrac(this.world.at(e.q, e.r)?.terrain)
    if (frac > 0 && !e.dead) {
      e.hp -= e.maxHp * frac
      if (e.hp <= 0) e.dead = true
    }
  }

  P._enemyAct = function (e) {
    this._applyTerrainDrain(e)
    if (e.dead) return true
    const embarked = this._embarkedTerrain(this.world.at(e.q, e.r)?.terrain)
    if (e.marches) {
      let acted = this._enemyMove(e)
      if (!embarked) { const tgt = this._enemyTarget(e); if (tgt) { this._enemyHitPiece(e, tgt); acted = true } }
      return acted
    }
    if (!embarked) {
      const tgt = this._enemyTarget(e)
      if (tgt) { this._enemyHitPiece(e, tgt); return true }
    }
    let moved = false
    for (let i = 0; i < e.moves; i++) { if (!this._enemyMove(e)) break; moved = true }
    return moved
  }

  P._enemyTarget = function (e) {
    const units = [], buildings = [], cities = []
    let palace = null
    for (const t of this._occupied) {
      const d = distance(e.q, e.r, t.q, t.r)
      if (d > e.range) continue
      if (t.unit && !t.unit._dead) units.push({ tile: t, kind: 'unit', hp: t.unit.hp, d })
      if (t.building && !t.building._dead) buildings.push({ tile: t, kind: 'building', hp: t.building.hp, d })
      if (t.city && !t.city._dead) {
        const rec = { tile: t, kind: t.city.palace ? 'palace' : 'city', hp: t.city.palace ? t.city.hp : t.city.pop, d }
        if (t.city.palace) palace = rec; else cities.push(rec)
      }
    }
    const by = (a, b) => (a.hp - b.hp) || (a.d - b.d)
    units.sort(by); buildings.sort(by); cities.sort(by)
    if (e.prefersCity) return cities[0] ?? palace ?? units[0] ?? buildings[0] ?? null
    return units[0] ?? buildings[0] ?? cities[0] ?? palace ?? null
  }

  P._liveEnemyAt = function (q, r, exceptId) {
    for (const e of this.enemies) if (!e.dead && e.id !== exceptId && e.q === q && e.r === r) return true
    return false
  }

  P._enemyMove = function (e) {
    const field = this._field()
    const here = field.get(key(e.q, e.r))
    const cands = []
    let best = null
    let bestD = here ?? Infinity
    for (const n of neighbors(e.q, e.r)) {
      const nk = key(n.q, n.r)
      const o = this.world.at(n.q, n.r)
      if (!o || !this.isKnown(n.q, n.r) || !enemyTraversable(o.terrain)) continue
      if (this._blocked.has(nk)) continue
      if (this._liveEnemyAt(n.q, n.r, e.id)) continue
      if (nk === key(0, 0)) continue // never step onto the palace (attack it)
      cands.push(n)
      const d = field.get(nk)
      if (d !== undefined && d < bestD) { bestD = d; best = n }
    }
    // Walled off from the field: advance greedily so the host grinds the wall.
    if (!best && cands.length) {
      let bestRaw = distance(e.q, e.r, 0, 0)
      for (const n of cands) {
        const raw = distance(n.q, n.r, 0, 0)
        if (raw < bestRaw) { bestRaw = raw; best = n }
      }
    }
    if (best) { e.q = best.q; e.r = best.r; return true }
    return false
  }

  P._enemyHitPiece = function (e, target) {
    const t = target.tile
    this._setBash(e, e.q, e.r, t.q, t.r)
    const dmg = e.atk
    if (target.kind === 'unit') {
      const d = dmg * dmgTakenMult(t.terrain)
      t.unit.hp -= d
      this._pushEvent('dmg', t.q, t.r, d)
      if (t.unit.hp <= 0) t.unit._dead = true
    } else if (target.kind === 'building') {
      t.building.hp -= dmg
      this._pushEvent('dmg', t.q, t.r, dmg)
      if (t.building.hp <= 0) { t.building._dead = true; this._pushEvent('raze', t.q, t.r, 0) }
    } else if (target.kind === 'city') {
      t.city.pop -= 1
      this._pushEvent('pop', t.q, t.r, 1)
      if (t.city.pop <= 0) { t.city._dead = true; this._pushEvent('raze', t.q, t.r, 0) }
    } else { // palace
      t.city.hp -= dmg
      this._pushEvent('dmg', t.q, t.r, dmg)
      if (t.city.hp <= 0) { this.defeated = true; this._pushEvent('raze', t.q, t.r, 0) }
    }
  }

  // --- Player behaviour -----------------------------------------------------
  P._bestEnemyInRange = function (q, r, range) {
    let best = null, bestKey = Infinity
    for (const e of this.enemies) {
      if (e.dead) continue
      const d = distance(q, r, e.q, e.r)
      if (d > range) continue
      if (this._embarkedTerrain(this.world.at(e.q, e.r)?.terrain)) continue // no naval: can't hit embarked
      const k = d * 100000 + e.hp // nearest, then lowest hp (finish kills)
      if (k < bestKey) { bestKey = k; best = e }
    }
    return best
  }

  P._unitAct = function (tile) {
    const u = tile.unit
    const s = this.unitStats(u.cls)
    const range = s.range + rangeBonusOf(tile.terrain)
    const best = this._bestEnemyInRange(tile.q, tile.r, range)
    if (!best) return false
    this._setBash(u, tile.q, tile.r, best.q, best.r)
    this._hitEnemy(best, s.atk)
    if (s.splash > 0) {
      for (const n of neighbors(best.q, best.r)) {
        const e2 = this.enemies.find((e) => !e.dead && e.q === n.q && e.r === n.r)
        if (e2) this._hitEnemy(e2, s.atk * s.splash)
      }
    }
    return true
  }

  P._buildingAct = function (tile) {
    const def = BUILDING_DEFS[tile.building.key]
    if (!def.atk) return false
    const best = this._bestEnemyInRange(tile.q, tile.r, def.range)
    if (!best) return false
    this._setBash(tile.building, tile.q, tile.r, best.q, best.r)
    this._hitEnemy(best, def.atk)
    return true
  }

  P._cityAct = function (city, tile) {
    const s = this.cityStats(city)
    if (s.atk <= 0 || s.range <= 0) return false
    const best = this._bestEnemyInRange(tile.q, tile.r, s.range)
    if (!best) return false
    this._setBash(city, tile.q, tile.r, best.q, best.r)
    this._hitEnemy(best, s.atk)
    return true
  }

  P._hitEnemy = function (e, dmg) {
    e.hp -= dmg
    this._pushEvent('dmg', e.q, e.r, dmg)
    if (e.hp <= 0) e.dead = true
  }

  // --- Cleanup --------------------------------------------------------------
  P._cleanupDead = function () {
    this.enemies = this.enemies.filter((e) => !e.dead)
    for (const t of this.world.list) {
      if (t.unit && t.unit._dead) t.unit = null
      if (t.building && t.building._dead) t.building = null
      if (t.city && !t.city.palace && (t.city._dead || t.city.pop <= 0)) t.city = null
    }
  }

  // --- FX -------------------------------------------------------------------
  P._pushEvent = function (kind, q, r, amount) {
    this.events.push({ id: `${this.turn}-${this._bashSeq++}`, kind, q, r, amount: Math.round(amount) })
  }

  P._setBash = function (obj, aq, ar, tq, tr) {
    obj.lastAttackSeq = ++this._bashSeq
    const a = toPixel(aq, ar, 1)
    const b = toPixel(tq, tr, 1)
    const dx = b.x - a.x, dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    obj.lastAttackDir = { x: dx / len, y: dy / len }
  }
}

// Keep UNIT_DEFS import referenced (retreat/embark flags may be read later).
void UNIT_DEFS
