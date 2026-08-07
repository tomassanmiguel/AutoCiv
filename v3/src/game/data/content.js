// THE CONTENT LAYER, as the game sees it.
//
// `content.json` is authored in the editor; this module is the only thing that
// reads it. It indexes the file and answers the one question the draft actually
// asks: GIVEN WHAT I HOLD, WHAT MAY I BE OFFERED?
//
// The draft rules it enforces (see ../../../docs/design.md §2):
//   - three branches, each carrying its OWN era
//   - the pool is CURRENT TIER ONLY — a branch at era E may only draft era-E
//     rows, and everything it skipped is gone when it advances
//   - `requires` must already be held; with a current-tier-only pool that means
//     a prerequisite from an EARLIER era, which the validator enforces
//   - a `group` is mutually exclusive: take one member and the rest are barred
//   - a wonder is drafted like a tech, but you are never offered one while you
//     already hold an unbuilt one

// The import attribute is required by Node's ESM loader (the sims run this file
// directly, unbundled); Vite honours it too.
import raw from './content.json' with { type: 'json' }
import { QUADRANTS, thresholdFor, UNIT_CLASSES, WONDER_TIERS } from './schema.js'

export const CONTENT = raw

/**
 * Wonders are drafted from the same pool as techs and are marked so the offer,
 * the panel and the :production: threshold can tell them apart. Everything else
 * treats the two identically — that is the whole point of "wonders are techs".
 */
export const TECHS = (raw.techs ?? []).map((t) => ({ ...t, isWonder: false }))
export const WONDERS = (raw.wonders ?? []).map((w) => ({ ...w, isWonder: true }))
export const DRAFTABLE = [...TECHS, ...WONDERS]
export const BUILDINGS = raw.buildings ?? []
export const TIER_UNLOCKS = raw.tierUnlocks ?? []

/** Content buildings by id — the def the engine reads (name/icon/placement/effects). */
export const CONTENT_BUILDINGS = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, { key: b.id, name: b.name, icon: b.icon ?? '/sprites/ui/building.png', placement: b.placement ?? [], effects: b.effects ?? [], blurb: b.description }]),
)
export const contentBuilding = (id) => CONTENT_BUILDINGS[id] ?? null

/**
 * The nine unit classes, in the schema's canonical order regardless of how the
 * file happens to be sorted. `data/units.js` turns these into the unit defs the
 * engine uses — this is the ONLY definition of a unit's base stat line.
 */
export const UNIT_CLASS_DEFS = UNIT_CLASSES
  .map((k) => (raw.unitClasses ?? []).find((c) => c.id === k))
  .filter(Boolean)

const BY_ID = new Map(DRAFTABLE.map((d) => [d.id, d]))
export const draftableById = (id) => BY_ID.get(id) ?? null

/** Highest era that holds anything at all — how far the content can carry a run. */
export const CONTENT_MAX_ERA = DRAFTABLE.reduce((m, d) => Math.max(m, d.era ?? 0), 0)

/** Fresh draft state. Branch eras all start at Stone. */
export function initialDraft() {
  const branchEra = {}
  const branchTaken = {}
  for (const q of QUADRANTS) { branchEra[q] = 0; branchTaken[q] = 0 }
  return {
    taken: new Set(),   // ids of every tech drafted AND wonder built
    branchEra,          // per branch: which era's pool it draws from
    branchTaken,        // per branch: how many taken AT the current era
    // WONDERS are no longer drafted like techs. They are a separate track built
    // by :production: thresholds, offered by TIER: each threshold reaches into the
    // lowest tier that still has an unbuilt wonder. This is the pointer past the
    // tiers already resolved.
    wonderTier: 0,
  }
}

/** A wonder's tier as a 0-based index (I → 0 … IX → 8). */
export const wonderTierIndex = (w) => Math.max(0, WONDER_TIERS.indexOf(w.tier))

/**
 * The lowest tier index at or beyond `draft.wonderTier` that still holds an
 * unbuilt wonder — what the NEXT :production: threshold offers. -1 when every
 * tier is exhausted (from then on, production converts to progress).
 */
