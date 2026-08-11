# AutoCiv v4 — Design (SOURCE OF TRUTH)

> This document describes how AutoCiv v4 is **meant** to work. Where code disagrees with it,
> the code is wrong. v4 is a **fork of v3**: it keeps v3's world generator, hex/map rendering,
> menus, and audio, and **re-implements the game logic from scratch**. See §12 for the split.
>
> Design north star: **"a civilization in an hour."** Every rule is judged by whether it keeps a
> run *fast, legible, and decision-light*. When two designs tie, the simpler one wins. v4 leans
> deliberately into the **tower-defense** subgenre.
>
> 🌱 **This is a LIVING document.** The whole point of v1 is to find out whether the core loop is
> *fun*; expect these rules and — especially — every number to keep evolving as we play it. Values
> here are deliberate placeholders, not decisions.

> ### First-version scope
> The first playable ships with **5 eras** (Stone → Medieval) so we can exercise the **whole
> win/lose cycle** end to end. The engine must be written to **scale to 15 eras and authored
> content** by changing *data*, not code. For v1 the tech/upgrade content is a **deliberately
> dead-simple placeholder** (§9, §7a, and `techs.md`): the real tech trees and upgrade trees are
> being designed in parallel and dropped in later.

---

## 1. Premise & pillars

You guide a civilization from a single palace on a radial hex world. Enemies arrive from the
outer ring in escalating **waves** and march on your palace; if it falls, the run ends. You grow
by founding **cities**, fielding an **army** of mostly-stationary defenders, and drafting
**progress** across five tracks. The run is **won** by completing all five tracks (§10). Waves
scale forever, so eventually the only way out is to finish — you cannot turtle indefinitely.

Pillars:
- **Two currencies, one structure.** Gold (immediate safety) and progress (long-term
  investment) are the only resources; the **city** is the only thing you build.
- **Tower defense.** Terrain, unit positioning, and enemy classes make each wave a tactical
  puzzle. Stationary units **wall and channel** enemies along paths of your choosing.
- **Roguelike draft.** Progress is drafted from five tracks; what you skip is gone.
- **Escalating threat.** Waves grow without bound; the win condition is the pressure valve.

---

## 2. The world (carried from v3, terrain retuned)

The radial hex map, its generator, invariants, reveal ladder, and rendering are **carried from
v3 unchanged** (§12). What changes is **terrain yield & combat semantics** (§2a) and that **there
is no tile-claiming** — the whole *revealed* map is usable and the economy runs off **city
adjacency** (§4).

