// v4 tunables — TURN-BASED prototype (docs/turn-based-redesign.md).
//
// The game is turn-based: each End Turn resolves ONE round in the fixed order
// resolve units -> resolve resource gain -> resolve research, then the next
// wave is forecast onto the frontier. Prototype scope: 6 eras (Stone..
// Renaissance); completing ANY flavor's Renaissance ascendancy wins.
//
// One file for the balance knobs while we find out whether the loop is fun.

// --- Eras ------------------------------------------------------------------
export const ERA_NAMES = ['Stone', 'Bronze', 'Iron', 'Classical', 'Medieval', 'Renaissance']
export const ACTIVE_ERAS = ERA_NAMES.length // 6; ascendancy = era ACTIVE_ERAS-1

// --- Economy ---------------------------------------------------------------
export const STARTING_GOLD = 90
export const PALACE_START_POP = 8
export const CITY_START_POP = 2
export const CITY_MIN_SPACING = 3
export const CITY_YIELD_RADIUS = 1

// --- Palace / city as combat pieces ---------------------------------------
export const PALACE_MAX_HP = 220   // razing the palace ends the run
export const PALACE_ATK = 22
export const PALACE_RANGE = 2
export const CITY_ATTACK_RANGE = 1 // cities fight back once Culture grants atk

// --- City growth (food -> pop) --------------------------------------------
// A city banks harvested food; each new pop costs an escalating amount, so
// growth slows as a city gets big.
export const FOOD_BASE = 14
export const FOOD_GROWTH = 1.45     // threshold(pop) = FOOD_BASE * FOOD_GROWTH^pop

// --- Research (commit-a-lane) ----------------------------------------------
// One active flavor; progress income fills its current tech over several turns.
export const RESEARCH_BASE = 40
export const RESEARCH_GROWTH = 1.55 // cost(era) = RESEARCH_BASE * RESEARCH_GROWTH^era

// --- Build costs -----------------------------------------------------------
// Cost = base * COUNT_GROWTH^(living count of that exact type). Losing pieces
// makes their replacements cheap again (self-correcting, anti-death-spiral).
export const COUNT_GROWTH = 1.6
export const CITY_COST = 140
export const UNIT_COSTS = { melee: 45, ranged: 60, cavalry: 95, siege: 170, heavy: 130 }
// Wonders escalate on powers of two for a one-per feel.
export const WONDER_COUNT_GROWTH = 2

// --- Repair ----------------------------------------------------------------
export const REPAIR_PER_HP = 1.2    // gold to restore one HP of a damaged building

// --- Enemy escalation (by TURN, not by lane) -------------------------------
// Each turn spawns SPAWN_BASE * SPAWN_GROWTH^(turn-1) HP worth of enemies on
// the frontier; per-enemy stats also creep so late bodies are tanky.
export const SPAWN_BASE = 12
export const SPAWN_GROWTH = 1.12
export const ENEMY_HP_GROWTH = 1.05
export const ENEMY_ATK_PER_TURN = 0.7

// --- UI --------------------------------------------------------------------
export const TURN_ANIM_MS = 620     // input lock after End Turn so the round reads
