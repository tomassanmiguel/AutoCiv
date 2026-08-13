// AutoCiv v5 — content schema & shared constants.
//
// This is the CONTRACT between the content layer (content.json, edited in
// /editor.html) and the engine. Enums, the effect registry, and the cost
// formulas that are NOT authored per-row all live here.

export const ERAS = [
  'Stone', 'Bronze', 'Iron', 'Classical', 'Medieval', 'Renaissance',
  'Exploration', 'Steam', 'Modern', 'Information', 'Solar', 'Exodus',
  'Liminite', 'Galactic', 'Ascension',
]
export const eraIndex = (name) => ERAS.indexOf(name)

// The four spendable resources + legitimacy (the life total).
export const RESOURCES = ['production', 'gold', 'food', 'progress']
export const RES_ALL = [...RESOURCES, 'legitimacy']

// Abstract-combat domains (resolution order: Space → Sky → Sea → Land) and the
// three pools each side holds per domain.
export const DOMAINS = ['land', 'sea', 'sky', 'space']
export const STATS = ['atk', 'def', 'bomb'] // attack / defense / bombardment

// Value-accounting weights (design/balance-targets.md §4/§5).
export const DOMAIN_PREMIUM = { land: 1, sea: 2.5, sky: 5, space: 13 }
export const STAT_WEIGHT = { atk: 1, def: 0.5, bomb: 0.8 }

// ---- Cost rules the engine applies (not authored per row) --------------------

// Same-type ramp: the nth copy of a deployable type costs its base PLUS this.
// Series: +0, +1, +2, +4, +7, +11, +16 …  = 1 + (n-2)(n-1)/2 for n>=2.
export function sameTypeRampAdd(n) {
  if (n <= 1) return 0
  return 1 + ((n - 2) * (n - 1)) / 2
}

// Food cost to expand onto a tile: terrain base + distance-from-palace penalty.
export function expandFoodCost(terrainBase, ringDistance) {
  return terrainBase + Math.max(0, ringDistance - 1)
}

// Reroll price: 5 + 5 per reroll already used this game.
export const rerollCost = (used) => 5 + 5 * used

// ---- Effect registry ---------------------------------------------------------
// Each kind lists its params so the editor can render inputs. `where` tags which
// list a kind belongs to: 'tech' (one-shot on unlock / global modifier),
// 'econ' (a deployable's per-turn output), 'combat' (a deployable's scalar
// contribution + conditional riders). The ENGINE consuming a kind is the only
// reason it exists here — do not add ahead of the code.

const N = (name, label, extra = {}) => ({ name, label, params: extra.params || [], where: extra.where })

