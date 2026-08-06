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
import {
  generateHost, domainCanTraverse, ENEMY_DOMAINS, ENEMY_TYPES,
  waveBudget, makeEnemy, rollTier,
} from '../data/enemies.js'
import { UNIT_DEFS, PALACE, unitStats } from '../data/units.js'
import { isPassable, isLand } from '../world/terrain.js'
import { razeTile } from '../world/territory.js'
import { makeRng, shuffle } from '../world/noise.js'

// The wave ladder lives in `data/cycle.js` — it is the game's clock, not a
// combat-local constant. Re-exported here because the combat UI reads it.
export { WAVE_COUNT as MAX_WAVES } from '../data/cycle.js'

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
  /**
   * Build the host for a wave, and the flow fields it will march along.
   *
   * Split out of `startCombat` so the coming wave can be MUSTERED EARLY and
   * shown on the battlefield ring all through development — you should be able
   * to see what is about to hit you while there is still time to prepare for it.
   * The fields depend only on terrain and the known set, neither of which moves
   * within an era, so a host built at era start is still valid when it attacks.
   */
  buildHost(wave, strength = 1) {
    const rng = makeRng((this.seed ^ (wave * 2654435761)) >>> 0)
    const known = this.known

    // Cells combat may use: the revealed world plus the muster ring.
    this._combatCells = new Set(known.all.map((t) => key(t.q, t.r)))

    // One inward flow field per domain, computed once — terrain does not change.
    this._fields = {}
    for (const d of Object.keys(ENEMY_DOMAINS)) this._fields[d] = this._flowField(d)

    const spawns = known.battlefield.map((t) => ({ q: t.q, r: t.r, terrain: t.terrain }))
    const reachable = (domain, q, r) => this._fields[domain].has(key(q, r))
    const enemies = generateHost(wave, spawns, reachable, rng, strength)
    // Every REVEALED encampment fields a garrison of its own, standing on the
    // camp. They are already inside your frontier, so they do not have to march
    // in — which is exactly why clearing a camp by expanding onto it matters.
    enemies.push(...this._encampmentEnemies(wave, rng, enemies.length))
    return enemies
  }

  /** Muster the era's wave so it can be seen during development. */
  prepareWave() {
    const wave = this.wave + 1
    this.pendingWave = { wave, enemies: this.buildHost(wave, 1) }
    this._emit()
  }

  startCombat(wave = this.combat.wave, strength = this.combat.strength, { scratch = false } = {}) {
    // Reuse the mustered host, so what you spent the era looking at is exactly
    // what turns up. Anything else (the debug bar, a changed wave) re-rolls.
    const pending = !scratch && this.pendingWave?.wave === wave ? this.pendingWave.enemies : null
    const enemies = pending ?? this.buildHost(wave, strength)
    this.pendingWave = null

    const maxHp = PALACE.def + (this.mods?.palaceDef ?? 0)
    this.palaceHp = Math.min(this.palaceHp ?? maxHp, maxHp)

    this.combat = {
      ...this.combat,
      wave, strength, scratch,
      active: true,
      turn: 0, beat: 0, actionSeq: 0,
      result: null,
      queue: [], phase: null, acting: null,
      enemies,
      units: scratch
        ? this._scratchGarrison(wave, makeRng((this.seed ^ (wave * 40503)) >>> 0))
        : this._playerArmy(),
      palace: {
        ...PALACE, hp: this.palaceHp, maxHp, q: 0, r: 0,
        // ⚠️ THE PALACE IS NOT A UNIT. Unit research does not touch it — neither
        // the attack line nor the defence line — because it gets a tech line of
        // its own. Do not fold `unitAtk*` / `unitDef*` in here.
        atk: PALACE.atk,
        lastAttackSeq: null, lastAttackDir: null,
      },
      events: [],
      breaches: 0, razed: 0, losses: 0, fallen: [],
    }
    this._emit()
  }

  /**
   * The real defenders: every unit the progress web granted and you placed.
   * Their stats are live — weapons/armour/per-type mods are folded in here, so
   * a Warrior placed in era 0 fights at era-3 strength once you have the tech.
   */
  _playerArmy() {
    const units = []
    let id = 0
    for (const t of this.world.terr.controlled) {
      // A destroyed unit is a ruin, not a soldier — it sits the battle out
      // until it is repaired.
      if (!t.unit || t.unit.destroyed) continue
      const def = UNIT_DEFS[t.unit.key]
      if (!def) continue
      const s = unitStats(def, this.wave, this.mods, t.unit.level ?? 1)
      units.push({
        id: id++, side: 'player', key: def.key, name: s.name, type: s.type,
        q: t.q, r: t.r, home: t,
        hp: s.def, maxHp: s.def, atk: s.atk,
        range: s.range, acts: s.acts,
        dead: false, lastAttackSeq: null, lastAttackDir: null,
      })
    }
    return units
  }

  /**
   * One garrison enemy per revealed, uncleared encampment, standing on the camp.
   *
   * DOMAIN RULES, in order:
   *   1. An ISLAND camp is always amphibious or astral. Nothing else can leave
   *      an island, and a land-only garrison stuck on one can neither march in
   *      nor be reached — the battle then runs to the turn cap every single era.
   *   2. Otherwise, the cheapest domain that can actually path between the camp
   *      and the palace, read off the flow fields. That makes an unreachable
   *      camp structurally impossible anywhere else too (Mars, the exomoon).
   */
  _encampmentEnemies(wave, rng, startId) {
    const out = []
    const types = Object.values(ENEMY_TYPES)
    const ORDER = ['default', 'amphibious', 'astral']
    for (const t of this.known.tiles) {
      if (!t.encampment) continue
      const domainKey = t.region === 'island' || t.terrain === 'island'
        ? (rng() < 0.75 ? 'amphibious' : 'astral')
        : ORDER.find((d) => this._fields[d]?.has(key(t.q, t.r))) ?? 'astral'
      const type = types[Math.floor(rng() * types.length)]
      // A camp always fields a real body, never a grunt — it is a landmark.
      const tier = rollTier(rng)
      const e = makeEnemy(startId + out.length, type, ENEMY_DOMAINS[domainKey],
        tier.mult < 1 ? { key: 'normal', prefix: '', mult: 1 } : tier, wave, t)
      e.name = `Encamped ${e.name}`
      e.fromCamp = true
      out.push(e)
    }
    return out
  }

  /**
   * Tear the combat down and write its consequences back into the world:
   * casualties are removed from their tiles for good, survivors heal, and the
   * palace keeps the damage it took into the next era.
   */
  endCombat() {
    const c = this.combat
    if (!c.scratch) {
      let losses = 0
      // Both the banked fallen and anything that died in the final beat.
      // A casualty is NOT erased — it stands on its tile as a destroyed unit
      // that gold can bring back. That is the whole point of keeping gold.
      for (const u of [...c.fallen, ...c.units]) {
        if (!u.home?.unit) continue
        if (u.dead || u.hp <= 0) { u.home.unit.destroyed = true; losses++ }
      }
      c.losses = losses
      this.palaceHp = Math.max(0, c.palace?.hp ?? this.palaceHp)
      this.world.terr.version++
    }
    this.combat = { ...this.combat, active: false }
    this._knownCache = null
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

  /**
   * Where a player unit may stand/walk: inside the combat area, and on terrain
   * ITS OWN CLASS can move over. Passing no def falls back to passable land,
   * which is what the scratch garrison's placement scan wants.
   */
  _playerWalkable(tile, def = null) {
    if (!tile || !this._combatCells.has(key(tile.q, tile.r))) return false
    if (tile.q === 0 && tile.r === 0) return false
    if (def) return def.movement.has(tile.terrain)
    return isLand(tile.terrain) && isPassable(tile.terrain)
  }

  /**
   * The DEBUG garrison, for the "Simulate Combat" bar only — a scratch army
   * bought against the same budget curve so any wave is demoable without having
   * played up to it. The real game uses `_playerArmy`.
   */
  _scratchGarrison(wave, rng) {
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
      let pickKey = MIX[0][0]
      for (const [k, p] of MIX) { if (roll < p) { pickKey = k; break } roll -= p }
      const stats = unitStats(UNIT_DEFS[pickKey], wave, this.mods)
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
      // Casualties are BANKED first — they are dropped from `c.units` here, so
      // end-of-combat would otherwise never see them and their tiles would keep
      // a unit that died.
      for (const u of c.units) if (u.dead) c.fallen.push(u)
      c.enemies = c.enemies.filter((e) => !e.dead)
      c.units = c.units.filter((u) => !u.dead)
      if (this._checkEnd()) return null
      c.turn++
      this._moveFields = null
      c.queue = this._buildQueue()
      if (!c.queue.length) { c.result = 'stalemate'; if (c.scratch) this.setSpeed('paused'); return null }
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
      // A defensive construction has atk 0: it never strikes, it only soaks.
      case 'player-attack':
        visible = piece.atk > 0 &&
          this._strike(piece, this._lowestHpWithin(c.enemies, piece, piece.range))
        break
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
    // Only the debug "Simulate" bar stops the clock on a result; an era wave
    // hands control back to the main cycle, which decides what happens next.
    if (c.result) { if (c.scratch) this.setSpeed('paused'); c.acting = null }
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
    const def = UNIT_DEFS[u.key]
    if (!def?.movement.size) return false
    // Cached for the phase: enemies do not move during it, so one multi-source
    // BFS serves every defender instead of one sweep each.
    //
    // ONE FIELD PER CLASS, not per unit: a naval unit's route is nothing like a
    // melee unit's, but there are only nine classes, so this is at most nine
    // BFS sweeps a turn rather than one per defender.
    if (!this._moveFields) this._moveFields = new Map()
    const sig = u.key
    if (!this._moveFields.has(sig)) this._moveFields.set(sig, this._enemyProximityField(def))
    const field = this._moveFields.get(sig)
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

  /** Distance-to-nearest-enemy over ground THIS CLASS can walk. */
  _enemyProximityField(def = null) {
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
          if (!this._playerWalkable(this.world.tiles.get(nk), def)) continue
          field.set(nk, step)
          next.push(n)
        }
      }
      frontier = next
    }
    return field
  }

  // 4 — ONE enemy hits a defender in reach, else the palace, else it RAZES the
  //     ground it is standing on. Returns whether anything happened.
  _enemyAttack(e) {
    const c = this.combat
    const target = this._lowestHpWithin(c.units, e, e.range)
    if (target) return this._strike(e, target)
    if (distance(e.q, e.r, 0, 0) <= e.range) {
      c.breaches++
      return this._strike(e, c.palace)
    }
    return this._raze(e)
  }

  /**
   * An enemy with nothing to fight wrecks what it is standing on — building
   * first, then city, then the improvement. It leaves a RUIN, which gold can
   * rebuild; the palace tile is never razed, since losing it is losing the run.
   */
  _raze(e) {
    const t = this.world.tiles.get(key(e.q, e.r))
    const what = razeTile(this.world, t)
    if (!what) return false
    this.combat.razed++
    this.combat.events.push({ id: `raze-${this.combat.actionSeq}-${key(t.q, t.r)}`, q: t.q, r: t.r, kind: 'raze', amount: what })
    this.combat.actionSeq++
    this._knownCache = null
    return true
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
