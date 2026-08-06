// THE CONTENT SCHEMA — the contract for the content layer.
//
// Techs, buildings, wonders and tier unlocks are DATA (`content.json`), authored
// at /editor.html and read by the game.
//
// ---------------------------------------------------------------------------
// EFFECTS ARE A REGISTRY THAT GROWS ONE ENTRY AT A TIME
// ---------------------------------------------------------------------------
// An earlier version of this file carried a full structured-effect vocabulary —
// ~16 ops, targets, scales, filters, triggers, durations and 50 named rule keys —
// and every one of the 654 effects in the game was encoded against it. It was
// removed on purpose: expensive to author, hard to hold in your head, and it
// forced a decision about every mechanic long before any of them were built.
//
// `EFFECT_KINDS` below is NOT that language coming back. THE RULE IS:
//
//   an entry appears here only in the same change that writes the engine case
//   which consumes it (`GameManager._applyEffect`).
//
// If nothing in the engine reads a kind, it does not belong in this file. Every
// row still carries a written `description` for the player; the effects are what
// the game actually runs.

import { TERRAIN } from '../world/terrain.js'

/** The 15 eras. The index IS the era number, everywhere. */
export const ERAS = [
  'Stone', 'Bronze', 'Iron', 'Classical', 'Medieval', 'Renaissance',
  'Exploration', 'Steam', 'Modern', 'Information', 'Solar', 'Exodus',
  'Liminite', 'Galactic', 'Ascension',
]

/**
 * THREE branches, not four. Technology was folded into the other three: its
 * knowledge and pacing techs went to Society, its buildings and yields to
 * Economy, its weapons to Military.
 */
export const QUADRANTS = ['military', 'economy', 'society']

/**
 * How many techs a branch must take at era E before it advances to E+1. Each
 * branch advances on its OWN clock.
 *
 * ⚠️ The pool is CURRENT TIER ONLY — anything skipped is gone when the branch
 * moves on. So a branch-era cell must hold at least this many techs or the run
 * stalls there, and it wants a few more for the choice to mean anything.
 * `feasibility()` is what checks it.
 */
export const ADVANCE_THRESHOLDS = [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 7]
export const thresholdFor = (era) => ADVANCE_THRESHOLDS[era] ?? 0

/** How many advancements are offered at once. */
export const OFFER_SIZE = 3

/**
 * TIER UNLOCKS ARE VISIBILITY ONLY.
 *
 * One entry per era, granting the next notch of the map reveal ladder. They are
 * NOT per-branch: an entry fires when **any** branch reaches its era, so the
 * reveal follows your furthest track — a player who pushes Military hard still
 * sees the map open up.
 *
 *     revealEra = max(era of each branch)
 */
export const tierUnlockEra = (branchEras) => Math.max(0, ...branchEras)

/** The 15 notches of the map reveal ladder, mirroring `world/regions.js`. */
export const REVEAL_STAGES = [
  'local', 'nearby', 'distant', 'old_world', 'islands', 'new_world_coast',
  'full_earth', 'earth_and_space', 'moon', 'mars', 'deeper_space',
  'exo_coastline', 'full_exo', 'outer_galaxy', 'full_map',
]

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * The nine classes. ONE UNIT PER CLASS: there is no ladder of named units — a
 * class has a single stat line and the techs you take raise it, so every unit of
 * that class on the board improves together. "Create a melee unit" means *place
 * one more*.
 *
 * ⚠️ THE STAT LINES ARE CONTENT, not code: they live in `content.unitClasses`
 * and are authored at /editor.html. This array is only the canonical ORDER and
 * the set of legal keys.
 *
 * Some behaviour is INTRINSIC to a class and is never granted by a tech —
 * fortifications taunt and never move; command units never attack. That is
 * expressed as data too: a class that never moves simply has no movement
 * terrain.
 */
export const UNIT_CLASSES = [
  'melee', 'ranged', 'cavalry', 'siege', 'naval', 'aerial', 'astral',
  'command', 'fortification',
]

// ---------------------------------------------------------------------------
// Terrain — the vocabulary for placement and movement
// ---------------------------------------------------------------------------

/**
 * Every terrain, derived from the registry rather than re-listed. A second list
 * would drift the first time a terrain is added.
 */
export const TERRAIN_KEYS = Object.keys(TERRAIN)
export const terrainLabel = (k) => TERRAIN[k]?.name ?? k

const where = (fn) => TERRAIN_KEYS.filter((k) => fn(TERRAIN[k], k))
const has = (...keys) => keys.filter((k) => TERRAIN[k])

/**
 * SHORTCUTS for the terrain checklist. Each is just a set of terrain keys — a
 * group is a way to tick twelve boxes at once, never a thing stored on a row.
 * What gets saved is always the explicit list, so a group's definition can
 * change later without silently redefining content already authored against it.
 *
 * The first four are derived from the registry; the regional ones are listed,
 * because "which body is this" is not something the registry records.
 */
export const TERRAIN_GROUPS = {
  'Ground': where((d) => d.domain === 'land' && d.passable),
  'Water': where((d) => d.domain === 'water'),
  'Space': where((d) => d.domain === 'space'),
  'Impassable': where((d) => !d.passable),
  'Open void': has('space', 'deep_space', 'battlefield'),
  'Celestial bodies': has('asteroid', 'moon', 'lunar_crater', 'mars', 'mars_mountain', 'mars_ice', 'exomoon', 'planet', 'star', 'singularity'),
  'Earth': has('plains', 'forest', 'hills', 'desert', 'tundra', 'mountain', 'island', 'fallout', 'coast', 'ocean', 'river'),
  'Moon': has('moon', 'lunar_crater'),
  'Mars': has('mars', 'mars_mountain', 'mars_ice'),
  'Exoplanet': has('exoplains', 'exohills', 'exomountain', 'exodesert', 'exotundra', 'exosea'),
  'Outer galaxy': has('planet', 'star', 'singularity'),
}
export const TERRAIN_GROUP_NAMES = Object.keys(TERRAIN_GROUPS)

