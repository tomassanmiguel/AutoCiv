# Progression Tree (master)

Every unlockable stitched from `units/buildings/specialists/policies/wonders.md` into one advancement
tree. **Each item = one advancement**; its progression name is the item name (policies/bonuses keep
their own name per the convention). Eras are 0-based. Generated from the content docs — **`[proposed]`**,
a snapshot to see coverage before we hand-balance the distribution.

**299 advancements** — Units 54 · Buildings 74 · Specialists 24 · Policies 81 · Wonders 18 · Bonuses 48.
Target was ~10/era × 28 = ~280, so the *count* is right; the *distribution* is the problem (below).

## Density per era

| E | Era | Total | U | B | S | P | W | X | |
|--|--|--|--|--|--|--|--|--|--|
| 0 | Stone | **11** | 2 | 3 | 1 | 2 | 1 | 2 |  |
| 1 | Bronze | **14** | 3 | 4 | 2 | 2 | 1 | 2 |  |
| 2 | Iron | **18** | 2 | 5 | 1 | 4 | 1 | 5 | dense |
| 3 | Classical | **15** | 2 | 5 | 2 | 4 | 1 | 1 | dense |
| 4 | Early Medieval | **15** | 2 | 4 | 1 | 5 | 1 | 2 | dense |
| 5 | Late Medieval | **19** | 3 | 7 | 3 | 5 | 1 | 0 | dense |
| 6 | Renaissance | **20** | 2 | 3 | 0 | 10 | 1 | 4 | dense |
| 7 | Exploration | **6** | 1 | 4 | 0 | 1 | 0 | 0 | ⚠️ sparse |
| 8 | Revolution | **17** | 4 | 3 | 1 | 6 | 1 | 2 | dense |
| 9 | Steam | **15** | 1 | 5 | 3 | 2 | 0 | 4 | dense |
| 10 | Gilded | **8** | 1 | 2 | 0 | 4 | 1 | 0 |  |
| 11 | Modern | **16** | 4 | 2 | 0 | 7 | 0 | 3 | dense |
| 12 | Atomic | **7** | 2 | 2 | 0 | 2 | 0 | 1 | ⚠️ sparse |
| 13 | Silicon | **11** | 2 | 2 | 2 | 2 | 1 | 2 |  |
| 14 | Lunar | **10** | 3 | 2 | 0 | 2 | 2 | 1 |  |
| 15 | Intelligence | **17** | 1 | 2 | 3 | 4 | 1 | 6 | dense |
| 16 | Solar | **10** | 1 | 3 | 0 | 3 | 2 | 1 |  |
| 17 | Invasion | **6** | 4 | 0 | 0 | 1 | 0 | 1 | ⚠️ sparse |
| 18 | Exodus | **8** | 1 | 4 | 1 | 1 | 1 | 0 |  |
| 19 | Frontier | **3** | 1 | 0 | 0 | 2 | 0 | 0 | ⚠️ sparse |
| 20 | Liminite | **16** | 4 | 4 | 1 | 2 | 1 | 4 | dense |
| 21 | Xenotic | **6** | 2 | 1 | 0 | 2 | 0 | 1 | ⚠️ sparse |
| 22 | Evolution | **9** | 0 | 2 | 2 | 4 | 0 | 1 |  |
| 23 | Early Galactic | **4** | 1 | 0 | 1 | 1 | 0 | 1 | ⚠️ sparse |
| 24 | Late Galactic | **7** | 2 | 1 | 0 | 1 | 0 | 3 | ⚠️ sparse |
| 25 | Utopian | **5** | 0 | 3 | 0 | 1 | 1 | 0 | ⚠️ sparse |
| 26 | Time | **6** | 3 | 1 | 0 | 1 | 0 | 1 | ⚠️ sparse |
| 27 | Infinity | **0** | 0 | 0 | 0 | 0 | 0 | 0 | ⚠️ sparse |

_U=unit B=building S=specialist P=policy W=wonder X=bonus._

## Gaps to fill (the sparse late game — you predicted this)

**10 eras under 8:** Exploration (6) · Atomic (7) · Invasion (6) · Frontier (3) · Xenotic (6) · Early Galactic (4) · Late Galactic (7) · Utopian (5) · Time (6) · Infinity (0).

- **Infinity (27) has ZERO** — the finale needs content (a capstone unit tier, a super-wonder, an
  end-game policy, the Ascendancy/Omnicracy/Prescience pool names).
