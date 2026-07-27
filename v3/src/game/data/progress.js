// The progress web (v3).
//
// 100 nodes: four quadrants — Society / Technology / Economy / Military — each
// an identical 3 → 4 → 5 → 6 → 7 tree, so the five rings hold 12 / 16 / 20 / 24 / 28.
//
// ---------------------------------------------------------------------------
// STRUCTURE — the rules that make the drawing legible
// ---------------------------------------------------------------------------
// Every quadrant uses this same parent template:
//
//   ring 1 parents: [0] [0] [1] [2]              → parent 0 FORKS
//   ring 2 parents: [0] [1] [2] [2] [3]          → parent 2 FORKS
//   ring 3 parents: [0,1] [2] [2] [3] [4] [4]    → DIAMOND, then two FORKS
//   ring 4 parents: [0] [1] [1] [2] [3] [4] [5]  → parent 1 FORKS
//
// Two properties fall out of that, and both are asserted by `validateStructure()`
// (run by `sims/progress.mjs`):
//
//  1. NO CROSSED EDGES. Within a quadrant every ring is laid out in index order,
//     and each ring's parent-index sequence is non-decreasing. Two straight edges
//     between concentric arcs cannot cross when both endpoint orders agree, so the
//     drawing is planar by construction rather than by eye.
//
//  2. FORKS ARE ALWAYS SIBLINGS. A parent has either exactly one child, or a set
//     of children that are mutually exclusive — choosing one kills the rest
//     permanently. Nothing else is ever exclusive, so `excludes` is derived
//     rather than hand-listed.
//
// The DIAMOND is the "A → B or C → D" case: D lists both fork descendants as
// parents, and `prereqs` is ANY-of, so either branch reaches it. That is what
// lets a split RE-UNIFY.
//
// ---------------------------------------------------------------------------
// EFFECTS — a small vocabulary, applied by GameManager._applyEffects
// ---------------------------------------------------------------------------
// Deliberately NOT one bespoke effect per node: ~12 kinds with parameters, so
// nodes stay one line each and the tree can be re-shaped without re-writing the
// engine. Effect TEXT is generated from the data (see `describe`), so a node's
// description can never drift from what it actually does.

import { UNIT_DEFS, UNIT_TYPES, weaponTier, armorTier } from './units.js'
import { BUILDING_DEFS } from './buildings.js'

/** Nodes that must be chosen from a ring before the next ring appears. */
export const RING_UNLOCK = 6

// `nudge` pushes the quadrant LABEL clear of the outermost node column. The
// side labels sit at 0°/180°, where the text runs straight into that column, so
// they need shifting by roughly their own half-width; the top/bottom ones are
// clear already because text is wide, not tall.
export const QUADRANTS = {
  society: { key: 'society', name: 'Society', from: -135, to: -45, nudge: { x: 0, y: -14 } },
  technology: { key: 'technology', name: 'Technology', from: -45, to: 45, nudge: { x: 78, y: 0 } },
  economy: { key: 'economy', name: 'Economy', from: 45, to: 135, nudge: { x: 0, y: 14 } },
  military: { key: 'military', name: 'Military', from: 135, to: 225, nudge: { x: -64, y: 0 } },
}
export const QUADRANT_LIST = Object.values(QUADRANTS)

