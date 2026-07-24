// Building definitions. A building occupies one BUILDING_CATEGORIES slot once
// unlocked, and can be deployed onto tiles during production. Buildings show only
// a Def (HP) stat on the tile; their value is their economic output/effect.
// HP grows linearly with upgrade level (unless `noUpgrade`).

// Pier food is a FLAT amount by upgrade level (no era scaling): 200, +100/upgrade.
const pierFood = (level = 1) => 200 + 100 * Math.max(0, level - 1)

// Campfire combat heal: % of a neighbour's max HP restored per combat-second.
const campfireHeal = (level = 1) => 5 + 2 * Math.max(0, level - 1) // 5 / 7 / 9 / ...
// Totem legitimacy granted at the end of each combat (per level).
const totemLegit = (level = 1) => 10 + 5 * Math.max(0, level - 1) // 10 / 15 / 20 / ...
// Per-tick output buildings (resolved with instance/tile context in GameManager):
const kilnPerAdjacent = (level = 1) => level + 1 // +2 / +3 / +4 … :production: per adjacent building
const mineGold = (level = 1) => 8 * level         // :gold: per tick (×2 on a mountain)
const templeLegit = (level = 1) => level          // :legitimacy: per tick (1 / 2 / 3 …)
const mintLegitPct = (level = 1) => 0.05 + 0.02 * Math.max(0, level - 1) // 5% / 7% / 9% … of legitimacy
const forgingProd = (level = 1) => 3 * (level + 1)      // :production: per tick (6 / 9 / 12 …)
const libraryProgress = (level = 1) => 200 * (level + 1) // end-of-combat :progress: (400 / 600 / 800 …)
const lighthouseBonus = (level = 1) => 2 + 0.5 * Math.max(0, level - 1) // +200% then +50%/level (additive)
const aqueductBase = (level = 1) => 5 * (level + 1)     // base :food:/tick (10 / 15 / 20 …), ×2 per adjacent Aqueduct
const glassworksLegit = (level = 1) => 30 + 5 * Math.max(0, level - 1) // :legitimacy: on each building completed (30 / 35 / 40 …)
// Brothel combat aura: adjacent units' :attack: multiplier by level (+10/15/20%).
const brothelAtk = (level = 1) => 0.10 + 0.05 * Math.max(0, level - 1)

