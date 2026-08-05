# AutoCiv — progression design brief (verbatim)

> The designer's original text, transcribed unchanged: same wording, same
> typos, same `vs` pairings.
>
> ⚠️ **[`design.md`](design.md) SUPERSEDES THIS FILE** wherever the two disagree
> about a *system* — the wonder/production loop, vision, temples and the two
> clocks have all been redesigned since this was written. This file remains
> authoritative for **what an individual tech does**.
>
> `src/game/data/content.json` is a structured *interpretation* of both. Where it
> disagrees with either, the dataset is wrong. Every number in the dataset that
> does not appear here is an assumption; `docs/open-questions.md` lists them.

## Class unlocks

- Mud Brick - unlocks Fortification units. (Wall units taunt enemies)
- The sling - unlocks ranged units
- Horseback riding - unlocks cavalry cavalry
- Siege - unlocks siege units
- Sailing - unlocks naval units
- War Horns - unlocks command units
- Flight - unlocks aerial
- Satelites - unlocks astral, also increases vision to first row of space tiles

## Terrain, settlement and vision

- Yakhchals - Enables OUTPOSTS in deserts
  vs Sewing - Enables outposts in tundra
- Foraging - Increases food yield of forests
  vs Agriculture - Increases food yield of plains
- Mining - increases production yield of hills and mountains
  vs Timbering - increase production yield of forests by 1
- Fire - enables the establishment of cities
- Scouting - increase vision range of old world
- Surveying - increase vision further of old world
- Silk Road - complete vision over old world
- Celestial navigation - increase vision to the islands
- Compass - increase vision to the coast of the new world
- Cartography - increases vision to the full new world
- Space Race - increases vision to moon tiles
- Advanced Propulsion - increases vision to mars
- Off planet habitats - enables establishment of outposts on Moon/Mars/Exo
- Reusable Rockets - increases vision to full solar system
- Sustainable biospheres - enables cities on moon/mars
- Lightspeed Acceleration - increases vision to exoplanet
- Cryogenics - enables cities on exoplanet
- Asteroiding - enables establishment of outposts on asteroids
- Dark Matter - enables establishment of outposts on singularities
- Dyson Sphere - enables establishment of outposts on stars
- Terraforming - increases output of Martian and planet tiles
- Foldspace - enables establishment of outposts on planets
- Ecumenopolis - enables establishment of cities on planets

## Doctrine, religion and government

- Professional Army - after every combat, all units gain a permanent +1 atk and +1 def
  vs Mercenary Army - reduces mercenary recruitment cost and gives them +1 upgrade levels
- Burial Rites - whenever one of your units dies, gain progress equal to that units atk
  vs Slavery - every 2 enemy units you defeat, permanently gain +1 gold per tick
- Writing - Unlocks a library (+1 progress per tick, increases by +1 after every combat, reset if razed)
  vs Drama - Unlocks a theater (+5 progress per tick)
- Festivals - end of combat effects happen an additional time
  vs Holidays - builds a temple. Temples increase all base outputs by 1 after every combat.
- Monotheism - build a temple. Your temples produce 1 progress. Temple yields are multiplied by the number of temples you have.
  vs Polytheism - build a temple. Your temples produce 1 progress for each adjacent outpost or citizen
- Organized Religion - build a temple. Your temples produce 1 gold.
  vs Daoism - build a temple. Your temples produce 1 production
- Masonry - gives a fortification. All fortifications gain +5 def.
- Castles - gives a fortification. All fortifications gain +10 def
- Star Forts - gives a fortification. All fortifications gain +20 def.
  vs Imperial Guard - increases damage of the palace by 40
- Arches - unlocks aqueduct. Must be placed between a mountain and a city. The chosen city's citizens also produce food
  vs Glassblowing - unlocks glassworks. All buildings in range 1, gain +5 production output.
- Revolution - create a melee unit, a ranged unit, and a cavalry unit in the new world. Units in the new world produce +3 progress
  vs Colonialism - create a hacienda in the new world. Hacienda gives all tiles in the new world +4 gold.
- Crusade - build a temple. Create a melee unit.
  vs Religious Tolerance - build a temple. Temples produce 1 food.
- Manifest Destiny - when building an outpost, claim a second ring of territory
  vs Transcendentalism - increase progress of all rural tiles by +1