// --- effect constructors ----------------------------------------------------
const terrain = (t, yields) => ({ kind: 'terrain', terrain: t, yields })
const improved = (yields) => ({ kind: 'improved', yields })
const mult = (res, pct) => ({ kind: 'mult', res, pct })
const thresh = (res, pct) => ({ kind: 'threshold', res, pct })
// Two ways to be given soldiers, and the distinction matters:
//   unit(key, n)   — UNLOCKS a better unit of its class and grants n. Each unit
//                    key appears exactly ONCE in the tree (asserted).
//   troops(type,n) — just bodies: n of whatever the best unlocked unit of that
//                    class currently is. If the class is still empty it opens
//                    with the base unit, so a grant can never be stranded.
//
// Units are described by CLASS, never by name — "grants 2 :melee: units". Which
// unit you actually get is revealed when you place it.
const unit = (u, grant = 1) => ({ kind: 'unit', unit: u, grant })
const troops = (type, grant = 1) => ({ kind: 'troops', type, grant })
// Weapons/armour are TIERS: taking one re-arms the civilization, replacing the
// tier below rather than stacking on it. You start on Clubs and Hides.
const weapon = (tier) => ({ kind: 'weapon', tier })
const armor = (tier) => ({ kind: 'armor', tier })
const umod = (type, mod) => ({ kind: 'unitMod', type, mod })
const build = (b, grant = 1) => ({ kind: 'building', building: b, grant })
const road = (yields) => ({ kind: 'road', yields })
const settle = (s) => ({ kind: 'settle', settle: s })
const city = (mod) => ({ kind: 'city', mod })
const palace = (mod) => ({ kind: 'palace', mod })

