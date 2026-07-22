// Combat subsystem of GameManager, split out to keep GameManager.js manageable.
// The methods live in a mixin class (so no object-literal comma churn) and are copied
// onto GameManager.prototype by installCombat() — `this` is the GameManager instance,
// so they call the manager's other methods/state directly.
import { UNIT_DEFS, unitStats, unitRole } from '../data/units.js'
import { BUILDING_DEFS } from '../data/buildings.js'
import { POP_TYPES } from '../data/pops.js'
import { canPlaceOn } from '../data/terrain.js'
import { generateHost } from '../data/enemies.js'

// Ticks per second per speed setting (also the combat time-multiplier). 0 = paused.
export const SPEED_TPS = { paused: 0, standard: 1, fast: 3, super: 5, ultra: 10 }
// A battle lasts COMBAT_DURATION combat-seconds; the loop steps every COMBAT_INTERVAL_MS
// of real time, advancing combat time by the speed multiplier.
export const COMBAT_DURATION = 25
export const COMBAT_INTERVAL_MS = 50
const MIN_COOLDOWN = 1 // cooldowns can be reduced, but never below 1s

class CombatMixin {
  // ---------------------------------------------------------------------------
  // Combat (battle phase). Lasts COMBAT_DURATION combat-seconds. Units attack on
  // cooldown vs. the era's enemy host. Melee/cavalry only strike when they are the
  // front-most friendly in the column; ranged strike the front enemy at any range;
  // an empty column yields gold (player) / legitimacy damage (enemy). Attacks are
  // resolved bottom-to-top, left-to-right. Non-destroyed instances heal between
  // combats; destroyed ones stay `damaged` until repaired.
  // ---------------------------------------------------------------------------
  _generateEnemies() {
    const era = this.data.era
    const t = this.data.tableau
    const host = generateHost(era, t.enemyRowCount(era), t.columnPlaces(era))
    this.data.enemies = host.units.map((u) => ({ ...u, kind: 'unit', cdTimer: 0 }))
    this.data.enemyHostType = host.type
  }

  _startCombat() {
    this._syncUnitStats(true) // snapshot combat stats (Warband/Forest/Brewery) for this battle
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (!occ) continue
      // Remember each unit's starting tile (to shift back after the battle) and clear
      // last-attack so the thrust doesn't replay at combat start (combatSeq is monotonic).
      if (occ.kind === 'unit') { occ.homeRow = tile.row; occ.homeCol = tile.col; delete occ.lastAttackSeq }
      if (occ.damaged) continue
      occ.hp = occ.maxHp // damage doesn't persist between combats
      if (occ.kind === 'unit') occ.cdTimer = this._effectiveCooldown(occ)
    }
    for (const e of this.data.enemies) {
      if (e.damaged) continue
      e.hp = e.maxHp
      e.cdTimer = this._effectiveCooldown(e)
    }
    this.data.combatTime = 0
    this.data.combatEvents = []
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