- Reformation - gain a temple. Temples produce double progress
  vs Schism - gain a temple. Receive a ranged unit.
- Atheism - temples outputs replaced with production. Double that output.
  vs Evangelism - at the end of every other combat, receive a temple.
- Absolute Monarchy - building output is increased by 100% reduced by 10% for each tile away from the palace.
  vs Federalism - building output is increased by 30% reduced by 10% for each tile away from the nearest city
- Caste System - Increase the effect of upgrades by 10%
  vs Military science - at the end of each combat, upgrade a random unit or building

## Arms and warfare

- Bronze Working - increases all unit atk by 3. Create a melee unit
- Iron Working - increases all unit atk by 6. Create a melee unit.
- Steel - increases all unit atk by 12. Create a melee unit.
  vs Armor - increases all unit def by 12. Create a melee unit
- Square Rigging - increases atk of all naval units by 12. Create a naval unit
  vs Deep Water navigation - increases speed of naval units by 1. Create a naval unit
- Wheel - create roads between cities on the shortest route (mountains count as 3 to go through). All tiles on or adjacent to a road get +1 gold.
- Railroad - upgrade roads to railroads -> +3 gold instead.
- Maglev - upgrade railroads to maglev -> +8 gold instead.
- Capitalism - increase all gold outputs by 25%
  vs Protectionism - reduce building upgrade costs by 40%.
- Archery - create a ranged unit. Increase range unit atk by 5.
- Longbow - increase ranged unit range by 1. Create a ranged unit.
  vs Crossbow - increase ranged unit atk by 25%. Create a ranged unit
- Deck canons - increases range of naval units by 1. Receive a naval unit
  vs Canon artillery - increases atk of all siege units by 20. Create a siege unit.
- Stirrups - create a cavalry unit. Cavalry gets +1 speed.
  vs Counterweights - create a siege unit. Siege units get +1 blast radius (20% damage falloff per tile)
- Clinker construction - enables naval units to enter ocean. Receive a naval unit
- Levee en Masse - grants 3 melee units and 2 cavalry units
  vs Foreign Legion - gives +2 upgrade levels to mercenaries
- Jeffersonian Ideal - increases base progress output of all tiles by 1
  vs Hamiltonian Ideal - doubles progress output of all cities
- Refrigeration - increase food output of water tiles by 1. Receive a naval unit.
  vs Combustion - increase the atk of all units by 15. Receive a naval unit
- Artificial Island - create an island tile on an ocean tile and place an outpost on it. Double yields from island tiles
  vs Admirality - create a naval unit and a command unit. Command units may be placed in water
- Aircraft carriers - receive an aerial unit. Aerial units may be placed on water tiles and get all bonuses to naval units.
  vs Submarines - receive a naval unit. Naval units cannot be destroyed by enemies.
- Trial by jury - unlocks courthouse building. Courthouse increases the output of all tiles in range 1 by 10%.
  vs Military tribunals - whenever a unit dies, it permanently gains 5 def.
- Pacifism - reduce all unit atk by 50%, but reduce all food thresholds by 30%
  vs Total War - increases all unit atk by 50%, but increase all progress thresholds by 20%

## Culture and ideology

- Rock and Roll - all citizens gain +3 gold yield
  vs Jazz - all citizens gain +1 progress yield
  vs Country - outpost tiles get +1 to base yield for each surrounding rural tile
  vs Funk - all citizens gain +1 food yield
  vs Techno - all citizens gain +1 production yield
  vs Folk - rural tiles get +1 to base yields
- Democracy - increases all progress and gold outputs by 15%
  vs Communism - increases all production and food outputs by 15%
  vs Facism - increases all unit atk and def by 15%
- Composite Bows - create a ranged unit. Ranged units get +5 atk
- Milling - gain a windmill building. Doubles output of all adjacent rural tiles.
- Vac living - allows for creating of outposts in space. These outposts produce 10% of the yields of adjacent tiles.
- Education - gain a university building. +2 progress for each adjacent citizen
- Solar sails - gain an astral unit. Astral units get +1 speed.
- Propaganda - whenever a unit dies, increase palace permanently gains +1 gold, +1 production
- Empire - increase palace yields by 50%
  vs Senate - buildings get +1 upgrade level for each adjacent outpost.
