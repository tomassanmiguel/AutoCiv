# Enemies

## Combat model (how an enemy works in the TD)

Enemies **march down** toward the bottom. Two numbers per enemy:
- **`def` = HP** — how much player damage it takes to kill. Scales **`base_def · 1.25^E`** (current era E,
  0-based) — HP outpaces player attack (`1.15^E`) on purpose.
- **`atk` = legitimacy damage on BREACH** — dealt only if it reaches the bottom. Scales **slower,
  `base_atk + E`** (+1/era). *(This is the reconciliation of "enemies do 1 dmg to def by default" +
  walls def 3–9 + the listed atk values — atk is the breach threat, not the chip.)* `[model — confirm]`

**Blocker chip = 1 damage/turn by default** (to the unit/building blocking its lane; units before
buildings). Many enemies override this via their ability (higher chip, ranged chip, pierce, instakill).
So: your **blockers slow** the march (each survives ~`def` turns of chip) while your **ranged units chew
the enemy's HP** before it breaches and cashes in its `atk` as legitimacy damage.

**Elite:** 5% of spawns become Elite — **double HP and double breach-atk**.

## Scaling & waves

- **Normal wave:** draw weighted random enemies from the era-appropriate pool until their **summed HP**
  meets the wave **budget**. Proposed `budget(E) = 40 · 1.3^E · difficulty` `[proposed]` — grows a bit
  faster than per-enemy HP (1.25^E), so the horde slowly grows in count *and* fields tougher unlockables.
- **Difficulty** (chosen pre-game) multiplies the budget (and/or per-enemy stats).

## Pathing rules

- Most enemies **can't cross water** — they walk the shortest land path around it.
- Most **won't make planetfall on Moon/Mars** — they path around.
- All path **around Singularities and Stars** (impassable).
- Enemies **don't fight in Deep Space** — they planetfall on the fastest path to Earth / exo-Earth and attack there.

---

## Ordinary enemies

`atk` = breach legit dmg (+E/era) · `HP` = def (×1.25^E). Sorted by unlock era.

| Enemy | Era | atk | HP | Ability |
|---|--|--|--|---|
| Thrall | 0 | 1 | 1 | cannon fodder |
| Raider | 0 | 5 | 10 | baseline marcher |
| Marauder | 0 | 8 | 12 | always attacks adjacent blockers (front-priority); from **Iron can move on water** |
| Shaman | 1 | 1 | 15 | heals adjacent enemies **10% max HP/turn**; moves toward an enemy at range 2 if none adjacent |
| Sentinel | 2 | 1 | 30 | pure damage-sponge |
| Juggernaut | 2 | 25 | 50 | **skips every other turn** (slow, huge breach threat) |
| Leader | 2 | 3 | 20 | adjacent enemies deal **+100% breach atk**; Shaman-like movement `[stats proposed]` |
| Barbarian | 3 | 5 | 7 | **double chip vs units** (2/turn) |
| Ranger | 4 | 4 | 5 | chips blockers **at range 2** |
| Berserker | 5 | 2 + missing-HP | 15 | breach atk **grows as it's damaged** |
| Dervish | 5 | 20 | 1 | **triple speed**, glass |
| Ninja | 6 | 5 | 8 | takes the **path of least resistance**; **moves 2/turn** |
| Mongol | 6 | 8 | 8 | **double speed**; **removes blockers at range 2** |
| Corsair | 7 | 6 | 12 | attacks via the **nearest aquatic route**, can hit you at sea; prefers the central sea on the exoplanet |
| Sapper | 8 | 3 | 8 | chips **all adjacent blockers**; **destroys buildings instantly** |
| Quartermaster | 8 | 1 | 12 | after moving, **spawns a Raider** (5% elite) on an adjacent tile |
| Deadeye | 9 | 3 | 7 | chips blockers **at range 4** |
| Dreadnought | 9 | 15 | 30 | Corsair movement (aquatic), heavy |
| Kamikaze | 11 | 10 | 2 | **double speed**; on first attack **self-destructs**, killing everything within range 2 of the target |
| Jäger | 11 | 20 | 20 | takes the path with the **fewest tiles in player ranged-range** |
| Beamer | 16 | 3 | 17 | chipping a blocker **pierces to all blockers behind it** |
| Alien | 17 | 4 | 12 | **triple movement in space** |
| Phantom | 18 | 10 | 8 | **not impeded by anything**; may attack over water (not space) |
| Titan | 20 | 50 | 75 | **2×2**; plows through Mars/Moon; **×4 chip vs units & buildings** (see Bosses) |
| Obliterator | 21 | 20 | 40 | **instantly destroys all blockers** in its path |
| Swarm | 23 | 50 | 5 | HP **doesn't scale, takes only 1 dmg/hit**; when damaged, **spawns another Swarm** (½ atk, −1 def) on an empty adjacent tile |
| Warper | 24 | 9 | 9 | when damaged, **teleports** to a random tile within range 3 |

---

## Bosses

| Boss | Era | atk | HP | Footprint | Behavior |
|---|--|--|--|--|---|
| **Titan** | 20 | 50 | 75 | **2×2** | plows through Mars/Moon; **×4 chip** vs units & buildings — a mobile wall-breaker |
| **Flagship** | 24 | 100 | 4000 | **4×2** | moves on **odd turns**; each turn **spawns 2 random enemies** in the nearest empty tiles (never in front of it) |
| **Azazoth** | 27 | ∞ | 10000 | **fills the enemy row** | the only enemy that wave. **Immune to freeze/pushback/poison.** Marches every **other** turn, **instantly destroying anything in its path** and **vaporizing the tiles behind it**. A pure damage check — kill it before it crosses. |

---

## Scripted special waves

Triggered at specific era transitions (in addition to / replacing the normal wave):

| Wave | After | Composition |
|---|---|---|
| **Barbarian Horde** | Classical | all Barbarians |
| **Mongol Horde** | Renaissance | Barbarian / Mongol mix |
| **Axis Powers** | Modern | a front wall of Kamikazes, then a mix of Jägers + Raiders |
| **Alien Invaders** | Invasion | **2 Titans** + a horde of Aliens |
| **Galactic Armada** | Late Galactic | a **Flagship** + a medley of other units |
| **Azazoth** | Infinity | just **Azazoth** (the final fight) |

---

## Watch-points

1. **The atk = breach-legit model** is my reconciliation — confirm it (vs. atk being the blocker-chip).
   It's the single most important combat assumption and everything (wall durability, ranged emphasis,
   legit threat) hangs off it.
2. **Budget curve** `40·1.3^E·difficulty` is a pure guess — it and the difficulty multiplier are the
   core difficulty knobs; expect heavy playtest tuning.
3. **Leader** had no stats in the spec (proposed 3 atk / 20 HP). **Raider's** unlock era wasn't given
   (assumed initial, E0).
4. Several enemies need the **multi-tile** (Titan 2×2, Flagship 4×2) and **row-spanning** (Azazoth)
   models from SCALING §8 to be nailed down.