/**
 * REPOSITION DOMAINS — the terrain a "reposition across X" tech lets you cross
 * for free when measuring reposition range. A domain's tiles cost 0 range to
 * traverse, which is what makes (e.g.) the two coasts of an ocean "adjacent" for
 * a galleon. The keys are the options a `reposition_domain` effect may carry.
 */
/** The four threshold/economy resources a yield effect may target. */
export const RESOURCE_KEYS = ['food', 'production', 'gold', 'progress']

export const REPOSITION_DOMAINS = {
  water: 'Across water',
  space: 'Across space',
  deep_space: 'Across deep space',
}
export const REPOSITION_DOMAIN_KEYS = Object.keys(REPOSITION_DOMAINS)
export const REPOSITION_DOMAIN_TERRAINS = {
  water: new Set(where((d) => d.domain === 'water')),
  // Solar-system void and bodies.
  space: new Set(has('space', 'moon', 'lunar_crater', 'asteroid', 'mars', 'mars_ice', 'mars_mountain')),
  // The far void and what floats in it.
  deep_space: new Set(has('deep_space', 'exomoon', 'planet', 'star', 'singularity')),
}

/**
 * A new unit class. Stats are placeholders; a balance pass replaces them.
 *
 * ⚠️ `id` must be one of `UNIT_CLASSES` — the engine indexes units by class key,
 * so the id is not free text and the editor does not let you rename it.
 */
export const blankUnitClass = () => ({
  id: '', name: '', icon: '/sprites/ui/unit.png',
  atk: 5, def: 20, range: 1, speed: 1,
  placement: [...TERRAIN_GROUPS.Ground],
  movement: [...TERRAIN_GROUPS.Ground],
  description: '',
})

// ---------------------------------------------------------------------------
// Rules that shape how the written descriptions are to be read
// ---------------------------------------------------------------------------

/**
 * TWO LAYERS. Percentages are additive WITHIN a layer and multiplicative
 * BETWEEN them:
 *
 *     final = base × (1 + Σ base modifiers) × (1 + Σ modifiers)
 *
 * A BASE MODIFIER changes the quantity itself — "+25% base :attack:" makes the
 * unit's attack genuinely larger, so everything downstream sees the bigger
 * number. An ORDINARY MODIFIER is a bonus applied on top of whatever the base
 * has become.
 *
 * Within either layer, percentages ADD: +25% and +40% base is +65% base, never
 * ×1.25×1.40. A flat "+N" is folded into `base` before the first multiplier,
 * which is what makes a flat bonus combo with the percentages rather than being
 * washed out by them.
 */
export const YIELD_MODEL =
  'base × (1 + Σ base modifiers) × (1 + Σ modifiers); additive within a layer, multiplicative between'

/**
 * BONUSES STACK. THEY DO NOT REPLACE. Bronze Working (+3), Iron Working (+6) and
 * Steel (+12) leave a unit at +21 attack. There is no tier system anywhere.
 */
export const EVERYTHING_STACKS = true

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/** Icons a row may carry. */
export const ICONS = [
  '/sprites/ui/melee.png', '/sprites/ui/ranged.png', '/sprites/ui/cavalry.png',
  '/sprites/ui/siege.png', '/sprites/ui/boat.png', '/sprites/ui/aerial.png',
  '/sprites/ui/astral.png', '/sprites/ui/defense.png', '/sprites/ui/utility.png',
  '/sprites/ui/building.png', '/sprites/ui/utility-building.png',
  '/sprites/ui/wonder.png', '/sprites/ui/policy.png', '/sprites/ui/pop.png',
  '/sprites/ui/trap.png', '/sprites/ui/unit.png',
  '/sprites/ui/food.png', '/sprites/ui/gold.png', '/sprites/ui/production.png',
  '/sprites/ui/progress.png', '/sprites/icons/attack.png',
  '/sprites/icons/defense.png', '/sprites/icons/range.png', '/sprites/icons/speed.png',
  '/sprites/icons/crit.png',
]

// ---------------------------------------------------------------------------
// The effect registry
// ---------------------------------------------------------------------------

/**
 * Every mechanic the engine can currently run, keyed by `kind`.
 *
 * `params` drives the editor's inputs — there is no bespoke form per kind — and
 * `describe` renders the effect back as a sentence so an author can see whether
 * the written description still says what the row actually does.
 *
 * ⚠️ Read the note at the top of this file before adding to it.
 */