- Consciousness Upload - massively increases growth rate of cities. Reduce production yields of all tiles by 1
  vs Biological Ascendancy - increases atk and def of military units by 25% each. Increase all future food thresholds by 10%
  vs Human purity - increases all tile base yields on earth by +1. Reduce all non-earth base yields by 50%
- Urbanization - increases growth rate of cities
- Sanitation - increases growth rate of cities
- Subways - increases growth rate of cities
- Radio - increase the range of all ranged effects by 1
  vs Radar - create a ranged unit. Ranged units deal +50% damage against astral and aerial units
- Planetogenesis - create a planet tile and then immediately put an outpost on it.
  vs Artificial Singularity - create a singularity tile and then immediately put an outpost on it. Enemies that move adjacent to a singularity take 5% def damage
- Tachyons - create a ranged unit. Ranged units have infinite range. Enemies within ordinary range take double damage instead
  vs Warp Drive - create an astral unit. Astral units have infinite speed.
- Banking - create a bank. At the end of combat get 7% interest on any saved gold.
  vs Opera - create an opera house. Increase progress yields of all tiles in range 1 by 50%
- Terracing - increases food yield of mountains and hills by 2
  vs Mountaineering - allows outposts on mountains
- Fermentation - creates a plantation. Produces +1 food. Every 20 ticks increase food production by 1.
- High Fidelity Combat Sims - every 20 ticks, give all units +1 atk
- Dragoons - gain a cavalry unit. Cavalry get +1 range and +15 atk
  vs Rifling - gain an infantry unit. Melee units get +1 range
- Drone Warfare - gain a cavalry unit. Cavalry units get +2 speed, can move on water, and +25 atk, but lose 15 def.
  vs Megaton Explosives - gain a siege unit. Increase the radius of siege unit damage. Siege units get +40 atk.
- Guilds - create the guildhall building. Produces +3 gold for each unique building that's in your empire.
- Diplomatic Corps - reduce the cost of hiring mercenaries by 25%
- Pilgrimage - create a temple. At the end of combat, each temple produces progress equal to the distance to the next closest temple.
- Renewable energy - gain a hydroelectric dam (coast not adjacent to ocean only, +1 upgrade level to units and buildings in range 1), solar panel farm (desert only, same effect), and a geothermal plant (tundra only, same effect)
  vs Fracking - reduce the base yields on all rural tiles by 1, but increase all yields by 10%.
- Clocks - increase the length of each era by 5.
  vs Flying Butress - receive a fortification. All fortifications produce progress at the end of each era equal to their defense.
- Microprocessors - increase the length of each era by 5
  vs Semaglutides - decrease all future food thresholds by 20%
- Calendar - increase the length of each era by 5 ticks
  vs Diplomatic Marriage - the first mercenary you hire every combat is free
- Bayonets - gain a melee unit. Melee units apply bleed to enemies with bleed, dealing 1% def damage per turn.
  vs Triage - gain a command unit. Units in the command radius of commanders recover 5% def every turn
- Currency - allows creation of the market (+1 gold from all citizens in range 3)
  vs Caravansaries - outposts generate +2 gold
- Crop Rotation - increase the food output of plains by 2.
  vs Algebra - Reduce the cost of future progress thresholds by 5%
- Mathematics - Reduce the cost of future progress thresholds by 3%
  vs Entertainment - produce an arena building. At the end of each combat, gains +50 gold and you gain +250 gold.
- Metallurgy - create the armory building and gain a melee unit. Units in range 1 get +5 def after each combat
  vs Horseshoes - create a cavalry unit. Cavalry units get +9 atk and +9 def
- Rudder - create a naval unit. Naval units get +10 atk and +5 def.
  vs Naval Trade - creates the harbor building. Gives +1 to base gold yield to all connected water tiles.
- Piracy - gain a naval unit. Naval units produce gold equal to half their attack every time they attack
  vs Native Diplomacy - Mercenary units cost 50% less in the new world and get +1 upgrade level
- Coast guard - Gain a naval unit. Buildings get +1 upgrade level for every adjacent naval unit
- Mysticism - rerolls cost 25% less
- Cloud computing - Create a data center building (grant +100% gold output to land tiles in range 3)
  vs Fusion Power - Create a fusion plant. Increases the upgrade level of all buildings and units in range 1 by 3.
