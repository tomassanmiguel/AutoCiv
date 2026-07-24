// Enemy host generation (v2 turn-based tower defense). A BUDGET-based system: each era
// gets a threat budget that grows with the era; the budget buys enemy BODIES that spawn
// in the battlefield zone above the grid and MARCH DOWN one tile per turn toward the
// player. Once the board is full, leftover budget levels up placed enemies — so late-era
// hosts are fewer but far stronger.
//
// v2 enemy instance: { key, name, col, row, hp, maxHp, atk, damaged, breached }
//   - row  : current marching row (spawns high in the battlefield zone, decreases each turn).
//   - atk  : LEGITIMACY DAMAGE dealt if the enemy breaches off the bottom (NOT per-turn chip).
//   - hp/maxHp : the enemy's health (what player towers chew through).
// A blocked enemy deals a flat chip (default 1/turn) to whatever is in its path — it never
// targets the backline. Enemies drawn (transitionally) from the player UNIT_DEFS pool; a
// hand-authored unique/boss roster replaces this in the enemy-content batch.

import { UNIT_DEFS, unitStats, unitRole } from './units.js'

// --- Tunables (calibrate by playtest) --------------------------------------------
const BUDGET_BASE = 120     // B0: era-0 threat budget
const BUDGET_GROWTH = 1.2   // per-era multiplier
const STRENGTH_VARIANCE = 0.25 // ±25% random swing on a host's budget
const ERA_SPREAD = 5        // how many eras back the enemy pool reaches
const OLD_DECAY = 0.75      // pick-weight multiplier per era older than the current one
const NEXT_ERA_WEIGHT = 0.15 // pick-weight for (rare) next-era units

/** Threat budget for an era: B0 · growth^era. */
export function threatBudget(era) {
  return BUDGET_BASE * Math.pow(BUDGET_GROWTH, era)
}

/** A (key, level) enemy's budget cost ≈ its combat value: durability (HP) + breach threat. */
export function unitCost(key, level) {
  const s = unitStats(UNIT_DEFS[key], level)
  return s.def + s.atk * 3
}

/** Weighted candidate enemy keys for an era: combat units from (era − spread) up to
 *  era + 1 (a rare next-era peek), favouring recent eras. Falls back to ALL combat units
 *  at or below era+1 when that window is empty (later eras still unbuilt). */
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

/** Random upgrade spread: each extra level is a repeated 50% coin flip, so a unit has
 *  P(≥k upgrades) = 0.5^k (≈1/32 reach +5). */
function rollLevel(rng) {
  let level = 1
  while (rng() < 0.5) level++
  return level
}

/**
 * Compose an enemy host for an era by spending a threat budget.
 * @param era       current era index.
 * @param bounds    { minRow, maxRow, minCol, maxCol } of the visible player grid.
 * @param spawnRows number of battlefield spawn rows above the grid.
 * @param columns   [{ col, places: Set<placementClass> }] for each visible column.
 * @param rng       () => [0,1). Call once per era so the preview is stable.
 * @returns { type, units: [{ key, name, col, row, hp, maxHp, atk, damaged, breached }] }
 *          Spawn rows run maxRow+1 (front, nearest the player) .. maxRow+spawnRows (back).
 */
export function generateHost(era, bounds, spawnRows, columns, rng = Math.random) {
  if (!bounds || columns.length === 0 || spawnRows <= 0) return { type: 'mixed', units: [] }
  const capacity = spawnRows * columns.length

  // Candidate keys that can actually be placed somewhere on this map's columns.
  const candidates = enemyPool(era).filter(({ key }) =>
    columns.some((c) => c.places.has(UNIT_DEFS[key].placement)))
  if (candidates.length === 0) return { type: 'mixed', units: [] }

  const perCol = new Map(columns.map((c) => [c.col, []]))
  const placedList = [] // entry refs, for the level-up phase
  // ±STRENGTH_VARIANCE random swing on this host's budget (stable per seed).
  let budget = threatBudget(era) * (1 - STRENGTH_VARIANCE + rng() * 2 * STRENGTH_VARIANCE)

  // --- Phase 1: buy bodies until the board is full or the budget can't afford any. ---
  let placed = 0, misses = 0
  while (placed < capacity && budget > 0 && misses < 40) {
    const key = weightedPick(candidates, rng)
    const def = UNIT_DEFS[key]
    const valid = columns.filter((c) => c.places.has(def.placement) && perCol.get(c.col).length < spawnRows)
    const level = rollLevel(rng)
    const cost = unitCost(key, level)
    if (valid.length === 0 || (cost > budget && placed > 0)) { misses++; continue }
    const c = valid[Math.floor(rng() * valid.length)]
    const entry = { key, level, col: c.col }
    perCol.get(c.col).push(entry)
    placedList.push(entry)
    budget -= cost
    placed++
    misses = 0
  }

  // --- Phase 2: spend leftover budget levelling up placed enemies. ---
  misses = 0
  while (budget > 0 && placedList.length > 0 && misses < placedList.length + 5) {
    const e = placedList[Math.floor(rng() * placedList.length)]
    const marginal = unitCost(e.key, e.level + 1) - unitCost(e.key, e.level)
    if (marginal > budget) { misses++; continue }
    e.level += 1
    budget -= marginal
    misses = 0
  }

  // --- Emit: stack each column's buyers into spawn rows (front-most nearest the player). ---
  const units = []
  for (const [col, list] of perCol) {
    list.forEach((u, idx) => {
      const def = UNIT_DEFS[u.key]
      const s = unitStats(def, u.level)
      units.push({
        key: u.key,
        name: def.name,
        level: u.level,
        col,
        row: bounds.maxRow + 1 + idx, // idx 0 = front (maxRow+1), stacking upward
        hp: s.def,
        maxHp: s.def,
        atk: s.atk,
        damaged: false,
        breached: false,
      })
    })
  }
  return { type: 'mixed', units }
}
