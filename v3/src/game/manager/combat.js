// Combat subsystem (v3 scaffold) — installed onto GameManager.prototype.
//
// Same shape as v2's combat: discrete turns, asymmetric enemies bought against a
// budget, blockers grinding through a line. What the radial map changes is
// PATHING — there are no columns to march down, so enemies follow a FLOW FIELD
// inward toward the palace, one per traversal domain.
//
// Phase order within a turn (fixed, as specified):
//   1. enemies move
//   2. player units move
//   3. player units attack (the palace strikes in this phase too)
//   4. enemies attack
//
// ONE PIECE ACTS PER BEAT. A turn is expanded into a queue of single-piece
// actions and the main clock advances to the next VISIBLE one, so you can
// follow who moved and who hit whom. Beats that produce nothing — a unit with
// nowhere to go, an attack with no target in range — are skipped instantly
// rather than burning a tick, since only animation needs the time.
//
// A combat ends when every enemy is dead (won), the palace falls (lost), or the
// turn cap is hit (stalemate — a safety net, not a rule).

import { key, neighbors, distance } from '../hex/coords.js'
import { generateHost, domainCanTraverse, ENEMY_DOMAINS, waveBudget } from '../data/enemies.js'
import { UNIT_DEFS, PALACE, unitStats } from '../data/units.js'
import { isPassable, isLand } from '../world/terrain.js'
import { makeRng, shuffle } from '../world/noise.js'

export const MAX_WAVES = 30

export const PHASE_LABEL = {
  'enemy-move': 'Enemies move',
  'player-move': 'Defenders move',
  'player-attack': 'Defenders attack',
  'enemy-attack': 'Enemies attack',
}
const TURN_CAP = 300

// The scratch garrison is bought against the SAME budget curve as the host, at
// this fraction of it. Scaling both sides off one curve is what keeps every one
// of the 30 waves demoable — a flat count fell off a cliff around wave 15.
// Note it always uses strength 1, so raising the strength slider makes the wave
// genuinely harder rather than scaling the defence with it. Swept empirically:
// at 0.45, strength 1 wins ~95% of the time, strength 2 ~40%, strength 3 ~20%.
const DEFENCE_RATIO = 0.45
const MAX_GARRISON = 60
const MIX = [['melee', 0.5], ['ranged', 0.3], ['cavalry', 0.2]]

class CombatMixin {
  // --- setup ---------------------------------------------------------------

  /**
   * Build a fresh combat: flow fields, an enemy host on the battlefield ring,
   * and a scratch garrison scattered over nearby land.
   */
  startCombat(wave = this.combat.wave, strength = this.combat.strength) {
    const rng = makeRng((this.seed ^ (wave * 2654435761)) >>> 0)
    const known = this.known

    // Cells combat may use: the revealed world plus the muster ring.
    const cells = new Set(known.all.map((t) => key(t.q, t.r)))
    this._combatCells = cells

    // One inward flow field per domain, computed once — terrain does not change.
    this._fields = {}
    for (const d of Object.keys(ENEMY_DOMAINS)) this._fields[d] = this._flowField(d)

    const spawns = known.battlefield.map((t) => ({ q: t.q, r: t.r, terrain: t.terrain }))
    const reachable = (domain, q, r) => this._fields[domain].has(key(q, r))
    const enemies = generateHost(wave, spawns, reachable, rng, strength)

    this.combat = {
      ...this.combat,
      wave, strength,
      active: true,
      turn: 0, beat: 0, actionSeq: 0,
      result: null,
      queue: [], phase: null, acting: null,
      enemies,
      units: this._makeGarrison(wave, rng),
      palace: { ...PALACE, hp: PALACE.def, maxHp: PALACE.def, q: 0, r: 0, lastAttackSeq: null, lastAttackDir: null },
      events: [],
      breaches: 0,
    }
    this._emit()
  }

  endCombat() {
    this.combat = { ...this.combat, active: false }
    this.setSpeed('paused')
    this._emit()
  }

