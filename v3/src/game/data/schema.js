// THE CONTENT SCHEMA — the contract for the whole content layer.
//
// Techs, buildings, wonders and tier unlocks are all DATA (`content.json`),
// authored in the editor at /editor.html and read by the game. This module is
// the single definition of what that data may contain: every dropdown in the
// editor is built from these enums, and every validator checks against them.
//
// ---------------------------------------------------------------------------
// THE RULE: NO FREE TEXT IN EFFECTS
// ---------------------------------------------------------------------------
// An effect is fully structured — no prose fallback. That is deliberate, and it
// has one consequence worth stating plainly: some effects in the design are
// bespoke behaviour ("if you lose a combat you may replay it"), and no amount of
// {target, magnitude} will express them. Those use `op: 'rule'` with a
// `ruleKey` drawn from RULE_KEYS below.
//
// `rule` is NOT an escape hatch into prose. Every key in RULE_KEYS names a
// specific behaviour the engine must implement, so the enum doubles as the
// TODO list for the combat/economy code. If a designer needs a behaviour that
// is not in the list, the answer is to add a key here (and implement it), not
// to write a sentence.
//
// ---------------------------------------------------------------------------
// SHAPE OF AN EFFECT
// ---------------------------------------------------------------------------
//   {
//     op,        // the verb — what kind of change this is
//     target,    // what it acts on
//     targetKey, // which one, when `target` needs naming (a unit class, a terrain…)
//     stat,      // which quantity moves (a resource, a combat stat)
//     mode,      // flat | percent | multiply | set
//     value,     // the number
//     scale,     // null, or what the value is multiplied by (per adjacent X…)
//     scaleKey,  // which X
//     filter,    // narrowing: region / terrain / adjacency / state
//     filterKey,
//     trigger,   // when it fires
//     triggerN,  // the N in "every N ticks"
//     duration,  // permanent | combat | era
//     ruleKey,   // only when op === 'rule'
//   }
//
// Most effects use four or five of these; the rest stay null. A tech holds an
// ARRAY of effects, because "builds a temple AND temples produce 1 gold" is two.

// ---------------------------------------------------------------------------
// Eras and quadrants
// ---------------------------------------------------------------------------

/** The 15 eras. The index IS the era number, everywhere. */
export const ERAS = [
  'Stone', 'Bronze', 'Iron', 'Classical', 'Medieval', 'Renaissance',
  'Exploration', 'Steam', 'Modern', 'Information', 'Solar', 'Exodus',
  'Liminite', 'Galactic', 'Ascension',
]

export const QUADRANTS = ['military', 'technology', 'economy', 'society']

/**
 * How many techs a quadrant must take at era E before that quadrant advances to
 * era E+1. Each quadrant advances on its OWN clock, so one can be drafting
 * Medieval while another is still in Iron.
 *
 * ⚠️ The pool is CURRENT TIER ONLY — anything skipped is gone when the quadrant
 * moves on. So a quadrant-era cell must hold at least this many techs or the run
 * stalls there, and it wants a few more than that for the choice to mean
 * anything. `feasibility()` below is what checks it.
 */
export const ADVANCE_THRESHOLDS = [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 7]

/** Advancement out of the last era is not a thing; it is the end of the run. */
export const thresholdFor = (era) => ADVANCE_THRESHOLDS[era] ?? 0

/** How many advancements are offered at once. */
export const OFFER_SIZE = 3

// ---------------------------------------------------------------------------
// The effect vocabulary
// ---------------------------------------------------------------------------

