// Slot category metadata for the civilization panel's dropdowns.
//
// Each Units/Buildings slot is a fixed CATEGORY; a slot eventually holds an
// unlocked item of that category. The `description` explains what that category
// does. These descriptions are PLACEHOLDERS — they capture the intended role but
// the concrete mechanics are not yet defined; refine them as those systems land.

export const UNIT_CATEGORIES = [
  { key: 'melee', label: 'Melee',
    description: 'Front-line fighters that strike adjacent foes. Cheap and sturdy, they hold the line while your economy grows.' },
  { key: 'ranged', label: 'Ranged',
    description: 'Attack enemies from a distance before they close in. Fragile up close but deadly massed behind a front line.' },
  { key: 'cavalry', label: 'Cavalry',
    description: 'Fast, hard-hitting units that flank and reach distant lanes. Punish weak points but falter against braced defenders.' },
  { key: 'siege', label: 'Siege',
    description: 'Heavy units built to shatter enemy structures and fortified positions. Slow, but overwhelming against defenses.' },
  { key: 'utility', label: 'Utility',
    description: 'Support units that buff allies, debuff enemies, or manipulate the board rather than dealing damage directly.' },
  { key: 'naval', label: 'Naval',
    description: 'Sea and coastal units that dominate water lanes and project power along the shoreline.' },
  { key: 'astral', label: 'Astral',
    description: 'Space-age combatants for the off-world eras, waging war across orbit and deep space.' },
  { key: 'astral_utility', label: 'Astral Utility',
    description: 'Advanced support platforms for the space eras — shields, relays, and force multipliers for your astral fleet.' },
]

export const BUILDING_CATEGORIES = [
  { key: 'food', label: 'Food',
    description: 'Generates Food each tick, driving population growth across your tableau.' },
  { key: 'progress', label: 'Progress',
    description: 'Generates Progress each tick, advancing you toward the next era and its unlocks.' },
  { key: 'gold', label: 'Gold',
    description: 'Generates Gold each tick — the currency you spend to deploy and upgrade.' },
  { key: 'production', label: 'Production',
    description: 'Generates Production each tick — the raw output used to build units and structures.' },
  { key: 'legitimacy', label: 'Legitimacy',
    description: "Bolsters Legitimacy, your civilization's resilience (its “HP”) against threats." },
  { key: 'utility', label: 'Utility',
    description: "Provides special effects and bonuses that don't map to a single resource." },
  { key: 'defense', label: 'Defense',
    description: 'Fortifies your tableau, protecting tiles and units during the combat phase.' },
]
