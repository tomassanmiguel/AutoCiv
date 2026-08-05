// Turn a structured effect back into a readable sentence.
//
// This is not decoration. It is the ROUND TRIP: prose was converted into
// structure, and if the structure cannot be read back as roughly the original
// sentence, the conversion lost something. The editor shows this line next to
// every effect for exactly that reason — you author against the generated text,
// not against the raw fields.
//
// It is also what the game will use for tooltips once the content layer is
// wired, so a node's description can never drift from what it does.

import {
  OPS, TARGETS, STATS, SCALES, FILTERS, TRIGGERS, RULE_KEYS, REPEATING_TRIGGERS,
} from './schema.js'

const TOKEN = {
  food: ':food:', production: ':production:', gold: ':gold:', progress: ':progress:',
  attack: ':attack:', defense: ':defense:', speed: ':speed:',
  range: 'range', blast: 'blast radius', cooldown: 'cooldown',
  population: 'population', base_yield: 'base yields',
}

const pretty = (s) => String(s ?? '').replace(/_/g, ' ')

function amount(fx) {
  const v = fx.value
  switch (fx.mode) {
    case 'percent': return `${v > 0 ? '+' : ''}${v}%`
    case 'multiply': return `×${v}`
    case 'set': return `set to ${v}`
    default: return `${v > 0 ? '+' : ''}${v}`
  }
}

function subject(fx) {
  const t = TARGETS[fx.target]
  if (!t) return pretty(fx.target)
  if (t.needsKey) return `${pretty(fx.targetKey)}${fx.target === 'unit_class' ? ' units' : ''}`
  switch (fx.target) {
    case 'global': return 'everything'
    case 'all_units': return 'all units'
    case 'all_buildings': return 'all buildings'
    case 'all_tiles': return 'all tiles'
    case 'self': return 'this building'
    case 'run': return 'the run'
    default: return pretty(fx.target)
  }
}

function scaleText(fx) {
  const n = fx.scaleN > 1 ? `${fx.scaleN} ` : ''
  const where = fx.scaleFilter && fx.scaleFilter !== 'none'
    ? filterText({ filter: fx.scaleFilter, filterKey: fx.scaleFilterKey }).replace(/^, /, ' ')
    : ''
  switch (fx.scale) {
    case 'per_adjacent': return ` per ${n}adjacent ${pretty(fx.scaleKey)}${where}`
    case 'per_owned': return ` per ${n}${pretty(fx.scaleKey)}${where} you own`
    case 'per_in_range': return ` per ${n}${pretty(fx.scaleKey)}${where} within ${fx.radius ?? 0} tiles`
    case 'per_distance': return ` per tile of distance from the ${pretty(fx.scaleKey)}`
    case 'equal_to_stat': return `, equal to its ${TOKEN[fx.scaleKey] ?? pretty(fx.scaleKey)}`
    case 'per_level': return ' per upgrade level'
    case 'per_era': return ' per era'
    default: return ''
  }
}

function filterText(fx) {
  switch (fx.filter) {
    case 'in_region': return `, in the ${pretty(fx.filterKey)}`
    case 'on_terrain': return `, on ${pretty(fx.filterKey)}`
    case 'on_tile_class': return `, on ${pretty(fx.filterKey)} tiles`
    case 'adjacent_to': return `, when adjacent to a ${pretty(fx.filterKey)}`
    case 'within_radius': return `, within ${fx.radius ?? 0} tiles of it`
    case 'in_range_of': return `, when in range of a ${pretty(fx.filterKey)}`
    case 'not_adjacent_to': return `, when NOT adjacent to a ${pretty(fx.filterKey)}`
    case 'below_half_health': return ', while below half :defense:'
    case 'target_below_10': return ', against targets below 10% health'
    case 'vs_unit_class': return `, against ${pretty(fx.filterKey)} units`
    case 'level_2_plus': return ', at level 2 and above'
    case 'first_each_combat': return ', the first each combat'
    case 'not_in_region': return `, outside the ${pretty(fx.filterKey)}`
    case 'adjacent_to_terrain': return `, when beside ${pretty(fx.filterKey)}`
    case 'produces_stat': return `, if it produces ${TOKEN[fx.filterKey] ?? pretty(fx.filterKey)}`
    case 'once_per_subject': return ', once each'
    default: return ''
  }
}

/** Both conditions, when a second one is set. */
const allFilters = (fx) =>
  filterText(fx) + (fx.filter2 && fx.filter2 !== 'none'
    ? filterText({ filter: fx.filter2, filterKey: fx.filter2Key })
    : '')

function triggerText(fx) {
  switch (fx.trigger) {
    case 'immediate': return ''
    case 'passive': return ''
    case 'per_tick': return ' each tick'
    case 'every_n_ticks': return ` every ${fx.triggerN} ticks`
    case 'every_n_turns': return ` every ${fx.triggerN} combat turns`
    case 'every_n_combats': return ` every ${fx.triggerN} combats`
    case 'start_of_combat': return ' at the start of combat'
    case 'end_of_combat': return ' at the end of combat'
    case 'end_of_era': return ' at the end of each era'
    case 'on_attack': return ' when it attacks'
    case 'on_kill': return ' when it kills'
    case 'on_unit_death': return ' whenever one of your units dies'
    case 'on_take_damage': return ' when it is attacked'
    case 'on_build': return ' when you place a building'
    case 'on_city_growth': return ' when a city grows'
    case 'on_reroll': return ' whenever you reroll'
    case 'on_hire': return ' when you hire a mercenary'
    case 'on_raze': return ' when a tile of yours is razed'
    case 'on_upgrade': return ' when you upgrade something'
    case 'on_combat_loss': return ' when you lose a combat'
    default: return TRIGGERS[fx.trigger] ? ` (${pretty(fx.trigger)})` : ''
  }
}

