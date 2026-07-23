# Units

Schema per `SCALING.md` §9: **atk · def(=HP) · range · pursuit · cooldown · ability**, plus
**deploy** (where you can place it) and **move** (domains it can reposition through in combat).
`atk` is the as-built value at the unit's unlock era (`≈ anchor · 1.15^E`); upgrade levels add +25% atk
each. All numbers **`[proposed]`**. Legend: `r` = range, `P` = pursuit, `cd` = cooldown.

Chains were spaced out (cut Swordsman / Horseman / Slinger) so tiers land ~every 3 eras.

---

## Melee `[def 2–4 · attack only when adjacent · never moves]` — deploy **Land** · move **Land**
Anchor 5.

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Warrior | Stone (0) | 5 | 2 | 1 | 0 | 0 | — baseline blocker |
| Spearman | Iron (2) | 7 | 3 | 1 | 0 | 0 | +50% atk vs Cavalry-type enemies `[proposed]` |
| Knight | Late Medieval (5) | 10 | 3 | 1 | 0 | 0 | — |
| Musketman | Revolution (8) | 15 | 3 | 1 | 0 | 0 | — |
| Rifleman | Modern (11) | 23 | 3 | 1 | 0 | 0 | — |
| Infantryman | Silicon (13) | 31 | 4 | 1 | 0 | 0 | — |
| Terminator | Invasion (17) | 54 | 4 | 1 | 0 | 0 | — |
| Space Marine | Xenotic (21) | 94 | 4 | 1 | 0 | 0 | very strong late-game melee |
| Ascendant | Time (26) | 189 | 4 | 1 | 2 | 0 | Cavalry behavior; **move Land+Space** |

## Ranged `[def 1 · attack from range]` — deploy **Land** · move **Land**
Anchor 4.

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Archer | Bronze (1) | 5 | 1 | 2 | 0 | 0 | — |
| Crossbowman | Early Medieval (4) | 7 | 1 | 2 | 0 | 0 | — |
| Cannoneer | Exploration (7) | 11 | 1 | 3 | 0 | 0 | — |
| Mortar Squad | Atomic (12) | 21 | 1 | 4 | 0 | 0 | — |
| Railgunner | Lunar (14) | 28 | 1 | 4 | 0 | 0 | — |
| Plasmer | Invasion (17) | 43 | 1 | 4 | 0 | 0 | — |
| Psyker | Frontier (20) | 65 | 1 | 5 | 0 | 0 | — |
| Tachyon Lancer | Early Galactic (23) | 100 | 1 | 6 | 0 | 0 | hits every enemy in a straight **line** to range |
| Sun Launcher | Time (26) | 151 | 1 | ∞ | 0 | 0 | **infinite range, multi-attack**; deploy **★ Stars only** |

## Cavalry `[def 2–3 · attack adjacent · pursue within range+pursuit]` — deploy **Land** · move **Land**
Anchor 5.

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Chariot | Bronze (1) | 6 | 2 | 1 | 2 | 0 | — |
| Heavy Cavalry | Late Medieval (5) | 10 | 3 | 1 | 2 | 0 | — |
| Dragoon | Revolution (8) | 15 | 2 | 2 | 2 | 0 | **ranged** attack (fires while pursuing) |
| Tank | Modern (11) | 23 | 6 | 1 | 1 | 0 | high defense |
| Drone | Intelligence (15) | 41 | 1 | 4 | 3 | 0 | high range/damage, very fragile |
| Warper | Frontier (20) | 82 | 2 | 1 | 5 | 0 | long pursuit — attempts to **flank** |

## Siege `[def 1 · ranged + splash · 2-turn cooldown]` — deploy **Land** · move **Land**
Anchor 8. All splash the target's neighbours; `cd 2` = two idle turns after firing.

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Ballista | Iron (2) | 11 | 1 | 3 | 0 | 2 | single-target; **pushes target back** 1 tile |
| Catapult | Early Medieval (4) | 14 | 1 | 3 | 0 | 2 | splash |
| Trebuchet | Renaissance (6) | 18 | 1 | 4 | 0 | 2 | splash |
| Artillery | Steam (9) | 28 | 1 | 4 | 0 | 2 | splash |
| Missile Launcher | Silicon (13) | 49 | 1 | 5 | 0 | 2 | **bigger AoE** |
| Grav Cannon | Exodus (18) | 99 | 1 | 5 | 0 | 2 | big AoE + **pushes the whole group back** |
| Tachyon Bomber | Late Galactic (24) | 229 | 1 | 6 | 0 | 2 | **huge AoE** |