// ---------------------------------------------------------------------------
// The tree. Each entry is [name, ...effects]; quadrant, ring, parents and
// exclusivity all come from the template above.
// ---------------------------------------------------------------------------
const TREE = {
  // NOTE: every RING-0 node grants a unit or a building. The opening eras only
  // ever draw from ring 0, so a ring of pure passive bonuses left the first two
  // eras with an empty board and nothing to place.
  economy: [
    [
      ['Foraging', build('lumbercamp'), terrain('forest', { food: 1 })],
      ['Bartering', build('market'), mult('gold', 0.1)],
      ['Stone Tools', build('quarry'), terrain('hills', { production: 1 })],
    ],
    [
      ['Agriculture', build('granary'), terrain('plains', { food: 2 })],
      ['Horticulture', build('lumbercamp'), terrain('forest', { food: 2 })],
      ['Pottery', build('granary', 2)],
      ['Quarrying', troops('defense'), terrain('mountain', { production: 2 }), settle('mountain')],
    ],
    [
      ['Irrigation', thresh('food', -0.08)],
      ['Terrace Farming', terrain('hills', { food: 2 })],
      ['Marketplaces', build('market')],
      ['Caravans', mult('gold', 0.25)],
      ['Masonry', build('quarry'), unit('stonewall')],
    ],
    [
      ['Crop Rotation', mult('food', 0.2)],
      ['Coinage', mult('gold', 0.3)],
      ['Guilds', build('workshop')],
      ['Trade Roads', road({ gold: 1 })],
      ['Aqueducts', city({ growth: 0.5 })],
      ['Mining', build('mine')],
    ],
    [
      ['Granaries', build('granary', 2), thresh('food', -0.1)],
      ['Currency', mult('gold', 0.4)],
      ['Treasury', city({ yields: { gold: 3 } })],
      ['Manufactories', mult('production', 0.3)],
      ['Highways', road({ production: 1 })],
      ['Sanitation', city({ growth: 0.5, yields: { food: 2 } })],
      ['Deep Shafts', terrain('mountain', { production: 4 }), build('mine')],
    ],
  ],

  society: [
    [
      ['Oral Tradition', build('amphitheater'), mult('progress', 0.1)],
      ['Fire Rites', troops('melee'), terrain('tundra', { progress: 2 })],
      ['Burial Rites', build('temple'), city({ yields: { progress: 1 } })],
    ],
    [
      ['Storytelling', build('amphitheater'), mult('progress', 0.2)],
      ['Cave Painting', build('library')],
      ['Shamanism', build('temple', 2)],
      ['Ancestor Cult', troops('melee', 2), city({ yields: { progress: 3 } })],
    ],
    [
      ['Language', thresh('progress', -0.08)],
      ['Symbolism', improved({ progress: 1 })],
      ['Priesthood', city({ yields: { progress: 2 }, growth: 0.25 })],
      ['Mysticism', build('temple', 2)],
      ['Tribal Council', troops('melee', 2)],
    ],
    [
      ['Writing', build('library'), mult('progress', 0.2)],
      ['Temples', build('temple', 2)],
      ['Divine Right', palace({ def: 120 }), city({ yields: { progress: 3 } })],
      ['Astrology', settle('tundra'), terrain('tundra', { progress: 3 })],
      ['Chieftains', mult('food', 0.25)],
      ['Warbands', troops('melee', 2)],
    ],
    [
      ['Philosophy', thresh('progress', -0.12), mult('progress', 0.25)],
      ['Monuments', build('amphitheater', 2), improved({ progress: 2 })],
      ['Pilgrimage', city({ yields: { progress: 5 } })],
      ['Codified Law', mult('gold', 0.2), mult('progress', 0.2)],
      ['Calendar', thresh('food', -0.1), thresh('progress', -0.06)],
      ['Feudal Levy', troops('melee', 3)],
      ['Standing Army', troops('melee', 3), armor('ironmail')],
    ],
  ],

  // You begin the game on CLUBS and HIDES. The military quadrant is where you
  // re-arm out of them — and the weapon chain is deliberately reachable through
  // Technology as well (Bronze Casting, Metallurgy), so there are two routes to
  // being properly armed and neither quadrant is compulsory.
  military: [
    [
      ['Flint Knapping', troops('melee'), umod('melee', { atk: 3 })],
      ['Tanning', unit('mudbrick'), armor('leather')],
      ['Hunting', troops('melee', 2), terrain('forest', { food: 1 })],
    ],
    [
      ['Bronze Working', weapon('bronze'), unit('spearman')],
      ['Slings', unit('slinger', 2), umod('ranged', { atk: 3 })],
      ['Scale Armour', armor('bronzemail')],
      ['Trapping', troops('melee', 2), troops('defense')],
    ],
    [
      ['Smithing', umod('melee', { atk: 4 }), umod('cavalry', { atk: 4 })],
      ['Archery', unit('archer', 2), umod('ranged', { range: 1 })],
      ['Mud Brick', troops('defense', 3)],
      ['Palisades', unit('palisade', 2)],
      ['Horseback Riding', unit('rider', 2), umod('cavalry', { acts: 1 })],
    ],
    [
      ['Iron Working', weapon('iron'), unit('legion')],
      ['Watchtowers', unit('watchtower', 2)],
      ['Fortification', umod('defense', { hp: 60 })],
      ['Stockades', troops('defense', 3), umod('defense', { hp: 40 })],
      ['Chariotry', unit('chariot', 2)],
      ['Cavalry Doctrine', umod('cavalry', { atk: 6, acts: 1 })],
    ],
    [
      ['Steel', weapon('steel')],
      ['Siege Craft', troops('defense', 3), umod('ranged', { range: 1 })],
      ['Ballistics', unit('crossbowman', 2), umod('ranged', { atk: 10 })],
      ['Stone Walls', troops('defense', 2)],
      ['Masonry Forts', troops('defense', 2), umod('defense', { hp: 80 })],
      ['War Chariots', troops('cavalry', 3)],
      ['Horse Archery', unit('horseman', 2), umod('cavalry', { range: 1 })],
    ],
  ],

  technology: [
    [
      ['Firemaking', build('workshop'), mult('production', 0.1)],
      ['Toolmaking', build('mine'), terrain('hills', { production: 1 })],
      ['Weaving', troops('melee'), terrain('plains', { gold: 1 })],
    ],
    [
      ['Kilns', build('workshop', 2)],
      ['Smelting', build('mine'), mult('production', 0.25)],
      ['The Lever', troops('defense', 2), terrain('mountain', { production: 2 })],
      ['Basketry', build('granary'), thresh('food', -0.06)],
    ],
    [
      ['Brickwork', build('quarry'), troops('defense')],
      ['Bronze Casting', mult('production', 0.3), weapon('bronze')],
      ['The Wheel', road({ gold: 1 }), troops('cavalry')],
      ['The Plough', terrain('plains', { food: 3 })],
      ['Textiles', mult('gold', 0.2), armor('bronzemail')],
    ],
    [
      ['Metallurgy', mult('production', 0.35), weapon('iron')],
      ['Axles', road({ production: 1 }), troops('cavalry')],
      ['Cartography', settle('ocean'), terrain('coast', { gold: 2 })],
      ['Crop Terracing', terrain('hills', { food: 2 }), terrain('forest', { food: 1 })],
      ['Dyeworks', mult('gold', 0.3)],
      ['Looms', build('market', 2)],
    ],
    [
      ['Engineering', build('mine', 2), city({ yields: { production: 2 } })],
      ['Shipbuilding', settle('ocean'), build('harbor', 2)],
      ['Chariot Works', troops('cavalry', 2), umod('cavalry', { acts: 1 })],
      ['Navigation', terrain('ocean', { gold: 3 }), build('harbor')],
      ['Fertiliser', mult('food', 0.3), thresh('food', -0.08)],
      ['Glassworks', build('library', 2)],
      ['Mass Weaving', mult('gold', 0.25), mult('production', 0.15)],
    ],
  ],
}

