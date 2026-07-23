# Buildings

Schema per `SCALING.md` §10. `def` = HP (low; walls excepted). Output buildings ≈ `round(3.5·1.15^E)`
/tick, upgrade **+25% output** additive. Command buildings upgrade **+1 range**; damaging traps **+25%
dmg**. All numbers **`[proposed]`**. Footprints are `1×1` unless noted; **`[⬛]`** marks an *invented*
multi-tile footprint (not in the spec — confirm or shrink to 1×1). `↑` = upgrade target.

---

## MILITARY INFRASTRUCTURE

### Traps — manipulate/damage enemies

| Building | Era | def | Effect | ↑ | Placement |
|---|--|--|---|--|--|
| Caltrops | 2 | 2 | Persistent hazard: every enemy that repositions onto/through the tile takes **5 dmg** (era-scaled); not consumed, doesn't block | dmg | land |
| Decoy | 5 | 12 | All enemies within **range 2** path to it and attack it first until destroyed; deals no damage (soaks hits) | def | land |
| Powder Magazine | 8 | 1 | Martyr: on destruction, explodes for **37 dmg** to all enemies within range 2 | dmg | land |
| Sea Mine | 8 | 1 | First enemy to enter takes **61 dmg**, then consumed | dmg | coast/water |
| Discombobulator | 13 | 2 | On fire, enemies within range 1 **skip their next turn**; 5-turn cooldown | rng | land |
| Singularity | 23 | 3 | **Impassable** — enemies route around it (invalid if it blocks *all* paths); **747 dmg to Azazoth** if forced through | — | space |

### Command — buff allied units in range (upgrade widens the aura)

| Building | Era | def | Aura | ↑ | Placement |
|---|--|--|---|--|--|
| Fort | 2 | 3 | units in range **+1 def** (range 1) | rng | land |
| Command Post | 3 | 2 | units in range **+50% atk** (range 1) | rng | land |
| Watchtower | 4 | 2 | :ranged: units in range **+1 range** (aura 2) | rng | land |
| Armory | 6 | 2 | end of era: **upgrade one adjacent unit +1 level** (free) | rng | land |
| Radar Station | 11 | 2 | all ranged-role units in range **+2 range** (aura 2) | rng | land |
| Deflector Array | 12 | 2 | units in range **+2 def** (range 1) | rng | land |
| Psy-Link | 15 | 1 | units in range **+100% atk** (range 1); fragile | rng | land |
| Chronobooster | 26 | 1 | units in range **act twice per turn** (range 1) | rng | any |

> Damage auras stack **additively** (Command Post + Psy-Link over one tile = +150% atk). Def auras are
> flat (Fort/Deflector). Chronobooster is the late-game force multiplier.

### Spawners — every 8 combat-turns, create your best unit of a type on an adjacent tile (upgrade → spawn's level)

| Building | Era | def | Spawns | ↑ | Placement |
|---|--|--|---|--|--|
| Stables | 2 | 2 | best **Cavalry** | out | land |
| Drydock | 3 | 2 | best **Naval** | out | coast |
| Aircraft Carrier | 10 | 3 | best **Aerial** | out | coast/water `[⬛ 2×1]` |
| Spaceport | 14 | 3 | best **Astral** | out | space (incl. Moon/Mars) |

### Walls — pure blockers (high def, no attack/output, **cannot upgrade**)

| Building | Era | def | Note | Placement |
|---|--|--|---|--|
| Mud Brick Wall | 0 | 30 | ~6 hits vs a Stone-era enemy | land |
| Stone Wall | 3 | 80 | holds a lane most of a battle | land |
| Castle | 7 | 220 | `[⬛ 2×1]` walls two lanes (shared HP) | land |
| Shield Matrix | 17 | 900 | energy barrier — the **only wall deployable on any domain** (land/water/space) | any |

> **Gap:** no wall tier between Shield Matrix (E17) and Infinity — a 5th tier (e.g. a late-game barrier)
> is a candidate for the "fill sparse late eras" pass. Walls don't upgrade, so they also don't benefit
> from Power buildings — the only way to harden a lane late is to replace the wall with a newer tier.

---

## CIVILIAN INFRASTRUCTURE

Output buildings share the curve `round(3.5·1.15^E)`/tick → **4 · 7 · 14 · 29 · 57 · 115** across their
six tiers. (Era-0 base rounds to 4; dial the 3.5 anchor to 3 if you want the "~3/tick" reference exactly.)

### Progress

| Building | Era | def | Output / Effect | ↑ | Placement |
|---|--|--|---|--|--|
| Library | 0 | 2 | 4 progress/t | out | land |
| School | 5 | 2 | 7 progress/t | out | land |
| Laboratory | 10 | 2 | 14 progress/t | out | land |
| Space Telescope | 15 | 2 | 29 progress/t | out | space |
| Cogitorium | 20 | 3 | 57 progress/t | out | land |
| Black Hole Station | 25 | 3 | 115 progress/t | out | singularity |
| Cave Painting | 0 | 1 | banks stored progress (**doubles each era**, cap 50k); dumps it all when overbuilt | — | land |
| Theater | 6 | 2 | end-of-era **progress lump** (~50 at unlock) | out | land |
| Observatory | 6 | 2 | end-of-era progress **∝ tile terrain bonus** | out | mountain |
| Museum | 8 | 2 | progress/t = **3 × unique unit+building types in its row/column** | out | land |

### Production

