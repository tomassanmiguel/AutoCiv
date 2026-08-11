// Per-class upgrade trees (v4) — DEAD-SIMPLE v1 stub (docs/techs.md). Real trees
// come from the content editor later.
//
// Every unit class has exactly two trees, `atk` and `def`. A tree is a SPARSE
// vertical stack of nodes — fewer nodes than levels, so nodes SKIP levels. Buying
// a node applies +add to that stat for ALL units of the class, is permanent, and
// survives unit death. A node is buyable only when its `level` ≤ the Military
// upgrade ceiling and it is affordable; nodes must be bought in tier order.

import { UNIT_ORDER } from './units.js'

export const TREES = ['atk', 'def']

// Node layout, shared by both trees. `level` is the vertical axis (gated by the
// Military ceiling); tiers must be bought in order.
export const UPGRADE_NODES = [
  { tier: 1, level: 1, add: 5 },
  { tier: 2, level: 3, add: 10 },
  { tier: 3, level: 6, add: 20 },
]

export const MAX_TIER = UPGRADE_NODES.length

/** Gold cost to buy a node (rising with its level). */
export const upgradeCost = (level) => 40 * level

/** The two trees of a class, each a list of nodes with a stable id. */
export function classTrees(cls) {
  return TREES.map((tree) => ({
    tree,
    nodes: UPGRADE_NODES.map((n) => ({ ...n, id: `${cls}-${tree}-${n.tier}`, cls, kind: tree })),
  }))
}

/** Fresh empty upgrade state: per class, the highest tier bought in each tree. */
export function emptyUpgradeState() {
  const s = {}
  for (const cls of UNIT_ORDER) s[cls] = { atk: 0, def: 0 }
  return s
}

/** Summed stat bonus a class has bought in a tree (state[cls][tree] = top tier). */
export function upgradeBonus(state, cls, tree) {
  const top = state?.[cls]?.[tree] ?? 0
  let sum = 0
  for (const n of UPGRADE_NODES) if (n.tier <= top) sum += n.add
  return sum
}

/** The next unbought node in a class/tree (or null if the tree is maxed). */
export function nextNode(state, cls, tree) {
  const top = state?.[cls]?.[tree] ?? 0
  return UPGRADE_NODES.find((n) => n.tier === top + 1) ?? null
}
