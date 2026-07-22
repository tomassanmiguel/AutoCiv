// Enemy host generation. A fresh host is composed each era and deployed into the
// battlefield (enemy) slots above the player grid. Enemies are one of three
// compositions; units are placed only in columns whose terrain can host them,
// then each column is re-ordered so melee/cavalry sit in FRONT of ranged (nearest
// the player). Enemies never spawn support units or buildings.

import { UNIT_DEFS, unitStats } from './units.js'

// Which unit keys are available as ENEMIES at a given era index (era -1 = wildlife).
export const ENEMY_ROSTER = {
  '-1': ['bear', 'lion', 'wolf'],
  0: ['warrior', 'slinger', 'wolf'],
}

const CLASSICAL = 3 // horde composition unlocks at the Classical era

// Roles that count as "front" (nearer the player) vs "back".
const isFront = (role) => role !== 'ranged'

function eraRangeKeys(lo, hi) {
  const set = new Set()
  for (let e = lo; e <= hi; e++) for (const k of (ENEMY_ROSTER[e] ?? [])) set.add(k)
  return [...set]
}

// Fallback pool: every rostered enemy unit at or below the current era. Only a few
// eras have unit defs so far, so a composition whose exact era window is empty
// falls back to this (keeps combat populated until more eras are implemented).
function allKeysUpTo(era) {
  return eraRangeKeys(-1, era)
}

/** Pick a composition type applicable at this era. */
function pickComposition(era, rng) {
  const options = ['elite', 'group']
  if (era >= CLASSICAL) options.push('horde')
  return options[Math.floor(rng() * options.length)]
}

/** Unit pool [{key, level}] + fill fraction for a composition. */
function buildPool(type, era, rng) {
  const orFallback = (keys) => (keys.length ? keys : allKeysUpTo(era))
  if (type === 'horde') {
    // Units from 1–5 eras ago, at base level, filling half the space.
    return { pool: orFallback(eraRangeKeys(era - 5, era - 1)).map((key) => ({ key, level: 1 })), fraction: 0.5 }
  }
  if (type === 'elite') {
    // Current-era units +1 upgrade, OR last-era units +2 upgrades. 10% of space.
    const useCurrent = rng() < 0.5
    const keys = orFallback(useCurrent ? eraRangeKeys(era, era) : eraRangeKeys(era - 1, era - 1))
    return { pool: keys.map((key) => ({ key, level: useCurrent ? 2 : 3 })), fraction: 0.1 }
  }
  // group: current + previous era, base level, 25% of space.
  return { pool: orFallback(eraRangeKeys(era - 1, era)).map((key) => ({ key, level: 1 })), fraction: 0.25 }
}

/**
 * Compose an enemy host for an era.
 * @param era      current era index.
 * @param rows     number of battlefield (enemy) slot rows.
 * @param columns  [{ col, places: Set<placementClass> }] for each visible column.
 * @param rng      () => [0,1). Call once per era so the preview is stable.
 * @returns { type, units: [{ key, level, role, col, slot, hp, maxHp, damaged }] }
 *          slot 0 = back (far from player), rows-1 = front (nearest the player).
 */
export function generateHost(era, rows, columns, rng = Math.random) {
  const type = pickComposition(era, rng)
  const { pool, fraction } = buildPool(type, era, rng)
  if (pool.length === 0 || columns.length === 0 || rows <= 0) return { type, units: [] }

  const target = Math.round(fraction * rows * columns.length)
  const perCol = new Map(columns.map((c) => [c.col, []]))

  let placed = 0
  let guard = 0
  while (placed < target && guard++ < target * 40 + 50) {
    const pick = pool[Math.floor(rng() * pool.length)]
    const def = UNIT_DEFS[pick.key]
    const valid = columns.filter((c) => c.places.has(def.placement) && perCol.get(c.col).length < rows)
    if (valid.length === 0) break // nowhere left this unit can go
    const c = valid[Math.floor(rng() * valid.length)]
    perCol.get(c.col).push({ key: pick.key, level: pick.level, role: def.types[0] })
    placed++
  }

  // Re-order each column (melee/cavalry front, ranged back) and pack from the front.
  const units = []
  for (const [col, list] of perCol) {
    if (list.length === 0) continue
    list.sort((a, b) => (isFront(a.role) ? 0 : 1) - (isFront(b.role) ? 0 : 1))
    list.forEach((u, idx) => {
      const def = UNIT_DEFS[u.key]
      const maxHp = unitStats(def, u.level).def
      units.push({ ...u, col, slot: rows - 1 - idx, hp: maxHp, maxHp, damaged: false })
    })
  }
  return { type, units }
}
