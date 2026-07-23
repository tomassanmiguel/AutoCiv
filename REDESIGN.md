# AutoCiv — Combat & Systems Redesign (v2)

> **Status:** DESIGN — locked decisions below. Not started in code.
> **Blocked on:** the user is authoring the content spec (enemy roster + full progress tree
> + civilization list). Implementation resumes once that lands.
> **Rationale:** the current combat (fixed-duration, cooldown/column, symmetric enemies drawn
> from the player pool) tested as too dry. v2 makes combat a **turn-based tower defense** —
> asymmetric, spatial, and strategic.

This doc captures the decisions made so far so we can resume cold. It is a planning artifact,
NOT the live spec — `CLAUDE.md` remains the source of truth for what's actually in the code.

---

## 1. Combat — turn-based tower defense

**Turn engine.** Combat is discrete turns (no fixed duration, no 50ms accumulator, no cooldown
timers as "time until ready"). Each turn, all combatants act once, processed **bottom-to-top,
left-to-right**. Combat ends when **all enemies are slain OR all remaining enemies have reached
the bottom** (marched off the grid).

**Enemies** (asymmetric, hand-authored — NOT drawn from the player pool):
- Each has a **damage** value and a **health** value. Unique behaviours + bosses.
- They **march down one tile per turn** toward the tableau (down the shared grid).
- **Unimpeded** → move straight down one tile.
- **Impeded** (a blocker in the tile directly below) → they **stop and deal a flat 1 damage/turn**
  to the blocker (NOT their damage stat). They must grind through everything in the lane.
  - On a tile holding **both** a unit and a building, the enemy **chips the unit first, then the
    building**.
  - Blockers have a **defense/HP** value, kept **relatively low** → a few turns to break through.
- Enemies have **no targeting of their own** — they only ever chip whatever is directly in their
  path. They never shoot the backline.
- **Reaching off the bottom** → reduce **legitimacy** by the enemy's **damage** value, then the
  enemy is removed.

**Player units & buildings** (the towers):
- Have **range**, **damage**, and **defense**. Defenses are **much lower** than today; most
  buildings die in a hit or two.
- On their turn, if an enemy is in range, they **strike the lowest-HP enemy in range**.
- **Range is a Manhattan diamond**: a tile is in range if `|Δrow| + |Δcol| ≤ range` (orthogonal;
  diagonals cost 2).
- **Buildings do not attack by default** — only a designated few ("towers") have an attack/range
  stat.
- A blocking unit both **takes** the enemy's 1/turn chip AND **attacks** on its own turn.

**Open (content-spec) details:** targeting tie-break among equal-lowest-HP enemies; default range
per role; which buildings are towers and their stats; enemy per-type behaviours/boss patterns.

---

## 2. Tile model

A tile may simultaneously hold **1 unit + 1 building + 1 underlay** (road / city / booster).
- Today `Tile.occupant` is a single unit-XOR-building slot → must **split into `tile.unit` +
  `tile.building`** (the underlay slot already exists as `tile.underlap`/`tile.city`).
- Rendering: **units show combat stats in brief, buildings show output in brief**, otherwise just
  names; **hover gives full detail**.
- Both the unit and the building on a tile act as blockers (see impediment order above).

---

## 3. Economy & legitimacy

- **Units no longer produce gold by default** (empty-column gold is gone with the combat rewrite).
  Surviving gold sources: Trader-type specialist, Mint/Market-line, Bank, Merchant Navy, etc.
- **Legitimacy is UNCAPPED and has NO per-tick production** (reversal of the earlier hard-100 cap).
  It is a *stock you invest in*: gained only via discrete events — completing legitimacy buildings
  (Shrine +10 … Elysium +50), end-of-era effects (Cathedral, Stonehenge, Priest), and policies
  (Theocracy, Organized Religion) — and *leveraged* by legitimacy-scaling buildings/wonders
  (Elysium gold = legitimacy, Monastery progress = legitimacy/20, Hagia Sophia). Every increase must
  be earned, so it stays scarce.
- **Terrain base yields for buildings** — any building gains a per-tick base yield from its terrain:
  - **Plains → food, Forest → progress, Mountain → production, Sea/Space → gold.**
  - Plus **terrain-dependent buildings** (require/prefer a terrain, extending the existing
    `placement` class system).

