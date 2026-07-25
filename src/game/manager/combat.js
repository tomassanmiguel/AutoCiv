// Combat subsystem of GameManager (v2 — turn-based tower defense), split out to keep
// GameManager.js manageable. The methods live in a mixin class copied onto
// GameManager.prototype by installCombat(); `this` is the GameManager instance, so they
// call the manager's other methods/state directly.
//
// Model: combat is DISCRETE TURNS. Each turn — (1) every player piece (a stationary
// "tower") strikes the lowest-HP enemy within its Manhattan-diamond range; (2) every
// enemy acts, marching DOWN one tile toward the player, or — if a blocker sits in the
// tile directly below — dealing a flat 1-damage chip to it (the unit first, then the
// building). An enemy that marches off the bottom BREACHES: it subtracts its `atk` from
// legitimacy and is removed. Combat ends when all enemies are slain or have breached.
import { UNIT_DEFS, unitStats, unitRole } from '../data/units.js'
import { defOf } from '../data/buildings.js'
import { canPlaceOn } from '../data/terrain.js'
import { POP_TYPES } from '../data/pops.js'
import { generateHost, ENEMY_DEFS } from '../data/enemies.js'

// Turns-per-second per speed setting (0 = paused). The battle timer fires every
// COMBAT_INTERVAL_MS of real time and advances the turn accumulator by tps·interval;
// one discrete turn runs each time it crosses 1.
export const SPEED_TPS = { paused: 0, standard: 1, fast: 3, super: 5, ultra: 10 }
export const COMBAT_INTERVAL_MS = 50
export const COMBAT_DURATION = 25 // legacy export (kept for HUD compat)
const MIN_COOLDOWN = 1
const MAX_TURNS = 500 // stalemate safety cap (a held line that can't kill ends as a win)
// After the final enemy is slain, hold the battle phase this long (real ms) so the killing
// blow's shatter animation (.combat-death, 0.5s) finishes before we transition away.
const COMBAT_OUTRO_MS = 600

// A combat turn resolves in FOUR ordered steps, one unit at a time (for readability): enemies
// move, then player units pursue into range, then player pieces attack, then enemies attack.
// Phase 0 is per-turn upkeep (poison / auras / spawns / heals) that runs before the steps.
const PHASE_UPKEEP = 0
const PHASE_ENEMY_MOVE = 1
const PHASE_PLAYER_MOVE = 2
const PHASE_PLAYER_ATTACK = 3
const PHASE_ENEMY_ATTACK = 4
const STEP_LABELS = { 1: 'Enemy Movement', 2: 'Player Pursuit', 3: 'Player Attacks', 4: 'Enemy Attacks' }

// Default attack range (Manhattan diamond) by combat role, when a def omits `range`.
const DEFAULT_RANGE = {
  melee: 1, cavalry: 2, ranged: 3, siege: 4, naval: 2, aerial: 3, astral: 3,
}

class CombatMixin {
  // ---------------------------------------------------------------------------
  // Host generation + battle setup
  // ---------------------------------------------------------------------------
  _generateEnemies() {
    const era = this.data.era
    const t = this.data.tableau
    const bounds = t.visibleBounds(era)
    let mult = this.difficultyMult ?? 1
    // Geneva Convention: reduce the enemy host budget by 5%.
    for (const def of this._activeEffectDefs()) if (def.special === 'enemy_budget_reduce') mult *= 0.95
    const host = generateHost(era, bounds, t.enemyRowCount(era), t.battlefieldColumns(era), Math.random, mult)
    this.data.enemies = host.units
    this.data.enemyHostType = host.type
    this._injectBossWave(era, bounds) // special (boss) waves at Titan/Flagship/Azazoth eras
  }

  /** Boss ("special") waves: generateHost excludes bosses, so add the era's boss here. Titan
   *  (20)/Flagship (24) spearhead the normal horde; Azazoth (27) is the ONLY enemy that wave and
   *  literally spans a whole row. Runs on normal era advance AND the debug era slider. */
  _injectBossWave(era, bounds) {
    if (!bounds) return
    const boss = Object.values(ENEMY_DEFS).find((d) => d.boss && d.era === era)
    if (!boss) return
    const frontRow = bounds.maxRow + 1 // the spawn row just above the grid
    if (boss.special === 'azazoth') {
      this.data.enemies = [] // the only enemy that wave
      const width = bounds.maxCol - bounds.minCol + 1
      const backRow = bounds.maxRow + this.data.tableau.enemyRowCount(era) // starts at the very back
      const az = this._registerBoss(boss, bounds.minCol, backRow)
      az.footprint = [width, 1] // spans the entire row
    } else {
      // Titan/Flagship: centre the footprint in the spawn zone, then clear any overlapping normals.
      const [w] = boss.footprint ?? [1, 1]
      const anchorCol = Math.max(bounds.minCol, Math.min(bounds.maxCol - w + 1, Math.floor((bounds.minCol + bounds.maxCol) / 2) - Math.floor(w / 2)))
      const b = this._registerBoss(boss, anchorCol, frontRow)
      const cells = this._enemyCells(b)
      this.data.enemies = this.data.enemies.filter((o) => o === b || !cells.some((c) => this._enemyCovers(o, c.r, c.c)))
    }
    this.data.enemyHostType = 'boss'
  }

  /** Push a scaled boss enemy onto the host at (col,row); returns it. */
  _registerBoss(d, col, row) {
    const era = this.data.era
    const hp = Math.max(1, Math.round(d.def * Math.pow(1.25, era)))
    this.data.enemySpawnSeq = (this.data.enemySpawnSeq ?? 1_000_000) + 1
    const e = {
      id: this.data.enemySpawnSeq, kind: 'unit', key: d.key, name: d.name, types: d.types ?? ['melee'], level: 1,
      col, row, hp, maxHp: hp, atk: d.atk + era, chip: d.chip ?? 1, boss: true, footprint: d.footprint,
      elite: false, damaged: false, breached: false,
    }
    this.data.enemies.push(e)
    return e
  }

  /** True if `e` spans more than one tile (a boss with a footprint). */
  _isMultiTileEnemy(e) { const f = e.footprint; return !!f && (f[0] > 1 || f[1] > 1) }

