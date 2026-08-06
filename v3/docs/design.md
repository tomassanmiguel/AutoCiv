# AutoCiv v3 — the design

> ## THIS DOCUMENT IS THE SOURCE OF TRUTH. THE CODE IS NOT.
>
> Where the code disagrees with this file, **the code is wrong** and is either
> behind or a bug. Do not "correct" this document to match an implementation.
>
> Precedence, highest first:
>
> 1. **This file** — the current design.
> 2. [`design-brief.md`](design-brief.md) — the designer's original text, kept
>    verbatim. Still authoritative for any tech's individual effect, but where it
>    conflicts with a system described here, this file supersedes it.
> 3. [`../src/game/data/content.json`](../src/game/data/content.json) — the
>    content layer, authored in the editor. Authoritative for *which* techs exist
>    and what each one does.
> 4. The code.
>
> Open decisions are tracked in [`open-questions.md`](open-questions.md).

---

## 0. What is actually being built right now

The design below describes the whole game. **The current build is a microcosm of
it** — deliberately small, so the systems can be finished and played before the
content is scaled up.

**Scope: the first three eras (Stone · Bronze · Iron) and six waves.**

Run it by double-clicking **`AutoCiv.cmd`** in the repo root — it frees the port,
starts the dev server and opens the game. The editor is at `/editor.html`.

- `content.activeEras = 3`. The other twelve eras are designed but their content
  is **parked in `content.backlog`** — nothing is deleted, and the editor's
  Backlog tab restores a row into scope one at a time.
- The tech and building pools were **cleared to empty on purpose** and are being
  rebuilt **one wired tech at a time**: a tech goes in only when the effect it
  needs exists in the engine. The backlog holds the 385 parked rows.
- In play right now: **56 techs · 0 buildings ·
  5 wonders · 3 tier unlocks.**
- Iron is the terminal era for now, so nothing advances out of it and it carries
  no threshold.

⚠️ **Economy and Society hold no techs, so those two branches cannot advance** —
`sims/campaign.mjs` reports both as `STALLED` at Stone, which is the content
shortfall showing up honestly rather than being papered over. Military has one
Stone tech and needs two to advance, so the map currently never opens either.
Filling those cells is the next content job.

The goal for this slice is a **small playable game**: six waves of combat against
the first three eras of techs, with the draft, the thresholds and the wonder loop
all working. Widening the era range afterwards should be a data change, not a
code change — that is the point of the content layer.

## 1. Two clocks, and they are not connected

**Eras are a term defined purely for tech pools.** An era says which techs you
may be offered. It is not a phase of play, it does not pace the map, and it has
nothing to do with how hard the fighting is.

**Waves are combat.** There are 30 of them. **One combat per wave; a combat *is*
a wave.** Combat difficulty scales on its own schedule, independent of how far
any tech track has advanced — outrunning the enemy on tech is a legitimate way to
win, and falling behind is a legitimate way to lose.

In code the two clocks are `game.wave` (0-based; 65 ticks of development, then
the wave attacks) and `game.draft.branchEra` (three of them). **The map reveal
and the expansion permissions follow the ERA, never the wave** — the 15 eras and
the 15 reveal notches are one ladder, one rung each, which is why the reveal
needs no table of its own.

## 2. Three independent branches

**Military, Economy and Society** each carry **their own era**, and each advances
on its own clock. You may be drafting Medieval military while your economy is
still in Iron.

*(There was a fourth, Technology. It was folded in: its knowledge and pacing
techs went to Society, its buildings and yields to Economy, its weapons to
Military.)*

A quadrant advances to era *E+1* once it has taken this many techs of era *E*:

| era | 0–1 | 2–3 | 4–5 | 6–7 | 8–9 | 10–13 |
|---|---|---|---|---|---|---|
| techs needed | 2 | 3 | 4 | 5 | 6 | 7 |

**The draft pool is CURRENT TIER ONLY.** When a quadrant advances, everything it
did not take is gone for the run. A quadrant × era cell must therefore hold at
least its threshold of techs, and wants several more than that for the draft to
be a choice rather than a formality. The editor's Feasibility tab computes this.

Crossing a **:progress:** threshold offers **3** advancements drawn from the
current pools.

### Dependencies and exclusivity
A tech may `require` others — it is then only offered once its requirement is
held. Because the pool is current-tier-only, **a requirement in a later era can
never be met**, and the validator rejects it.

