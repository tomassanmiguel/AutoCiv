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

- `content.activeEras = 3`. The other twelve eras are designed but their content
  is **parked in `content.backlog`** — nothing is deleted, and the editor's
  Backlog tab restores a row into scope one at a time.
- In scope: **43 techs · 10 buildings · 5 wonders · 3 tier unlocks.**
  Parked: 244 techs · 37 buildings · 39 wonders · 12 tier unlocks.
- Iron is the terminal era for now, so nothing advances out of it and it carries
  no threshold.

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

## 2. Four independent tracks

Society, Technology, Economy and Military each carry **their own era**, and each
advances on its own clock. You may be drafting Medieval military while your
economy is still in Iron.

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

A tech may `exclude` others: taking one bars the rest for the run. Both halves of
an exclusive choice **must sit in the same quadrant and the same era**, or the
choice is never actually offered.

## 3. What each resource threshold does

| resource | on crossing a threshold |
|---|---|
| **:food:** | **Expands automatically.** No prompt: the highest-yield available outpost is created, pushing your borders outward. |
| **:production:** | **Prompts you to found a city** — *unless* you are holding an undrafted wonder, in which case you build the wonder instead. |
| **:progress:** | Offers 3 advancements from the four current pools. |

City founding **no longer depends on food**. Food buys ground; production builds
on it.

## 4. Wonders are drafted techs

A wonder appears in the advancement offer like any other card, with an era and a
quadrant. Taking one does not build it — **the next :production: threshold builds
it instead of a city**, and you place it on the map.

**You are never offered a wonder while you already hold an unbuilt one.**

Wonders keep their tier (I–IX) as a grouping and a rough power band.

## 5. Yields

```
final = base × (1 + Σ percentage bonuses)
```

**Percentages are ADDITIVE, never compounded.** Two +100% bonuses triple the
base; they do not quadruple it. A flat "+N to base yield" raises `base` *before*
the multiplier, which is what makes flat bonuses worth more than they look.

### Everything stacks. Nothing replaces.

Two techs that touch the same quantity **both apply**. Bronze Working (+3), Iron
Working (+6) and Steel (+12) leave a unit at **+21 attack**, not +12. Masonry,
Castles, Star Forts and Magnetic Deflectors leave a fortification at **+75
defence**. There is no tier system anywhere.

The brief's own wording is the tell: it says *"increases all unit atk by 3"*,
which is additive language. A tech that overwrote an earlier one would have had
to say *"sets"*.

The one narrow exception is per-effect: `stacks: false` stops a **repeating
trigger** from accumulating — "after every combat, permanently +1" would grant
+1 once instead of +1, +2, +3. It defaults to **true**, and it has nothing to do
with the rule above.

- **Rural tile** — controlled, with no outpost and no city.
- **Outpost** — a settled tile. Its yield is multiplied (×2 to start; Feudalism
  and Quantum Logistics add to that factor). **Outposts have no citizens.**
- **City** — has a population of citizens. "Adjacent outposts or citizens" means
  *number of adjacent outposts + total population of adjacent cities*.

## 6. Units: one per class

There is **no ladder of named units**. Each class has a single stat line, and
techs raise it — every unit of that class already on the board improves with it.
**"Create a melee unit" means place one more melee unit on the map**, at whatever
the class currently is.

The nine classes, with **placeholder** starting values (balance replaces these):

| class | atk | def | range | speed | notes |
|---|---|---|---|---|---|
| melee | 7 | 22 | 1 | 1 | Slow, but strong |
| ranged | 6 | 12 | 2 | 0 | Least defence and damage |
| cavalry | 8 | 16 | 1 | 2 | Fast, not as strong |
| fortification | 0 | 60 | 0 | 0 | No attack; taunts |
| siege | 20 | 18 | 3 | 0 | Slow attacks, **blast radius 1** |
| naval | 10 | 28 | 2 | 2 | Water access |
| aerial | 12 | 22 | 1 | 4 | Very fast; planet-bound until unlocked |
| astral | 14 | 26 | 3 | 2 | Space only |
| command | 0 | 24 | 0 | 1 | No attack; **command radius 2** |

`def` is hit points.

## 7. Vision is not a tech

**The map reveals as the Technology track advances.** Each technology era opens
the next notch of the 15-step reveal ladder, automatically and unconditionally,
so vision is never something you can fail to draft. The ten vision techs that
used to exist have been removed.

This is the model for **tier unlocks** generally: reaching an era in a quadrant
grants something automatically, without spending a draft pick.

## 8. Temples

Every religion tech hangs off **Monotheism or Polytheism**, which are what define
a temple's base yield in the first place. The rest of the line requires one of
them, and each adds to what *every* temple produces — temples are meant to be
stacked.

## 9. Buildings

**Placement is multi-select.** A building lists every rule that must hold, so
"coastal, and not adjacent to open ocean" is two entries rather than a bespoke
enum member. An empty list means anywhere you control.

**A building's area effects are measured from the building.** "All tiles in
range 3" means tiles within 3 of *it* — encoded as `filter: within_radius` with a
`radius`. This is the opposite of `in_range_of`, which means the *subject* is
near something else, and getting the two backwards is the single most common
authoring error.

## 10. The content layer

`content.json` holds techs, buildings, wonders and tier unlocks. It is authored
at `/editor.html` (dev server only) and validated against
[`schema.js`](../src/game/data/schema.js).

Effects are **fully structured — no prose fallback.** Effects that are genuinely
bespoke behaviour use `op: 'rule'` with a key from a closed enum; that enum is
also the engine's work queue.
