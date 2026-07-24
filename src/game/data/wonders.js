// Wonder definitions (v2). A wonder occupies the dedicated Wonder slot; unlocking it
// lets you place an INCOMPLETE building that does nothing until N additional production-
// builds finish it (only one wonder in flight at a time; a destroyed wonder restarts).
// See docs/wonders.md + SCALING §7 (N=3 for every wonder to start).
//
// Schema: key, name, era, tech (unlocking advancement), footprint [w,h], placement,
// buildsToComplete, special (effect tag, wired incrementally), effect (display text).

export const WONDER_BUILDS = 3 // N additional production-builds to complete any wonder

export const WONDER_DEFS = {
  stonehenge:       { key: 'stonehenge', name: 'Stonehenge', era: 0, tech: 'Mysticism', footprint: [1, 1], placement: 'land', special: 'legit_per_era', effect: 'At the end of each era, gain +25 :legitimacy:.' },
  the_pyramids:     { key: 'the_pyramids', name: 'The Pyramids', era: 1, tech: 'Masonry', footprint: [1, 1], placement: 'land', special: 'upgrade_cost_reduce', effect: 'All unit & building upgrade costs −25%.' },
  hanging_gardens:  { key: 'hanging_gardens', name: 'Hanging Gardens', era: 2, tech: 'Hospitality Rites', footprint: [1, 1], placement: 'land', special: 'extra_pop_per_gain', effect: 'Every population gain yields +1 more pop.' },
  great_wall:       { key: 'great_wall', name: 'Great Wall', era: 3, tech: 'Great Wall', footprint: [4, 1], placement: 'land', special: 'multi_lane_wall', effect: 'One shared-HP blocker across 4 lanes (:defense: 20, +2/level).' },
  machu_picchu:     { key: 'machu_picchu', name: 'Machu Picchu', era: 4, tech: 'Civil Service', footprint: [1, 1], placement: 'mountain', special: 'mountain_levels', levelBonus: 2, effect: 'Units & buildings on mountains gain +2 free upgrade levels.' },
  hagia_sophia:     { key: 'hagia_sophia', name: 'Hagia Sophia', era: 5, tech: 'Inquisition', footprint: [1, 1], placement: 'land', special: 'legit_double_prod', effect: 'On completion, double current :legitimacy:. Each era start: :production: = 2× :legitimacy:.' },
  sistine_chapel:   { key: 'sistine_chapel', name: 'Sistine Chapel', era: 6, tech: 'Domes', footprint: [1, 1], placement: 'land', special: 'free_advancement', effect: 'Free advancement pick at the start of each era, with no threshold increase.' },
  taj_mahal:        { key: 'taj_mahal', name: 'Taj Mahal', era: 7, tech: 'Architecture', footprint: [1, 1], placement: 'land', special: 'bank_dead_atk_progress', effect: "Banks each dead unit's :attack:; end of era: :progress: = the running total (never clears)." },
  eiffel_tower:     { key: 'eiffel_tower', name: 'Eiffel Tower', era: 9, tech: 'World Faire', footprint: [1, 1], placement: 'land', special: 'specialist_output_pct', effect: 'All specialists +50% output.' },
  statue_of_liberty:{ key: 'statue_of_liberty', name: 'Statue of Liberty', era: 10, tech: 'Immigration', footprint: [1, 1], placement: 'coast', special: 'no_overbuild_threshold', effect: 'Overbuilding no longer raises the next :production: threshold.' },
  manhattan_project:{ key: 'manhattan_project', name: 'Manhattan Project', era: 11, tech: 'Fission', footprint: [1, 1], placement: 'land', special: 'nuke_and_fallout', effect: 'Start of combat: nuke a random enemy (2000 dmg) and lay a permanent Fallout tile (100 dmg to enemies entering/spawning).' },
  hadron_collider:  { key: 'hadron_collider', name: 'Hadron Collider', era: 12, tech: 'Particle Physics', footprint: [3, 3], placement: 'any', special: 'progress_per_era', effect: 'Each era start: ≈+1500 :progress: (scales with era). 3×3 ring, hollow center, ≥1 land.' },
  space_station:    { key: 'space_station', name: 'Intl. Space Station', era: 13, tech: 'Space Station', footprint: [1, 1], placement: 'space', special: 'copy_space_unit', effect: 'Creating a unit in space copies it onto an adjacent tile.' },
  great_mirror:     { key: 'great_mirror', name: 'Great Mirror', era: 14, tech: 'Solar Reflection', footprint: [1, 1], placement: 'land', special: 'terrestrial_levels', levelBonus: 2, effect: 'All terrestrial units & buildings +2 upgrade levels.' },
  skynet:           { key: 'skynet', name: 'Skynet', era: 15, tech: 'Autonomous Warfare', footprint: [1, 1], placement: 'land', special: 'military_atk_pct', effect: 'Military units +75% :attack:; Terminator-line +150%.' },
  happy_valley:     { key: 'happy_valley', name: 'Happy Valley', era: 16, tech: 'Martianism', footprint: [1, 1], placement: 'mars', special: 'mars_levels', levelBonus: 8, effect: 'Units & buildings on Mars gain +8 free upgrade levels.' },
  stargate:         { key: 'stargate', name: 'Stargate', era: 20, tech: 'Deep Space Relays', footprint: [1, 1], placement: 'exoplanet', special: 'buildings_repositionable', effect: 'Your buildings become repositionable during prep.' },
  panopticon:       { key: 'panopticon', name: 'Panopticon', era: 21, tech: 'Omnisurveillance', footprint: [1, 1], placement: 'land', special: 'reposition_enemies', effect: 'You may reposition ENEMY units freely during prep.' },
  death_star:       { key: 'death_star', name: 'Death Star', era: 24, tech: 'Planet Busting', footprint: [2, 2], placement: 'deepspace', special: 'vaporize_enemy', effect: 'Every 5 turns, instantly vaporize a random enemy; deals 5000 damage to Azazoth.' },
  ecumenopolis:     { key: 'ecumenopolis', name: 'Ecumenopolis', era: 25, tech: 'Mega Colonization', footprint: [1, 1], placement: 'planet', special: 'planet_yield_10x', effect: 'The planet tile yields 10× its terrain bonus.' },
}

/** Wonder def unlocked by a given advancement tech name, or null. */
export function wonderForTech(tech) {
  return Object.values(WONDER_DEFS).find((w) => w.tech === tech) ?? null
}
