# Units

Schema per `SCALING.md` §9: **atk · def(=HP) · range · pursuit · cooldown · ability**, plus
**deploy** (where you can place it) and **move** (domains it can reposition through in combat).
`atk` is the as-built value at the unit's unlock era (`≈ anchor · 1.15^E`); upgrade levels add +25% atk
each. All numbers **`[proposed]`**. Legend: `r` = range, `P` = pursuit, `cd` = cooldown.

Eras follow `PROGRESSION.md` (each unit sits at the era of its unlocking tech). Melee/Ranged/Cavalry/
Siege/Naval/Aerial/Astral attack anchors are 5/4/5/8/4/5/4; `def`, `range`, `pursuit`, and `cooldown`
keep their design values.

---

## Melee `[def 2–4 · attack only when adjacent · never moves]` — deploy **Land** · move **Land**
Anchor 5.

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Warrior | Stone (0) | 5 | 2 | 1 | 0 | 0 | — baseline blocker *(default)* |
| Spearman | Bronze (1) | 6 | 3 | 1 | 0 | 0 | +50% atk vs Cavalry-type enemies `[proposed]` *(tech: Alloying)* |
| Knight | Late Medieval (5) | 10 | 3 | 1 | 0 | 0 | — *(tech: Crusades)* |
| Musketman | Exploration (7) | 13 | 3 | 1 | 0 | 0 | — *(tech: Muskets)* |
| Infantryman | Gilded (10) | 20 | 4 | 1 | 0 | 0 | — *(tech: Trenchwarfare)* |
| Rifleman | Modern (11) | 23 | 3 | 1 | 0 | 0 | — *(tech: Rifling)* |
| Terminator | Invasion (17) | 54 | 4 | 1 | 0 | 0 | — *(tech: Replicant Legions)* |
| Space Marine | Xenotic (21) | 94 | 4 | 1 | 0 | 0 | very strong late-game melee *(tech: Space Marines)* |
| Jedi | Early Galactic (23) | 124 | 3 | 1 | 0 | 0 | **Force Push**: the enemy it attacks is knocked back 1 tile — **5-turn cooldown** on the push (attacks normally in between). *(tech: Kyber Crystals)* |
| Ascendant | Utopian (25) | 165 | 4 | 1 | 2 | 0 | Cavalry behavior; **move Land+Space** *(tech: Superhumanity)* |

## Ranged `[def 1 · attack from range]` — deploy **Land** · move **Land**
Anchor 4.

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Slinger | Stone (0) | 4 | 1 | 2 | 0 | 0 | earliest ranged unit *(tech: The Sling)* |
| Archer | Bronze (1) | 5 | 1 | 2 | 0 | 0 | — *(tech: Archery)* |
| Crossbowman | Early Medieval (4) | 7 | 1 | 2 | 0 | 0 | — *(tech: Crossbows)* |
| Cannoneer | Exploration (7) | 11 | 1 | 3 | 0 | 0 | — *(tech: Canons)* |
| Mortar Squad | Gilded (10) | 16 | 1 | 4 | 0 | 0 | — *(tech: Artillery)* |
| Railgunner | Lunar (14) | 28 | 1 | 4 | 0 | 0 | — *(tech: Lasers)* |
| Plasmer | Invasion (17) | 43 | 1 | 4 | 0 | 0 | — *(tech: Plasmatics)* |
| Psyker | Evolution (22) | 87 | 1 | 5 | 0 | 0 | — *(tech: Psionics)* |
| Tachyon Lancer | Early Galactic (23) | 100 | 1 | 6 | 0 | 0 | hits every enemy in a straight **line** to range *(tech: Particle Lance)* |
| Sun Launcher | Time (26) | 151 | 1 | ∞ | 0 | 0 | **infinite range, multi-attack**; deploy **★ Stars only** *(tech: Oblivion Beam)* |

