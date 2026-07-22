// The full pool of advancements ("progresses"), one bucket per era, verbatim from
// the design sheet (misspellings intentionally preserved). The era index is the
// canonical era number; an advancement is drawable once its era <= current era.
//
// Most advancements are NOT yet implemented — they exist in the pool as "Not Yet
// Implemented" cards. The IMPLEMENTED registry (keyed by exact name) gives the few
// that currently do something: what they unlock and the card description. We fill
// this in slowly over time.

import { ERA_INDEX } from './eras.js'

// era id -> ordered advancement names (20 per era).
const POOL = {
  stone: ['Fire', 'Clothes', 'Cave Painting', 'Language', 'Tools', 'Tribalism', 'Mysticism', 'Hunting', 'Agriculture', 'Fermentation', 'Pack Bonding', 'Mud Brick', 'Basket Weaving', 'Burial Rites', 'Bartering', 'Fishing', 'Ownership', 'Sacred Grounds', 'Midwivery', 'The Sling'],
  bronze: ['The Wheel', 'Domestication', 'Pottery', 'Writing', 'Mining', 'Oral Tradition', 'Hereditary Rule', 'Archery', 'Sailing', 'The Plough', 'Specialization', 'Leatherwork', 'Slavery', 'Alloying', 'Baking', 'Caste System', 'Masonry', 'Trade Networks', 'Hospitality Rites', 'Brothels'],
  iron: ['Steel', 'Weights and Measures', 'Coinage', 'Horseback Riding', 'Organized Religion', 'Celestial Navigation', 'Mathematics', 'Irrigation', 'Calendar', 'Festivals', 'Terracing', 'Surveying', 'Siege', 'Rudders', 'Code of Laws', 'Embassy', 'Diplomatic Marriage', 'Paper', 'Alphabet', 'Composite Bows'],
  classical: ['Urbanization', 'Democracy', 'Concrete', 'Philosophy', 'Arches', 'Glassblowing', 'Machinery', 'Public Baths', 'Entertainment', 'Poetry', 'Monotheism', 'Census', 'Defensive Pact', 'Rhetoric', 'Pharmacology', 'Citizenship', 'Warships', 'Professional Soldiers', 'Fresco', 'Dressage'],
  early_medieval: ['Feudalism', 'Armor', 'Metallurgy', 'Crop Rotation', 'Trial by Jury', 'Pilgrimage', 'Milling', 'Stirrups', 'Vassalage', 'Castles', 'Schism', 'Civil Service', 'Horseshoes', 'Clinker Construction', 'Algebra', 'Optics', 'Monastic Order', 'Counterweights', 'Manor System', 'Hedgerows'],
  late_medieval: ['Compass', 'Absolute Monarchy', 'Alchemy', 'Longbow', 'Mercenaries', 'Flying Butress', 'Inquisition', 'University', 'Diplomatic Corps', 'Stained Glass', 'Troubadours', 'Guilds', 'Gunpowder', 'Common Law', 'Physics', 'Quarantine', 'Cofferdams', 'Tithing', 'Crusades', 'Branding'],
  // NOTE: the design sheet lists "Domestication" in BOTH Bronze and Renaissance.
  // Since IMPLEMENTED is name-keyed, that collision would light up both eras once
  // Bronze's Domestication is implemented — so the Renaissance duplicate is renamed
  // "Husbandry" (era-appropriate) to keep names unique.
  renaissance: ['Perspective', 'Printing Press', 'Canons', 'Scientific Method', 'Maritime Law', 'Banking', 'Economics', 'Calculus', 'Astronomy', 'Star Forts', 'Humanism', 'Machiavellianism', 'Joint Stock Company', 'Tolerance', 'Patronage', 'Husbandry', 'Brocade', 'Anatomy', 'Clocks', 'Masquerades'],
  exploration: ['Deepwater Navigation', 'Colombian Exchange', 'Reformation', 'Shipbuilding', 'Muskets', 'Creole Culture', 'Colonialism', 'Native Diplomacy', 'Scurvy Prevention', 'Natural History', 'Evangelism', 'Coffee', 'Cartography', 'Opera', 'Mercantilism', 'Patents', 'Potatoes', 'Dragoons', 'Indentured Servitude', 'Circumnavigation'],
  revolution: ['Constitution', 'Levee en Masse', 'Theory of Evolution', 'Nationalism', 'Bayonets', 'Newspaper', 'Paper Money', 'Statistics', 'Metric System', 'Inoculation', 'Gas Light', 'Free Press', 'Abolition', 'Rifling', 'Chemistry', 'Canning', 'Hydraulic Press', 'Native Integration', 'Napoleonic Code', 'Zooly'],
  steam: ['Telegraph', 'Mass Production', 'Electricity', 'Railroad', 'Machine Guns', 'Public Schooling', 'Germ Theory', 'Public Health', 'Gunboat Diplomacy', 'Steel Hulls', 'Canals', 'Industrial Agriculture', 'Incorporation', 'Dynamite', 'Income Tax', 'Reforestation', 'Suspension Bridge', 'Restaurants', 'Contraception', 'Archaeology'],
  gilded: ['Telephone', 'Refrigeration', 'Automobile', 'Communism', 'Eugenics', 'National Parks', 'Petrochemicals', 'Sports', 'Radio', 'Impressionism', 'Cameras', 'Skyscrapers', 'Immigration', 'Espionage', 'Submarines', 'Anti-Trust', 'Laissez Faire', 'Trade Unions', 'Anesthesia', 'Cult of Personality'],
  modern: ['Red Cross', 'Highways', 'Trenchwarfare', 'Jazz', 'Facism', 'Universal Sufferage', 'Geneva Convention', 'Flight', 'Tanks', 'Penicillin', 'Air Conditioning', 'Suburbanization', 'Magnetic Recording', 'Prohibition', 'Comics', 'Television', 'Decolonization', 'Total War', 'Radar', 'Guerilla Warefare'],
  atomic: ['Orbital Mechanics', 'Rocketry', 'Fission', 'Nuclear Weaponry', 'Mutually Assured Destruction', 'United Nations', 'Aircraft Carriers', 'Renewable Energy', 'Climate Science', "Rock n' Roll", 'Plastics', 'Civil Rights', 'Internet', 'Ecology', 'Psychology', 'Game Theory', 'Aerodynamics', 'Lithium-Ion', 'War on Drugs', 'Human Genome Project'],
  silicon: ['Blockchain', 'Microprocessors', 'Drone Warfare', 'Maglev', 'High Frequency Trading', 'Streaming', 'Cell Phones', 'Space Station', 'Lasers', 'Nonproliferation', 'Video Games', 'E-commerce', 'Identity Politics', 'Neurodivergence', '3d printing', 'Electric Vehicles', 'Hacking', 'Democratic Socialism', 'Social Media', 'Semaglutides'],
  lunar: ['Satelite Defense', 'Sustainable Habitats', 'Deefake', 'Large Language Models', 'Telework', 'Carbon Nanotubes', 'Fusion', 'Discombobulator', 'Universal Basic Income', 'Space Tourism', 'Artificial Meat', 'Stratoblasting', 'Helium-3', 'Space Treaty', 'Industrial Desalination', 'Data Privacy', "Alzheimer's Cure", 'Prediction Markets', 'Reuseable Rocketry', 'Self-Driving'],
  intelligence: ['Robotic Labor', 'AGI', 'Neural Interfaces', 'Quantum Cryptography', 'Carbon Capture', 'Centralized Cryptocurrency', 'Cognitive Liberty', 'Robotic Medicine', 'Meritocracy', 'Autonomous Warfare', 'Selfschooling', 'Technocracy', 'Biofuel', 'Sapient Rights', 'Synthetic Art', 'Recursive Self-Improvement', 'Warm Superconductors', 'Megalopolis', 'P=NP', 'Flying Taxis'],
  solar: ['In-Vitro Editing', 'Cure for Cancer', 'Dome City', 'Augmented Reality', 'Solar Sails', 'Space Marines', 'Asteroid Mining', 'Hydroponics', 'Artificial Gravity', 'Space Elevator', 'Exosuit', 'Jovian Life', 'Gravboots', 'Energy Capture', 'Fuel Synthesis', 'Atmokinesis', 'Offworld Governance', 'Replicant Rights', 'Somnology', 'Belter Culture'],
  invasion: ['Plasmatics', 'Shielding', 'Starships', 'EMP', 'Bunkering', 'Maturation', 'Global Banding', 'Deflectors', 'Cold FUsion', 'Masking', 'Scorched Earth', 'Marinopolis', 'Super Meth', 'Wargames', 'Synaptic Rewiring', 'Replicant Legions', 'Alien Cryptography', 'Ludism', 'Social Ranking', 'Xenocontainment'],
  exodus: ['Cryogenics', 'Flagships', 'Generation Ships', 'Wormholes', 'Occlusion', 'Scrubbing', 'Asteroid Capture', 'Lightspeed', 'Martianism', 'Resurrection', 'Robot Uprising', 'Deep Space Rationing', 'Full Brain Simulation', 'Rapid Reconstruction', 'Millenium Planning', 'Stagnation Politics', 'Immersionism', 'Final Farewells', 'Engram Engrafting', 'Cosmic Myth'],
  frontier: ['Xenobiology', 'Digestion Adaptation', 'Proactive Immunity', 'Deep Space Relays', 'New Silk Road', 'Bimodal Starships', 'Tightbeams', 'Adaptive Literature', 'Neotraditionalism', 'Frontier Cuisine', 'Stillhabs', 'Eco culture', 'Alien Ecology', 'Church of the Simulation', 'Adamantium', 'Suspensors', 'Lightsaberws', 'Esperanto', 'Diaspora', 'Cyberball'],
  liminite: ['Neuropartitioning', 'Virtual Reality', 'FTL Signaling', 'Liminite Stabilization', 'Soma', 'Nonfungible Tokening', 'Spaceports', 'Matter Compression', 'Longevity', 'Hard Light', 'Abiogenesis', 'Gravwaves', 'Omnisurveillance', 'Right to Rehabilitation', 'Molecular Nanotechnology', 'Lithoscoping', 'Melange', 'Interstellar Government', 'Individualized Propaganda', 'Liminal Arms'],
  xenotic: ['Xenodiplomacy', 'Planetary Governance', 'Autotranslation', 'Cloning', 'Orbital Bombardment', 'Alien Rights', 'Thoughtcrime', 'Vivification', 'Hologramming', 'Inertia Dampeners', 'Gene Splicing', 'Lossless Conversion', 'FTL Inhibitors', 'Astral Admirality', 'Off-planet Resorts', 'Radical Conformity', 'Coretapping', 'Peronal Spacecraft', 'Virtual Afterlife', 'Chimeric Agriculture'],
  evolution: ['Uploading', 'Controlled Evolution', 'Alien Integration', 'Cyborg', 'Hyper-Fi Pop', 'Von Neuman Probing', 'Ancestral Memory', 'Generational Cycling', 'Legacy Vaults', 'Permanent Infrastructure', 'Superintelligence', 'Dream Labor', 'Distributed Being', 'Bioethics', 'Clone Legions', 'Wealth Aboloition', 'Psionics', 'Bohemian Tax', 'Purity Strata', 'Subatomic Slicing'],
  early_galactic: ['Wormhole Generation', 'Galactic Democracy', 'Universal Currency', 'Liminite Alchemy', 'Dyson Spheres', 'Ringworlds', 'Prime Directive', 'Dark Matter Engines', 'Interstellar Imperium', 'Terraforming', 'Telepathy', 'Space Piracy', 'Anchor Freighting', '5d Barriers', 'Targeting', 'Galactic Law', 'Energetic Condensation', 'Starright', 'Particle Lance', 'Exoptics'],
  late_galactic: ['Planteogenesis', 'Nanoswarms', 'Planet Busting', 'Hyperquantum Computing', 'Megastructure Engineering', 'Intergalactic Consensus', 'Antimatter Harvesting', 'Kardashev Advancement', 'Warm Drive', 'Eternal Rule', 'Stealth Plating', 'Deep Space Defense', 'Pleasure Planets', 'Predictive Logistics', 'Neutron Canons', 'Singularity Stations', 'Xenoarchaeology', 'Adaptive Hulls', 'Ecumenopolis', 'Grand Armada'],
  utopian: ['Biological Immortality', 'Uplifting', 'Phasing', 'Shapeshifting', 'Hive Mind', 'Evolutionary Art', 'Perfect Sufferage', 'Fifth Dimensional Bending', 'Ship of Thesus', 'Star Preservation', 'Equal Resourcing', 'Superhumantiy', 'Cosmic Art', 'Hegemony', 'Postscarcity', 'Tachyons', 'Perpetual Motion', 'Mega Colonization', 'Purpose Engineering', 'Morphological Freedoms'],
  time: ['Bootstrapping', 'Chronotic Regulation', 'Multiversal Accord', 'Teleportation', 'Precognitive Policing', 'Instant Computing', 'Chronoscopy', 'Reliving', 'Temporal Ethics', 'Paradoxing', 'Ego Dispersion', 'Prenatal Strike', 'Black Hole Transit', 'Relativity Ray', 'Sonic Screwdrivers', 'Timeline Steeling', 'Single Truth', 'Timeloop Retirement', 'Oblivion Beam', 'Probability Drive'],
  infinity: ['Universal Simulation', 'Black Hole Warfare', 'Immutability', 'Duplication', 'Pocket Universes', 'Infinite Moments', 'Taboo', 'Planteshifting', 'Vac-living', 'Reanimation', 'Invincibility', 'Final Prupose', 'Entropic Reversal', 'Unbound Memory', 'Endless Song', 'Elysium', 'Elder Contact', 'Omnicracy', 'Ascendancy', 'Prescience'],
}