  /** BFS outward from the palace over everything this domain can cross. */
  _flowField(domain) {
    const dist = new Map([[key(0, 0), 0]])
    let frontier = [{ q: 0, r: 0 }]
    let step = 0
    while (frontier.length) {
      step++
      const next = []
      for (const c of frontier) {
        for (const n of neighbors(c.q, c.r)) {
          const nk = key(n.q, n.r)
          if (dist.has(nk)) continue
          const t = this.world.tiles.get(nk)
          if (!this._canTraverse(domain, t)) continue
          dist.set(nk, step)
          next.push(n)
        }
      }
      frontier = next
    }
    return dist
  }

  // Travel rules live entirely in the terrain travel classes now: every domain
  // crosses the void, so no special case is needed for the muster ring, and
  // mountains fall out of the 'blocked' class rather than a hard-coded check.
  _canTraverse(domain, tile) {
    if (!tile) return false
    if (!this._combatCells.has(key(tile.q, tile.r))) return false
    return domainCanTraverse(domain, tile.terrain)
  }

  /** Where a player unit may stand/walk: revealed, passable land. */
  _playerWalkable(tile) {
    return !!tile && this._combatCells.has(key(tile.q, tile.r)) &&
      isLand(tile.terrain) && isPassable(tile.terrain) && !(tile.q === 0 && tile.r === 0)
  }

  _makeGarrison(wave, rng) {
    // Defenders cluster near the palace — sorted by distance, so the ring the
    // enemies must grind through is the inner one.
    const spots = shuffle(
      this.known.tiles.filter((t) => this._playerWalkable(t) && t.d >= 1),
      rng,
    ).sort((a, b) => a.d - b.d)
    const budget = waveBudget(wave, 1) * DEFENCE_RATIO
    const units = []
    let spent = 0
    for (let i = 0; i < spots.length && i < MAX_GARRISON && spent < budget; i++) {
      let roll = rng()
      let pickKey = 'melee'
      for (const [k, p] of MIX) { if (roll < p) { pickKey = k; break } roll -= p }
      const stats = unitStats(UNIT_DEFS[pickKey], wave)
      const t = spots[i]
      spent += stats.def
      units.push({
        id: i, side: 'player', key: pickKey, name: stats.name, type: stats.type,
        q: t.q, r: t.r,
        hp: stats.def, maxHp: stats.def, atk: stats.atk,
        range: stats.range, acts: stats.acts,
        dead: false, lastAttackSeq: null, lastAttackDir: null,
      })
    }
    return units
  }

  // --- beats ---------------------------------------------------------------

  /** Expand a whole turn into an ordered list of single-piece actions. */
  _buildQueue() {
    const c = this.combat
    const q = []
    // Front-most enemies act first, so a queue behind them does not deadlock.
    const byFront = c.enemies.filter((e) => !e.dead)
      .sort((a, b) => this._distToPalace(a) - this._distToPalace(b))
    for (const e of byFront) q.push({ phase: 'enemy-move', side: 'enemy', id: e.id })
    for (const u of c.units) if (!u.dead && u.acts > 0) q.push({ phase: 'player-move', side: 'player', id: u.id })
    for (const u of c.units) if (!u.dead) q.push({ phase: 'player-attack', side: 'player', id: u.id })
    q.push({ phase: 'player-attack', side: 'palace', id: 'palace' })
    for (const e of byFront) q.push({ phase: 'enemy-attack', side: 'enemy', id: e.id })
    return q
  }

  _pieceOf(beat) {
    const c = this.combat
    if (beat.side === 'palace') return c.palace
    const pool = beat.side === 'enemy' ? c.enemies : c.units
    return pool.find((p) => p.id === beat.id) ?? null
  }

  /**
   * Advance to the next beat that actually SHOWS something — a piece that moved,
   * or an attack that landed. Empty beats (nowhere to go, nothing in range) cost
   * no time at all; only animation needs the clock.
   */
  combatStep() {
    const c = this.combat
    if (!c.active || c.result) return
    let guard = 0
    while (guard++ < 20000) {
      const acted = this._runOneBeat()
      if (acted === null || acted === true) break
    }
    this._emit()
  }