- Deep space Industry - Create a Zero Grav Fab - +10 production for every pure empty space tile in range 2.
  vs Gravity Boots - Can create a zero grav lab - +10 progress for every pure empty space tile in range 2
- Marshall Plan - building repair and upgrade costs reduced by 30%
  vs Rearmament - unit repair and upgrade costs reduced by 30%
- Feudalism - increases multiplier on outposts by 1 (so if it was doubling base yield, now it triples)
  vs Civil Service - increase total city output by 5%. Receive a command unit.
- Astronomy - unlocks Observatory building (mountain only). Produces +1 progress. Gain another +1 whenever you reroll
  vs Optics - create a naval unit. Increase naval unit speed by 1
- Liminite Reflection - all units gain +40 def. Whenever an attacker damages a unit, deal damage equal to that unit's attack to the attacker. Gain a melee unit
  vs Liminite Weaponry - all units gain +30 atk. Gain a ranged unit
- Scientific Method - create a laboratory building. Increases the progress output of all tiles in range 3 by 50%
  vs Chemistry - create a siege unit. Siege units get +1 range.
- Gunpowder - receive a melee unit. All units get +15 atk
  vs Fireworks - at the end of each era, get +10 gold for every citizen in your empire
- Cloning - whenever you gain a citizen in a city, receive another citizen.
  vs Clone Armies - at the end of every combat, receive a melee unit.
- Pottery - receive a granary (doubles base food yield of all plains tiles in range 1)
  vs Leatherwork - increases def of all units by 8
- Dressage - receive 2 cavalry units. Cavalry units get +1 atk for every tile they've moved in combat.
  vs Legionnaires - receive 2 melee units. Melee units get +1 atk and +1 def for each melee unit you have.
- Shipbuilding - receive a naval unit and a wharf. Wharf produces 18 food per tick.
  vs Colombian Exchange - all buildings that aren't in the old world also produce +5 gold. Build a colonial office in the new world (produces +1 gold per tick for every controlled new world outpost)
- Guerilla warfare - gain a melee unit. Melee units get +30 atk when stationed on a rural tile.
  vs Urban Warfare - gain a melee unit. Melee units get +5 def for each adjacent outpost and +1 def for each adjacent citizen.
- Blitzkrieg - gain a cavalry unit. The first attack made by cavalry units on a target deals +100% damage.
- Von Neumann Craft - gain an astral unit. At the end of combat gain an astral unit.
- Terminators - gain a melee unit. Melee units execute enemies below 10% health
- Space Marines - gain a melee unit. Melee units get +30 atk and +30 def when stationed outside of earth
- Kamikaze - gain an aerial unit. When aerial units die, they explode and deal damage equal to atk in aoe 1. Aerial units gain +20 atk but die immediately after their first attack.
  vs Air support - gain an aerial unit. Aerial units get +1 range and +15 atk.
- Hydroponics - all non earth non space tiles produce +2 food
  vs GMOs - create a megafarm building. Produces food equal to all food produced in range
- Automation - create a skunkworks building. +1 production but gains +2 whenever you reroll the progress options
- Predictive Markets - create a casino building. +1 gold but gains +3 gold whenever you reroll the progress options
- Bombardment - gain a naval unit. Naval units get +1 range
- Suspensors - gain a melee unit and a cavalry unit. Melee and cavalry units can traverse mountains.
- Skiing - mountains gain +5 gold yield.
- Watchtowers - gain a ranged unit. Ranged units may be stationed in mountains
- Railguns - receive a ranged unit. Ranged units get +30 atk
  vs 3d printing - create a 3d printer building. Immediately create an outpost on all adjacent rural tiles (claiming them if necessary). Increases the yield outposts in range 3 by 50%
- Monumentality - buildings get +2 upgrade level for each adjacent wonder. Create a monument building. Monument grants +15 progress per tick.
- Chronomancy - Receive a command unit. Command units grant all units in the command circle an extra attack every third attack
  vs Time Travel - Double the length of each era.
- Aerodynamics - Aerial units get +2 speed. Receive an aerial unit.
  vs Stealth - Aerial units have a 25% chance to avoid incoming attacks. Receive an aerial unit.
- Helicopters - increase atk of aerial units by 25. Receive an aerial unit.
  vs Ballistics - increase atk of all ranged units by 25. Receive a ranged unit.
