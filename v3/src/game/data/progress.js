// Sample progress web (v3 prototype).
//
// Every node here is a REAL advancement from the v2 content registries — names,
// what they unlock, and their effect text are taken verbatim from v2's
// units / buildings / policies / pops / wonders defs. What is invented is the
// SHAPE: which quadrant a tech belongs to, its ring, its prerequisites and its
// exclusions. This exists to exercise the radial-tree UI, not to be v3's real
// tech tree.
//
// NOTE: a few effects still reference :legitimacy:, which v3 has dropped. Left
// as-is so this file stays a faithful sample of v2 content; it all gets
// re-authored when v3's real tree is designed.
//
// Structure:
//   - four QUADRANTS (Society / Technology / Economy / Military), 90° each
//   - RINGS growing outward; a ring becomes visible once RING_UNLOCK nodes from
//     the previous ring have been chosen
//   - `prereqs` is ANY-of (one satisfied prereq is enough), which is what lets a
//     forked branch RE-UNIFY at a later node
//   - `excludes` is mutual: choosing one side of a fork locks the other out
//     forever, and anything downstream of it with no other route in

/** Nodes that must be chosen from a ring before the next ring appears. */
export const RING_UNLOCK = 6

export const QUADRANTS = {
  society: { key: 'society', name: 'Society', from: -135, to: -45 },
  technology: { key: 'technology', name: 'Technology', from: -45, to: 45 },
  economy: { key: 'economy', name: 'Economy', from: 45, to: 135 },
  military: { key: 'military', name: 'Military', from: 135, to: 225 },
}

export const QUADRANT_LIST = Object.values(QUADRANTS)

// Silhouettes already shipped in public/sprites/ui/.
const ICON = {
  unit: '/sprites/ui/unit.png',
  building: '/sprites/ui/building.png',
  policy: '/sprites/ui/policy.png',
  pop: '/sprites/ui/pop.png',
  wonder: '/sprites/ui/wonder.png',
  melee: '/sprites/ui/melee.png',
  ranged: '/sprites/ui/ranged.png',
  cavalry: '/sprites/ui/cavalry.png',
  siege: '/sprites/ui/siege.png',
}

const N = (id, name, kind, quadrant, ring, unlocks, effect, prereqs = [], icon = null) => ({
  id, name, kind, quadrant, ring, unlocks, effect, prereqs,
  icon: icon ? ICON[icon] : ICON[kind],
  excludes: [],
})

