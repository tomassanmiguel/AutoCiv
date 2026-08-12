// The five-flavor tech ladders (v4 turn-based). Each flavor is a ladder of
// ACTIVE_ERAS techs (Stone..Renaissance). Research is COMMITTED: the player
// sets one active flavor and progress income fills its current tech over
// several turns. Completing a flavor's FINAL (Renaissance) tech — its
// ASCENDANCY — wins the run, so the strategy is to pick a lane and rush it
// while teching enough of the others to survive.
//
// An advancement is data: { id, flavor, era, name, desc, effects[] }. The
// engine (GameManager._applyEffect) interprets the effect kinds:
//   reveal_next        — push the map reveal one stage outward
//   unlock_unit {cls}  — add a unit class to the build menu
//   unit_flat {atk,def}— +atk/+def to every player unit
//   gold_tile_bonus n  — +n :gold: from every gold-yielding tile a city works
//   progress_per_pop n — +n :progress: per city pop
//   unlock_building k  — add a building to the build menu
//   city_atk n         — cities gain +n :attack: (they fight back)
//   yield_radius n     — cities harvest n tiles further out

import { ACTIVE_ERAS, ERA_NAMES } from './config.js'

export const FLAVORS = ['military', 'science', 'economy', 'culture', 'expansion']

export const FLAVOR_META = {
  military: { name: 'Military', color: '#d96a6a', icon: '/sprites/ui/melee.png', blurb: 'Unlocks unit classes and strengthens every unit.' },
  science: { name: 'Science', color: '#6ad9a0', icon: '/sprites/icons/progress.png', blurb: 'Raises :progress: output and unlocks knowledge buildings.' },
  economy: { name: 'Economy', color: '#d9b45a', icon: '/sprites/icons/gold.png', blurb: 'Raises :gold: from worked tiles and unlocks the market.' },
  culture: { name: 'Culture', color: '#b06ad9', icon: '/sprites/ui/wonder.png', blurb: 'Fortifies cities and unlocks walls, towers and wonders.' },
  expansion: { name: 'Expansion', color: '#6ab5d9', icon: '/sprites/icons/range.png', blurb: 'Reveals more of the map — better tiles and more lead time.' },
}

// The ascendancy is the last era's tech of any flavor.
export const isAscendancy = (era) => era === ACTIVE_ERAS - 1

