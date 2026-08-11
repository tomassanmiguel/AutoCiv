// The five-flavor progress draft (v4). PLACEHOLDER content — one deterministic
// advancement per flavor per era, scaling slightly (docs/techs.md). Real
// multi-option pools come from the content editor later.
//
// Taking a card advances THAT flavor's era. A flavor is COMPLETE once it has
// taken its final-era (ACTIVE_ERAS-1) advancement; all five complete = win.
//
// An advancement is data: { id, flavor, era, name, desc, effects[] }. The engine
// (GameManager._applyAdvancement) interprets the effect kinds.

import { ACTIVE_ERAS, DRAFT_CARDS } from './config.js'

export const FLAVORS = ['expansion', 'military', 'economy', 'science', 'culture']

export const FLAVOR_META = {
  expansion: { name: 'Expansion', color: '#6ab5d9', blurb: 'Reveals more of the map.' },
  military: { name: 'Military', color: '#d96a6a', blurb: 'Unlocks unit classes and upgrades.' },
  economy: { name: 'Economy', color: '#d9b45a', blurb: 'Raises gold output.' },
  science: { name: 'Science', color: '#6ad9a0', blurb: 'Raises progress output.' },
  culture: { name: 'Culture', color: '#b06ad9', blurb: 'Strengthens cities.' },
}

// Which class each early Military pick unlocks (v1 goes up to Naval).
const MILITARY_UNLOCK = { 0: 'ranged', 1: 'cavalry', 2: 'naval' }

/** The single advancement offered by a flavor at a given era. */
export function advancementFor(flavor, era) {
  const id = `${flavor}-${era}`
  switch (flavor) {
    case 'science': {
      const n = 1 + Math.floor(era / 2)
      return { id, flavor, era, name: `Science ${era + 1}`, desc: `+${n} :progress: per citizen, all cities.`, effects: [{ kind: 'progress_per_citizen', amount: n }] }
    }
    case 'military': {
      const effects = [{ kind: 'unit_flat', atk: 5, def: 5 }, { kind: 'upgrade_ceiling', amount: 1 }]
      const cls = MILITARY_UNLOCK[era]
      let desc = '+5 :attack: / +5 :defense: to all units; +1 upgrade level.'
      if (cls) { effects.push({ kind: 'unlock_class', cls }); desc = `Unlocks the ${cls} class. +5 :attack: / +5 :defense: to all units; +1 upgrade level.` }
      return { id, flavor, era, name: `Military ${era + 1}`, desc, effects }
    }
    case 'culture':
      return { id, flavor, era, name: `Culture ${era + 1}`, desc: '+20 :attack: / +20 :defense: to all cities.', effects: [{ kind: 'city_flat', atk: 20, def: 20 }] }
    case 'economy':
      return { id, flavor, era, name: `Economy ${era + 1}`, desc: '+5 :gold: to every gold-producing tile.', effects: [{ kind: 'gold_tile_bonus', amount: 5 }] }
    case 'expansion':
    default:
      return { id, flavor, era, name: `Expansion ${era + 1}`, desc: 'Reveal more of the map.', effects: [{ kind: 'reveal_next' }] }
  }
}

/** Is a flavor complete (has taken every era's advancement)? */
export const isFlavorComplete = (branchEra, flavor) => branchEra[flavor] >= ACTIVE_ERAS

/** Have all five flavors been completed? (win) */
export const allComplete = (branchEra) => FLAVORS.every((f) => isFlavorComplete(branchEra, f))

/**
 * Deal up to DRAFT_CARDS advancement cards. Only flavors that are not yet
 * complete can be offered; each offers its CURRENT-era advancement. Weighted
 * toward the player's LESS-developed flavors so none gets stranded. Distinct
 * flavors (with one option each, a repeat would be identical).
 */
export function draftOptions(branchEra, rng = Math.random, count = DRAFT_CARDS) {
  const pool = FLAVORS.filter((f) => !isFlavorComplete(branchEra, f))
  const chosen = []
  const bag = pool.slice()
  while (chosen.length < count && bag.length) {
    // weight = how far this flavor is BEHIND (ACTIVE_ERAS - era), min 1.
    const weights = bag.map((f) => Math.max(1, ACTIVE_ERAS - branchEra[f]))
    let total = weights.reduce((a, b) => a + b, 0)
    let r = rng() * total
    let idx = 0
    for (; idx < bag.length; idx++) { r -= weights[idx]; if (r <= 0) break }
    if (idx >= bag.length) idx = bag.length - 1
    const flavor = bag.splice(idx, 1)[0]
    chosen.push(advancementFor(flavor, branchEra[flavor]))
  }
  return chosen
}
