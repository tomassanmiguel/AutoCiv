# AutoCiv — Turn-Based Redesign (v5 direction)

> **Status:** design locked, not yet built. This supersedes the idle/tick loop in
> `docs/design.md`. It reuses v4's skeleton (five flavors, palace, cities, hex map,
> auto-resolve combat) and changes the *delivery*: tick → turn, random draft →
> committed research, all-five-win → any-one-ascendancy win, plus real content
> (buildings + unique units, a build menu, permadeath, razing).

---

## 1. Identity

AutoCiv is a **turn-based defense-roguelike**. You grow a civilization on a hex map
while enemy waves march inward toward your **palace**; you win by racing one
**progression flavor** to its **ascendancy tech** before the escalating threat
overruns you.

**The idle pillar is dropped.** Nothing advances on its own — every turn is a set of
decisions. The three surviving pillars: **roguelike** (self-contained runs, permadeath,
death spirals allowed), **tableau-building** (position vs. incursion vector is now the
combat), **escalating threat** (rises with turns elapsed).

Why the change: v4's combat resolved all-at-once off in a battlefield strip, the "build"
half had no buildings, and mid-combat progression interrupted awkwardly. Turns collapse
build + fight + research into one loop; the forecast makes each fight readable; a build
menu + real buildings make the tableau matter.

---

## 2. The turn loop (unified — no prep/combat/resolve split)

One repeating turn. The player acts freely, then ends the turn and everything resolves
in a fixed order:

1. **Player phase** (untimed): spend gold to found cities / build units & buildings /
   repair / reposition units; set or change the active research. React to the forecast.