/** The verb. What KIND of change an effect is. */
export const OPS = {
  yield: { label: 'Yield', help: 'Change how much of a resource something produces.' },
  stat: { label: 'Unit/building stat', help: 'Change attack, defence, speed, range…' },
  grant: { label: 'Grant', help: 'Hand over units, buildings, temples, outposts — now or on a trigger.' },
  unlock: { label: 'Unlock', help: 'Make a unit class, building or wonder available to build.' },
  permit: { label: 'Permission', help: 'Allow settling, founding or moving somewhere previously barred.' },
  vision: { label: 'Vision', help: 'Reveal more of the map.' },
  threshold: { label: 'Threshold', help: 'Change what a resource level costs.' },
  cost: { label: 'Gold cost', help: 'Change repair, upgrade, mercenary or reroll prices.' },
  upgrade_level: { label: 'Upgrade level', help: 'Grant levels to units or buildings.' },
  growth: { label: 'City growth', help: 'Change how fast cities gain population.' },
  trigger_count: { label: 'Extra triggers', help: 'End-of-combat effects fire additional times.' },
  era_length: { label: 'Era length', help: 'Change the number of ticks in an era.' },
  option_count: { label: 'Offer size', help: 'Change how many advancements are offered.' },
  create_tile: { label: 'Create tile', help: 'Bring a tile into existence — a planet, an island, an asteroid.' },
  road: { label: 'Roads', help: 'Lay or upgrade the road network.' },
  rule: { label: 'Named rule', help: 'A bespoke behaviour the engine implements — see RULE_KEYS.' },
}
export const OP_KEYS = Object.keys(OPS)

/** What an effect acts on. `needsKey` means `targetKey` must be filled in. */
export const TARGETS = {
  global: { label: 'Everything', needsKey: false },
  palace: { label: 'The palace', needsKey: false },
  all_units: { label: 'All units', needsKey: false },
  unit_class: { label: 'A unit class', needsKey: 'unitClass' },
  mercenaries: { label: 'Mercenaries', needsKey: false },
  all_buildings: { label: 'All buildings', needsKey: false },
  building: { label: 'A specific building', needsKey: 'building' },
  temples: { label: 'Temples', needsKey: false },
  wonders: { label: 'Wonders', needsKey: false },
  all_tiles: { label: 'All tiles', needsKey: false },
  terrain: { label: 'A terrain type', needsKey: 'terrain' },
  tile_class: { label: 'A class of tile', needsKey: 'tileClass' },
  region: { label: 'A region', needsKey: 'region' },
  cities: { label: 'Cities', needsKey: false },
  citizens: { label: 'Citizens', needsKey: false },
  outposts: { label: 'Outposts', needsKey: false },
  enemies: { label: 'Enemy units', needsKey: false },
  self: { label: 'This building itself', needsKey: false },
  run: { label: 'The run', needsKey: false },
}
export const TARGET_KEYS = Object.keys(TARGETS)

/** Unit classes. Fixed — the engine knows these, the editor does not invent them. */
export const UNIT_CLASSES = [
  'melee', 'ranged', 'cavalry', 'siege', 'naval', 'aerial', 'astral',
  'command', 'fortification',
]

/** Tile classes — how a tile is being used, as opposed to what it is made of. */
export const TILE_CLASSES = ['rural', 'outpost', 'city', 'improved', 'controlled', 'empty', 'water', 'land']

/** Terrain types, matching `world/terrain.js`. */
export const TERRAINS = [
  'plains', 'forest', 'hills', 'mountain', 'desert', 'tundra', 'coast', 'ocean',
  'river', 'island', 'moon', 'mars', 'asteroid', 'planet', 'star', 'singularity',
  'exoplains', 'exohills', 'exosea', 'exomountain', 'space', 'deep_space',
]

/** Regions — the big geographic divisions a bonus can be scoped to. */
export const REGIONS = ['old_world', 'new_world', 'earth', 'moon', 'mars', 'space', 'exoplanet', 'galaxy', 'off_earth']

