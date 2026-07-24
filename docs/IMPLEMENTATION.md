# v2 Implementation Tracker

Strategy (per the user): **implement the new mechanics slice by slice → wipe v1 content → re-add v2
content batch by batch.** Each slice is its own commit; keep `npm run build` + `eslint` green; validate
model logic with headless node `sim_*.mjs`. Docs (`PROGRESSION.md` = era/name source of truth; the
per-item docs = stats/effects) are the spec.

## Mechanics slices

- [x] **1. Tile model** — `Tile` holds `unit` + `building` + `underlay` simultaneously; transitional
  `occupant`/`underlap`/`city` getter/setter shim keeps v1 code running. *(build green)*
  - [ ] 1b. Migrate placement (`_canPlaceHere`/`placementState`/`_createInstance`) to route units →
    `tile.unit`, buildings → `tile.building` (allow both on a tile); render both.
- [ ] **2. Turn-based combat** — replace `combat.js`'s 50ms time-loop with a discrete turn engine:
  - Enemies live on the shared grid at `(col, y)` and **march down one tile/turn** (y→bottom); off the
    bottom = **breach** → `_damageLegitimacy(enemy.atk)` then remove.
  - Turn order bottom-to-top, left-to-right. Each turn: player pieces act, then enemies act, then check end.
  - Player piece acts: attack the **lowest-HP enemy within Manhattan-diamond `range`** (deal `atk` to its HP).
  - Enemy acts: if a blocker (unit before building) sits in the tile below, deal the **1/turn chip**
    (per-enemy overrides later); else march down one tile.
  - End when **all enemies dead OR all breached**. Reuse the `_pushEvent`/`combatEvents` juice pipeline
    and the FLIP slide (Tableau) for marching.
- [ ] **3. Enemy model** — rewrite `enemies.js`: hand-authored `ENEMY_DEFS` (atk = breach-legit, def =
  HP), `def·1.25^E` HP scaling, HP-budget wave gen, 5% elites (×2 stats), pathing rules, bosses.
- [ ] **4. Economy** — legitimacy **uncapped + no per-tick production** (gains only from building
  completion / end-of-era / policies); flat terrain base-yields into `_buildingTickOutputs`; drop the
  empty-column unit-gold.

## Content (after mechanics)

- [ ] Wipe v1 `game/data/` content (units/buildings/policies/advancements IMPLEMENTED/etc.).
- [ ] Re-add v2 content batch by batch from the docs (data files: units.js, buildings.js, specialists.js,
  policies.js, wonders.js, enemies.js, terrain yields, and the advancement→unlock registry from
  `PROGRESSION.md`).
- [ ] Roster: no-replace + version cycling + specialist gold-upgrade; pre-game civ + difficulty screen.

## Notes
- The `occupant` shim (Tile.js) is the bridge; remove it once combat + placement + rendering all use
  `unit`/`building` directly.
- Combat rewrite is the big one — do the engine as a model first (node-sim tested) before wiring render.