Techs sharing a **`group`** are mutually exclusive: take one and the rest are
barred for the run. Every member **must sit in the same branch and the same
era**, or the choice is never actually offered — the validator rejects a group
that spans pools, and a group of one.

## 3. What each resource threshold does

| resource | on crossing a threshold |
|---|---|
| **:food:** | **Expands automatically.** No prompt: the highest-yield available outpost is created, pushing your borders outward. |

| **:production:** | **Prompts you to found a city** — *unless* you are holding an undrafted wonder, in which case you build the wonder instead. |
| **:progress:** | Offers 3 advancements from the three current pools. |

City founding **no longer depends on food**. Food buys ground; production builds
on it.

### Where an outpost may go

**AN OUTPOST IS NEVER ON WATER.** Water still yields once your border reaches it
— control spreads onto it and it pays its :gold: — but it can never be settled,
and so can never be built on. Crossing the sea is done by *landing*, not by
settling a chain of ocean tiles.

**You may settle any tile you can SEE, if it is one of:**

1. **adjacent** to ground you control — adjacency to the controlled border, so it
   reaches one ring past your outposts;
2. on the **border of a settleable region you have not entered** — the New World,
   the Moon, Mars, the exoplanet. This is the only way in: you cannot appear in
   the middle of Mars;
3. an **isolated speck** — an island, asteroid, planet, star, singularity or the
   exomoon. Nothing is ever adjacent to these, so the border rule would strand
   them forever.

Terrain gates (tundra, desert, mountain, and the off-world unlocks) still apply
on top.

### "Highest yield" counts :gold: at HALF

:gold: is the only resource with **no threshold** — it buys repairs and upgrades
rather than compounding into growth — so a raw sum overrates gold-heavy ground.
At full weight desert (3 :gold:) outranked plains and hills; at half it does not.

```
score = :food: + :production: + :progress: + 0.5 × :gold:
```

Ties break **outward**, which is what "pushing your borders outward" means.

## 4. Wonders are drafted techs

A wonder appears in the advancement offer like any other card, with an era and a
quadrant. Taking one does not build it — **the next :production: threshold builds
it instead of a city**, and you place it on the map.

**You are never offered a wonder while you already hold an unbuilt one.**

Wonders keep their tier (I–IX) as a grouping and a rough power band.

## 5. Yields

```
final = base × (1 + Σ base modifiers) × (1 + Σ modifiers)
```

**TWO LAYERS: additive WITHIN a layer, multiplicative BETWEEN them.**

- A **base modifier** changes the quantity itself. "+25% base :attack:" makes the
  unit's attack genuinely larger, so everything downstream sees the bigger
  number.
- An **ordinary modifier** is a bonus on top of whatever the base has become.

Within either layer percentages **add**: +25% and +40% base is +65% base, never
×1.25×1.40. A flat "+N" is folded into `base` *before* the first multiplier —
which is what makes a flat bonus combo with your percentages instead of being
washed out by them.

### Everything stacks. Nothing replaces.

Two techs that touch the same quantity **both apply**. There is no tier system
anywhere — the weapon/armour tier ladder the engine used to carry was deleted for
contradicting exactly this rule.

Prefer a **base modifier** to a flat bonus for anything a whole class of thing
shares. A flat line washes the classes out: with a flat attack ladder every unit
class converged on roughly the same number and a Siege unit ended the game
hitting no harder than a Ranged one. A percentage of base keeps their ratios
intact for the whole run.

### The palace is NOT a unit

Unit research — attack, defence, anything keyed to `unitAtk*` / `unitDef*` —
does not touch the palace's attack or its hit points. The palace gets a tech line
of its own, and folding unit research into it would quietly pre-empt that.

- **Rural tile** — controlled, with no outpost and no city. Water is always this
  and never more.
- **Outpost** — a settled tile. Its yield is multiplied (×2 to start; Feudalism
  and Quantum Logistics add to that factor). **Outposts have no citizens, and are
  never on water.**
- **City** — has a population of citizens. "Adjacent outposts or citizens" means
  *number of adjacent outposts + total population of adjacent cities*.

## 6. Units: one per class

There is **no ladder of named units**. Each class has a single stat line, and
techs raise it — every unit of that class already on the board improves with it.
**"Create a melee unit" means place one more melee unit on the map**, at whatever
the class currently is.

**The stat lines are CONTENT**, not code: `content.unitClasses`, authored on the
editor's **Unit classes** tab. `schema.js` holds only the canonical list of nine
keys. `def` is hit points.

