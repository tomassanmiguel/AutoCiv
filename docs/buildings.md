# Buildings

Schema per `SCALING.md` §10. `def` = HP (low). Per-tick output = `round(3.5·1.18^E·lateBoost(E))`
(**gold uses base 5.25**); `lateBoost(E)=1+0.1·max(0,E−10)`. End-of-era lump ≈ `50×` a per-tick value.
All footprints **1×1** unless noted. Values are concrete. `↑` = upgrade target. Each row lists the
**tech** that unlocks it (from `PROGRESSION.md`). Numbers **`[proposed]`**.

---

## MILITARY INFRASTRUCTURE

### Traps

| Building | Tech | Era | def | Effect | ↑ | Placement |
|---|---|--|--|---|--|--|
| Caltrops | Leatherwork | 1 | — | Enemies walk right over it (no block/HP); every enemy that crosses takes **20 damage** (flat). | dmg (+25%) | land |
| Decoy | Vassalage | 5 | 3 | Enemies within **range 2** path to it and attack it first until destroyed; deals no damage. | def (+1/lvl) | land |
| Powder Magazine | Gunpowder | 6 | 1 | On destruction, explodes for **45 damage** to all enemies within range 2. | dmg (+25%) | land |
| Sea Mine | Sea Mine | 8 | 1 | First enemy to enter takes **89 damage**, then consumed. | dmg (+25%) | coast/water |
| Discombobulator | Discombobulator | 14 | 2 | On fire, enemies within range 1 **skip their next turn**; 5-turn cooldown. | rng (+1/lvl) | land |
| Singularity | Black Hole Warfare | 25 | — | **Impassable** (enemies route around; invalid if it blocks *all* paths). **1000 damage to Azazoth** if forced through. | — | space |

### Command — buff allied units in range (upgrade widens the aura +1/lvl)

| Building | Tech | Era | def | Aura (range) | ↑ | Placement |
|---|---|--|--|---|--|--|
| Command Post | Strategy | 5 | 2 | units in range **+50% atk** (1) | rng | land |
| Star Fort | Star Forts | 7 | 2 | :ranged: units **+1 range** (1) | rng | land |
| Armory | Metric System | 10 | 2 | end of era: **upgrade one adjacent unit +1 level** (free) | rng | land |
| Radio Tower | Radio | 10 | 2 | all ranged-role units **+2 range** (2) | rng | land |
| Deflector Array | Deflectors | 17 | 2 | units in range **+2 def** (1) | rng | land |
| Psy-Link | Synaptic Rewiring | 22 | 1 | units in range **+100% atk** (1) | rng | land |
| Chronobooster | Bootstrapping | 26 | 1 | units in range **act twice per turn** (1) | rng | any |

> Damage auras stack **additively** (Command Post + Psy-Link = +150% atk).

### Spawners — every 8 combat-turns, create your best unit of a type on an adjacent tile (upgrade → spawn's level)

| Building | Tech | Era | def | Spawns | ↑ | Placement |
|---|---|--|--|---|--|--|
| Drydock | Pumping | 7 | 2 | best **Naval** | out | coast |
| Stables | Horseshoes | 5 | 2 | best **Cavalry** | out | land |
| Aircraft Carrier | Aircraft Carriers | 11 | 3 | best **Aerial** | out | coast/water |
| Spaceport | Spaceports | 20 | 3 | best **Astral** | out | space (incl. Moon/Mars) |

### Walls — blockers; **upgrade = +1 def/level (+2 for Shield Matrix)**

| Building | Tech | Era | def | ↑ | Placement |
|---|---|--|--|--|--|
| Mud Brick Wall | Mud Brick | 0 | 3 | def +1/lvl | land |
| Stone Wall | Fortification | 2 | 4 | def +1/lvl | land |
| Castle | Castles | 4 | 6 | def +1/lvl | land |
| Shield Matrix | Shielding | 23 | 9 | def **+2**/lvl | any (land/water/space) |

> Sized against the **1 dmg/turn** default chip — a base wall only holds a few turns; you buy def
> levels and stack Power auras / Armory to make a lane truly hold. **Great Wall** (wonder, E3) is a
> 4-lane shared-HP blocker, def 20 — see wonders.

### Military utility / underlay

