// Combat (v4) — a COOLDOWN engine, installed onto GameManager.prototype.
//
// There is no turn queue. A global combat clock ticks; every piece carries a
// cooldown timer, and acts when it reaches 0 (a unit attacks, an enemy moves or
// attacks, a city fires its yield). Distinct per-class cooldowns are how speed
// reads on the board.
//
// Enemies march the SHORTEST path to the palace, ROUTING AROUND player pieces
// (occupied/impassable tiles are not walkable) via a flow field from the palace.
// They attack a target only when one is in range — units before
// cities, lowest def first (Raiders veer to cities). Embarked enemies (on water
// or open space) cannot attack and are exposed; naval/aerial/astral units are
// the only ones that can strike them. Player units are stationary towers; cavalry
// attacks then retreats one step.

import { key, neighbors, distance } from '../hex/coords.js'
import { makeRng } from '../world/noise.js'
import { terrainOf, dmgTakenMult, rangeBonusOf, hpDrainFrac } from '../world/terrain.js'
import { generateHost, enemyTraversable } from '../data/enemies.js'
import { UNIT_DEFS } from '../data/units.js'
import { CITY_YIELD_CD, PALACE_ATTACK_CD, COMBAT_MAX_TICKS, COMBAT_STALE_TICKS } from '../data/config.js'

// How long (in ticks) a floating number lives, so its CSS animation plays out
// instead of being cleared the very next tick.
const FLOAT_LIFE_TICKS = 20