- Supersonics - create an aerial unit. Aerial units get +2 speed
- Tightbeams - create two interplanetary beacon buildings, one on earth/moon/mars and one on the exoplanet. All buildings adjacent to the beacons are adjacent to each other.
- Orbital Bombardment - increase range of astral units over planet tiles by 2. Receive an astral unit
  vs Bimodal StarCraft - aerial units may move into space tiles. Receive an aerial unit
- Rapid reconstruction - buildings are not razed by enemies
  vs Magnetic Deflectors - receive a fortification. Fortifications get +40 def
- Census - at the end of combat, gain +1 progress for every citizen in your civilization
- Helium-3 - create the helium-3 mine building. Must be placed on the moon or mars. +70 production per tick.
- Shield Arrays - receive a fortification. Fortifications may be placed ANYWHERE and may be repositioned for free
  vs Radiation Occlusion - astral units get +50 def. Receive an astral unit
- Artificial General Intelligence - gain +10% to all outputs but increase enemy def budget by 25%
  vs Butlerian Jihad - lose 10% to all outputs, but decrease enemy def budget by 25%
- Praetorian Guard - receive a melee unit. The palace gains +20 def and +10 atk.
- Galactic Armada - receive 4 astral units. Astral units get +10% atk for each adjacent astral unit.
  vs Superhumanity - receive +1 production from all citizens in cities. Receive a melee unit. Melee units get +20 atk, +20 def, +1 speed, and the ability to move into space
- Tanks - receive a cavalry unit. Cavalry get +40 def.
  vs Mortars - receive a ranged unit. Ranged units now deal aoe damage.
- Immigration - whenever a city in the old world grows, a city outside of the old world also grows.
  vs Isolationism - gain +15% output from cities in the old world
- Chivalry - receive a cavalry unit. Cavalry units will retreat to a safe tile after attacking if they have enough speed and a safe tile.
  vs Pikes - receive a melee unit. Melee units deal double damage to enemy cavalry
- Theology - receive 2 temples.
  vs Tactics - receive a command unit. Increase the radius of all command units by 1.
- Molecular Duplication - create the replicator building. Every 10 turns in combat, create a temporary copy of the unit stationed on it.
- Naturalism - increase base yields of rural tiles by 1.
  vs Industrialization - create a factory building. +20 production per tick. Whenever you create a new city, also build a factory in an adjacent tile.
- Potatoes - Plains in the new world gain +5 food
  vs Coffee - Forests in the new world gain +5 progress
- Bushido - receive a melee unit. Melee units gain +10 def. While below 50% def, units gain +50% atk.
- Church of the Simulation - receive 2 temples on the exoplanet.
  vs Frontier cuisine - increase base food output of all exotiles by 10.
- Architecture - all buildings in your civilization produce +1 progress
  vs Statistics - all buildings in your civilization produce +2 gold
- Beltalowda - receive an astral unit. Astral units stationed next to asteroids receive +20 atk and +20 def for each adjacent asteroid. Outposts on asteroids next to astral units increase base production by +10 for each astral unit.
- Kwasisatch Haderach - if you lose combat, you may go back to before the combat started and try another configuration
- Machinery - unlocks workshop building. +16 production.
- Hereditary Rule - palace gains +8 atk and +30 def
  vs Oligarchy - palace gains +4 gold production
- Kyber Crystals - receive a melee unit. Melee units get +20 atk. Every fifth time a melee unit attacks, it pushes back the target enemy 1 tile (if it then collides with something, double the damage of the base atk and deal atk damage to the thing it collided with)
  vs Plasma Beams - receive a ranged unit. Ranged units get +10 atk. Ranged units damage all enemies between themselves and the target. They choose the target that lets them hit the most enemies with total remaining def as the tiebreaker.
- Isolationism - the palace receives +30 progress, gold, and production.
  vs Tourism - place the tourism office building. Produces +25 gold for every adjacent wonder.
- Calculus - gain a siege unit. Lower all future progress thresholds by 8%
  vs Economics - immediately upgrade all of your gold buildings. All gold yields increased by 10%
- Martian Independence - receive a ranged unit on mars. All Martian tiles receive +50% total yields
  vs Earth Dominance - your palace produces +1 gold and gets +1 attack for every non earth tile you control