  _combatStep() {
    if (this.data.phase !== 'battle' || this.data.combatIntro) return
    const mult = SPEED_TPS[this.data.speed] || 0
    if (mult <= 0) return
    const dt = (COMBAT_INTERVAL_MS / 1000) * mult
    const before = this.data.combatTime
    this.data.combatTime += dt
    this.data.combatSeq++
    this.data.combatEvents = []

    const bounds = this.data.tableau.visibleBounds(this.data.era)
    const enemyRows = this.data.tableau.enemyRowCount(this.data.era)
    // Flow idle units toward reachable enemies; re-sync so their Forest/Brewery
    // bonuses reflect the NEW tile (stats are stored per-occupant by _syncUnitStats).
    if (this._combatReposition(bounds)) this._syncUnitStats(true)
    const list = this._combatants(bounds, enemyRows)
    list.sort((a, b) => a.y - b.y || a.col - b.col) // bottom-to-top, left-to-right

    for (const c of list) if (c.isUnit && this._isActive(c)) c.unit.cdTimer -= dt

    let shifted = false
    let buffed = false
    for (const c of list) {
      if (!c.isUnit || !this._isActive(c) || c.unit.cdTimer > 0) continue
      // Utility units (Baker) "act" instead of attacking — buff neighbours, no lunge/gold.
      if (this._isUtilityActor(c)) {
        this._utilityAct(c)
        c.unit.cdTimer += this._effectiveCooldown(c.unit)
        buffed = true
        continue
      }
      if (this._resolveAttack(c, bounds)) {
        c.unit.cdTimer += this._effectiveCooldown(c.unit)
        c.unit.lastAttackSeq = this.data.combatSeq // drives the attack "thrust" animation
        if (UNIT_DEFS[c.unit.key]?.shift && this._shift(c, bounds, enemyRows)) shifted = true
      }
    }
    if (shifted || buffed) this._syncUnitStats(true) // a Wolf shift or Baker buff changed unit stats

    // Campfire auras heal adjacent friendlies once per whole combat-second crossed.
    const secs = Math.floor(this.data.combatTime) - Math.floor(before)
    if (secs > 0) this._applyCampfireHealing(secs)

    const civ = this.data.civilization
    if (civ.legitimacy.value <= 0) { civ.legitimacy.value = 0; this._defeat(); return }
    if (this.data.combatTime >= COMBAT_DURATION) { this._endCombat(); return }
    this._emit()
  }