## Cavalry `[def 2–3 · attack adjacent · pursue within range+pursuit]` — deploy **Land** · move **Land**
Anchor 5.

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Wolf | Stone (0) | 5 | 2 | 1 | 2 | 0 | Stone-age cavalry; **shift** to an adjacent empty valid tile after attacking *(tech: Pack Bonding)* |
| Chariot | Bronze (1) | 6 | 2 | 1 | 2 | 0 | — *(tech: The Wheel)* |
| Heavy Cavalry | Late Medieval (5) | 10 | 3 | 1 | 2 | 0 | — *(tech: Stirrups)* |
| Dragoon | Exploration (7) | 13 | 2 | 2 | 2 | 0 | **ranged** attack (fires while pursuing) *(tech: Dragoons)* |
| Tank | Gilded (10) | 20 | 6 | 1 | 1 | 0 | high defense *(tech: Tanks)* |
| Drone | Lunar (14) | 35 | 1 | 4 | 3 | 0 | high range/damage, very fragile *(tech: Drone Warfare)* |
| Warper | Utopian (25) | 165 | 2 | 1 | 5 | 0 | long pursuit — attempts to **flank** *(tech: Teleportation)* |

## Siege `[def 1 · ranged + splash · 2-turn cooldown]` — deploy **Land** · move **Land**
Anchor 8. All splash the target's neighbours; `cd 2` = two idle turns after firing.

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Ballista | Iron (2) | 11 | 1 | 3 | 0 | 2 | single-target; **pushes target back** 1 tile *(tech: Siege)* |
| Catapult | Early Medieval (4) | 14 | 1 | 3 | 0 | 2 | splash *(tech: Algebra)* |
| Trebuchet | Late Medieval (5) | 16 | 1 | 4 | 0 | 2 | splash, range 4 *(tech: Counterweights)* |
| Artillery | Steam (9) | 28 | 1 | 4 | 0 | 2 | splash *(tech: Dynamite)* |
| Missile Launcher | Atomic (12) | 43 | 1 | 5 | 0 | 2 | **bigger AoE** *(tech: Ballistics)* |
| Grav Cannon | Frontier (19) | 114 | 1 | 5 | 0 | 2 | big AoE + **pushes the whole group back** *(tech: Gravwaves)* |
| Tachyon Bomber | Late Galactic (24) | 229 | 1 | 6 | 0 | 2 | **huge AoE** *(tech: Neutron Canons)* |

## Naval `[def 1–4 · water only]` — deploy **Water** · move **Water**
Anchor 4. Usually ranged.

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Galley | Bronze (1) | 5 | 2 | 1 | 0 | 0 | ram (melee range) *(tech: Sailing)* |
| Trireme | Classical (3) | 6 | 2 | 2 | 0 | 0 | — *(tech: Warships)* |
| Longship | Late Medieval (5) | 8 | 3 | 2 | 0 | 0 | — *(tech: Clinker Construction)* |
| Frigate | Exploration (7) | 11 | 2 | 3 | 0 | 0 | — *(tech: Circumnavigation)* |
| Battleship | Modern (11) | 19 | 4 | 3 | 0 | 0 | — *(tech: Steel Hulls)* |
| Leviathan | Invasion (17) | 43 | 4 | 4 | 0 | 0 | — *(tech: Gundam)* |

## Aerial `[def 1 · fast · flanks — won't front-engage unless forced]` — deploy **Land**
Anchor 5. Cavalry-style movement (pursuit); `move` widens by tier.

| Tier | Era (E) | atk | def | r | P | cd | move | Ability |
|---|---|--|--|--|--|--|--|---|
| Biplane | Gilded (10) | 20 | 1 | 1 | 3 | 0 | Land | — *(tech: Flight)* |
| Fighter | Modern (11) | 23 | 1 | 1 | 3 | 0 | Land | — *(tech: Radar)* |
| Raptor | Silicon (13) | 31 | 1 | 2 | 4 | 0 | Land | — *(tech: Stealth)* |
| Hovercraft | Invasion (17) | 54 | 1 | 2 | 4 | 0 | Land+**Water** | flies over water *(tech: Artificial Gravity)* |
| X-Wing | Early Galactic (23) | 124 | 1 | 2 | 5 | 0 | Land+Water+**Space** | space-capable *(tech: Inertia Dampeners)* |