export const EFFECT_KINDS = [
  // -- tech (global) --
  N('tile_yield', 'Terrain +yield', { where: 'tech', params: [
    { key: 'terrain', type: 'terrain' }, { key: 'resource', type: 'enum', options: RESOURCES }, { key: 'amount', type: 'number' },
  ] }),
  N('unlock_deployable', 'Unlocks deployable', { where: 'tech', params: [{ key: 'deployable', type: 'deployable' }] }),
  N('enable_expansion', 'Enables expanding to terrain', { where: 'tech', params: [{ key: 'terrain', type: 'terrain' }] }),
  N('enable_region', 'Enables settling tiles of a map region', { where: 'tech', params: [{ key: 'region', type: 'string' }] }),
  N('enable_bridge', 'Water/space body becomes an adjacency bridge for settling', { where: 'tech', params: [{ key: 'terrain', type: 'terrain' }] }),
  N('allow_space_build', 'A deployable may be built on space tiles', { where: 'tech', params: [{ key: 'deployable', type: 'deployable' }] }),
  N('deployable_yield_per_nonearth', 'A deployable +yield per non-Earth tile controlled', { where: 'tech', params: [{ key: 'deployable', type: 'deployable' }, { key: 'resource', type: 'enum', options: RES_ALL }, { key: 'amount', type: 'number' }] }),
  N('deployable_cost_add', 'A deployable costs extra production', { where: 'tech', params: [{ key: 'deployable', type: 'deployable' }, { key: 'amount', type: 'number' }] }),
  N('army_combat_flat', 'All units +combat stat', { where: 'tech', params: [
    { key: 'stat', type: 'enum', options: STATS }, { key: 'domain', type: 'enum', options: ['all', ...DOMAINS] }, { key: 'amount', type: 'number' },
  ] }),
  N('units_produce', 'All units also produce', { where: 'tech', params: [{ key: 'resource', type: 'enum', options: RESOURCES }, { key: 'amount', type: 'number' }] }),
  N('palace_yield_flat', 'Palace +yield', { where: 'tech', params: [{ key: 'resource', type: 'enum', options: ['all', ...RESOURCES, 'legitimacy'] }, { key: 'amount', type: 'number' }] }),
  N('upkeep_reduction', 'Reduce all upkeep', { where: 'tech', params: [{ key: 'amount', type: 'number' }] }),
  N('production_cost_reduction', 'Reduce build cost', { where: 'tech', params: [{ key: 'amount', type: 'number' }, { key: 'scope', type: 'enum', options: ['all', 'building'] }] }),
  N('on_combat_result', 'On win/lose a domain, gain', { where: 'tech', params: [
    { key: 'when', type: 'enum', options: ['win', 'lose'] }, { key: 'per', type: 'enum', options: ['domain', 'once'] },
    { key: 'resource', type: 'enum', options: RES_ALL }, { key: 'amount', type: 'number' },
  ] }),
  N('free_reroll_on_progress', 'Free reroll each unlock', { where: 'tech', params: [] }),
  N('per_unique_era_deployable', '+resource / unique era deployable', { where: 'tech', params: [{ key: 'resource', type: 'enum', options: RESOURCES }, { key: 'amount', type: 'number' }] }),
  N('vision_bonus', '+vision range', { where: 'tech', params: [{ key: 'amount', type: 'number' }] }),
  N('settlement_yield', 'Each settlement +yield', { where: 'tech', params: [{ key: 'resource', type: 'enum', options: RES_ALL }, { key: 'amount', type: 'number' }] }),
  N('building_subtype_yield', 'Buildings of a type +yield', { where: 'tech', params: [{ key: 'subtype', type: 'string' }, { key: 'resource', type: 'enum', options: RES_ALL }, { key: 'amount', type: 'number' }] }),
  N('palace_yield_mult', 'Multiply palace yield', { where: 'tech', params: [{ key: 'factor', type: 'number' }] }),
  N('tile_yield_mult', 'Multiply a terrain’s yield', { where: 'tech', params: [{ key: 'terrain', type: 'terrain' }, { key: 'resource', type: 'enum', options: RESOURCES }, { key: 'factor', type: 'number' }] }),
  N('progress_cost_mult', 'Scale future progress cost', { where: 'tech', params: [{ key: 'factor', type: 'number' }] }),
  N('army_from_legitimacy', 'Army +scalar from legitimacy', { where: 'tech', params: [
    { key: 'stat', type: 'enum', options: STATS }, { key: 'domain', type: 'enum', options: ['all', ...DOMAINS] }, { key: 'divisor', type: 'number' },
  ] }),
  N('subtype_combat_mult', 'Multiply combat of a subtype', { where: 'tech', params: [{ key: 'subtype', type: 'string' }, { key: 'factor', type: 'number' }] }),
  N('subtype_combat_flat', 'Units of a subtype +scalar', { where: 'tech', params: [
    { key: 'subtype', type: 'string' }, { key: 'domain', type: 'enum', options: DOMAINS }, { key: 'stat', type: 'enum', options: STATS }, { key: 'amount', type: 'number' },
  ] }),
  N('gold_interest', 'Interest on banked gold', { where: 'tech', params: [{ key: 'factor', type: 'number' }] }),
  N('army_per_same_type', 'Units +scalar per other same-type', { where: 'tech', params: [{ key: 'stat', type: 'enum', options: STATS }, { key: 'amount', type: 'number' }] }),
  N('food_distance_discount', 'Scale expansion distance cost', { where: 'tech', params: [{ key: 'factor', type: 'number' }] }),
  N('empty_tile_combat', 'Empty controlled tiles +scalar', { where: 'tech', params: [{ key: 'domain', type: 'enum', options: DOMAINS }, { key: 'stat', type: 'enum', options: STATS }, { key: 'amount', type: 'number' }] }),
  N('trade_networks', 'Gold = farthest controlled ring', { where: 'tech', params: [] }),
  N('progress_per_flavor', '+progress / owned tech of a flavor', { where: 'tech', params: [{ key: 'flavor', type: 'string' }, { key: 'amount', type: 'number' }] }),
  N('keep_natural_production', 'Buildings keep tile production', { where: 'tech', params: [] }),
  N('army_growth_per_turn', 'Army +scalar accrues each turn', { where: 'tech', params: [{ key: 'stat', type: 'enum', options: STATS }, { key: 'domain', type: 'enum', options: ['all', ...DOMAINS] }, { key: 'amount', type: 'number' }] }),
  N('palace_random_growth', 'Palace +random base yield each turn', { where: 'tech', params: [{ key: 'amount', type: 'number' }] }),
  N('subtype_yield_mult', 'Multiply a subtype/deployable yield', { where: 'tech', params: [{ key: 'subtype', type: 'string' }, { key: 'deployable', type: 'deployable' }, { key: 'resource', type: 'enum', options: ['all', ...RES_ALL] }, { key: 'factor', type: 'number' }] }),
  N('subtype_convert_yield', 'Subtype/deployable also makes X = its Y', { where: 'tech', params: [{ key: 'subtype', type: 'string' }, { key: 'deployable', type: 'deployable' }, { key: 'from', type: 'enum', options: RES_ALL }, { key: 'to', type: 'enum', options: RES_ALL }] }),
  N('army_from_settlement_output', 'Army +scalar = settlement output', { where: 'tech', params: [{ key: 'stat', type: 'enum', options: STATS }, { key: 'domain', type: 'enum', options: ['all', ...DOMAINS] }] }),
  N('terrain_adjacent_settlement', 'Terrain +yield when producing & adjacent to a settlement', { where: 'tech', params: [
    { key: 'terrain', type: 'terrain' }, { key: 'resource', type: 'enum', options: RESOURCES }, { key: 'amount', type: 'number' },
  ] }),
  N('override_tile_yield_factor', 'Override a deployable’s tile-yield multiplier', { where: 'tech', params: [{ key: 'deployable', type: 'deployable' }, { key: 'factor', type: 'number' }] }),
  N('subtype_isolated_mult', 'Multiply output when it has no adjacent building', { where: 'tech', params: [{ key: 'subtype', type: 'string' }, { key: 'deployable', type: 'deployable' }, { key: 'factor', type: 'number' }] }),
  N('subtype_combat_from_output', 'Subtype/deployable +atk & +def = its output', { where: 'tech', params: [
    { key: 'subtype', type: 'string' }, { key: 'deployable', type: 'deployable' }, { key: 'from', type: 'enum', options: RES_ALL }, { key: 'domain', type: 'enum', options: DOMAINS },
  ] }),
  N('region_yield_mult', 'Multiply a subtype/deployable yield on a region', { where: 'tech', params: [
    { key: 'region', type: 'string' }, { key: 'subtype', type: 'string' }, { key: 'deployable', type: 'deployable' }, { key: 'resource', type: 'enum', options: ['all', ...RES_ALL] }, { key: 'factor', type: 'number' },
  ] }),
  N('enable_mercenaries', 'Enable hiring mercenaries in combat', { where: 'tech', params: [] }),
  N('merc_def_per_hire', 'Each mercenary hired also grants +def', { where: 'tech', params: [{ key: 'amount', type: 'number' }] }),
  N('crit_per_ranged', 'Crit chance (double damage) per ranged unit', { where: 'tech', params: [{ key: 'percent', type: 'number' }] }),
  N('cross_domain_bombard', 'One domain’s bombardment also strikes another', { where: 'tech', params: [{ key: 'from', type: 'enum', options: DOMAINS }, { key: 'to', type: 'enum', options: DOMAINS }] }),
  N('delay_next_wave', 'Delay the next enemy attack (turns)', { where: 'tech', params: [{ key: 'amount', type: 'number' }] }),

  // -- deployable econ (per turn) --
  N('self_yield', 'Produces (self)', { where: 'econ', params: [{ key: 'resource', type: 'enum', options: RES_ALL }, { key: 'amount', type: 'number' }] }),
  N('per_adjacent', '+resource per adjacent', { where: 'econ', params: [
    { key: 'resource', type: 'enum', options: RES_ALL }, { key: 'amount', type: 'number' },
    { key: 'filter', type: 'enum', options: ['building', 'settlement', 'military', 'forest_or_mountain', 'water', 'hills', 'desert', 'mountain', 'any'] },
  ] }),
  N('growth_per_turn', 'Output grows each turn', { where: 'econ', params: [{ key: 'resource', type: 'enum', options: RES_ALL }, { key: 'amount', type: 'number' }] }),
  N('count_scaling', '+resource per owned of this type', { where: 'econ', params: [{ key: 'resource', type: 'enum', options: RES_ALL }, { key: 'amount', type: 'number' }] }),
  N('double_tile_yield', 'Doubles the tile’s natural yield', { where: 'econ', params: [] }),
  N('self_output_mult_if_adjacent', 'Multiply own output when adjacent to a filter', { where: 'econ', params: [
    { key: 'factor', type: 'number' }, { key: 'filter', type: 'enum', options: ['building', 'settlement', 'military', 'any'] },
  ] }),

  // -- deployable combat --
  N('combat_scalar', 'Combat scalar (base)', { where: 'combat', params: [
    { key: 'domain', type: 'enum', options: DOMAINS }, { key: 'stat', type: 'enum', options: STATS }, { key: 'amount', type: 'number' },
  ] }),
  N('combat_per_adjacent', '+scalar per adjacent', { where: 'combat', params: [
    { key: 'domain', type: 'enum', options: DOMAINS }, { key: 'stat', type: 'enum', options: STATS }, { key: 'amount', type: 'number' },
    { key: 'filter', type: 'enum', options: ['fortification', 'building', 'same_type', 'cavalry', 'military', 'mountain'] },
  ] }),
  N('combat_on_terrain', 'Scalar bonus on terrain', { where: 'combat', params: [
    { key: 'domain', type: 'enum', options: DOMAINS }, { key: 'stat', type: 'enum', options: STATS },
    { key: 'terrain', type: 'terrain' }, { key: 'mode', type: 'enum', options: ['add', 'double'] }, { key: 'amount', type: 'number' },
  ] }),
  N('combat_mult_empty_adjacent', 'Scalar × adjacent empty terrain', { where: 'combat', params: [
    { key: 'domain', type: 'enum', options: DOMAINS }, { key: 'stat', type: 'enum', options: STATS }, { key: 'terrain', type: 'terrain' },
  ] }),
  N('combat_count_scaling', '+scalar per owned of this type', { where: 'combat', params: [
    { key: 'domain', type: 'enum', options: DOMAINS }, { key: 'stat', type: 'enum', options: STATS }, { key: 'amount', type: 'number' },
  ] }),
  N('combat_when_surrounded', '+scalar when fully surrounded', { where: 'combat', params: [
    { key: 'domain', type: 'enum', options: DOMAINS }, { key: 'stat', type: 'enum', options: STATS }, { key: 'amount', type: 'number' },
  ] }),
  N('combat_from_legitimacy', 'Scalar = legitimacy / divisor', { where: 'combat', params: [
    { key: 'domain', type: 'enum', options: DOMAINS }, { key: 'stat', type: 'enum', options: STATS }, { key: 'divisor', type: 'number' },
  ] }),
  N('combat_per_empty_tile', '+scalar per empty controlled tile', { where: 'combat', params: [
    { key: 'domain', type: 'enum', options: DOMAINS }, { key: 'stat', type: 'enum', options: STATS }, { key: 'amount', type: 'number' },
  ] }),
  N('auto_mercenaries', 'Auto-hire mercenaries each combat (all domains)', { where: 'combat', params: [
    { key: 'base', type: 'number' }, { key: 'per_uncontrolled', type: 'number' },
  ] }),

  // -- deployable econ (special) --
  N('gold_from_army', 'Gold = % of land army attack', { where: 'econ', params: [{ key: 'percent', type: 'number' }] }),
  N('self_per_terrain_in_range', '+resource per terrain in range', { where: 'econ', params: [
    { key: 'resource', type: 'enum', options: RES_ALL }, { key: 'amount', type: 'number' }, { key: 'terrain', type: 'terrain' }, { key: 'range', type: 'number' },
  ] }),
  N('self_per_progress_tile_in_range', '+resource per progress tile in range', { where: 'econ', params: [
    { key: 'resource', type: 'enum', options: RES_ALL }, { key: 'amount', type: 'number' }, { key: 'range', type: 'number' },
  ] }),
  N('aura_tile_yield_mult', 'Multiply adjacent tiles’ natural yield (credited here)', { where: 'econ', params: [
    { key: 'resource', type: 'enum', options: RESOURCES }, { key: 'factor', type: 'number' },
  ] }),
  N('tightbeam_network', 'Tiles between any pair of these +yield to each natural output', { where: 'econ', params: [{ key: 'amount', type: 'number' }] }),

  // -- deployable one-shot on build --
  N('on_build', 'One-time gain when built', { where: 'build', params: [{ key: 'resource', type: 'enum', options: RES_ALL }, { key: 'amount', type: 'number' }] }),
]
export const EFFECT_BY_NAME = Object.fromEntries(EFFECT_KINDS.map((e) => [e.name, e]))
export const effectsFor = (where) => EFFECT_KINDS.filter((e) => e.where === where)

// Light validation — returns a list of problem strings (empty = clean).
export function validateContent(c) {
  const out = []
  const dep = new Set((c.deployables || []).map((d) => d.id))
  const ter = new Set((c.terrain || []).map((t) => t.id))
  for (const t of c.techs || []) {
    for (const e of t.effects || []) {
      if (!EFFECT_BY_NAME[e.name]) out.push(`tech ${t.id}: unknown effect ${e.name}`)
      if (e.name === 'unlock_deployable' && !dep.has(e.deployable)) out.push(`tech ${t.id}: unlocks missing deployable ${e.deployable}`)
      if (e.name === 'enable_expansion' && !ter.has(e.terrain)) out.push(`tech ${t.id}: expansion to missing terrain ${e.terrain}`)
    }
  }
  return out
}
