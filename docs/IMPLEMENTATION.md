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
- [x] **Buildings → v2** (`buildings.js`): +50 v2 building defs from `buildings.md` with the v2 schema
  (era/tech/types/placement/hp/upgradeTarget/output/range/special/effect). Data-driven **economy engine**
  (`buildingTickAmount`/`buildingOutputs` + `_buildingTickOutputs`/`_accrueBuildingOutputs`) processes
  generic `def.output` {res,amount,when:'tick'|'eraEnd'} with +25%/level. Verified `sims/economy.mjs` 4/4.
  Remaining building work: **terrain base-yields** (plains→food, forest→progress, mountain→production,
  sea/space→gold) into `_buildingTickOutputs`; wall/tower/trap/command/spawner/power/legit-leverage/
  proportional/growth/convert effects (tagged by `special`); exotic-terrain placement classes
  (mountain/space/asteroid/exoplanet/star/singularity/deepspace/moon) + new slot categories
  (trap/command/spawner/wall/support) in `slots.js`.
- [x] **Economy pass** — DONE: legitimacy uncapped + no per-tick legit (Temple retuned); legit-on-complete
  + legit-leverage; empty-column unit-gold gone; **flat terrain base-yields** for buildings (econYield in
  the TERRAIN registry, folded into `_buildingTickOutputs`).
- [~] **Slots** — walls now buildable via the existing **Defense** slot (Mud Brick→Stone→Castle→Shield
  Matrix). REMAINING: Military/Civilian tab split in UIPanel to slot trap/command/spawner/support
  (currently filler); their placement classes (mountain/space/asteroid/…) too.
- [x] **Unit-death triggers** — Burial Rites→progress, Nationalism→gold, Cosmic Myth→+1 legit (`_onUnitDeath`).
- [ ] **Advancement reconciliation** (NEXT — the big unblock) — rebuild `POOL` + `IMPLEMENTED` in
  `advancements.js` to match `PROGRESSION.md`. Now easy: every UNIT_DEFS/BUILDING_DEFS/POP_TYPES/
  POLICY_DEFS entry carries `tech`, so build a `tech → { kind, key }` map by scanning the four
  registries (units→unit, buildings→building, pops→pop, policies with slot!==false→policy, slot===false
  →modifier/bonus). Rebuild POOL era buckets from PROGRESSION headers; wire IMPLEMENTED = that map.
  Prune v1 holdovers (baker-unit/legionnaire/horseman, shaman/philosopher/poet, brewery/totem/mine/…).
  Handle name/tech mismatches (e.g. Branding→Metallurgy-policy). Keep every draw resolvable + green.
- [x] **Pops/specialists → v2** (`pops.js`): Citizen 1/1/1; the four gold-upgrade chains + special pops
  (Priest/Soldier/Replicant); prefixes wired. **Specialist gold-upgrade mechanic DONE**
  (`specialistUpgradeInfo`/`upgradeSpecialistChain` + PopCard ▲ button; round(15·1.18^E)/pop, one-way).
- [x] **Policies → v2** (`policies.js`): 105 policy+bonus defs with structured effect fields; generic
  `outputPct`/`totalGoldPct` %-engine wired in `_recomputeOutputs`. Remaining: wire the other structured
  families (doctrine/citizenOutput/specialistOutput/thresholdMult/legitPerEra/goldInterest/unitDeath/
  ticksPerEra/policySlots/unitAtkPct/def-bonuses/…) + the ~40 `special`-tagged effects; display via
  `policyEffect()`. **Every def now carries a `tech`** → the registry can be AUTO-GENERATED from defs.
- [x] **Wonders data** (`wonders.js`): 20 wonder defs (era/tech/footprint/placement/special/effect) +
    `WONDER_BUILDS=3` + `wonderForTech()`. Manhattan Project → `special:'nuke_and_fallout'` (Fallout tile,
    staged). Remaining: the Wonder **slot** + one-in-flight gate + N-build completion mechanic (systems pass).
- [x] **Registry annotations** — every wireable def now carries `tech`+`era` (units/pops/policies/
    wonders + the 15 carry-over buildings + 13 carry-over policies). Unblocks the auto-gen below.

- [x] **Advancement registry AUTO-GENERATED** (`advancements.js`) — scans all def registries by `tech`+`era`
  → 351 advancements, 301 implemented (58 units / 53 buildings / 24 specialists / 101 policies / 65 bonuses).
  Gated categories (wall/trap/command/spawner/support + wonders) draw as filler. `_applyModifier` applies
  v2 bonus fields (thresholdMult/instantBuilds/def-bonuses/ticksPerEra). `sims/registry.mjs` (6 checks, 0
  softlocks). **VERIFIED LIVE**: the Progress! selection shows correct v2 cards (Bartering→Trader +6 gold,
  Pottery→Kiln, Midwivery→policy). v2 content is now UNLOCKABLE in-game per PROGRESSION.md.