| class | atk | def | range | speed | notes |
|---|---|---|---|---|---|
| melee | 7 | 22 | 1 | 1 | Slow, but strong |
| ranged | 6 | 12 | 2 | 0 | Least defence and damage; never moves |
| cavalry | 8 | 16 | 1 | 2 | Fast, not as strong |
| fortification | 0 | 60 | 0 | 0 | No attack; never moves; taunts |
| siege | 20 | 18 | 3 | 0 | Slow attacks, **blast radius 1**; never moves |
| naval | 10 | 28 | 2 | 2 | Water only |
| aerial | 12 | 22 | 1 | 4 | Very fast; crosses water; planet-bound until unlocked |
| astral | 14 | 26 | 3 | 2 | Space only |
| command | 0 | 24 | 0 | 1 | No attack; **command radius 2** |

*(Placeholders, pending a balance pass. The table above is a snapshot — the file
is the truth.)*

### Placement and movement are TERRAIN SETS

Each class carries two lists of terrain keys:

- **placement** — where a unit of it may be **created**. Naval is water-only in
  the strict sense: built on water, and nowhere else.
- **movement** — where it may **stand and walk**. An **empty** movement list is
  how "never moves" is said: fortifications, ranged and siege all have one, so
  that intrinsic behaviour is data rather than a special case in the engine.

The two are independent on purpose, and that is what makes the late-game
unlocks expressible: **aerial** starts able to move over water but not into
space, and **astral** starts unable to come down to a planet. A tech that
"grants aerial units space" is one that adds terrain to a movement list.

A **group** in the editor — Ground, Water, Space, Earth, Mars, Celestial bodies,
… — is only a shortcut for ticking many boxes at once. What is stored is always
the explicit list, so redefining a group later can never silently redefine
content authored against it.

## 7. Vision is not a tech

**The map reveals as you advance, whichever track you advance on.** Each era
opens the next notch of the 15-step reveal ladder, automatically and
unconditionally, so vision is never something you can fail to draft. The ten
vision techs that used to exist have been removed.

A notch fires when **any** quadrant reaches its era — the reveal follows your
furthest track, not a nominated one, so a player who pushes Military hard still
sees the map open up:

```
revealEra = max(era of each of the four quadrants)
```

**Tier unlocks are visibility and nothing else.** They are not a general
"free stuff per era" mechanism: anything that granted a unit or a permission
would be a draft pick you didn't have to spend, which is what the draft is for.
The validator enforces it.

## 8. Temples

Every religion tech hangs off **Monotheism or Polytheism**, which are what define
a temple's base yield in the first place. The rest of the line requires one of
them, and each adds to what *every* temple produces — temples are meant to be
stacked.

## 9. Buildings

A **content building** is a placeable that pays out **every tick**, unlocked (and
usually granted) by a progress tech. It carries a **description**, a **placement**
rule list, and a list of **effects** drawn from the building effect kinds — the
same author-a-row-of-effects model techs use, but the effects are *continuous*
(recomputed into tile yields each tick) rather than one-shot.

**A tech GRANTS a building** with `grant_building` (naming a building id): the
player is handed a placement, drops it on a legal controlled tile, and it starts
producing. This is exactly how `grant_unit` works, one tier up. The **Progress**
line is the first fully-built example — Mythology → Shrine, Writing → Library, …,
Dark Matter → Black Hole Station — one economy tech per era granting one building
that pours out :progress:. (The Ascension era deliberately has none.)

**Placement is multi-select.** A building lists every rule that must hold, so
"coastal, and not adjacent to open ocean" is two entries rather than a bespoke
enum member. An empty list means anywhere you control. A non-empty rule list
**overrides the default open-void exclusion**, which is how a Space Telescope or a
Black Hole Station is placed on ground a normal building may not touch.

**A building's area effects are measured from the building.** "All tiles in
range 1" means tiles within 1 of *it*. The effect kinds spell out what varies:
a flat self-tile bonus, a radius bonus (optionally filtered to a terrain or to
tiles with a unit on them), a per-citizen city bonus, or a yield that **grows**
over the run — per wave survived, per nearby unit death, or per era a neighbour
has stood. A building instance therefore carries run state — `builtEra`,
`wavesSurvived`, and an accumulating `deathBonus` — alongside its level.