// The parent template every quadrant follows (see the header).
const PARENTS = [
  null,
  [[0], [0], [1], [2]],
  [[0], [1], [2], [2], [3]],
  [[0, 1], [2], [2], [3], [4], [4]],
  [[0], [1], [1], [2], [3], [4], [5]],
]

// ---------------------------------------------------------------------------
// Generated description + icon — derived from the effects so they can't drift
// ---------------------------------------------------------------------------
const TOKEN = { food: ':food:', production: ':production:', gold: ':gold:', progress: ':progress:' }
const yieldText = (y) => Object.entries(y).filter(([, v]) => v).map(([k, v]) => `+${v} ${TOKEN[k]}`).join(' ')
const pct = (p) => `${p > 0 ? '+' : ''}${Math.round(p * 100)}%`
const TYPE_TOKEN = { melee: ':melee:', ranged: ':ranged:', cavalry: ':cavalry:', defense: ':fort:' }
const times = (n) => (n > 1 ? ` ×${n}` : '')

const MOD_TEXT = {
  atk: (v) => `+${v} :attack:`,
  hp: (v) => `+${v} :defense:`,
  acts: (v) => `+${v} :speed:`,
  range: (v) => `+${v} range`,
}

const plural = (n, s) => `${n} ${s}${n > 1 ? 's' : ''}`

function describeOne(fx) {
  switch (fx.kind) {
    case 'terrain': return `${yieldText(fx.yields)} on every ${fx.terrain} tile you control.`
    case 'improved': return `${yieldText(fx.yields)} on every improved tile.`
    case 'mult': return `All ${TOKEN[fx.res]} output ${pct(fx.pct)}.`
    case 'threshold': return `${TOKEN[fx.res]} thresholds ${pct(fx.pct)}.`
    // Units are described by CLASS, never by name — which unit you actually get
    // is the reveal when you place it.
    case 'troops': return `Grants ${plural(fx.grant, `${TYPE_TOKEN[fx.type]} unit`)} to place.`
    case 'unit': return `A stronger ${TYPE_TOKEN[UNIT_DEFS[fx.unit].type]} unit — all future grants of that class use it. Grants ${plural(fx.grant, 'one')} to place.`
    case 'weapon': return `WEAPONS → ${weaponTier(fx.tier).name}. Re-arms every :melee: and :cavalry: unit: +${weaponTier(fx.tier).atk} :attack: over Clubs.`
    case 'armor': return `ARMOR → ${armorTier(fx.tier).name}. Re-equips every unit: +${armorTier(fx.tier).hp} :defense: over Hides.`
    case 'unitMod': return `All ${TYPE_TOKEN[fx.type]} units gain ${Object.entries(fx.mod).map(([k, v]) => MOD_TEXT[k](v)).join(', ')}.`
    // `first` is stamped on the earliest node in the tree that grants this
    // building — everything after it reads as more of the same, so no two nodes
    // ever both claim to "unlock" it.
    case 'building': return fx.first
      ? `Unlocks the :building: ${BUILDING_DEFS[fx.building].name}${times(fx.grant)}, and grants one to place.`
      : `Grants ${plural(fx.grant, `${BUILDING_DEFS[fx.building].name}`)} to place.`
    case 'road': return `Roads link your cities and give ${yieldText(fx.yields)} to every tile they touch.`
    case 'settle': return `You may now settle ${fx.settle} tiles.`
    case 'city': return [
      fx.mod.yields ? `Every city produces ${yieldText(fx.mod.yields)}.` : '',
      fx.mod.growth ? `Cities grow ${pct(fx.mod.growth)} faster.` : '',
    ].filter(Boolean).join(' ')
    case 'palace': return `The palace gains +${fx.mod.def} :defense:.`
    default: return ''
  }
}
const describe = (fxs) => fxs.map(describeOne).filter(Boolean).join(' ')

