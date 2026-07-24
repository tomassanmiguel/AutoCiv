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
  enemies slain/breached (500-turn cap). Node-sim tested (`sims/combat.mjs`, 11/11).
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

## Content phase (in progress)

Evolving the def files in place (rather than a big-bang wipe) keeps every commit green; the end state
is still the full v2 content set. Progress:

- [x] **Units → v2** (`units.js`): full roster (~55) from `units.md` with the v2 schema (atk/def/range/
  pursuit/cooldown/deploy/move/tech/ability). `unitStats` = +25% atk/level, flat def/range. Combat honors
  range + Siege cooldown. UI shows Range. `baker`/`legionnaire`/`horseman` kept as v1 holdovers until the
  registry reconciliation prunes them. Verified live (v2 units render as player + enemies).
- [ ] **Buildings → v2** (`buildings.js`) — from `buildings.md`/SCALING §10: hp(low) + upgradeTarget;
  per-tick `output` = round(3.5·1.18^E·lateBoost), gold base 5.25, end-of-era lump = 50×; **towers**
  (atk/range); **walls** (blocker def); **traps**/**commands**/**spawners**; terrain base-yields
  (plains→food, forest→progress, mountain→production, sea/space→gold). Two tabs (Military/Civilian).
- [ ] **Economy pass** — legitimacy uncapped + no per-tick legit; drop empty-column unit-gold remnants;
  wire terrain base-yields into `_buildingTickOutputs`; data-drive `_recomputeOutputs`.
- [ ] **Advancement reconciliation** — rebuild the `POOL` + `IMPLEMENTED` registry in `advancements.js`
  to match `PROGRESSION.md` (era/name source of truth). This is what makes the v2 content unlockable
  in-game with the right tech names. Prune v1 holdovers. Do era-by-era; keep every draw resolvable.
- [ ] **Pops/specialists → v2** (`pops.js`): Citizen 1/1/1; gold-upgrade chains (Astrologer→…),
  prefixes (Evolved/Cyborg/Psychic), Priest/Soldier/Replicant. **Specialist gold-upgrade** mechanic.
- [ ] **Policies → v2** (`policies.js`): additive % modifiers, flat adds, combat triggers per `policies.md`.
- [ ] **Wonders** (`wonders.js` new): dedicated slot + one-in-flight gate + N=3-build completion;
    Manhattan Project uses the **Fallout** tile (`public/sprites/tiles/fallout.png`, already staged).
- [ ] **Enemies → v2**: hand-authored roster (atk=breach-legit, def=HP·1.25^E, elites/bosses, per-enemy
  `chip`/behaviours) replacing the transitional draw-from-player-pool host.
- [ ] **New systems:** roster no-replace + version cycling; civilizations + difficulty + pre-game screen.
- [ ] **Combat abilities** (incremental): splash (Siege), pursuit (cavalry/aerial), push/freeze/poison,
  legit-scaling atk (Warrior Monk/Zealot), line/multi hits — flags already on the unit defs.
- [ ] **Verify** each PROGRESSION entry to spec; expand `sims/`.

Tip: DELEGATE independent per-era/per-category data generation from the docs in parallel, then integrate.

## Notes
- The `occupant` shim (Tile.js) is the bridge; remove it once placement + all render/econ paths use
  `unit`/`building` directly.
- Validate model logic with headless node sims in `sims/` (e.g. `node sims/combat.mjs`) before/along UI.
- Stacked % modifiers are ADDITIVE per resource (sum then ×(1+total)), never chained.