**Palace placement is constrained:** the generator must place the palace where **both a gold tile
and a food tile lie within its city radius**, so the opening city has a working economy. (This is
a new worldgen invariant on top of v3's start-repair pass.)

### 2a. Terrain table

A tile contributes to a **nearby city** (within that city's yield radius, §4) in three ways:
**food** → pop, **gold** → the city's gold output, **progress** → the city's progress output.
Some terrain also carries a **combat modifier** applied to any unit standing on it.

| Terrain | food | gold | progress | Combat / notes |
|---|---:|---:|---:|---|
| Plains | 3 | – | – | – |
| Hills | 1 | 10 | – | +1 **range** to units stationed here |
| Forest | 1 | 10 | – | units here take **−25% damage** |
| Desert | – | – | – | units here take **−5% max HP per turn** (hazard, both sides) |
| Mountain | – | 20 | – | **impassable**; a nearby city still harvests its gold |
| Tundra | 1 | – | – | – |
| Coast | 2 | 5 | – | water — enemies **embark** (§6c) |
| Ocean | 1 | 20 | – | water — embark |
| River | 1 | 5 | – | water — blocks ground movement (natural channel) |
| Island | 2 | 5 | – | land, reachable only across water |
| Moon (Lunar) | – | – | 50 | space body — **progress tile** |
| Lunar Crater | – | 500 | – | space body |
| Mars | – | – | 50 | space body — **progress tile** |
| Mars Ice Cap | 2 | – | – | space body |
| Asteroid | – | 1000 | – | space body |
| Planet | 100 | 1000 | 1000 | space body — the deep-map jackpot |
| Singularity | – | – | – | **impassable** chokepoint; no yield |
| Exo-* | ×4 | ×4 | ×4 | four times the Earth equivalent (yields), same combat mods |

**Progress from terrain is off-Earth.** No Earth tile yields progress; early progress comes from
**city pop** (§3). Space bodies (Moon/Mars), the exoplanet, and outer-galaxy planets are the
progress jackpots — the reward for eventually pushing outward. **Removed vs v3:** production
yields, the `star` terrain (redundant with singularity), `fallout`.

*Open (fill-ins pending sign-off):* island / river values above; singularity yields nothing.

---

## 3. Resources

Only **two** resources exist, plus **pop** (a per-city stat, not a global resource).

- **Gold** — a **spendable stock**, no threshold. **Start with 100.** Earned by each city when
  its yield cooldown fires in combat (= Σ **gold** of tiles in the city's radius). Banks across
  waves. Spent **only in prep**: found cities, hire units, buy class upgrades.
- **Progress** — **one pool**, threshold-gated. Earned by each city on its yield cooldown (= city
  **pop** + Σ **progress** of tiles in its radius). Crossing the threshold **pauses combat** and
  opens a **draft** (§9). Instant-apply cards only.
  - ⚠️ **The next threshold scales with the *tier* of your last pick.** The progress needed for
    the next advancement is `PROGRESS_BASE × TIER_GROWTH^(era of the advancement most recently
    taken)` (placeholder `PROGRESS_BASE = 50`, `TIER_GROWTH = 1.5`). Taking a high-era card makes
    the next one cost more — so the ladder self-paces instead of firing constantly late-game.
- **Pop** — per city. **Food converts to pop 1:1 at end of combat** (Σ food of tiles in the
  city's radius), only if the city survived (§4). Pop is the city's progress output and its
  survival stake. **The palace starts at 10 pop**; founded cities start at 1 (plus any bonuses).

---

## 4. Cities (programmed as units)

There is **no territorial expansion and no tile-claiming**. You found cities on any visible
passable **land** tile, and a city draws yield from the tiles within its **yield radius** (default
**1**, raised by upgrades to a **max of 3**). City *placement* — which cluster of terrain a city
sits on — is the spatial strategy that replaces v3's expansion. Overlapping radii each collect
independently.

A city is a **board piece with combat stats**, like a unit:
- **def / HP** — starts at **1** (palace higher, §below), raised by upgrades. Enemies can attack a
  city.
- **pop** — economic weight; drives progress output and survival.
- **yield cooldown** — fires its gold + progress during combat (§6a).
- **No default buff aura and no default attack.** A regular city does **not** attack and projects
  no aura. (Auras/attacks may return later as Culture upgrades — not in the base.)

**Only the palace attacks by default.** It has a real attack, a higher base def, and starts at 10
pop.

**Survival & pop (per wave):**
- A city **not defeated** during the wave **survives** → gains Σ-food pop at resolve.
- A city **defeated** (HP taken to 0) stops emitting for the rest of that combat and, at resolve,
  **loses ⌈pop / 2⌉**. It is removed only if pop hits **0** (**destroyed**).
- City **HP resets each wave** (cities "heal" between waves). **Units do not** — unit death is
  permanent (§7).

**The palace is a city** — your first, your starting income, and your loss condition. It attacks,
has higher base def, and **never takes the ⌈pop/2⌉ loss** (that would snowball an unrecoverable
spiral). The run ends when the palace is **destroyed** (0 pop).

**Founding rules:** any visible passable **land** tile; **at least hex-distance 4 from every other
city and the palace**; crossing water/space only where an Expansion permission allows it (§8).
Founded in prep with gold; cities and army carry over between waves.

---

## 5. The loop

**No development phase.** The economy runs *inside combat*. Three phases repeat:

1. **Prep** (clock paused). The **build side-panel** (§11) is up: spend banked gold to found
   cities, hire units, and open the **upgrade modal**. Reposition placed units (free within range,
   gold beyond — carried from v3). Press **Begin Wave**.
2. **Combat** (cooldown clock runs, §6). Pieces act on their cooldowns; cities emit gold +
   progress; **progress thresholds pause combat for a draft** (§9). Enemies path and attack; if the
   palace is destroyed, the run is lost.
3. **Resolve** (end of combat). Cities gain/lose pop by survival (§4); food → pop; destroyed cities
   and dead units are removed. Wave counter increments; back to prep.

Gold earned in combat *N* is spent in prep *N+1*. The **100 starting gold** funds the first prep.

---

## 6. Combat (cooldown engine)

Rewritten from scratch — **not** v3's turn/beat queue.

### 6a. Ticks & cooldowns
- A **tick** is the fundamental combat time unit; all cooldowns are integer ticks. The **HUD
  speed setting** sets how fast ticks elapse in real time (e.g. Paused 0 · Slow 2 · Normal 4 ·
  Fast 8 ticks/sec — placeholders). Speed changes tempo only, never outcomes.
- Every piece has a **cooldown in ticks**. When it elapses the piece **acts** (a unit attacks if a
  target is in range; an enemy moves and attacks if in range; a city fires its yield) and resets.
- **Each class has a distinct default cooldown**, which is how speed differences read on the
  board. Placeholders (ticks):

  | Player | cd | Enemy | cd | City |
  |---|---:|---|---:|---|
  | Cavalry | 6 | Scout | 5 | yield: 16 |
  | Melee | 8 | Grunt | 8 | palace attack: 12 |
  | Aerial | 8 | Ranger | 8 | |
  | Ranged | 10 | Raider | 10 | |
  | Naval | 10 | Specialist | 10 | |
  | Astral | 10 | Juggernaut | 16 | |

### 6b. Movement & targeting
- **Player units are stationary.** They hold their tile and attack whatever comes into range —
  they are towers. **Cavalry is the exception:** it attacks, then **moves to safety** (retreats a
  step away from the nearest enemy) if it can.
- **Enemies march the shortest *viable* path to the palace, routing AROUND your units** and
  impassable terrain (an occupied or impassable tile is not walkable). This is the core lever: a
  **wall of stationary units forces enemies the long way**, into rivers, mountains, singularities,
  and your ranged kill-zones. If genuinely boxed in, an enemy attacks the blocker.
- **Enemy attack priority:** on acting, if a target is within range it strikes — **units before
  cities**, and within each group **lowest def first**. **Raiders** are the exception: they veer
  toward and prioritize the nearest **city** to raze it.

### 6c. Embarking
An enemy on **water or open space** is **embarked**: it **cannot attack** and is **exposed**.
Embarked enemies make **landfall** on the first land tile on their path (Earth land or a stellar
body). This is the incentive for **naval / astral / aerial** units — hit the host while it is at
sea and helpless. The **Specialist** enemy is the exception: it can attack while embarked (counter
to naval/aerial play).

### 6d. Terrain in combat
Per §2a: forest −25% damage taken, hills +1 range, desert −5% HP/turn, mountains & singularities
impassable. Applied live to whichever piece stands on the tile.

---

## 7. Units & upgrades

**Six classes** (fortification, command, siege removed; their ideas fold into cities and ranged
AoE). **v1 uses only the first four** (through Naval); aerial/astral exist in the model for later
eras.

| Class | Role | Notes |
|---|---|---|
| Melee | frontline wall | punished by Juggernaut |
| Ranged | attacks at a distance, some AoE | absorbs the old siege role; punished by Scout |
| Cavalry | fast; **attacks then retreats** | the only mobile player unit; punished by Ranger |
| Naval | fights on/over water; hits embarked hosts | punished by Specialist |
| Aerial | crosses any terrain; hits embarked hosts *(later)* | punished by Specialist |
| Astral | operates in space/on bodies *(later)* | reaches the deep map |

Each class carries **placement** and **movement** terrain sets (carried from v3's data model). A
player unit's movement set is **empty by default** (stationary); cavalry's allows a one-step
retreat. **The draft is the only source of *new* classes** — you start with one melee unit;
Military advancements unlock the rest (§9). Units are **hired in prep with gold**. **Death is
permanent** — no repair, no mercenaries.

### 7a. Upgrades (per-class, gold, permanent) — v1 placeholder
Upgrades are **per class, not per unit**: buying one improves **every** unit of that class, now and
future, and **survives unit death**. Gold is the sink.

**v1 keeps this dead-simple** (the real trees are being designed separately):
- Each class has **two upgrade trees: one raises attack, one raises defense.**
- A tree is a vertical stack of **nodes** by **upgrade level**. ⚠️ **Trees are SPARSE — a tree has
  fewer nodes than there are levels, so nodes SKIP levels** (e.g. nodes at level 1, 3, 6…). The
  data model and UI must place nodes at arbitrary levels, not assume one-per-level.
- **The level ceiling = Military track progress** (each Military advancement raises the max
  purchasable level). A node is buyable only at level ≤ ceiling, for a rising gold cost.
- **Locked trees are HIDDEN in the UI** until unlocked. (In v1 every tree is unlocked once its
  class exists; the hide-when-locked behaviour must still be implemented for the real content.)
- Cities upgrade too (def, later attack/aura) — same mechanism.

### 7b. Upgrade UI
A **center-screen modal**, summoned per class/city from the build panel or a piece. It draws the
class's *unlocked* trees as a **graph**: nodes laid out by level (vertical) and tree (horizontal),
with the level axis honoring the skipped levels. Each node is hoverable (description) with a **Buy**
button when unlocked, within ceiling, and affordable; a close button dismisses it. Locked trees are
not shown. (Concrete layout designed when we build it.)

---

## 8. Expansion & reveal

The map is fog-covered and revealed in the **notch ladder carried from v3**, driven by the
**Expansion** track: each Expansion advancement reveals the next notch and grants the matching
**expansion permission** (cross water to islands, later cross to the New World / space bodies).
Reveal is monotonic. **For the 5-era v1, Expansion caps at the *Islands* notch** — later notches
(New World, space, exo, galaxy) come online when the era count grows.

---

## 9. Progress draft — five flavors

Progress crossings open a **draft**. Each card belongs to one of **five flavors**, each its own
era ladder (**5 eras in v1**, 15 in the full game). Taking a card advances **that flavor's era** to
the next pool. The pool is **current-tier-only** — skipped cards are gone once that flavor advances.
A flavor that has taken its **final-era** advancement is **complete**.

- The draft draws its cards from the **union** of all flavors' current-era options; **it need not
  offer three distinct flavors** (in the real content a flavor holds several options, so two cards
  can share a flavor).
- A **5-column panel** (summonable, §11) shows everything held — one column per flavor — the
  readable record of your build and progress toward each capstone.

**v1 placeholder content — one deterministic option per flavor per era, scaling slightly per era**
(see `techs.md`; numbers are placeholders):

| Flavor | Effect (per pick; scales up per era) |
|---|---|
| **Science** | +progress per citizen (≈ `1 + ⌊era/2⌋`) |
| **Military** | +5 atk / +5 def to all units, **and unlocks a class** in early eras (Ranged → Cavalry → Naval); raises the upgrade-level ceiling +1 |
| **Culture** | +20 atk / +20 def to all cities |
| **Economy** | +5 gold to every gold tile |
| **Expansion** | reveal the next notch (capped at *Islands* in v1) |

With one option per flavor, the draft simply offers the current-era cards of (up to) whichever
flavors it draws. This is enough to drive **all five flavors to completion → win**, and to let
scaling waves eventually **destroy the palace → lose**, so v1 tests the full cycle.

---

## 10. Win / lose

- **Win** — every flavor is **complete** (has taken its final-era advancement — era 4 in v1).
- **Lose** — the **palace** is destroyed (0 pop).
- Waves **scale without bound**; there is no wave ceiling. Scaling is tuned so the host eventually
  outgrows any static defense, forcing the player to prioritize finishing the tracks over turtling.

---

## 11. UI surfaces (new)

- **Prep build side-panel** — appears only in prep. Buttons to **found city** / **hire unit** (per
  unlocked class) priced in gold, and an entry to the **upgrade modal**. Gone in combat.
- **Upgrade modal** — §7b.
- **In-combat draft overlay** — the progress draft that pauses combat; instant-apply.
- **Summonable 5-column progress panel** — a UI element opened on demand (a HUD button /
  hotkey), not always on screen.
- Carried from v3: the HexMap camera/cards, reposition drag, hover reach-painting, the HUD speed
  control, the enemy muster preview.

---

## 12. What carries from v3 vs what's new

**Carried (kept, lightly retuned):**
- World generator & invariants (`worldgen`, `invariants`, `regions`, `noise`), `hex/coords`
  (+ the new palace gold+food placement invariant, §2)
- `terrain.js` (retuned to §2a + combat mods)
- `HexMap` camera/canvas renderer, culling, tile cards, reposition drag, reach-painting
- `common/` (NineSlice, InfoTip, IconText), the screen shell & `transitionTo` fade
- **Menus & screens** — Loading, Title, MenuOverlay (its known-world slider demoted to a
  **dev-only** debug tool; reveal is owned by Expansion now). ⚠️ **The civ-select PreGame screen
  is removed** (flow is loading → title → game); it may be re-added later.
- **Audio** — AudioManager, tracks, era crossfade, mute flag
- A `campaign.mjs`-style **headless sim** as the standing guardrail

**Re-implemented from scratch:**
- `GameManager` core loop (prep → combat → resolve; no dev phase)
- Cooldown **combat engine** (ticks), enemy classes, embarking, route-around pathing, terrain
  combat
- **Cities-as-units**, the two-currency + pop economy
- The **five-flavor draft** + capstone win
- **Per-class upgrade trees** + the build panel & upgrade modal
- The **content editor**, re-scoped to author: the tech pools, unit-class upgrade trees, and
  enemy-class definitions

---

## 13. Guardrail sim

A headless `sims/campaign.mjs` runs the whole loop across several seeds with a greedy AI and
reports: waves survived, palace pop, casualties, gold flow, **flavor eras reached** (is content
reaching the player? does the run reach a **win**?), and **drafts per combat** (the pacing number).
It stays green from the first skeleton onward, matching the batch workflow (spec-driven,
sim-verified, per-change commits).

---

## 14. Enemies

Six classes, each meant to punish one player strategy (so waves force adaptation):

| Enemy | Profile | Counters |
|---|---|---|
| **Grunt** | standard baseline | — |
| **Scout** | fast, fragile | ranged (rushes them before they fire) |
| **Raider** | tough def, veers to raze **cities** | city-heavy builds |
| **Ranger** | attacks at range while marching | cavalry |
| **Juggernaut** | huge HP, very slow | melee |
| **Specialist** | can attack **while embarked** | naval / aerial |

Enemies are bought against a **per-wave HP budget** that scales without bound (carried curve shape
from v3, retuned). Composition shifts with the wave and with which domains can path in (land /
amphibious / astral), so later waves mix classes. **The v3 encampment / camp-garrison system is
removed** — the only threat is the marching wave.

---

## 15. Resolved decisions & remaining fill-ins

**Resolved this pass:** no default city aura or attack (palace only); palace needs gold+food in
radius; food→pop is 1:1; palace starts at 10 pop; start with 100 gold; city spacing ≥ distance 4;
city yield radius default 1, max 3 via upgrade; enemies route around units and target units>cities
by lowest def (Raiders → cities); player units stationary except cavalry; encampments removed;
civ-select screen removed; progress panel is summonable; draft need not be 3 distinct flavors; next
threshold scales with last pick's tier; v1 = 5 eras with deterministic placeholder progresses and
atk/def-only sparse upgrade trees.

**Still fill-ins (reasonable placeholders assumed, tune later):** exact terrain values for
island/river/singularity; all cooldown/tick numbers; speed→tick rates; `PROGRESS_BASE`/`TIER_GROWTH`;
budget curve constants; per-era scaling of the placeholder progresses; palace base def.