---

## 4. Roster — no replacement

**Units & buildings:** unlocking never replaces. A class keeps **every unlocked version**; at build
time you **pick any version** (the newest is the default — e.g. Spearman shown by default, but you
can still build a Warrior). Implemented as a per-class version history + a build-time toggle.

**Specialists:** a **gold-paid, one-way upgrade chain** (e.g. Astrologist → Scholar raises output;
you spend gold to convert that pop type up a tier). An upgrade, not a free toggle.

---

## 5. Wonders (new)

A civ game needs wonders. New mechanic — risk/reward production sink:
- A dedicated **Wonder building slot**. Wonder progressions unlock something there.
- **Only one wonder in flight at a time:** wonder progressions are **not offered while one is
  unlocked-but-unfinished** ("queued" = unlocked but not yet complete). The gate **clears only when
  the wonder is finished.**
- Placing the wonder on the map **starts** it but does not finish it — it requires **N additional
  production-builds** to complete, and does **nothing until complete**. You sacrifice several
  productions, so the payoff must be worth it.
- **If an enemy sacks the wonder, it must be restarted from scratch** (progress lost).

**Open:** does an incomplete wonder occupy/block its tile (assume yes — it's a placed building and a
blocker); N per wonder (content); whether a *completed* wonder that's destroyed also fully restarts
(assume yes).

---

## 6. Civilizations, difficulty & pre-game flow (new)

- Before a run: a **pre-game screen** to pick a **civilization** and a **difficulty**.
- **Civilizations** have distinct starting conditions: often a **marquee policy**, plus a **special
  starting unit or building**, and **unique progressions always offered at the first available time**
  (guaranteeing a signature unit/building/specialist/policy path).
- **Difficulty** scales enemy stats/count.
- **Seed generation moves to after civ selection** (so the run seed is chosen at the pre-game screen,
  keeping determinism intact).

---

## 7. What survives vs. what's rewritten

**Reusable as-is / lightly:** the framework-free model + `useGame` bridge; the whole **development/
tick economy**; tableau camera + grid; the **FLIP slide animation** (already animates cards between
cells → drives marching enemies); the **combat-event/juice pipeline** (`_pushEvent`/`combatEvents`/
`CombatFx`); `_adjacentTiles`/`_reachableWithin`; `_syncUnitStats` scaffolding; `_damageLegitimacy`;
end-of-combat economic effects; screens/audio infra; the advancement **selection UI** (trigger +
cards).

**Rewritten / new:** `combat.js` core (turn engine, enemy movement, impediment, range targeting, end
conditions); `enemies.js` (hand-authored uniques + bosses + difficulty scaling); the tile-slot split;
the roster/version model (removes the `choose→confirm→replace` stages); legitimacy cap + gold cleanup;
terrain yields; wonders; `civilizations.js` + pre-game screen + init hooks. **All existing unit /
building / policy content is replaced** to live in the new world.

---

## 8. Implementation sequencing (when we resume)

1. **This doc → a full design spec** once the content spec (enemies / progress tree / civs) lands.
2. **Tile-model split** (`tile.unit` + `tile.building` + underlay) — self-contained, node-sim tested.
3. **Turn engine + enemy movement + range targeting** — validated headless (node sims) before UI.
4. **Enemy content + bosses + difficulty scaling.**
5. **Economy pass** — legitimacy hard cap, gold cleanup, terrain yields, wonders.
6. **Roster** — no-replace, unit version toggle, specialist gold-upgrade chains.
7. **Civilizations + pre-game selection screen.**

Steps 2–3 are the make-or-break core; 4–7 are largely additive.

---

## 9. Still needed from design (the user is authoring)

- **Enemy roster** — per-type stats (health, damage), behaviours, and bosses.
- **Full progress tree** — the new units / buildings / policies / specialists / wonders, with the
  new stats (range, damage, low defenses, terrain-dependence).
- **Civilization list** — each civ's marquee policy, starting unit/building, and unique progressions.
- **Difficulty tiers** — how much they scale enemies (and whether count and/or stats).
