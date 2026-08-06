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
 * final = base × (1 + Σ percentage bonuses)
 * PERCENTAGES ARE ADDITIVE, never compounded — two +100% bonuses triple the
 * base. A flat "+N to base yield" raises `base` before the multiplier.
 */
export const YIELD_MODEL = 'base × (1 + Σ percentages); percentages are additive'

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
  unit_atk: {
    // `label` renders inside a <select>, which cannot hold an icon — so it is
    // plain words. `:token:` markup belongs in `hint` and `describe`.
    label: 'All units — flat attack',
    hint: 'Flat :attack: on every unit you control, present and future. Stacks with every other +:attack: tech — there is no weapon tier.',
    params: [{ key: 'amount', label: 'Attack', min: 0, default: 3 }],
    describe: (e) => `+${e.amount ?? 0} :attack: to all units.`,
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
      for (const p of spec.params) {
        // A param with `options` is a choice; anything else is a number.
        if (p.options) {
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