export const PROGRESS_NODES = [
  // ---------------------------------------------------------------- SOCIETY
  N('burial-rites', 'Burial Rites', 'policy', 'society', 0, 'Burial Rites',
    'Whenever a unit dies, gain :progress: equal to its :attack:.'),
  N('language', 'Language', 'policy', 'society', 0, 'Language',
    'Each Citizen also produces +1 :progress: per tick.'),

  N('mysticism', 'Mysticism', 'wonder', 'society', 1, 'Stonehenge',
    'At the end of each era, gain +25 :legitimacy:.', ['burial-rites']),
  N('monotheism', 'Monotheism', 'pop', 'society', 1, 'Priest',
    'At the end of each era, gain +1 :legitimacy: per Priest.', ['burial-rites']),
  N('code-of-laws', 'Code of Laws', 'policy', 'society', 1, 'Code of Laws',
    'Unit and building repair costs are reduced by 75%.', ['language']),

  N('organized-religion', 'Organized Religion', 'building', 'society', 2, 'Temple',
    'On completion, gain +20 :legitimacy:. At the end of each era, gain :gold: equal to 3× your :legitimacy:.',
    ['mysticism', 'monotheism']),
  N('philosophy', 'Philosophy', 'policy', 'society', 2, 'Philosophy',
    'Reduce :progress: threshold by 6%.', ['code-of-laws', 'language']),
  N('writing', 'Writing', 'policy', 'society', 2, 'Writing',
    'Reduce :progress: threshold by 5%.', ['code-of-laws']),

  N('theocracy', 'Theocracy', 'policy', 'society', 3, 'Theocracy',
    'At the end of each era, gain +25 :legitimacy:.', ['organized-religion']),
  N('civil-rights', 'Civil Rights', 'policy', 'society', 3, 'Civil Rights',
    'All :progress: outputs +30%, but all :food: outputs −20%.', ['philosophy']),
  N('nationalism', 'Nationalism', 'policy', 'society', 3, 'Nationalism',
    'Whenever a unit dies, gain :gold: equal to its :attack:.', ['writing']),

  N('united-nations', 'United Nations', 'policy', 'society', 4, 'United Nations',
    'Hiring mercenaries costs 60% less :gold:.', ['civil-rights', 'nationalism']),
  N('propaganda', 'Propaganda', 'policy', 'society', 4, 'Propaganda',
    'At the end of each era, gain +25 :legitimacy:.', ['theocracy', 'nationalism']),

  // ------------------------------------------------------------- TECHNOLOGY
  N('tools', 'Tools', 'pop', 'technology', 0, 'Builder',
    'A specialist who produces +5 :production: per tick.'),
  N('astrology', 'Astrology', 'pop', 'technology', 0, 'Astrologer',
    'A specialist who produces +3 :progress: per tick.'),

  N('alphabet', 'Alphabet', 'policy', 'technology', 1, 'Alphabet',
    'When you build a :progress: building, upgrade it once for free.', ['astrology']),
  N('mathematics', 'Mathematics', 'policy', 'technology', 1, 'Mathematics',
    'On unlock, gain +2 free :production: builds.', ['tools']),
  N('pottery', 'Pottery', 'building', 'technology', 1, 'Kiln',
    'Produces 2 :production: per tick, plus 1 for each adjacent building.', ['tools']),

  N('university', 'University', 'pop', 'technology', 2, 'Scholar',
    'A specialist who produces +6 :progress: per tick.', ['alphabet']),
  N('machinery', 'Machinery', 'building', 'technology', 2, 'Workshop',
    'Produces 7 :production: per tick.', ['mathematics', 'pottery']),
  N('optics', 'Optics', 'policy', 'technology', 2, 'Optics',
    ':naval: units deal +50% :attack:.', ['alphabet', 'mathematics']),

  N('scientific-method', 'Scientific Method', 'pop', 'technology', 3, 'Scientist',
    'A specialist who produces a large amount of :progress: per tick.', ['university']),
  N('physics', 'Physics', 'building', 'technology', 3, 'Windmill',
    'Units & buildings in range gain +1 free upgrade level.', ['machinery']),
  N('printing-press', 'Printing Press', 'policy', 'technology', 3, 'Printing Press',
    'Reduce :progress: threshold by 7%.', ['university', 'machinery']),

  N('computers', 'Computers', 'pop', 'technology', 4, 'Software Engineer',
    'A specialist who produces a very large amount of :progress: per tick.',
    ['scientific-method', 'physics']),
  N('internet', 'Internet', 'policy', 'technology', 4, 'Internet',
    'Each Citizen also produces +2 :gold: per tick.', ['printing-press']),

  // ---------------------------------------------------------------- ECONOMY
  N('agriculture', 'Agriculture', 'pop', 'economy', 0, 'Farmer',
    'A specialist who produces +5 :food: per tick.'),
  N('bartering', 'Bartering', 'pop', 'economy', 0, 'Trader',
    'A specialist who produces +5 :gold: per tick.'),

  N('the-plough', 'The Plough', 'building', 'economy', 1, 'Farm',
    'Produces +5 :food: per tick for each adjacent Plains tile (including its own).',
    ['agriculture']),
  N('mining', 'Mining', 'policy', 'economy', 1, 'Mining',
    'Reduce :production: threshold by 5%.', ['bartering']),
  N('granaries', 'Granaries', 'policy', 'economy', 1, 'Granaries',
    'Double the plains terrain economy bonus.', ['agriculture']),

  N('irrigation', 'Irrigation', 'policy', 'economy', 2, 'Irrigation',
    'Reduce :food: threshold by 6%.', ['granaries', 'the-plough']),
  N('coinage', 'Coinage', 'building', 'economy', 2, 'Mint',
    'Produces :gold: each tick equal to 5% of your current :legitimacy:.', ['mining', 'bartering']),
  N('trade-networks', 'Trade Networks', 'building', 'economy', 2, 'Market',
    'Produces 7 :gold: per tick.', ['bartering']),

  N('banking', 'Banking', 'building', 'economy', 3, 'Bank',
    'At the end of each era, gain :gold: equal to 5% of unspent :gold:.',
    ['coinage', 'trade-networks']),
  N('guilds', 'Guilds', 'policy', 'economy', 3, 'Guilds',
    'Every specialist produces +2 of its highest output.', ['trade-networks']),
  N('crop-rotation', 'Crop Rotation', 'policy', 'economy', 3, 'Crop Rotation',
    'Reduce :food: threshold by 7%.', ['irrigation']),

  N('joint-stock-company', 'Joint Stock Company', 'building', 'economy', 4, 'Stock Exchange',
    'Produces 23 :gold: per tick.', ['banking']),
  N('mercantilism', 'Mercantilism', 'policy', 'economy', 4, 'Mercantilism',
    'Total :gold: output +25%.', ['guilds', 'banking']),

  // --------------------------------------------------------------- MILITARY
  N('hunting', 'Hunting', 'unit', 'military', 0, 'Hunter',
    'Gains :food: on a kill.', [], 'ranged'),
  N('the-sling', 'The Sling', 'unit', 'military', 0, 'Slinger',
    'The earliest :ranged: skirmisher.', [], 'ranged'),

  N('pack-bonding', 'Pack Bonding', 'unit', 'military', 1, 'Wolf',
    'After attacking, shifts to an adjacent empty valid tile.', ['hunting'], 'melee'),
  N('archery', 'Archery', 'unit', 'military', 1, 'Archer',
    'A :ranged: bowman.', ['the-sling'], 'ranged'),
  N('tribalism', 'Tribalism', 'policy', 'military', 1, 'Tribalism',
    'Each unit gains +2 :attack: for every other friendly unit of the same type on the board.',
    ['hunting']),

  N('alloying', 'Alloying', 'unit', 'military', 2, 'Spearman',
    '+50% :attack: versus :cavalry:-type enemies.', ['tribalism', 'pack-bonding'], 'melee'),
  N('the-wheel', 'The Wheel', 'unit', 'military', 2, 'Chariot',
    'A bronze :cavalry: war chariot.', ['pack-bonding'], 'cavalry'),
  N('armor', 'Armor', 'policy', 'military', 2, 'Armor',
    'All units gain +1 :defense:.', ['tribalism']),

  N('siege', 'Siege', 'unit', 'military', 3, 'Ballista',
    'Single-target; pushes the target back 1 tile.', ['alloying', 'archery'], 'siege'),
  N('professional-soldiers', 'Professional Soldiers', 'pop', 'military', 3, 'Soldier',
    'Every friendly unit gains +1 :attack: per Soldier.', ['alloying', 'the-wheel']),
  N('military-tradition', 'Military Tradition', 'policy', 'military', 3, 'Military Tradition',
    'Overbuilding a unit keeps its upgrade levels.', ['the-wheel', 'armor']),

  N('crusades', 'Crusades', 'unit', 'military', 4, 'Knight',
    'An armoured :melee: knight.', ['professional-soldiers', 'siege'], 'melee'),
  N('bushido', 'Bushido', 'policy', 'military', 4, 'Bushido',
    ':melee: units deal +50% :attack:.', ['military-tradition', 'professional-soldiers']),
]