// Icon is picked from the node's FIRST effect — that is the headline.
const ICON = {
  building: '/sprites/ui/building.png',
  road: '/sprites/ui/utility-building.png',
  settle: '/sprites/ui/pop.png',
  city: '/sprites/ui/pop.png',
  palace: '/sprites/ui/wonder.png',
  weapon: '/sprites/icons/attack.png',
  armor: '/sprites/icons/defense.png',
  terrain: '/sprites/ui/utility.png',
  improved: '/sprites/ui/utility.png',
  threshold: '/sprites/ui/policy.png',
}
const RES_ICON = {
  food: '/sprites/ui/food.png', gold: '/sprites/ui/gold.png',
  production: '/sprites/ui/production.png', progress: '/sprites/ui/progress.png',
}
const UNIT_ICON = { melee: '/sprites/ui/melee.png', ranged: '/sprites/ui/ranged.png', cavalry: '/sprites/ui/cavalry.png', defense: '/sprites/ui/defense.png' }

function iconFor(fxs) {
  const f = fxs[0]
  if (f.kind === 'unit') return UNIT_ICON[UNIT_DEFS[f.unit].type]
  if (f.kind === 'troops' || f.kind === 'unitMod') return UNIT_ICON[f.type]
  if (f.kind === 'mult') return RES_ICON[f.res]
  if (f.kind === 'terrain' || f.kind === 'improved') {
    const res = Object.keys(f.yields)[0]
    return RES_ICON[res] ?? ICON.terrain
  }
  return ICON[f.kind] ?? '/sprites/ui/policy.png'
}

const TYPE_NAME = { melee: 'melee', ranged: 'ranged', cavalry: 'cavalry', defense: 'defensive' }