/** Resources and combat stats — the quantity an effect moves. */
export const STATS = {
  food: { label: ':food:', group: 'resource' },
  production: { label: ':production:', group: 'resource' },
  gold: { label: ':gold:', group: 'resource' },
  progress: { label: ':progress:', group: 'resource' },
  attack: { label: ':attack:', group: 'combat' },
  defense: { label: ':defense:', group: 'combat' },
  speed: { label: ':speed:', group: 'combat' },
  range: { label: 'Range', group: 'combat' },
  blast: { label: 'Blast radius', group: 'combat' },
  cooldown: { label: 'Cooldown', group: 'combat' },
  population: { label: 'Population', group: 'city' },
  base_yield: { label: 'All base yields', group: 'resource' },
}
export const STAT_KEYS = Object.keys(STATS)

/** How the value applies. */
export const MODES = {
  flat: { label: 'Flat (+N)' },
  percent: { label: 'Percent (+N%)' },
  multiply: { label: 'Multiply (×N)' },
  set: { label: 'Set to N' },
}
export const MODE_KEYS = Object.keys(MODES)

/**
 * What the value SCALES with. This is the dimension a flat {target, magnitude}
 * schema is missing, and roughly a fifth of the design needs it: "+3 gold for
 * every unique building", "progress equal to that unit's attack".
 */
export const SCALES = {
  none: { label: 'Nothing — a flat amount', needsKey: false },
  per_adjacent: { label: 'Per adjacent…', needsKey: 'adjacency' },
  per_owned: { label: 'Per one you own…', needsKey: 'countable' },
  per_in_range: { label: 'Per one in range…', needsKey: 'countable' },
  per_distance: { label: 'Per tile of distance from…', needsKey: 'anchor' },
  equal_to_stat: { label: "Equal to the subject's…", needsKey: 'stat' },
  per_level: { label: 'Per upgrade level', needsKey: false },
  per_era: { label: 'Per era elapsed', needsKey: false },
}
export const SCALE_KEYS = Object.keys(SCALES)

/** Things that can be counted for `per_owned` / `per_adjacent` / `per_in_range`. */
export const COUNTABLES = [
  'city', 'outpost', 'citizen', 'building', 'unique_building', 'temple', 'wonder',
  'unit', 'melee', 'ranged', 'cavalry', 'siege', 'naval', 'aerial', 'astral',
  'fortification', 'asteroid', 'mountain', 'water_tile', 'empty_space',
  'rural_tile', 'controlled_tile', 'enemy_defeated', 'road_tile',
]

/** Anchors for `per_distance`. */
export const ANCHORS = ['palace', 'nearest_city', 'nearest_temple', 'this_building']

/** When an effect fires. */
export const TRIGGERS = {
  immediate: { label: 'Immediately, once', needsN: false },
  passive: { label: 'Always (a standing modifier)', needsN: false },
  per_tick: { label: 'Every tick', needsN: false },
  every_n_ticks: { label: 'Every N ticks', needsN: true },
  every_n_turns: { label: 'Every N combat turns', needsN: true },
  start_of_combat: { label: 'At the start of combat', needsN: false },
  end_of_combat: { label: 'At the end of combat', needsN: false },
  every_n_combats: { label: 'Every N combats', needsN: true },
  end_of_era: { label: 'At the end of an era', needsN: false },
  on_attack: { label: 'When this unit attacks', needsN: false },
  on_kill: { label: 'When it kills something', needsN: false },
  on_unit_death: { label: 'When one of your units dies', needsN: false },
  on_take_damage: { label: 'When it is attacked', needsN: false },
  on_build: { label: 'When you place a building', needsN: false },
  on_city_growth: { label: 'When a city grows', needsN: false },
  on_reroll: { label: 'When you reroll an offer', needsN: false },
  on_hire: { label: 'When you hire a mercenary', needsN: false },
  on_raze: { label: 'When an enemy razes a tile', needsN: false },
  on_upgrade: { label: 'When you upgrade something', needsN: false },
  on_combat_loss: { label: 'When you lose a combat', needsN: false },
}
export const TRIGGER_KEYS = Object.keys(TRIGGERS)