| Building | Tech | Era | def | Effect | ↑ | Placement |
|---|---|--|--|---|--|--|
| Campfire | Fire | 0 | 1 | **military utility**: after each era, permanently **+1 atk** to adjacent units (stacks per era survived). | — | land |
| Moon Base | Lunar Installment | 14 | 3 | **Military, unique, moon-only**: enemies path around the Moon (the Moon becomes impassable to enemy movement). | def (+1/lvl) | Moon only |
| Machine Gun | Machine Guns | 9 | 2 | **Military underlay** (under the tile's unit): the unit posted on this tile attacks **1/2/3/… extra times** per turn (per upgrade level). | lvl (+1 extra attack) | land |

---

## CIVILIAN INFRASTRUCTURE

Per-tick lines follow `round(3.5·1.18^E·lateBoost)`; gold uses base 5.25 (~50% more). The steeper 1.18
curve + `lateBoost` makes late tiers genuinely worth building.

### Progress

| Building | Tech | Era | def | Output / Effect | ↑ | Placement |
|---|---|--|--|---|--|--|
| Library | Paper | 2 | 2 | 5 progress/t | out | land |
| School | Public Education | 8 | 2 | 13 progress/t | out | land |
| Laboratory | Plastics | 12 | 2 | 31 progress/t | out | land |
| Space Telescope | Exoptics | 16 | 2 | 79 progress/t | out | space |
| Cogitorium | Distributed Being | 21 | 3 | 238 progress/t | out | land |
| Black Hole Station | Singularity Stations | 24 | 3 | 446 progress/t | out | singularity |
| Cave Painting | Cave Painting | 0 | 1 | banks stored progress (**doubles each era**, cap 50000); dumps it all when overbuilt | — | land |
| Theater | Acoustics | 6 | 2 | end-of-era **450 progress**, **+25 more each era** it survives | out | land |
| Observatory | Astronomy | 6 | 2 | end-of-era progress = **10 × the tile's economy-bonus value** | out | mountain |
| Museum | Archaeology | 10 | 2 | progress/t = **16 × (unique unit+building types in its row + column)** | out | land |

### Production

| Building | Tech | Era | def | Output / Effect | ↑ | Placement |
|---|---|--|--|---|--|--|
| Kiln | Pottery | 0 | 1 | 4 production/t (basic starter production building) | out | land |
| Workshop | Machinery | 4 | 2 | 7 production/t | out | land |
| Forge | Metallurgy | 4 | 2 | 7 production/t | out | land |
| Factory | Mass Production | 9 | 2 | 16 production/t | out | land |
| 3D Printer | 3d printing | 14 | 2 | 50 production/t | out | land |
| Vacuum Assembly | Deep Space Construction | 19 | 3 | 154 production/t | out | space |
| Dyson Sphere | Kardashev Advancement | 24 | 4 | 446 production/t | out | star |
| Glassworks | Stained Glass | 5 | 2 | 8 production/t, **+2 each era** (resets to 8 if destroyed) | out | land |
| Harbor | Shipbuilding | 7 | 2 | production/t = **6 × (units in range)** | rng | coast |
| Solar Array | Energy Capture | 16 | 2 | 79 production/t, **+50% of base per other Solar Array** | out | any (incl. space) |
| Lumber Mill | Milling | 1 | 2 | production/t = **4 × the forest tile's economy-bonus value** | out | forest |

### Food

| Building | Tech | Era | def | Output / Effect | ↑ | Placement |
|---|---|--|--|---|--|--|
| Farm | The Plough | 1 | 2 | 4 food/t | out | plains/land |
| Aqueduct | Arches | 3 | 2 | 6 food/t | out | earth |
| Hospital | Penicillin | 11 | 3 | 24 food/t | out | land |
| Hydroponicist | Hydroponics | 16 | 3 | 79 food/t | out | land |
| Xenocultivator | Alien Ecology | 19 | 3 | 154 food/t | out | exoplanet |
| Cloning Bay | Gene Splicing | 24 | 3 | 446 food/t | out | land |
| Ranch | Domestication | 1 | 2 | 4 food/t, **+2 each era** (resets to 4 if destroyed) | out | land |
| Pier | Fishing | 0 | 2 | end-of-era **200 food** (scales with era) | out | coast |
| **Hacienda** | Creole Culture | 7 | 2 | **6 food + 6 production + 9 gold** /t (multi-output colonial estate) | out | **New World only** |

### Gold `[base 5.25 — ~50% richer than other output buildings]`

| Building | Tech | Era | def | Output / Effect | ↑ | Placement |
|---|---|--|--|---|--|--|
| Market | Trade Networks | 2 | 2 | 7 gold/t | out | land |
| Mint | Coinage | 4 | 2 | 10 gold/t | out | land |
| Stock Exchange | Joint Stock Company | 9 | 3 | 23 gold/t | out | land |
| Data Center | The Cloud | 13 | 3 | 59 gold/t | out | any |
| Asteroid Mine | Asteroid Mining | 16 | 3 | 119 gold/t | out | asteroid |
| Spice Extractor | Melange | 22 | 3 | 441 gold/t | out | exoplanet |
| Arena | Entertainment | 3 | 2 | end-of-era gold = **8 × (deployed units)** | out | land |
| Caravansary | Compass | 4 | 2 | gold/t = **10 + 5 × (other Caravansaries)** | out | land |
| Lighthouse | Celestial Navigation | 3 | 2 | 9 gold/t, **AND +1 range to naval units in range** | rng | coast |
| Bank | Banking | 7 | 3 | end-of-era gold = **5% of unspent gold** (multiple Banks add: 2 → 10%…) | out | land |
| Stadium | Sports | 10 | 3 | end of era: **+1000/1250/1500… gold and +10 legit** (per upgrade level) | out | land |
| Shinkansen | Maglev | 13 | 2 | **3×1 road underlay** (links adjacency network); **+3 gold/tick to each adjacent building** | — | 3×1 land |

### Legitimacy — completion bonus + leverage (uncapped, no per-tick legit)

| Building | Tech | Era | def | On completion | Ongoing | Placement |
|---|---|--|--|---|---|--|
| Shrine | Sacred Grounds | 0 | 2 | **+10 legit** | — | land |
| Temple | Organized Religion | 3 | 2 | **+20 legit** | end of era: gold = **3 × legit** | land |
| Monastery | Tithing | 5 | 3 | **+30 legit** | progress/t = **legit ÷ 20** (floored) | land |
| Cathedral | Flying Butress | 6 | 3 | **+40 legit** | end of era: **+5 legit** | land |
| Elysium | Virtual Afterlife | 20 | 3 | **+50 legit** | gold/t = **legit** | land |

### Support — structural, no resource output

| Building | Tech | Era | def | Effect | ↑ | Placement |
|---|---|--|--|---|--|--|
| Roads | Surveying | 3 | 1 | **underlaid**; links all touched tiles into one adjacency network | — | any |
| City | Urbanization | 6 | 2 | **underlaid**; tile holds up to 3 units+buildings (extras economic-only) | — | land |
| Windmill | Physics | 6 | 2 | units & buildings in range **+1 free upgrade level** | rng | land |
| Coal Plant | Electricity | 9 | 2 | in range **+2 free upgrade levels** | rng | land |
| Nuclear Power Plant | Nuclear Power | 12 | 3 | **Power**: units & buildings in range **+3 free upgrade levels** | rng | land |
| Fusion Plant | Fusion | 16 | 3 | **Power**: in range **+4 free upgrade levels** | rng | land |
| National Park | National Parks | 10 | 3 | each National Park: **+10/15/20…% to base terrain yields globally** | — | land |
| Carbon Sink | Industrial Carbon Capture | 15 | 3 | end of combat: **all terrestrial tiles +1 natural bonus** (permanent, stacking) | — | land |
| Artificial Island | Industrial Desalination | 16 | 3 | permanently **converts an ocean tile → island** (land) | — | coast/water |
| Asteroid Foundry | Asteroid Capture | 18 | 3 | **creates a new Asteroid** on a space (not deep-space) tile | — | space |
| Artificial Planet | Planetogenesis | 24 | 3 | permanently **converts a deep-space tile → land** | — | deep space |
| Tleilaxu Tanks | Vivification | 23 | 2 | end of era: **+225 population** (flat) | — | land |

---

## Notes / open items

1. **Legitimacy snowball** — still the concern (Elysium gold/t = legit, Monastery progress/t = legit/20,
   Temple end-era gold = 3× legit, + Zealot/Warrior Monk). Revisit once wonders/policies land.
2. **Proportional coefficients** (Observatory 10×, Lumber Mill 4×, Museum 16×, Harbor 6×) reference the
   terrain economy-bonus values pinned down in `terrain.md`.
3. **Power buildings** now three tiers — Windmill +1 (E6) → Coal +2 (E9) → **Nuclear +3 (E12)** →
   **Fusion +4 (E16)**. Free levels don't raise upgrade cost (SCALING §3).
4. **Late-era wall gap** — Shield Matrix (E23, def 9) is the last dedicated wall; a Utopian/Time-era
   wall or reliance on Singularity/Great Wall covers the very end. Still open to fill.
5. **Radio Tower & Star Fort** replace the old "Radar Station"/"Watchtower"/"Fort" placeholders —
   these are the actual command buildings in `PROGRESSION.md` (Fort/Watchtower were not in the tree
   and have been removed).
