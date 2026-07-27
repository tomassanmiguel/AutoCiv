// Eras (v3) — the main cycle, carried over from v2.
//
// A run is 28 eras of TICKS_PER_ERA ticks each. The era is the clock: it paces
// the reveal of the map and gates what you are allowed to expand onto. There is
// no combat phase yet — the era simply rolls over when its ticks are spent.

import { STAGE } from '../world/regions.js'

export const TICKS_PER_ERA = 65

export const ERAS = [
  'Stone', 'Bronze', 'Iron', 'Classical', 'Early Medieval', 'Late Medieval',
  'Renaissance', 'Exploration', 'Revolution', 'Steam', 'Gilded', 'Modern',
  'Atomic', 'Silicon', 'Lunar', 'Intelligence', 'Solar', 'Invasion', 'Exodus',
  'Frontier', 'Liminite', 'Xenotic', 'Evolution', 'Early Galactic',
  'Late Galactic', 'Utopian', 'Time', 'Infinity',
]
export const ERA_COUNT = ERAS.length
export const eraName = (i) => ERAS[Math.max(0, Math.min(ERA_COUNT - 1, i))]

/**
 * Which known-world stage each era shows. The map viewport follows the era, so
 * the frontier opens roughly when the tech to reach it would.
 */
const ERA_STAGE = [
  STAGE.local, STAGE.nearby, STAGE.distant, STAGE.old_world, STAGE.old_world,
  STAGE.islands, STAGE.islands, STAGE.new_coast, STAGE.full_earth, STAGE.full_earth,
  STAGE.full_earth, STAGE.full_earth, STAGE.space, STAGE.space, STAGE.moon,
  STAGE.moon, STAGE.mars, STAGE.mars, STAGE.deep, STAGE.exo_coast,
  STAGE.exo_coast, STAGE.full_exo, STAGE.full_exo, STAGE.galaxy1,
  STAGE.galaxy1, STAGE.full_map, STAGE.full_map, STAGE.full_map,
]
export const stageForEra = (era) => ERA_STAGE[Math.max(0, Math.min(ERA_COUNT - 1, era))]

/**
 * Expansion permissions, granted automatically at an era. Eventually these are
 * progress-web nodes; for now the era clock hands them out so the expansion
 * system can be exercised end to end.
 */
export const EXPANSION_UNLOCKS = [
  { key: 'tundra', era: 2, label: 'Cold Weathering', desc: 'Expand into tundra.' },
  { key: 'desert', era: 3, label: 'Irrigation', desc: 'Expand into desert.' },
  { key: 'ocean', era: 7, label: 'Ocean Navigation', desc: 'Expand across open ocean, and onto a New World coast.' },
  { key: 'mountain', era: 9, label: 'Mountaineering', desc: 'Expand onto mountains (never cities).' },
  { key: 'asteroid', era: 13, label: 'Asteroid Mining', desc: 'Expand onto asteroids.' },
  { key: 'moon', era: 14, label: 'Lunar Landing', desc: 'Expand to a Moon border tile.' },
  { key: 'mars', era: 16, label: 'Martian Colonies', desc: 'Expand to a Mars border tile.' },
  { key: 'exoplanet', era: 19, label: 'Generation Ships', desc: 'Expand to an exoplanet border tile.' },
  { key: 'planet', era: 23, label: 'World Seeding', desc: 'Expand onto distant planets.' },
  { key: 'star', era: 24, label: 'Stellar Husbandry', desc: 'Expand onto stars.' },
  { key: 'singularity', era: 25, label: 'Event Horizon Engineering', desc: 'Expand onto singularities.' },
]

/** The set of expansion keys available at an era. */
export function unlocksForEra(era) {
  return new Set(EXPANSION_UNLOCKS.filter((u) => u.era <= era).map((u) => u.key))
}
