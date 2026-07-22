// Population types. Each pop produces per-tick resource outputs; the engine
// multiplies these by the pop count. The Citizen is the auto-unlocked generalist;
// the rest are specialists unlocked via advancements. Population growth and
// slot-replacement split pops between citizens and specialists.

export const POP_TYPES = {
  citizen: {
    key: 'citizen',
    name: 'Citizen',
    silhouette: '/sprites/ui/pop.png',
    // per-pop, per-tick resource output
    outputs: { progress: 1, food: 1, production: 1 },
  },
  builder: {
    key: 'builder', name: 'Builder', specialist: true,
    silhouette: '/sprites/ui/pop.png',
    outputs: { production: 5 },
  },
  farmer: {
    key: 'farmer', name: 'Farmer', specialist: true,
    silhouette: '/sprites/ui/pop.png',
    outputs: { food: 5 },
  },
  trader: {
    key: 'trader', name: 'Trader', specialist: true,
    silhouette: '/sprites/ui/pop.png',
    outputs: { gold: 5 },
  },
  shaman: {
    key: 'shaman', name: 'Shaman', specialist: true,
    silhouette: '/sprites/ui/pop.png',
    outputs: { progress: 3 },
    combatLegit: 10, // at the end of each combat, each Shaman grants +10 legitimacy
    note: 'At the end of each combat, each Shaman grants +10 :legitimacy:.',
  },
  scholar: {
    key: 'scholar', name: 'Scholar', specialist: true,
    silhouette: '/sprites/ui/pop.png',
    outputs: { progress: 6 },
  },
}

/** True if a pop type is a (replaceable) specialist rather than the Citizen. */
export function isSpecialist(key) {
  return !!POP_TYPES[key]?.specialist
}

const RES_NAME = {
  progress: 'Progress',
  food: 'Food',
  production: 'Production',
  gold: 'Gold',
  legitimacy: 'Legitimacy',
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
  return `Produces ${popOutputSummary(pop).join(', ')} every tick.`
}