export const EFFECT_KINDS = {
  unit_atk_base_pct: {
    // `label` renders inside a <select>, which cannot hold an icon — so it is
    // plain words. `:token:` markup belongs in `hint` and `describe`.
    label: 'All units — base attack %',
    hint: 'A BASE MODIFIER: it raises every unit\'s base :attack: itself, so a Siege unit gains far more than a Ranged one and the classes keep their identity into the late game. Base modifiers add together, then the whole base is multiplied by the ordinary modifiers — see :attack: in the stat pipeline. Anything that adds flat :attack: (on a kill, from a building) is folded into the base FIRST, so it is multiplied by these too.',
    params: [{ key: 'amount', label: 'Percent', min: 0, default: 25 }],
    describe: (e) => `+${e.amount ?? 0}% base :attack: to all units.`,
  },

  unit_def_base_pct: {
    label: 'All units — base defence %',
    hint: 'The :defense: mirror of the base-attack modifier. Raises every unit\'s base :defense: — which IS its hit points — so a Fortification gains far more than a Ranged unit. Base modifiers add together, then the whole base is multiplied by the ordinary modifiers.',
    params: [{ key: 'amount', label: 'Percent', min: 0, default: 25 }],
    describe: (e) => `+${e.amount ?? 0}% base :defense: to all units.`,
  },

  unit_crit_chance_pct: {
    label: 'All units — crit chance %',
    hint: 'Chance for a unit\'s attack to CRIT and deal double damage. A single flat dial: chances from every tech ADD (no base/ordinary layering), and the crit multiplier itself is a fixed engine constant no tech touches. Capped at 100%.',
    params: [{ key: 'amount', label: 'Percent', min: 0, default: 10 }],
    describe: (e) => `+${e.amount ?? 0}% :crit: chance to all units.`,
  },

  grant_unit: {
    label: 'Grant units of a class',
    hint: 'Queues units to place on the map. The CLASS is what is granted, not a named unit — which unit it becomes is resolved at placement time from the best one you have unlocked, so a grant queued before an upgrade still benefits from it.',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'melee' },
      { key: 'count', label: 'How many', min: 1, default: 1 },
    ],
    describe: (e) => {
      const n = e.count ?? 1
      return `Grants ${n} :${e.unitClass === 'fortification' ? 'fort' : e.unitClass}: unit${n === 1 ? '' : 's'} to place.`
    },
  },

  // --- repositioning ---------------------------------------------------------
  // Troops cannot be repositioned for free by default — you pay :gold: scaling
  // with distance. These effects buy free distance, free crossings, and cheaper
  // moves. See docs/design.md § Repositioning.
  reposition_range: {
    label: 'Reposition range',
    hint: 'Free reposition distance during the prep phase: a unit may be moved this many tiles for no :gold:, and beyond it you pay for each extra tile. Stacks across techs.',
    params: [{ key: 'amount', label: 'Tiles', min: 0, default: 1 }],
    describe: (e) => `+${e.amount ?? 0} reposition range.`,
  },

  reposition_domain: {
    label: 'Reposition across a domain',
    hint: 'Makes a whole terrain domain FREE to cross when measuring reposition range — its tiles cost 0. "Across water" makes the far coast of an ocean effectively adjacent. You still have to END on a tile your class can occupy.',
    params: [{ key: 'domain', label: 'Domain', options: REPOSITION_DOMAIN_KEYS, default: 'water' }],
    describe: (e) => `Reposition ${REPOSITION_DOMAINS[e?.domain] ? REPOSITION_DOMAINS[e.domain].toLowerCase() : `across ${e?.domain}`} for free.`,
  },

  reposition_cost: {
    label: 'Reposition cost reduction',
    hint: 'Cuts the :gold: cost of repositioning beyond your free range. Reductions add together and clamp — repositioning never becomes free this way, only cheaper. Needs some reposition range to matter.',
    params: [{ key: 'pct', label: 'Percent off', min: 0, default: 50 }],
    describe: (e) => `Repositioning costs ${e.pct ?? 0}% less :gold:.`,
  },

  unit_speed: {
    label: 'All units — +speed',
    hint: 'Adds combat movement (:speed:) to every unit that can move. Classes that never move (walls, ranged) are unaffected — an extra step means nothing without movement terrain.',
    params: [{ key: 'amount', label: 'Speed', min: 0, default: 1 }],
    describe: (e) => `+${e.amount ?? 0} :speed: to all units.`,
  },

  reposition_teleport: {
    label: 'Reposition ignores obstacles',
    hint: 'Reposition distance becomes straight-line — obstacles and terrain no longer lengthen a move. A unit hops directly to the target within range.',
    params: [],
    describe: () => 'Repositioning ignores intervening terrain (straight-line distance).',
  },

  // --- formations ------------------------------------------------------------
  formation: {
    label: 'Formation bonus',
    hint: 'At combat start, each unit gains flat :attack: and :defense: for every OTHER friendly unit inside its reposition range. A per-unit flat, folded into the base before the percentage lines — so a tight cluster is worth more than the numbers look.',
    params: [
      { key: 'atk', label: 'Atk each', min: 0, default: 2 },
      { key: 'def', label: 'Def each', min: 0, default: 2 },
    ],
    describe: (e) => `+${e.atk ?? 0} :attack: / +${e.def ?? 0} :defense: per friendly unit in reposition range.`,
  },

  // --- road network ----------------------------------------------------------
  road_network: {
    label: 'Road network — connection gold',
    hint: 'Raises the :gold: every tile ON a city-connection route earns (a base modifier, so an outpost doubles it). Cities connect automatically; this only makes the routes richer. Maglev\'s rider also gives each route tile :production: equal to its :gold:.',
    params: [
      { key: 'gold', label: 'Gold', min: 0, default: 1 },
      { key: 'prodFromGold', label: '+production = its gold', type: 'bool', default: false },
    ],
    describe: (e) =>
      `Connection tiles earn +${e.gold ?? 0} base :gold:` +
      (e.prodFromGold ? ', and :production: equal to their :gold:.' : '.'),
  },

  // --- ranged theme: poison --------------------------------------------------
  // Poison is a per-unit stack counter on the poisoned unit; on its own beat,
  // before it acts, it takes 1 damage per stack. Stacks add across sources.
  ranged_poison_apply: {
    label: 'Ranged — apply poison',
    hint: 'A :ranged: unit\'s attack applies this many :poison: stacks to its target. Stacks add up; a poisoned unit takes 1 damage per stack at the start of its own turn.',
    params: [{ key: 'amount', label: 'Stacks', min: 0, default: 1 }],
    describe: (e) => `:ranged: attacks apply +${e.amount ?? 0} :poison:.`,
  },
  ranged_poison_slow: {
    label: 'Ranged — poison slows',
    hint: 'A :ranged: attack also cuts the target\'s :speed:, down to a floor.',
    params: [
      { key: 'amount', label: 'Speed −', min: 0, default: 1 },
      { key: 'min', label: 'Floor', min: 0, default: 1 },
    ],
    describe: (e) => `:ranged: attacks reduce target :speed: by ${e.amount ?? 0} (floor ${e.min ?? 0}).`,
  },
  poison_spread_on_apply: {
    label: 'Poison spreads on apply',
    hint: 'When :poison: is applied, a random enemy adjacent to the target also gains stacks.',
    params: [{ key: 'amount', label: 'Stacks', min: 0, default: 1 }],
    describe: (e) => `On :poison: applying, a random adjacent enemy gains +${e.amount ?? 0} :poison:.`,
  },
  poison_damage_mult: {
    label: 'Poison damage ×',
    hint: 'Multiplies the damage each :poison: stack deals per tick. Multiple techs multiply.',
    params: [{ key: 'amount', label: 'Multiplier', min: 1, default: 2 }],
    describe: (e) => `:poison: tick damage ×${e.amount ?? 1}.`,
  },
  poison_bonus_stacks_on_apply: {
    label: 'Poison escalates on apply',
    hint: 'Each time a unit applies :poison:, the amount IT applies grows by this much for the rest of the combat — 5, then 10, then 15, and so on.',
    params: [{ key: 'amount', label: 'Growth', min: 0, default: 5 }],
    describe: (e) => `Each :poison: application grows the applied amount by ${e.amount ?? 0}.`,
  },

  // --- ranged theme: fortification synergy -----------------------------------
  fort_def_pct_per_adjacent_ranged: {
    label: 'Fort +def per adjacent ranged',
    hint: 'A :fort: fortification gains a % of :defense: for each adjacent :ranged: unit, measured at combat start.',
    params: [{ key: 'amount', label: 'Percent', min: 0, default: 10 }],
    describe: (e) => `:fort: gains +${e.amount ?? 0}% :defense: per adjacent :ranged: unit.`,
  },
  ranged_range_bonus_adjacent_fort: {
    label: 'Ranged +range near a fort',
    hint: 'A :ranged: unit adjacent to a :fort: fortification gains range.',
    params: [{ key: 'amount', label: 'Range', min: 0, default: 1 }],
    describe: (e) => `:ranged: units adjacent to a :fort: gain +${e.amount ?? 0} :range:.`,
  },

  // --- ranged theme: preloaded shots -----------------------------------------
  // A per-unit banked-shot counter. A ranged unit discharges all banked shots as
  // extra hits when it attacks.
  ranged_preload_start: {
    label: 'Ranged — preload at start',
    hint: 'Each :ranged: unit begins combat with this many banked shots, fired as extra hits on its first attack.',
    params: [{ key: 'amount', label: 'Shots', min: 0, default: 1 }],
    describe: (e) => `:ranged: units start combat with +${e.amount ?? 0} preloaded shots.`,
  },
  ranged_preload_start_per_adjacent_ranged: {
    label: 'Ranged — preload per adjacent ranged',
    hint: 'Banked shots at combat start, one lot per OTHER adjacent :ranged: unit.',
    params: [{ key: 'amount', label: 'Shots each', min: 0, default: 1 }],
    describe: (e) => `:ranged: units start with +${e.amount ?? 0} preloaded shots per adjacent :ranged: unit.`,
  },
  ranged_preload_on_crit: {
    label: 'Ranged — preload on crit',
    hint: 'A :ranged: unit banks a shot whenever it crits (preloaded shots do not themselves trigger this).',
    params: [{ key: 'amount', label: 'Shots', min: 0, default: 1 }],
    describe: (e) => `:ranged: units bank +${e.amount ?? 0} shot on a :crit:.`,
  },
  ranged_preload_per_idle_turn: {
    label: 'Ranged — preload when idle',
    hint: 'A :ranged: unit banks a shot on any turn it has no enemy in range.',
    params: [{ key: 'amount', label: 'Shots', min: 0, default: 1 }],
    describe: (e) => `:ranged: units bank +${e.amount ?? 0} shot on a turn with nothing in range.`,
  },

  // --- ranged theme: range & placement ---------------------------------------
  ranged_range_flat: {
    label: 'Ranged +range',
    hint: 'Flat :range: on every :ranged: unit. Stacks.',
    params: [{ key: 'amount', label: 'Range', min: 0, default: 1 }],
    describe: (e) => `:ranged: units gain +${e.amount ?? 0} :range:.`,
  },
  ranged_range_per_stationary_combats: {
    label: 'Ranged +range while dug in',
    hint: 'A :ranged: unit gains range for every N combats it goes without being repositioned. Repositioning resets the count.',
    params: [
      { key: 'amount', label: 'Range', min: 0, default: 1 },
      { key: 'combats', label: 'Per N combats', min: 1, default: 4 },
    ],
    describe: (e) => `:ranged: units gain +${e.amount ?? 0} :range: every ${e.combats ?? 1} combats not repositioned.`,
  },
  ranged_range_infinite_on_terrain: {
    label: 'Ranged — infinite range on terrain',
    hint: 'A :ranged: unit standing on the chosen terrain has unlimited range.',
    params: [{ key: 'terrain', label: 'Terrain', options: TERRAIN_KEYS, default: 'star' }],
    describe: (e) => `:ranged: units on ${terrainLabel(e?.terrain)} have infinite :range:.`,
  },
  class_placement_terrain_add: {
    label: 'Class may stand on terrain',
    hint: 'Adds a terrain to a class\'s placement set, so a unit of that class may be created there.',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'ranged' },
      { key: 'terrain', label: 'Terrain', options: TERRAIN_KEYS, default: 'star' },
    ],
    describe: (e) => `:${e?.unitClass === 'fortification' ? 'fort' : e?.unitClass}: units may be placed on ${terrainLabel(e?.terrain)}.`,
  },

  // --- ranged theme: shot chaining -------------------------------------------
  ranged_chain_flat: {
    label: 'Ranged +shot chains',
    hint: 'After its primary hit, a :ranged: unit chains to the lowest-HP enemy still in range this many extra times (each at half the previous hit\'s damage, unless falloff is removed).',
    params: [{ key: 'amount', label: 'Chains', min: 0, default: 1 }],
    describe: (e) => `:ranged: attacks chain +${e.amount ?? 0} more times.`,
  },
  ranged_chain_remove_falloff: {
    label: 'Ranged — chains keep full damage',
    hint: 'Removes the 50%-per-chain damage falloff: every chained hit deals full damage.',
    params: [],
    describe: () => ':ranged: shot chains no longer lose damage.',
  },

  // --- ranged theme: class-scoped crit & earned stats ------------------------
  class_crit_chance_pct: {
    label: 'Class — crit chance %',
    hint: 'Like the universal crit-chance dial, but scoped to one unit class. Adds flat, capped at 100% with the base and any universal chance.',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'ranged' },
      { key: 'amount', label: 'Percent', min: 0, default: 5 },
    ],
    describe: (e) => `+${e.amount ?? 0}% :crit: chance to :${e?.unitClass === 'fortification' ? 'fort' : e?.unitClass}: units.`,
  },
  gold_on_class_crit_pct: {
    label: 'Class — gold on crit',
    hint: 'When a unit of the class crits, gain :gold: equal to a % of the damage that crit dealt.',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'ranged' },
      { key: 'amount', label: 'Percent of dmg', min: 0, default: 100 },
    ],
    describe: (e) => `On a :${e?.unitClass === 'fortification' ? 'fort' : e?.unitClass}: :crit:, gain :gold: = ${e.amount ?? 0}% of the damage.`,
  },
  unit_atk_earned_on_class_crit: {
    label: 'Class — permanent atk on crit',
    hint: 'When a unit of the class crits, it PERMANENTLY gains flat :attack: (kept across combats). Sits in the earned-flat stat slot, between the base-% and ordinary-% layers.',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'ranged' },
      { key: 'amount', label: 'Attack', min: 0, default: 1 },
    ],
    describe: (e) => `A :${e?.unitClass === 'fortification' ? 'fort' : e?.unitClass}: unit permanently gains +${e.amount ?? 0} :attack: on a :crit:.`,
  },

  // --- fortification theme ---------------------------------------------------
  class_def_flat: {
    label: 'Class — flat base defence',
    hint: 'Adds raw flat :defense: to one class\'s base, folded in before the base-% layer so it STACKS with %-based def rather than being swallowed. :defense: is hit points.',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'fortification' },
      { key: 'amount', label: 'Defence', min: 0, default: 3 },
    ],
    describe: (e) => `+${e.amount ?? 0} raw base :defense: to :${e?.unitClass === 'fortification' ? 'fort' : e?.unitClass}: units.`,
  },
  class_taunt_range_flat: {
    label: 'Class — +taunt range',
    hint: 'Increases a class\'s taunt range — how far it pulls enemies onto itself. Fortifications taunt intrinsically (base range 2).',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'fortification' },
      { key: 'amount', label: 'Taunt range', min: 0, default: 1 },
    ],
    describe: (e) => `+${e.amount ?? 0} taunt :range: to :${e?.unitClass === 'fortification' ? 'fort' : e?.unitClass}: units.`,
  },
  class_taunt_range_bonus_on_terrain: {
    label: 'Class — +taunt range on terrain',
    hint: 'Extra taunt range while a unit of the class stands on the chosen terrain.',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'fortification' },
      { key: 'terrain', label: 'Terrain', options: TERRAIN_KEYS, default: 'space' },
      { key: 'amount', label: 'Taunt range', min: 0, default: 5 },
    ],
    describe: (e) => `:${e?.unitClass === 'fortification' ? 'fort' : e?.unitClass}: units on ${terrainLabel(e?.terrain)} gain +${e.amount ?? 0} taunt :range:.`,
  },
  retaliate_flat_damage_on_class_attacked: {
    label: 'Class — retaliate when attacked',
    hint: 'Whenever a unit of the class is attacked, the attacker takes this much flat damage back. Additive across every tech of this kind held.',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'fortification' },
      { key: 'amount', label: 'Damage', min: 0, default: 10 },
    ],
    describe: (e) => `Attacking a :${e?.unitClass === 'fortification' ? 'fort' : e?.unitClass}: deals ${e.amount ?? 0} damage back to the attacker.`,
  },
  building_effect_level_bonus_adjacent_to_class: {
    label: 'Class — +building effect level nearby',
    hint: 'Buildings adjacent to a unit of the class gain effect levels; each effect level scales the building\'s magnitudes by +25% (additive, on top of paid upgrade levels).',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'fortification' },
      { key: 'amount', label: 'Effect levels', min: 0, default: 1 },
    ],
    describe: (e) => `Buildings adjacent to a :${e?.unitClass === 'fortification' ? 'fort' : e?.unitClass}: gain +${e.amount ?? 0} effect level.`,
  },
  class_self_tile_yield_bonus: {
    label: 'Class — +yield to its own tile',
    hint: 'A unit of the class adds a flat resource to the yield of the tile it stands on (the unit equivalent of a building\'s self-tile bonus).',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'fortification' },
      { key: 'resource', label: 'Resource', options: RESOURCE_KEYS, default: 'food' },
      { key: 'amount', label: 'Amount', default: 3 },
    ],
    describe: (e) => `A tile with a :${e?.unitClass === 'fortification' ? 'fort' : e?.unitClass}: on it produces +${e.amount ?? 0} :${e.resource}:.`,
  },
  end_of_combat_def_earned_for_class_and_adjacent: {
    label: 'Class — earned defence at combat end',
    hint: 'At the end of each combat, every unit of the class AND every unit adjacent to one permanently gains flat :defense: (kept across combats, in the earned-flat slot).',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'fortification' },
      { key: 'amount', label: 'Defence', min: 0, default: 4 },
    ],
    describe: (e) => `At combat end, :${e?.unitClass === 'fortification' ? 'fort' : e?.unitClass}: units and their neighbours permanently gain +${e.amount ?? 0} :defense:.`,
  },
  class_gains_pct_of_commander_effect: {
    label: 'Class — share of commander effect (STUB)',
    hint: 'A unit of the class gains a % of a commander\'s effect. Commander units do not exist yet, so this is WIRED BUT INERT until they land.',
    params: [
      { key: 'unitClass', label: 'Class', options: UNIT_CLASSES, default: 'fortification' },
      { key: 'pct', label: 'Percent', min: 0, default: 25 },
    ],
    describe: (e) => `:${e?.unitClass === 'fortification' ? 'fort' : e?.unitClass}: units gain ${e.pct ?? 0}% of a commander's effect (not yet active).`,
  },

  // --- buildings -------------------------------------------------------------
  // A TECH effect: queue a specific building for placement (mirrors grant_unit,
  // but for a named building id rather than a class).
  grant_building: {
    label: 'Grant a building',
    hint: 'Unlocks a building and queues one to place on the map, respecting that building\'s placement rules.',
    params: [{ key: 'buildingId', label: 'Building', type: 'building', default: '' }],
    describe: (e) => `Grants the ${e.buildingId || '—'} :building: to place.`,
  },

  // The rest are BUILDING effects — continuously active, they modify tile yields
  // which then feed the normal per-tick accrual. See docs/design.md § Buildings.
  self_tile_yield_bonus: {
    label: 'Building — +yield to own tile',
    hint: 'A flat resource bonus to the tile the building stands on.',
    params: [
      { key: 'resource', label: 'Resource', options: RESOURCE_KEYS, default: 'progress' },
      { key: 'amount', label: 'Amount', default: 3 },
    ],
    describe: (e) => `+${e.amount ?? 0} :${e.resource}: to its own tile.`,
  },
  radius_tile_yield_bonus: {
    label: 'Building — +yield in radius',
    hint: 'A flat bonus to each tile within a radius, optionally only tiles of one terrain and/or tiles with a unit on them.',
    params: [
      { key: 'resource', label: 'Resource', options: RESOURCE_KEYS, default: 'progress' },
      { key: 'amount', label: 'Amount', default: 1 },
      { key: 'radius', label: 'Radius', min: 0, default: 1 },
      { key: 'terrainFilter', label: 'Terrain (any if blank)', options: ['', ...TERRAIN_KEYS], default: '', optional: true },
      { key: 'hasUnitFilter', label: 'Only tiles with a unit', type: 'bool', default: false, optional: true },
    ],
    describe: (e) => `+${e.amount ?? 0} :${e.resource}: to each tile in range ${e.radius ?? 0}` +
      (e.terrainFilter ? ` (${terrainLabel(e.terrainFilter)} only)` : '') +
      (e.hasUnitFilter ? ' with a unit on it' : '') + '.',
  },
  radius_city_yield_bonus_per_citizen: {
    label: 'Building — +yield to cities in radius',
    hint: 'Each city in radius gains a flat amount plus a per-citizen amount times its population.',
    params: [
      { key: 'resource', label: 'Resource', options: RESOURCE_KEYS, default: 'progress' },
      { key: 'flatAmount', label: 'Flat', default: 1 },
      { key: 'perCitizen', label: 'Per citizen', default: 1 },
      { key: 'radius', label: 'Radius', min: 0, default: 1 },
    ],
    describe: (e) => `Each city in range ${e.radius ?? 0} gains +${e.flatAmount ?? 0} :${e.resource}:, plus +${e.perCitizen ?? 0} per citizen.`,
  },
  yield_growth_per_wave_survived: {
    label: 'Building — grows per wave survived',
    hint: 'The building\'s own-tile bonus grows by this much for each wave it survives, optionally resetting to 0 if it is razed.',
    params: [
      { key: 'resource', label: 'Resource', options: RESOURCE_KEYS, default: 'progress' },
      { key: 'amount', label: 'Per wave', default: 2 },
      { key: 'resetOnRaze', label: 'Reset on raze', type: 'bool', default: true, optional: true },
    ],
    describe: (e) => `Its own tile gains +${e.amount ?? 0} :${e.resource}: per wave survived${e.resetOnRaze ? ' (resets if razed)' : ''}.`,
  },
  yield_growth_per_nearby_unit_death: {
    label: 'Building — grows per nearby death',
    hint: 'The own-tile bonus PERMANENTLY grows each time a unit dies in radius — any side, friendly or enemy. Optionally multiplied when the building sits in the New World.',
    params: [
      { key: 'resource', label: 'Resource', options: RESOURCE_KEYS, default: 'progress' },
      { key: 'amount', label: 'Per death', default: 1 },
      { key: 'radius', label: 'Radius', min: 0, default: 4 },
      { key: 'includeEnemies', label: 'Count enemy deaths', type: 'bool', default: true, optional: true },
      { key: 'newWorldMultiplier', label: 'New World ×', min: 1, default: 2, optional: true },
    ],
    describe: (e) => `Permanently +${e.amount ?? 0} :${e.resource}: to its own tile per unit death in range ${e.radius ?? 0}` +
      (e.newWorldMultiplier > 1 ? ` (×${e.newWorldMultiplier} in the New World)` : '') + '.',
  },
  radius_yield_bonus_per_building_age: {
    label: 'Building — +yield per building age in radius',
    hint: 'Each building in radius gains, to its own tile, an amount times how many eras have passed since it was built.',
    params: [
      { key: 'resource', label: 'Resource', options: RESOURCE_KEYS, default: 'progress' },
      { key: 'amount', label: 'Per era', default: 1 },
      { key: 'radius', label: 'Radius', min: 0, default: 2 },
    ],
    describe: (e) => `Every building in range ${e.radius ?? 0} gains +${e.amount ?? 0} :${e.resource}: per era since it was built.`,
  },
  self_yield_bonus_per_distance_to_nearest_building: {
    label: 'Building — +yield per distance to nearest building',
    hint: 'The own-tile bonus scales with how far this building is from the nearest OTHER building — isolation is the reward.',
    params: [
      { key: 'resource', label: 'Resource', options: RESOURCE_KEYS, default: 'progress' },
      { key: 'perTile', label: 'Per tile', default: 15 },
    ],
    describe: (e) => `+${e.perTile ?? 0} :${e.resource}: to its own tile per tile of distance to the nearest other building.`,
  },
  radius_yield_from_other_base_yields: {
    label: 'Building — progress from other base yields',
    hint: 'Each tile in radius gains :progress: equal to the sum of its OTHER base yields (food + production + gold).',
    params: [{ key: 'radius', label: 'Radius', min: 0, default: 1 }],
    describe: (e) => `Each tile in range ${e.radius ?? 0} gains :progress: equal to its other base yields.`,
  },
}
export const EFFECT_KEYS = Object.keys(EFFECT_KINDS)

