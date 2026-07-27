// Sample progress web (v3 prototype).
//
// Every node is a REAL advancement from the v2 content registries — name, what
// it unlocks, and its effect text are taken verbatim from v2's units /
// buildings / policies / pops / wonders defs. What is invented is the SHAPE.
// This exists to exercise the radial-tree UI, not to be v3's real tech tree.
//
// NOTE: a few effects still reference :legitimacy:, which v3 has dropped. Left
// as-is so this file stays a faithful sample of v2 content.
//
// ---------------------------------------------------------------------------
// STRUCTURE — the rules that make the drawing legible
// ---------------------------------------------------------------------------
// Each quadrant is an identical 3 → 4 → 5 → 6 tree, so all four rings hold
// 12 / 16 / 20 / 24 nodes. Every quadrant uses this same parent template:
//
//   ring 1 parents: [0] [0] [1] [2]        → parent 0 FORKS
//   ring 2 parents: [0] [1] [2] [2] [3]    → parent 2 FORKS
//   ring 3 parents: [0,1] [2] [2] [3] [4] [4]
//                    ^ DIAMOND            ^ fork      ^ fork
//
// Two properties fall out of that, and both are asserted by
// `validateStructure()` (run by sims/progress.mjs):
//
//  1. NO CROSSED EDGES. Within a quadrant every ring is laid out in index
//     order, and each ring's parent-index sequence is non-decreasing. Two
//     straight edges between concentric arcs cannot cross when both endpoint
//     orders agree, so the drawing is planar by construction rather than by eye.
//
//  2. FORKS ARE ALWAYS SIBLINGS. A parent has either exactly one child, or a
//     set of children that are mutually exclusive — choosing one kills the rest
//     permanently. Nothing else is ever exclusive, so `excludes` is derived
//     rather than hand-listed.
//
// The DIAMOND is the "A → B or C → D" case: D lists both fork descendants as
// parents, and `prereqs` is ANY-of, so either branch reaches it. That is what
// lets a split RE-UNIFY.

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

const ICON = {
  building: '/sprites/ui/building.png',
  policy: '/sprites/ui/policy.png',
  pop: '/sprites/ui/pop.png',
  wonder: '/sprites/ui/wonder.png',
  melee: '/sprites/ui/melee.png',
  ranged: '/sprites/ui/ranged.png',
  cavalry: '/sprites/ui/cavalry.png',
  siege: '/sprites/ui/siege.png',
}

// The parent template every quadrant follows (see the header).
const PARENTS = [
  null,
  [[0], [0], [1], [2]],
  [[0], [1], [2], [2], [3]],
  [[0, 1], [2], [2], [3], [4], [4]],
]