// Verbatim ladders. Index i = era i (0..ACTIVE_ERAS-1). The final entry is the
// ascendancy (winning) tech.
const LADDERS = {
  military: [
    { name: 'Archery', desc: 'Unlocks the :ranged: Archer.', effects: [{ kind: 'unlock_unit', cls: 'ranged' }] },
    { name: 'Horsemanship', desc: 'Unlocks the :cavalry: Rider.', effects: [{ kind: 'unlock_unit', cls: 'cavalry' }] },
    { name: 'Iron Weapons', desc: '+8 :attack: / +8 :defense: to all units.', effects: [{ kind: 'unit_flat', atk: 8, def: 8 }] },
    { name: 'Siegecraft', desc: 'Unlocks the :siege: Catapult (hits an area).', effects: [{ kind: 'unlock_unit', cls: 'siege' }] },
    { name: 'Men-at-Arms', desc: 'Unlocks the heavy Pikeman — a tough wall.', effects: [{ kind: 'unlock_unit', cls: 'heavy' }] },
    { name: 'Grand Army', desc: 'ASCENDANCY. +20 :attack: / +20 :defense: to all units. Win the run.', effects: [{ kind: 'unit_flat', atk: 20, def: 20 }] },
  ],
  science: [
    { name: 'Oral Tradition', desc: '+1 :progress: per city pop.', effects: [{ kind: 'progress_per_pop', amount: 1 }] },
    { name: 'Writing', desc: 'Unlocks the Library (+:progress: each turn).', effects: [{ kind: 'unlock_building', key: 'library' }] },
    { name: 'Mathematics', desc: '+1 :progress: per city pop.', effects: [{ kind: 'progress_per_pop', amount: 1 }] },
    { name: 'Philosophy', desc: '+2 :progress: per city pop.', effects: [{ kind: 'progress_per_pop', amount: 2 }] },
    { name: 'Scholasticism', desc: '+2 :progress: per city pop.', effects: [{ kind: 'progress_per_pop', amount: 2 }] },
    { name: 'Scientific Method', desc: 'ASCENDANCY. +4 :progress: per city pop. Win the run.', effects: [{ kind: 'progress_per_pop', amount: 4 }] },
  ],
  economy: [
    { name: 'Barter', desc: '+3 :gold: from every worked gold tile.', effects: [{ kind: 'gold_tile_bonus', amount: 3 }] },
    { name: 'Currency', desc: 'Unlocks the Market (+:gold: each turn).', effects: [{ kind: 'unlock_building', key: 'market' }] },
    { name: 'Mining', desc: '+5 :gold: from every worked gold tile.', effects: [{ kind: 'gold_tile_bonus', amount: 5 }] },
    { name: 'Trade Routes', desc: '+6 :gold: from every worked gold tile.', effects: [{ kind: 'gold_tile_bonus', amount: 6 }] },
    { name: 'Banking', desc: '+8 :gold: from every worked gold tile.', effects: [{ kind: 'gold_tile_bonus', amount: 8 }] },
    { name: 'Capitalism', desc: 'ASCENDANCY. +15 :gold: from every worked gold tile. Win the run.', effects: [{ kind: 'gold_tile_bonus', amount: 15 }] },
  ],
  culture: [
    { name: 'Tribalism', desc: 'Cities fight back — +6 :attack:.', effects: [{ kind: 'city_atk', atk: 6 }] },
    { name: 'Masonry', desc: 'Unlocks the Wall — a tough blocker with no attack.', effects: [{ kind: 'unlock_building', key: 'wall' }] },
    { name: 'Fortification', desc: 'Unlocks the Watchtower — a ranged defensive building.', effects: [{ kind: 'unlock_building', key: 'watchtower' }] },
    { name: 'Monuments', desc: 'Unlocks Wonders — very costly buildings with strong effects.', effects: [{ kind: 'unlock_building', key: 'wonder' }] },
    { name: 'Guilds', desc: 'Cities strike harder — +10 :attack:.', effects: [{ kind: 'city_atk', atk: 10 }] },
    { name: 'Renaissance', desc: 'ASCENDANCY. Cities strike harder — +20 :attack:. Win the run.', effects: [{ kind: 'city_atk', atk: 20 }] },
  ],
  expansion: [
    { name: 'Scouting', desc: 'Reveal more of the map.', effects: [{ kind: 'reveal_next' }] },
    { name: 'Trailblazing', desc: 'Reveal more of the map.', effects: [{ kind: 'reveal_next' }] },
    { name: 'Roadbuilding', desc: 'Reveal more of the map.', effects: [{ kind: 'reveal_next' }] },
    { name: 'Cartography', desc: 'Reveal more of the map; cities harvest one tile further.', effects: [{ kind: 'reveal_next' }, { kind: 'yield_radius', amount: 1 }] },
    { name: 'Seafaring', desc: 'Reveal more of the map.', effects: [{ kind: 'reveal_next' }] },
    { name: 'Age of Discovery', desc: 'ASCENDANCY. Reveal more of the map. Win the run.', effects: [{ kind: 'reveal_next' }] },
  ],
}

/** The advancement a flavor offers at a given era. */
export function advancementFor(flavor, era) {
  const l = LADDERS[flavor]
  if (!l || era < 0 || era >= l.length) return null
  const e = l[era]
  return { id: `${flavor}-${era}`, flavor, era, name: e.name, desc: e.desc, effects: e.effects }
}

/** Gold-free progress cost of a flavor's current tech. */
export function researchCost(era, base, growth) {
  return Math.round(base * Math.pow(growth, era))
}

/** Has a flavor taken its ascendancy (era ACTIVE_ERAS-1)? */
export const isFlavorComplete = (branchEra, flavor) => branchEra[flavor] >= ACTIVE_ERAS

/** Any flavor complete = win. */
export const anyComplete = (branchEra) => FLAVORS.some((f) => isFlavorComplete(branchEra, f))

export const eraName = (era) => ERA_NAMES[Math.min(era, ERA_NAMES.length - 1)]