/** Short "what does this give me" line for the offer card. */
function unlocksFor(fxs) {
  const u = fxs.find((f) => f.kind === 'unit')
  if (u) return `a better ${TYPE_NAME[UNIT_DEFS[u.unit].type]} unit`
  const t = fxs.find((f) => f.kind === 'troops')
  if (t) return plural(t.grant, `${TYPE_NAME[t.type]} unit`)
  const b = fxs.find((f) => f.kind === 'building')
  if (b) return `${BUILDING_DEFS[b.building].name}${times(b.grant)}`
  const w = fxs.find((f) => f.kind === 'weapon')
  if (w) return weaponTier(w.tier).name
  const a = fxs.find((f) => f.kind === 'armor')
  if (a) return armorTier(a.tier).name
  const r = fxs.find((f) => f.kind === 'road')
  if (r) return 'Roads'
  const s = fxs.find((f) => f.kind === 'settle')
  if (s) return `${s.settle} settling`
  return 'a permanent bonus'
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Stamp `first` on the EARLIEST building grant of each key, walking the tree in
// ring order across all quadrants (a ring-0 Technology node comes before a
// ring-1 Economy one). Derived rather than hand-marked, so two nodes can never
// both claim to unlock the same building.
{
  const seen = new Set()
  const rings = Math.max(...Object.values(TREE).map((q) => q.length))
  for (let r = 0; r < rings; r++) {
    for (const quadrant of Object.values(TREE)) {
      for (const entry of quadrant[r] ?? []) {
        for (const fx of entry.slice(1)) {
          if (fx.kind !== 'building' || seen.has(fx.building)) continue
          seen.add(fx.building)
          fx.first = true
        }
      }
    }
  }
}

// --- Build the flat node list ----------------------------------------------
export const PROGRESS_NODES = []
const idAt = {} // quadrant -> ring -> index -> id

for (const [quadrant, rings] of Object.entries(TREE)) {
  idAt[quadrant] = rings.map((ring) => ring.map(([name]) => `${quadrant}-${slug(name)}`))
  rings.forEach((ring, r) => {
    ring.forEach(([name, ...fx], i) => {
      const parents = r === 0 ? [] : PARENTS[r][i].map((pi) => idAt[quadrant][r - 1][pi])
      PROGRESS_NODES.push({
        id: idAt[quadrant][r][i],
        name,
        effects: fx,
        effect: describe(fx),
        unlocks: unlocksFor(fx),
        kind: fx[0].kind,
        quadrant, ring: r, index: i,
        icon: iconFor(fx),
        prereqs: parents,
        excludes: [],
      })
    })
  })
}

const BY_ID = new Map(PROGRESS_NODES.map((n) => [n.id, n]))

// --- Derive exclusivity: any parent with >1 child forks -------------------
// Nothing else is ever exclusive, so there is no hand-maintained fork list to
// drift out of sync with the parent template.
export const FORK_GROUPS = []
{
  const childrenOf = new Map()
  for (const n of PROGRESS_NODES) {
    for (const p of n.prereqs) {
      if (!childrenOf.has(p)) childrenOf.set(p, [])
      childrenOf.get(p).push(n.id)
    }
  }
  for (const kids of childrenOf.values()) {
    if (kids.length < 2) continue
    FORK_GROUPS.push(kids)
    for (const a of kids) {
      for (const b of kids) if (a !== b && !BY_ID.get(a).excludes.includes(b)) BY_ID.get(a).excludes.push(b)
    }
  }
}

export const progressById = (id) => BY_ID.get(id) ?? null
export const MAX_RING = Math.max(...PROGRESS_NODES.map((n) => n.ring))

// ---------------------------------------------------------------------------
// Layout — polar, computed once. Ring 0 sits at RING0 so the hub stays clear.
// ---------------------------------------------------------------------------

export const RING0 = 250
export const RING_STEP = 175
export const NODE_SIZE = 72 // hexagon width in content px

export const ringRadius = (ring) => RING0 + ring * RING_STEP
const rad = (deg) => (deg * Math.PI) / 180

export const LAID_OUT = PROGRESS_NODES.map((n) => {
  const { from, to } = QUADRANTS[n.quadrant]
  const count = TREE[n.quadrant][n.ring].length
  // Even spread in INDEX order — combined with the non-decreasing parent
  // template, this is what guarantees no edge ever crosses another.
  const angle = rad(from + (to - from) * ((n.index + 1) / (count + 1)))
  const R = ringRadius(n.ring)
  return { ...n, angle, x: Math.cos(angle) * R, y: Math.sin(angle) * R }
})

export const LAID_OUT_BY_ID = new Map(LAID_OUT.map((n) => [n.id, n]))

/** Content half-extent needed to show every ring up to `maxRing`. */
export const extentFor = (maxRing) => ringRadius(maxRing) + NODE_SIZE * 1.6

// ---------------------------------------------------------------------------
// Structure check — run by sims/progress.mjs
// ---------------------------------------------------------------------------

/** Do segments AB and CD properly cross (shared endpoints don't count)? */
function segmentsCross(a, b, c, d) {
  const same = (p, q) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6
  if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) return false
  const cross = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x)
  const d1 = cross(a, b, c)
  const d2 = cross(a, b, d)
  const d3 = cross(c, d, a)
  const d4 = cross(c, d, b)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

