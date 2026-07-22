// Enemy host generation — a BUDGET-based system. Each era gets a threat budget that
// grows with the era; that budget is spent buying enemy units (drawn from a mix of
// eras, at a mix of levels) into the battlefield slots. Once the board is full, any
// leftover budget is spent LEVELLING UP placed enemies — so late-era hosts are fewer
// but far stronger. Enemies never field utility/support units or buildings; each unit
// only goes in a column whose terrain can host it, and columns are re-ordered so
// melee/cavalry sit in FRONT of ranged (nearest the player).

import { UNIT_DEFS, unitStats, unitRole } from './units.js'

// --- Tunables (calibrate by playtest) --------------------------------------------
const BUDGET_BASE = 40      // B0: era-0 threat budget
const BUDGET_GROWTH = 1.25  // per-era multiplier
const STRENGTH_VARIANCE = 0.25 // ±25% random swing on a host's budget
const COMBAT_DURATION = 25  // matches GameManager's battle length (for the DPS term)
const ERA_SPREAD = 5        // how many eras back the enemy pool reaches
const OLD_DECAY = 0.75      // pick-weight multiplier per era older than the current one
const NEXT_ERA_WEIGHT = 0.15 // pick-weight for (rare) next-era units

// Roles that count as "front" (nearer the player) vs "back".
const isFront = (role) => role !== 'ranged'

/** Threat budget for an era: B0 · growth^era. */
export function threatBudget(era) {
  return BUDGET_BASE * Math.pow(BUDGET_GROWTH, era)
}

/** A (key, level) enemy's budget cost ≈ its combat value: damage-over-a-battle
 *  (atk × battles-worth-of-attacks) + durability. */
export function unitCost(key, level) {
  const def = UNIT_DEFS[key]
  const s = unitStats(def, level)
  return s.atk * (COMBAT_DURATION / Math.max(1, def.cooldown)) + s.def
}

/** Weighted candidate enemy keys for an era: combat units from (era − spread) up to
 *  era + 1 (a rare next-era peek), favouring recent eras. If no units are implemented
 *  in that window yet (later eras still unbuilt), fall back to ALL combat units at or
 *  below era+1 — the newest available, which `rollLevel` scales up as veterans. */
function enemyPool(era) {
  const combat = Object.entries(UNIT_DEFS).filter(([, def]) => unitRole(def) !== 'utility' && def.era <= era + 1)
  let pool = combat.filter(([, def]) => def.era >= era - ERA_SPREAD)
  if (pool.length === 0) pool = combat
  return pool.map(([key, def]) => {
    const e = def.era
    const weight = e > era ? NEXT_ERA_WEIGHT : Math.pow(OLD_DECAY, era - e)
    return { key, weight }
  })
}

function weightedPick(cands, rng) {
  const total = cands.reduce((s, c) => s + c.weight, 0)
  let r = rng() * total
  for (const c of cands) { r -= c.weight; if (r <= 0) return c.key }
  return cands[cands.length - 1].key
}

/** Level an enemy of `unitEra` arrives at in `era`: older units come as higher-level
 *  "veterans" (so they stay relevant), with a little random spread. */
function rollLevel(era, unitEra, rng) {
  return 1 + Math.max(0, era - unitEra) + (rng() < 0.4 ? 1 : 0)
}

/**
 * Compose an enemy host for an era by spending a threat budget.
 * @param era      current era index.
 * @param rows     number of battlefield (enemy) slot rows.
 * @param columns  [{ col, places: Set<placementClass> }] for each visible column.
 * @param rng      () => [0,1). Call once per era so the preview is stable.
 * @returns { type, units: [{ key, level, role, col, slot, hp, maxHp, damaged }] }
 *          slot 0 = back (far from player), rows-1 = front (nearest the player).
 */
export function generateHost(era, rows, columns, rng = Math.random) {
  if (columns.length === 0 || rows <= 0) return { type: 'mixed', units: [] }
  const capacity = rows * columns.length

  // Candidate keys that can actually be placed somewhere on this map.
  const candidates = enemyPool(era).filter(({ key }) =>
    columns.some((c) => c.places.has(UNIT_DEFS[key].placement)))
  if (candidates.length === 0) return { type: 'mixed', units: [] }

  const perCol = new Map(columns.map((c) => [c.col, []]))
  const placedList = [] // entry refs, for the level-up phase
  // ±STRENGTH_VARIANCE random swing on this host's budget (stable per seed).
  let budget = threatBudget(era) * (1 - STRENGTH_VARIANCE + rng() * 2 * STRENGTH_VARIANCE)

  // --- Phase 1: buy bodies until the board is full or the budget runs dry. ---
  let placed = 0, guard = 0
  while (placed < capacity && budget > 0 && guard++ < capacity * 60 + 500) {
    const key = weightedPick(candidates, rng)
    const def = UNIT_DEFS[key]
    const valid = columns.filter((c) => c.places.has(def.placement) && perCol.get(c.col).length < rows)
    if (valid.length === 0) continue // every column this unit could use is full
    const level = rollLevel(era, def.era, rng)
    const cost = unitCost(key, level)
    if (cost > budget && placed > 0) break // can't afford another (but always place at least one)
    const c = valid[Math.floor(rng() * valid.length)]
    const entry = { key, level, role: unitRole(def), col: c.col }
    perCol.get(c.col).push(entry)
    placedList.push(entry)
    budget -= cost
    placed++
  }

  // --- Phase 2: spend the leftover budget levelling up placed enemies. ---
  let misses = 0
  while (budget > 0 && placedList.length > 0 && misses < placedList.length + 5) {
    const e = placedList[Math.floor(rng() * placedList.length)]
    const marginal = unitCost(e.key, e.level + 1) - unitCost(e.key, e.level)
    if (marginal > budget) { misses++; continue }
    e.level += 1
    budget -= marginal
    misses = 0
  }

  // --- Order each column (melee/cavalry front, ranged back) and emit. ---
  const units = []
  for (const [col, list] of perCol) {
    if (list.length === 0) continue
    list.sort((a, b) => (isFront(a.role) ? 0 : 1) - (isFront(b.role) ? 0 : 1))
    list.forEach((u, idx) => {
      const maxHp = unitStats(UNIT_DEFS[u.key], u.level).def
      units.push({ key: u.key, level: u.level, role: u.role, col, slot: rows - 1 - idx, hp: maxHp, maxHp, damaged: false })
    })
  }
  return { type: 'mixed', units }
}