- Cosmic Celebration - +1 triggers for end of combat effects
- Scorched earth - whenever an enemy razes a tile they take 5% damage
- Hovercraft - gain a cavalry unit. After attacking, cavalry units will move then attack again.
- Gundams - receive a naval unit. Naval units gain +50 atk and def. Naval units can move onto land.
  vs Astral Command - receive an astral unit and a command unit. Command units may be placed in space.
- Ion Torpedoes - receive an astral unit. Astral units get +100 atk and +1 range
  vs Ion Shields - receive 2 astral units. Astral units get +100 def
- Spice Harvesting - desert tiles get +50 production
  vs Cold Quantum - tundra tiles get +50 progress
- Lasseiz Faire - create the stock exchange building. Produces +1 gold for every citizen in your empire
  vs Germ Theory - creates the hospital building. Citizens in cities in range 5 produce +1 food
- Creole Culture - increase the upgrade level of all units and buildings in the new world by 2. Immediately create a new world outpost
  vs Avant-Garde - your palace produces +50 progress
- Natural History - create the museum building. Gives +5 progress and +5 gold for every building in range 3 that was built before the museum
- Suburbanization - cities with an adjacent rural tile automatically form another city on that tile once their population reaches 15 (1 such city per city)
- Neocolonialism - increase all exo planet yields by 25%
- Flaming projectiles - gain a siege unit. siege units burn enemies. They take 2% max health damage per turn for the rest of combat
- Espionage - create the decoy building. Enemies in range 5 will path to the decoy instead of the palace. Once they reach the decoy they will reroute to the palace.
- Timeline erasure - remove up to 5 tiles from the game altogether (theyre just… gone!) can't be walked on produce nothing etc
- Cryo bombing - create a siege unit. Siege units have 1 turn longer cooldown but damage to enemies stuns them for 1 turn.
- Biological Immortality - doubles food output globally. Melee and Ranged units get +25 def
  vs Cortical Stacks - food output is converted entirely to gold. At the end of each combat you get 3 expansion events. Whenever a unit dies in combat, it is respawned after 10 turns on a random valid tile you control
- Moats - enemies take damage equal to def when attacking fortifications. Gain a fortification
- Caltrops - enemies take damage equal to def when attacking melee units. Gain a melee unit
- Turtle formation - gain a commander. Units in the command radius get +50% def.
- Hospitality - every 10 ticks, give all adjacent units +1 def
- Orbital Assembly - create the spaceport building adjacent to a planetary tile. Every 10 turns in combat create an astral unit adjacent to the spaceport. Spaceport gives +1 gold to all astral units.
  vs Asteroid capture - immediately place 3 asteroids and put outposts on each of them