- The **space/future stretch (17–27)** averages ~6/era — thin. Candidates: higher unit tiers
  (an 8th/9th Astral, a Naval revival, more Auxiliary specials), late building tiers (the missing
  5th Wall, more Support/scaling), late specialists, and more late policies/bonuses.
- **Early-mid is overstuffed** (Iron 18, Renaissance 20, Late Medieval 19) — some could shift later,
  but front-loading is intended (late game reaches back for unchosen picks), so filling the tail
  matters more than thinning the head.

---

## The tree, by era

### E0 · Stone — 11
- **Units:** Warrior, Hunter
- **Buildings:** Mud Brick Wall, Cave Painting, Pier
- **Specialists:** Farmer
- **Policies:** Slavery, Burial Rites
- **Wonder:** Stonehenge
- **Bonuses:** Calendar, Agriculture

### E1 · Bronze — 14
- **Units:** Archer, Chariot, Galley
- **Buildings:** Lumber Mill, Farm, Ranch, Shrine
- **Specialists:** Astrologer, Builder
- **Policies:** Tribalism, Scriptoria
- **Wonder:** The Pyramids
- **Bonuses:** Writing, Mining

### E2 · Iron — 18
- **Units:** Spearman, Ballista
- **Buildings:** Caltrops, Fort, Workshop, Market, Roads
- **Specialists:** Trader
- **Policies:** Compound Bow, Specialization, Communal Granary, Sacred Grounds
- **Wonder:** Great Wall
- **Bonuses:** Armor, Steel, Hereditary Rule, Irrigation, Mathematics

### E3 · Classical — 15
- **Units:** Trireme, War Elephant
- **Buildings:** Library, Theater, Aqueduct, Arena, Temple
- **Specialists:** Baker, Priest
- **Policies:** Optics, Caste System, Usury, Hospitality Rites
- **Wonder:** Hanging Gardens
- **Bonuses:** Cement

### E4 · Early Medieval — 15
- **Units:** Crossbowman, Catapult
- **Buildings:** Drydock, Stone Wall, Mint, Caravansary
- **Specialists:** Blacksmith
- **Policies:** Bushido, Feudalism, Manorial Levy, Theocracy, Diplomatic Marriage
- **Wonder:** Machu Picchu
- **Bonuses:** Crop Rotation, Metallurgy

### E5 · Late Medieval — 19
- **Units:** Knight, Heavy Cavalry, Longship
- **Buildings:** Decoy, Command Post, Stables, Forge, Glassworks, Lighthouse, Monastery
- **Specialists:** Scholar, Merchant, Soldier
- **Policies:** Dressage, Guilds, Merchant Navy, Forestry, State Alchemists
- **Wonder:** Hagia Sophia

### E6 · Renaissance — 20
- **Units:** Trebuchet, Warrior Monk
- **Buildings:** Observatory, City, Windmill
- **Policies:** Siege Doctrine, Oligarchy, Freedom of Religion, Mercantilism, Organized Religion, Military Tradition, Blueprints, Festivals, Pilgrimage, Golden Age
- **Wonder:** Taj Mahal
- **Bonuses:** Monumentality, Clocks, Printing Press, Engineering

### E7 · Exploration — 6 ⚠️
- **Units:** Cannoneer
- **Buildings:** Watchtower, Harbor, Hacienda, Cathedral
- **Policies:** Colonialism

### E8 · Revolution — 17
- **Units:** Musketman, Dragoon, Frigate, Pirate
- **Buildings:** Powder Magazine, Castle, School
- **Specialists:** Inventor
- **Policies:** Guerilla Warfare, Civil Rights, Nationalism, Columbian Exchange, Levee en Masse, Manifest Destiny
- **Wonder:** Statue of Liberty
- **Bonuses:** Democracy, Combustion

### E9 · Steam — 15
- **Units:** Artillery
- **Buildings:** Sea Mine, Factory, Stock Exchange, Bank, Coal Plant
- **Specialists:** Scientist, Doctor, Banker
- **Policies:** Mountaineering, Architectural Tradition
- **Bonuses:** Telegram, Industrial Agriculture, Public Schooling, Railroad

### E10 · Gilded — 8
- **Units:** Biplane
- **Buildings:** Armory, Museum
- **Policies:** Aerodynamics, Unions, Laissez-Faire, Modernization
- **Wonder:** Eiffel Tower