/** A new effect row, with each param at its declared default. */
export const blankEffect = (kind = EFFECT_KEYS[0]) => {
  const out = { kind }
  for (const p of EFFECT_KINDS[kind]?.params ?? []) out[p.key] = p.default
  return out
}

export const describeEffect = (e) =>
  EFFECT_KINDS[e?.kind]?.describe(e) ?? `⚠ unknown effect "${e?.kind}"`

/** Everything a row does, as one line — the editor's drift check. */
export const describeEffects = (row) =>
  (row?.effects ?? []).map(describeEffect).join(' ')

/**
 * `:token:` markup for descriptions. Write ":gold:" in a description and it
 * renders as the icon — the project's rule is icons over words for resources,
 * stats and unit classes. Mirrors `components/common/IconText.jsx`.
 */
export const ICON_TOKENS = {
  food: '/sprites/icons/food.png',
  gold: '/sprites/icons/gold.png',
  production: '/sprites/icons/production.png',
  progress: '/sprites/icons/progress.png',
  attack: '/sprites/icons/attack.png',
  defense: '/sprites/icons/defense.png',
  speed: '/sprites/icons/speed.png',
  range: '/sprites/icons/range.png',
  crit: '/sprites/icons/crit.png',
  poison: '/sprites/ui/trap.png',    // placeholder — no dedicated poison icon yet
  melee: '/sprites/ui/melee.png',
  ranged: '/sprites/ui/ranged.png',
  cavalry: '/sprites/ui/cavalry.png',
  siege: '/sprites/ui/siege.png',
  naval: '/sprites/ui/boat.png',
  aerial: '/sprites/ui/aerial.png',
  astral: '/sprites/ui/astral.png',
  utility: '/sprites/ui/utility.png',
  fort: '/sprites/ui/defense.png',
  policy: '/sprites/ui/policy.png',
  pop: '/sprites/ui/pop.png',
  building: '/sprites/ui/building.png',
  wonder: '/sprites/ui/wonder.png',
  road: '/sprites/ui/utility-building.png',
}
export const ICON_TOKEN_KEYS = Object.keys(ICON_TOKENS)