export const BUILDING_DEFS = {
  mud_wall: {
    key: 'mud_wall', name: 'Mud Brick Wall', era: 0, tech: 'Mud Brick', types: ['defense'], placement: 'land',
    hp: 25, upHp: 10,
    effect: 'A sturdy wall that stalls the enemy advance.',
  },
  totem: {
    key: 'totem', name: 'Totem', types: ['legitimacy'], placement: 'land',
    hp: 15, upHp: 5,
    combatLegit: totemLegit,
    effect: (level) => `At the end of combat, gain ${totemLegit(level)} :legitimacy:.`,
  },
  brewery: {
    key: 'brewery', name: 'Brewery', types: ['gold'], placement: 'land',
    hp: 5, upHp: 0,
    range: (level) => level, // range 1 / 2 / 3 / … (orthogonal steps)
    effect: (level) => `+1 :gold: per tick for each unit in range ${level}. Units in range: +10% :attack:, −10% :defense:.`,
  },
  pier: {
    key: 'pier', name: 'Pier', era: 0, tech: 'Fishing', types: ['food'], placement: 'coast',
    hp: 12, upHp: 4,
    // Flat food by level (era-independent), granted at the end of combat.
    effect: (level) => `Produces ${pierFood(level)} :food: at the end of combat.`,
    outputs: (level) => [{ res: 'food', amount: pierFood(level), per: 'era' }],
    eraFood: pierFood,
  },
  campfire: {
    key: 'campfire', name: 'Campfire', era: 0, tech: 'Fire', types: ['utility'], placement: 'land',
    hp: 1, upHp: 0,
    heal: campfireHeal, // % of max HP healed per combat-second
    effect: (level) => `Each second in combat, heals adjacent units & buildings for ${campfireHeal(level)}% of their max :defense:.`,
  },
  brothel: {
    key: 'brothel', name: 'Brothel', types: ['utility'], placement: 'land',
    hp: 6, upHp: 2,
    atkPct: brothelAtk, // adjacent-unit :attack: bonus by level
    cdReduce: 0.5,      // adjacent-unit cooldown reduction (seconds)
    effect: (level) => `Adjacent units attack 0.5s faster and gain +${Math.round(brothelAtk(level) * 100)}% :attack:.`,
  },
  embassy: {
    key: 'embassy', name: 'Embassy', types: ['utility'], placement: 'land',
    hp: 20, upHp: 6,
    mercEvery: 8, // combat-seconds between free mercenaries
    effect: 'In combat, hires a random mercenary onto an empty adjacent tile every 8 seconds.',
  },
  cave_painting: {
    key: 'cave_painting', name: 'Cave Painting', era: 0, tech: 'Cave Painting', types: ['progress'], placement: 'land',
    hp: 8, upHp: 0, noUpgrade: true,
    storedBase: 5, storedMax: 50000, // starts at 5 :progress:, doubles each era, capped
    effect: 'When overbuilt, grants its stored :progress: (starts at 5, doubles each era after combat, max 50000).',
  },
  ranch: {
    key: 'ranch', name: 'Ranch', era: 1, tech: 'Domestication', types: ['food'], placement: 'land',
    hp: 8, upHp: 4,
    // Per-tick food = 5 + an era-growth bonus (occ.ranchBonus); grows +2/3/4/… at each
    // combat end, resets if destroyed (see GameManager _buildingTickOutputs / _endCombat).
    effect: 'Produces :food: each tick (starts at 5, +2/3/4/… at the end of each combat). If it is destroyed, the bonus resets.',
  },
  kiln: {
    key: 'kiln', name: 'Kiln', era: 0, tech: 'Pottery', types: ['production'], placement: 'land',
    hp: 5, upHp: 3,
    perAdjacent: kilnPerAdjacent,
    effect: (level) => `Produces 2 :production: per tick, plus ${kilnPerAdjacent(level)} for each adjacent building.`,
  },
  forging: {
    key: 'forging', name: 'Forging', types: ['production'], placement: 'land',
    hp: 10, upHp: 4,
    prodPerTick: forgingProd,
    effect: (level) => `Produces ${forgingProd(level)} :production: per tick. At the end of each combat, upgrades a random adjacent unit.`,
  },
  library: {
    key: 'library', name: 'Library', era: 2, tech: 'Paper', types: ['progress'], placement: 'land',
    hp: 9, upHp: 3,
    outputs: (level) => [{ res: 'progress', amount: libraryProgress(level), per: 'era' }],
    effect: (level) => `At the end of each combat, gain ${libraryProgress(level)} :progress:.`,
  },
  mine: {
    key: 'mine', name: 'Mine', types: ['gold'], placement: 'land',
    hp: 12, upHp: 6,
    goldPerTick: mineGold,
    effect: (level) => `Produces ${mineGold(level)} :gold: per tick — doubled when placed on a mountain.`,
  },
  mint: {
    key: 'mint', name: 'Mint', era: 4, tech: 'Coinage', types: ['gold'], placement: 'land',
    hp: 10, upHp: 4,
    legitPct: mintLegitPct,
    effect: (level) => `Produces :gold: each tick equal to ${Math.round(mintLegitPct(level) * 100)}% of your current :legitimacy:.`,
  },
  lighthouse: {
    key: 'lighthouse', name: 'Lighthouse', era: 3, tech: 'Celestial Navigation', types: ['gold'], placement: 'coast',
    hp: 12, upHp: 4,
    unblockedBonus: lighthouseBonus, // +200%/+250%/+300%… (ADDITIVE) to a :naval: unit's unblocked-damage resources in its waters
    effect: (level) => `When a :naval: unit deals unblocked damage in the Lighthouse's waters, resources gained are increased by ${Math.round(lighthouseBonus(level) * 100)}%.`,
  },
  temple: {
    key: 'temple', name: 'Temple', era: 3, tech: 'Organized Religion', types: ['legitimacy'], placement: 'land',
    hp: 18, upHp: 6,
    legitPerTick: templeLegit,
    effect: (level) => `Produces ${templeLegit(level)} :legitimacy: per tick.`,
  },
  farm: {
    key: 'farm', name: 'Farm', era: 1, tech: 'The Plough', types: ['food'], placement: 'land',
    hp: 6, upHp: 2,
    effect: 'Produces +5 :food: per tick for each adjacent Plains tile (including its own).',
  },
  aqueduct: {
    key: 'aqueduct', name: 'Aqueduct', era: 3, tech: 'Arches', types: ['food'], placement: 'land',
    hp: 12, upHp: 5, // +5 base food per upgrade (via aqueductBase)
    base: aqueductBase,
    effect: (level) => `Produces ${aqueductBase(level)} :food: per tick — DOUBLED for each adjacent Aqueduct.`,
  },
  glassworks: {
    key: 'glassworks', name: 'Glassworks', era: 5, tech: 'Stained Glass', types: ['production'], placement: 'land',
    hp: 10, upHp: 4,
    legitOnBuild: glassworksLegit,
    effect: (level) => `Produces 10 :production: per tick. Whenever you complete another building anywhere, gain ${glassworksLegit(level)} :legitimacy:.`,
  },
  colosseum: {
    key: 'colosseum', name: 'Colosseum', types: ['legitimacy'], placement: 'land',
    hp: 16, upHp: 5,
    effect: 'At the end of each combat, gain 5 :legitimacy: for each unit in your civilization.',
  },
  public_baths: {
    key: 'public_baths', name: 'Public Baths', types: ['utility'], placement: 'land',
    hp: 8, upHp: 3,
    bathsEvery: 5, bathsHealPct: 50, // every 5 combat-seconds: heal adjacent 50% of max HP …
    bathsAtk: (level = 1) => level, // … and permanently grant adjacent units +level :attack:
    effect: (level) => `Every 5 seconds in combat, heals adjacent units & buildings for 50% of their max :defense: and permanently grants adjacent units +${level} :attack:.`,
  },
  // City: an underlaid UTILITY support. `underlaidCity: true` gives it its OWN tile slot
  // (`tile.city`, independent of a Road) with no HP/combat, and lets the tile hold
  // `extraCap` additional non-underlaid buildings in `tile.extras`. City buildings are
  // additive (they never replace) and can't be replaced or overbuilt themselves.
  city: {
    key: 'city', name: 'City', era: 6, tech: 'Urbanization', types: ['utility'], placement: 'land',
    underlaidCity: true, noUpgrade: true, hp: 0, upHp: 0,
    extraCap: 2, // additional buildings the tile can hold beyond its primary occupant
    effect: 'Underlaid. Lets this tile hold 2 additional buildings. City buildings can never be replaced.',
  },
  // Road: a UTILITY building that UNDERLAPS. `underlap: true` means it lives in the
  // tile's own `underlap` slot (never replaced, no HP/combat) rather than as the
  // occupant. Links every tile it touches into one adjacency group.
  road: {
    key: 'road', name: 'Road', era: 3, tech: 'Surveying', types: ['utility'], placement: 'land',
    underlap: true, noUpgrade: true, hp: 0, upHp: 0,
    effect: 'All tiles adjacent to the road are adjacent to each other. Underlaid.',
  },

  // ============================================================================
  // v2 buildings (from docs/buildings.md). DATA-ONLY for economic output (via the
  // generic def.output engine); military/special effects (traps/commands/spawners/
  // walls-block/power/legit-leverage/proportional/growth) are wired incrementally
  // and tagged by `special`. NOTE: exotic placements (mountain/space/asteroid/
  // exoplanet/star/singularity/deepspace/moon/any) need the terrain placement system
  // extended before they can be built — early-era land/coast entries work today.
  // ============================================================================

  // --- Traps ---
  caltrops: {
    key: 'caltrops', name: 'Caltrops', era: 1, tech: 'Leatherwork',
    types: ['trap'], placement: 'land',
    hp: 1, upHp: 0, upgradeTarget: 'output',
    special: 'trap_cross_dmg',
    effect: 'Enemies walk right over it (no block, no HP). Every enemy that crosses takes 20 :attack: damage (flat).',
  },
  decoy: {
    key: 'decoy', name: 'Decoy', era: 5, tech: 'Vassalage',
    types: ['trap'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'def', range: 2,
    special: 'trap_bait',
    effect: 'Enemies within range 2 path to it and attack it first until destroyed. Deals no damage. Upgrades add +1 :defense:/level.',
  },
  powder_magazine: {
    key: 'powder_magazine', name: 'Powder Magazine', era: 6, tech: 'Gunpowder',
    types: ['trap'], placement: 'land',
    hp: 1, upHp: 0, upgradeTarget: 'output', range: 2,
    special: 'trap_death_dmg',
    effect: 'On destruction, explodes for 45 :attack: damage to all enemies within range 2.',
  },
  sea_mine: {
    key: 'sea_mine', name: 'Sea Mine', era: 8, tech: 'Sea Mine',
    types: ['trap'], placement: 'coast',
    hp: 1, upHp: 0, upgradeTarget: 'output',
    special: 'trap_first_dmg',
    effect: 'First enemy to enter takes 89 :attack: damage, then it is consumed.',
  },
  discombobulator: {
    key: 'discombobulator', name: 'Discombobulator', era: 14, tech: 'Discombobulator',
    types: ['trap'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'range', range: 1,
    special: 'trap_skip_turn',
    effect: 'On firing, enemies within range 1 skip their next turn. 5-turn cooldown.',
  },
  singularity: {
    key: 'singularity', name: 'Singularity', era: 25, tech: 'Black Hole Warfare',
    types: ['trap'], placement: 'space',
    hp: 1, upHp: 0, upgradeTarget: 'none',
    special: 'trap_impassable',
    effect: 'Impassable — enemies route around it (invalid if it would block all paths). Deals 1000 :attack: damage to Azazoth if forced through.',
  },

  // --- Command ---
  command_post: {
    key: 'command_post', name: 'Command Post', era: 5, tech: 'Strategy',
    types: ['command'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'range', range: 1,
    special: 'command_atk',
    effect: 'Units in range gain +50% :attack:. Upgrades widen the aura +1 range/level.',
  },
  star_fort: {
    key: 'star_fort', name: 'Star Fort', era: 7, tech: 'Star Forts',
    types: ['command'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'range', range: 1,
    special: 'command_range',
    effect: ':ranged: units in range gain +1 range. Upgrades widen the aura +1 range/level.',
  },
  armory: {
    key: 'armory', name: 'Armory', era: 10, tech: 'Metric System',
    types: ['command'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'range', range: 1,
    special: 'command_free_upgrade',
    effect: 'At the end of each era, upgrades one adjacent unit +1 level (free). Upgrades widen the aura +1 range/level.',
  },
  radio_tower: {
    key: 'radio_tower', name: 'Radio Tower', era: 10, tech: 'Radio',
    types: ['command'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'range', range: 2,
    special: 'command_range',
    effect: 'All ranged-role units in range gain +2 range. Upgrades widen the aura +1 range/level.',
  },
  deflector_array: {
    key: 'deflector_array', name: 'Deflector Array', era: 17, tech: 'Deflectors',
    types: ['command'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'range', range: 1,
    special: 'command_def',
    effect: 'Units in range gain +2 :defense:. Upgrades widen the aura +1 range/level.',
  },
  psy_link: {
    key: 'psy_link', name: 'Psy-Link', era: 22, tech: 'Synaptic Rewiring',
    types: ['command'], placement: 'land',
    hp: 1, upHp: 0, upgradeTarget: 'range', range: 1,
    special: 'command_atk',
    effect: 'Units in range gain +100% :attack:. Upgrades widen the aura +1 range/level.',
  },
  chronobooster: {
    key: 'chronobooster', name: 'Chronobooster', era: 26, tech: 'Bootstrapping',
    types: ['command'], placement: 'any',
    hp: 1, upHp: 0, upgradeTarget: 'range', range: 1,
    special: 'command_act_twice',
    effect: 'Units in range act twice per turn. Upgrades widen the aura +1 range/level.',
  },

  // --- Spawners ---
  drydock: {
    key: 'drydock', name: 'Drydock', era: 7, tech: 'Pumping',
    types: ['spawner'], placement: 'coast',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    special: 'spawner', spawnRole: 'naval',
    effect: 'Every 8 combat-turns, creates your best :naval: unit on an adjacent tile. Upgrades raise the spawned unit\'s level.',
  },
  stables: {
    key: 'stables', name: 'Stables', era: 5, tech: 'Horseshoes',
    types: ['spawner'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    special: 'spawner', spawnRole: 'cavalry',
    effect: 'Every 8 combat-turns, creates your best :cavalry: unit on an adjacent tile. Upgrades raise the spawned unit\'s level.',
  },
  aircraft_carrier: {
    key: 'aircraft_carrier', name: 'Aircraft Carrier', era: 11, tech: 'Aircraft Carriers',
    types: ['spawner'], placement: 'coast',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    special: 'spawner', spawnRole: 'aerial',
    effect: 'Every 8 combat-turns, creates your best :aerial: unit on an adjacent tile. Upgrades raise the spawned unit\'s level.',
  },
  spaceport: {
    key: 'spaceport', name: 'Spaceport', era: 20, tech: 'Spaceports',
    types: ['spawner'], placement: 'space',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    special: 'spawner', spawnRole: 'astral',
    effect: 'Every 8 combat-turns, creates your best :astral: unit on an adjacent tile (incl. Moon/Mars). Upgrades raise the spawned unit\'s level.',
  },

  // --- Walls ---
  stone_wall: {
    key: 'stone_wall', name: 'Stone Wall', era: 2, tech: 'Fortification',
    types: ['defense'], placement: 'land',
    hp: 4, upHp: 1, upgradeTarget: 'def',
    special: 'wall',
    effect: 'A blocker. Upgrades add +1 :defense:/level.',
  },
  castle: {
    key: 'castle', name: 'Castle', era: 4, tech: 'Castles',
    types: ['defense'], placement: 'land',
    hp: 6, upHp: 1, upgradeTarget: 'def',
    special: 'wall',
    effect: 'A blocker. Upgrades add +1 :defense:/level.',
  },
  shield_matrix: {
    key: 'shield_matrix', name: 'Shield Matrix', era: 23, tech: 'Shielding',
    types: ['defense'], placement: 'any',
    hp: 9, upHp: 2, upgradeTarget: 'def',
    special: 'wall',
    effect: 'A blocker placeable on land, water or space. Upgrades add +2 :defense:/level.',
  },

  // --- Military utility ---
  moon_base: {
    key: 'moon_base', name: 'Moon Base', era: 14, tech: 'Lunar Installment',
    types: ['utility'], placement: 'moon',
    hp: 3, upHp: 0, upgradeTarget: 'def',
    special: 'trap_impassable',
    effect: 'Military, unique, Moon-only. Enemies path around the Moon (the Moon becomes impassable to enemy movement). Upgrades add +1 :defense:/level.',
  },
  machine_gun: {
    key: 'machine_gun', name: 'Machine Gun', era: 9, tech: 'Machine Guns',
    types: ['utility'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    special: 'underlay',
    effect: 'Military underlay (under the tile\'s unit). The unit posted on this tile attacks 1/2/3/… extra times per turn (per upgrade level).',
  },

  // --- Progress ---
  school: {
    key: 'school', name: 'School', era: 8, tech: 'Public Education',
    types: ['progress'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    output: { res: 'progress', amount: 13, when: 'tick' },
    effect: 'Produces 13 :progress: per tick.',
  },
  laboratory: {
    key: 'laboratory', name: 'Laboratory', era: 12, tech: 'Plastics',
    types: ['progress'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    output: { res: 'progress', amount: 31, when: 'tick' },
    effect: 'Produces 31 :progress: per tick.',
  },
  space_telescope: {
    key: 'space_telescope', name: 'Space Telescope', era: 16, tech: 'Exoptics',
    types: ['progress'], placement: 'space',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    output: { res: 'progress', amount: 79, when: 'tick' },
    effect: 'Produces 79 :progress: per tick.',
  },
  cogitorium: {
    key: 'cogitorium', name: 'Cogitorium', era: 21, tech: 'Distributed Being',
    types: ['progress'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    output: { res: 'progress', amount: 238, when: 'tick' },
    effect: 'Produces 238 :progress: per tick.',
  },
  black_hole_station: {
    key: 'black_hole_station', name: 'Black Hole Station', era: 24, tech: 'Singularity Stations',
    types: ['progress'], placement: 'singularity',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    output: { res: 'progress', amount: 446, when: 'tick' },
    effect: 'Produces 446 :progress: per tick.',
  },
  theater: {
    key: 'theater', name: 'Theater', era: 6, tech: 'Acoustics',
    types: ['progress'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    output: { res: 'progress', amount: 450, when: 'eraEnd' },
    special: 'stacks',
    effect: 'At the end of each era, gain 450 :progress:, +25 more each era it survives.',
  },
  observatory: {
    key: 'observatory', name: 'Observatory', era: 6, tech: 'Astronomy',
    types: ['progress'], placement: 'mountain',
    hp: 2, upHp: 0, upgradeTarget: 'output', range: 1,
    special: 'terrain_scaled',
    effect: 'At the end of each era, gain :progress: equal to 10 × the tile\'s economy-bonus value.',
  },
  museum: {
    key: 'museum', name: 'Museum', era: 10, tech: 'Archaeology',
    types: ['progress'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output', range: 1,
    special: 'proportional',
    effect: 'Produces :progress: per tick equal to 16 × (unique unit + building types in its row and column).',
  },

  // --- Production ---
  workshop: {
    key: 'workshop', name: 'Workshop', era: 4, tech: 'Machinery',
    types: ['production'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    output: { res: 'production', amount: 7, when: 'tick' },
    effect: 'Produces 7 :production: per tick.',
  },
  forge: {
    key: 'forge', name: 'Forge', era: 4, tech: 'Metallurgy',
    types: ['production'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    output: { res: 'production', amount: 7, when: 'tick' },
    effect: 'Produces 7 :production: per tick.',
  },
  factory: {
    key: 'factory', name: 'Factory', era: 9, tech: 'Mass Production',
    types: ['production'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    output: { res: 'production', amount: 16, when: 'tick' },
    effect: 'Produces 16 :production: per tick.',
  },
  printer_3d: {
    key: 'printer_3d', name: '3D Printer', era: 14, tech: '3d printing',
    types: ['production'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    output: { res: 'production', amount: 50, when: 'tick' },
    effect: 'Produces 50 :production: per tick.',
  },
  vacuum_assembly: {
    key: 'vacuum_assembly', name: 'Vacuum Assembly', era: 19, tech: 'Deep Space Construction',
    types: ['production'], placement: 'space',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    output: { res: 'production', amount: 154, when: 'tick' },
    effect: 'Produces 154 :production: per tick.',
  },
  dyson_sphere: {
    key: 'dyson_sphere', name: 'Dyson Sphere', era: 24, tech: 'Kardashev Advancement',
    types: ['production'], placement: 'star',
    hp: 4, upHp: 0, upgradeTarget: 'output',
    output: { res: 'production', amount: 446, when: 'tick' },
    effect: 'Produces 446 :production: per tick.',
  },
  harbor: {
    key: 'harbor', name: 'Harbor', era: 7, tech: 'Shipbuilding',
    types: ['production'], placement: 'coast',
    hp: 2, upHp: 0, upgradeTarget: 'range', range: 1,
    special: 'proportional',
    effect: 'Produces :production: per tick equal to 6 × (units in range).',
  },
  solar_array: {
    key: 'solar_array', name: 'Solar Array', era: 16, tech: 'Energy Capture',
    types: ['production'], placement: 'any',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    special: 'stacks',
    effect: 'Produces 79 :production: per tick, +50% of base per other Solar Array.',
  },
  lumber_mill: {
    key: 'lumber_mill', name: 'Lumber Mill', era: 1, tech: 'Milling',
    types: ['production'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    special: 'terrain_scaled',
    effect: 'Placed on a forest tile. Produces :production: per tick equal to 4 × the forest tile\'s economy-bonus value.',
  },

  // --- Food ---
  hospital: {
    key: 'hospital', name: 'Hospital', era: 11, tech: 'Penicillin',
    types: ['food'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    output: { res: 'food', amount: 24, when: 'tick' },
    effect: 'Produces 24 :food: per tick.',
  },
  hydroponicist: {
    key: 'hydroponicist', name: 'Hydroponicist', era: 16, tech: 'Hydroponics',
    types: ['food'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    output: { res: 'food', amount: 79, when: 'tick' },
    effect: 'Produces 79 :food: per tick.',
  },
  xenocultivator: {
    key: 'xenocultivator', name: 'Xenocultivator', era: 19, tech: 'Alien Ecology',
    types: ['food'], placement: 'exoplanet',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    output: { res: 'food', amount: 154, when: 'tick' },
    effect: 'Produces 154 :food: per tick.',
  },
  cloning_bay: {
    key: 'cloning_bay', name: 'Cloning Bay', era: 24, tech: 'Gene Splicing',
    types: ['food'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    output: { res: 'food', amount: 446, when: 'tick' },
    effect: 'Produces 446 :food: per tick.',
  },
  hacienda: {
    key: 'hacienda', name: 'Hacienda', era: 7, tech: 'Creole Culture',
    types: ['food'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    special: 'multi_output',
    effect: 'Colonial estate (New World only). Produces 6 :food: + 6 :production: + 9 :gold: per tick.',
  },

  // --- Gold ---
  market: {
    key: 'market', name: 'Market', era: 2, tech: 'Trade Networks',
    types: ['gold'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    output: { res: 'gold', amount: 7, when: 'tick' },
    effect: 'Produces 7 :gold: per tick.',
  },
  stock_exchange: {
    key: 'stock_exchange', name: 'Stock Exchange', era: 9, tech: 'Joint Stock Company',
    types: ['gold'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    output: { res: 'gold', amount: 23, when: 'tick' },
    effect: 'Produces 23 :gold: per tick.',
  },
  data_center: {
    key: 'data_center', name: 'Data Center', era: 13, tech: 'The Cloud',
    types: ['gold'], placement: 'any',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    output: { res: 'gold', amount: 59, when: 'tick' },
    effect: 'Produces 59 :gold: per tick.',
  },
  asteroid_mine: {
    key: 'asteroid_mine', name: 'Asteroid Mine', era: 16, tech: 'Asteroid Mining',
    types: ['gold'], placement: 'asteroid',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    output: { res: 'gold', amount: 119, when: 'tick' },
    effect: 'Produces 119 :gold: per tick.',
  },
  spice_extractor: {
    key: 'spice_extractor', name: 'Spice Extractor', era: 22, tech: 'Melange',
    types: ['gold'], placement: 'exoplanet',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    output: { res: 'gold', amount: 441, when: 'tick' },
    effect: 'Produces 441 :gold: per tick.',
  },
  arena: {
    key: 'arena', name: 'Arena', era: 3, tech: 'Entertainment',
    types: ['gold'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    special: 'proportional',
    effect: 'At the end of each era, gain :gold: equal to 8 × (deployed units).',
  },
  caravansary: {
    key: 'caravansary', name: 'Caravansary', era: 4, tech: 'Compass',
    types: ['gold'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'output',
    special: 'stacks',
    effect: 'Produces :gold: per tick equal to 10 + 5 × (other Caravansaries).',
  },
  bank: {
    key: 'bank', name: 'Bank', era: 7, tech: 'Banking',
    types: ['gold'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    special: 'proportional',
    effect: 'At the end of each era, gain :gold: equal to 5% of unspent :gold: (multiple Banks add: 2 → 10%…).',
  },
  stadium: {
    key: 'stadium', name: 'Stadium', era: 10, tech: 'Sports',
    types: ['gold'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    special: 'stacks',
    effect: 'At the end of each era, gain +1000/1250/1500… :gold: and +10 :legitimacy: (per upgrade level).',
  },
  shinkansen: {
    key: 'shinkansen', name: 'Shinkansen', era: 13, tech: 'Maglev',
    types: ['gold'], placement: 'land',
    hp: 1, upHp: 0, upgradeTarget: 'none',
    special: 'underlay',
    effect: '3×1 road underlay (links the adjacency network). +3 :gold: per tick to each adjacent building.',
  },

  // --- Legitimacy ---
  shrine: {
    key: 'shrine', name: 'Shrine', era: 0, tech: 'Sacred Grounds',
    types: ['legitimacy'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'none',
    legitOnComplete: 10,
    special: 'legit_on_complete',
    effect: 'On completion, gain +10 :legitimacy:.',
  },
  monastery: {
    key: 'monastery', name: 'Monastery', era: 5, tech: 'Tithing',
    types: ['legitimacy'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    legitOnComplete: 30,
    special: 'legit_leverage',
    effect: 'On completion, gain +30 :legitimacy:. Produces :progress: per tick equal to :legitimacy: ÷ 20 (floored).',
  },
  cathedral: {
    key: 'cathedral', name: 'Cathedral', era: 6, tech: 'Flying Butress',
    types: ['legitimacy'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    legitOnComplete: 40,
    special: 'legit_on_complete',
    effect: 'On completion, gain +40 :legitimacy:. At the end of each era, gain +5 :legitimacy:.',
  },
  elysium: {
    key: 'elysium', name: 'Elysium', era: 20, tech: 'Virtual Afterlife',
    types: ['legitimacy'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'output',
    legitOnComplete: 50,
    special: 'legit_leverage',
    effect: 'On completion, gain +50 :legitimacy:. Produces :gold: per tick equal to your current :legitimacy:.',
  },

  // --- Support ---
  windmill: {
    key: 'windmill', name: 'Windmill', era: 6, tech: 'Physics',
    types: ['support'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'range', range: 1,
    special: 'power',
    effect: 'Units & buildings in range gain +1 free upgrade level.',
  },
  coal_plant: {
    key: 'coal_plant', name: 'Coal Plant', era: 9, tech: 'Electricity',
    types: ['support'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'range', range: 1,
    special: 'power',
    effect: 'Units & buildings in range gain +2 free upgrade levels.',
  },
  nuclear_power_plant: {
    key: 'nuclear_power_plant', name: 'Nuclear Power Plant', era: 12, tech: 'Nuclear Power',
    types: ['support'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'range', range: 1,
    special: 'power',
    effect: 'Power. Units & buildings in range gain +3 free upgrade levels.',
  },
  fusion_plant: {
    key: 'fusion_plant', name: 'Fusion Plant', era: 16, tech: 'Fusion',
    types: ['support'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'range', range: 1,
    special: 'power',
    effect: 'Power. Units & buildings in range gain +4 free upgrade levels.',
  },
  national_park: {
    key: 'national_park', name: 'National Park', era: 10, tech: 'National Parks',
    types: ['support'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'none',
    special: 'stacks',
    effect: 'Each National Park grants +10/15/20…% to base terrain yields globally.',
  },
  carbon_sink: {
    key: 'carbon_sink', name: 'Carbon Sink', era: 15, tech: 'Industrial Carbon Capture',
    types: ['support'], placement: 'land',
    hp: 3, upHp: 0, upgradeTarget: 'none',
    special: 'growth',
    effect: 'At the end of combat, all terrestrial tiles gain +1 natural bonus (permanent, stacking).',
  },
  artificial_island: {
    key: 'artificial_island', name: 'Artificial Island', era: 16, tech: 'Industrial Desalination',
    types: ['support'], placement: 'coast',
    hp: 3, upHp: 0, upgradeTarget: 'none',
    special: 'convert_tile',
    effect: 'Permanently converts an ocean tile into an island (land).',
  },
  asteroid_foundry: {
    key: 'asteroid_foundry', name: 'Asteroid Foundry', era: 18, tech: 'Asteroid Capture',
    types: ['support'], placement: 'space',
    hp: 3, upHp: 0, upgradeTarget: 'none',
    special: 'convert_tile',
    effect: 'Creates a new Asteroid on a space (not deep-space) tile.',
  },
  artificial_planet: {
    key: 'artificial_planet', name: 'Artificial Planet', era: 24, tech: 'Planetogenesis',
    types: ['support'], placement: 'deepspace',
    hp: 3, upHp: 0, upgradeTarget: 'none',
    special: 'convert_tile',
    effect: 'Permanently converts a deep-space tile into land.',
  },
  tleilaxu_tanks: {
    key: 'tleilaxu_tanks', name: 'Tleilaxu Tanks', era: 23, tech: 'Vivification',
    types: ['support'], placement: 'land',
    hp: 2, upHp: 0, upgradeTarget: 'none',
    output: { res: 'population', amount: 225, when: 'eraEnd' },
    special: 'population_eraEnd',
    effect: 'At the end of each era, gain +225 population (flat).',
  },
}

/** Effective building HP at a given upgrade level, plus a flat civ-wide bonus
 *  (Hereditary Rule / Masonry). Underlapping buildings (Road) have no HP. Walls grow
 *  HP via upHp (upgradeTarget 'def'); output buildings keep a flat HP. */
export function buildingHp(def, level = 1, hpBonus = 0) {
  return def.hp + Math.max(0, level - 1) * (def.upHp ?? 0) + hpBonus
}

/** Current effect text for a building at a level/era (resolves dynamic effects). */
export function buildingEffect(def, level = 1, eraIndex = 0) {
  return typeof def.effect === 'function' ? def.effect(level, eraIndex) : def.effect
}

/** v2 per-tick output amount for a building with a generic `output` (when: 'tick'),
 *  scaled +25% per upgrade level (upgradeTarget 'output'); 0 otherwise. Terrain base
 *  yields are added separately by the economy engine. */
export function buildingTickAmount(def, level = 1) {
  if (!def.output || def.output.when !== 'tick') return 0
  const mult = def.upgradeTarget === 'output' ? 1 + 0.25 * Math.max(0, level - 1) : 1
  return Math.round(def.output.amount * mult)
}

/** Current economic outputs [{ res, amount, per }] for a building's card display.
 *  Prefers a v1-style `outputs(level)` function; else derives from a v2 `output` whose
 *  timing is 'eraEnd' (per-tick outputs are shown live via occ.tickOutput instead). */
export function buildingOutputs(def, level = 1, eraIndex = 0) {
  if (typeof def.outputs === 'function') return def.outputs(level, eraIndex)
  if (def.output && def.output.when === 'eraEnd') {
    const mult = def.upgradeTarget === 'output' ? 1 + 0.25 * Math.max(0, level - 1) : 1
    return [{ res: def.output.res, amount: Math.round(def.output.amount * mult), per: 'era' }]
  }
  return []
}
