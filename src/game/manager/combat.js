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
import { BUILDING_DEFS } from '../data/buildings.js'
import { POP_TYPES } from '../data/pops.js'
import { generateHost } from '../data/enemies.js'

// Turns-per-second per speed setting (0 = paused). The battle timer fires every
// COMBAT_INTERVAL_MS of real time and advances the turn accumulator by tps·interval;
// one discrete turn runs each time it crosses 1.
export const SPEED_TPS = { paused: 0, standard: 1, fast: 3, super: 5, ultra: 10 }
export const COMBAT_INTERVAL_MS = 50
export const COMBAT_DURATION = 25 // legacy export (kept for HUD compat)
const MIN_COOLDOWN = 1
const MAX_TURNS = 500 // stalemate safety cap (a held line that can't kill ends as a win)

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
    const host = generateHost(era, bounds, t.enemyRowCount(era), t.columnPlaces(era), Math.random, mult)
    this.data.enemies = host.units
    this.data.enemyHostType = host.type
  }

  _startCombat() {
    this._syncUnitStats(true) // snapshot combat stats for this battle
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      for (const occ of [tile.unit, tile.building]) {
        if (!occ || occ.damaged) continue
        occ.hp = occ.maxHp // damage doesn't persist between combats
        occ.cdTimer = 0    // ready to attack (Siege recharge starts fresh)
        delete occ.trapCd  // trap timers (Discombobulator) start fresh each battle
        delete occ.lastAttackSeq
      }
    }
    for (const e of this.data.enemies) {
      e.hp = e.maxHp
      e.damaged = false
      e.breached = false
    }
    this._applyManhattanProject() // nuke a random enemy + lay a fallout tile
    this.data.combatTurn = 0
    this.data.combatAccum = 0
    this.data.combatTime = 0
    this.data.combatEvents = []
    this.data.combatSeq = 0
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
  // Turn loop
  // ---------------------------------------------------------------------------
  _combatStep() {
    if (this.data.phase !== 'battle' || this.data.combatIntro) return
    const tps = SPEED_TPS[this.data.speed] || 0
    if (tps <= 0) return
    this.data.combatAccum += tps * (COMBAT_INTERVAL_MS / 1000)
    if (this.data.combatAccum < 1) return
    this.data.combatAccum -= 1
    this._runTurn()
  }

  /** Execute one discrete combat turn: player towers fire, then enemies act. */
  _runTurn() {
    this.data.combatSeq++
    this.data.combatEvents = []
    this.data.combatTurn++
    const bounds = this.data.tableau.visibleBounds(this.data.era)
    if (!bounds) { this._endCombat(); return }

    this._applyPoison() // Nanite Warfare: 5% max-HP poison to all enemies each turn
    this._playerPhase()
    this._applyTrapTriggers() // Discombobulator: stun nearby enemies before they act
    this._enemyPhase(bounds)

    const civ = this.data.civilization
    if (civ.legitimacy.value <= 0) { civ.legitimacy.value = 0; this._defeat(); return }
    const remaining = this.data.enemies.some((e) => !e.damaged && !e.breached)
    if (!remaining || this.data.combatTurn > MAX_TURNS) { this._endCombat(); return }
    this._emit()
  }

  /** All player pieces act: each fires at the lowest-HP enemy in range. Processed
   *  bottom-to-top, left-to-right. Units always fire; buildings only if they're towers. */
  _playerPhase() {
    const pieces = []
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      if (tile.unit && !tile.unit.damaged) pieces.push({ occ: tile.unit, row: tile.row, col: tile.col })
      if (tile.building && !tile.building.damaged) pieces.push({ occ: tile.building, row: tile.row, col: tile.col })
    }
    pieces.sort((a, b) => a.row - b.row || a.col - b.col)
    for (const p of pieces) {
      this._pieceAttack(p)
      // Chronobooster aura: units in range act a second time this turn (cooldown bypassed).
      if (p.occ.kind === 'unit' && p.occ.cmdActTwice && !p.occ.damaged) { p.occ.cdTimer = 0; this._pieceAttack(p) }
    }
  }

  /** One tower's attack: strike the lowest-HP enemy within its range. Units with a
   *  cooldown (Siege = 2) must recharge for that many turns after firing. */
  _pieceAttack(p) {
    const occ = p.occ
    const range = this._pieceRange(occ)
    if (range <= 0) return
    if (occ.cdTimer > 0) { occ.cdTimer -= 1; return } // recharging after a shot
    const target = this._lowestHpEnemyInRange(p.row, p.col, range)
    if (!target) return
    let atk = this._effectiveAtk(occ)
    // Adaptive Strategy: units gain +5% attack per elapsed combat turn (resets each battle;
    // turn 1 = base). Applies to units only, not towers.
    if (occ.kind === 'unit' && this._activeEffectDefs().some((d) => d.special === 'combat_atk_ramp')) {
      atk = Math.round(atk * (1 + 0.05 * Math.max(0, this.data.combatTurn - 1)))
    }
    this._pushEvent({ kind: 'attack', side: 'player', col: p.col, row: p.row })
    occ.lastAttackSeq = this.data.combatSeq // drives the attack "thrust" animation
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
    const cd = UNIT_DEFS[occ.key]?.cooldown ?? BUILDING_DEFS[occ.key]?.cooldown ?? 0
    if (cd > 0) occ.cdTimer = cd
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
    return BUILDING_DEFS[occ.key]?.range ?? 0
  }

  /** Lowest-HP live enemy within Manhattan-diamond `range` of (row,col). Ties break
   *  toward the enemy closest to breaching (lowest row), then lowest column. */
  _lowestHpEnemyInRange(row, col, range) {
    let best = null
    for (const e of this.data.enemies) {
      if (e.damaged || e.breached) continue
      if (Math.abs(e.row - row) + Math.abs(e.col - col) > range) continue
      if (!best || e.hp < best.hp ||
        (e.hp === best.hp && (e.row < best.row || (e.row === best.row && e.col < best.col)))) best = e
    }
    return best
  }

  /** Nanite Warfare: each turn, poison every live enemy for 5% of its max HP. */
  _applyPoison() {
    if (!this._activeEffectDefs().some((d) => d.special === 'poison_on_start')) return
    for (const e of this.data.enemies) {
      if (e.damaged || e.breached) continue
      this._dealDamageToEnemy(e, Math.max(1, Math.round(e.maxHp * 0.05)))
    }
  }

  _dealDamageToEnemy(e, amount) {
    // Elder Awareness: +50% damage vs the Azazoth boss (applies to direct + splash hits).
    if (e.key === 'azazoth' && this._activeEffectDefs().some((d) => d.special === 'azazoth_damage')) amount = Math.round(amount * 1.5)
    e.hp -= amount
    const killed = e.hp <= 0
    if (killed) { e.hp = 0; e.damaged = true }
    this._pushEvent({ kind: 'damage', side: 'enemy', amount, killed, col: e.col, row: e.row })
  }

  /** All enemies act, front-most (lowest row) first so a column flows downward. */
  _enemyPhase(bounds) {
    const list = this.data.enemies.filter((e) => !e.damaged && !e.breached)
    list.sort((a, b) => a.row - b.row || a.col - b.col)
    for (const e of list) this._enemyAct(e, bounds)
  }

  /** One enemy acts: breach off the bottom, chip a blocker below, or march down. */
  _enemyAct(e, bounds) {
    if (e.damaged || e.breached) return
    if (e.skipTurns > 0) { e.skipTurns -= 1; return } // stunned by a Discombobulator this turn
    const belowRow = e.row - 1
    // Off the bottom → breach: subtract atk from legitimacy, then remove.
    if (belowRow < bounds.minRow) {
      const fw = this._hasPolicy('firewall') ? 0.75 : 1 // Firewall: −25% enemy attack values
      const lost = this._damageLegitimacy(Math.round(e.atk * fw)) // Democracy doubles the loss
      e.breached = true
      this._pushEvent({ kind: 'legit', amount: lost, col: e.col, row: e.row })
      return
    }
    const below = this.data.tableau.tileAt(belowRow, e.col)
    // A walkover trap (Caltrops/Sea Mine) never blocks — enemies march over it and trigger it.
    const belowB = below?.building
    const walkover = belowB && ['cross', 'first'].includes(BUILDING_DEFS[belowB.key]?.trapTrigger)
    // Impeded by a blocker in the path — chip the unit first, then the building.
    const blocker = (below?.unit && !below.unit.damaged) ? below.unit
      : (belowB && !belowB.damaged && !walkover) ? belowB : null
    if (blocker) {
      const chip = e.chip ?? 1 // per-enemy blocker chip (Barbarian 2, …); baked at generation
      this._pushEvent({ kind: 'attack', side: 'enemy', col: e.col, row: e.row })
      this._chipBlocker(blocker, chip, below)
      if (blocker.damaged) this._onTrapDestroyed(blocker, below, e) // Powder Magazine AoE / Singularity→Azazoth
      return
    }
    // Blocked by another live enemy queued directly ahead → hold this turn.
    if (this.data.enemies.some((o) => o !== e && !o.damaged && !o.breached && o.row === belowRow && o.col === e.col)) return
    // Clear path → march down one tile.
    e.row = belowRow
    this._pushEvent({ kind: 'march', col: e.col, row: e.row })
    const landed = this.data.tableau.tileAt(belowRow, e.col)
    // Manhattan Project fallout tile: 100 damage to an enemy that enters it.
    if (landed?.terrain === 'fallout' && !e.damaged) this._dealDamageToEnemy(e, 100)
    this._triggerWalkoverTrap(landed, e) // Caltrops (every cross) / Sea Mine (first entry, consumed)
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
    const def = BUILDING_DEFS[b.key]
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
    const def = BUILDING_DEFS[blocker.key]
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
      const def = BUILDING_DEFS[occ.key]
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
    if (occ.kind === 'building') return BUILDING_DEFS[occ.key]?.attack?.(occ.level) ?? 0
    return unitStats(UNIT_DEFS[occ.key], occ.level, 0, occ.warband ?? 0).atk
  }

  _effectiveCooldown(unit) {
    const def = UNIT_DEFS[unit.key] ?? BUILDING_DEFS[unit.key]
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
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      for (const occ of [tile.unit, tile.building]) {
        if (occ && !occ.damaged) { occ.hp = occ.maxHp; delete occ.cdTimer } // survivors heal to full
      }
    }
    // "End of era" (= end of combat) effects — Festivals triggers them an extra time,
    // Cosmic Celebration two more (additive with Festivals).
    let times = 1
    if (this._hasPolicy('festivals')) times += 1
    if (this._hasPolicy('cosmic_celebration')) times += 2
    for (let i = 0; i < times; i++) this._applyEraEndEffects()
    this._syncUnitStats(false) // combat over: drop terrain bonus, fold in Hereditary Rule
    this.data.enemies = [] // undefeated enemies fade away
    this.data.combatTurn = 0
    this.data.combatAccum = 0
    this.data.combatTime = 0
    this.data.combatEvents = []
    this.data.combatIntro = false
    this.data.phase = 'transition'
    this._restartTimer()
    this._emit()
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
    // Legitimacy: Totems, Colosseums, Shamans, and Sacred Grounds' empty land.
    let legit = 0
    let deployedUnits = 0
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      if (tile.unit) deployedUnits++
    }
    for (const { occ } of this._buildingInstances()) {
      if (occ.damaged) continue
      if (occ.key === 'totem') legit += BUILDING_DEFS.totem.combatLegit(occ.level)
      else if (occ.key === 'colosseum') legit += 5 * deployedUnits
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
      const g = BUILDING_DEFS[occ.key]?.endEraGoldFromLegit
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
      const upgrader = occ.key === 'forging' || BUILDING_DEFS[occ.key]?.special === 'command_free_upgrade'
      if (!upgrader || occ.damaged) continue
      const adj = this._adjacentTiles(tile.row, tile.col).filter((t) => t.unit && !t.unit.damaged)
      if (adj.length === 0) continue
      adj[Math.floor(Math.random() * adj.length)].unit.level += 1
    }
    // Surveying: lay a Road on a random valid tile.
    if (this._hasPolicy('surveying')) this._layRandomRoad()
  }

  _defeat() {
    this._disbandMercenaries()
    this.data.defeated = true
    this.data.combatTime = 0
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
