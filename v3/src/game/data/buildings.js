// Placeable buildings (v3).
//
// A building is unlocked by a progress node, which usually also GRANTS one or
// more placements. You put it on a controlled tile and it pays out every tick.
//
// Every building's payout is ADJACENCY-SHAPED: a flat base plus a per-neighbour
// bonus keyed to something about the six tiles around it. That is the whole
// design — where you put it matters more than which one you got.
//
//   of: 'terrain'    — count adjacent tiles of a given terrain
//   of: 'class'      — count adjacent tiles in a terrain class (see CLASSES)
//   of: 'controlled' — count adjacent tiles you control
//   of: 'improved'   — count adjacent improvements (cities count)
//   of: 'city'       — count adjacent cities (the palace counts)
//   of: 'building'   — count adjacent buildings
//
// `self: true` on the per-clause includes the building's own tile in the count,
// which is what lets a Lumber Camp in deep forest pay for itself.

import { neighbors, key as hkey } from '../hex/coords.js'
import { levelMult } from './costs.js'

/** Terrain groupings used by `of: 'class'`. */
export const CLASSES = {
  rock: new Set(['hills', 'mountain', 'exohills', 'exomountain', 'mars_mountain']),
  water: new Set(['coast', 'ocean', 'river', 'exosea']),
  green: new Set(['plains', 'forest', 'exoplains']),
}

const B = (key, name, opts) => ({ key, name, icon: '/sprites/ui/building.png', ...opts })

export const BUILDING_DEFS = {
  granary: B('granary', 'Granary', {
    base: { food: 2 },
    per: { of: 'terrain', terrain: 'plains', self: true, yields: { food: 2 } },
    blurb: 'Grain keeps. Wants open ground around it.',
  }),
  lumbercamp: B('lumbercamp', 'Lumber Camp', {
    base: { production: 1 },
    per: { of: 'terrain', terrain: 'forest', self: true, yields: { production: 2 } },
    blurb: 'Pays best buried in deep forest.',
  }),
  quarry: B('quarry', 'Quarry', {
    base: { production: 2 },
    per: { of: 'class', cls: 'rock', self: true, yields: { production: 2 } },
    blurb: 'Cut stone from the hills and the mountainside.',
  }),
  mine: B('mine', 'Mine', {
    base: { production: 3, gold: 1 },
    per: { of: 'class', cls: 'rock', yields: { production: 2, gold: 1 } },
    blurb: 'Deep shafts. Rock on every side is the ideal.',
  }),
  market: B('market', 'Market', {
    base: { gold: 3 },
    per: { of: 'controlled', yields: { gold: 2 } },
    blurb: 'Wants to be surrounded — every neighbour is a customer.',
  }),
  harbor: B('harbor', 'Harbor', {
    base: { gold: 2 },
    per: { of: 'class', cls: 'water', yields: { gold: 3 } },
    blurb: 'A deep anchorage. Put it on a headland.',
  }),
  workshop: B('workshop', 'Workshop', {
    base: { production: 3 },
    per: { of: 'city', yields: { production: 4 } },
    blurb: 'Craftsmen need a city to sell into.',
  }),
  library: B('library', 'Library', {
    base: { progress: 3 },
    per: { of: 'building', yields: { progress: 3 } },
    blurb: 'Learning compounds where other work is already being done.',
  }),
  temple: B('temple', 'Temple', {
    base: { progress: 2 },
    per: { of: 'city', yields: { progress: 4 } },
    blurb: 'A congregation needs people.',
  }),
  amphitheater: B('amphitheater', 'Amphitheatre', {
    base: { progress: 1 },
    per: { of: 'improved', yields: { progress: 2 } },
    blurb: 'Rewards a settled, worked countryside.',
  }),
}

export const BUILDING_LIST = Object.values(BUILDING_DEFS)
export const buildingDef = (k) => BUILDING_DEFS[k] ?? null

const ZERO = { food: 0, production: 0, gold: 0, progress: 0 }
const addInto = (acc, y, n = 1) => {
  for (const k of Object.keys(ZERO)) if (y[k]) acc[k] += y[k] * n
  return acc
}

/** Does tile `t` satisfy this building's per-neighbour clause? */
function counts(per, t) {
  if (!t) return false
  switch (per.of) {
    case 'terrain': return t.terrain === per.terrain
    case 'class': return CLASSES[per.cls]?.has(t.terrain) ?? false
    case 'controlled': return !!t.controlled
    case 'improved': return !!t.improved
    case 'city': return !!t.city
    case 'building': return !!t.building
    default: return false
  }
}

/**
 * What a building on `tile` produces, given its surroundings. Pure — the caller
 * decides whether the tile is visible/controlled.
 */
export function buildingYield(world, tile) {
  const def = buildingDef(tile.building?.key)
  if (!def) return { ...ZERO }
  const out = addInto({ ...ZERO }, def.base ?? {})
  const per = def.per
  if (per) {
    let n = per.self && counts(per, tile) ? 1 : 0
    for (const nb of neighbors(tile.q, tile.r)) {
      if (counts(per, world.tiles.get(hkey(nb.q, nb.r)))) n++
    }
    addInto(out, per.yields, n)
  }
  // Gold upgrades scale the WHOLE payout, adjacency included — so upgrading a
  // well-placed building is worth much more than upgrading a badly-placed one.
  const m = levelMult(tile.building.level ?? 1)
  if (m !== 1) for (const k of Object.keys(ZERO)) out[k] = Math.round(out[k] * m)
  return out
}

/** Human-readable effect line, generated so it can never drift from the numbers. */
const TOKEN = { food: ':food:', production: ':production:', gold: ':gold:', progress: ':progress:' }
const yieldText = (y) => Object.entries(y).filter(([, v]) => v).map(([k, v]) => `+${v} ${TOKEN[k]}`).join(' ')

const PER_TEXT = {
  terrain: (p) => `adjacent ${p.terrain} tile`,
  class: (p) => `adjacent ${p.cls} tile`,
  controlled: () => 'adjacent controlled tile',
  improved: () => 'adjacent improvement',
  city: () => 'adjacent city',
  building: () => 'adjacent building',
}

export function buildingEffectText(def) {
  const parts = []
  if (def.base && Object.values(def.base).some(Boolean)) parts.push(`${yieldText(def.base)} per tick`)
  if (def.per) {
    parts.push(`${yieldText(def.per.yields)} per ${PER_TEXT[def.per.of](def.per)}${def.per.self ? ' (its own tile counts)' : ''}`)
  }
  return parts.join(', ')
}