| Building | Era | def | Output / Effect | ↑ | Placement |
|---|--|--|---|--|--|
| Workshop | 0 | 2 | 4 production/t | out | land |
| Forge | 5 | 2 | 7 production/t | out | land |
| Factory | 10 | 2 | 14 production/t | out | land |
| 3D Printer | 15 | 2 | 29 production/t | out | land |
| Vacuum Assembly | 20 | 3 | 57 production/t | out | space |
| Dyson Sphere | 25 | 4 | 115 production/t | out | star `[⬛ 2×2]` |
| Glassworks | 2 | 2 | production/t **grows +2 each era** (resets if destroyed; base ~5) | out | land |
| Harbor | 3 | 2 | production/t = **2 × units in range** | rng | coast |
| Solar Array | 11 | 2 | production/t base ~8, **+50% per other Solar Array** | out | any (incl. space) |
| Lumber Mill | 1 | 2 | production/t **∝ tile terrain bonus** | out | forest |

### Food

| Building | Era | def | Output / Effect | ↑ | Placement |
|---|--|--|---|--|--|
| Farm | 0 | 2 | 4 food/t | out | plains/land |
| Aqueduct | 2 | 2 | 5 food/t | out | earth |
| Hospital | 9 | 3 | 12 food/t | out | land |
| Hydroponicist | 13 | 3 | 22 food/t (any surface) | out | any |
| Xenocultivator | 20 | 3 | 57 food/t | out | exoplanet |
| Cloning Bay | 24 | 3 | 100 food/t (any surface) | out | any |
| Ranch | 1 | 2 | food/t **grows +2 each era** (resets if destroyed; base 4) | out | land |
| Pier | 1 | 2 | end-of-era **food lump** (~48 at unlock) | out | coast |

### Gold

| Building | Era | def | Output / Effect | ↑ | Placement |
|---|--|--|---|--|--|
| Market | 0 | 2 | 4 gold/t | out | land |
| Mint | 4 | 2 | 6 gold/t | out | land |
| Stock Exchange | 9 | 3 | 12 gold/t | out | land |
| Data Center | 13 | 3 | 22 gold/t | out | any |
| Asteroid Mine | 18 | 3 | 43 gold/t | out | asteroid |
| Spice Extractor | 20 | 3 | 57 gold/t | out | exoplanet |
| Arena | 2 | 2 | end-of-era gold = **5 × deployed units** (era-scaled) | out | land |
| Caravansary | 3 | 2 | 5 gold/t **+ per other Caravansary** | out | land |
| Lighthouse | 5 | 2 | 7 gold/t **AND +1 range to naval units in range** | rng | coast |
| Bank | 10 | 3 | end-of-era **+5% of unspent gold** (multiple Banks stack) | out | land |

### Legitimacy — completion bonus + leverage (uncapped, no per-tick legit)

| Building | Era | def | On completion | Ongoing | Placement |
|---|--|--|---|---|--|
| Shrine | 0 | 2 | **+10 legit** | — | land |
| Temple | 2 | 2 | **+20 legit** | end of era: gold = **3× legit** | land |
| Monastery | 5 | 3 | **+30 legit** | progress/t = **legit ÷ 20** | land |
| Cathedral | 8 | 3 | **+40 legit** | end of era: **+5 legit** | land `[⬛ 1×2]` |
| Elysium | 11 | 3 | **+50 legit** | gold/t = **legit** | land `[⬛ 2×2]` |

### Support — structural, no resource output

| Building | Era | def | Effect | ↑ | Placement |
|---|--|--|---|--|--|
| Windmill | 6 | 2 | units & buildings in range **+1 free upgrade level** | rng | land |
| Coal Plant | 9 | 2 | in range **+2 free upgrade levels** | rng | land |
| Fusion Plant | 16 | 3 | in range **+3 free upgrade levels** | rng | land |
| Roads | 1 | 1 | **underlaid**; links all touched tiles into one adjacency network | — | any |
| City | 3 | 2 | **underlaid**; tile holds up to 3 units+buildings (extras economic-only) | — | land |
| Artificial Island | 11 | 3 | permanently **converts an ocean tile → island** (land) | — | coast/water |
| Artificial Planet | 18 | 3 | permanently **converts a deep-space tile → land** | — | deep space |
| Tleilaxu Tanks | 22 | 2 | end of era: **large population burst** (~`10·1.15^E`) | — | land |

---

## Balance watch-points (flagged for you)

1. **Legitimacy snowball.** Legitimacy is uncapped and several buildings both *feed* it (Temple/Monastery/
   Cathedral/Elysium completion, Cathedral +5/era) and *scale off* it (Elysium gold/t = legit, Monastery
   progress/t = legit/20, Temple end-era gold = 3× legit) — and units (Zealot atk = legit, Warrior Monk
   10%) key off it too. Stacked with Stonehenge/Hagia Sophia/Organized Religion (wonders/policies pass),
   this is the game's biggest potential runaway. It's *gated by* legit being investment-only (no per-tick
   income), but worth a hard look — maybe Elysium/Monastery should scale off legit with a soft diminishing
   curve, or legit gains should slow late.
2. **Invented footprints** `[⬛]`: Aircraft Carrier 2×1, Castle 2×1, Dyson Sphere 2×2, Cathedral 1×2,
   Elysium 2×2 — the agents added these for grandeur; none were in the spec. Keep for flavor or shrink to 1×1.
3. **Base anchor:** era-0 output rounds to **4/tick** (from a 3.5 anchor) vs your "~3/tick" note — trivially
   dialable if you want exactly 3.
4. **Late-era wall gap** (see Walls note) — a candidate for the sparse-late-era fill.
