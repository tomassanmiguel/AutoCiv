# v2 Implementation Tracker

Strategy (per the user): **implement the new mechanics slice by slice → wipe v1 content → re-add v2
content batch by batch.** Each slice is its own commit; keep `npm run build` + `eslint` green; validate
model logic with headless node `sim_*.mjs`. Docs (`PROGRESSION.md` = era/name source of truth; the
per-item docs = stats/effects) are the spec.

## Mechanics slices

- [x] **1. Tile model** — `Tile` holds `unit` + `building` + `underlay` simultaneously; transitional
  `occupant`/`underlap`/`city` getter/setter shim keeps v1 code running. *(build green)*
- [x] **2. Turn-based combat** — `combat.js` is now a discrete turn engine: player towers strike the
  lowest-HP enemy in Manhattan-diamond range; enemies march down one tile/turn, chip a blocker in the
  path (unit→building) for a flat 1, or breach off the bottom (−atk legitimacy). Ends when all
  enemies slain/breached (500-turn cap). Node-sim tested (`scratchpad/sim_combat.mjs`, 11/11).
- [x] **2b. Enemy rendering** — enemies render at `(row,col)` on the unified grid (`i = enemyRows +
  maxRow − row`), preview in the battlefield backdrop, march down with the FLIP slide. TickCounter
  shows enemies-remaining.
- [ ] **1b. Placement dual-slot** — the `occupant` setter shim ALREADY routes unit→`tile.unit`,
  building→`tile.building`, so data coexistence works. Remaining: `_canPlaceHere`/`placementState`
  should treat unit and building slots independently (a building isn't a "replace" over a unit and
  vice-versa). **Best done AFTER the content wipe** simplifies the city/extras/underlap paths.
- [ ] **3+4. Enemy content + economy** — folded into the content phase below (both entangle with v1
  content that's about to be wiped): hand-authored enemy roster (atk=breach-legit, def=HP·1.25^E,
  elites/bosses, per-enemy `chip`/behaviours); legitimacy uncapped + drop per-tick legit; flat terrain
  base-yields for buildings (plains→food, forest→progress, mountain→production, sea/space→gold).

## Content phase (the bulk — start here next)

Order that keeps each commit green + runnable:
1. **Define v2 def shapes** (schema) then **wipe to a minimal seed** — reduce units.js/buildings.js/
   pops.js/policies.js + advancements `IMPLEMENTED` to a tiny clean set (Warrior + Citizen + 1–2
   buildings) with v2 fields (`range`, `chip`, terrain-yield, tower `attack`, wonder `N`, etc.); strip
   the v1 ability hooks in GameManager/combat that reference wiped keys. One commit, build green.
2. **Re-add content batch by batch** from `PROGRESSION.md` (era/name source of truth) + per-item docs
   (`units.md`/`buildings.md`/`specialists.md`/`policies.md`/`wonders.md`) using SCALING.md formulas.
   Wire the advancement→unlock registry (`IMPLEMENTED`). **DELEGATE** per-era or per-category data
   generation in parallel (independent files) then integrate. Manhattan Project → new **Fallout** tile
   (`Sprites/Map Tiles/Fallout.png`; copy to `public/sprites/tiles/fallout.png`).
3. **New systems:** Wonder slot + one-in-flight gate + N-build completion; roster no-replace + version
   cycling; specialist gold-upgrade chains; civilizations + difficulty + pre-game screen.
4. **Verify** each PROGRESSION entry is implemented to spec; sim-test combat/economy.

## Notes
- The `occupant` shim (Tile.js) is the bridge; remove it once placement + all render/econ paths use
  `unit`/`building` directly.
- Validate model logic with headless node `scratchpad/sim_*.mjs` before/along UI.
- Stacked % modifiers are ADDITIVE per resource (sum then ×(1+total)), never chained.