### Registry auto-gen design (DONE — see above; kept for reference)
1. In `advancements.js`, scan `UNIT_DEFS`/`BUILDING_DEFS`/`POP_TYPES`/`POLICY_DEFS`/`WONDER_DEFS` for
   `{tech, era, key}` → build `IMPLEMENTED[tech] = { kind, key, eraIndex, description }`. kind =
   unit / building / pop / policy (`slot!==false`) / modifier (`slot===false`) / wonder. First-wins on
   tech conflicts (dev `console.warn`).
2. **Gating (avoid breaking unlock):** only wire a building if `types[0]` is an existing slot category
   (progress/production/food/gold/legitimacy/defense/utility) — SKIP wall/trap/command/spawner/support
   until `slots.js` + UIPanel tabs get the v2 categories. SKIP `wonder` (no wonder slot yet) and decide
   on `modifier` (needs a generic `_applyModifier` for structured bonus fields — thresholdMult/
   ticksPerEra/policySlots/instantBuilds/… ; wire the easy ones, gate the rest).
3. Derive `POOL[eraId]` = tech names of all wired defs grouped by era; derive `ADVANCEMENTS`.
4. Verify: a sim that walks eras 0→10 and asserts every owed progress/production choice resolves without
   throwing; load the game and confirm early-era unlocks work.
5. **Slot reconciliation** (parallel task): add v2 building categories (wall/trap/command/spawner/support)
   to `slots.js` + the Military/Civilian two-tab split in UIPanel, so the gated buildings can wire.
- [x] **Enemies → v2** (`enemies.js`): hand-authored `ENEMY_DEFS` (26 ordinary + 3 bosses) with base
  atk(breach)/def(HP)/chip/special tags; budget-based `generateHost` (waveBudget 40·1.3^E·difficulty,
  HP ×1.25^E, breach atk +E, 5% elites ×2, bosses excluded). Combat reads per-enemy chip; TileCard
  resolves ENEMY_DEFS. Verified live (Thrall/Raider/Marauder render, no errors) + sim TEST 9.
  REMAINING: the ~24 enemy `special` abilities (heal/pathing/spawn/ranged-chip/pierce/split/teleport/
  self-destruct/…), multi-tile bosses (Titan 2×2, Flagship 4×2, Azazoth row-span), scripted waves,
  difficulty selection.
- [ ] **New systems:** roster no-replace + version cycling; civilizations + difficulty + pre-game screen.
- [x] **Policy/bonus effect wiring** — economy: `_activeEffectDefs()` (policies + `civ.bonuses`),
  generalized `popOutput` (citizenOutput/specialistOutput/popOutputFlat + Evolved/Cyborg/Psychic
  prefixes w/ robot exemption), `%`-loop over both; end-of-era (legitPerEra/goldInterest/
  endEraGoldFromLegit + Priest); building legit (legitOnComplete + Monastery/Elysium leverage).
  Combat: additive unit atk% (Steel/Composites/Liminite/Antimatter) + category doctrines (Bushido/
  Compound Bow/…) in `_syncUnitStats`; policy buildingDefBonus (Reinforced Construction). Verified
  by sims/economy (12) + sims/combat (20). **Remaining effect wiring:** unitDeath triggers
  (Nationalism gold / Cosmic Myth legit), Fascism/Adaptive combat ramps, wonderYield/mercLevels/
  repair-upgrade cost mults, terrainDouble, and the ~40 `special`-tagged effects.
- [ ] **Combat abilities** (incremental): splash (Siege), pursuit (cavalry/aerial), push/freeze/poison,
  legit-scaling atk (Warrior Monk/Zealot), line/multi hits — flags already on the unit defs.
- [ ] **Verify** each PROGRESSION entry to spec; expand `sims/`.

Tip: DELEGATE independent per-era/per-category data generation from the docs in parallel, then integrate.

## Notes
- The `occupant` shim (Tile.js) is the bridge; remove it once placement + all render/econ paths use
  `unit`/`building` directly.
- Validate model logic with headless node sims in `sims/` (e.g. `node sims/combat.mjs`) before/along UI.
- Stacked % modifiers are ADDITIVE per resource (sum then ×(1+total)), never chained.