export function nextWonderTier(draft) {
  for (let ti = draft.wonderTier ?? 0; ti < WONDER_TIERS.length; ti++) {
    if (WONDERS.some((w) => wonderTierIndex(w) === ti && !draft.taken.has(w.id))) return ti
  }
  return -1
}

/** The unbuilt wonders of a tier — the choices a :production: threshold offers. */
export function wondersForTier(draft, ti) {
  return WONDERS.filter((w) => wonderTierIndex(w) === ti && !draft.taken.has(w.id))
}

/** Group names already committed to — every other member of them is barred. */
function lockedGroups(taken) {
  const out = new Set()
  for (const id of taken) {
    const d = BY_ID.get(id)
    if (d?.group) out.add(d.group)
  }
  return out
}

/** Is this row a legal offer right now? */
function offerable(d, draft, locked) {
  if (draft.taken.has(d.id)) return false
  // WONDERS are built by :production: thresholds (offered by tier), not drafted in
  // the :progress: pool — so they never appear here.
  if (d.isWonder) return false
  if (d.era !== draft.branchEra[d.quadrant]) return false
  if (d.group && locked.has(d.group)) return false
  for (const r of d.requires ?? []) if (!draft.taken.has(r)) return false
  return true
}

/** Everything that could be offered, across all three branches. */
export function draftPool(draft) {
  const locked = lockedGroups(draft.taken)
  return DRAFTABLE.filter((d) => QUADRANTS.includes(d.quadrant) && offerable(d, draft, locked))
}

/** The pool for one branch — what the progress panel reports as "remaining". */
export function branchPool(draft, quadrant) {
  return draftPool(draft).filter((d) => d.quadrant === quadrant)
}

/**
 * Draw an offer. `exclude` is the hand being rerolled: it is only dropped when
 * enough is left to deal a genuinely different one, since a reroll that can hand
 * back two of the same three cards is not a reroll.
 */
export function drawOffers(draft, size, rng = Math.random, exclude = null) {
  const all = draftPool(draft)
  const pool = exclude && all.length > size
    ? all.filter((d) => !exclude.some((e) => e.id === d.id))
    : all.slice()
  const out = []
  while (out.length < size && pool.length) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])
  }
  return out
}

/**
 * Record a draft pick. Returns `{ advanced }` — whether the branch rolled over
 * into the next era, which is what drives the map reveal.
 *
 * A branch advances the moment it has taken `thresholdFor(era)` rows of that
 * era. Wonders count: they are drafted from the same pool and cost the same
 * pick, so excluding them would make a wonder a free tempo gain.
 */
export function recordPick(draft, row) {
  const q = row.quadrant
  draft.taken.add(row.id)
  draft.branchTaken[q] += 1
  let advanced = false
  const need = thresholdFor(draft.branchEra[q])
  if (need > 0 && draft.branchTaken[q] >= need) {
    draft.branchEra[q] += 1
    draft.branchTaken[q] = 0
    advanced = true
  }
  return { advanced }
}

/**
 * PALIMPSEST: a uniformly-random UNCHOSEN tech from an era EARLIER than `era`.
 * It ignores the normal pool rules (branch, current-tier, group) — it is a free
 * recovery, not an offer — and never returns a wonder. `null` if nothing is left.
 */
export function randomPriorTech(draft, era, rng = Math.random) {
  const pool = TECHS.filter((t) => !draft.taken.has(t.id) && (t.era ?? 0) < era)
  if (!pool.length) return null
  return pool[Math.floor(rng() * pool.length)]
}

/** How far along the current era a branch is: `{ have, need }`. */
export const branchProgress = (draft, q) => ({
  have: draft.branchTaken[q],
  need: thresholdFor(draft.branchEra[q]),
})

/**
 * The reveal era: the FURTHEST any branch has reached, not a nominated one.
 * Tier unlocks are visibility and nothing else, so pushing hard on Military
 * still opens the map.
 */
export const revealEraOf = (draft) => Math.max(0, ...QUADRANTS.map((q) => draft.branchEra[q]))