// [name, kind, iconKey, unlocks, effect] — all five fields lifted from v2.
const TREE = {
  society: [
    [
      ['Burial Rites', 'policy', 'policy', 'Burial Rites', 'Whenever a unit dies, gain :progress: equal to its :attack:.'],
      ['Language', 'policy', 'policy', 'Language', 'Each Citizen also produces +1 :progress: per tick.'],
      ['Code of Laws', 'policy', 'policy', 'Code of Laws', 'Unit and building repair costs are reduced by 75%.'],
    ],
    [
      ['Mysticism', 'wonder', 'wonder', 'Stonehenge', 'At the end of each era, gain +25 :legitimacy:.'],
      ['Monotheism', 'pop', 'pop', 'Priest', 'At the end of each era, gain +1 :legitimacy: per Priest.'],
      ['Writing', 'policy', 'policy', 'Writing', 'Reduce :progress: threshold by 5%.'],
      ['Diplomatic Marriage', 'policy', 'policy', 'Diplomatic Marriage', 'Mercenaries are hired 3 upgrade levels higher.'],
    ],
    [
      ['Organized Religion', 'building', 'building', 'Temple', 'On completion, gain +20 :legitimacy:. At the end of each era, gain :gold: equal to 3× your :legitimacy:.'],
      ['Scriptoria', 'policy', 'policy', 'Scriptoria', 'Each Citizen also produces +1 :progress: per tick.'],
      ['Poetry', 'policy', 'policy', 'Poetry', 'At the end of each era, gain :progress: equal to the total :attack: of surviving units.'],
      ['Philosophy', 'policy', 'policy', 'Philosophy', 'Reduce :progress: threshold by 6%.'],
      ['Feudalism', 'policy', 'policy', 'Feudalism', 'All :food: outputs +30%, but all :progress: outputs −20%.'],
    ],
    [
      ['Theocracy', 'policy', 'policy', 'Theocracy', 'At the end of each era, gain +25 :legitimacy:.'],
      ['Civil Rights', 'policy', 'policy', 'Civil Rights', 'All :progress: outputs +30%, but all :food: outputs −20%.'],
      ['Freedom of Religion', 'policy', 'policy', 'Freedom of Religion', 'All :progress: outputs +30%, but :legitimacy: losses are doubled.'],
      ['Nationalism', 'policy', 'policy', 'Nationalism', 'Whenever a unit dies, gain :gold: equal to its :attack:.'],
      ['Manorial Levy', 'policy', 'policy', 'Manorial Levy', 'Each Citizen also produces +1 :production: per tick.'],
      ['Inquisition', 'wonder', 'wonder', 'Hagia Sophia', 'On completion, double current :legitimacy:. Each era start: :production: = 2× :legitimacy:.'],
    ],
  ],
  technology: [
    [
      ['Tools', 'pop', 'pop', 'Builder', 'A specialist who works raw material into :production:.'],
      ['Astrology', 'pop', 'pop', 'Astrologer', 'A specialist who reads the sky for :progress:.'],
      ['Pottery', 'building', 'building', 'Kiln', 'Produces 2 :production: per tick, plus 1 for each adjacent building.'],
    ],
    [
      ['Mathematics', 'policy', 'policy', 'Mathematics', 'On unlock, gain +2 free :production: builds.'],
      ['Machinery', 'building', 'building', 'Workshop', 'Produces 7 :production: per tick.'],
      ['Alphabet', 'policy', 'policy', 'Alphabet', 'When you build a :progress: building, upgrade it once for free.'],
      ['Metallurgy', 'building', 'building', 'Forge', 'Produces 7 :production: per tick.'],
    ],
    [
      ['Engineering', 'policy', 'policy', 'Engineering', 'On unlock, gain +2 free :production: builds.'],
      ['Mass Production', 'building', 'building', 'Factory', 'Produces 16 :production: per tick.'],
      ['University', 'pop', 'pop', 'Scholar', 'A specialist who produces a great deal of :progress:.'],
      ['Optics', 'policy', 'policy', 'Optics', ':naval: units deal +50% :attack:.'],
      ['Steel', 'policy', 'policy', 'Steel', 'All units deal +15% :attack:.'],
    ],
    [
      ['Printing Press', 'policy', 'policy', 'Printing Press', 'Reduce :progress: threshold by 7%.'],
      ['Scientific Method', 'pop', 'pop', 'Scientist', 'A specialist who produces a great deal of :progress:.'],
      ['Physics', 'building', 'building', 'Windmill', 'Units & buildings in range gain +1 free upgrade level.'],
      ['Clocks', 'policy', 'policy', 'Clocks', "Each era's development lasts 6 more ticks."],
      ['Blueprints', 'policy', 'policy', 'Blueprints', 'Building repair costs 50% less :gold:.'],
      ['Replaceable Parts', 'policy', 'policy', 'Mass Production', 'On unlock, gain +2 free :production: builds.'],
    ],
  ],
  economy: [
    [
      ['Agriculture', 'pop', 'pop', 'Farmer', 'A specialist who works the land for :food:.'],
      ['Bartering', 'pop', 'pop', 'Trader', 'A specialist who deals for :gold:.'],
      ['Fishing', 'building', 'building', 'Pier', 'Produces 200 :food: at the end of combat.'],
    ],
    [
      ['The Plough', 'building', 'building', 'Farm', 'Produces +5 :food: per tick for each adjacent Plains tile (including its own).'],
      ['Granaries', 'policy', 'policy', 'Granaries', 'Double the plains terrain economy bonus.'],
      ['Coinage', 'building', 'building', 'Mint', 'Produces :gold: each tick equal to 5% of your current :legitimacy:.'],
      ['Shipbuilding', 'building', 'building', 'Harbor', 'Produces :production: per tick equal to 6 × (units in range).'],
    ],
    [
      ['Irrigation', 'policy', 'policy', 'Irrigation', 'Reduce :food: threshold by 6%.'],
      ['Crop Rotation', 'policy', 'policy', 'Crop Rotation', 'Reduce :food: threshold by 7%.'],
      ['Banking', 'building', 'building', 'Bank', 'At the end of each era, gain :gold: equal to 5% of unspent :gold:.'],
      ['Trade Networks', 'building', 'building', 'Market', 'Produces 7 :gold: per tick.'],
      ['Compass', 'building', 'building', 'Caravansary', 'Produces :gold: per tick equal to 10 + 5 × (other Caravansaries).'],
    ],
    [
      ['Canning', 'policy', 'policy', 'Canning', 'Each Citizen also produces +1 :food: per tick.'],
      ['Usury', 'policy', 'policy', 'Usury', 'At the end of each era, gain :gold: equal to 10% of your unspent :gold:.'],
      ['Guilds', 'policy', 'policy', 'Guilds', 'Every specialist produces +2 of its highest output.'],
      ['Milling', 'building', 'building', 'Lumber Mill', "Placed on a forest tile. Produces :production: per tick equal to 4 × the forest tile's economy-bonus value."],
      ['Merchant Navy', 'policy', 'policy', 'Merchant Navy', ':naval: units also produce +2 :gold: per tick.'],
      ['Mercantilism', 'policy', 'policy', 'Mercantilism', 'Total :gold: output +25%.'],
    ],
  ],
  military: [
    [
      ['Hunting', 'unit', 'melee', 'Hunter', 'Gains :food: on a kill.'],
      ['The Sling', 'unit', 'ranged', 'Slinger', 'The earliest :ranged: skirmisher.'],
      ['Pack Bonding', 'unit', 'cavalry', 'Wolf', 'After attacking, shifts to an adjacent empty valid tile.'],
    ],
    [
      ['Tribalism', 'policy', 'policy', 'Tribalism', 'Each unit gains +2 :attack: for every other friendly unit of the same type on the board.'],
      ['Alloying', 'unit', 'melee', 'Spearman', '+50% :attack: versus :cavalry:-type enemies.'],
      ['Archery', 'unit', 'ranged', 'Archer', 'A :ranged: bowman.'],
      ['The Wheel', 'unit', 'cavalry', 'Chariot', 'A bronze :cavalry: war chariot.'],
    ],
    [
      ['Professional Soldiers', 'pop', 'pop', 'Soldier', 'Every friendly unit gains +1 :attack: per Soldier.'],
      ['Armor', 'policy', 'policy', 'Armor', 'All units gain +1 :defense:.'],
      ['Siege', 'unit', 'siege', 'Ballista', 'Single-target; pushes the target back 1 tile.'],
      ['Compound Bow', 'policy', 'policy', 'Compound Bow', ':ranged: units deal +50% :attack:.'],
      ['Stirrups', 'unit', 'cavalry', 'Heavy Cavalry', 'A shock :cavalry: charger.'],
    ],
    [
      ['Military Tradition', 'policy', 'policy', 'Military Tradition', 'Overbuilding a unit keeps its upgrade levels.'],
      ['Counterweights', 'unit', 'siege', 'Trebuchet', 'Splash, range 4.'],
      ['Fortification', 'building', 'building', 'Stone Wall', 'A blocker. Upgrades add +1 :defense:/level.'],
      ['Crossbows', 'unit', 'ranged', 'Crossbowman', 'A :ranged: crossbowman.'],
      ['Dressage', 'policy', 'policy', 'Dressage', ':cavalry: units deal +50% :attack:.'],
      ['Crusades', 'unit', 'melee', 'Knight', 'An armoured :melee: knight.'],
    ],
  ],
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// --- Build the flat node list ----------------------------------------------
export const PROGRESS_NODES = []
const idAt = {} // quadrant -> ring -> index -> id

for (const [quadrant, rings] of Object.entries(TREE)) {
  idAt[quadrant] = rings.map((ring) => ring.map(([name]) => `${quadrant}-${slug(name)}`))
  rings.forEach((ring, r) => {
    ring.forEach(([name, kind, iconKey, unlocks, effect], i) => {
      const parents = r === 0 ? [] : PARENTS[r][i].map((pi) => idAt[quadrant][r - 1][pi])
      PROGRESS_NODES.push({
        id: idAt[quadrant][r][i],
        name, kind, unlocks, effect,
        quadrant, ring: r, index: i,
        icon: ICON[iconKey],
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

  return v
}