  /** @returns true = visible, false = skippable no-op, null = combat is over. */
  _runOneBeat() {
    const c = this.combat
    if (!c.queue.length) {
      // New turn: clear last turn's dead (they had a beat on screen to fade).
      c.enemies = c.enemies.filter((e) => !e.dead)
      c.units = c.units.filter((u) => !u.dead)
      if (this._checkEnd()) return null
      c.turn++
      this._moveField = null
      c.queue = this._buildQueue()
      if (!c.queue.length) { c.result = 'stalemate'; this.setSpeed('paused'); return null }
    }

    const beat = c.queue.shift()
    const piece = this._pieceOf(beat)
    if (!piece || piece.dead) return false // died earlier this turn

    c.events = []
    c.phase = beat.phase
    c.acting = { side: beat.side, id: beat.id }

    let visible = false
    switch (beat.phase) {
      case 'enemy-move': visible = this._enemyMove(piece); break
      case 'player-move': visible = this._playerMove(piece); break
      case 'player-attack': visible = this._strike(piece, this._lowestHpWithin(c.enemies, piece, piece.range)); break
      case 'enemy-attack': visible = this._enemyAttack(piece); break
      default: break
    }
    // The beat counter keys the lunge animation, so only real actions bump it.
    if (visible) c.beat++
    if (this._checkEnd()) return null
    return visible
  }

  /** Run the rest of the combat out instantly — the "Resolve" button. */
  resolveCombat() {
    this.setSpeed('paused')
    let guard = 0
    while (this.combat.active && !this.combat.result && guard++ < 500000) this.combatStep()
    this._emit()
  }

  _checkEnd() {
    const c = this.combat
    if (c.result) return true
    if (c.palace.hp <= 0) c.result = 'lost'
    else if (!c.enemies.some((e) => !e.dead)) c.result = 'won'
    else if (c.turn >= TURN_CAP) c.result = 'stalemate'
    if (c.result) { this.setSpeed('paused'); c.acting = null }
    return !!c.result
  }

  /** Everything currently standing on a cell, so nothing walks through anything. */
  _occupancy() {
    const map = new Map()
    for (const u of this.combat.units) if (!u.dead) map.set(key(u.q, u.r), u)
    for (const e of this.combat.enemies) if (!e.dead) map.set(key(e.q, e.r), e)
    map.set(key(0, 0), this.combat.palace)
    return map
  }

  // 1 — ONE enemy flows inward. Returns whether it actually moved.
  _enemyMove(e) {
    const occ = this._occupancy()
    const field = this._fields[e.domain]
    let moved = false
    for (let s = 0; s < e.acts; s++) {
      const here = field.get(key(e.q, e.r)) ?? Infinity
      if (here <= 1) break // adjacent to the palace: stop and fight
      let best = null
      let bestD = here
      for (const n of neighbors(e.q, e.r)) {
        const nk = key(n.q, n.r)
        const d = field.get(nk)
        if (d === undefined || d >= bestD) continue
        if (occ.has(nk)) continue // blocked — it will attack instead
        best = n
        bestD = d
      }
      if (!best) break
      occ.delete(key(e.q, e.r))
      e.q = best.q
      e.r = best.r
      occ.set(key(e.q, e.r), e)
      moved = true
    }
    return moved
  }

  // 2 — ONE melee/cavalry closes on the nearest enemy; ranged never move.
  //     Returns whether it actually moved.
  _playerMove(u) {
    if (u.acts <= 0) return false
    // Cached for the phase: enemies do not move during it, so one multi-source
    // BFS serves every defender instead of one sweep each.
    if (!this._moveField) this._moveField = this._enemyProximityField()
    const field = this._moveField
    const occ = this._occupancy()
    let moved = false
    for (let s = 0; s < u.acts; s++) {
      const here = field.get(key(u.q, u.r)) ?? Infinity
      if (here <= u.range) break // already in reach — hold and shoot
      let best = null
      let bestD = here
      for (const n of neighbors(u.q, u.r)) {
        const nk = key(n.q, n.r)
        const d = field.get(nk)
        if (d === undefined || d >= bestD) continue
        if (occ.has(nk)) continue
        best = n
        bestD = d
      }
      if (!best) break
      occ.delete(key(u.q, u.r))
      u.q = best.q
      u.r = best.r
      occ.set(key(u.q, u.r), u)
      moved = true
    }
    return moved
  }