**The unit-death hook is wider than one building.** `yield_growth_per_nearby_unit_death`
fires whenever **any** unit dies within radius — friend or (optionally) foe, on
either side — so the Gazette banks :progress: off the whole battlefield, not just
its own casualties, and doubles in the New World.

## 10. The content layer

`content.json` holds techs, buildings, wonders and tier unlocks. It is authored
at `/editor.html` (dev server only) and validated against
[`schema.js`](../src/game/data/schema.js).

**A tech is described in WRITING**, with `:token:` markup for icons — "+2
:food:", "grants a :melee: unit". That description is what the player reads.

**What the game RUNS is a short list of effects**, `EFFECT_KINDS` in
[`schema.js`](../src/game/data/schema.js). The registry grows **one entry at a
time**, and the rule that keeps it honest is:

> an effect kind exists in the registry **only in the same change that writes
> the engine case which consumes it** (`GameManager._applyEffect`).

`validateContent` rejects any kind with no case, so the two cannot drift. A row
with no effects is written down and does nothing — which is fine and expected
while the pool is being rebuilt; the editor's **Wired** column is how you see
which is which.

Currently implemented:

| kind | what it does |
|---|---|
| **`unit_atk_base_pct`** | a % of BASE :attack: on every unit — a base modifier |
| **`unit_def_base_pct`** | the same, for :defense: (which is hit points) |
| **`unit_crit_chance_pct`** | +% chance for a unit's hit to crit (double damage) |
| **`unit_speed`** | +combat :speed: on every unit that can move |
| **`grant_unit`** | queues N units of a CLASS to place on the map |
| **`class_def_flat`** | +raw flat :defense: to one class's base (stacks with %-based def) |
| **`class_taunt_range_flat`** | +taunt range for a class (see § Fortifications) |
| **`class_taunt_range_bonus_on_terrain`** | +taunt range while the class stands on a terrain |
| **`retaliate_flat_damage_on_class_attacked`** | attacking the class deals flat damage back |
| **`building_effect_level_bonus_adjacent_to_class`** | buildings adjacent to the class gain effect levels |
| **`class_self_tile_yield_bonus`** | a unit of the class adds +resource to its own tile's yield |
| **`end_of_combat_def_earned_for_class_and_adjacent`** | at combat end, the class + its neighbours earn permanent :defense: |
| **`class_gains_pct_of_commander_effect`** | ⚠️ STUB — inert until commander units exist |
| **`palimpsest`** | at each combat end, recover a random unchosen tech from an earlier era |
| **`grant_building`** | grants a BUILDING (by id) to place on the map (see § Buildings) |
| **`self_tile_yield_bonus`** | +resource on the building's own tile |
| **`radius_tile_yield_bonus`** | +resource per tile in radius (optional terrain / has-unit filter) |
| **`radius_city_yield_bonus_per_citizen`** | +flat, +per-citizen resource to each city in radius |
| **`yield_growth_per_wave_survived`** | +resource for each wave the building survives (resets on raze) |
| **`yield_growth_per_nearby_unit_death`** | permanent +resource per unit death in radius (New-World ×) |
| **`radius_yield_bonus_per_building_age`** | +resource per era each building in radius has stood |
| **`self_yield_bonus_per_distance_to_nearest_building`** | +resource per tile of distance to the nearest other building |
| **`radius_yield_from_other_base_yields`** | each tile in radius gains :progress: = sum of its other base yields |
| **`reposition_range`** | +free reposition distance (see § Repositioning) |
| **`reposition_domain`** | a terrain domain becomes free to cross when repositioning |
| **`reposition_cost`** | cuts the gold cost of repositioning beyond free range |
| **`reposition_teleport`** | reposition distance ignores terrain (straight-line) |
| **`formation`** | +atk/+def per friendly unit in reposition range, at combat start |
| **`road_network`** | raises the gold every connection-route tile earns (see § Road network) |
| **ranged theme (20 kinds)** | poison, preloaded shots, shot chaining, range/placement grants, class-scoped crit, earned-flat atk — see § Ranged |

**Crit is one dial on purpose.** Every unit — player AND enemy — has a base
crit chance (`BASE_CRIT_CHANCE` = 5%); `unit_crit_chance_pct` adds *chance* on top
for player units, summed flat and capped at 100%. The full crit tech line sums to
**95%**, so a player who takes all of it reaches exactly **100%** with the base.
The crit *multiplier* is a fixed engine constant (`CRIT_MULT` = 2×), untouched by
any tech. The palace is not a unit and never crits.