export function installCombat(GM) {
  const P = GM.prototype

  P._blankCombat = function () {
    return {
      active: false,
      units: [], enemies: [], cities: [], palace: null,
      events: [], acting: null, actionSeq: 0, ticks: 0, lastEventTick: 0,
      defeatedCities: new Set(),
    }
  }

  // Embarked = on water or open space (not on land or a celestial body).
  P._embarkedTerrain = function (terrainKey) {
    const d = terrainOf(terrainKey)
    if (d.domain === 'water') return true
    return terrainKey === 'space' || terrainKey === 'deep_space' || terrainKey === 'battlefield'
  }

  // --- Wave muster ----------------------------------------------------------
  P._computeReachSet = function () {
    // Reachable set from the palace over KNOWN traversable terrain, ignoring unit
    // blockers (muster happens before combat). Rejects spawns nothing could path
    // in from. One set now — enemies have no domains (all cross land/water/void).
    const seen = new Set([key(0, 0)])
    let frontier = [{ q: 0, r: 0 }]
    while (frontier.length) {
      const next = []
      for (const t of frontier) {
        for (const n of neighbors(t.q, t.r)) {
          const nk = key(n.q, n.r)
          if (seen.has(nk)) continue
          const o = this.world.at(n.q, n.r)
          if (!o || !this.isKnown(n.q, n.r)) continue
          if (!enemyTraversable(o.terrain)) continue
          seen.add(nk)
          next.push(n)
        }
      }
      frontier = next
    }
    this._reachSet = seen
  }

  P._prepareWave = function () {
    this._computeReachSet()
    const spawns = this.known.all
      .filter((t) => this.known.bfSet.has(key(t.q, t.r)))
      .map((t) => ({ q: t.q, r: t.r, terrain: t.terrain }))
    const rng = makeRng((this.world.seed ^ (this.wave * 2246822519)) >>> 0)
    const reachable = (q, r) => this._reachSet.has(key(q, r))
    const enemies = generateHost(this.wave, spawns, reachable, rng, 1)
    this.pendingWave = { enemies }
  }

  // --- Start / end ----------------------------------------------------------
  P.beginWave = function () {
    if (this.phase !== 'prep' || this.won || this.defeated) return
    this.phase = 'combat'
    this._startCombat()
    this._emit()
  }

  P._startCombat = function () {
    const c = this._blankCombat()
    c.active = true

    c.enemies = this.pendingWave.enemies.map((e) => ({ ...e, cdTimer: (e.id % e.cd) + 1, dead: false }))

    for (const t of this.world.list) {
      if (!t.unit) continue
      const def = UNIT_DEFS[t.unit.cls]
      const s = this.unitStats(t.unit.cls)
      c.units.push({
        id: t.unit.id, side: 'player', cls: t.unit.cls,
        q: t.q, r: t.r, home: { q: t.q, r: t.r },
        hp: s.def, maxHp: s.def, atk: s.atk, range: s.range,
        cd: s.cd, cdTimer: (t.unit.id % s.cd) + 1,
        retreat: !!def.retreat, canHitEmbarked: !!def.canHitEmbarked,
        dead: false, lastAttackSeq: null, lastAttackDir: null,
      })
    }

    for (const { tile, city } of this.allCities()) {
      const cs = this.cityStats(city)
      const piece = {
        id: city.id, side: city.palace ? 'palace' : 'city', palace: !!city.palace,
        q: tile.q, r: tile.r, hp: cs.maxHp, maxHp: cs.maxHp, atk: cs.atk, range: cs.range,
        yieldCd: CITY_YIELD_CD, yieldTimer: CITY_YIELD_CD,
        atkTimer: PALACE_ATTACK_CD, cityRef: city, dead: false,
        lastAttackSeq: null, lastAttackDir: null,
      }
      c.cities.push(piece)
      if (city.palace) c.palace = piece
    }

    this.combat = c
    this._fieldsDirty = true
  }

  P._endCombat = function (survived) {
    this.combat.active = false
    if (!survived) {
      this.defeated = true
      this._emit()
      return
    }
    // Casualties: dead player units are removed permanently.
    for (const u of this.combat.units) {
      if (u.dead) { const t = this.world.at(u.home.q, u.home.r); if (t && t.unit && t.unit.id === u.id) t.unit = null }
    }
    // Cities: defeated lose ceil(pop/2) (removed at 0); survivors gain food pop.
    for (const { tile, city } of this.allCities()) {
      const defeated = this.combat.defeatedCities.has(city.id)
      if (city.palace) { if (!defeated) city.pop += Math.round(this.cityFood(city)); continue }
      if (defeated) { city.pop -= Math.ceil(city.pop / 2); if (city.pop <= 0) tile.city = null }
      else city.pop += Math.round(this.cityFood(city))
    }
    this.phase = 'prep'
    this.wave++
    this._checkWin()
    if (!this.won) { this._recomputeKnown(); this._prepareWave() }
    this._emit()
  }

  // --- Flow fields (route-around pathing) -----------------------------------
  P._computeBlocked = function () {
    const b = new Set()
    for (const u of this.combat.units) if (!u.dead) b.add(key(u.q, u.r))
    for (const ci of this.combat.cities) if (!ci.dead && !ci.palace) b.add(key(ci.q, ci.r))
    return b
  }

  P._field = function () {
    if (this._fieldCache && !this._fieldsDirty) return this._fieldCache
    this._blocked = this._computeBlocked()
    this._fieldsDirty = false
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
          if (!o || !this.isKnown(n.q, n.r)) continue
          if (!enemyTraversable(o.terrain)) continue
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

  // --- The tick -------------------------------------------------------------
  P.combatTick = function () {
    const c = this.combat
    if (!c.active || this.selection || this.won || this.defeated) return
    c.ticks++
    if (c.ticks > COMBAT_MAX_TICKS) { this._endCombat(true); return }
    // Prune expired floats (keep recent ones so their animation completes) rather
    // than clearing every tick, which would flash them for a single frame.
    if (c.events.length) c.events = c.events.filter((e) => c.ticks - e.tick < FLOAT_LIFE_TICKS)

    for (const e of c.enemies) {
      if (e.dead) continue
      if (--e.cdTimer <= 0) { this._enemyAct(e); e.cdTimer = e.cd }
      if (this.defeated) return
    }
    for (const u of c.units) {
      if (u.dead) continue
      if (--u.cdTimer <= 0) { this._unitAct(u); u.cdTimer = u.cd }
    }
    for (const ci of c.cities) {
      if (ci.dead) continue
      if (--ci.yieldTimer <= 0) { this._cityYield(ci); ci.yieldTimer = ci.yieldCd }
      if (ci.palace && --ci.atkTimer <= 0) { this._pieceAttackTurn(ci); ci.atkTimer = PALACE_ATTACK_CD }
      if (this.selection) break // a draft opened; pause here
    }

    if (this.combat.palace && this.combat.palace.dead) { this._endCombat(false); return }
    if (c.enemies.every((e) => e.dead)) { this._endCombat(true); return }
    // Stalemate: nothing has taken damage for a long stretch (an enemy is walled
    // off and unreachable). Resolve as a survival rather than flooding economy.
    if (c.ticks - c.lastEventTick > COMBAT_STALE_TICKS) { this._endCombat(true); return }
    this._emit()
  }

  // --- Damage ---------------------------------------------------------------
  P._pushEvent = function (kind, q, r, amount, crit = false) {
    this.combat.events.push({ id: `${this.combat.actionSeq++}`, kind, q, r, amount: Math.round(amount), crit, tick: this.combat.ticks })
    // Only real combat activity (damage / razing) counts against the stalemate
    // timer — resource + heal floats must not keep a stalled combat alive.
    if (kind === 'dmg' || kind === 'raze') this.combat.lastEventTick = this.combat.ticks
  }

  P._dealDamage = function (attacker, target, tq, tr) {
    const terr = this.world.at(tq, tr)?.terrain ?? 'plains'
    const dmg = attacker.atk * dmgTakenMult(terr)
    target.hp -= dmg
    attacker.lastAttackSeq = this.combat.actionSeq
    attacker.lastAttackDir = { q: tr === attacker.r ? Math.sign(tq - attacker.q) : 0, r: Math.sign(tr - attacker.r) }
    this._pushEvent('dmg', tq, tr, dmg)
    if (target.hp <= 0) this._onPieceDeath(target)
  }

  P._onPieceDeath = function (piece) {
    piece.dead = true
    this._fieldsDirty = true
    if (piece.side === 'palace') { this.defeated = true; return }
    if (piece.side === 'city') this.combat.defeatedCities.add(piece.id)
  }

  P._applyTerrainDrain = function (piece) {
    const frac = hpDrainFrac(this.world.at(piece.q, piece.r)?.terrain)
    if (frac > 0 && !piece.dead) {
      piece.hp -= piece.maxHp * frac
      if (piece.hp <= 0) this._onPieceDeath(piece)
    }
  }

  // --- Enemy behaviour ------------------------------------------------------
  P._enemyAct = function (e) {
    this._applyTerrainDrain(e)
    if (e.dead) return
    const embarked = this._embarkedTerrain(this.world.at(e.q, e.r)?.terrain) && !e.embarkAttack
    if (e.marches) {
      // Ranged marchers keep advancing every act while they shoot — they never
      // camp at max range (which would be uncounterable). Move toward the palace,
      // then fire at anything now in range.
      this._enemyMove(e)
      if (!embarked) { const t = this._enemyTarget(e); if (t) this._dealDamage(e, t.piece, t.q, t.r) }
      return
    }
    if (!embarked) {
      const target = this._enemyTarget(e)
      if (target) { this._dealDamage(e, target.piece, target.q, target.r); return }
    }
    this._enemyMove(e)
  }

  P._enemyTarget = function (e) {
    const units = []
    const cities = []
    let palace = null
    for (const u of this.combat.units) {
      if (u.dead) continue
      if (distance(e.q, e.r, u.q, u.r) > e.range) continue
      units.push({ piece: u, q: u.q, r: u.r, def: u.maxHp, d: distance(e.q, e.r, u.q, u.r) })
    }
    for (const ci of this.combat.cities) {
      if (ci.dead) continue
      if (distance(e.q, e.r, ci.q, ci.r) > e.range) continue
      const rec = { piece: ci, q: ci.q, r: ci.r, def: ci.maxHp, d: distance(e.q, e.r, ci.q, ci.r) }
      if (ci.palace) palace = rec; else cities.push(rec)
    }
    const byDefThenDist = (a, b) => (a.def - b.def) || (a.d - b.d)
    units.sort(byDefThenDist); cities.sort(byDefThenDist)
    if (e.prefersCity) {
      // Raiders: cities (then palace) before units.
      return cities[0] ?? palace ?? units[0] ?? null
    }
    // Default: units first (lowest def), then cities, then palace.
    return units[0] ?? cities[0] ?? palace ?? null
  }

  P._liveEnemyAt = function (q, r, exceptId) {
    for (const e of this.combat.enemies) if (!e.dead && e.id !== exceptId && e.q === q && e.r === r) return true
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
      if (!o || !this.isKnown(n.q, n.r)) continue
      if (!enemyTraversable(o.terrain)) continue
      if (this._blocked.has(nk)) continue          // a player piece is there
      if (this._liveEnemyAt(n.q, n.r, e.id)) continue // don't stack on another enemy
      if (nk === key(0, 0)) continue                // never step onto the palace (attack it instead)
      cands.push(n)
      const d = field.get(nk)
      if (d !== undefined && d < bestD) { bestD = d; best = n }
    }
    // Fully walled off from the flow field: advance greedily toward the palace so
    // the host piles onto the wall and grinds it down — no permanent maze-lock.
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

  // --- Player behaviour -----------------------------------------------------
  P._unitAct = function (u) {
    this._applyTerrainDrain(u)
    if (u.dead) return
    this._pieceAttackTurn(u)
    if (u.retreat && !u.dead) this._retreat(u)
  }

  // Shared by player units and the palace: strike the best enemy in range.
  P._pieceAttackTurn = function (p) {
    const terr = this.world.at(p.q, p.r)?.terrain
    const range = p.range + (p.side === 'player' ? rangeBonusOf(terr) : 0)
    let best = null, bestKey = Infinity
    for (const e of this.combat.enemies) {
      if (e.dead) continue
      const d = distance(p.q, p.r, e.q, e.r)
      if (d > range) continue
      const embarked = this._embarkedTerrain(this.world.at(e.q, e.r)?.terrain)
      if (embarked && !(p.canHitEmbarked || p.palace)) continue
      const k = d * 100000 + e.hp // nearest, then lowest hp
      if (k < bestKey) { bestKey = k; best = e }
    }
    if (best) this._dealDamage(p, best, best.q, best.r)
  }

  P._retreat = function (u) {
    // Step to an adjacent legal empty tile that maximizes distance to the
    // nearest live enemy. Only if it improves safety.
    const def = UNIT_DEFS[u.cls]
    const nearestNow = this._nearestEnemyDist(u.q, u.r)
    let best = null, bestSafe = nearestNow
    for (const n of neighbors(u.q, u.r)) {
      const o = this.world.at(n.q, n.r)
      if (!o || !this.isKnown(n.q, n.r) || !def.placement.has(o.terrain)) continue
      if (this._occupied(n.q, n.r)) continue
      const safe = this._nearestEnemyDist(n.q, n.r)
      if (safe > bestSafe) { bestSafe = safe; best = n }
    }
    if (best) {
      this._blocked?.delete(key(u.q, u.r))
      u.q = best.q; u.r = best.r
      this._blocked?.add(key(u.q, u.r))
      this._fieldsDirty = true
    }
  }

  P._occupied = function (q, r) {
    for (const u of this.combat.units) if (!u.dead && u.q === q && u.r === r) return true
    for (const ci of this.combat.cities) if (!ci.dead && ci.q === q && ci.r === r) return true
    for (const e of this.combat.enemies) if (!e.dead && e.q === q && e.r === r) return true
    return false
  }

  P._nearestEnemyDist = function (q, r) {
    let best = Infinity
    for (const e of this.combat.enemies) if (!e.dead) best = Math.min(best, distance(q, r, e.q, e.r))
    return best
  }

  // --- City yield -----------------------------------------------------------
  P._cityYield = function (ci) {
    if (ci.dead) return
    const g = this.cityGold(ci.cityRef)
    const p = this.cityProgress(ci.cityRef)
    this.gold += g
    if (g > 0) this._pushEvent('gold', ci.q, ci.r, g)
    if (p > 0) this._pushEvent('progress', ci.q, ci.r, p)
    this._addProgress(p) // may open a draft; do it after pushing the float
  }
}