2. **End Turn →**
   a. **Resolve units** — enemies advance toward the palace and attack what's in reach;
      player units auto-target/reposition/attack (v4 combat, one turn's worth). Deaths
      are permanent; buildings/cities take damage and can be razed.
   b. **Resolve resource gain** — cities harvest food, produce gold (from surroundings)
      and progress (per pop); palace/other income applied.
   c. **Resolve progress** — active research advances by this turn's progress; if it
      completes, the advancement fires (and its ascendancy may win the run). Food
      thresholds resolve → city pop growth.
3. **Forecast** — next turn's enemy spawns are revealed on the map edges (1-turn lead).

There is no separate combat clock and no "development phase." Combat is *always*
happening at the edges; the map **is** the battlefield (the v4 battlefield strip is
removed — enemies spawn on the revealed map's extremities).

---

## 3. Progression — committed research (commit-a-lane)

- **Five flavors** (kept from v4): Expansion, Military, Economy, Science, Culture. Each
  is a ladder of **15 eras** (`ACTIVE_ERAS` 5 → 15). A flavor's final-era tech is its
  **ascendancy**.
- **Win = complete ANY one flavor's ascendancy** (was: all five). This is the core
  strategic fork — pick a lane and rush it.
- **Research is chosen, not drafted.** The player sets **one active research** (a flavor's
  next-era tech). Progress income fills its cost over several turns; on completion it
  fires and you pick the next. Replaces v4's `draftOptions` random 3-card draw.
  - **Flip the weighting:** v4 weighted the draft *toward behind flavors* to stop any
    being stranded — correct for all-five-win, backwards now. Committed research removes
    the weighting entirely; the player decides where progress goes.
  - Progress is still a single pool (`PROGRESS_BASE * TIER_GROWTH^era`); it just fills a
    *chosen* tech instead of triggering a draft. You may re-target research between turns
    (carry-over vs. reset of partial progress is a **TBD** tunable — lean carry-over).
- **Content:** each flavor × 15 eras needs a real tech with real effects (units, buildings,
  city buffs, map reveals, economy multipliers). v4's `advancementFor` placeholders become
  the seed. This is the bulk of the "content overhaul."

---

## 4. Enemies, threat, permadeath

- **Scaling by turns elapsed.** Threat budget is a function of turn number, independent of
  which lane you rush (can't be gamed by under-teching; rewards racing your ascendancy).
  Replaces v4's per-wave budget keyed to `wave`.
- **Spawn + forecast:** enemies appear on the **revealed map's extremities** with a
  **1-turn forecast** (their spawn tiles are telegraphed the turn before). Bigger map =
  more edge = more lead time (see §7).
- **Pathing:** enemies path toward the **palace**, attacking any player unit / building /
  city in their way (keep v4's targeting; make it one-turn-per-step instead of ticks).
- **Permadeath:** a destroyed player **unit is gone** — no post-combat heal-to-full. This
  is the roguelike stakes; combined with §5 cost scaling, losses are recoverable but real.
- **Razing:** enemy attacks damage buildings; at 0 they are **razed** (destroyed).
  Buildings must be **repaired with gold** before then. A razed building frees its tile.

---

## 5. Economy & building

- **Gold** is the action currency: found cities, build units/buildings, repair, (reposition
  is free). Earned from cities' surroundings + empty-lane combat (keep v4's empty-column
  gold idea) + palace.
- **Cost scales with LIVING count of that type.** Your Nth living knight costs more than
  your first; when enemies wipe your knights, the replacements are **cheap again**
  (self-correcting, anti-death-spiral, anti-spam). Wonders opt out (flat huge one-per cost).
- **Build menu:** a proper menu to pick what to place (units, buildings, cities), replacing
  v4's implicit slot flow. Only **researched** types are available.
- **Buildings + unique units are back.** Buildings produce resources / buff / defend / heal
  (port the v4/v2 building ideas as content). **Wonders = very expensive buildings**
  (one-per, flat cost, strong effect — often a flavor's mid/late payoff).
- **Combat stays auto-resolve.** Units auto-target and reposition (v4 system). The player
  never hand-moves units in battle; agency is *what to build, where to place it, what to
  repair, what to research* — all done between turns, informed by the forecast.

---

## 6. Cities & the palace

- **Palace** — the capital and the **only loss condition** (razed = defeat). Central and
  fixed; expansion pushes the edges outward, so it stays the thing everything funnels to.
  Keep v4's palace-as-combat-piece (high HP, attacks nearby enemies).
- **Cities** (founded with gold, `CITY_MIN_SPACING` apart):
  - Produce **1 progress per pop**, each turn → feeds active research.
  - **Harvest food** each turn from surrounding tiles; food fills an **escalating
    threshold** → on crossing, **city pop +1** (threshold rises each time, so growth
    slows). Bigger cities = more progress = faster research.
  - Produce **gold based on surroundings** (tiles in yield radius; `Economy` flavor and
    upgrades raise it).
- **Razing cities = attrition:** each enemy attack that lands on a city **reduces its pop
  by 1**; at **0 pop the city is razed** (destroyed). Losing a city cuts its progress + gold
  income (a real setback, but not a loss — only the palace ends the run).

---

## 7. Map & expansion

- **Map expands by researching the Expansion flavor.** Each Expansion tech reveals more
  of the hex map. Two payoffs: **better tiles** (more/richer terrain to found cities on and
  harvest) and **more lead time** (edges move farther from the palace → forecast + march
  gives more turns to react). Expansion is thus both economy and defense — a legitimate
  ascendancy lane, not just a convenience. (v4 caps reveal at the Islands notch; lift the
  cap and tier it across the 15 eras.)

---

## 8. What stays vs. changes (build map)

**Stays (reuse v4):** hex world/worldgen, five-flavor model, palace + cities as combat
pieces, auto-resolve combat targeting/repositioning, empty-lane gold, upgrade system,
subscribe/getVersion React bridge.

**Changes:**
- `GameManager` loop: replace `prep|combat|resolve` phases + combat clock with the single
  turn loop (§2). Remove the battlefield strip; spawn on revealed edges.
- `progress.js`: `draftOptions` → committed single-research; `allComplete` →
  `anyAscendancy`. Drop behind-flavor weighting.
- `enemies.js`: budget keyed to **turns**, not wave; add 1-turn forecast state.
- Combat: permadeath (no end-of-combat heal); building razing; per-turn stepping.
- New: build menu, living-count cost scaling, buildings + unique-unit content, wonders.
- Cities: food-threshold pop growth, per-pop progress, surroundings gold, attrition razing.
- `config.js` (`ACTIVE_ERAS`): 5 → 15 as content lands.

---

## 9. Open tunables (decide during build, not now)

- Research re-target: carry over partial progress vs. reset (lean carry-over).
- Turns-elapsed threat curve (base, growth, variance).
- Living-count cost curve per type; wonder flat costs.
- Food thresholds & pop-growth curve; city gold-from-surroundings formula.
- Forecast: how much of the incoming host is shown (composition vs. just tiles).
- Whether reposition stays free every turn or is gold/limited.
- Fork vs. in-place: build this as a `v5/` fork (project convention) or rework `v4/`.