const durationText = (fx) => (fx.duration && fx.duration !== 'permanent' ? ` (${pretty(fx.duration)} only)` : '')

/** One effect as a sentence. */
export function describeEffect(fx) {
  if (!fx || !OPS[fx.op]) return '(malformed effect)'
  // Stacking is the default, so the sentence only mentions it when it is OFF —
  // and only where a repeating trigger makes the distinction real.
  const stacking = fx.stacks === false && REPEATING_TRIGGERS.has(fx.trigger) ? ', once only' : ''
  const tail = `${scaleText(fx)}${allFilters(fx)}${triggerText(fx)}${durationText(fx)}${stacking}`

  switch (fx.op) {
    case 'heal':
      return `${subject(fx)} recover ${amount(fx)} ${TOKEN[fx.stat] ?? 'health'}${tail}`
    case 'damage':
      return `${subject(fx)} take ${amount(fx)} damage${tail}`
    case 'rule':
      return `${RULE_KEYS[fx.ruleKey] ?? `Unknown rule "${fx.ruleKey}"`}${fx.value ? ` (${fx.value})` : ''}${tail}`
    case 'yield':
      return fx.statTo
        ? `${subject(fx)}'s ${TOKEN[fx.stat] ?? pretty(fx.stat)} is produced as ${TOKEN[fx.statTo] ?? pretty(fx.statTo)} instead${tail}`
        : `${subject(fx)} produce ${amount(fx)} ${TOKEN[fx.stat] ?? pretty(fx.stat)}${tail}`
    case 'stat':
      return `${subject(fx)} gain ${amount(fx)} ${TOKEN[fx.stat] ?? pretty(fx.stat)}${tail}`
    case 'grant':
      return `Grants ${fx.value} ${subject(fx)}${tail}`
    case 'unlock':
      return `Unlocks ${subject(fx)}${fx.placement ? `, placed ${pretty(fx.placement)}` : ''}`
    case 'permit':
      return `${subject(fx)} may ${pretty(fx.permission) || 'act'}${allFilters(fx)}`
    case 'vision':
      return fx.mode === 'full'
        ? `Reveals ${pretty(fx.targetKey) || 'more of the map'} completely`
        : `Extends vision to ${pretty(fx.targetKey) || 'more of the map'}`
    case 'threshold':
      return `${TOKEN[fx.stat] ?? pretty(fx.stat)} thresholds ${amount(fx)}`
    case 'cost':
      return `${pretty(fx.costKind) || pretty(fx.targetKey)} costs ${amount(fx)}`
    case 'upgrade_level':
      return `${subject(fx)} gain ${amount(fx)} upgrade levels${tail}`
    case 'growth':
      return `Cities grow ${amount(fx)} faster${tail}`
    case 'trigger_count':
      return `End-of-combat effects fire ${amount(fx)} extra time(s)`
    case 'era_length':
      return `Each era lasts ${amount(fx)} ticks`
    case 'option_count':
      return `${amount(fx)} advancement option(s) offered`
    case 'create_tile':
      return `Creates ${fx.value} ${pretty(fx.targetKey)} tile(s)${tail}`
    case 'road':
      return `Roads give ${amount(fx)} ${TOKEN[fx.stat] ?? pretty(fx.stat)} to every tile they touch`
    default:
      return `${OPS[fx.op].label}: ${subject(fx)} ${amount(fx)}`
  }
}

/** All of an item's effects, joined. */
export const describeEffects = (effects) =>
  (effects ?? []).map(describeEffect).join(' ')

/** Which schema fields are meaningful for a given op — drives the editor UI. */
export function fieldsFor(op) {
  const base = {
    target: true, stat: false, statTo: false, mode: false, value: false,
    scale: false, filter: true, trigger: true, duration: false, stacks: false,
    ruleKey: false, permission: false, costKind: false, placement: false,
  }
  switch (op) {
    case 'rule': return { ...base, ruleKey: true, value: true, mode: true, duration: true }
    case 'yield': return { ...base, stat: true, statTo: true, mode: true, value: true, scale: true, duration: true, stacks: true }
    case 'stat': return { ...base, stat: true, mode: true, value: true, scale: true, duration: true, stacks: true }
    case 'heal': return { ...base, stat: true, mode: true, value: true }
    case 'damage': return { ...base, stat: true, mode: true, value: true }
    case 'grant': return { ...base, value: true, scale: true, stacks: true }
    case 'unlock': return { ...base, filter: false, trigger: false, placement: true }
    case 'permit': return { ...base, trigger: false, permission: true }
    case 'vision': return { ...base, mode: true, value: true, filter: false, trigger: false }
    case 'threshold': return { ...base, stat: true, mode: true, value: true, filter: false, trigger: false }
    case 'cost': return { ...base, costKind: true, mode: true, value: true, target: false, filter: false, trigger: false }
    case 'upgrade_level': return { ...base, value: true, scale: true }
    case 'growth': return { ...base, mode: true, value: true }
    case 'trigger_count': return { ...base, value: true, filter: false, trigger: false }
    case 'era_length': return { ...base, mode: true, value: true, filter: false, trigger: false }
    case 'option_count': return { ...base, value: true, filter: false, trigger: false }
    case 'create_tile': return { ...base, value: true }
    case 'road': return { ...base, stat: true, mode: true, value: true, filter: false, trigger: false }
    default: return { ...base, stat: true, mode: true, value: true, scale: true, duration: true }
  }
}