  /** Distance-to-nearest-enemy over player-walkable ground. */
  _enemyProximityField() {
    const field = new Map()
    let frontier = []
    for (const e of this.combat.enemies) {
      if (e.dead) continue
      const k = key(e.q, e.r)
      if (!field.has(k)) { field.set(k, 0); frontier.push(e) }
    }
    let step = 0
    while (frontier.length && step < 40) {
      step++
      const next = []
      for (const cur of frontier) {
        for (const n of neighbors(cur.q, cur.r)) {
          const nk = key(n.q, n.r)
          if (field.has(nk)) continue
          if (!this._playerWalkable(this.world.tiles.get(nk))) continue
          field.set(nk, step)
          next.push(n)
        }
      }
      frontier = next
    }
    return field
  }

  // 4 — ONE enemy hits a defender in reach, else the palace. Returns whether it
  //     found anything to hit.
  _enemyAttack(e) {
    const c = this.combat
    const target = this._lowestHpWithin(c.units, e, e.range)
    if (target) return this._strike(e, target)
    if (distance(e.q, e.r, 0, 0) <= e.range) {
      c.breaches++
      return this._strike(e, c.palace)
    }
    return false
  }

  _lowestHpWithin(pool, from, range) {
    let best = null
    for (const t of pool) {
      if (t.dead || t.hp <= 0) continue
      if (distance(from.q, from.r, t.q, t.r) > range) continue
      if (!best || t.hp < best.hp) best = t
    }
    return best
  }

  /** @returns true if a blow landed (so the caller knows the beat was visible). */
  _strike(attacker, target) {
    if (!target) return false
    const c = this.combat
    target.hp -= attacker.atk
    // Its own monotonic counter, bumped HERE rather than reusing `beat`: the
    // beat counter only advances after the action resolves, which left the card
    // comparing against a stale value and the lunge never played.
    c.actionSeq = (c.actionSeq ?? 0) + 1
    attacker.lastAttackSeq = c.actionSeq
    attacker.lastAttackDir = this._dirTo(attacker, target)
    c.events.push({
      id: `${c.actionSeq}-${target.id ?? 'palace'}`,
      q: target.q, r: target.r, amount: attacker.atk,
      kind: target === c.palace ? 'palace' : 'damage',
    })
    if (target.hp <= 0 && target !== c.palace) {
      target.hp = 0
      target.dead = true
    }
    if (target === c.palace) c.palace.hp = Math.max(0, c.palace.hp)
    return true
  }

  /** Screen-space unit vector from attacker to target, for the lunge animation. */
  _dirTo(a, b) {
    const ax = a.q * 1.5
    const ay = (a.r + a.q / 2) * Math.sqrt(3)
    const bx = b.q * 1.5
    const by = (b.r + b.q / 2) * Math.sqrt(3)
    const dx = bx - ax
    const dy = by - ay
    const m = Math.hypot(dx, dy) || 1
    return { dx: dx / m, dy: dy / m }
  }

  _distToPalace(e) {
    return this._fields[e.domain].get(key(e.q, e.r)) ?? Infinity
  }

  // Combat no longer owns a clock: the main pacing control drives it, one beat
  // per tick, so there is a single speed UI for the whole game.
  stopCombatTimer() {}
}

export function installCombat(GameManager) {
  for (const name of Object.getOwnPropertyNames(CombatMixin.prototype)) {
    if (name === 'constructor') continue
    GameManager.prototype[name] = CombatMixin.prototype[name]
  }
}