/** `:token:`s in a string that aren't in the map — i.e. typos in a description. */
export const unknownTokens = (text) =>
  [...String(text ?? '').matchAll(/:([a-z_]+):/g)]
    .map((m) => m[1])
    .filter((t) => !ICON_TOKENS[t])

// ---------------------------------------------------------------------------
// Placement — multi-select, because the rules compose
// ---------------------------------------------------------------------------
export const PLACEMENTS = {
  land: 'Land only',
  water: 'Water only',
  coast: 'Coastal only',
  coast_no_ocean: 'Coast not adjacent to open ocean',
  mountain: 'Mountains only',
  desert: 'Desert only',
  tundra: 'Tundra only',
  hills: 'Hills only',
  city: 'On a city',
  adjacent_city: 'Adjacent to a city',
  between_mountain_city: 'Between a mountain and a city',
  new_world: 'The New World',
  off_earth: 'Off Earth',
  moon_or_mars: 'The Moon or Mars',
  exoplanet: 'The exoplanet',
  space: 'Open space',
  adjacent_planet: 'Adjacent to a planetary tile',
  singularity: 'On a singularity',
}
export const PLACEMENT_KEYS = Object.keys(PLACEMENTS)

/** Wonder tiers — a grouping and a rough power band, not the era ladder. */
export const WONDER_TIERS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']

