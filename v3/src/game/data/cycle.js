// THE TWO CLOCKS. They are not connected, and that is the point.
//
// This module replaces the old `eras.js`, whose single 28-era counter drove the
// map, the difficulty and the tech pool all at once.
//
//   WAVES are combat. Thirty of them, one fight each, on a ladder of their own.
//   Development runs for TICKS_PER_WAVE ticks, then the wave attacks.
//
//   ERAS are TECH POOLS AND NOTHING ELSE. Each branch carries its own era and
//   advances by drafting (see `content.js`). The map reveal and the expansion
//   permissions follow the FURTHEST branch — never the wave count — so a player
//   who out-teches the ladder genuinely sees more of the world.
//
// The 15 eras and the 15 reveal notches are the same ladder, one rung each; that
// correspondence is why the reveal needs no table of its own.

import { STAGE_COUNT } from '../world/regions.js'
import { ERAS } from './schema.js'

export { ERAS }
export const ERA_COUNT = ERAS.length
export const eraName = (i) => ERAS[Math.max(0, Math.min(ERA_COUNT - 1, i))]

/** Ticks of development before the wave lands. */
export const TICKS_PER_WAVE = 65

/** The combat ladder, independent of every tech track. */
export const WAVE_COUNT = 30

/** One era, one notch. Clamped in case the two ladders ever diverge in length. */
export const stageForEra = (era) =>
  Math.max(0, Math.min(STAGE_COUNT - 1, era | 0))

/**
 * Where you are ALLOWED to expand, granted by the reveal era — which is to say,
 * by whichever branch has gone furthest.
 *
 * Each permission is pinned to the era whose reveal notch actually uncovers the
 * ground it refers to; a permission you cannot see the target of is not a
 * permission, it is a dead entry in a menu.
 */
export const EXPANSION_UNLOCKS = [
  { key: 'tundra', era: 1, label: 'Cold Weathering', desc: 'Expand into tundra.' },
  { key: 'desert', era: 2, label: 'Irrigation', desc: 'Expand into desert.' },
  { key: 'ocean', era: 5, label: 'Ocean Navigation', desc: 'Expand across open ocean, and onto a New World coast.' },
  { key: 'mountain', era: 6, label: 'Mountaineering', desc: 'Expand onto mountains (never cities).' },
  { key: 'asteroid', era: 7, label: 'Asteroid Mining', desc: 'Expand onto asteroids.' },
  { key: 'moon', era: 8, label: 'Lunar Landing', desc: 'Expand to a Moon border tile.' },
  { key: 'mars', era: 9, label: 'Martian Colonies', desc: 'Expand to a Mars border tile.' },
  { key: 'exoplanet', era: 11, label: 'Generation Ships', desc: 'Expand to an exoplanet border tile.' },
  { key: 'planet', era: 13, label: 'World Seeding', desc: 'Expand onto distant planets.' },
  { key: 'star', era: 13, label: 'Stellar Husbandry', desc: 'Expand onto stars.' },
  { key: 'singularity', era: 14, label: 'Event Horizon Engineering', desc: 'Expand onto singularities.' },
]

/** The set of expansion keys available at a reveal era. */
export function unlocksForEra(era) {
  return new Set(EXPANSION_UNLOCKS.filter((u) => u.era <= era).map((u) => u.key))
}
