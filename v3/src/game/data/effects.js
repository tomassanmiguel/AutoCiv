// The EFFECT VOCABULARY — the wiring half of the progress web.
//
// This file used to live inside `progress.js`. It was split out when the web's
// CONTENT was replaced wholesale: the content is design work in flux, the
// vocabulary is engine work that `GameManager._applyEffects` depends on. Keeping
// them apart means the tree can be re-authored without touching the engine.
//
// A node's `effects` array is a list of these records. `GameManager._applyEffects`
// folds them into ONE accumulated record, `game.mods`. Twelve kinds with
// parameters — deliberately NOT one bespoke rule per node.
//
//   terrain / improved   extra yields on a terrain type, or on every improvement
//   mult                 percentage on a resource (additive per resource)
//   threshold            multiplier on a threshold (<1 is cheaper)
//   unit                 unlocks a better unit of its class and grants some
//   troops               just bodies: N units of a CLASS, resolved at placement
//   building             unlocks it and queues a placement
//   weapon / armor       a TIER — replaces the tier below rather than stacking
//   unitMod              per-class atk/hp/range/moves
//   road                 unlocks roads and sets what a road-adjacent tile earns
//   settle               an expansion permission (tundra, ocean, mountain…)
//   city / palace        per-city yields and growth rate; palace HP
//
// ⚠️ MOST NODES IN THE CURRENT WEB CARRY NO EFFECTS. The tree was re-authored
// from the design brief as text-only nodes; they are wired back one at a time by
// attaching records from here. `describe()` still generates the text for any node
// that DOES carry effects, so a wired node's description can never drift from
// what it actually does — never hand-write text for a wired node.

import { UNIT_DEFS, weaponTier, armorTier } from './units.js'
import { BUILDING_DEFS } from './buildings.js'

// --- constructors -----------------------------------------------------------
export const terrain = (t, yields) => ({ kind: 'terrain', terrain: t, yields })
export const improved = (yields) => ({ kind: 'improved', yields })
export const mult = (res, pct) => ({ kind: 'mult', res, pct })
export const thresh = (res, pct) => ({ kind: 'threshold', res, pct })
// Two ways to be given soldiers, and the distinction matters:
//   unit(key, n)   — UNLOCKS a better unit of its class and grants n. Each unit
//                    key may appear only ONCE across the tree (asserted).
//   troops(type,n) — just bodies: n of whatever the best unlocked unit of that
//                    class currently is. If the class is still empty it opens
//                    with the base unit, so a grant can never be stranded.
export const unit = (u, grant = 1) => ({ kind: 'unit', unit: u, grant })
export const troops = (type, grant = 1) => ({ kind: 'troops', type, grant })
// Weapons/armour are TIERS: taking one re-arms the civilization, replacing the
// tier below rather than stacking on it. You start on Clubs and Hides.
export const weapon = (tier) => ({ kind: 'weapon', tier })
export const armor = (tier) => ({ kind: 'armor', tier })
export const umod = (type, mod) => ({ kind: 'unitMod', type, mod })
export const build = (b, grant = 1) => ({ kind: 'building', building: b, grant })
export const road = (yields) => ({ kind: 'road', yields })
export const settle = (s) => ({ kind: 'settle', settle: s })
export const city = (mod) => ({ kind: 'city', mod })
export const palace = (mod) => ({ kind: 'palace', mod })

// --- generated description --------------------------------------------------
const TOKEN = { food: ':food:', production: ':production:', gold: ':gold:', progress: ':progress:' }
const yieldText = (y) => Object.entries(y).filter(([, v]) => v).map(([k, v]) => `+${v} ${TOKEN[k]}`).join(' ')
const pct = (p) => `${p > 0 ? '+' : ''}${Math.round(p * 100)}%`
const TYPE_TOKEN = { melee: ':melee:', ranged: ':ranged:', cavalry: ':cavalry:', defense: ':fort:' }
const times = (n) => (n > 1 ? ` ×${n}` : '')
const plural = (n, s) => `${n} ${s}${n > 1 ? 's' : ''}`

const MOD_TEXT = {
  atk: (v) => `+${v} :attack:`,
  hp: (v) => `+${v} :defense:`,
  acts: (v) => `+${v} :speed:`,
  range: (v) => `+${v} range`,
}

function describeOne(fx) {
  switch (fx.kind) {
    case 'terrain': return `${yieldText(fx.yields)} on every ${fx.terrain} tile you control.`
    case 'improved': return `${yieldText(fx.yields)} on every improved tile.`
    case 'mult': return `All ${TOKEN[fx.res]} output ${pct(fx.pct)}.`
    case 'threshold': return `${TOKEN[fx.res]} thresholds ${pct(fx.pct)}.`
    // Units are described by CLASS, never by name — which unit you actually get
    // is the reveal when you place it.
    case 'troops': return `Grants ${plural(fx.grant, `${TYPE_TOKEN[fx.type]} unit`)} to place.`
    case 'unit': return `A stronger ${TYPE_TOKEN[UNIT_DEFS[fx.unit].type]} unit — all future grants of that class use it. Grants ${plural(fx.grant, 'one')} to place.`
    case 'weapon': return `WEAPONS → ${weaponTier(fx.tier).name}. Re-arms every :melee: and :cavalry: unit: +${weaponTier(fx.tier).atk} :attack: over Clubs.`
    case 'armor': return `ARMOR → ${armorTier(fx.tier).name}. Re-equips every unit: +${armorTier(fx.tier).hp} :defense: over Hides.`
    case 'unitMod': return `All ${TYPE_TOKEN[fx.type]} units gain ${Object.entries(fx.mod).map(([k, v]) => MOD_TEXT[k](v)).join(', ')}.`
    // `first` is stamped on the earliest node that grants this building, so no
    // two nodes ever both claim to "unlock" it.
    case 'building': return fx.first
      ? `Unlocks the :building: ${BUILDING_DEFS[fx.building].name}${times(fx.grant)}, and grants one to place.`
      : `Grants ${plural(fx.grant, `${BUILDING_DEFS[fx.building].name}`)} to place.`
    case 'road': return `Roads link your cities and give ${yieldText(fx.yields)} to every tile they touch.`
    case 'settle': return `You may now settle ${fx.settle} tiles.`
    case 'city': return [
      fx.mod.yields ? `Every city produces ${yieldText(fx.mod.yields)}.` : '',
      fx.mod.growth ? `Cities grow ${pct(fx.mod.growth)} faster.` : '',
    ].filter(Boolean).join(' ')
    case 'palace': return `The palace gains +${fx.mod.def} :defense:.`
    default: return ''
  }
}

/** Generated effect text for a wired node. Empty for a text-only node. */
export const describe = (fxs) => fxs.map(describeOne).filter(Boolean).join(' ')

/**
 * Stamp `first` on the EARLIEST building grant of each key, walking rings
 * outward across all quadrants. Derived rather than hand-marked, so two nodes
 * can never both claim to unlock the same building.
 */
export function stampFirstBuildings(tree) {
  const seen = new Set()
  const rings = Math.max(...Object.values(tree).map((q) => q.length))
  for (let r = 0; r < rings; r++) {
    for (const quadrant of Object.values(tree)) {
      for (const entry of quadrant[r] ?? []) {
        for (const fx of entry?.effects ?? []) {
          if (fx.kind !== 'building' || seen.has(fx.building)) continue
          seen.add(fx.building)
          fx.first = true
        }
      }
    }
  }
}