// Mutually exclusive forks. Picking one side locks the other out permanently —
// and with it anything downstream that has no other route in.
const FORKS = [
  ['organized-religion', 'philosophy'],   // faith or reason — stays split to the end
  ['university', 'machinery'],            // scholarship or engineering — re-unites at Printing Press
  ['mining', 'granaries'],                // industry or plenty
  ['alloying', 'the-wheel'],              // spear or chariot — re-unites at Professional Soldiers
  ['joint-stock-company', 'mercantilism'],
  ['united-nations', 'propaganda'],
  ['crusades', 'bushido'],
]

const BY_ID = new Map(PROGRESS_NODES.map((n) => [n.id, n]))
for (const [a, b] of FORKS) {
  BY_ID.get(a).excludes.push(b)
  BY_ID.get(b).excludes.push(a)
}

export const progressById = (id) => BY_ID.get(id) ?? null
export const MAX_RING = Math.max(...PROGRESS_NODES.map((n) => n.ring))

// ---------------------------------------------------------------------------
// Layout — polar, computed once. Ring 0 sits at RING0 so the hub stays clear.
// ---------------------------------------------------------------------------

export const RING0 = 150
export const RING_STEP = 140
export const NODE_SIZE = 66 // hexagon width in content px

export const ringRadius = (ring) => RING0 + ring * RING_STEP

const rad = (deg) => (deg * Math.PI) / 180

/**
 * Nodes with polar positions filled in. Within a quadrant+ring, nodes are spread
 * evenly across the 90° span with a margin at each end so neighbouring quadrants
 * stay visually distinct.
 */
export const LAID_OUT = (() => {
  const groups = new Map()
  for (const n of PROGRESS_NODES) {
    const k = `${n.quadrant}:${n.ring}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(n)
  }
  const out = []
  for (const [k, list] of groups) {
    const [quadrant] = k.split(':')
    const { from, to } = QUADRANTS[quadrant]
    list.forEach((n, i) => {
      const t = (i + 1) / (list.length + 1)
      const angle = rad(from + (to - from) * t)
      const R = ringRadius(n.ring)
      out.push({ ...n, angle, x: Math.cos(angle) * R, y: Math.sin(angle) * R })
    })
  }
  return out
})()

export const LAID_OUT_BY_ID = new Map(LAID_OUT.map((n) => [n.id, n]))

/** Content half-extent needed to show every ring up to `maxRing`. */
export const extentFor = (maxRing) => ringRadius(maxRing) + NODE_SIZE