`grant_unit` names a **class**, never a named unit — there is only one unit per
class, and its stat line is read live, so a grant queued before an upgrade still
benefits from it. All nine classes are offerable.

> An earlier version carried a full effect vocabulary — ~16 ops, targets,
> scales, filters, triggers and 50 named rule keys — and all 654 effects were
> encoded against it. It was **removed on purpose**: expensive to author, hard to
> hold in your head, and it forced a decision about every mechanic long before
> any of them were built. The registry above is not that coming back — it holds
> exactly what the engine runs today. **Do not add to it ahead of the code.**
> (The old vocabulary is in git if it is ever wanted.)

## 11. Intrinsic class behaviour is never a tech

Some behaviour belongs to a unit class and is not granted by anything:
fortifications **taunt, never move and never attack**; command units **never
attack** and carry a radius. A tech that appeared to "unlock" that was a
mis-encoding.

Relatedly, **classes are granted, not unlocked**. "Mud Brick" hands you a
fortification; it does not switch fortifications on. Every tech that reads
"unlocks X units" means "grants an X unit".

## 12. Repositioning

Between development and the wave there is a **prep phase** — the clock stops, the
mustered enemy host is on the frontier, and you arrange the board: reposition
units, repair, upgrade. Pressing **Begin Wave** starts the fight.

**Moving a placed unit costs :gold:, scaling with distance** — by default. Every
unit may be hauled anywhere you control, but you pay per tile. A unit must still
end on terrain its class can occupy (naval stays on water).

**Reposition RANGE buys free distance.** With range *R* a unit moves up to *R*
tiles for nothing; past that you pay for each extra tile. Range is 0 without
research — the whole line exists to raise it.

**Reposition distance** is a 0-1 walk over the map: a tile in a granted DOMAIN
("across water", "across space", "across deep space") costs 0 to cross, every
other tile costs 1. Nothing blocks a path — a domain only ever makes a move
cheaper — so galleons make the far coast of an ocean effectively adjacent while
you still land on solid ground. **Teleport** discards the walk entirely: distance
becomes straight-line, ignoring terrain.

**Cost** is `perTile(wave) × (distance − range)`, reduced by Logistics-style
techs (and never to zero). See `costs.js` and `world/reposition.js`.

**Distance is measured from a unit's ORIGIN** — the tile it stood on when prep
began, recorded at `_startPrep` as `unit.repoOrigin`. Cost reflects total
displacement, not the length of the last drag, so nudging a unit one free tile at
a time cannot walk it across the map for nothing; dragging back toward its origin
is free again.

**Formations** read the same range as a combat buff: at the start of a wave, each
unit gains flat :attack:/:defense: for every *other* friendly unit inside its
reposition range. It is the reward for how you *arranged* the board, fixed at
combat start rather than chasing units as they move. The flat is folded into the
base before the percentage lines, so a tight cluster is worth more than it looks.

## 12b. Ranged theme

A cluster of :ranged:-focused mechanics, all combat-time. The engine subsystems:

- **Poison** — a per-unit stack counter on the poisoned unit. On its **own** turn,
  **before it acts**, it takes 1 damage per stack (× `poison_damage_mult`). Stacks
  add across sources and never decay. A ranged hit applies stacks
  (`ranged_poison_apply`); riders slow the target (`ranged_poison_slow`), spread to
  a random adjacent enemy (`poison_spread_on_apply`), or **escalate** — Omniphage
  grows the amount that attacker applies by 5 each time it applies, so a single
  target eats 5, then 10, then 15 on successive hits (`poison_bonus_stacks_on_apply`).
- **Preloaded shots** — a per-unit banked-shot counter, seeded at combat start
  (`ranged_preload_start`, `…_per_adjacent_ranged`) and topped up on a crit
  (`…_on_crit`, but never by a preloaded shot itself) or on an idle turn with
  nothing in range (`…_per_idle_turn`). When the unit fires, it **discharges every
  banked shot as an extra hit** in the same beat.
- **Shot chaining** — after the primary hit, chain to the lowest-HP enemy still in
  range (may repeat) for N more hits (`ranged_chain_flat`), each at **half the
  previous hit's damage** unless `ranged_chain_remove_falloff` is taken. Chains do
  not crit.
