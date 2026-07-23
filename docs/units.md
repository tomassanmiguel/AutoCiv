# Units

Schema per `SCALING.md` §9: **atk · def(=HP) · range · pursuit · cooldown · ability**. `atk` is the
as-built value at the unit's unlock era (`≈ anchor · 1.15^E`); upgrade levels add +25% atk each.
All numbers **`[proposed]`** — this pass exists to sanity-check the *curve*, so react to the shape
before I stat the rest.

Legend: `r` = range, `P` = pursuit, `cd` = cooldown. Melee anchor 5, Ranged 4, Cavalry 5 (era-0).

---

## Melee `[def 2–4 · attack only when adjacent · never moves]`

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Warrior | Stone (0) | 5 | 2 | 1 | 0 | 0 | — baseline blocker |
| Spearman | Bronze (1) | 6 | 3 | 1 | 0 | 0 | +50% atk vs Cavalry-type enemies `[proposed]` |
| Swordsman | Iron (2) | 7 | 3 | 1 | 0 | 0 | — |
| Knight | Late Medieval (5) | 10 | 3 | 1 | 0 | 0 | — |
| Musketman | Exploration (7) | 13 | 3 | 1 | 0 | 0 | — |
| Rifleman | Steam (9) | 18 | 3 | 1 | 0 | 0 | — |
| Infantryman | Modern (11) | 23 | 4 | 1 | 0 | 0 | — |
| Terminator | Silicon (13) | 31 | 4 | 1 | 0 | 0 | robot (immune to population prefixes) |
| Space Marine | Invasion (17) | 54 | 4 | 1 | 0 | 0 | deployable in space |
| Ascendant | Time (26) | 189 | 4 | 1 | **2** | 0 | also has Cavalry behavior; space-capable |

## Ranged `[def 1 · attack from range]`

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Slinger | Stone (0) | 4 | 1 | 2 | 0 | 0 | — |
| Archer | Bronze (1) | 5 | 1 | 2 | 0 | 0 | — |
| Crossbowman | Classical (3) | 6 | 1 | 2 | 0 | 0 | — |
| Cannoneer | Renaissance (6) | 9 | 1 | 3 | 0 | 0 | — |
| Mortar Squad | Steam (9) | 14 | 1 | 3 | 0 | 0 | — |
| Railgunner | Atomic (12) | 21 | 1 | 4 | 0 | 0 | — |
| Plasmer | Intelligence (15) | 33 | 1 | 4 | 0 | 0 | — |
| Psyker | Exodus (18) | 50 | 1 | 4 | 0 | 0 | — |
| Tachyon Lancer | Evolution (22) | 86 | 1 | 6 | 0 | 0 | hits every enemy in a straight **line** to range |
| Sun Launcher | Time (26) | 151 | 1 | ∞ | 0 | 0 | **infinite range, multi-attack**; buildable only on ★ Stars |

## Cavalry `[def 2–3 · attack adjacent · pursue within range+pursuit]`

| Tier | Era (E) | atk | def | r | P | cd | Ability |
|---|---|--|--|--|--|--|---|
| Chariot | Bronze (1) | 6 | 2 | 1 | 2 | 0 | — |
| Horseman | Iron (2) | 7 | 2 | 1 | 3 | 0 | — |
| Heavy Cavalry | Late Medieval (5) | 10 | 3 | 1 | 2 | 0 | — |
| Dragoon | Exploration (7) | 13 | 2 | 2 | 2 | 0 | **ranged** attack (fires while pursuing) |
| Tank | Modern (11) | 23 | 6 | 1 | 1 | 0 | high defense |
| Drone | Lunar (14) | 35 | 1 | 4 | 3 | 0 | high range/damage, very fragile |
| Warper | Liminite (20) | 82 | 2 | 1 | 5 | 0 | long pursuit — attempts to **flank** |

> **Cross-category read:** at each era, Melee ≈ Cavalry attack (Cavalry trades a bit of def for mobility);
> Ranged sits ~10–20% under Melee but strikes from safety. All three track `1.15^E`, so vs a same-era
> Raider (HP `10·1.25^E`) a raw unit needs ~2 hits early and drifts to ~4–5 hits by the space eras
> before upgrades/auras — which is the intended pressure toward compounding buffs. **Tune the anchors
> up if you want raw units to feel stronger, down if you want buffs/terrain to matter more.**

---

## Remaining categories — chains & era targets (stats next pass)

Statting these once you're happy with the land-unit curve. Chains + special rules captured so nothing's lost:

- **Siege** `[def 1 · ranged + splash · 2-turn cooldown]`:
  Ballista (single-target, **pushes back**) → Catapult → Trebuchet → Artillery → Missile Launcher
  (**bigger AoE**) → Grav Cannon (**big AoE, pushes group back**) → Tachyon Bomber (**huge AoE**).
- **Naval** `[def 1–4 · water only]`:
  Galley → Trireme → Longship → Frigate → Battleship → Leviathan. *(Deep-future naval is superseded by Aerial.)*
- **Aerial** `[def 1 · fast, cavalry move, flanks — won't front-engage unless forced]`:
  Biplane (land) → Fighter (land) → Raptor (land) → Hovercraft → X-Wing (space-capable).
- **Astral** `[def 1–4 · space only]`:
  Satellite (deploy adjacent to Earth/Mars/Moon; hits **terrestrial** targets only) → Spaceship
  (cavalry+range, no planetfall) → Valkyrie (tankier/slower) → Star Destroyer (very tanky, **stationary**, ranged, space).
- **Auxiliary** `[unique abilities]`:
  Hunter (food on kill) → War Elephant (pushes then pursues) → Warrior Monk (high def; atk ∝ legitimacy;
  progress when damaged) → Pirate (melee naval; gold on attack) → Mustard Man (poison, 5%/turn) →
  Zealot (gain legitimacy on attack; atk = legitimacy) → Cryo Specialist (ranged, 2-turn cd, **freezes 2 turns**) →
  Timelord (teleports to a random tile when killed).

> Auxiliary units are the "signature" tier — several key off **legitimacy** (Warrior Monk, Zealot),
> which pairs with the uncapped-legitimacy investment axis.
