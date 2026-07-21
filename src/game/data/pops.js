// Population types. Each pop produces per-tick resource outputs; the engine
// multiplies these by the pop count. For now only the Citizen exists and is
// auto-unlocked; all population is allocated to Citizens.

export const POP_TYPES = {
  citizen: {
    key: 'citizen',
    name: 'Citizen',
    silhouette: '/sprites/ui/pop.png',
    // per-pop, per-tick resource output
    outputs: { progress: 1, food: 1, production: 1 },
  },
}

const RES_NAME = {
  progress: 'Progress',
  food: 'Food',
  production: 'Production',
  gold: 'Gold',
  legitimacy: 'Legitimacy',
}

/** ["1 Progress", "1 Food", ...] derived from a pop's outputs (reusable). */
export function popOutputSummary(pop) {
  return Object.entries(pop.outputs)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v} ${RES_NAME[k] ?? k}`)
}

/** Hover text describing what a pop produces each tick (reusable). */
export function popTooltipText(pop) {
  return `Produces ${popOutputSummary(pop).join(', ')} every tick.`
}