/** Extra conditions narrowing WHICH subjects an effect applies to. */
export const FILTERS = {
  none: { label: 'No condition', needsKey: false },
  in_region: { label: 'Only in region…', needsKey: 'region' },
  on_terrain: { label: 'Only on terrain…', needsKey: 'terrain' },
  on_tile_class: { label: 'Only on tile class…', needsKey: 'tileClass' },
  adjacent_to: { label: 'Only when adjacent to…', needsKey: 'countable' },
  in_range_of: { label: 'Only when in range of…', needsKey: 'countable' },
  below_half_health: { label: 'Only while below half :defense:', needsKey: false },
  target_below_10: { label: 'Only against targets below 10% health', needsKey: false },
  vs_unit_class: { label: 'Only against a unit class…', needsKey: 'unitClass' },
  level_2_plus: { label: 'Only for level 2 and above', needsKey: false },
  first_each_combat: { label: 'Only the first each combat', needsKey: false },
  not_adjacent_to: { label: 'Only when NOT adjacent to…', needsKey: 'countable' },
}
export const FILTER_KEYS = Object.keys(FILTERS)

/** How long a change lasts. */
export const DURATIONS = {
  permanent: { label: 'Permanent' },
  combat: { label: 'This combat only' },
  era: { label: 'This era only' },
  turns: { label: 'A number of turns' },
}
export const DURATION_KEYS = Object.keys(DURATIONS)

/**
 * NAMED ENGINE BEHAVIOURS — used by `op: 'rule'`.
 *
 * Each key is a distinct thing the engine has to implement. This list IS the
 * work queue for the combat and economy code; nothing here is expressible as a
 * number times a target, which is exactly why it is a closed enum rather than
 * prose. Add a key when a design needs one, and implement it.
 */
export const RULE_KEYS = {
  // — combat behaviours —
  taunt: 'Enemies in reach must strike this unit before anything else.',
  bleed: 'Attacks leave a wound costing the target a % of :defense: each turn.',
  burn: 'Attacks set the target alight for a % of max :defense: each turn.',
  stun: 'Damage costs the target its next turn.',
  execute: 'Kills outright any target below a health fraction.',
  splash: 'Damage spreads to tiles around the target, falling off with distance.',
  pierce_line: 'Damages everything between the attacker and its target.',
  knockback: 'Shoves the target a tile; a collision doubles damage and hits what it struck.',
  reflect: 'Returns an attacker\'s damage for the defender\'s :attack:.',
  thorns: 'Attackers take damage equal to the defender\'s :defense:.',
  retreat_after_attack: 'Falls back to a safe tile after striking, given the :speed:.',
  move_attack_again: 'After attacking, moves and attacks a second time.',
  extra_attack_every_n: 'Attacks an additional time every Nth attack.',
  double_first_strike: 'The first attack on a given target deals double damage.',
  die_after_attack: 'Destroyed immediately after its first attack.',
  death_explosion: 'On death, deals its :attack: to everything in a radius.',
  indestructible: 'Cannot be destroyed by enemies.',
  evade_chance: 'A percentage chance to avoid an incoming attack.',
  infinite_range: 'May strike any tile; targets inside normal range take double instead.',
  infinite_speed: 'May move any distance in a turn.',
  respawn_after_n_turns: 'Comes back N turns after dying.',
  no_raze: 'Enemies cannot raze your buildings.',
  decoy_pathing: 'Enemies within range path here before resuming their route.',
  free_reposition: 'May be repositioned without paying gold.',
  place_anywhere: 'May be placed on any tile, ignoring terrain rules.',
  traverse: 'May cross a terrain class it otherwise could not.',

  // — economy and meta —
  replay_combat: 'On a loss, the run may rewind to before the battle.',
  double_building_placement: 'Placing a building places a second copy.',
  double_upgrade: 'An upgrade applies twice.',
  free_mercenary: 'A mercenary is free.',
  extra_mercenary: 'Hiring brings an additional mercenary alongside.',
  claim_second_ring: 'Settling claims a second ring of territory.',
  auto_city_on_growth: 'A city spawns another once its population passes a bound.',
  paired_growth: 'Growth in one region triggers growth in another.',
  convert_yield: 'One resource\'s output is produced as another instead.',
  interest: 'Pays a percentage of banked :gold: at the end of combat.',
  remove_tiles: 'Removes tiles from the map entirely.',
  link_adjacency: 'Two distant tiles count as adjacent to each other.',
  lay_road_random: 'Lays a road on a valid tile.',
  upgrade_random: 'Upgrades a random unit or building.',
  enemy_budget: 'Scales the enemy threat budget.',
  wonder_on_complete: 'Fires when a wonder completes.',
  count_as_temple: 'This building counts as a temple for every temple effect.',
  count_as_city: 'This building counts as a city.',
}
export const RULE_KEY_LIST = Object.keys(RULE_KEYS)