// Flattened, stable-id list. id = "eraId:index" (unique even across duplicate
// names like "Domestication", which appears in both Bronze and Renaissance).
export const ADVANCEMENTS = []
for (const [eraId, names] of Object.entries(POOL)) {
  names.forEach((name, i) => {
    ADVANCEMENTS.push({ id: `${eraId}:${i}`, name, eraId, eraIndex: ERA_INDEX[eraId] })
  })
}

/**
 * Implemented advancements: what each unlocks + the card description. `kind`:
 *  - 'unit' / 'building' -> key into UNIT_DEFS / BUILDING_DEFS (fills a category slot)
 *  - 'pop'               -> key into POP_TYPES (unlocks a specialist)
 *  - 'policy'            -> key into POLICY_DEFS (fills a policy slot)
 *  - 'modifier'          -> a civilization-wide passive (applied immediately)
 *
 * Keyed by NAME (implementation is resolved via name, not id). INVARIANT: only add
 * names that are UNIQUE across the pool — a few names repeat between eras (e.g.
 * "Domestication" in Bronze and Renaissance), and implementing a repeated name
 * would mark every pool entry with that name implemented.
 */
export const IMPLEMENTED = {
  'Clothes':      { kind: 'modifier', key: 'clothes', description: 'Permanently gives all friendly units +5 :defense:.' },
  'Fire':         { kind: 'building', key: 'campfire', description: 'Unlocks the Campfire — a land :utility: building that heals adjacent units & buildings each second in combat.' },
  'Tools':        { kind: 'pop', key: 'builder', description: 'Unlocks the Builder specialist (+5 :production: per tick).' },
  'Cave Painting':{ kind: 'building', key: 'cave_painting', description: 'Unlocks the Cave Painting — a :progress: building whose stored :progress: (doubling each era) is granted when it is overbuilt.' },
  'Language':     { kind: 'policy', key: 'language', description: 'Unlocks the Language policy — each Citizen also produces +1 :progress: per tick.' },
  'Tribalism':    { kind: 'policy', key: 'tribalism', description: 'Unlocks the Tribalism policy — units gain +1 :attack: and +1 :defense: per other friendly unit of the same type.' },
  'Mysticism':    { kind: 'pop', key: 'shaman', description: 'Unlocks the Shaman specialist (+3 :progress: per tick; +10 :legitimacy: per Shaman at each combat end).' },
  'Hunting':      { kind: 'policy', key: 'hunting', description: 'Unlocks the Hunting policy — whenever your units deal unblocked damage, also gain that much :food:.' },
  'Agriculture':  { kind: 'pop', key: 'farmer', description: 'Unlocks the Farmer specialist (+5 :food: per tick).' },
  'Fermentation': { kind: 'building', key: 'brewery', description: 'Unlocks the Brewery — a :gold: building that earns gold from nearby units (which fight harder but frailer in its range).' },
  'Pack Bonding': { kind: 'unit', key: 'wolf', description: 'Unlocks the Wolf — a fast land :cavalry: unit.' },
  'Mud Brick':    { kind: 'building', key: 'mud_wall', description: 'Unlocks the Mud Wall — a sturdy land :defense: building.' },
  'Basket Weaving': { kind: 'modifier', key: 'basket_weaving', silhouette: '/sprites/ui/food.png', description: 'All :food: thresholds are 5% lower.' },
  'Burial Rites': { kind: 'policy', key: 'burial_rites', description: 'Whenever a unit dies, gain :progress: equal to its :defense:.' },
  'Midwivery':    { kind: 'policy', key: 'midwivery', description: 'Unlocks the Midwivery policy — whenever you create a unit, gain :production: equal to its :defense:.' },
  'Bartering':    { kind: 'pop', key: 'trader', description: 'Unlocks the Trader specialist (+5 :gold: per tick).' },
  'Fishing':      { kind: 'building', key: 'pier', description: 'Unlocks the Pier — a coastal :food: building.' },
  'Ownership':    { kind: 'policy', key: 'ownership', description: 'Unlocks the Ownership policy — all buildings also produce +2 :gold: per tick.' },
  'Sacred Grounds': { kind: 'policy', key: 'sacred_grounds', description: 'Unlocks the Sacred Grounds policy — each empty land tile grants +1 :legitimacy: at the end of combat.' },
  'The Sling':    { kind: 'unit', key: 'slinger', description: 'Unlocks the Slinger — a land :ranged: unit.' },

  // --- Bronze era ---
  'The Wheel':    { kind: 'building', key: 'road', description: 'Unlocks the Road — a Supplement building that underlaps others and links every adjacent tile, extending building ranges and unit movement.' },
  'Domestication': { kind: 'building', key: 'ranch', description: 'Unlocks the Ranch — a :food: building that produces food each tick and grows stronger after every combat (reset if destroyed).' },
  'Pottery':      { kind: 'building', key: 'kiln', description: 'Unlocks the Kiln — a :production: building fed by each adjacent building.' },
  'Mining':       { kind: 'building', key: 'mine', description: 'Unlocks the Mine — a :gold: building, doubled when placed on a mountain.' },
  'Oral Tradition': { kind: 'policy', key: 'oral_tradition', description: 'Unlocks the Oral Tradition policy — at the end of combat, gain :gold: and :progress: equal to your current :legitimacy:.' },
  'Hereditary Rule': { kind: 'policy', key: 'hereditary_rule', description: 'Unlocks the Hereditary Rule policy — at the end of combat, all units and buildings permanently gain +1 :defense:.' },
  'The Plough':   { kind: 'modifier', key: 'plough', silhouette: '/sprites/ui/food.png', description: 'All :food: thresholds are 5% lower.' },
}

export function isImplemented(name) {
  return Object.prototype.hasOwnProperty.call(IMPLEMENTED, name)
}
