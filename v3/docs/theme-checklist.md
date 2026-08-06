# AutoCiv v3 — Theme Checklist

> **This is a living tracker, not a spec.** Design happens in the "design" thread, theme
> by theme — we talk through a theme, land on a baseline mechanic (if it needs one) and a
> set of techs, and they get written down here. The "implementation" thread reads this file
> to know what's ready to wire into `content.json` / the engine, and checks items off as
> they go live.
>
> **Nothing here is authoritative until it's written down.** Themes with no techs yet are
> marked `_Not yet discussed._` — do not invent content for them ahead of this thread
> deciding it, and do not treat the old `design-brief.md` roster as pre-approved content for
> any theme; we are designing fresh. The brief may still be worth a glance for *inspiration*
> once a theme is under discussion, never as a source to port from directly.
>
> **Checklist legend:**
> - `[ ]` — designed here, not yet wired into the engine / `content.json`
> - `[x]` — wired and live
>
> Some themes need a **baseline mechanic** decided before any tech in them makes sense (see
> Troop Transport below for the pattern) — that goes in an italic note under the heading,
> separate from the checklist, since it's the rule the techs modify rather than a tech
> itself. A theme can also carry a **decided ruling** even before it has techs (e.g. how
> razed wonders behave) — those are locked in, not open questions.

---

## 1. Critical Hits
*We will add a crit mechanic.*

*Decided: kept to one dial. Each tech grants a flat +10% crit chance to all units,
additive, universal (no class restriction). Crit damage multiplier is a fixed engine
constant (2×), not something techs scale — chance is the only lever. All eight sit in the
Military branch as single-effect techs (no `grant_unit` rider) and are spread across the
eras, opening with a two-part Stone→Bronze arc.*

- [ ] **Flint Knapping** *(Stone)* — +10% crit chance to all units.
- [ ] **Sharpening** *(Bronze)* — +10% crit chance to all units.
- [ ] **Anatomy** *(Classical)* — +10% crit chance to all units.
- [ ] **Fencing** *(Renaissance)* — +10% crit chance to all units.
- [ ] **Rifling** *(Steam)* — +10% crit chance to all units.
- [ ] **Smart Munitions** *(Solar)* — +10% crit chance to all units.
- [ ] **Atomic Precision** *(Liminite)* — +10% crit chance to all units.
- [ ] **Precognition** *(Ascension)* — +10% crit chance to all units.

## 2. Ranged Units

*Decided: every tech in this theme also grants 1 :ranged: unit, in addition to its listed
effect — not repeated per line below. Decided: no exclusivity groups in this theme — these
doctrines are meant to be mixed and matched (spread + poison is a deliberate synergy),
unlike a typical branching tech tree.*