- **Range & placement** — flat range (`ranged_range_flat`), +range next to a
  fortification (`ranged_range_bonus_adjacent_fort`), +range per N combats dug in
  (`ranged_range_per_stationary_combats`, reset by repositioning), **infinite** range
  on a terrain (`ranged_range_infinite_on_terrain`), and widening a class's
  placement terrain (`class_placement_terrain_add` — e.g. ranged onto stars). A
  fortification also gains `fort_def_pct_per_adjacent_ranged`.
- **Class-scoped crit & earned stats** — `class_crit_chance_pct` is the universal
  crit dial scoped to one class; `gold_on_class_crit_pct` pays gold on a class crit;
  `unit_atk_earned_on_class_crit` grants **permanent** +atk via the earned-flat slot
  (below).

### The earned-flat attack slot

Attack now has **three tiers** (extending §5's model):

```
atk = ((base + flat) × (1 + base%) + earned) × (1 + ordinary%)
```

`flat` (tech-wide + Formations) folds into the base before the base-% line; the
**earned** flat sits *after* it, before the ordinary-%. It is a per-unit permanent
accumulator kept on the unit instance across combats — distinct from the tech-wide
flat — and is what Marksmanship feeds. **Defence has the same earned slot**, fed by
Defensive Tactics at end of combat.

## 12c. Fortification theme

Fortifications are the wall class: **never attack, never move, and TAUNT**. Taunt is
an intrinsic **range** (base **2**) that pulls enemies onto the wall — an enemy within
a fortification's taunt range heads for it instead of flowing to the palace, and once
in reach must strike it before any other target. Soaking blows is the whole job.

The theme's techs work these levers:
- **flat base :defense:** (`class_def_flat`) — a raw addition to the class's flat slot,
  folded in **before** the base-% so it stacks with %-based def rather than being
  swallowed. This is Masonry → Castles → … climbing the wall's hit points.
- **taunt range** (`class_taunt_range_flat`, and `class_taunt_range_bonus_on_terrain`
  for a terrain-scoped bump like Planetary Defenses in space).
- **retaliation** (`retaliate_flat_damage_on_class_attacked`) — attacking a fortification
  deals flat damage straight back to the attacker; additive across the techs held.
- **earned :defense:** (`end_of_combat_def_earned_for_class_and_adjacent`) — at combat
  end, the class AND its neighbours permanently gain flat def via the earned slot.
- **self-tile yield** (`class_self_tile_yield_bonus`) — a unit of the class adds a flat
  resource to its own tile, the unit twin of a building's `self_tile_yield_bonus`.
- **effect level** (`building_effect_level_bonus_adjacent_to_class`) — see below.

**Placement:** a fortification is a structure and **cannot share a tile with a building**
(every other class can, once buildings exist). It can be placed anywhere its terrain set
allows, widened by `class_placement_terrain_add` like any class.

**A commander rider is stubbed.** `class_gains_pct_of_commander_effect` (Beaconing) is
wired but **inert** — commander units do not exist yet, so there is no aura value to read.

### Effect level — a general building lever

A building's **effect level** scales **all** its effect magnitudes by **+25% per level,
additive**. Effective level = its **paid upgrade level** (gold upgrades) **plus** any
**bonus effect levels** — the two are the same currency, so a bonus level is worth exactly
a paid one. `building_effect_level_bonus_adjacent_to_class` (Castle Towns) grants bonus
effect levels to every building adjacent to a unit of the class. So a Shrine (+3 :progress:)
next to a fortification with Castle Towns runs at level 2 → ×1.25 → +3.75.

## 13. Road network

**Cities connect automatically — no tech required — and every tile ON a
connection route earns +1 base :gold:** (a base modifier, so an outpost on the
route doubles it). Road techs only make the routes richer and grant reposition
range; they do not create the network. A tile on two routes counts once.

Who connects to whom:

- **On the Old World**, a city routes to the **palace** by the shortest land
  path — *unless* another city C′ is both nearer the palace than it is **and**
  nearer to it than the palace is, in which case it routes to every such C′
  instead. (Those hook toward the palace themselves, so everything stays joined
  while hugging the terrain rather than firing spokes from the capital.)
- **On any other landmass** — no palace to root on — a city connects to its **two
  nearest cities on the same landmass**.

Routes are **land only**: controlled, passable, and neither water nor open void
(a celestial-body surface is fine). The topology is global — a new city can
re-route an old one — so the network is recomputed whole whenever cities or
territory change (`world/territory.js` `layConnections`).

`road_network` effects raise the per-tile connection gold; **Maglev**'s rider
also gives each route tile :production: equal to its :gold:.
