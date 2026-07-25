// Slot category metadata for the civilization panel's dropdowns.
//
// Units and Buildings slots are fixed CATEGORIES; a slot eventually holds an
// unlocked item of that category. Each carries a `silhouette` (shown centered in
// the slot box) and a `description` (shown on hover). Unit categories also carry
// an `unlock` era id — units are only shown once their era is reached.
//
// NOTE: "Copper Age" from the design brief is mapped to the Bronze era (the era
// list has no Copper), and "Support" is treated as the Utility category.

export const UNIT_CATEGORIES = [
  { key: 'melee', label: 'Melee', unlock: 'stone', silhouette: '/sprites/ui/melee.png',
    description: ':melee: Melee Units attack only when there is no unit in front of them. They are your durable and strong front line' },
  { key: 'ranged', label: 'Ranged', unlock: 'stone', silhouette: '/sprites/ui/ranged.png',
    description: ':ranged: Ranged Units always get to attack. They are lethal but fragile. It would be wise to put obstructions in front of them' },
  { key: 'cavalry', label: 'Cavalry', unlock: 'stone', silhouette: '/sprites/ui/cavalry.png',
    description: ':cavalry: Cavalry Units are fast and evasive. They attack only when there is no unit in front of them. Use them to harry the opponent!' },
  { key: 'siege', label: 'Siege', unlock: 'iron', silhouette: '/sprites/ui/siege.png',
    description: ':siege: Siege Units attack back to front and often have splash damage. They are especially effective for dealing with buildings' },
  { key: 'utility', label: 'Utility', unlock: 'bronze', silhouette: '/sprites/ui/utility.png',
    description: ':utility: Utility Units do not attack but have helpful effects that bolster your army' },
  { key: 'naval', label: 'Naval', unlock: 'bronze', silhouette: '/sprites/ui/boat.png',
    description: ':naval: Naval Units may deployed only on the high seas. They can come in :melee: and :ranged: varieties' },
  { key: 'aerial', label: 'Aerial', unlock: 'gilded', silhouette: '/sprites/ui/aerial.png',
    description: ':aerial: Aerial Units may be deployed anywhere on the planet. They can come in :melee: and :ranged: varieties.' },
  { key: 'astral', label: 'Astral', unlock: 'lunar', silhouette: '/sprites/ui/astral.png',
    description: ':astral: Astral Units are your warriors of the great expanse. They may be deployed in space and come in :melee: and :ranged: varieties' },
  { key: 'astral_utility', label: 'Astral Utility', unlock: 'atomic', silhouette: '/sprites/ui/astral-utility.png',
    description: ':astral_utility: Astral Utility units do not attack but offer various helpful effects. They may be deployed only in space.' },
]

export const BUILDING_CATEGORIES = [
  { key: 'progress', label: 'Progress', silhouette: '/sprites/ui/progress.png',
    description: ':progress: Progress buildings help your civilization discover new advances' },
  { key: 'production', label: 'Production', silhouette: '/sprites/ui/production.png',
    description: ':production: Production buildings help your civilization create more units and buildings' },
  { key: 'gold', label: 'Gold', silhouette: '/sprites/ui/gold.png',
    description: ':gold: Gold buildings help in enrich your civilization' },
  { key: 'food', label: 'Food', silhouette: '/sprites/ui/food.png',
    description: ':food: Food buildings help keep your civilization growing steadily' },
  { key: 'legitimacy', label: 'Legitimacy', silhouette: '/sprites/ui/legitimacy.png',
    description: ':legitimacy: Legitimacy buildings help eternalize your rule' },
  { key: 'defense', label: 'Defense', silhouette: '/sprites/ui/defense.png',
    description: ':defense: Defense buildings keep the unwanted out' },
  // Support slot (one catch-all — formerly two Utility slots + a Support slot). Helpful effects
  // that boost nearby pieces, reshape terrain, or enrich the economy. The City and the
  // underlapping Road are Support buildings too (they take their own tile slots when placed).
  // Every unlocked Support building stays available and cycles at build time.
  { key: 'support', label: 'Support', silhouette: '/sprites/ui/utility-building.png',
    description: ':utility: Support buildings boost nearby units or buildings, reshape terrain, or enrich your economy' },
  // Trap slot: traps trigger on enemy contact rather than blocking a lane — some deal damage, some disrupt.
  { key: 'trap', label: 'Trap', silhouette: '/sprites/ui/trap.png',
    description: ':trap: Trap buildings punish enemies that reach them — dealing damage or disrupting their advance' },
  // Command slot: auras that boost the units within range. (Placeholder art.)
  { key: 'command', label: 'Command', silhouette: '/sprites/ui/siege.png',
    description: ':defense: Command buildings project an aura that strengthens the units in range' },
  // Spawner slot: periodically create fresh units mid-combat. (Placeholder art.)
  { key: 'spawner', label: 'Spawner', silhouette: '/sprites/ui/unit.png',
    description: 'Spawner buildings periodically create your best unit of a type onto an adjacent tile during combat' },
]

// Policies and Population are generic slots (no per-slot category); every slot
// shares one silhouette + description.
export const POLICY_INFO = {
  label: 'Policies',
  silhouette: '/sprites/ui/policy.png',
  description: ":policy: Policies are passive bonuses that will steer your civilization's course",
}

export const POPULATION_INFO = {
  label: 'Population',
  silhouette: '/sprites/ui/pop.png',
  description: ':pop: Population is gained whenever a :food: threshold is met. You gain one population, plus one for every completed era. Population is split amongst generalist citizens and focused specialists',
}
