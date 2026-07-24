# Buildings

Schema per `SCALING.md` §10. `def` = HP (low). Per-tick output = `round(3.5·1.18^E·lateBoost(E))`
(**gold uses base 5.25**); `lateBoost(E)=1+0.1·max(0,E−10)`. End-of-era lump ≈ `50×` a per-tick value.
All footprints **1×1**. Values are concrete. `↑` = upgrade target. Numbers **`[proposed]`**.

---

## MILITARY INFRASTRUCTURE

### Traps

| Building | Era | def | Effect | ↑ | Placement |
|---|--|--|---|--|--|
| Caltrops | 2 | — | Enemies walk right over it (no block/HP); every enemy that crosses takes **20 damage** (flat). | dmg (+25%) | land |
| Decoy | 5 | 3 | Enemies within **range 2** path to it and attack it first until destroyed; deals no damage. | def (+1/lvl) | land |
| Powder Magazine | 8 | 1 | On destruction, explodes for **45 damage** to all enemies within range 2. | dmg (+25%) | land |
| Sea Mine | 9 | 1 | First enemy to enter takes **89 damage**, then consumed. | dmg (+25%) | coast/water |
| Discombobulator | 14 | 2 | On fire, enemies within range 1 **skip their next turn**; 5-turn cooldown. | rng (+1/lvl) | land |
| Singularity | 25 | — | **Impassable** (enemies route around; invalid if it blocks *all* paths). **1000 damage to Azazoth** if forced through. | — | space |

### Command — buff allied units in range (upgrade widens the aura +1/lvl)

| Building | Era | def | Aura (range) | ↑ | Placement |
|---|--|--|---|--|--|
| Fort | 2 | 3 | units in range **+1 def** (1) | rng | land |
| Command Post | 5 | 2 | units in range **+50% atk** (1) | rng | land |
| Watchtower | 7 | 2 | :ranged: units **+1 range** (2) | rng | land |
| Armory | 10 | 2 | end of era: **upgrade one adjacent unit +1 level** (free) | rng | land |
| Radar Station | 13 | 2 | all ranged-role units **+2 range** (2) | rng | land |
| Deflector Array | 15 | 2 | units in range **+2 def** (1) | rng | land |
| Psy-Link | 18 | 1 | units in range **+100% atk** (1) | rng | land |
| Chronobooster | 25 | 1 | units in range **act twice per turn** (1) | rng | any |

> Damage auras stack **additively** (Command Post + Psy-Link = +150% atk).

### Spawners — every 8 combat-turns, create your best unit of a type on an adjacent tile (upgrade → spawn's level)

| Building | Era | def | Spawns | ↑ | Placement |
|---|--|--|---|--|--|
| Drydock | 4 | 2 | best **Naval** | out | coast |
| Stables | 5 | 2 | best **Cavalry** | out | land |
| Aircraft Carrier | 11 | 3 | best **Aerial** | out | coast/water |
| Spaceport | 20 | 3 | best **Astral** | out | space (incl. Moon/Mars) |

### Walls — blockers; **upgrade = +1 def/level (+2 for Shield Matrix)**

| Building | Era | def | ↑ | Placement |
|---|--|--|--|--|
| Mud Brick Wall | 0 | 3 | def +1/lvl | land |
| Stone Wall | 4 | 4 | def +1/lvl | land |
| Castle | 8 | 6 | def +1/lvl | land |
| Shield Matrix | 18 | 9 | def **+2**/lvl | any (land/water/space) |

> Sized against the **1 dmg/turn** default chip — a base wall only holds a few turns; you buy def
> levels and stack Power auras / Fort / Armory to make a lane truly hold. **Late gap** past Shield
> Matrix (E18) is still open — candidate for the sparse-late-era fill.

---

## CIVILIAN INFRASTRUCTURE

Per-tick lines follow `round(3.5·1.18^E·lateBoost)`; gold uses base 5.25 (~50% more). The steeper 1.18
curve + `lateBoost` makes late tiers genuinely worth building.

### Progress

| Building | Era | def | Output / Effect | ↑ | Placement |
|---|--|--|---|--|--|
| Library | 3 | 2 | 6 progress/t | out | land |
| School | 8 | 2 | 13 progress/t | out | land |
| Laboratory | 12 | 2 | 31 progress/t | out | land |
| Space Telescope | 16 | 2 | 79 progress/t | out | space |
| Cogitorium | 21 | 3 | 238 progress/t | out | land |
| Black Hole Station | 26 | 3 | 673 progress/t | out | singularity |
| Cave Painting | 0 | 1 | banks stored progress (**doubles each era**, cap 50000); dumps it all when overbuilt | — | land |
| Theater | 3 | 2 | end-of-era **300 progress**, **+25 more each era** it survives | out | land |
| Observatory | 6 | 2 | end-of-era progress = **10 × the tile's economy-bonus value** | out | mountain |
| Museum | 10 | 2 | progress/t = **16 × (unique unit+building types in its row + column)** | out | land |

### Production