## Astral `[def 1–4 · space only]` — deploy **Space** · move **Space**
Anchor 4. Ranged with cavalry movement (except the stationary ones).

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Satellite | Lunar (14) | 28 | 1 | 4 | 0 | 0 | deploy adjacent to Earth/Mars/Moon; hits **terrestrial** targets only; **stationary** *(tech: Satelite Defense)* |
| Astral Galleon | Solar (16) | 37 | 2 | 1 | 3 | 1 | long pursuit but **moves 1 tile/turn**; space-only; **melee-range** ram *(tech: Solar Sails)* |
| Spaceship | Exodus (18) | 50 | 2 | 3 | 3 | 0 | cavalry move; **cannot go planetside** *(tech: Starships)* |
| Valkyrie | Liminite (20) | 65 | 4 | 3 | 2 | 0 | tanky, def 4 *(tech: Bimodal Starships)* |
| Star Destroyer | Late Galactic (24) | 114 | 8 | 5 | 0 | 0 | extremely tanky; **stationary**; ranged *(tech: Adaptive Hulls)* |

## Auxiliary `[unique abilities]` — deploy varies
Signature units; several key off **legitimacy** (pairs with the uncapped-legitimacy investment axis).

| Tier | Era (E) | atk | def | r | P | cd | deploy/move | Ability |
|---|---|--|--|--|--|--|--|---|
| Hunter | Stone (0) | 5 | 2 | 1 | 1 | 0 | Land | gain **food on kill** *(tech: Hunting)* |
| War Elephant | Classical (3) | 8 | 2 | 1 | 2 | 0 | Land | on attack **pushes** the enemy back, then pursues *(tech: War Elephants)* |
| Warrior Monk | Early Medieval (4) | =10% legit | 4 | 1 | 0 | 0 | Land | atk = **10% of legitimacy**; gain **progress when damaged** *(tech: Monastic Order)* |
| Pirate | Exploration (7) | 13 | 2 | 1 | 1 | 0 | **Water** | melee naval; **gold on attack** *(tech: Cartography)* |
| Mustard Man | Gilded (10) | 20 | 1 | 2 | 0 | 0 | Land | applies **poison** (5% of enemy max HP / turn) *(tech: Total War)* |
| Aspirant | Intelligence (15) | 1 | 1 | 1 | 0 | 0 | Land | **scaling unit**: starts 1 atk / 1 def; each era survived, randomly **+1 def OR double attack** *(tech: Recursive Self-Improvement)* |
| Cryo Specialist | Exodus (18) | 50 | 1 | 3 | 0 | 2 | Land | **freezes** the target for 2 turns *(tech: Cryogenics)* |
| Zealot | Frontier (19) | =legit | 3 | 1 | 1 | 0 | Land | **gain legitimacy on attack**; atk = legitimacy *(tech: Church of the Simulation)* |
| Timelord | Time (26) | 189 | 2 | 2 | 0 | 0 | Land | **teleports** to a random available tile when killed *(tech: Sonic Screwdrivers)* |

> Legitimacy-scaling: **Warrior Monk** attacks for **10% of legitimacy**, **Zealot** for the **full**
> value (uncapped) — both scale with how much you've invested in legitimacy, a whole build-around axis.
> (Auxiliary units are independent specials, not an upgrade chain, so their era order is free.)

---

## Cross-category sanity check
At a shared era, per-hit attack roughly orders **Siege > Melee ≈ Cavalry ≈ Aerial > Ranged ≈ Naval ≈
Astral** (Siege pays for it with a 2-turn cooldown + being glass; Ranged/Naval/Astral trade punch for
safety/range). Everything rides `1.15^E`, so relative balance holds across all 28 eras; enemy HP
(`1.25^E`) still pulls ahead of raw stats, keeping upgrades/auras/terrain essential.