// ---------------------------------------------------------------------------
// Blank rows
// ---------------------------------------------------------------------------

export const blankTech = () => ({
  id: '', name: '', quadrant: 'military', era: 0,
  icon: '/sprites/ui/policy.png', description: '', effects: [], requires: [], group: '',
})

export const blankBuilding = () => ({
  id: '', name: '', era: 0, placement: [],
  icon: '/sprites/ui/building.png', unlockedBy: '', description: '', effects: [],
})

/** A wonder is a tech that a :production: threshold builds — so it has both. */
export const blankWonder = () => ({
  id: '', name: '', tier: 'I', quadrant: 'economy', era: 0, placement: [],
  icon: '/sprites/ui/wonder.png', description: '', effects: [], requires: [], group: '',
})

export const blankTierUnlock = () => ({
  id: '', name: '', era: 0, icon: '/sprites/ui/utility.png', description: '',
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Structural problems across the whole dataset. */
export function validateContent(content) {
  const out = []
  const ids = new Set()
  const draftable = [...(content.techs ?? []), ...(content.wonders ?? [])]

  for (const t of content.techs ?? []) {
    if (!t.id) out.push(`tech "${t.name}" has no id`)
    else if (ids.has(t.id)) out.push(`duplicate tech id "${t.id}"`)
    ids.add(t.id)
    if (!QUADRANTS.includes(t.quadrant)) out.push(`${t.id}: unknown branch "${t.quadrant}"`)
    if (!(t.era >= 0 && t.era < ERAS.length)) out.push(`${t.id}: era ${t.era} out of range`)
    if (!t.description?.trim()) out.push(`${t.id}: has no description`)
  }

  // A dependency must exist, and must NOT be in a later era — with a
  // current-tier-only pool, a later prerequisite can never be met.
  const byId = new Map(draftable.map((t) => [t.id, t]))
  for (const t of draftable) {
    for (const r of t.requires ?? []) {
      const dep = byId.get(r)
      if (!dep) { out.push(`${t.id}: requires unknown "${r}"`); continue }
      if (dep.era > t.era) out.push(`${t.id}: requires "${r}" from a LATER era (${ERAS[dep.era]} > ${ERAS[t.era]}) — unreachable`)
    }
  }

  // A GROUP is a set of mutually exclusive techs: take one and the rest are shut
  // out for the run. They must be offerable against each other, which means the
  // same branch and the same era — otherwise the choice is never presented.
  const groups = new Map()
  for (const t of draftable) {
    if (!t.group) continue
    if (!groups.has(t.group)) groups.set(t.group, [])
    groups.get(t.group).push(t)
  }
  for (const [name, members] of groups) {
    if (members.length < 2) { out.push(`group "${name}" has only one member — a group of one is not a choice`); continue }
    if (new Set(members.map((m) => m.quadrant)).size > 1 || new Set(members.map((m) => m.era)).size > 1) {
      out.push(`group "${name}" spans pools (${members.map((m) => `${m.name}:${m.quadrant}/${ERAS[m.era]}`).join(', ')}) — the choice can never be offered`)
    }
  }

  // An effect the engine cannot run is worse than no effect: the row reads as
  // wired, is drafted like it works, and silently does nothing.
  for (const row of [...draftable, ...(content.buildings ?? [])]) {
    if (row.effects && !Array.isArray(row.effects)) { out.push(`${row.id}: effects must be a list`); continue }
    for (const e of row.effects ?? []) {
      const spec = EFFECT_KINDS[e?.kind]
      if (!spec) { out.push(`${row.id}: unknown effect kind "${e?.kind}" — nothing in the engine runs it`); continue }
      const buildingIds = new Set((content.buildings ?? []).map((b) => b.id))
      for (const p of spec.params) {
        // An OPTIONAL param may be absent; validate only when present.
        if (p.optional && e[p.key] === undefined) continue
        // Param shapes: bool, a `building` id, an `options` choice, or a number.
        if (p.type === 'bool') {
          if (typeof e[p.key] !== 'boolean') out.push(`${row.id}: effect ${e.kind} needs true/false for "${p.key}"`)
        } else if (p.type === 'building') {
          if (!buildingIds.has(e[p.key])) out.push(`${row.id}: effect ${e.kind} names building "${e[p.key]}" which does not exist`)
        } else if (p.options) {
          if (!p.options.includes(e[p.key])) {
            out.push(`${row.id}: effect ${e.kind} has "${p.key}" = "${e[p.key]}" — must be one of ${p.options.join(', ')}`)
          }
        } else if (!Number.isFinite(e[p.key])) {
          out.push(`${row.id}: effect ${e.kind} needs a number for "${p.key}"`)
        }
      }
    }
  }

  const badPlacement = (p, where) => {
    if (!Array.isArray(p)) { out.push(`${where}: placement must be a list`); return }
    for (const k of p) if (!PLACEMENTS[k]) out.push(`${where}: unknown placement "${k}"`)
  }
  for (const b of content.buildings ?? []) {
    badPlacement(b.placement, `building ${b.id}`)
    if (!b.description?.trim()) out.push(`building ${b.id}: has no description`)
  }
  for (const w of content.wonders ?? []) {
    if (!WONDER_TIERS.includes(w.tier)) out.push(`wonder ${w.id}: unknown tier "${w.tier}"`)
    if (!QUADRANTS.includes(w.quadrant)) out.push(`wonder ${w.id}: unknown branch "${w.quadrant}"`)
    badPlacement(w.placement, `wonder ${w.id}`)
    if (!w.description?.trim()) out.push(`wonder ${w.id}: has no description`)
  }
  for (const t of content.tierUnlocks ?? []) {
    if (!(t.era >= 0 && t.era < ERAS.length)) out.push(`tier unlock ${t.id}: era ${t.era} out of range`)
  }

  // --- unit classes ---------------------------------------------------------
  // Every class in UNIT_CLASSES must exist exactly once: the engine indexes
  // units BY CLASS KEY, so a missing one is a grant that resolves to nothing.
  const classes = content.unitClasses ?? []
  const seenClass = new Set()
  for (const c of classes) {
    if (!UNIT_CLASSES.includes(c.id)) { out.push(`unit class "${c.id}" is not one of ${UNIT_CLASSES.join(', ')}`); continue }
    if (seenClass.has(c.id)) out.push(`duplicate unit class "${c.id}"`)
    seenClass.add(c.id)
    for (const stat of ['atk', 'def', 'range', 'speed']) {
      if (!Number.isFinite(c[stat]) || c[stat] < 0) out.push(`unit class ${c.id}: ${stat} must be a number ≥ 0`)
    }
    if (!(c.def > 0)) out.push(`unit class ${c.id}: def is hit points — it must be above 0`)
    for (const field of ['placement', 'movement']) {
      if (!Array.isArray(c[field])) { out.push(`unit class ${c.id}: ${field} must be a list`); continue }
      for (const k of c[field]) if (!TERRAIN[k]) out.push(`unit class ${c.id}: unknown terrain "${k}" in ${field}`)
    }
    // A class you can never create is dead content; a class that cannot move is
    // legitimate (fortifications never move) and so is NOT an error.
    if (Array.isArray(c.placement) && c.placement.length === 0) {
      out.push(`unit class ${c.id}: no placement terrain — it could never be created`)
    }
    if (c.speed > 0 && Array.isArray(c.movement) && c.movement.length === 0) {
      out.push(`unit class ${c.id}: has speed ${c.speed} but no movement terrain — one of the two is wrong`)
    }
  }
  for (const k of UNIT_CLASSES) {
    if (!seenClass.has(k)) out.push(`unit class "${k}" is missing — the engine indexes units by class key`)
  }
  return out
}

/**
 * CAN THE RUN ACTUALLY BE PLAYED?
 *
 * With a current-tier-only pool, a branch stuck at era E can only draft techs of
 * era E — so that cell must hold at least `thresholdFor(E)` of them or the run
 * dead-ends there. Slack is what makes a draft a CHOICE; a cell with exactly the
 * threshold is a formality.
 */
export function feasibility(content) {
  const rows = []
  const active = content.activeEras ?? ERAS.length
  for (const q of QUADRANTS) {
    for (let era = 0; era < active; era++) {
      const have = (content.techs ?? []).filter((t) => t.quadrant === q && t.era === era).length
      // The LAST active era is terminal while the rest are unbuilt: there is
      // nothing to advance into, so it demands nothing yet.
      const terminal = era === active - 1
      const willNeed = thresholdFor(era)
      const need = terminal ? 0 : willNeed
      rows.push({
        quadrant: q, era, eraName: ERAS[era], have, need, willNeed, terminal,
        slack: have - need, ok: have >= need, shortWhenExtended: have < willNeed,
      })
    }
  }
  const blocked = rows.filter((r) => !r.ok && r.need > 0)
  const tight = rows.filter((r) => r.ok && r.need > 0 && r.slack < 2)
  const terminalShort = rows.filter((r) => r.terminal && r.shortWhenExtended)
  const cost = ADVANCE_THRESHOLDS.slice(0, Math.max(0, active - 1)).reduce((a, b) => a + b, 0)
  return { rows, blocked, tight, terminalShort, active, totalNeeded: QUADRANTS.length * cost }
}