  /** Every {r,c} an enemy occupies (footprint extends right + up from its anchor col/row). */
  _enemyCells(e) {
    const [w, h] = e.footprint ?? [1, 1]
    const cells = []
    for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < w; dc++) cells.push({ r: e.row + dr, c: e.col + dc })
    return cells
  }

  /** Whether enemy `e` covers cell (r,c). */
  _enemyCovers(e, r, c) {
    const [w, h] = e.footprint ?? [1, 1]
    return c >= e.col && c < e.col + w && r >= e.row && r < e.row + h
  }

  /** Manhattan distance from (r,c) to the NEAREST cell of enemy `e` (for range targeting). */
  _enemyDistance(e, r, c) {
    const [w, h] = e.footprint ?? [1, 1]
    const dc = c < e.col ? e.col - c : (c > e.col + w - 1 ? c - (e.col + w - 1) : 0)
    const dr = r < e.row ? e.row - r : (r > e.row + h - 1 ? r - (e.row + h - 1) : 0)
    return dc + dr
  }

  _startCombat() {
    this._syncUnitStats(true) // snapshot combat stats for this battle
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      for (const occ of [tile.unit, tile.building]) {
        if (!occ || occ.damaged) continue
        occ.hp = occ.maxHp // damage doesn't persist between combats
        occ.cdTimer = 0    // ready to attack (Siege recharge starts fresh)
        delete occ.trapCd  // trap timers (Discombobulator) start fresh each battle
        delete occ.spawnCd // spawner timers start fresh each battle
        delete occ.bathsCd // Public Baths timer
        delete occ.mercCd  // Embassy timer
        delete occ.lastAttackSeq; delete occ.lastAttackDir
        // Units may reposition (pursuit) during combat — remember where they started so
        // they slide back home when the battle ends (_restoreUnitHomes).
        if (occ.kind === 'unit') { occ.homeRow = tile.row; occ.homeCol = tile.col }
      }
    }
    for (const e of this.data.enemies) {
      e.hp = e.maxHp
      e.damaged = false
      e.breached = false
      delete e.skipTurns
    }
    this._applyManhattanProject() // nuke a random enemy + lay a fallout tile
    this.data.combatTurn = 0
    this.data.combatAccum = 0
    this.data.combatTime = 0
    this.data.combatEvents = []
    this.data.combatSeq = 0
    this.data.combatStepLabel = '' // which of the 4 turn-steps is currently resolving (HUD)
    // Beat state machine (one unit acts per beat): start "past" the last phase so the first
    // beat rolls over into a fresh turn (upkeep → the 4 steps). See _nextActor.
    this._combatPhaseIdx = PHASE_ENEMY_ATTACK
    this._combatQueue = []
    this._combatOutro = 0 // >0 = final enemy slain, counting down the shatter hold before transition
    this.data.combatIntro = true // hold the fight until the "Battle" banner clears
    this.data.phase = 'battle'
    this._restartTimer()
  }

  /** Called by the UI once the "Battle" announcement has cleared — the fight begins. */
  dismissCombatIntro() {
    if (this.data.phase !== 'battle' || !this.data.combatIntro) return
    this.data.combatIntro = false
    this._emit()
  }

  // ---------------------------------------------------------------------------
  // Turn loop — a turn resolves in FOUR ordered steps (enemy move → player pursuit →
  // player attack → enemy attack), ONE unit at a time (a "beat"), so the action reads
  // clearly. The battle timer fires one beat per crossing of the speed accumulator, so
  // the speed setting now controls how fast each individual step plays.
  // ---------------------------------------------------------------------------
  _combatStep() {
    if (this.data.phase !== 'battle' || this.data.combatIntro) return
    // Final enemy slain: hold the battle a beat so its shatter finishes, THEN transition.
    if (this._combatOutro > 0) {
      this._combatOutro -= COMBAT_INTERVAL_MS
      if (this._combatOutro <= 0) { this._combatOutro = 0; this._endCombat() }
      return
    }
    const tps = SPEED_TPS[this.data.speed] || 0
    if (tps <= 0) return
    this.data.combatAccum += tps * (COMBAT_INTERVAL_MS / 1000)
    if (this.data.combatAccum < 1) return
    this.data.combatAccum -= 1
    this._runBeat()
  }

  /** Resolve exactly ONE effective beat — a single unit's action for the current step —
   *  silently skipping actors that have nothing to do (a blocked enemy, an out-of-range
   *  unit, a recharging tower). Advances the step/turn when a queue empties. */
  _runBeat() {
    // A win outro is pending but this is a DIRECT drive (headless sims — no _combatStep interval
    // to count it down): finalize now so the battle concludes instead of spinning on dead enemies.
    if (this._combatOutro > 0) { this._combatOutro = 0; this._endCombat(); return }
    for (let guard = 0; guard < 4000; guard++) {
      const actor = this._nextActor()
      if (this.data.phase !== 'battle') return // ended mid-advance (defeat / all slain / MAX_TURNS)
      if (!actor) continue // crossed a step/turn boundary — loop to fetch the first real actor
      const bounds = this.data.tableau.visibleBounds(this.data.era)
      if (!bounds) { this._endCombat(); return }
      this.data.combatSeq++
      this.data.combatEvents = []
      const did = this._performActor(actor, bounds)
      if (did && this.data.combatEvents.length > 0) {
        const civ = this.data.civilization
        if (civ.legitimacy.value <= 0) { civ.legitimacy.value = 0; this._defeat(); return }
        this._emit() // render this beat — including a killing blow's float + the enemy's shatter
        // Last enemy slain → hold in 'battle' so the shatter plays out; _combatStep counts the
        // outro down then transitions (a direct sim drive finalizes on its next _runBeat).
        if (!this.data.enemies.some((e) => !e.damaged && !e.breached)) this._combatOutro = COMBAT_OUTRO_MS
        return
      }
      // no-op actor: keep scanning without spending this beat
    }
    this._emit() // guard tripped (deep stalemate) — yield; MAX_TURNS ends it across ticks
  }

  /** Pop the next actor from the current step's queue; when a queue empties, advance to the
   *  next step (or roll over into a new turn, running upkeep). Returns null when it only
   *  advanced (the caller loops again). */
  _nextActor() {
    if (this._combatQueue.length) return this._combatQueue.shift()
    this._combatPhaseIdx++
    if (this._combatPhaseIdx > PHASE_ENEMY_ATTACK) {
      this._combatPhaseIdx = PHASE_UPKEEP
      this.data.combatTurn++
      if (this.data.combatTurn > MAX_TURNS) { this._endCombat(); return null }
    }
    if (STEP_LABELS[this._combatPhaseIdx]) this.data.combatStepLabel = STEP_LABELS[this._combatPhaseIdx]
    this._combatQueue = this._buildPhaseQueue(this._combatPhaseIdx)
    return null
  }

  /** The ordered actor list for a step. Enemies/pieces are referenced indirectly (id / cell)
   *  and re-validated when executed, since the board changes as a step resolves. */
  _buildPhaseQueue(idx) {
    if (idx === PHASE_UPKEEP) return [{ kind: 'upkeep' }]
    if (idx === PHASE_ENEMY_MOVE) return this._liveEnemiesFrontFirst().map((e) => ({ kind: 'emove', id: e.id }))
    if (idx === PHASE_PLAYER_MOVE) return this._pursuitQueue()
    if (idx === PHASE_PLAYER_ATTACK) return this._playerPieceQueue()
    if (idx === PHASE_ENEMY_ATTACK) return this._liveEnemiesFrontFirst().filter((e) => !e._moved).map((e) => ({ kind: 'eatk', id: e.id }))
    return []
  }

  /** Execute one actor's action for its step; returns true if it did something visible. */
  _performActor(actor, bounds) {
    if (actor.kind === 'upkeep') { this._turnUpkeep(); return this.data.combatEvents.length > 0 }
    if (actor.kind === 'emove') {
      const e = this._enemyById(actor.id)
      if (!e || e.damaged || e.breached) return false
      e._moved = this._enemyMove(e, bounds)
      return this.data.combatEvents.length > 0
    }
    if (actor.kind === 'pmove') {
      const t = this.data.tableau.tileAt(actor.row, actor.col)
      if (!t || t.unit !== actor.unit || t.unit.damaged) return false
      return this._pursueUnit(t.unit, actor.row, actor.col)
    }
    if (actor.kind === 'patk') {
      const t = this.data.tableau.tileAt(actor.row, actor.col)
      const occ = actor.pkind === 'unit' ? t?.unit : t?.building
      if (!occ || occ.damaged || occ !== actor.occ) return false
      this._resolvePlayerPiece({ occ, row: actor.row, col: actor.col })
      return this.data.combatEvents.length > 0
    }
    if (actor.kind === 'eatk') {
      const e = this._enemyById(actor.id)
      if (!e || e.damaged || e.breached || e._moved) return false
      return this._enemyAttack(e, bounds)
    }
    return false
  }

  _enemyById(id) { return this.data.enemies.find((e) => e.id === id) }
  _liveEnemiesFrontFirst() {
    return this.data.enemies.filter((e) => !e.damaged && !e.breached).sort((a, b) => a.row - b.row || a.col - b.col)
  }

  /** Pursuit-capable player units, bottom-to-top (eligibility re-checked as each acts). */
  _pursuitQueue() {
    const q = []
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const u = tile.unit
      if (u && !u.damaged && (UNIT_DEFS[u.key]?.pursuit ?? 0) > 0) q.push({ kind: 'pmove', unit: u, row: tile.row, col: tile.col })
    }
    return q.sort((a, b) => a.row - b.row || a.col - b.col)
  }

  /** Every attacking player piece (unit + tower), bottom-to-top, left-to-right. */
  _playerPieceQueue() {
    const q = []
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      if (tile.unit && !tile.unit.damaged) q.push({ kind: 'patk', occ: tile.unit, pkind: 'unit', row: tile.row, col: tile.col })
      if (tile.building && !tile.building.damaged) q.push({ kind: 'patk', occ: tile.building, pkind: 'building', row: tile.row, col: tile.col })
    }
    return q.sort((a, b) => a.row - b.row || a.col - b.col)
  }

  /** Per-turn upkeep (before the four steps): environmental / passive effects that aren't one
   *  unit's action — poison, Death Star, enemy auras, trap stuns, spawners, support heals. Also
   *  stamps each live enemy's per-turn act count + stun flag for the move/attack steps. */
  _turnUpkeep() {
    this._jagerCoverage = null
    this._applyPoison() // Nanite Warfare: 5% max-HP poison to all enemies each turn
    if (this._hasWonder('death_star') && this.data.combatTurn % 5 === 0) this._applyDeathStar()
    this._applyEnemyAuras()        // Shaman heals, Leader buffs, Flagship spawns
    this._applyTrapTriggers()      // Discombobulator: stun nearby enemies before they act
    this._applySpawners()          // Drydock/Stables/Aircraft Carrier/Spaceport: periodic spawns
    this._applySupportBuildings()  // Campfire/Public Baths heals + Embassy free mercenaries
    for (const e of this.data.enemies) {
      if (e.damaged || e.breached) continue
      e._acts = this._enemyActsThisTurn(e)
      e._moved = false
      if (e.skipTurns > 0 && e.key !== 'azazoth') { e.skipTurns -= 1; e._skip = true } else e._skip = false
    }
  }

  /** Run a WHOLE turn synchronously (headless sims + the logical "turn" unit): upkeep, then
   *  the four steps in order. The animated UI instead advances one beat at a time via _runBeat. */
  _runTurn() {
    this.data.combatSeq++
    this.data.combatEvents = []
    this.data.combatTurn++
    const bounds = this.data.tableau.visibleBounds(this.data.era)
    if (!bounds) { this._endCombat(); return }
    this._turnUpkeep()
    for (const e of this._liveEnemiesFrontFirst()) e._moved = this._enemyMove(e, bounds) // 1) enemy movement
    this._playerMovePhase()                                                              // 2) player pursuit
    this._playerPhase()                                                                  // 3) player attacks
    for (const e of this._liveEnemiesFrontFirst()) if (!e._moved) this._enemyAttack(e, bounds) // 4) enemy attacks
    const civ = this.data.civilization
    if (civ.legitimacy.value <= 0) { civ.legitimacy.value = 0; this._defeat(); return }
    const remaining = this.data.enemies.some((e) => !e.damaged && !e.breached)
    if (!remaining || this.data.combatTurn > MAX_TURNS) { this._endCombat(); return }
    this._emit()
  }

  /** Step 2: every pursuit unit that can reach an out-of-range enemy closes toward it. */
  _playerMovePhase() {
    for (const a of this._pursuitQueue()) {
      const t = this.data.tableau.tileAt(a.row, a.col)
      if (t?.unit === a.unit && !a.unit.damaged) this._pursueUnit(a.unit, a.row, a.col)
    }
  }

  /** Step 3: all player pieces fire at the lowest-HP enemy in range, bottom-to-top. */
  _playerPhase() {
    for (const a of this._playerPieceQueue()) this._resolvePlayerPiece({ occ: a.occ, row: a.row, col: a.col })
  }

  /** Resolve one player piece's attacks for the turn: its shot, plus bonus shots granted by a
   *  Chronobooster aura or a Machine Gun underlay (all within its single beat). */
  _resolvePlayerPiece(p) {
    this._pieceAttack(p)
    // Chronobooster aura: units in range act a second time this turn (cooldown bypassed).
    if (p.occ.kind === 'unit' && p.occ.cmdActTwice && !p.occ.damaged) { p.occ.cdTimer = 0; this._pieceAttack(p) }
    // Machine Gun underlay: the unit sharing its tile attacks +level extra times.
    if (p.occ.kind === 'unit' && !p.occ.damaged) {
      const bld = this.data.tableau.tileAt(p.row, p.col)?.building
      if (bld && !bld.damaged && bld.key === 'machine_gun') {
        for (let i = 0; i < bld.level && !p.occ.damaged; i++) { p.occ.cdTimer = 0; this._pieceAttack(p) }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Player pursuit movement (step 2)
  // ---------------------------------------------------------------------------
  /** A pursuit unit with no enemy in attack range, but one reachable within range+pursuit,
   *  closes up to `pursuit` tiles toward it (through its `move` domains) until in range. */
  _pursueUnit(unit, fromRow, fromCol) {
    const def = UNIT_DEFS[unit.key]
    const pursuit = def?.pursuit ?? 0
    const range = this._pieceRange(unit)
    if (pursuit <= 0 || range <= 0) return false
    if (this._lowestHpEnemyInRange(fromRow, fromCol, range)) return false // already able to strike → hold
    // Nearest live enemy this unit could reach into range of.
    let target = null, bestD = Infinity
    for (const e of this.data.enemies) {
      if (e.damaged || e.breached) continue
      const d = this._enemyDistance(e, fromRow, fromCol)
      if (d <= range + pursuit && d < bestD) { bestD = d; target = e }
    }
    if (!target) return false
    let r = fromRow, c = fromCol, steps = pursuit, moved = false
    while (steps > 0 && this._enemyDistance(target, r, c) > range) {
      const next = this._pursueStepCell(unit, def, r, c, target)
      if (!next) break
      const cur = this.data.tableau.tileAt(r, c)
      if (cur?.unit === unit) cur.unit = null
      this.data.tableau.tileAt(next.r, next.c).unit = unit
      r = next.r; c = next.c; steps -= 1; moved = true
    }
    if (moved) {
      this._pushEvent({ kind: 'march', col: c, row: r }) // no float (drives the slide + marks a beat)
      this._syncUnitStats(true) // new tile → refresh terrain/Brewery/Tribalism bonuses
    }
    return moved
  }

  /** Best orthogonally-adjacent cell that steps `unit` closer to `target` (empty of a live unit,
   *  on the player grid, terrain in the unit's move domains). Null if none improves. */
  _pursueStepCell(unit, def, r, c, target) {
    const bounds = this.data.tableau.visibleBounds(this.data.era)
    let best = null, bestD = this._enemyDistance(target, r, c)
    for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
      if (nr < bounds.minRow || nr > bounds.maxRow || nc < bounds.minCol || nc > bounds.maxCol) continue
      if (!this.data.tableau.isUnlocked(nr, nc, this.data.era)) continue
      const t = this.data.tableau.tileAt(nr, nc)
      if (!t || !this._unitCanMoveOnto(unit, def, t)) continue
      const d = this._enemyDistance(target, nr, nc)
      if (d < bestD) { bestD = d; best = { r: nr, c: nc } }
    }
    return best
  }

  /** True if `unit` may step onto `tile`: no other live unit there, and the terrain is one of
   *  the unit's `move` domains (land / water / space). */
  _unitCanMoveOnto(unit, def, tile) {
    if (tile.unit && !tile.unit.damaged && tile.unit !== unit) return false
    const domains = def.move ?? ['land']
    return domains.some((d) => canPlaceOn(d, tile.terrain))
  }

  /** Tiles a player unit at (row,col) could strike THIS coming combat round — for the hover
   *  preview. `attack` = its current attack-range diamond; `pursuit` = extra tiles it could hit
   *  AFTER pursuing (an obstruction-aware BFS through its move domains, up to `pursuit` steps,
   *  so friendly units / impassable terrain in the way shorten the reach). Both are Sets of
   *  "row,col" keys; the origin is excluded and `pursuit` excludes `attack`. Empty when the piece
   *  can't attack (utility / range 0). */
  unitReachCells(row, col) {
    const empty = { attack: new Set(), pursuit: new Set() }
    const tile = this.data.tableau.tileAt(row, col)
    const unit = tile?.unit
    if (!unit || unit.kind !== 'unit' || unit.damaged) return empty
    const def = UNIT_DEFS[unit.key]
    const range = this._pieceRange(unit)
    if (!def || range <= 0) return empty
    const era = this.data.era
    const bounds = this.data.tableau.visibleBounds(era)
    if (!bounds) return empty
    const key = (r, c) => `${r},${c}`
    const inGrid = (r, c) => r >= bounds.minRow && r <= bounds.maxRow && c >= bounds.minCol && c <= bounds.maxCol && this.data.tableau.isUnlocked(r, c, era)
    const addDiamond = (r0, c0, set) => {
      for (let dr = -range; dr <= range; dr++) {
        const w = range - Math.abs(dr)
        for (let dc = -w; dc <= w; dc++) if (inGrid(r0 + dr, c0 + dc)) set.add(key(r0 + dr, c0 + dc))
      }
    }
    // Red: attack diamond from the current tile.
    const attack = new Set()
    addDiamond(row, col, attack)
    // Reachable standing tiles via pursuit BFS (obstruction-aware) through move domains.
    const reach = [[row, col]]
    const pursuit = def.pursuit ?? 0
    if (pursuit > 0) {
      const seen = new Set([key(row, col)])
      let frontier = [[row, col]]
      for (let step = 0; step < pursuit && frontier.length; step++) {
        const next = []
        for (const [r, c] of frontier) {
          for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
            if (!inGrid(nr, nc) || seen.has(key(nr, nc))) continue
            const t = this.data.tableau.tileAt(nr, nc)
            if (!t || !this._unitCanMoveOnto(unit, def, t)) continue // blocked → shortens pursuit
            seen.add(key(nr, nc)); next.push([nr, nc]); reach.push([nr, nc])
          }
        }
        frontier = next
      }
    }
    // Blue: attack diamonds from every reachable tile, minus the red set (and the origin).
    const pursuitSet = new Set()
    for (const [r, c] of reach) addDiamond(r, c, pursuitSet)
    attack.delete(key(row, col))
    for (const k of attack) pursuitSet.delete(k)
    pursuitSet.delete(key(row, col))
    return { attack, pursuit: pursuitSet }
  }

  /** Where an enemy threatens next round — for the hover preview (mirrors unitReachCells but
   *  DOWN-column, since enemies march toward the player). `attack` = cells it could chip (down
   *  its column within chip range); `move` = cells it would advance through this turn (up to its
   *  per-turn acts, obstruction-stopped), excluding the attack cells. Cells are "row,col" keys. */
  enemyReachCells(e) {
    const empty = { attack: new Set(), move: new Set() }
    if (!e || e.damaged || e.breached) return empty
    const bounds = this.data.tableau.visibleBounds(this.data.era)
    if (!bounds) return empty
    const key = (r, c) => `${r},${c}`
    const [w] = e.footprint ?? [1, 1]
    const chip = this._enemyChipRange(e)
    let acts = this._enemyActsThisTurn(e); if (acts <= 0) acts = 1 // preview the turn a skip-enemy DOES act
    const attack = new Set(), move = new Set()
    for (let c = e.col; c < e.col + w; c++) {
      for (let d = 1; d <= chip; d++) { const r = e.row - d; if (r >= bounds.minRow) attack.add(key(r, c)) }
      for (let d = 1; d <= acts; d++) {
        const r = e.row - d
        if (r < bounds.minRow) break // marches off the bottom (breach)
        const t = this.data.tableau.tileAt(r, c)
        const blocked = t && ((t.unit && !t.unit.damaged) || (t.building && !t.building.damaged))
        const enemyThere = this.data.enemies.some((o) => o !== e && !o.damaged && !o.breached && o.row === r && o.col === c)
        if (blocked || enemyThere) break
        move.add(key(r, c))
      }
    }
    for (const k of attack) move.delete(k) // attack cells take precedence in the display
    return { attack, move }
  }

  /** One tower's attack: strike the lowest-HP enemy within its range. Units with a
   *  cooldown (Siege = 2) must recharge for that many turns after firing. */
  _pieceAttack(p) {
    const occ = p.occ
    const range = this._pieceRange(occ)
    if (range <= 0) return false
    if (occ.cdTimer > 0) { occ.cdTimer -= 1; return false } // recharging after a shot
    const target = this._lowestHpEnemyInRange(p.row, p.col, range)
    if (!target) return false
    let atk = this._effectiveAtk(occ)
    // Adaptive Strategy: units gain +5% attack per elapsed combat turn (resets each battle;
    // turn 1 = base). Applies to units only, not towers.
    if (occ.kind === 'unit' && this._activeEffectDefs().some((d) => d.special === 'combat_atk_ramp')) {
      atk = Math.round(atk * (1 + 0.05 * Math.max(0, this.data.combatTurn - 1)))
    }
    this._pushEvent({ kind: 'attack', side: 'player', col: p.col, row: p.row })
    occ.lastAttackSeq = this.data.combatSeq // drives the attack "thrust" animation
    occ.lastAttackDir = this._attackDir(p.row, p.col, target.row, target.col) // lunge toward the target
    this._dealDamageToEnemy(target, atk)
    // Siege splash: deal splash× damage to every live enemy adjacent to the target.
    const splash = UNIT_DEFS[occ.key]?.splash
    if (splash) {
      const sdmg = Math.round(atk * splash)
      if (sdmg > 0) for (const e of this.data.enemies) {
        if (e.damaged || e.breached || e === target) continue
        if (Math.abs(e.row - target.row) + Math.abs(e.col - target.col) === 1) this._dealDamageToEnemy(e, sdmg)
      }
    }
    const cd = UNIT_DEFS[occ.key]?.cooldown ?? defOf(occ.key)?.cooldown ?? 0
    if (cd > 0) occ.cdTimer = cd
    return true
  }

  /** Attack range for a player piece (0 = doesn't attack). Utility units never attack;
   *  buildings attack only when their def declares a `range` (they are "towers"). */
  _pieceRange(occ) {
    if (occ.kind === 'unit') {
      const def = UNIT_DEFS[occ.key]
      if (!def || def.bakerDef) return 0
      let range = def.range ?? DEFAULT_RANGE[unitRole(def)] ?? 1
      // Telegram / Tightbeams: +1 range to ranged-role units.
      if (unitRole(def) === 'ranged') for (const d of this._activeEffectDefs()) if (d.rangedReach) range += d.rangedReach
      // Automobile: +1 attack (pursuit) range to ALL units.
      if (this._activeEffectDefs().some((d) => d.special === 'pursuit_range')) range += 1
      // Command-range aura (Star Fort / Radio Tower): +range to ranged-role units.
      if (unitRole(def) === 'ranged') range += occ.cmdRange ?? 0
      return range
    }
    return defOf(occ.key)?.range ?? 0
  }

  /** Screen-space unit vector from an attacker to its target, for the directional attack lunge.
   *  Rows increase UPWARD on screen, so the screen-y component is the negated row delta. */
  _attackDir(fr, fc, tr, tc) {
    const dr = tr - fr, dc = tc - fc
    const dist = Math.hypot(dr, dc) || 1
    return { dx: dc / dist, dy: -dr / dist }
  }

  /** Lowest-HP live enemy within Manhattan-diamond `range` of (row,col). Ties break
   *  toward the enemy closest to breaching (lowest row), then lowest column. */
  _lowestHpEnemyInRange(row, col, range) {
    let best = null
    for (const e of this.data.enemies) {
      if (e.damaged || e.breached) continue
      if (this._enemyDistance(e, row, col) > range) continue // nearest covered cell (multi-tile bosses)
      if (!best || e.hp < best.hp ||
        (e.hp === best.hp && (e.row < best.row || (e.row === best.row && e.col < best.col)))) best = e
    }
    return best
  }

  /** Death Star wonder: vaporize a random live enemy (instant kill) and deal 5000 to Azazoth. */
  _applyDeathStar() {
    const live = this.data.enemies.filter((e) => !e.damaged && !e.breached)
    if (!live.length) return
    const target = live[Math.floor(Math.random() * live.length)]
    target.hp = 0; target.damaged = true
    this._pushEvent({ kind: 'damage', side: 'enemy', amount: 9999, killed: true, col: target.col, row: target.row })
    const aza = this.data.enemies.find((e) => e.key === 'azazoth' && !e.damaged && !e.breached)
    if (aza) this._dealDamageToEnemy(aza, 5000)
  }

  /** Nanite Warfare: each turn, poison every live enemy for 5% of its max HP. */
  _applyPoison() {
    if (!this._activeEffectDefs().some((d) => d.special === 'poison_on_start')) return
    for (const e of this.data.enemies) {
      if (e.damaged || e.breached || e.key === 'azazoth') continue // Azazoth is immune to poison
      this._dealDamageToEnemy(e, Math.max(1, Math.round(e.maxHp * 0.05)))
    }
  }

  _dealDamageToEnemy(e, amount) {
    // Elder Awareness: +50% damage vs the Azazoth boss (applies to direct + splash hits).
    if (e.key === 'azazoth' && this._activeEffectDefs().some((d) => d.special === 'azazoth_damage')) amount = Math.round(amount * 1.5)
    const def = ENEMY_DEFS[e.key]
    // Swarm: takes only 1 damage per hit (HP doesn't scale — it tanks by attrition).
    if (def?.special === 'split_when_damaged') amount = Math.min(amount, 1)
    if (amount <= 0) return
    e.hp -= amount
    const killed = e.hp <= 0
    if (killed) { e.hp = 0; e.damaged = true }
    this._pushEvent({ kind: 'damage', side: 'enemy', amount, killed, col: e.col, row: e.row })
    if (!killed) this._onEnemyDamaged(e, def)
  }

  /** On-damage enemy triggers (survivors only): Warper blinks away, Swarm splits. */
  _onEnemyDamaged(e, def) {
    if (!def) return
    if (def.special === 'teleport_when_damaged') this._teleportEnemy(e, 3)           // Warper
    else if (def.special === 'split_when_damaged') this._spawnEnemyAdjacent(e, 'swarm') // Swarm
  }

  /** Build + register a fresh scaled enemy of `key` at (row,col). Returns it, or null. */
  _spawnEnemy(key, col, row) {
    const d = ENEMY_DEFS[key]
    if (!d) return null
    const era = this.data.era
    const noScale = d.special === 'split_when_damaged'
    const hp = Math.max(1, noScale ? d.def : Math.round(d.def * Math.pow(1.25, era)))
    this.data.enemySpawnSeq = (this.data.enemySpawnSeq ?? 1_000_000) + 1
    const e = {
      id: this.data.enemySpawnSeq, kind: 'unit', key, name: d.name, types: d.types ?? ['melee'], level: 1,
      col, row, hp, maxHp: hp, atk: d.atk + era, chip: d.chip ?? 1, elite: false, damaged: false, breached: false,
    }
    this.data.enemies.push(e)
    this._pushEvent({ kind: 'march', col, row })
    return e
  }

  /** A cell (grid or spawn zone) that has no live enemy and is inside the battlefield. */
  _enemySpotFree(row, col, bounds) {
    if (col < bounds.minCol || col > bounds.maxCol) return false
    if (row < bounds.minRow || row > bounds.maxRow + this.data.tableau.enemyRowCount(this.data.era)) return false
    return !this.data.enemies.some((o) => !o.damaged && !o.breached && o.row === row && o.col === col)
  }

  /** Spawn `key` on a random empty cell orthogonally adjacent to `e` (capped so it can't explode). */
  _spawnEnemyAdjacent(e, key) {
    const bounds = this.data.tableau.visibleBounds(this.data.era)
    if (!bounds) return
    if (this.data.enemies.filter((o) => !o.damaged && !o.breached).length >= 40) return // runaway guard
    const cands = [[e.row + 1, e.col], [e.row - 1, e.col], [e.row, e.col + 1], [e.row, e.col - 1]]
      .filter(([r, c]) => this._enemySpotFree(r, c, bounds))
    if (!cands.length) return
    const [r, c] = cands[Math.floor(Math.random() * cands.length)]
    this._spawnEnemy(key, c, r)
  }

  /** Blink `e` to a random empty cell within Manhattan `range` (Warper). */
  _teleportEnemy(e, range) {
    const bounds = this.data.tableau.visibleBounds(this.data.era)
    if (!bounds) return
    const spots = []
    for (let r = e.row - range; r <= e.row + range; r++) {
      for (let c = e.col - range; c <= e.col + range; c++) {
        if (Math.abs(r - e.row) + Math.abs(c - e.col) > range || (r === e.row && c === e.col)) continue
        if (this._enemySpotFree(r, c, bounds)) spots.push([r, c])
      }
    }
    if (!spots.length) return
    const [r, c] = spots[Math.floor(Math.random() * spots.length)]
    e.row = r; e.col = c
    this._pushEvent({ kind: 'march', col: c, row: r })
  }

  /** Effective breach :attack: for an enemy. Berserker grows by its missing HP. */
  _enemyBreachAtk(e) {
    let atk = e.atk
    if (ENEMY_DEFS[e.key]?.special === 'grows_when_damaged') atk = e.atk + (e.maxHp - e.hp)
    if (e.buffed) atk *= 2 // Leader aura (set each turn in _applyEnemyAuras)
    return atk
  }

  /** How many times an enemy acts this turn: speed modifiers (double/triple/ninja) and the
   *  Juggernaut's every-other-turn skip. Alien is only fast in space. */
  _enemyActsThisTurn(e) {
    const s = ENEMY_DEFS[e.key]?.special
    if (e.key === 'azazoth' || e.key === 'flagship') return this.data.combatTurn % 2 === 1 ? 1 : 0 // move every other turn
    if (s === 'skip_alt_turn') return this.data.combatTurn % 2 === 1 ? 1 : 0
    if (s === 'triple_speed') {
      if (e.key === 'alien') { const t = this.data.tableau.tileAt(e.row, e.col); return t?.def?.place === 'space' ? 3 : 1 }
      return 3
    }
    if (s === 'double_speed') return 2
    if (s === 'least_resistance' && e.key === 'ninja') return 2 // Ninja moves twice
    return 1
  }

  /** Bundled enemy phase (auras + all movement + all attacks), front-most first. The live turn
   *  splits movement (step 1) and attacks (step 4) across the player steps; this convenience keeps
   *  the headless sims that exercise enemy pathing/breach/chip in isolation working unchanged. */
  _enemyPhase(bounds) {
    this._jagerCoverage = null // recompute player-range coverage once per turn (for Jäger)
    this._applyEnemyAuras() // Shaman heals, Leader buffs, Flagship spawns — before anyone acts
    for (const e of this._liveEnemiesFrontFirst()) {
      e._acts = this._enemyActsThisTurn(e); e._moved = false
      if (e.skipTurns > 0 && e.key !== 'azazoth') { e.skipTurns -= 1; e._skip = true } else e._skip = false
    }
    for (const e of this._liveEnemiesFrontFirst()) e._moved = this._enemyMove(e, bounds)
    for (const e of this._liveEnemiesFrontFirst()) if (!e._moved) this._enemyAttack(e, bounds)
  }

  /** Per-turn enemy auras + boss spawns: enemy_shaman heals adjacent allies, Leader buffs
   *  adjacent allies' breach attack (×2), Flagship spawns 2 random enemies. */
  _applyEnemyAuras() {
    const live = () => this.data.enemies.filter((e) => !e.damaged && !e.breached)
    const all = live()
    for (const e of all) e.buffed = false // recomputed fresh each turn
    const adjacent = (a, b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1
    for (const src of all) {
      const s = ENEMY_DEFS[src.key]?.special
      if (s === 'heal_adjacent') {
        for (const e of all) {
          if (e === src || !adjacent(e, src) || e.hp >= e.maxHp) continue
          const amt = Math.max(1, Math.round(e.maxHp * 0.1))
          e.hp = Math.min(e.maxHp, e.hp + amt)
          this._pushEvent({ kind: 'heal', amount: amt, col: e.col, row: e.row })
        }
      } else if (s === 'buff_adjacent') {
        for (const e of all) if (e !== src && adjacent(e, src)) e.buffed = true
      }
    }
    for (const src of all) { // Flagship: 2 reinforcements per turn
      if (ENEMY_DEFS[src.key]?.special === 'spawns_enemies') {
        this._spawnEnemyAdjacent(src, this._randomHostKey())
        this._spawnEnemyAdjacent(src, this._randomHostKey())
      }
    }
  }

  /** A random non-boss enemy key eligible for the current era (Flagship reinforcements). */
  _randomHostKey() {
    const pool = Object.values(ENEMY_DEFS).filter((d) => !d.boss && d.era <= this.data.era)
    return (pool.length ? pool[Math.floor(Math.random() * pool.length)] : ENEMY_DEFS.raider).key
  }

  /** Column chip reach: Deadeye 4, Ranger/Mongol 2, everyone else 1 (adjacent only). */
  _enemyChipRange(e) {
    if (e.key === 'deadeye') return 4
    if (e.key === 'ranger' || e.key === 'mongol') return 2
    return 1
  }

  /** An enemy chips a blocker, applying its destroy/pierce specials. */
  _enemyChip(e, blocker, tile) {
    const s = ENEMY_DEFS[e.key]?.special
    if (s === 'destroy_blockers' || e.key === 'azazoth') { this._chipBlocker(blocker, blocker.hp, tile); return } // Obliterator / Azazoth
    if (s === 'destroy_buildings' && blocker.kind === 'building') { this._chipBlocker(blocker, blocker.hp, tile); return } // Sapper vs buildings
    const chip = e.chip ?? 1
    this._chipBlocker(blocker, chip, tile)
    if (s === 'pierce_blockers') { // Beamer: the hit carries through to every blocker behind
      const minRow = this.data.tableau.visibleBounds(this.data.era)?.minRow ?? tile.row
      for (let r = tile.row - 1; r >= minRow; r--) {
        const t = this.data.tableau.tileAt(r, tile.col)
        for (const occ of [t?.unit, t?.building]) if (occ && !occ.damaged) this._chipBlocker(occ, chip, t)
      }
    }
  }

  /** Sapper also chips every OTHER adjacent blocker (buildings destroyed outright). */
  _sapperAdjacent(e, tile) {
    for (const nb of this._adjacentTiles(tile.row, tile.col)) {
      for (const occ of [nb.unit, nb.building]) {
        if (!occ || occ.damaged) continue
        this._chipBlocker(occ, occ.kind === 'building' ? occ.hp : (e.chip ?? 1), nb)
      }
    }
  }

  /** Set of "r,c" tiles within attack range of any live player unit — the Jäger avoids these. */
  _playerRangeCoverage() {
    const covered = new Set()
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const u = tile.unit
      if (!u || u.damaged) continue
      const range = this._pieceRange(u)
      for (let dr = -range; dr <= range; dr++) {
        for (let dc = -range; dc <= range; dc++) {
          if (Math.abs(dr) + Math.abs(dc) <= range) covered.add(`${tile.row + dr},${tile.col + dc}`)
        }
      }
    }
    return covered
  }

  /** Jäger "least resistance": sidestep toward the column whose downward path has the FEWEST
   *  tiles inside player ranged-range, before descending. Returns true if it moved laterally. */
  _jagerMove(e, bounds) {
    const covered = (this._jagerCoverage ??= this._playerRangeCoverage())
    const belowRow = e.row - 1
    const pathDanger = (c) => {
      let n = 0
      for (let r = bounds.minRow; r <= belowRow; r++) {
        if (r > bounds.maxRow) continue // spawn zone: passable, never in range
        const t = this.data.tableau.tileAt(r, c)
        if (!t || !this._enemyCanTraverse(e, t.terrain)) return Infinity // impassable column
        if (covered.has(`${r},${c}`)) n++
      }
      return n
    }
    let bestCol = e.col, best = pathDanger(e.col)
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const d = pathDanger(c)
      if (d < best) { best = d; bestCol = c }
    }
    if (bestCol === e.col) return false // already on the safest reachable column → descend
    const nc = e.col + Math.sign(bestCol - e.col)
    if (nc < bounds.minCol || nc > bounds.maxCol) return false
    const inSpawn = e.row > bounds.maxRow
    const lat = this.data.tableau.tileAt(e.row, nc)
    if (!inSpawn && (!lat || !this._enemyCanTraverse(e, lat.terrain) ||
      (lat.unit && !lat.unit.damaged) || (lat.building && !lat.building.damaged))) return false
    if (this.data.enemies.some((o) => o !== e && !o.damaged && !o.breached && o.row === e.row && o.col === nc)) return false
    e.col = nc
    this._pushEvent({ kind: 'march', col: e.col, row: e.row })
    return true
  }

  /** Kamikaze self-destruct: destroy every player piece within Manhattan `range` of `tile`. */
  _enemyExplode(e, tile, range) {
    for (const t of this.data.tableau.visibleTiles(this.data.era)) {
      if (Math.abs(t.row - tile.row) + Math.abs(t.col - tile.col) > range) continue
      for (const occ of [t.unit, t.building]) if (occ && !occ.damaged) this._chipBlocker(occ, occ.hp, t)
    }
    e.hp = 0; e.damaged = true
    this._pushEvent({ kind: 'damage', side: 'enemy', amount: 9999, killed: true, col: e.col, row: e.row })
  }

  /** Legacy single-call enemy action (move, else attack) — kept for the headless sims that drive
   *  one enemy at a time. The live turn uses _enemyMove (step 1) and _enemyAttack (step 4). */
  _enemyAct(e, bounds) {
    if (e.damaged || e.breached) return
    e._acts = this._enemyActsThisTurn(e)
    e._skip = e.skipTurns > 0 && e.key !== 'azazoth' // stunned (Azazoth is immune to freeze)
    if (e._skip) { e.skipTurns -= 1; return }
    if (!this._enemyMove(e, bounds)) this._enemyAttack(e, bounds)
  }

  /** Step 1: the enemy moves — marches down toward the player, sidesteps water/danger, or breaches
   *  off the bottom — up to its per-turn act count, stopping the moment it's engaged with a blocker
   *  (which it then attacks in step 4). Returns true if it changed position or breached. */
  _enemyMove(e, bounds) {
    if (e.damaged || e.breached) return false
    // Stun (Discombobulator/Cryo) is consumed once per turn — in upkeep normally; here as a
    // fallback when this method is driven without upkeep having stamped the flag.
    if (e._skip == null && e.skipTurns > 0 && e.key !== 'azazoth') { e.skipTurns -= 1; return false }
    if (e._skip) return false
    const acts = e._acts != null ? e._acts : this._enemyActsThisTurn(e)
    if (acts <= 0) return false // Juggernaut/Azazoth off-turn
    if (this._isMultiTileEnemy(e)) return this._bossMove(e, bounds)
    let moved = false
    for (let n = 0; n < acts; n++) {
      const step = this._enemyMoveOnce(e, bounds)
      if (step === 'breached') return true
      if (step === 'stepped') { moved = true; continue } // fast enemies keep marching
      if (step === 'lateral') { moved = true; break }    // one sidestep per turn
      break // 'blocked' — engaged with a blocker or held behind another enemy
    }
    return moved
  }

  /** One movement attempt: breach / reroute around water / Jäger sidestep / march down one tile.
   *  Returns 'breached' | 'stepped' | 'lateral' | 'blocked'. Never attacks. */
  _enemyMoveOnce(e, bounds) {
    const belowRow = e.row - 1
    // Off the bottom → breach: subtract atk from legitimacy, then remove.
    if (belowRow < bounds.minRow) {
      const fw = this._hasPolicy('firewall') ? 0.75 : 1 // Firewall: −25% enemy attack values
      const lost = this._damageLegitimacy(Math.round(this._enemyBreachAtk(e) * fw)) // Democracy doubles the loss
      e.breached = true
      this._pushEvent({ kind: 'legit', amount: lost, col: e.col, row: e.row })
      return 'breached'
    }
    const below = this.data.tableau.tileAt(belowRow, e.col)
    // Terrain gate: a LAND enemy can't march onto water — route laterally toward a land column.
    if (below && !ENEMY_DEFS[e.key]?.boss && !this._enemyCanTraverse(e, below.terrain)) {
      const col0 = e.col
      this._enemyReroute(e, bounds)
      return e.col !== col0 ? 'lateral' : 'blocked'
    }
    // Engaged with a blocker (adjacent, wall-shielded, or a ranged-chipper's target) → don't move.
    if (this._enemyBlocker(e, bounds)) return 'blocked'
    // Jäger: with a clear path, sidestep toward the column least covered by player ranged units.
    if (e.key === 'jager' && this._jagerMove(e, bounds)) return 'lateral'
    // Blocked by another live enemy queued directly ahead → hold this turn.
    if (this.data.enemies.some((o) => o !== e && !o.damaged && !o.breached && this._enemyCovers(o, belowRow, e.col))) return 'blocked'
    // Clear path → march down one tile.
    e.row = belowRow
    this._pushEvent({ kind: 'march', col: e.col, row: e.row })
    if (ENEMY_DEFS[e.key]?.special === 'spawn_on_move') this._spawnEnemyAdjacent(e, 'raider') // Quartermaster
    const landed = this.data.tableau.tileAt(belowRow, e.col)
    if (landed?.terrain === 'fallout' && !e.damaged) this._dealDamageToEnemy(e, 100) // Manhattan Project fallout
    this._triggerWalkoverTrap(landed, e) // Caltrops (every cross) / Sea Mine (first entry, consumed)
    return 'stepped'
  }

  /** What this enemy would strike down its column: the front blocker (a wall shields the unit
   *  behind it — chipped first), or a ranged-chipper's target at range. Returns { blocker, tile }
   *  or null when the enemy would instead march / reroute / breach. */
  _enemyBlocker(e, bounds) {
    const belowRow = e.row - 1
    if (belowRow < bounds.minRow) return null // would breach, not attack
    const below = this.data.tableau.tileAt(belowRow, e.col)
    if (below && !ENEMY_DEFS[e.key]?.boss && !this._enemyCanTraverse(e, below.terrain)) return null // reroutes
    // Ranged chippers (Ranger/Deadeye/Mongol) strike the nearest blocker down-column from afar —
    // only when it's NOT adjacent; an adjacent one falls through to the melee blocker below.
    const chipRange = this._enemyChipRange(e)
    if (chipRange > 1) {
      for (let d = 1; d <= chipRange; d++) {
        const r = e.row - d
        if (r < bounds.minRow) break
        const t = this.data.tableau.tileAt(r, e.col)
        const bl = (t?.unit && !t.unit.damaged) ? t.unit
          : (t?.building && !t.building.damaged && !['cross', 'first'].includes(defOf(t.building.key)?.trapTrigger)) ? t.building : null
        if (!bl) continue
        if (d > 1) return { blocker: bl, tile: t }
        break // adjacent → fall through to the melee blocker below
      }
    }
    // A walkover trap (Caltrops/Sea Mine) never blocks. A WALL shields the unit sharing its tile:
    // chipped first, and only once it falls does the unit behind become the blocker.
    const belowB = below?.building
    const walkover = belowB && ['cross', 'first'].includes(defOf(belowB.key)?.trapTrigger)
    const wall = belowB && !belowB.damaged && !walkover && this._isWall(belowB) ? belowB : null
    const blocker = wall
      ? wall
      : (below?.unit && !below.unit.damaged) ? below.unit
        : (belowB && !belowB.damaged && !walkover) ? belowB : null
    return blocker ? { blocker, tile: below } : null
  }

  /** Step 4: an engaged enemy chips its front blocker (Obliterator/Sapper/Beamer/Kamikaze specials
   *  applied). Enemies that MOVED this turn don't also attack. Returns true if it struck. */
  _enemyAttack(e, bounds) {
    if (e.damaged || e.breached || e._skip) return false
    if ((e._acts != null ? e._acts : this._enemyActsThisTurn(e)) <= 0) return false
    if (this._isMultiTileEnemy(e)) return this._bossAttack(e, bounds)
    const hit = this._enemyBlocker(e, bounds)
    if (!hit) return false
    const { blocker, tile } = hit
    // Impassable buildings (Moon Base / Singularity): normal enemies can't chip them and simply
    // hold; only Azazoth forces through (and takes the Singularity's huge hit via _onTrapDestroyed).
    const bdef = blocker.kind === 'building' ? defOf(blocker.key) : null
    if ((bdef?.trapTrigger === 'impassable' || bdef?.special === 'trap_impassable') && e.key !== 'azazoth') return false
    this._pushEvent({ kind: 'attack', side: 'enemy', col: e.col, row: e.row })
    e.lastAttackSeq = this.data.combatSeq // drives the enemy attack "thrust" (accelerate down, slide back)
    e.lastAttackDir = this._attackDir(e.row, e.col, tile.row, tile.col)
    // Kamikaze detonates on its attack instead of chipping.
    if (ENEMY_DEFS[e.key]?.special === 'self_destruct') { this._enemyExplode(e, tile, 2); return true }
    this._enemyChip(e, blocker, tile) // handles Obliterator/Sapper/Beamer specials
    if (ENEMY_DEFS[e.key]?.special === 'destroy_buildings') this._sapperAdjacent(e, tile) // Sapper hits all adjacent too
    if (blocker.damaged) this._onTrapDestroyed(blocker, tile, e) // Powder Magazine AoE / Singularity→Azazoth
    return true
  }

  /** A multi-tile boss marches its whole footprint down one row (or breaches off the bottom).
   *  Azazoth irradiates every row it vacates (Fallout). Holds without moving if any blocker or
   *  enemy sits below its bottom edge (it will chip in step 4). Returns true if it moved/breached. */
  _bossMove(e, bounds) {
    const [w, h] = e.footprint
    const belowRow = e.row - 1
    if (belowRow < bounds.minRow) {
      const fw = this._hasPolicy('firewall') ? 0.75 : 1
      const lost = this._damageLegitimacy(Math.round(this._enemyBreachAtk(e) * fw))
      e.breached = true
      this._pushEvent({ kind: 'legit', amount: lost, col: e.col, row: e.row })
      return true
    }
    for (let c = e.col; c < e.col + w; c++) { // any blocker below the bottom edge → don't move (attack instead)
      const t = this.data.tableau.tileAt(belowRow, c)
      if (t && ((t.unit && !t.unit.damaged) || (t.building && !t.building.damaged))) return false
    }
    for (let c = e.col; c < e.col + w; c++) { // another live enemy below → hold
      if (this.data.enemies.some((o) => o !== e && !o.damaged && !o.breached && this._enemyCovers(o, belowRow, c))) return false
    }
    e.row = belowRow
    this._pushEvent({ kind: 'march', col: e.col, row: e.row })
    if (e.key === 'azazoth') {
      const vacated = e.row + h // the row no longer covered after moving down
      if (vacated >= bounds.minRow && vacated <= bounds.maxRow) {
        for (let c = e.col; c < e.col + w; c++) { const t = this.data.tableau.tileAt(vacated, c); if (t) t.terrain = 'fallout' }
      }
    }
    return true
  }

  /** A blocked boss chips every blocker directly below its bottom edge (Titan ×4, Azazoth outright). */
  _bossAttack(e, bounds) {
    const [w] = e.footprint
    const belowRow = e.row - 1
    if (belowRow < bounds.minRow) return false
    let blocked = false
    for (let c = e.col; c < e.col + w; c++) {
      const t = this.data.tableau.tileAt(belowRow, c)
      if (!t) continue
      const bl = (t.unit && !t.unit.damaged) ? t.unit : (t.building && !t.building.damaged) ? t.building : null
      if (!bl) continue
      blocked = true
      this._pushEvent({ kind: 'attack', side: 'enemy', col: c, row: e.row })
      e.lastAttackSeq = this.data.combatSeq
      e.lastAttackDir = this._attackDir(e.row, e.col, belowRow, c)
      this._enemyChip(e, bl, t) // Titan chips (×4), Azazoth destroys outright
      if (bl.damaged) this._onTrapDestroyed(bl, t, e)
    }
    return blocked
  }

  /** A "wall-style" building (Mud Brick / Stone Wall / Castle / Shield Matrix / Great Wall):
   *  it shields a unit sharing its tile — enemies chip the wall before the unit behind it. */
  _isWall(occ) {
    const s = defOf(occ.key)?.special
    return s === 'wall' || s === 'multi_lane_wall'
  }

  /** Whether an enemy can move onto a given terrain. Only WATER (coast/sea) is gated — land and
   *  space stay passable (space routing is a separate concern). Naval, aerial, astral, and
   *  aquatic/unimpeded enemies can traverse water; ordinary land enemies cannot. */
  _enemyCanTraverse(e, terrainKey) {
    if (!canPlaceOn('water', terrainKey)) return true // not water → passable to everyone
    const def = ENEMY_DEFS[e.key]
    const types = e.types ?? def?.types ?? []
    return types.includes('naval') || types.includes('aerial') || types.includes('astral') ||
      def?.special === 'aquatic_path' || def?.special === 'not_impeded' || !!def?.waterMove
  }

  /** A land enemy blocked by water below steps ONE column toward the nearest column it can
   *  descend (a clear land path from its descent row to the bottom). Never steps onto water or
   *  an occupied tile; holds if no route exists (a stuck battle ends as a win via MAX_TURNS). */
  _enemyReroute(e, bounds) {
    const t = this.data.tableau
    const belowRow = e.row - 1
    // A column is "descendable" if the enemy can walk it straight from its descent row to the floor.
    const descendable = (c) => {
      for (let r = bounds.minRow; r <= belowRow; r++) {
        const tile = t.tileAt(r, c)
        if (!tile || !this._enemyCanTraverse(e, tile.terrain)) return false
      }
      return true
    }
    let target = null, best = Infinity
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      if (c === e.col || !descendable(c)) continue
      const d = Math.abs(c - e.col)
      if (d < best) { best = d; target = c }
    }
    if (target == null) return // no reachable land path — hold (never step onto water)
    const nc = e.col + Math.sign(target - e.col)
    if (nc < bounds.minCol || nc > bounds.maxCol) return
    const inSpawn = e.row > bounds.maxRow // above the visible grid → no terrain, free lateral shift
    if (!inSpawn) {
      const lateral = t.tileAt(e.row, nc)
      if (!lateral || !this._enemyCanTraverse(e, lateral.terrain)) return // can't sidestep onto water either
      if ((lateral.unit && !lateral.unit.damaged) || (lateral.building && !lateral.building.damaged)) return // blocked
    }
    if (this.data.enemies.some((o) => o !== e && !o.damaged && !o.breached && o.row === e.row && o.col === nc)) return
    e.col = nc
    this._pushEvent({ kind: 'march', col: e.col, row: e.row })
  }

  /** Damage a trap deals, scaled by its upgrade level (+25%/level) and DOUBLED by
   *  Guerilla Warfare (special 'trap_damage_plus'). */
  _trapDamage(occ, base) {
    let dmg = base * (1 + 0.25 * ((occ?.level ?? 1) - 1))
    if (this._activeEffectDefs().some((d) => d.special === 'trap_damage_plus')) dmg *= 2
    return Math.round(dmg)
  }

  /** Walkover traps fire when an enemy marches onto their tile: Caltrops damages every
   *  crosser; a Sea Mine damages the first enemy and is then consumed. */
  _triggerWalkoverTrap(tile, e) {
    const b = tile?.building
    if (!b || e.damaged) return
    const def = defOf(b.key)
    if (def?.trapTrigger === 'cross' && def.trapDamage) this._dealDamageToEnemy(e, this._trapDamage(b, def.trapDamage))
    else if (def?.trapTrigger === 'first' && def.trapDamage) {
      this._dealDamageToEnemy(e, this._trapDamage(b, def.trapDamage))
      tile.building = null // sea mine consumed
      this._recomputeOutputs()
    }
  }

  /** Traps that fire on destruction: a Powder Magazine explodes for AoE damage to nearby
   *  enemies; a Singularity, when the enemy that broke it is Azazoth, deals its huge hit. */
  _onTrapDestroyed(blocker, tile, killer) {
    const def = defOf(blocker.key)
    if (!def) return
    if (def.trapTrigger === 'death' && def.trapDamage) {
      const range = def.range ?? 2
      const dmg = this._trapDamage(blocker, def.trapDamage)
      for (const e of this.data.enemies) {
        if (e.damaged || e.breached) continue
        if (Math.abs(e.row - tile.row) + Math.abs(e.col - tile.col) <= range) this._dealDamageToEnemy(e, dmg)
      }
    } else if (def.trapTrigger === 'impassable' && def.trapDamage && killer?.key === 'azazoth') {
      this._dealDamageToEnemy(killer, this._trapDamage(blocker, def.trapDamage))
    }
  }

  /** Timed traps (Discombobulator): every trapCooldown turns, stun enemies in range so they
   *  skip their next turn. */
  _applyTrapTriggers() {
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.building // traps live in the building slot; read it directly (not the occupant shim)
      if (!occ || occ.damaged) continue
      const def = defOf(occ.key)
      if (def?.trapTrigger !== 'skip') continue
      occ.trapCd = (occ.trapCd ?? 0) - 1
      if (occ.trapCd > 0) continue
      occ.trapCd = def.trapCooldown ?? 5
      const range = def.range ?? 1
      for (const e of this.data.enemies) {
        if (e.damaged || e.breached) continue
        if (Math.abs(e.row - tile.row) + Math.abs(e.col - tile.col) <= range) e.skipTurns = (e.skipTurns ?? 0) + 1
      }
    }
  }

  /** Campfire (per-turn heal), Public Baths (timed heal), Embassy (timed free mercenary). */
  _applySupportBuildings() {
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.building
      if (!occ || occ.damaged) continue
      const def = defOf(occ.key)
      if (typeof def.heal === 'function') this._healAround(tile, def.heal(occ.level) / 100) // Campfire: every turn
      if (def.bathsEvery) { // Public Baths: timed heal
        occ.bathsCd = (occ.bathsCd ?? def.bathsEvery) - 1
        if (occ.bathsCd <= 0) { occ.bathsCd = def.bathsEvery; this._healAround(tile, (def.bathsHealPct ?? 50) / 100) }
      }
      if (def.mercEvery) { // Embassy: timed free mercenary
        occ.mercCd = (occ.mercCd ?? def.mercEvery) - 1
        if (occ.mercCd <= 0) { occ.mercCd = def.mercEvery; this._spawnEmbassyMerc(tile) }
      }
    }
  }

  /** Heal every road-adjacent friendly (unit or building) below max by `pct` of its max HP. */
  _healAround(tile, pct) {
    if (pct <= 0) return
    for (const nb of this._adjacentTiles(tile.row, tile.col)) {
      for (const occ of [nb.unit, nb.building]) {
        if (!occ || occ.damaged || occ.hp >= occ.maxHp) continue
        const amt = Math.max(1, Math.round(occ.maxHp * pct))
        occ.hp = Math.min(occ.maxHp, occ.hp + amt)
        this._pushEvent({ kind: 'heal', amount: amt, col: nb.col, row: nb.row })
      }
    }
  }

  /** Embassy: spawn a random unlocked roster unit as a mercenary on an adjacent empty valid tile. */
  _spawnEmbassyMerc(tile) {
    const units = this.data.civilization.units.filter(Boolean)
    if (!units.length) return
    const pick = units[Math.floor(Math.random() * units.length)]
    const udef = UNIT_DEFS[pick.key]
    const spot = this._adjacentTiles(tile.row, tile.col).find((nb) => !nb.occupant && canPlaceOn(udef.placement, nb.terrain))
    if (!spot) return
    const hp = unitStats(udef, pick.level, this.data.civilization.modifiers.unitHpBonus).def
    spot.occupant = { kind: 'unit', key: pick.key, level: pick.level, hp, maxHp: hp, damaged: false, mercenary: true }
    this._syncUnitStats(true)
  }

  /** Best (highest-era) unlocked roster unit whose types include `role`, or null. */
  _bestRosterUnit(role) {
    let best = null, bestEra = -1
    for (const slot of this.data.civilization.units) {
      if (!slot) continue
      const def = UNIT_DEFS[slot.key]
      if (def && def.types.includes(role) && def.era > bestEra) { best = slot.key; bestEra = def.era }
    }
    return best
  }

  /** Spawner buildings: every `spawnEvery` (default 8) turns, create the player's best unit of
   *  the building's spawnRole on an adjacent empty valid tile, at the spawner's level. Spawns are
   *  temporary (flagged mercenary → disband at battle end). */
  _applySpawners() {
    let spawned = false
    for (const tile of this.data.tableau.tiles.values()) {
      const occ = tile.building
      if (!occ || occ.damaged) continue
      const def = defOf(occ.key)
      if (def?.special !== 'spawner') continue
      const every = def.spawnEvery ?? 8
      occ.spawnCd = (occ.spawnCd ?? every) - 1
      if (occ.spawnCd > 0) continue
      occ.spawnCd = every
      const key = this._bestRosterUnit(def.spawnRole)
      if (!key) continue
      const udef = UNIT_DEFS[key]
      const spot = this._adjacentTiles(tile.row, tile.col).find((nb) => !nb.occupant && canPlaceOn(udef.placement, nb.terrain))
      if (!spot) continue
      const hp = unitStats(udef, occ.level, this.data.civilization.modifiers.unitHpBonus).def
      spot.occupant = { kind: 'unit', key, level: occ.level, hp, maxHp: hp, damaged: false, mercenary: true }
      spawned = true
    }
    if (spawned) this._syncUnitStats(true)
  }

  /** Manhattan Project wonder: at combat start, nuke a random live enemy for 2000 and lay
   *  a permanent Fallout tile (which chips enemies that march onto it) on a random land tile. */
  _applyManhattanProject() {
    if (!this._hasWonder('manhattan_project')) return
    const live = this.data.enemies.filter((e) => !e.damaged && !e.breached)
    if (live.length) {
      const t = live[Math.floor(Math.random() * live.length)]
      t.hp -= 2000
      if (t.hp <= 0) { t.hp = 0; t.damaged = true }
    }
    const tiles = this.data.tableau.visibleTiles(this.data.era).filter((t) => t.def?.place === 'land' && t.terrain !== 'fallout')
    if (tiles.length) {
      tiles[Math.floor(Math.random() * tiles.length)].terrain = 'fallout'
      this._netsCache = null // terrain changed → drop the bridge/adjacency memo (moon_earth uses terrain)
    }
  }

  _chipBlocker(blocker, amount, tile) {
    blocker.hp -= amount
    const killed = blocker.hp <= 0
    if (killed) { blocker.hp = 0; blocker.damaged = true; if (blocker.kind === 'unit') this._onUnitDeath(blocker, tile) }
    this._pushEvent({ kind: 'damage', side: 'player', amount, killed, col: tile.col, row: tile.row })
  }

  /** Unit-death triggers (Burial Rites → :progress:, Nationalism → :gold:, Cosmic Myth →
   *  +1 :legitimacy:). Amount = the policy's flat value, else the unit's effective :attack:.
   *  Banked progress/gold carries into next dev; combat progress choices don't open mid-battle. */
  _onUnitDeath(occ, tile) {
    const civ = this.data.civilization
    const atk = this._effectiveAtk(occ)
    if (this._hasWonder('taj_mahal')) civ.tajBank += atk // Taj Mahal: bank each dead unit's attack
    for (const def of this._activeEffectDefs()) {
      if (!def.unitDeath) continue
      const amount = def.unitDeath.flat ?? atk
      if (amount <= 0) continue
      const res = def.unitDeath.res
      if (res === 'progress') { civ.progress.value += amount; this._pushEvent({ kind: 'progress', amount, col: tile.col, row: tile.row }) }
      else if (res === 'gold') { civ.gold.value += amount; this._pushEvent({ kind: 'gold', amount, col: tile.col, row: tile.row }) }
      else if (res === 'legitimacy') { civ.legitimacy.value += amount }
    }
  }

  // Player units carry a synced effective atk (occ.atk); buildings use their def's
  // attack(level) if they're towers; enemies fall back to base stats.
  _effectiveAtk(occ) {
    if (occ.atk != null) return occ.atk
    if (occ.kind === 'building') return defOf(occ.key)?.attack?.(occ.level) ?? 0
    return unitStats(UNIT_DEFS[occ.key], occ.level, 0, occ.warband ?? 0).atk
  }

  _effectiveCooldown(unit) {
    const def = UNIT_DEFS[unit.key] ?? defOf(unit.key)
    return Math.max(MIN_COOLDOWN, (def?.cooldown ?? MIN_COOLDOWN) - (unit.cdReduce ?? 0))
  }

  _pushEvent(ev) { this.data.combatEvents.push({ ...ev, seq: this.data.combatSeq }) }

  /** Remove one-battle mercenaries from the board (called at battle end / on defeat). */
  _disbandMercenaries() {
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      if (tile.unit?.mercenary) tile.unit = null
    }
  }

  // ---------------------------------------------------------------------------
  // Battle end
  // ---------------------------------------------------------------------------
  _endCombat() {
    this._disbandMercenaries()
    this._restoreUnitHomes() // pursuit units slide back to where the player placed them
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      for (const occ of [tile.unit, tile.building]) {
        if (occ && !occ.damaged) { occ.hp = occ.maxHp; delete occ.cdTimer } // survivors heal to full
      }
    }
    // End-of-era effects now run AFTER the era transition (see completeTransition) so they
    // resolve in the NEXT era's context — a buff to era-scaled effects and Pier/Library output.
    this._syncUnitStats(false) // combat over: drop terrain bonus
    this.data.enemies = [] // undefeated enemies fade away
    this.data.combatTurn = 0
    this.data.combatAccum = 0
    this.data.combatTime = 0
    this.data.combatEvents = []
    this.data.combatStepLabel = ''
    this.data.combatIntro = false
    this.data.phase = 'transition'
    this._restartTimer()
    this._emit()
  }

  /** Return every unit that repositioned (pursuit) during the battle to its home tile — the tile
   *  the player placed it on (recorded in _startCombat). Homes are unique, so lift all movers then
   *  drop each at its home; the coexisting building slot is never touched. */
  _restoreUnitHomes() {
    const movers = []
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const u = tile.unit
      if (u && u.homeRow != null) { movers.push(u); tile.unit = null }
    }
    for (const u of movers) {
      const t = this.data.tableau.tileAt(u.homeRow, u.homeCol)
      if (t) t.unit = u
      delete u.homeRow; delete u.homeCol
    }
    this._recomputeOutputs() // positions settled → refresh Brewery/Tribalism-driven outputs
  }

  /** The "end of era" (= end of combat) effects that Festivals can trigger an extra
   *  time: Ranch growth, Totem/Shaman/Sacred-Grounds legitimacy, Oral Tradition,
   *  Hereditary Rule, and deployed buildings' end-of-era output (Pier food). */
  _applyEraEndEffects() {
    const civ = this.data.civilization
    // Ranch: grow its per-tick food bonus (+2/3/4/…) if it survived; reset if destroyed.
    for (const { occ } of this._buildingInstances()) {
      if (occ.key !== 'ranch') continue
      if (occ.damaged) { occ.ranchBonus = 0; occ.ranchStep = 2 }
      else {
        occ.ranchBonus = (occ.ranchBonus ?? 0) + (occ.ranchStep ?? 2)
        occ.ranchStep = (occ.ranchStep ?? 2) + 1
      }
    }
    // Campfire: at the end of each era, permanently grant +1 :attack: to adjacent units.
    for (const { tile, occ } of this._buildingInstances()) {
      if (occ.key !== 'campfire' || occ.damaged) continue
      for (const nb of this._adjacentTiles(tile.row, tile.col)) {
        if (nb.unit && !nb.unit.damaged) nb.unit.permAtk = (nb.unit.permAtk ?? 0) + 1
      }
    }
    // Legitimacy: Colosseums, Shamans, and Sacred Grounds' empty land.
    let legit = 0
    let deployedUnits = 0
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      if (tile.unit && !tile.unit.damaged) deployedUnits++ // destroyed units don't count for Colosseum legit
    }
    for (const { occ } of this._buildingInstances()) {
      if (occ.damaged) continue
      if (occ.key === 'colosseum') legit += 5 * deployedUnits
    }
    legit += (POP_TYPES.shaman?.combatLegit ?? 10) * (civ.pops.shaman ?? 0)
    // v2 Priest — legitPerEra, +1 more each with Evangelism.
    const priestLegit = (POP_TYPES.priest?.legitPerEra ?? 1) + (this._activeEffectDefs().some((d) => d.special === 'evangelism') ? 1 : 0)
    legit += priestLegit * (civ.pops.priest ?? 0)
    if (this._hasWonder('stonehenge')) legit += 25 * this._wonderYieldMult() // Stonehenge: +25 legit/era (×wonder-yield)
    if (this._hasPolicy('sacred_grounds')) {
      for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
        if (!tile.unit && !tile.building && tile.def?.place === 'land') legit += 1
      }
    }
    if (legit > 0) civ.legitimacy.value += legit
    // v2 policy/bonus end-of-era effects (snapshot gold/legit so they don't compound).
    const goldNow = Math.floor(civ.gold.value)
    const legitNow = Math.floor(civ.legitimacy.value)
    for (const def of this._activeEffectDefs()) {
      if (def.legitPerEra) civ.legitimacy.value += def.legitPerEra // Theocracy/Propaganda/Deepfaked Reality
      if (def.goldInterest) civ.gold.value += Math.floor(goldNow * def.goldInterest) // Usury/QE/Perfect Trade
      if (def.endEraGoldFromLegit) civ.gold.value += Math.floor(legitNow * def.endEraGoldFromLegit) // Schism
    }
    // v2 legitimacy buildings' end-of-era gold (Temple = 3× legitimacy).
    for (const { occ } of this._buildingInstances()) {
      if (occ.damaged) continue
      const g = defOf(occ.key)?.endEraGoldFromLegit
      if (g) civ.gold.value += Math.floor(legitNow * g)
    }
    // Eugenics: permanently +2 :attack: to all units each era (folded into _syncUnitStats).
    if (this._hasPolicy('eugenics')) civ.modifiers.unitAtkFlat = (civ.modifiers.unitAtkFlat ?? 0) + 2
    // Poetry / Prediction Markets: :progress: / :gold: equal to the total :attack: of surviving units.
    if (this._hasPolicy('poetry') || this._hasPolicy('prediction_markets')) {
      let survAtk = 0
      for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
        if (tile.unit && !tile.unit.damaged) survAtk += this._effectiveAtk(tile.unit)
      }
      if (this._hasPolicy('poetry')) civ.progress.value += survAtk
      if (this._hasPolicy('prediction_markets')) civ.gold.value += survAtk
    }
    // Oral Tradition: bank :gold: + :progress: equal to post-combat :legitimacy:.
    if (this._hasPolicy('oral_tradition')) {
      const L = Math.floor(civ.legitimacy.value)
      civ.gold.value += L
      civ.progress.value += L
    }
    // Hereditary Rule: permanently toughen every unit & building (+1 :defense: / era).
    if (this._hasPolicy('hereditary_rule')) {
      civ.modifiers.unitHpBonus += 1
      civ.modifiers.buildingHpBonus += 1
    }
    // Deployed buildings' end-of-era output (e.g. Pier food, Library progress).
    this._accrueBuildingOutputs()
    // Forging / Armory: upgrade a random adjacent (road-augmented) unit +1 level for free.
    for (const { tile, occ } of this._buildingInstances()) {
      const upgrader = occ.key === 'forging' || defOf(occ.key)?.special === 'command_free_upgrade'
      if (!upgrader || occ.damaged) continue
      const adj = this._adjacentTiles(tile.row, tile.col).filter((t) => t.unit && !t.unit.damaged)
      if (adj.length === 0) continue
      adj[Math.floor(Math.random() * adj.length)].unit.level += 1
    }
    // Support end-of-era: Carbon Sink grows the permanent natural yield; Tleilaxu Tanks add pops.
    for (const { occ } of this._buildingInstances()) {
      if (occ.damaged) continue
      const d = defOf(occ.key)
      if (d?.special === 'growth') civ.naturalGrowth += occ.level
      if (d?.output?.res === 'population' && d.output.when === 'eraEnd') this.addPops(d.output.amount)
    }
    // Taj Mahal: grant :progress: equal to the (never-clearing) banked dead-unit attack total.
    if (this._hasWonder('taj_mahal') && civ.tajBank > 0) civ.progress.value += civ.tajBank
    // Surveying: lay a Road on a random valid tile.
    if (this._hasPolicy('surveying')) this._layRandomRoad()
  }

  _defeat() {
    this._disbandMercenaries()
    this._restoreUnitHomes() // put pursuit units back where the player placed them
    this.data.defeated = true
    this.data.combatTime = 0
    this.data.combatStepLabel = ''
    this._restartTimer()
    this._emit()
  }
}

/** Copy CombatMixin's (non-enumerable) methods onto a target class's prototype. */
export function installCombat(TargetClass) {
  for (const name of Object.getOwnPropertyNames(CombatMixin.prototype)) {
    if (name === 'constructor') continue
    Object.defineProperty(TargetClass.prototype, name, Object.getOwnPropertyDescriptor(CombatMixin.prototype, name))
  }
}