### E11 · Modern — 16
- **Units:** Rifleman, Tank, Battleship, Mustard Man
- **Buildings:** Aircraft Carrier, Hospital
- **Policies:** Reinforced Construction, Fascism, Communism, Quantitative Easing, United Nations, Propaganda, Tourism
- **Bonuses:** Composites, Socialism, Mass Production

### E12 · Atomic — 7 ⚠️
- **Units:** Mortar Squad, Fighter
- **Buildings:** Laboratory, Solar Array
- **Policies:** Naturalism, Embassies
- **Bonuses:** Relativity

### E13 · Silicon — 11
- **Units:** Infantryman, Missile Launcher
- **Buildings:** Radar Station, 3D Printer
- **Specialists:** Engineer, Statistician
- **Policies:** Adaptive Strategy, Autonomous Governance
- **Wonder:** Hadron Collider
- **Bonuses:** Microprocessors, 3d Printing

### E14 · Lunar — 10
- **Units:** Railgunner, Raptor, Satellite
- **Buildings:** Discombobulator, Data Center
- **Policies:** Spaceflight Tactics, Lunar Defense Stratagem
- **Wonder:** Panopticon, Intl. Space Station
- **Bonuses:** Mass Drivers

### E15 · Intelligence — 17
- **Units:** Drone
- **Buildings:** Deflector Array, Hydroponicist
- **Specialists:** Mentat, Geneticist, Replicant
- **Policies:** Centralized Cryptocurrency, Digital Afterlife, Rapid Reconstruction, Hive Mind
- **Wonder:** The Ansible
- **Bonuses:** Forced Evolution, Machine Synthesis, Psychic Awakening, Transhumanism, Technocracy, Neural Interfaces

### E16 · Solar — 10
- **Units:** Leviathan
- **Buildings:** Space Telescope, Fusion Plant, Artificial Island
- **Policies:** Nanite Warfare, Martian Freedom, Replicant Rights
- **Wonder:** Skynet, Happy Valley
- **Bonuses:** Hydroponics

### E17 · Invasion — 6 ⚠️
- **Units:** Terminator, Plasmer, Hovercraft, Spaceship
- **Policies:** Xenodiplomacy
- **Bonuses:** Tightbeams

### E18 · Exodus — 8
- **Units:** Grav Cannon
- **Buildings:** Psy-Link, Shield Matrix, Vacuum Assembly, Asteroid Mine
- **Specialists:** Investor
- **Policies:** Deepfaked Reality
- **Wonder:** Death Star

### E19 · Frontier — 3 ⚠️
- **Units:** Cryo Specialist
- **Policies:** Perfect Trade, Ecology

### E20 · Liminite — 16
- **Units:** Psyker, Warper, Valkyrie, Zealot
- **Buildings:** Spaceport, Xenocultivator, Elysium, Artificial Planet
- **Specialists:** Nanomancer
- **Policies:** Neocolonialism, Star Hopping
- **Wonder:** Stargate
- **Bonuses:** Liminite, Megastructure Engineering, Liminism, Matter Compression

### E21 · Xenotic — 6 ⚠️
- **Units:** Space Marine, X-Wing
- **Buildings:** Cogitorium
- **Policies:** Cortical Stacks, Omniplomacy
- **Bonuses:** Chimeric Agriculture

### E22 · Evolution — 9
- **Buildings:** Spice Extractor, Tleilaxu Tanks
- **Specialists:** Superintelligence, Abioticist
- **Policies:** Purpose Engineering, Futurization, Cosmic Celebration, Immortality
- **Bonuses:** Replication

### E23 · Early Galactic — 4 ⚠️
- **Units:** Tachyon Lancer
- **Specialists:** Plutarch
- **Policies:** Galactic Legion
- **Bonuses:** FTL

### E24 · Late Galactic — 7 ⚠️
- **Units:** Tachyon Bomber, Star Destroyer
- **Buildings:** Cloning Bay
- **Policies:** Empire of the Stars
- **Bonuses:** Antimatter, Hyperquantum Computing, Nanoswarms

### E25 · Utopian — 5 ⚠️
- **Buildings:** Singularity, Chronobooster, Dyson Sphere
- **Policies:** Elder Awareness
- **Wonder:** Ecumenopolis

### E26 · Time — 6 ⚠️
- **Units:** Ascendant, Sun Launcher, Timelord
- **Buildings:** Black Hole Station
- **Policies:** Chronoscopy
- **Bonuses:** Time Travel

### E27 · Infinity — 0 ⚠️ EMPTY
- _(nothing — needs content)_

