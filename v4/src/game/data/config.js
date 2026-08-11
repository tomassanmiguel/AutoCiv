// v4 tunables — ALL PLACEHOLDERS (docs/design.md §15). One file so the balance
// knobs live in one place while we find out whether the loop is fun.

// --- Economy ---------------------------------------------------------------
export const STARTING_GOLD = 120
export const PALACE_START_POP = 10
export const CITY_START_POP = 1
export const CITY_MIN_SPACING = 3       // min hex distance between any two cities/palace
export const CITY_YIELD_RADIUS = 1      // tiles a city harvests (disc); upgradeable to 3 later
export const MAX_CITY_YIELD_RADIUS = 3

// --- City / palace as combat pieces ---------------------------------------
export const CITY_BASE_DEF = 1          // city HP; raised by Culture + upgrades
export const PALACE_BASE_DEF = 200      // palace HP (much tougher — losing it ends the run)
export const PALACE_ATK = 18
export const PALACE_RANGE = 2

// --- Cooldowns (in ticks) — distinct per class is how speed reads on-board --
export const CITY_YIELD_CD = 15
export const PALACE_ATTACK_CD = 6

// --- Combat clock ----------------------------------------------------------
// The clock only runs during combat. A fractional accumulator in GameScreen
// advances the combat clock at SPEED_TPS[speed] ticks PER SECOND, so 'slow' can
// be genuinely slow (well under one tick per frame) and easy to read.
export const COMBAT_INTERVAL_MS = 55
export const SPEED_TPS = { paused: 0, slow: 2, normal: 6, fast: 14 }
export const DEFAULT_SPEED = 'fast'
// Safety cap so a stalemate (enemies walled out, player has no offense) can't
// loop forever — combat resolves as a survival if it runs this long.
export const COMBAT_MAX_TICKS = 1500
// End combat if nothing takes damage for this many ticks (a walled-off, unreachable
// enemy) — resolves the stalemate instead of letting the economy flood.
export const COMBAT_STALE_TICKS = 150

// --- Progress threshold ----------------------------------------------------
// Next advancement costs PROGRESS_BASE * TIER_GROWTH^(era of the last pick).
export const PROGRESS_BASE = 200
export const TIER_GROWTH = 1.6

// --- Build costs (prep, gold) ----------------------------------------------
export const CITY_COST = 60
export const UNIT_COSTS = { melee: 30, ranged: 40, cavalry: 45, naval: 45, aerial: 50, astral: 55 }

// --- Draft -----------------------------------------------------------------
export const DRAFT_CARDS = 3

// --- Combat details --------------------------------------------------------
export const BASE_CRIT_CHANCE = 0        // crit is a deferred ranged upgrade; off in v1
export const CRIT_MULT = 2

// --- Content scope ---------------------------------------------------------
// v1 ships 5 eras; the engine scales to 15 by data. A flavor is COMPLETE once it
// has taken its final-era advancement; all five complete = win.
export const ACTIVE_ERAS = 5