## Naval `[def 1–4 · water only]` — deploy **Water** · move **Water**
Anchor 4. Usually ranged. *(Deep-future naval is superseded by Aerial, so the line ends ~Solar.)*

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Galley | Bronze (1) | 5 | 2 | 1 | 0 | 0 | ram (melee range) |
| Trireme | Classical (3) | 6 | 2 | 2 | 0 | 0 | — |
| Longship | Late Medieval (5) | 8 | 3 | 2 | 0 | 0 | — |
| Frigate | Revolution (8) | 12 | 2 | 3 | 0 | 0 | — |
| Battleship | Modern (11) | 19 | 4 | 3 | 0 | 0 | — |
| Leviathan | Solar (16) | 37 | 4 | 4 | 0 | 0 | — |

## Aerial `[def 1 · fast · flanks — won't front-engage unless forced]` — deploy **Land**
Anchor 5. Cavalry-style movement (pursuit); `move` widens by tier.

| Tier | Era (E) | atk | def | r | P | cd | move | Ability |
|---|---|--|--|--|--|--|--|---|
| Biplane | Gilded (10) | 20 | 1 | 1 | 3 | 0 | Land | — |
| Fighter | Atomic (12) | 27 | 1 | 1 | 3 | 0 | Land | — |
| Raptor | Lunar (14) | 35 | 1 | 2 | 4 | 0 | Land | — |
| Hovercraft | Invasion (17) | 54 | 1 | 2 | 4 | 0 | Land+**Water** | flies over water |
| X-Wing | Xenotic (21) | 94 | 1 | 2 | 5 | 0 | Land+Water+**Space** | space-capable |

## Astral `[def 1–4 · space only]` — deploy **Space** · move **Space**
Anchor 4. Ranged with cavalry movement (except the stationary ones).

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Satellite | Lunar (14) | 28 | 1 | 4 | 0 | 0 | deploy adjacent to Earth/Mars/Moon; hits **terrestrial** targets only; **stationary** |
| Spaceship | Invasion (17) | 43 | 2 | 3 | 3 | 0 | cavalry move; **cannot go planetside** |
| Valkyrie | Frontier (20) | 65 | 4 | 3 | 2 | 0 | tankier & slower than Spaceship |
| Star Destroyer | Late Galactic (24) | 114 | 8 | 5 | 0 | 0 | extremely tanky; **stationary**; ranged |

## Auxiliary `[unique abilities]` — deploy varies
Signature units; several key off **legitimacy** (pairs with the uncapped-legitimacy investment axis).

| Tier | Era (E) | atk | def | r | P | cd | deploy/move | Ability |
|---|---|--|--|--|--|--|--|---|
| Hunter | Stone (0) | 5 | 2 | 1 | 1 | 0 | Land | gain **food on kill** |
| War Elephant | Classical (3) | 8 | 2 | 1 | 2 | 0 | Land | on attack **pushes** the enemy back, then pursues |
| Warrior Monk | Renaissance (6) | =10% legit | 4 | 1 | 0 | 0 | Land | atk = **10% of legitimacy**; gain **progress when damaged** |
| Pirate | Revolution (8) | 15 | 2 | 1 | 1 | 0 | **Water** | melee naval; **gold on attack** |
| Mustard Man | Modern (11) | 12 | 1 | 2 | 0 | 0 | Land | applies **poison** (5% of enemy max HP / turn) |
| Zealot | Liminite (20) | =legit | 3 | 1 | 1 | 0 | Land | **gain legitimacy on attack**; atk = legitimacy |
| Cryo Specialist | Frontier (19) | 57 | 1 | 3 | 0 | 2 | Land | **freezes** the target for 2 turns |
| Timelord | Time (26) | 189 | 2 | 2 | 0 | 0 | Land | **teleports** to a random available tile when killed |

> Legitimacy-scaling: **Warrior Monk** attacks for **10% of legitimacy**, **Zealot** for the **full**
> value (uncapped) — both scale with how much you've invested in legitimacy, a whole build-around axis.
> (Auxiliary units are independent specials, not an upgrade chain, so their era order is free — hence
> Cryo at Frontier sitting before Zealot at Liminite.)

---

## Cross-category sanity check
At a shared era, per-hit attack roughly orders **Siege > Melee ≈ Cavalry ≈ Aerial > Ranged ≈ Naval ≈
Astral** (Siege pays for it with a 2-turn cooldown + being glass; Ranged/Naval/Astral trade punch for
safety/range). Everything rides `1.15^E`, so relative balance holds across all 28 eras; enemy HP
(`1.25^E`) still pulls ahead of raw stats, keeping upgrades/auras/terrain essential.
