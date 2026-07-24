// Population types (v2). The Citizen is the auto-unlocked generalist; specialists sit
// in gold-upgraded CHAINS (Astrologer → Scholar → …) — you spend gold to convert a whole
// pop type up one tier (one-way). Per-pop output steps LINEARLY per tier (+4/tier non-gold,
// +6/tier gold); the economy's exponential growth comes from population COUNT. Prefix techs
// (Evolved/Cyborg/Psychic) add a flat output to every non-robot pop (applied in GameManager).
//
// Chain metadata: `chain` (which resource), `tier` (0-based position), `next` (the next tier's
// key or null), `tech` (unlocking advancement). See docs/specialists.md.

export const POP_TYPES = {
  citizen: {
    key: 'citizen', name: 'Citizen', silhouette: '/sprites/ui/pop.png',
    outputs: { progress: 1, food: 1, production: 1 },
  },

  // --- Progress chain: Astrologer → Scholar → Scientist → Mentat → Superintelligence ---
  astrologer:        { key: 'astrologer', name: 'Astrologer', specialist: true, chain: 'progress', tier: 0, next: 'scholar', tech: 'Astrology', silhouette: '/sprites/ui/pop.png', outputs: { progress: 4 } },
  scholar:           { key: 'scholar', name: 'Scholar', specialist: true, chain: 'progress', tier: 1, next: 'scientist', tech: 'University', silhouette: '/sprites/ui/pop.png', outputs: { progress: 8 } },
  scientist:         { key: 'scientist', name: 'Scientist', specialist: true, chain: 'progress', tier: 2, next: 'mentat', tech: 'Scientific Method', silhouette: '/sprites/ui/pop.png', outputs: { progress: 12 } },
  mentat:            { key: 'mentat', name: 'Mentat', specialist: true, chain: 'progress', tier: 3, next: 'superintelligence', tech: 'Neuropartitioning', silhouette: '/sprites/ui/pop.png', outputs: { progress: 16 } },
  superintelligence: { key: 'superintelligence', name: 'Superintelligence', specialist: true, chain: 'progress', tier: 4, next: null, tech: 'Superintelligence', silhouette: '/sprites/ui/pop.png', outputs: { progress: 20 } },

  // --- Production chain: Builder → Blacksmith → Inventor → Software Engineer → Nanomancer ---
  builder:            { key: 'builder', name: 'Builder', specialist: true, chain: 'production', tier: 0, next: 'blacksmith', tech: 'Tools', silhouette: '/sprites/ui/pop.png', outputs: { production: 4 } },
  blacksmith:         { key: 'blacksmith', name: 'Blacksmith', specialist: true, chain: 'production', tier: 1, next: 'inventor', tech: 'Blacksmithing', silhouette: '/sprites/ui/pop.png', outputs: { production: 8 } },
  inventor:           { key: 'inventor', name: 'Inventor', specialist: true, chain: 'production', tier: 2, next: 'software_engineer', tech: 'Hydraulic Press', silhouette: '/sprites/ui/pop.png', outputs: { production: 12 } },
  software_engineer:  { key: 'software_engineer', name: 'Software Engineer', specialist: true, chain: 'production', tier: 3, next: 'nanomancer', tech: 'Computers', silhouette: '/sprites/ui/pop.png', outputs: { production: 16 } },
  nanomancer:         { key: 'nanomancer', name: 'Nanomancer', specialist: true, chain: 'production', tier: 4, next: null, tech: 'Adamantium', silhouette: '/sprites/ui/pop.png', outputs: { production: 20 } },

  // --- Food chain: Farmer → Baker → Doctor → Geneticist → Abioticist ---
  farmer:      { key: 'farmer', name: 'Farmer', specialist: true, chain: 'food', tier: 0, next: 'baker', tech: 'Agriculture', silhouette: '/sprites/ui/pop.png', outputs: { food: 4 } },
  baker:       { key: 'baker', name: 'Baker', specialist: true, chain: 'food', tier: 1, next: 'doctor', tech: 'Baking', silhouette: '/sprites/ui/pop.png', outputs: { food: 8 } },
  doctor:      { key: 'doctor', name: 'Doctor', specialist: true, chain: 'food', tier: 2, next: 'geneticist', tech: 'Germ Theory', silhouette: '/sprites/ui/pop.png', outputs: { food: 12 } },
  geneticist:  { key: 'geneticist', name: 'Geneticist', specialist: true, chain: 'food', tier: 3, next: 'abioticist', tech: 'In-Vitro Editing', silhouette: '/sprites/ui/pop.png', outputs: { food: 16 } },
  abioticist:  { key: 'abioticist', name: 'Abioticist', specialist: true, chain: 'food', tier: 4, next: null, tech: 'Abiogenesis', silhouette: '/sprites/ui/pop.png', outputs: { food: 20 } },

  // --- Gold chain: Trader → Merchant → Banker → Statistician → Investor → Plutarch (+6/tier) ---
  trader:       { key: 'trader', name: 'Trader', specialist: true, chain: 'gold', tier: 0, next: 'merchant', tech: 'Bartering', silhouette: '/sprites/ui/pop.png', outputs: { gold: 6 } },
  merchant:     { key: 'merchant', name: 'Merchant', specialist: true, chain: 'gold', tier: 1, next: 'banker', tech: 'Economics', silhouette: '/sprites/ui/pop.png', outputs: { gold: 12 } },
  banker:       { key: 'banker', name: 'Banker', specialist: true, chain: 'gold', tier: 2, next: 'statistician', tech: 'Income Tax', silhouette: '/sprites/ui/pop.png', outputs: { gold: 18 } },
  statistician: { key: 'statistician', name: 'Statistician', specialist: true, chain: 'gold', tier: 3, next: 'investor', tech: 'Statistics', silhouette: '/sprites/ui/pop.png', outputs: { gold: 24 } },
  investor:     { key: 'investor', name: 'Investor', specialist: true, chain: 'gold', tier: 4, next: 'plutarch', tech: 'High Frequency Trading', silhouette: '/sprites/ui/pop.png', outputs: { gold: 30 } },
  plutarch:     { key: 'plutarch', name: 'Plutarch', specialist: true, chain: 'gold', tier: 5, next: null, tech: 'Universal Currency', silhouette: '/sprites/ui/pop.png', outputs: { gold: 36 } },

  // --- Special populations (not part of an upgrade chain) ---
  priest: {
    key: 'priest', name: 'Priest', specialist: true, tech: 'Monotheism', silhouette: '/sprites/ui/pop.png',
    outputs: {}, legitPerEra: 1,
    note: 'At the end of each era, gain +1 :legitimacy: per Priest.',
  },
  soldier: {
    key: 'soldier', name: 'Soldier', specialist: true, tech: 'Professional Soldiers', silhouette: '/sprites/ui/pop.png',
    outputs: {}, soldierAtk: 1,
    note: 'Every friendly unit gains +1 :attack: per Soldier.',
  },
  replicant: {
    key: 'replicant', name: 'Replicant', specialist: true, tech: 'Robotic Labor', robot: true, doubling: true, silhouette: '/sprites/ui/pop.png',
    outputs: { production: 1, gold: 1, progress: 1 },
    note: 'Its population count DOUBLES at the end of each era (does not grow via normal pop growth).',
  },

  // --- v1 holdovers (kept until the advancement registry reconciliation prunes them) ---
  shaman: {
    key: 'shaman', name: 'Shaman', specialist: true, silhouette: '/sprites/ui/pop.png',
    outputs: { progress: 3 }, combatLegit: 10,
    note: 'At the end of each combat, each Shaman grants +10 :legitimacy:.',
  },
  philosopher: {
    key: 'philosopher', name: 'Philosopher', specialist: true, silhouette: '/sprites/ui/pop.png',
    outputs: { progress: 10, gold: -1 },
    note: 'Each Philosopher drains 1 :gold: per tick. Negative :gold: bleeds :legitimacy:.',
  },
  poet: {
    key: 'poet', name: 'Poet', specialist: true, silhouette: '/sprites/ui/pop.png',
    outputs: { progress: 1 },
    note: 'At the end of each era, every Poet permanently produces +2 :progress:.',
  },
}

/** True if a pop type is a specialist rather than the Citizen. */
export function isSpecialist(key) {
  return !!POP_TYPES[key]?.specialist
}

/** The chain a specialist belongs to (progress/production/food/gold), or null. */
export function popChain(key) {
  return POP_TYPES[key]?.chain ?? null
}

const RES_NAME = {
  progress: 'Progress', food: 'Food', production: 'Production', gold: 'Gold', legitimacy: 'Legitimacy',
}

/** ["1 Progress", "1 Food", ...] per-pop output (reusable). */
export function popOutputSummary(pop) {
  return Object.entries(pop.outputs)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v} ${RES_NAME[k] ?? k}`)
}

/** ["6 Progress", ...] TOTAL output for `count` of this pop (reusable). */
export function popTotalSummary(pop, count) {
  return Object.entries(pop.outputs)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v * count} ${RES_NAME[k] ?? k}`)
}

/** Hover text describing what one pop produces each tick (reusable). */
export function popTooltipText(pop) {
  const outs = popOutputSummary(pop)
  return outs.length ? `Produces ${outs.join(', ')} every tick.` : (pop.note ?? '')
}
