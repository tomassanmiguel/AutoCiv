// SUB-DEFINITIONS — the second layer of the progress tooltip.
//
// A lot of nodes in the web say "create the guildhall building" or "outposts get
// +2 :gold:" without saying what a guildhall or an outpost IS. Rather than
// inflate every node's text with the same paragraph, a node lists the terms it
// leans on in `sub: [...]` and the tooltip renders them as hoverable chips —
// hover a chip, get the definition. One definition, many referrers.
//
// This registry is DESIGN TEXT, not wiring. A building here is a named thing the
// web promises; `data/buildings.js` holds the ones that are actually placeable.
// The two are deliberately separate — the design can name fifty buildings while
// ten exist, and nothing silently half-works.

const D = (name, text, group) => ({ name, text, group })

export const DEFINITIONS = {
  // --- core concepts --------------------------------------------------------
  outpost: D('Outpost', 'A settled tile. Its natural yield is MULTIPLIED (doubled to start) and the six tiles around it become yours. Outposts are how territory grows.', 'concept'),
  city: D('City', 'An outpost upgraded into a city. It claims no new ground, but its population compounds every era and adds :production: :gold: :progress: on top of the tile.', 'concept'),
  citizen: D('Citizen', 'One point of a city\'s population. Most city bonuses are counted per citizen, so a tall city pays into them repeatedly.', 'concept'),
  rural: D('Rural tile', 'Ground you control that carries NO outpost and no city — the plain territory between your settlements.', 'concept'),
  palace: D('Palace', 'Your capital, at the centre of the map. It has base yields of 5 :production: and 5 :progress:, fights in combat, and if it falls the run ends.', 'concept'),
  wonder: D('Wonder', 'Built by crossing a :production: threshold rather than chosen from this web. Each tier offers a new set; the last one converts all further :production: into :gold:.', 'concept'),
  temple: D('Temple', 'The religion building. On its own it does little — nearly every religious node adds another output or multiplier to EVERY temple you own, so they are meant to be stacked.', 'building'),
  mercenary: D('Mercenary', 'A unit hired with :gold: before a battle. It fights that one battle and disbands afterwards, so it is a spend, not an investment.', 'concept'),
  reroll: D('Reroll', 'Paying :gold: to redraw the three advancements on offer. The price doubles with each reroll inside one offer and resets at the next threshold.', 'concept'),
  base_yield: D('Base yield', 'What a tile produces from its terrain alone, before outpost multipliers, buildings and percentage bonuses are applied. Raising a base yield therefore feeds everything downstream of it.', 'concept'),
  vision: D('Vision', 'How much of the map is charted. You may only settle, build and fight on ground you can see, so vision gates every other kind of expansion.', 'concept'),
  raze: D('Razing', 'What an enemy does when it reaches ground with nothing to fight: it destroys the building, then the city, then the outpost, leaving a ruin you must pay :gold: to rebuild.', 'concept'),
  upgrade_level: D('Upgrade level', 'Every unit and building has a level bought with :gold:. A level raises its whole payout — for a building that includes its adjacency bonuses, so upgrading a well-placed building is worth far more than upgrading a bad one.', 'concept'),
  expansion_event: D('Expansion event', 'One free settle or city founding, granted outright instead of being bought with a :food: threshold.', 'concept'),

  // --- regions --------------------------------------------------------------
  old_world: D('Old World', 'The continent holding your palace — the ground you start on and chart first.', 'region'),
  new_world: D('New World', 'The second continent, across the ocean channel. Reaching it needs vision and the means to cross water.', 'region'),
  exoplanet: D('Exoplanet', 'The world out in deep space, with its own land, seas and moon. The far end of the expansion ladder.', 'region'),
  space_tile: D('Space tile', 'Open space — the void between bodies. Everything can cross it; almost nothing can live on it without a permission from this web.', 'region'),

  // --- combat vocabulary ----------------------------------------------------
  fortification: D('Fortification', 'A unit class: no :attack: at all, enormous :defense:, never moves. It TAUNTS — enemies in reach strike it before anything else — so it buys your ranged line time.', 'unit'),
  command_unit: D('Command unit', 'A unit class: no :attack:. It carries a COMMAND RADIUS and every friendly unit inside that radius gets its buff.', 'unit'),
  command_radius: D('Command radius', 'The ring of tiles around a command unit within which its buff applies. Several nodes widen it.', 'concept'),
  taunt: D('Taunt', 'Enemies that could strike anything else strike the taunting unit instead, as long as it is in their reach.', 'concept'),
  bleed: D('Bleed', 'A lasting wound: the target loses a percentage of its :defense: every turn for the rest of the battle.', 'concept'),
  burn: D('Burn', 'Like bleed but from fire — a percentage of maximum :defense: lost per turn for the rest of the battle.', 'concept'),
  stun: D('Stun', 'The target loses its next turn entirely — no move, no attack.', 'concept'),
  blast: D('Blast radius', 'How far a :siege: unit\'s damage spreads from the tile it hits. Damage falls off with each tile of distance.', 'concept'),
  speed_stat: D('Speed', 'How many tiles a unit crosses in one turn. Cavalry and aerial units live on this number.', 'concept'),
  range_stat: D('Range', 'How far a unit can strike without moving. Ranged, siege and astral units trade :defense: for it.', 'concept'),

  // --- buildings the web promises ------------------------------------------
  library: D('Library', 'Produces +1 :progress: per tick, and another +1 after every combat it survives. Razing it resets the accumulation.', 'building'),
  theater: D('Theater', 'Produces +5 :progress: per tick — flat, immediate, and never grows.', 'building'),
  aqueduct: D('Aqueduct', 'Placed between a mountain and a city. The city it feeds has its citizens produce :food: as well as their usual output.', 'building'),
  glassworks: D('Glassworks', 'Every building within range 1 gains +5 :production: output.', 'building'),
  hacienda: D('Hacienda', 'Built in the New World. Gives every New World tile +4 :gold:.', 'building'),
  courthouse: D('Courthouse', 'Raises the output of every tile in range 1 by 10%.', 'building'),
  market: D('Market', 'Every citizen within range 3 produces +1 :gold:.', 'building'),
  bank: D('Bank', 'At the end of each combat, pays 7% interest on the :gold: you are holding — so it rewards not spending.', 'building'),
  opera_house: D('Opera House', 'Raises the :progress: yield of every tile in range 1 by 50%.', 'building'),
  observatory: D('Observatory', 'Mountain only. Produces +1 :progress:, and gains another +1 permanently every time you reroll an offer.', 'building'),
  laboratory: D('Laboratory', 'Raises the :progress: output of every tile in range 3 by 50%.', 'building'),
  granary: D('Granary', 'Doubles the base :food: yield of every plains tile in range 1.', 'building'),
  workshop: D('Workshop', 'Produces +16 :production: per tick.', 'building'),
  wharf: D('Wharf', 'Produces 18 :food: per tick.', 'building'),
  colonial_office: D('Colonial Office', 'Built in the New World. Produces +1 :gold: per tick for every New World outpost you control.', 'building'),
  megafarm: D('Megafarm', 'Produces :food: equal to all the :food: produced within its range — it copies a breadbasket rather than making one.', 'building'),
  skunkworks: D('Skunkworks', 'Produces +1 :production:, and gains +2 permanently every time you reroll an offer.', 'building'),
  casino: D('Casino', 'Produces +1 :gold:, and gains +3 permanently every time you reroll an offer.', 'building'),
  monument: D('Monument', 'Produces +15 :progress: per tick.', 'building'),
  beacon: D('Interplanetary Beacon', 'Built in pairs. Every building adjacent to one beacon counts as adjacent to every building next to the other — adjacency across the solar system.', 'building'),
  helium3_mine: D('Helium-3 Mine', 'Moon or Mars only. Produces +70 :production: per tick.', 'building'),
  data_center: D('Data Center', 'Grants +100% :gold: output to every land tile in range 3.', 'building'),
  fusion_plant: D('Fusion Plant', 'Raises the upgrade level of every unit and building in range 1 by 3.', 'building'),
  zerograv_fab: D('Zero-G Fabricator', 'Produces +10 :production: for every empty space tile in range 2 — it wants to be surrounded by nothing.', 'building'),
  zerograv_lab: D('Zero-G Laboratory', 'Produces +10 :progress: for every empty space tile in range 2.', 'building'),
  stock_exchange: D('Stock Exchange', 'Produces +1 :gold: for every citizen in your empire.', 'building'),
  hospital: D('Hospital', 'Citizens in cities within range 5 each produce +1 :food:.', 'building'),
  museum: D('Museum', 'Gives +5 :progress: and +5 :gold: for every building in range 3 that was built BEFORE it — a reward for building it late.', 'building'),
  decoy: D('Decoy', 'Enemies within range 5 path to the decoy instead of your palace. Once they reach it they reroute — it buys turns, not safety.', 'building'),
  spaceport: D('Spaceport', 'Placed adjacent to a planetary tile. Every 10 turns of combat it creates an :astral: unit beside it, and gives +1 :gold: to all astral units.', 'building'),
  replicator: D('Replicator', 'Every 10 turns of combat, creates a temporary copy of the unit standing on it.', 'building'),
  guildhall: D('Guildhall', 'Produces +3 :gold: for every UNIQUE building in your empire — it pays for variety, not quantity.', 'building'),
  armory: D('Armory', 'Every unit in range 1 gains +5 :defense: permanently after each combat.', 'building'),
  harbor: D('Harbor', 'Gives +1 base :gold: yield to every connected water tile.', 'building'),
  windmill: D('Windmill', 'Doubles the output of every adjacent rural tile.', 'building'),
  university: D('University', 'Produces +2 :progress: for each adjacent citizen.', 'building'),
  arena: D('Arena', 'At the end of each combat the arena permanently gains +50 :gold: of output and you receive +250 :gold:.', 'building'),
  factory: D('Factory', 'Produces +20 :production: per tick.', 'building'),
  plantation: D('Plantation', 'Produces +1 :food:, and permanently +1 more every 20 ticks.', 'building'),
  tourism_office: D('Tourism Office', 'Produces +25 :gold: for every adjacent wonder.', 'building'),
  airport: D('Airport', 'Produces +5 :gold: and +5 :production: for every :aerial: unit in range 3.', 'building'),
  hangar: D('Hangar', 'When an :aerial: unit dies within range 10, it respawns beside the hangar 10 turns later.', 'building'),
  printer3d: D('3D Printer', 'On completion, immediately puts an outpost on every adjacent rural tile, claiming them if it must. Raises the yield of outposts in range 3 by 50%.', 'building'),
  hydro_dam: D('Hydroelectric Dam', 'Coast not adjacent to ocean only. Gives +1 upgrade level to every unit and building in range 1.', 'building'),
  solar_farm: D('Solar Panel Farm', 'Desert only. Gives +1 upgrade level to every unit and building in range 1.', 'building'),
  geothermal: D('Geothermal Plant', 'Tundra only. Gives +1 upgrade level to every unit and building in range 1.', 'building'),
}

export const definitionOf = (key) => DEFINITIONS[key] ?? null

/** Keys named by a node that don't exist here — checked by validateStructure. */
export const unknownDefinitions = (keys) => keys.filter((k) => !DEFINITIONS[k])