// ---------------------------------------------------------------------------
// Icons the editor may choose from
// ---------------------------------------------------------------------------
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
]

// ---------------------------------------------------------------------------
// Placement rules — for buildings and wonders
// ---------------------------------------------------------------------------
export const PLACEMENTS = {
  any_controlled: 'Any tile you control',
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

/** Wonders come in tiers, which are their own ladder — not the era ladder. */
export const WONDER_TIERS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']

// ---------------------------------------------------------------------------
// A blank effect, and the empty rows the editor creates
// ---------------------------------------------------------------------------
export const blankEffect = () => ({
  op: 'yield',
  target: 'global',
  targetKey: '',
  stat: 'gold',
  mode: 'flat',
  value: 1,
  scale: 'none',
  scaleKey: '',
  filter: 'none',
  filterKey: '',
  trigger: 'passive',
  triggerN: 0,
  duration: 'permanent',
  ruleKey: '',
})

export const blankTech = () => ({
  id: '', name: '', quadrant: 'military', era: 0,
  icon: '/sprites/ui/policy.png', requires: [], effects: [],
})

export const blankBuilding = () => ({
  id: '', name: '', era: 0, placement: 'any_controlled',
  icon: '/sprites/ui/building.png', unlockedBy: '', effects: [],
})

export const blankWonder = () => ({
  id: '', name: '', tier: 'I', placement: 'any_controlled',
  icon: '/sprites/ui/wonder.png', requires: [], effects: [],
})

// ---------------------------------------------------------------------------
// Validation + feasibility
// ---------------------------------------------------------------------------

/** Structural problems in one effect. */
export function validateEffect(fx, where) {
  const out = []
  const at = (m) => `${where}: ${m}`
  if (!OPS[fx.op]) out.push(at(`unknown op "${fx.op}"`))
  if (!TARGETS[fx.target]) out.push(at(`unknown target "${fx.target}"`))
  else if (TARGETS[fx.target].needsKey && !fx.targetKey) out.push(at(`target "${fx.target}" needs a target key`))
  if (fx.op === 'rule') {
    if (!RULE_KEYS[fx.ruleKey]) out.push(at(`op "rule" needs a known ruleKey (got "${fx.ruleKey}")`))
  }
  if (fx.stat && !STATS[fx.stat]) out.push(at(`unknown stat "${fx.stat}"`))
  if (fx.mode && !MODES[fx.mode]) out.push(at(`unknown mode "${fx.mode}"`))
  if (fx.scale && !SCALES[fx.scale]) out.push(at(`unknown scale "${fx.scale}"`))
  else if (fx.scale && SCALES[fx.scale].needsKey && !fx.scaleKey) out.push(at(`scale "${fx.scale}" needs a key`))
  if (fx.filter && !FILTERS[fx.filter]) out.push(at(`unknown filter "${fx.filter}"`))
  else if (fx.filter && FILTERS[fx.filter].needsKey && !fx.filterKey) out.push(at(`filter "${fx.filter}" needs a key`))
  if (fx.trigger && !TRIGGERS[fx.trigger]) out.push(at(`unknown trigger "${fx.trigger}"`))
  else if (fx.trigger && TRIGGERS[fx.trigger].needsN && !fx.triggerN) out.push(at(`trigger "${fx.trigger}" needs an N`))
  return out
}

/** Structural problems across the whole dataset. */
export function validateContent(content) {
  const out = []
  const ids = new Set()
  for (const t of content.techs ?? []) {
    if (!t.id) out.push(`tech "${t.name}" has no id`)
    else if (ids.has(t.id)) out.push(`duplicate tech id "${t.id}"`)
    ids.add(t.id)
    if (!QUADRANTS.includes(t.quadrant)) out.push(`${t.id}: unknown quadrant "${t.quadrant}"`)
    if (!(t.era >= 0 && t.era < ERAS.length)) out.push(`${t.id}: era ${t.era} out of range`)
    if (!t.effects?.length) out.push(`${t.id}: has no effects`)
    for (const [i, fx] of (t.effects ?? []).entries()) out.push(...validateEffect(fx, `${t.id} effect ${i + 1}`))
  }
  // A dependency must exist, sit in the same quadrant, and NOT be in a later era
  // — with a current-tier-only pool, a later prerequisite can never be met.
  const byId = new Map((content.techs ?? []).map((t) => [t.id, t]))
  for (const t of content.techs ?? []) {
    for (const r of t.requires ?? []) {
      const dep = byId.get(r)
      if (!dep) { out.push(`${t.id}: requires unknown tech "${r}"`); continue }
      if (dep.era > t.era) out.push(`${t.id}: requires "${r}" from a LATER era (${ERAS[dep.era]} > ${ERAS[t.era]}) — unreachable`)
    }
  }
  for (const b of content.buildings ?? []) {
    if (!PLACEMENTS[b.placement]) out.push(`building ${b.id}: unknown placement "${b.placement}"`)
    for (const [i, fx] of (b.effects ?? []).entries()) out.push(...validateEffect(fx, `building ${b.id} effect ${i + 1}`))
  }
  for (const w of content.wonders ?? []) {
    if (!WONDER_TIERS.includes(w.tier)) out.push(`wonder ${w.id}: unknown tier "${w.tier}"`)
    for (const [i, fx] of (w.effects ?? []).entries()) out.push(...validateEffect(fx, `wonder ${w.id} effect ${i + 1}`))
  }
  return out
}

/**
 * CAN THE RUN ACTUALLY BE PLAYED?
 *
 * With a current-tier-only pool, a quadrant stuck at era E can only draft techs
 * of era E — so that cell must hold at least `thresholdFor(E)` of them or the
 * run dead-ends there. This reports every cell against its requirement, plus
 * the slack: how many spare techs a cell has once the threshold is paid.
 *
 * Slack is what makes a draft a CHOICE. A cell with exactly the threshold is
 * not a decision, it is a formality.
 */
export function feasibility(content) {
  const rows = []
  for (const q of QUADRANTS) {
    for (let era = 0; era < ERAS.length; era++) {
      const have = (content.techs ?? []).filter((t) => t.quadrant === q && t.era === era).length
      const need = thresholdFor(era)
      rows.push({ quadrant: q, era, eraName: ERAS[era], have, need, slack: have - need, ok: have >= need })
    }
  }
  const blocked = rows.filter((r) => !r.ok && r.need > 0)
  const tight = rows.filter((r) => r.ok && r.need > 0 && r.slack < 2)
  return { rows, blocked, tight, totalNeeded: QUADRANTS.length * ADVANCE_THRESHOLDS.reduce((a, b) => a + b, 0) }
}