*Poison: each stack of poison deals 1 damage to the poisoned unit on **that unit's own
turn** (not the attacker's).*

*Shot Chaining: after the first target, each additional chain hits the lowest-health enemy
still in range (a target may be re-hit). Each chain deals 50% less damage than the last,
unless that falloff is removed.*

### Poison
- [ ] **Blowguns** *(Bronze)* — ranged units apply +1 poison.
- [ ] **Curare** *(Classical)* — ranged units apply +1 poison. Targets lose 1 :speed:
  (minimum 1).
- [ ] **Toxicology** *(Renaissance)* — ranged units apply +2 poison.
- [ ] **Chemical Warfare** *(Modern)* — ranged units apply +1 poison. Whenever poison
  applies, a random adjacent enemy also gains 1 poison.
- [ ] **Nanite Blight** *(Exodus)* — ranged units apply +2 poison. Whenever poison applies,
  it deals double damage.
- [ ] **Omniphage** *(Galactic)* — ranged units apply +5 poison. Whenever poison applies,
  gain an additional 5 poison.

### Fortification synergy
- [ ] **Crenellations** *(Iron)* — fortifications gain +10% defense for each adjacent
  ranged unit. Also grants a fortification.
- [ ] **Turrets** *(Medieval)* — ranged units adjacent to a fortification gain +1 range.
  Also grants a fortification.

### Preloading
- [ ] **Quivers** *(Bronze)* — ranged units start combat with +1 preloaded shot.
- [ ] **Volley Fire** *(Medieval)* — ranged units start combat with +1 preloaded shot for
  each other adjacent ranged unit.
- [ ] **Repeaters** *(Steam)* — ranged units gain +1 preloaded shot whenever they crit
  (does not proc on preloaded shots).
- [ ] **Charge Coils** *(Liminite)* — ranged units gain +1 preloaded shot every turn with no
  enemy in range.

### Range
- [ ] **Longbow** *(Medieval)* — +1 range.
- [ ] **Snipers** *(Steam)* — +1 range.
- [ ] **Advanced Targeting** *(Solar)* — +2 range.
- [ ] **Solar Battery** *(Ascension)* — ranged units may be stationed on stars; ranged
  units on a star have infinite range.

### Shot Chaining
- [ ] **Shrapnel** *(Exploration)* — +1 chain.
- [ ] **Piercing Rounds** *(Information)* — +1 chain, and removes the per-chain damage
  falloff.
- [ ] **Arc Throwers** *(Exodus)* — +2 chain.

### Econ
- [ ] **Bounty Hunting** *(Renaissance)* — whenever a ranged unit crits, gain gold equal to
  the damage dealt. Ranged units gain +5% crit chance. *[Uses a class-scoped version of the
  Critical Hits theme's crit-chance effect — that effect is universal-only today, so this
  needs a `unitClass` filter added to it, or a sibling effect kind.]*

### Scaling
- [ ] **Entrenchment** *(Iron)* — ranged units gain +1 range for every 4 combats they
  aren't repositioned.
- [ ] **Marksmanship** *(Exploration)* — whenever a ranged unit crits, it permanently gains
  +1 atk. *[This earned +1 is NOT amplified by base-% attack modifiers, but IS amplified by
  ordinary-% attack modifiers — it does not fit the existing `unitAtkFlat` term (which sits
  before the base-% multiply and would pick up both layers). It needs its own per-unit
  accumulator inserted between the two layers:
  `atk = ((base + unitAtkFlat) × (1 + basePct) + earnedFlat) × (1 + ordinaryPct)`.]*

## 3. Cavalry Units

_Not yet discussed._

## 4. Spawners
*Buildings that periodically create new temporary defenders in combat. These count as
mercenaries for the purposes of interaction with the diplomacy/mercenary techs.*

_Not yet discussed._

## 5. Melee Units

_Not yet discussed._

## 6. Commander Units

_Not yet discussed._

## 7. Siege Units

_Not yet discussed._

## 8. Aerial Units

_Not yet discussed._

## 9. Naval Units

_Not yet discussed._

## 10. Astral Units

_Not yet discussed._

## 11. Fortification Units

_Not yet discussed._

## 12. Traps

_Not yet discussed._

## 13. Unit Death
*Effects that occur when our own units die.*

_Not yet discussed._

## 14. Unit Survival
*Effects that occur when our own units survive.*

_Not yet discussed._

## 15. Options Economy
*Rerolls, more offered options.*

_Not yet discussed._

## 16. Troop Transport
*Moving units on the map to reposition for enemy waves.*

*Troops cannot be repositioned by default except by paying gold, scaling with the distance
repositioned. These techs grant **reposition range** — moving within that range during the
planning phase is free; beyond it, the gold cost checks against the nearest tile that is
still within range. A few techs grant reposition **"across"** a terrain kind, meaning tiles
of that kind don't count toward the range calculation at all — e.g. with Galleons, the coast
of the New World and the coast of the Old World are adjacent for repositioning purposes,
regardless of the water between them.*

- [ ] **Roads** — +1 reposition range. City connections (the shortest passable route between
  cities) gain +1 base :gold: yield — every tile in the connection benefits.
- [ ] **Galleons** — reposition range extends across water. +1 reposition range.
- [ ] **Formations** — units gain +2 :attack: and +2 :defense: for each other unit within
  their reposition range. +1 reposition range.
- [ ] **Railroad** — +2 reposition range. City connections gain +2 :gold:.
- [ ] **Highways** — +3 reposition range. City connections gain +3 :gold:.
- [ ] **Maglev** — +3 reposition range. City connections gain +1 :gold:. City connection
  tiles also gain :production: equal to their :gold: yield.
- [ ] **Solar Shuttles** — reposition range extends across space. +2 reposition range.
- [ ] **Mass Relays** — reposition range extends across deep space. +3 reposition range.
- [ ] **Logistics** *(Modern)* — repositioning costs reduced by 50% (requires a reposition
  range greater than 0 from another tech).
- [ ] **Teleportation** — +4 reposition range. All units gain +1 :speed: and teleport
  directly to their destination, ignoring intermediate obstacles.

## 17. Time Manipulation
*More ticks, effects that trigger per-tick.*

*Decided: these techs push out the WAVE clock — they add development ticks before the next
wave attacks, or otherwise manipulate that countdown — never the era/tech-pool clock, which
has no tick-length in v3 (eras are a pure tech-pool gate; see `design.md` §1).*

_Not yet discussed._

## 18. Progress Buildings

*One building per era. Every effect below targets a specific tile's :progress: YIELD
(its own tile, or tiles in a radius) rather than adding directly to the civ total — it
rides the normal per-tick territory-yield accrual rather than being a separate payout.*

- [ ] **Mythology** *(Stone)* → *Shrine* — +3 :progress: to its own tile.
- [ ] **Writing** *(Bronze)* → *Library* — +3 :progress: to its own tile. Gains +2
  :progress: (to its own tile) for every wave it survives without being razed; resets on
  raze.
- [ ] **Mathematics** *(Iron)* → *Academy* — +5 :progress: to its own tile, plus +1
  :progress: to every tile in range 1 that has a unit stationed on it.
- [ ] **Basilicas** *(Classical)* → *Basilica* — every city in range 1 gains +1
  :progress:, plus +1 :progress: per citizen in that city.
- [ ] **Education** *(Medieval)* → *University* — +12 :progress: to its own tile.
- [ ] **Astronomy** *(Renaissance)* → *Observatory* — +6 :progress: to every mountain
  tile in range 1.
- [ ] **Journalism** *(Exploration)* → *Gazette* — +1 :progress: to its own tile.
  Whenever any unit dies (friendly or enemy) within range 4, permanently gain +1
  :progress:/tick (doubled if the Gazette is in the New World).
- [ ] **Scientific Method** *(Steam)* → *Laboratory* — +20 :progress: to its own tile.
- [ ] **Natural History** *(Modern)* → *Museum* — +1 :progress: to its own tile. Every
  building in range 2 gains +1 :progress: to its own tile for every era that has passed
  since it was built.
- [ ] **Ecology** *(Information)* → *Arctic Research Station* (tundra placement only) —
  +10 :progress: for every tundra tile in range 1.
- [ ] **Spectroscopy** *(Solar)* → *Space Telescope* (space placement only) — +50
  :progress: to its own tile.
- [ ] **Deep Thought** *(Exodus)* → *Cogitarium* — +15 :progress: to its own tile per
  tile of distance to the nearest other building (an adjacent building means just +15;
  no other building nearby scales it up from there).
- [ ] **Xenobiology** *(Liminite)* → *Alien Research Center* (exoplanet placement only) —
  every tile in range 1 gains :progress: equal to the sum of its other base yields.
- [ ] **Dark Matter** *(Galactic)* → *Black Hole Station* (singularity placement only) —
  +500 :progress: to its own tile.
- [ ] *(Ascension — no entry yet.)*

## 19. Production Buildings

_Not yet discussed._

## 20. Food Buildings

_Not yet discussed._

## 21. Gold Buildings

_Not yet discussed._

## 22. Cities

*Subtheme: **Population** — techs that buff citizens directly, independent of which city
they're in (e.g. "all citizens produce +1 :progress:").*

_Not yet discussed._

## 23. Wonder Theme
*Many wonders live in other themes — this theme is about paying off having a lot of them.*

*Decided: a razed wonder stops having its effect until repaired. An unbuilt/undrafted wonder
has no effect — the exception is a tech that specifically interacts with that state (e.g.
one that reduces wonder build time).*

_Not yet discussed._

## 24. Building Adjacencies

*Decided: the road/rail transport network (see Troop Transport) does **not** extend building
adjacency — it would be non-obvious to players. Adjacency is read off literal neighboring
tiles only.*

_Not yet discussed._

## 25. Buildings

*Universal modifiers that apply to every building regardless of type — a flat or percentage
bonus to all buildings' output, a blanket upgrade-cost discount, etc. — as distinct from
Building Adjacencies (how a building reads its neighbors) and the four resource-building
themes above (which are new buildings).*

_Not yet discussed._

## 26. Global

*Modifiers that affect total output and the progress/production/food thresholds directly,
independent of the map — not tied to any specific tile, building, or unit. Distinct from
Buildings (25), which still applies per building instance.*

_Not yet discussed._

## 27. Mercenaries

_Not yet discussed._

## 28. Enemy Control

*Decided: this theme is about messing with the enemy army during the **prep phase** —
before combat starts — not mid-combat manipulation.*

_Not yet discussed._

## 29. Lunar

_Not yet discussed._

## 30. Martian

_Not yet discussed._

## 31. Plains

_Not yet discussed._

## 32. Forests

_Not yet discussed._

## 33. Deserts

_Not yet discussed._

## 34. Tundra

_Not yet discussed._

## 35. Mountains

_Not yet discussed._

## 36. Hills

_Not yet discussed._

## 37. Sea

_Not yet discussed._

## 38. Islands

_Not yet discussed._

## 39. New World

*Old World vs. New World as a geographic identity, not a terrain type — bonuses for
colonizing and holding land outside your home continent.*

_Not yet discussed._

## 40. Exoplanet

_Not yet discussed._

## 41. Celestial Bodies

_Not yet discussed._

## 42. Upgrades

_Not yet discussed._

## 43. Repairs

_Not yet discussed._

## 44. Investments
*Long-term incentives — e.g. buildings that gain value over time.*

*Decided: this is a loose umbrella, not one shared mechanic — individual investment types
get their own subthemes/baseline mechanics as we design them.*

_Not yet discussed._

## 45. End of Combat
*Triggers that happen per wave.*

_Not yet discussed._

## 46. Palace
*Buffing the palace, but also palace adjacency.*

_Not yet discussed._

## 47. Outposts

_Not yet discussed._

## 48. Religion/Temples

_Not yet discussed._