  _combatants(bounds, enemyRows) {
    const out = []
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (!occ) continue
      out.push({ side: 'player', unit: occ, col: tile.col, row: tile.row, y: tile.row, isUnit: occ.kind === 'unit' })
    }
    for (const e of this.data.enemies) {
      out.push({ side: 'enemy', unit: e, col: e.col, slot: e.slot, y: bounds.maxRow + (enemyRows - e.slot), isUnit: true })
    }
    return out
  }

  _isActive(c) { return !c.unit.damaged }

  _resolveAttack(c, bounds) {
    const atk = this._effectiveAtk(c.unit)
    const role = unitRole(UNIT_DEFS[c.unit.key])
    if (c.side === 'player') {
      const front = this._frontEnemyInCol(c.col)
      const isFrontUnit = c.row === this._frontPlayerUnitRow(c.col, bounds)
      if (!front) {
        // No enemy target in this column: melee/cavalry that are OBSTRUCTED by a
        // friendly unit in front don't act; only the front unit (or any ranged, which
        // shoots over) collects the "unblocked" gold (+ Hunting food).
        if (role !== 'ranged' && !isFrontUnit) return false
        const gold = atk * (UNIT_DEFS[c.unit.key].unblockedGoldMult ?? 1) // Trireme triples unblocked gold
        this.data.civilization.gold.value += gold
        this._pushEvent({ kind: 'gold', amount: gold, col: c.col, row: c.row })
        if (this._hasPolicy('hunting')) {
          const food = this.data.civilization.food
          food.value += atk
          this._processThresholds('food', food)
          this._pushEvent({ kind: 'food', amount: atk, col: c.col, row: c.row })
        }
        return true
      }
      if (UNIT_DEFS[c.unit.key].splash != null) {
        // Siege (Catapult): lob over the front line onto the REAR-most enemy, then
        // deal `splash`× damage to its (col/slot) neighbours.
        const back = this._backEnemyInCol(c.col)
        this._pushEvent({ kind: 'attack', side: 'player', col: c.col, row: c.row })
        this._dealDamage(back, atk, 'enemy', { col: back.col, slot: back.slot })
        const splash = Math.round(atk * UNIT_DEFS[c.unit.key].splash)
        if (splash > 0) for (const nb of this._enemyNeighbors(back)) this._dealDamage(nb, splash, 'enemy', { col: nb.col, slot: nb.slot })
        return true
      }
      if (role === 'ranged' || isFrontUnit) {
        this._pushEvent({ kind: 'attack', side: 'player', col: c.col, row: c.row })
        this._dealDamage(front, atk, 'enemy', { col: front.col, slot: front.slot })
        return true
      }
      return false // melee/cavalry blocked behind a friendly UNIT (buildings don't block)
    }
    const front = this._frontPlayerInCol(c.col, bounds)
    if (!front) {
      const legit = this.data.civilization.legitimacy
      legit.value = Math.max(0, legit.value - atk)
      this._pushEvent({ kind: 'legit', amount: atk, col: c.col })
      return true
    }
    if (role === 'ranged' || c.slot === this._frontEnemySlot(c.col)) {
      this._pushEvent({ kind: 'attack', side: 'enemy', col: c.col, slot: c.slot })
      this._dealDamage(front.occ, atk, 'player', { col: c.col, row: front.row })
      return true
    }
    return false
  }

  _dealDamage(target, amount, side, loc) {
    target.hp -= amount
    const killed = target.hp <= 0
    if (killed) { target.hp = 0; target.damaged = true }
    this._pushEvent({ kind: 'damage', side, amount, killed, ...loc })
    // Burial Rites: any unit that dies yields :progress: equal to its :defense: (maxHp).
    // Banked to progress.value (NOT crossed here) — progress choices only open in
    // development, and pending choices are dropped at era change; the banked value
    // carries into next era's dev and opens the choices there.
    if (killed && this._hasPolicy('burial_rites')) {
      const p = target.maxHp ?? 0
      this.data.civilization.progress.value += p
      this._pushEvent({ kind: 'progress', amount: p, ...loc })
    }
  }

  _frontEnemyInCol(col) {
    let best = null
    for (const e of this.data.enemies) {
      if (e.col === col && !e.damaged && (best === null || e.slot > best.slot)) best = e
    }
    return best
  }
  _frontEnemySlot(col) {
    const f = this._frontEnemyInCol(col)
    return f ? f.slot : -1
  }
  // Rear-most enemy (smallest slot = farthest from the player) — the Catapult's target.
  _backEnemyInCol(col) {
    let best = null
    for (const e of this.data.enemies) {
      if (e.col === col && !e.damaged && (best === null || e.slot < best.slot)) best = e
    }
    return best
  }
  /** Undamaged enemies orthogonally adjacent to `e` in the col/slot grid (splash targets). */
  _enemyNeighbors(e) {
    return this.data.enemies.filter((o) => !o.damaged && o !== e &&
      Math.abs(o.col - e.col) + Math.abs(o.slot - e.slot) === 1)
  }
  _frontPlayerInCol(col, bounds) {
    for (let r = bounds.maxRow; r >= bounds.minRow; r--) {
      const occ = this.data.tableau.tileAt(r, col)?.occupant
      if (occ && !occ.damaged) return { occ, row: r }
    }
    return null
  }
  _frontPlayerRow(col, bounds) {
    const f = this._frontPlayerInCol(col, bounds)
    return f ? f.row : NaN
  }
  // Front-most friendly UNIT (buildings excluded — they shield the enemy but don't
  // block your own melee/cavalry from striking the front enemy).
  _frontPlayerUnitRow(col, bounds) {
    for (let r = bounds.maxRow; r >= bounds.minRow; r--) {
      const occ = this.data.tableau.tileAt(r, col)?.occupant
      if (occ && !occ.damaged && occ.kind === 'unit') return r
    }
    return NaN
  }

  // --- Utility unit "acts" (e.g. Baker): resolve on cooldown like an attack, but grant
  // an effect instead of dealing damage. Player-only (enemies never field utility units). ---
  _isUtilityActor(c) {
    return c.side === 'player' && c.isUnit && !!UNIT_DEFS[c.unit.key]?.bakerDef
  }

  /** Baker acts: permanently grant +N :defense: to each adjacent friendly unit. */
  _utilityAct(c) {
    const amount = UNIT_DEFS[c.unit.key].bakerDef(c.unit.level)
    for (const tile of this._adjacentTiles(c.row, c.col)) {
      const occ = tile.occupant
      if (occ?.kind === 'unit' && !occ.damaged) {
        occ.permDef = (occ.permDef ?? 0) + amount
        this._pushEvent({ kind: 'buff', amount, col: tile.col, row: tile.row })
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Combat repositioning: a unit whose own column has NO enemies flows one column
  // over toward reachable enemies.
  //  - melee/cavalry: move to an adjacent column that HAS enemies and NO friendly
  //    melee/cavalry unit (become its front line).
  //  - ranged: move to an adjacent column that HAS enemies and friendly cover (a
  //    defensive building or a melee unit) to shoot from behind.
  // ---------------------------------------------------------------------------
  _combatReposition(bounds) {
    if (!bounds) return false
    const units = []
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (occ && occ.kind === 'unit' && !occ.damaged) units.push({ tile, occ })
    }
    units.sort((a, b) => a.tile.row - b.tile.row || a.tile.col - b.tile.col)
    let moved = false
    for (const { tile, occ } of units) {
      if (this._columnHasEnemies(tile.col)) continue // has targets here — stay
      const role = unitRole(UNIT_DEFS[occ.key])
      if (role !== 'melee' && role !== 'cavalry' && role !== 'ranged') continue
      const dest = this._repositionDest(tile, occ, role, bounds)
      if (dest) { dest.occupant = occ; tile.occupant = null; moved = true }
    }
    return moved
  }

  /** Best reposition target for an idle unit: an empty, valid tile at road-augmented
   *  distance 1 in a DIFFERENT column that has enemies and satisfies the role's rule
   *  (melee/cavalry → no friendly front there; ranged → has cover there). With no road
   *  this is exactly the same-row neighbouring column (a lateral step — never a leap to
   *  a distant row); a road bridges it to any of the network's ports. */
  _repositionDest(tile, occ, role, bounds) {
    // Horseman-style long support: reach any column on the landmass, not just distance 1.
    if (UNIT_DEFS[occ.key].longSupport) return this._landmassSupportDest(tile, occ, bounds)
    const cands = []
    for (const [k, d] of this._reachableWithin(tile.row, tile.col, 1)) {
      if (d !== 1) continue
      const [r, c] = k.split(',').map(Number)
      if (c === tile.col || c < bounds.minCol || c > bounds.maxCol) continue
      if (!this._columnHasEnemies(c)) continue
      const dt = this.data.tableau.tileAt(r, c)
      if (!dt || dt.occupant || !this.data.tableau.isUnlocked(r, c, this.data.era)) continue
      if (!canPlaceOn(UNIT_DEFS[occ.key].placement, dt.terrain)) continue
      const ok = role === 'ranged' ? this._columnHasCover(c, bounds) : !this._columnHasFriendlyFront(c, bounds)
      if (ok) cands.push(dt)
    }
    cands.sort((a, b) => a.col - b.col || a.row - b.row)
    return cands[0] ?? null
  }

  /** Horseman "support": reposition to any empty valid tile on the SAME landmass whose
   *  column has enemies and no friendly melee/cavalry front (nearest such gap wins). */
  _landmassSupportDest(tile, occ, bounds) {
    const cands = []
    for (const key of this._landmassTiles(tile.row, tile.col)) {
      const [r, c] = key.split(',').map(Number)
      if (c === tile.col || c < bounds.minCol || c > bounds.maxCol) continue
      if (!this._columnHasEnemies(c)) continue
      const dt = this.data.tableau.tileAt(r, c)
      if (!dt || dt.occupant || !canPlaceOn(UNIT_DEFS[occ.key].placement, dt.terrain)) continue
      if (this._columnHasFriendlyFront(c, bounds)) continue // only plug a melee/cavalry gap
      cands.push(dt)
    }
    cands.sort((a, b) => Math.abs(a.col - tile.col) - Math.abs(b.col - tile.col) || a.col - b.col || a.row - b.row)
    return cands[0] ?? null
  }

  /** "r,c" keys of the connected land component (orthogonal, currently-visible land)
   *  containing (sr, sc). Empty if the start tile isn't visible land. */
  _landmassTiles(sr, sc) {
    const t = this.data.tableau
    const era = this.data.era
    const isLand = (r, c) => {
      const tile = t.tileAt(r, c)
      return !!tile && tile.def?.place === 'land' && t.isUnlocked(r, c, era)
    }
    const seen = new Set()
    if (!isLand(sr, sc)) return seen
    seen.add(`${sr},${sc}`)
    const stack = [[sr, sc]]
    const NBRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    while (stack.length) {
      const [r, c] = stack.pop()
      for (const [dr, dc] of NBRS) {
        const nr = r + dr, nc = c + dc, k = `${nr},${nc}`
        if (!seen.has(k) && isLand(nr, nc)) { seen.add(k); stack.push([nr, nc]) }
      }
    }
    return seen
  }

  _columnHasEnemies(col) {
    return this.data.enemies.some((e) => e.col === col && !e.damaged)
  }
  // Friendly melee/cavalry unit present in a column.
  _columnHasFriendlyFront(col, bounds) {
    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      const occ = this.data.tableau.tileAt(r, col)?.occupant
      if (occ?.kind === 'unit' && !occ.damaged) {
        const role = unitRole(UNIT_DEFS[occ.key])
        if (role === 'melee' || role === 'cavalry') return true
      }
    }
    return false
  }
  // Cover for ranged: a friendly defensive building or a melee unit in the column.
  _columnHasCover(col, bounds) {
    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      const occ = this.data.tableau.tileAt(r, col)?.occupant
      if (!occ || occ.damaged) continue
      if (occ.kind === 'building' && BUILDING_DEFS[occ.key]?.types?.includes('defense')) return true
      if (occ.kind === 'unit' && unitRole(UNIT_DEFS[occ.key]) === 'melee') return true
    }
    return false
  }
  // Player units carry a synced effective atk (occ.atk); enemies fall back to base.
  _effectiveAtk(unit) { return unit.atk ?? unitStats(UNIT_DEFS[unit.key], unit.level, 0, unit.warband ?? 0).atk }
  _effectiveCooldown(unit) {
    const def = UNIT_DEFS[unit.key] ?? BUILDING_DEFS[unit.key]
    return Math.max(MIN_COOLDOWN, (def?.cooldown ?? MIN_COOLDOWN) - (unit.cdReduce ?? 0)) // Brothel −0.5s
  }

  _colPlaces(col) {
    const b = this.data.tableau.visibleBounds(this.data.era)
    const places = new Set()
    if (!b) return places
    for (let r = b.minRow; r <= b.maxRow; r++) {
      const p = this.data.tableau.tileAt(r, col)?.def?.place
      if (p) places.add(p)
    }
    return places
  }

  // Wolf ability: after attacking, shift to an adjacent empty valid space.
  // Returns true if the unit actually moved (so the caller can re-sync stats).
  _shift(c, bounds, enemyRows) {
    const def = UNIT_DEFS[c.unit.key]
    if (c.side === 'player') {
      const t = this.data.tableau
      // Adjacent empty valid tile (road-augmented — a Road lets the Wolf shift farther).
      for (const tile of this._adjacentTiles(c.row, c.col)) {
        if (tile.occupant || !t.isUnlocked(tile.row, tile.col, this.data.era) || !canPlaceOn(def.placement, tile.terrain)) continue
        t.tileAt(c.row, c.col).occupant = null
        tile.occupant = c.unit
        return true
      }
    } else {
      const nbrs = [[c.slot + 1, c.col], [c.slot - 1, c.col], [c.slot, c.col + 1], [c.slot, c.col - 1]]
      for (const [slot, col] of nbrs) {
        if (slot < 0 || slot >= enemyRows || col < bounds.minCol || col > bounds.maxCol) continue
        if (!this._colPlaces(col).has(def.placement)) continue
        if (this.data.enemies.some((e) => e.col === col && e.slot === slot)) continue
        c.unit.col = col
        c.unit.slot = slot
        return true
      }
    }
    return false
  }

  _pushEvent(ev) { this.data.combatEvents.push({ ...ev, seq: this.data.combatSeq }) }

  /** Campfire buildings heal adjacent friendly units/buildings by a % of their max
   *  HP for each whole combat-second elapsed (`times`). */
  _applyCampfireHealing(times) {
    const t = this.data.tableau
    for (const tile of t.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (!occ || occ.kind !== 'building' || occ.key !== 'campfire' || occ.damaged) continue
      const pct = BUILDING_DEFS.campfire.heal(occ.level)
      for (const nbTile of this._adjacentTiles(tile.row, tile.col)) {
        const nb = nbTile.occupant
        if (!nb || nb.damaged || nb.hp == null || nb.maxHp == null || nb.hp >= nb.maxHp) continue
        const heal = Math.min(nb.maxHp - nb.hp, Math.max(1, Math.ceil((pct / 100) * nb.maxHp)) * times)
        if (heal <= 0) continue
        nb.hp += heal
        this._pushEvent({ kind: 'heal', amount: heal, col: nbTile.col, row: nbTile.row })
      }
    }
  }

  /** After a battle, move every unit back to the tile it started combat on (units
   *  reposition/shift during combat) and disband mercenaries. Buildings never move. */
  _restoreUnitHomes() {
    const t = this.data.tableau
    const units = []
    for (const tile of t.visibleTiles(this.data.era)) {
      if (tile.occupant?.kind === 'unit') { units.push(tile.occupant); tile.occupant = null }
    }
    for (const occ of units) {
      if (occ.mercenary) continue // disbanded — not placed back
      const home = t.tileAt(occ.homeRow, occ.homeCol)
      if (home) home.occupant = occ
    }
  }

  _endCombat() {
    this._restoreUnitHomes() // shifted units return to their starting tiles; mercs disband
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (occ && !occ.damaged) { occ.hp = occ.maxHp; delete occ.cdTimer } // survivors heal to full
    }
    // "End of era" (= end of combat) effects — Festivals triggers them an extra time.
    const times = this._hasPolicy('festivals') ? 2 : 1
    for (let i = 0; i < times; i++) this._applyEraEndEffects()
    this._syncUnitStats(false) // combat over: drop terrain bonus, fold in Hereditary Rule
    this.data.enemies = [] // undefeated enemies fade away
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
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (occ?.kind !== 'building' || occ.key !== 'ranch') continue
      if (occ.damaged) { occ.ranchBonus = 0; occ.ranchStep = 2 }
      else {
        occ.ranchBonus = (occ.ranchBonus ?? 0) + (occ.ranchStep ?? 2)
        occ.ranchStep = (occ.ranchStep ?? 2) + 1
      }
    }
    // Legitimacy: Totems, Shamans, and Sacred Grounds' empty land.
    let legit = 0
    for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
      const occ = tile.occupant
      if (occ?.kind === 'building' && occ.key === 'totem' && !occ.damaged) {
        legit += BUILDING_DEFS.totem.combatLegit(occ.level)
      }
    }
    legit += (POP_TYPES.shaman.combatLegit ?? 10) * (civ.pops.shaman ?? 0)
    if (this._hasPolicy('sacred_grounds')) {
      for (const tile of this.data.tableau.visibleTiles(this.data.era)) {
        if (!tile.occupant && tile.def?.place === 'land') legit += 1
      }
    }
    if (legit > 0) civ.legitimacy.value += legit
    // Oral Tradition: bank :gold: + :progress: equal to post-combat :legitimacy: (progress
    // banked like Burial Rites — its choices open in next era's development).
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
    // Deployed buildings' end-of-era output (e.g. Pier food).
    this._accrueBuildingOutputs()
  }

  _defeat() {
    // _endCombat never runs on defeat, so shift units home + disband mercenaries here
    // too (the enemy host stays on the board as a record of who won).
    this._restoreUnitHomes()
    this.data.defeated = true
    this.data.combatTime = COMBAT_DURATION
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