| Building | Era | def | Output / Effect | ↑ | Placement |
|---|--|--|---|--|--|
| Workshop | 2 | 2 | 5 production/t | out | land |
| Forge | 5 | 2 | 8 production/t | out | land |
| Factory | 9 | 2 | 16 production/t | out | land |
| 3D Printer | 13 | 2 | 39 production/t | out | land |
| Vacuum Assembly | 18 | 3 | 124 production/t | out | space |
| Dyson Sphere | 25 | 4 | 548 production/t | out | star |
| Glassworks | 5 | 2 | 8 production/t, **+2 each era** (resets to 8 if destroyed) | out | land |
| Harbor | 7 | 2 | production/t = **6 × (units in range)** | rng | coast |
| Solar Array | 12 | 2 | 31 production/t, **+50% of base per other Solar Array** | out | any (incl. space) |
| Lumber Mill | 1 | 2 | production/t = **4 × the forest tile's economy-bonus value** | out | forest |

### Food

| Building | Era | def | Output / Effect | ↑ | Placement |
|---|--|--|---|--|--|
| Farm | 1 | 2 | 4 food/t | out | plains/land |
| Aqueduct | 3 | 2 | 6 food/t | out | earth |
| Hospital | 11 | 3 | 24 food/t | out | land |
| Hydroponicist | 15 | 3 | 63 food/t | out | land |
| Xenocultivator | 20 | 3 | 192 food/t | out | exoplanet |
| Cloning Bay | 24 | 3 | 446 food/t | out | land |
| Ranch | 1 | 2 | 4 food/t, **+2 each era** (resets to 4 if destroyed) | out | land |
| Pier | 0 | 2 | end-of-era **200 food** (scales with era) | out | coast |
| **Hacienda** | 7 | 2 | **6 food + 6 production + 9 gold** /t (multi-output colonial estate) | out | **New World only** |

### Gold `[base 5.25 — ~50% richer than other output buildings]`

| Building | Era | def | Output / Effect | ↑ | Placement |
|---|--|--|---|--|--|
| Market | 2 | 2 | 7 gold/t | out | land |
| Mint | 4 | 2 | 10 gold/t | out | land |
| Stock Exchange | 9 | 3 | 23 gold/t | out | land |
| Data Center | 14 | 3 | 75 gold/t | out | any |
| Asteroid Mine | 18 | 3 | 186 gold/t | out | asteroid |
| Spice Extractor | 22 | 3 | 441 gold/t | out | exoplanet |
| Arena | 3 | 2 | end-of-era gold = **8 × (deployed units)** | out | land |
| Caravansary | 4 | 2 | gold/t = **10 + 5 × (other Caravansaries)** | out | land |
| Lighthouse | 5 | 2 | 12 gold/t, **AND +1 range to naval units in range** | rng | coast |
| Bank | 9 | 3 | end-of-era gold = **5% of unspent gold** (multiple Banks add: 2 → 10%…) | out | land |

### Legitimacy — completion bonus + leverage (uncapped, no per-tick legit)

| Building | Era | def | On completion | Ongoing | Placement |
|---|--|--|---|---|--|
| Shrine | 1 | 2 | **+10 legit** | — | land |
| Temple | 3 | 2 | **+20 legit** | end of era: gold = **3 × legit** | land |
| Monastery | 5 | 3 | **+30 legit** | progress/t = **legit ÷ 20** (floored) | land |
| Cathedral | 7 | 3 | **+40 legit** | end of era: **+5 legit** | land |
| Elysium | 20 | 3 | **+50 legit** | gold/t = **legit** | land |

### Support — structural, no resource output

| Building | Era | def | Effect | ↑ | Placement |
|---|--|--|---|--|--|
| Roads | 2 | 1 | **underlaid**; links all touched tiles into one adjacency network | — | any |
| City | 6 | 2 | **underlaid**; tile holds up to 3 units+buildings (extras economic-only) | — | land |
| Windmill | 6 | 2 | units & buildings in range **+1 free upgrade level** | rng | land |
| Coal Plant | 9 | 2 | in range **+2 free upgrade levels** | rng | land |
| Fusion Plant | 16 | 3 | in range **+3 free upgrade levels** | rng | land |
| Artificial Island | 16 | 3 | permanently **converts an ocean tile → island** (land) | — | coast/water |
| Artificial Planet | 20 | 3 | permanently **converts a deep-space tile → land** | — | deep space |
| Tleilaxu Tanks | 22 | 2 | end of era: **+225 population** (flat) | — | land |

---

## Notes / open items

1. **Legitimacy snowball** — still the concern (Elysium gold/t = legit, Monastery progress/t = legit/20,
   Temple end-era gold = 3× legit, + Zealot/Warrior Monk). Revisit once wonders/policies land.
2. **Proportional coefficients** (Observatory 10×, Lumber Mill 4×, Museum 16×, Harbor 6×) reference the
   terrain economy-bonus values pinned down in `terrain.md`.
3. **City era = E6** — I read "move up" as *earlier* (it links to the Cathedral "too late → earlier"
   note and the prior "city too early → E8 overshoot"). Say the word if you meant *later*.
4. **Drydock E4 / Stables E5** — read "drydock one era earlier" as one era before Stables.
5. Late-era wall gap still open.