- Quantum Logistics - increase the multiplier on outposts by 2 (if they doubled natural production now it's quadrupled)
  vs Quantum Construction - whenever you place a building, place an additional copy of that building.
- Nationalism - gain a cavalry unit. all units get +60 atk minus 6 for every tile away from the palace they are (it goes negative!)
- Haka - receive a melee unit. Melee units get +10 def and taunt enemies
- Recursive self improvement - whenever you upgrade a unit or building, it is upgraded a second time
  vs Adaptive troops - receive an astral unit, a melee unit, and a naval unit. All units gain +1 attack every turn during combat
- Commercial air travel - create an airport building and an aerial unit. The airport produces +5 gold and production for every aerial unit in range 3.
- Replaceable Parts - create a hangar building and an aerial unit. Whenever an aerial unit dies within range 10 of the hangar, after 10 turns, respawn that aircraft adjacent to the hangar if possible
- Multiversal Accord - whenever you hire a mercenary, receive an additional mercenary on an adjacent tile if possible

## Concepts (verbatim)

Many progresses are a "this or that" style decision. So e.g. if you get the option for desert
outposts, tundra may be disallowed.

Units are in general classes: melee (slow, but strong), fortification (no attack, taunts
enemies), command (no attack, buffs nearby units), cavalry (fast, not as strong), ranged
(ranged, least def/damage), naval (water access, may be ranged or melee depending on
selection), aerial (planet bound until unlock gives space access, very fast, melee), astral
(space only, ranged, various speed), siege (ranged, heavy hitter but slow attacks. Splash
damage)

Progress will grant new units which are placed on the map and may be repositioned with gold.
Some progresses will also buff certain unit classes (eg bronze alloying gives ALL units +atk,
armor gives all units +def)

Temples - usually you get a temple building from religion progresses which keep adding bonuses
to your temples

Palace has base yields of 5 production and 5 progress.

Rural tiles are tiles controlled but without an outpost or city

Every time production threshold is met, you get a new wonder and then go up a tier. Once the
final wonder is built, all production is converted to gold.

## Wonders

### Tier I
- Stonehenge - gain +1 progress choice options
- Pyramids - desert tiles produce +1 production and +1 food
- Hanging Gardens - adjacent city gets massively increased growth rate
- Great Lighthouse (offered only if controlled coast tile) - receive a naval unit. Naval units get +1 speed and produce +1 gold
- Library of Alexandria - gain +5 progress per tick. Increase by +5 after combat if this survives combat (reset if razed)

### Tier II
- Parthenon - counts as a temple. Increase temple output by 30% (requires monotheism/polytheism)
- Terracotta Army - receive a melee unit, a cavalry unit, a ranged unit, and a command unit. Command units gain 25% effect
- Colossus of Rhodes (offered only if controlled coastal tile adjacent to ocean) - receive 2 naval units. Reduce upgrade costs on naval units by 50%
- Colosseum. End of combat effects happen an additional time.
- Mausoleum of Halicarnasus. Whenever any one of your units die, increase the progress on this wonder by 1.

### Tier III
- Forbidden Palace. Produces the same outputs as your palace and participates in combat with same status as palace.
- Hagia Sophia. Counts as a temple. On completion produce 2 temples (requires mono/polytheism)
- Great Wall. On completion, create 2 fortification units on adjacent tiles if possible. Fortifications have +15 def.
- Duomo. All buildings get +1 upgrade level.
- Venetian Arsenal. Naval units have +100% attack. Create a naval unit on completion

### Tier IV
- Statue of Liberty. Significantly increases city growth rate
- Taj Mahal. Whenever a unit dies, it permanently gains +10 atk and +10 def
- Eiffel Tower. Whenever you complete a wonder, including this one, receive a free progress.
- Manhattan Project. Receive a siege unit. Siege units get +3 range, +1 blast radius, and +30 atk. However when a siege unit attacks, targeted tiles are razed.
- Big Ben. Increase all gold outputs by 50%.

### Tier V
- Sagrada Família. Counts as a temple but produces 400% output.
- Burj Khalifa. Citizens in cities each produce an additional progress, production, and gold.
- Sydney Opera House (on coast only). Increase progress yields of all tiles by 25%.
- International Space Station. can be built only in space). Produces +500 progress
- United Nations. Mercenaries you hire get +5 upgrade levels

### Tier VI
- Space Elevator. On completion gain 2 astral units. All astral units create +5 production
- Skynet. On completion gain a melee unit. Melee units deal double damage. All thresholds increased by 10
- Great Desalinator (coastal only). Increases food yields of all coastal tiles by 3.
- Lunar Defense Station. All units on the moon get +150% attack and +1 range

### Tier VII
- Happy Valley. (Requires mars capability, mars only). Increase yields of all mars tiles by 100%
- Generation ship. (Space placement only) Your first outpost on the exoplanet is immediately converted into a city with population 15.
- Elysium. Counts as a city. Whenever a friendly unit dies, add it to the city's population.
- Ceres Station (space only). Double output from asteroids, stars, and singularities
- Planetary shield. Whenever an enemy enters earth, they take 10% def damage

### Tier VIII
- Panopticon - you may pay gold to reposition enemy units (just as you do player units)
- The Ansible - gain a command unit. All ranged effects get +1 range
- Stargate - buildings may be repositioned freely
- Museum of Humanity - all buildings get +1 progress for every combat they have existed for
- Golden Lion Throne - your palace produces +500 of all outputs

### Tier IX
- Death Star - every 5 turns, instantly kill a random enemy unit (space only) or deal 10,000 damage to Azazoth
- Galactic Senate - (space only) before combat, gain a mercenary for free adjacent to the galactic senate and all planets you control
- White Hole Station - (singularity only) all units may be placed on singularities. At the start of combat they get double range atk def and speed but their position is randomized to an empty valid tile on the map
- Dimensional Rift - you deal +50% damage to Azazoth while the rift is not destroyed
- Monument of Ozymandius - your palace has 1 def. You control all tiles in the galaxy.