/** Returns a list of structural violations (empty = good). */
export function validateStructure() {
  const v = []

  // 1. every non-root node has a parent, and every parent is in the ring inside it
  for (const n of PROGRESS_NODES) {
    if (n.ring === 0) {
      if (n.prereqs.length) v.push(`${n.id}: ring-0 node has prereqs`)
      continue
    }
    if (!n.prereqs.length) v.push(`${n.id}: no prereq`)
    for (const p of n.prereqs) {
      const pn = BY_ID.get(p)
      if (!pn) v.push(`${n.id}: unknown prereq ${p}`)
      else if (pn.ring !== n.ring - 1) v.push(`${n.id}: prereq ${p} is not in the ring inside it`)
    }
  }

  // 2. exclusivity only ever arises between siblings of one parent
  for (const n of PROGRESS_NODES) {
    for (const e of n.excludes) {
      const other = BY_ID.get(e)
      const shared = n.prereqs.some((p) => other.prereqs.includes(p))
      if (!shared) v.push(`${n.id} excludes ${e} without sharing a parent`)
    }
  }

  // 3. NO CROSSED EDGES
  const edges = []
  for (const n of LAID_OUT) {
    for (const p of n.prereqs) {
      const pn = LAID_OUT_BY_ID.get(p)
      edges.push({ a: { x: pn.x, y: pn.y }, b: { x: n.x, y: n.y }, label: `${p}->${n.id}` })
    }
  }
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (segmentsCross(edges[i].a, edges[i].b, edges[j].a, edges[j].b)) {
        v.push(`edges cross: ${edges[i].label} × ${edges[j].label}`)
      }
    }
  }

  // 4. every ring must offer at least RING_UNLOCK attainable nodes
  for (let r = 0; r <= MAX_RING; r++) {
    const inRing = PROGRESS_NODES.filter((n) => n.ring === r)
    const lostToForks = FORK_GROUPS
      .filter((g) => BY_ID.get(g[0]).ring === r)
      .reduce((sum, g) => sum + g.length - 1, 0)
    const attainable = inRing.length - lostToForks
    if (attainable < RING_UNLOCK) {
      v.push(`ring ${r} offers only ${attainable} attainable nodes (< ${RING_UNLOCK})`)
    }
  }

  // 5. every effect must name something real, and NO UNIT IS UNLOCKED TWICE —
  //    two techs that both "unlock the Mud Brick Wall" is a design smell, so it
  //    is a hard check rather than a review habit. Extra bodies of a class go
  //    through `troops`, which unlocks nothing.
  const unlockedBy = new Map()
  for (const n of PROGRESS_NODES) {
    for (const f of n.effects) {
      if (f.kind === 'unit') {
        if (!UNIT_DEFS[f.unit]) v.push(`${n.id}: unknown unit ${f.unit}`)
        if (unlockedBy.has(f.unit)) v.push(`${f.unit} unlocked twice: ${unlockedBy.get(f.unit)} and ${n.id}`)
        unlockedBy.set(f.unit, n.id)
      }
      if (f.kind === 'troops' && !UNIT_TYPES.includes(f.type)) v.push(`${n.id}: unknown unit class ${f.type}`)
      if (f.kind === 'building' && !BUILDING_DEFS[f.building]) v.push(`${n.id}: unknown building ${f.building}`)
    }
  }
  // The starting unit is never "unlocked" by a node — you begin with it.
  if (unlockedBy.has('warrior')) v.push('warrior is the starting unit and must not be a node unlock')

  return v
}
