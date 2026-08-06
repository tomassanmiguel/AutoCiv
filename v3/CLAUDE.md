# AutoCiv v3 — Project Guide (WIP)

> ## 📐 THE DESIGN DOCS ARE THE SOURCE OF TRUTH — NOT THE CODE
>
> [`docs/design.md`](docs/design.md) describes how AutoCiv is *meant* to work.
> **Where the code disagrees with it, the code is wrong** — behind, or a bug.
> Never edit the design doc to match an implementation.
>
> Precedence, highest first:
> 1. [`docs/design.md`](docs/design.md) — the current design
> 2. [`docs/design-brief.md`](docs/design-brief.md) — the designer's verbatim
>    original; still authoritative for what an individual tech does
> 3. [`src/game/data/content.json`](src/game/data/content.json) — the content layer
> 4. the code
>
> [`docs/open-questions.md`](docs/open-questions.md) tracks what is still undecided.
> **This file (CLAUDE.md) describes what is BUILT**, which is a different thing
> and currently lags the design considerably.
>
> ### 🔬 Current scope: Stone · Bronze · Iron, six waves
> The content layer is pruned to a **microcosm** — `content.activeEras = 3`. The tech
> and building pools were **cleared to empty on purpose** and are being rebuilt **one
> wired tech at a time**: a tech goes in only once the engine can run its effect.
> 385 designed rows are **parked in `content.backlog`** (nothing deleted; the editor's
> Backlog tab restores them). Widening the era range should be a **data** change.
>
> In play: **70 techs** · **14 buildings** · 5 wonders · 3 tier unlocks.

> **Status: PLAYABLE PROTOTYPE.** The whole loop runs end to end — map, the two clocks,
> territory economy with **automatic :food: expansion** and **auto-wiring city connections**,
> :production: cities and wonders, a **three-branch draft** off `content.json`, unit/building
> placement, a **prep phase** with **gold-priced repositioning**, and a **wave** with razing
> and permanent casualties. `node sims/campaign.mjs 6` plays it headlessly.
>
> ⚠️ **The early pools are still thin.** Military (Obsidian/Leatherwork/Formations) and
> Economy (Roads) have a little in-slice; Society has none. Most of the reposition/road line
> sits at eras past the 3-era slice, wired but not yet reachable. The campaign sim prints how
> far each branch got.
>
> **Balance is not tuned** past the measured six-wave slice.
>
> This file is the source of truth for v3. The root `../CLAUDE.md` describes **v2** (square
> grid, legitimacy, specialists, policies) — most of it does **not** apply here. Keep this
> file accurate, tight, and minimal; **delete and correct** as much as you add.

---

## What v3 Is

Same premise as before — an idle/roguelike civilization builder — but rebuilt around a
different core:

- **A radial hex world.** One big map, centred on your **palace**. Enemies arrive from the
  outer ring and march inward; if the palace falls, the run ends. (Legitimacy is gone.)
- **Territory is the economy.** Terrain yields directly: **plains → :food:, forest →
  :progress:, hills → :production:, water → :gold:**; desert and tundra yield nothing;
  **mountains are impassable**. You spend food to claim tiles, growing wide (more land, more
  perimeter) or tall (cities that multiply their surroundings).
- **Production builds wonders and fortifications**, not a stream of ordinary buildings —
  buildings and unit classes come from the tech tree, roughly one of each.
- **Progress is a roguelike draft** — three cards from your branches' current eras. What you
  skip is gone, so builds diverge by what you passed up as much as by what you took.
- **Enemy encampments** are scattered across the map and reinforce every wave until your
  borders reach them — the main pull to expand.

Only what is described under **Implemented** below is real in code. Everything else is
design intent recorded so the next reader knows where this is heading — **do not treat it
as built.**

---

## Running

Double-click **`AutoCiv.cmd`** in the repo root: it frees the port, starts the
dev server and opens the game. Or by hand:

```bash
cd v3
npm run dev                  # Vite dev server (5174) — the game
                             #   http://localhost:5174/           the game
                             #   http://localhost:5174/editor.html the content editor
npm run build                # builds BOTH entries
npm run lint
node sims/worldgen.mjs 200   # headless worldgen regression + map dump
node sims/campaign.mjs 6     # play 6 WAVES across 5 seeds — the balance + content instrument
```

`sims/progress.mjs` (web structure), `sims/economy.mjs` (wide-vs-tall expansion sweep)
and `sims/endgame.mjs` were **deleted**: they measured the radial web and the
settle-vs-city expansion choice, and neither exists any more — :food: expansion is
automatic, so there is no strategy to sweep.

The v3 preview config is `autociv-v3-dev` in the repo-root `.claude/launch.json` (port
5174, so it can run alongside v2 on 5173).

---

## Layout

```
v3/
├── index.html · vite.config.js · eslint.config.js
├── public/
│   ├── sprites/tiles/*.png     # 24 terrain tiles (incl. hills, desert, tundra, full-coast)
│   ├── sprites/{icons,ui}/     # resource/stat icons, 9-slice frames, silhouettes
│   ├── music/title.ogg         # title track only — in-game music is cut for now
│   └── logo/
├── sims/worldgen.mjs           # headless generation sweep + invariant report + ASCII map
├── sims/campaign.mjs           # the WHOLE loop headlessly: waves, gold, survival, branch reach
├── editor.html                 # second Vite entry — the content editor
└── src/
    ├── App.jsx                 # screen router: loading → title → pregame → game
    ├── editor/                 # the content editor (a TOOL, not part of the game)
    ├── screens/                # LoadingScreen · TitleScreen · PreGameScreen (civ select)
    ├── game/                   # framework-free model (no React imports)
    │   ├── GameManager.js      # world + known-world stage + subscribe/version bridge
    │   ├── hex/coords.js       # ALL hex geometry: neighbours, distance, ring, disc, pixel, bfs
    │   ├── world/
    │   │   ├── regions.js      # concentric band radii, embedded bodies, reveal ladder
    │   │   ├── terrain.js      # terrain registry: sprite, domain, passable, yield
    │   │   ├── noise.js        # seeded rng + fBm value noise
    │   │   ├── worldgen.js     # generateWorld(seed) — pure, deterministic
    │   │   └── invariants.js   # validate(world) -> violations[]
    │   ├── data/civilizations.js  # placeholder civ + difficulty for the pre-game screen
    │   ├── data/content.json   # THE CONTENT LAYER: techs, buildings, wonders (editor-owned)
    │   ├── data/schema.js      # what content.json may contain — enums, EFFECT_KINDS, feasibility()
    │   ├── data/content.js     # the game's view of content.json: indexing + THE DRAFT
    │   ├── data/cycle.js       # THE TWO CLOCKS: waves vs eras, reveal + expansion permissions
    │   ├── data/resources.js   # threshold model (food/production/progress) + accrual
    │   ├── data/enemies.js     # v2's type x domain x tier host composition
    │   ├── data/units.js       # generic player archetypes + the palace
    │   └── manager/combat.js   # turn/beat engine (mixin onto GameManager)
    │   ├── audio/              # AudioManager (ported) + tracks.js
    │   └── react/GameProvider.jsx # <GameProvider> + useGame()
    └── components/
        ├── common/             # NineSlice · InfoTip · IconText (ported unchanged)
        ├── GameScreen.jsx      # map + HUD strip + progress overlay
        ├── HexMap/             # camera, culling, hex rendering, hover card
        ├── Progress/           # ProgressPanel (3 branch columns) · ProgressOffer (3 cards)
        ├── Build/              # BuildPrompt — :production: founds a city or builds a wonder
        ├── Combat/             # wave/strength/speed debug bar
        ├── Hud/                # StageBanner · OutputReadout · WonderBadge
        └── Menu/MenuOverlay.jsx# known-world slider + reroll + exit
```

---

## Implemented

### Hex geometry (`game/hex/coords.js`)
**Axial `(q, r)`, flat-top.** This module is the ONLY place hex math lives — nothing else
should do coordinate arithmetic.
- `distance = (|dq| + |dr| + |dq+dr|) / 2`; six fixed `DIRS`; `ring` / `disc` generators.
- Pixel layout: `x = size·1.5·q`, `y = size·√3·(r + q/2)`; `size` = **circumradius**, so a
  hex is `2·size` wide and `√3·size` tall. `fromPixel` + `round` invert it.
- `wedgeOf(q,r)` → 0..5, the six natural **approach sectors** of a radial map.
- `bfs(starts, passable)` is the shared graph primitive (used by the invariant checks;
  enemy flow-fields will use it too).

### World structure (`game/world/regions.js`)
Concentric bands by distance from the palace at `(0,0)`, all radii in one place:

| Band | Rings | Contents |
|---|---|---|
| `earth` | 0–10 | Old World (holds the palace), a wide ocean, New World, islands, rivers |
| `space` | 11–21 | Moon (r1, @13) + Mars (r2, @18) + asteroids |
| `deep` | 22–38 | the deep-space "ocean"; the exoplanet (r5, @29) and its moon (r1, @37) |
| `galactic` | 39–41 | outer deep space |

Planets / stars / singularities / asteroids are scattered across the **whole** deep +
galactic region, not ringed at its edge, so the far map doesn't read as empties with treasure
round the rim.

**Spacing rules, all invariant-enforced** rather than incidental:
- the Moon hangs exactly ONE ring of open space beyond Earth's rim, and its stage reveals one
  further ring so you see space *past* it
- Mars keeps open space on **both** sides — it must never touch deep space
- the exoplanet's moon is always on its **backside** (same bearing, further out, one ring of
  buffer), so you meet the planet before its moon
- no asteroid sits at or inside the Moon's ring, nor **adjacent to any celestial body**
- the outermost revealable ring is **featureless**, so the map edge reads clean

≈**5,700 tiles** total; **5,167** are revealable and the outer 2 rings exist purely as
battlefield headroom. A band must be ≥ `2·radius+1` rings wide to contain its body.

**The battlefield ring is derived, not generated.** `GameManager._battlefieldRing` dilates the
current known set by `BATTLEFIELD_DEPTH` (2), so the muster zone always hugs the frontier and
the threat stays visible at every map scale. That is why the world extends 2 rings past the
last revealable one.

### Generation (`game/world/worldgen.js`)
`generateWorld(seed)` is **pure and deterministic** — no `Math.random`, no React, no game
state. A run persists only its seed.
- **Earth** is shaped by a random split axis with a wide ocean channel between the two
  continents. A noisy radial falloff turns *some* of the rim to sea; land reaching the edge is
  fine. The continent-boundary wobble is **damped to zero at the centre**, so the palace is
  always solidly inland in the Old World.
  **Why the New World is the smaller share:** `OW_EDGE` has to stay comfortably above 0 or the
  palace (at `s = 0`, where the wobble is damped to nothing) would land in the water. Pushing
  `NW_EDGE` out is therefore the *only* way to widen the ocean, so a bigger sea necessarily
  comes out of the New World rather than the Old. Land ends up roughly 3:1.
- **Climate is LATITUDINAL**: an arid equator and tundra confined to the two poles, where the
  polar axis is the world's vertical (north/south read as up/down on the map). Tundra also
  needs a **cluster field** to pass, so it forms polar patches rather than a solid cap.
- **Islands live in the CHANNEL**, not the rim sea — tiles carry `seaKind: 'channel' | 'rim'`
  so the crossing between continents has stepping stones. They are single tiles, never
  adjacent to each other (a spacing of 3 guarantees it), and never inside the Local radius.
- **Every Old World land tile is walkable from the palace.** Mountains, rivers and the odd
  strait can cut a pocket off, so `connectOldWorldLand` BRIDGES rather than re-rolls: BFS from
  each orphaned pocket back to the reachable mass, converting whatever blocks the shortest way
  (mountain → hills, water → plains). Shortest-path means it crosses at the thinnest point, so
  it reads as a pass or a ford, not a bulldozed corridor.
- **Mountains use RIDGED noise** (`1 - |2n-1|` on its own higher-frequency field, cut high).
  A plain elevation threshold produced dense blobs; ridged noise peaks along the field's
  mid-contour, so ranges come out as sparse lines and the occasional small cluster. An
  invariant holds them to 1.5–15% of Earth's land.
- **Rivers** start on high ground and walk downhill, stamping water. They keep their
  continent `region` (they are part of the landmass, not the sea) so the coast pass ignores
  them, and they read as a ground-movement barrier. Tile-based for now; edge-decal rivers are
  a later job.
- **Coast** is derived, not authored: water touching **continent** land becomes shallow
  `coast`. Islands deliberately get none — a one-tile speck ringed by shallows reads wrong.
  There is **no directional coast tile and no `flipX`** (the `full-coast` sprite is isotropic).
- Moon/Mars/exoplanet are **discs stamped into their band**. The exoplanet is a small world of
  its own with **irregular inland seas rather than a water rim**, plus its own desert/tundra;
  it may touch open space freely. Its **landmass must be one component**, and
  `connectExoLand` bridges stragglers by converting the water in between rather than
  re-rolling.
- Outer-galaxy specials are **littered throughout the band**, not ringed at the extreme edge,
  and only become visible after the exoplanet stages.
- **Encampments are LAND ONLY** — Earth's continents/islands and the exoplanet — with one
  deliberate exception: **Mars' dead centre always holds one**, a fixed prize in the middle
  of the red planet. The Moon, asteroids, the exomoon and open space stay clear. Earth's are
  placed round-robin over the six wedges so the angular spread is guaranteed, not hoped for.
- **The opening view is guaranteed to read well**: at most 3 desert/tundra tiles inside the
  Local radius, and at least one mountain (never on the palace ring, which must stay
  passable). `repairStart` applies these *before* the yield pass, so anything they break gets
  fixed after.

### Invariants (`game/world/invariants.js`)
`validate(world)` returns violations; `generateWorld` **re-rolls deterministically**
(`seed + n·φ`) until clean, up to 16 attempts. This is what makes generation "varied but
predictable". Two classes:
- **Correctness** — palace on passable land, palace ring open, bodies inside their band with
  their spacing rules, **every** Old World land tile walkable from the palace (exact, not a
  percentage — dead territory is territory you can never expand into), exoplanet landmass
  connected, the known world **contiguous and hole-free at every stage**, feature-placement
  rules (asteroid spacing, island spacing, clean map edge), every reveal stage adds ≥8 tiles.
- **Viability** — plains/forest/hills/water all within the start radius, minimum total Earth
  yield per resource, continent size floors (~2:1 Old:New), New World genuinely separated by
  water, an arid equator and **polar** tundra (≥85% of tundra above the polar latitude, and
  ≤22% of land), mountains sparse but present, at least one real river, islands present and
  in the channel, and encampments on land across all six wedges with one in early reach.

The hole check floods per stage but is **radius-bounded** — a hole can only sit inside the
known frontier, so there is no point sweeping 5,400 tiles when the frontier is at ring 11.
Unbounded it cost ~25ms per world; bounded it is ~4ms.

`node sims/worldgen.mjs 200` is the source of truth: currently **200/200 clean, ~80ms per
world**, and it prints the reveal ladder, Earth yield spread, and an ASCII map.

### Known world (`GameManager`, `regions.js` `STAGES`)
Every tile is stamped a `revealStage` at generation time; a tile is known when
`revealStage <= game.stage`. Encoding it per-tile keeps the geometric nuance in the
generator, where it belongs.

Reveal has **three shapes**:
- **Earth** — region-shaped: the Old World is charted in three outward steps (Local → Nearby
  → Distant → the rest, via `NEARBY_RADIUS`/`DISTANT_RADIUS`) → islands and open ocean → the
  New World's coast (waters *and* shore, so the stage actually shows you the continent) → its
  interior.
- **Most off-Earth stages** — concentric (`REVEAL_RADIUS`). This is *why* the Moon and Mars
  sit at different distances rather than side by side: each must fall entirely inside one
  reveal step.
- **The two exoplanet stages** — a **corridor** (`EXO_CORRIDOR`): a cone reaching out through
  deep space towards the exoplanet, leaving the rest of the far map dark. That is what keeps
  the scattered planets/stars a surprise until "Outer Galaxy I" fills the region in.
- **"Outer Galaxy I"** — a smooth **teardrop** (`GALAXY_SHAPE`), not a disc. A disc would
  leave the corridor poking out of it as a spike; the teardrop's radius eases from `base`
  away from the exoplanet up to `max` towards it, swallowing the corridor whole. The world is
  deliberately lopsided at that notch and **"Full Map" rounds it back to a circle**. Measured
  by max step in reveal radius across 24 angular sectors: corridor **15** → teardrop **2** →
  full map **0**. `galaxyReach` also floors itself at the corridor reach inside the corridor
  angle, so a tuning change can never re-expose the spike.

**Two properties must hold of the known set at every stage**, each with its own repair pass
(run in this order — `connectReveal` only ever adds tiles, so it cannot re-open a hole):

1. **Contiguous** — no fragment adrift across the battlefield. `connectReveal` finds the
   component holding the palace and pulls the shortest connecting path into that stage for
   anything else. Islands were the usual culprit: an island revealed with its stage while the
   water around it waited for a later one, leaving a speck stranded.
2. **No holes** — no pocket of unrevealed tiles enclosed by known ones. `sealReveal` floods
   the unknown region inward from the map rim and pulls anything it cannot reach into the
   stage that enclosed it.

The map is free to grow as a non-circle; it just cannot grow *around* something, or leave
pieces of itself behind.

The 15-notch ladder: Local · Nearby Lands · Distant Lands · Old World · Islands · New World
Coastline · Full Earth · Earth and Space · Moon · Mars · Deeper Space · Exo Coastline · Full
Exo · Outer Galaxy I · Full Map. In the real game each notch will be unlocked by a progress
tech; for now the menu slider drives it directly.

### Map viewer (`components/HexMap`)
- **Camera lives in a ref** and is applied imperatively (`transform` on the content div), so
  pan/zoom **never re-render React** — ported from v2's Tableau. **Left or middle mouse
  drags** (middle calls `preventDefault` so the browser's autoscroll widget can't hijack it).
- Renders `known.all` — the revealed tiles **plus the derived battlefield ring**, which is
  drawn with the battlefield sprite regardless of the terrain underneath it.
- ⚠️ **The TERRAIN is a single `<canvas>`, NOT per-tile DOM.** Thousands of clipped, textured
  hex `div`s were the large-map lag — clip-path is the priciest per-tile paint op, and a pan
  re-diffed the whole `shown` set while zooming re-rasterised every hex. `drawTerrain` (in
  `HexMap.jsx`) redraws only the VISIBLE tiles onto a **screen-space** canvas (a viewport-sized
  sibling BEHIND the content div) with the camera baked into the 2D-context transform, so it
  never scales a bitmap — it re-renders at the new camera each frame. Below `DETAIL_HEX_PX`
  (on-screen hex width) it skips the per-tile hexagon clip (invisible corners) and draws
  squares. `applyTransform` redraws on every camera frame; a `drawStateRef` (its inputs, plus a
  signature guard) means a combat beat's re-render triggers **no** redraw. The **control wash**
  and the reach-dim **veil** are painted in the canvas too (not CSS `::before` any more).
- **Everything else is CULLED DOM** in the camera-scaled content layer — the on-tile markers
  (`markerEls`: improvement dot / city pip / camp level), the `borderEdges`/`roadEdges` SVG,
  the hover cue, the tile cards and the combat pieces. These memoise on `[shown, known,
  terrVersion]` so they skip the ~10-beats/second churn. Culling keeps DOM at ~180 nodes zoomed
  in; the terrain canvas carries the zoomed-out case.
- ⚠️ **Hit-testing is GEOMETRIC** (`tileAt`: pixel → hex via `fromPixel`) on the viewport,
  because terrain is no longer per-tile DOM. The cards are `pointer-events: none` (only their
  gold buttons and the combat pieces opt back in), and `.hexmap-content`/canvas are `none` too,
  so a mouse event over bare terrain lands on **the viewport itself** — `e.target === viewport`
  is exactly the check that tells terrain apart from a button/piece for hover and aim. A press
  hit-tests to a unit → reposition drag, else pans; a pan that moved suppresses the click.
  (`react-hooks/preserve-manual-memoization` is disabled file-wide: feeding the memoised
  `layout`/`known` into `drawStateRef` reads as a possible mutation, so the compiler skips this
  hand-tuned component — the manual memos are the whole perf strategy and stand alone.)
- **Stage changes** counter-translate the camera by the content-origin shift *first* (so the
  view holds still), then animate the zoom-out reveal — same trick v2 used for era growth.
- **`requestAnimationFrame` does not fire on a hidden tab**, which would strand the camera at
  the previous stage's zoom. `revealFullMap` **snaps instead of animating** when
  `document.hidden` or `prefers-reduced-motion`. Don't remove that guard.
- The canvas traces the same flat-top hexagon the old `clip-path` did (`hexPath`), shrunk
  ~1.5px so the dark backdrop reads as a grid seam. The terrain art is full-bleed isotropic
  texture, so losing the corners (square mode) costs nothing.
- The hover card is anchored **bottom-left of the map**, never to the cursor, so it can't
  cover the tile being inspected.

### Output readout (`components/Hud/OutputReadout`, `game/data/resources.js`)
A compact corner box (top-right of the map) with the four outputs. The map is the whole window
now — v2's full-height civilization panel is gone.

Food / production / progress are **threshold resources** (v2's model, ported): they accumulate
toward the current level's threshold, and on crossing it the level increments, the overflow
carries, and the threshold grows by `X · level` — so each level costs strictly more than the
last. The readout shows level + a bar toward the next + the per-tick rate. **Gold has no
threshold**, so it just shows its stock.

v2's formula also carried a `1.25^era` term and a rubber band pacing the player against the
era clock; v3 has no eras yet, so both are **dropped rather than faked**.

(Crossing a level is fully wired now — see **The main cycle** below for what each of the
three threshold resources does.)

### The content layer (`game/data/content.json`, `game/data/schema.js`, `/editor.html`)

> **This is where techs, buildings and wonders live, and the engine now READS IT.** The
> migration is done: the old web is deleted, there is one dataset, and `data/content.js`
> below is the only module that touches the file.

The draft mechanic it encodes — **[`docs/design.md`](docs/design.md) is the full statement**;
this is the implementer's summary:

- **Three independent branches** — Military · Economy · Society. (Technology was folded in:
  knowledge and pacing to Society, buildings and yields to Economy, weapons to Military.) Each
  carries its OWN era and advances the moment it has taken `ADVANCE_THRESHOLDS[era]` techs of
  that era — `[2,2,3,3,4,4,5,5,6,6,7,7,7,7]`.
- **The draft pool is CURRENT TIER ONLY.** Skipped techs are gone when the quadrant moves on.
  ⚠️ This is the constraint that shapes everything: a quadrant × era cell must hold at least its
  threshold or the run **dead-ends there**, and it needs *slack* on top or the "draft" is just
  taking everything in the cell. `feasibility()` computes this and the editor's Feasibility tab
  draws it.
- **15 eras** (`schema.js` `ERAS`): Stone · Bronze · Iron · Classical · Medieval · Renaissance ·
  Exploration · Steam · Modern · Information · Solar · Exodus · Liminite · Galactic · Ascension.
  ⚠️ **An era is a TECH POOL and nothing else.** It does not pace the map, gate combat, or scale
  difficulty. Combat is the **wave** ladder — 30 waves, one combat each, scaling on its own.
  The two clocks never touch.
- **:food: expands automatically** (highest-yield outpost, no prompt); **:production: founds a
  city** — or builds a **wonder** if you hold an undrafted one; **:progress: offers 3 techs**.
- **Wonders are drafted like techs** — era, quadrant, and an entry in the offer. Taking one does
  not build it; the next :production: threshold does. You are never offered a second while one
  is unbuilt.
- **`tierUnlocks` are VISIBILITY ONLY**, one per era, and are **not per-branch**: a notch fires
  when **any** branch reaches its era (`revealEra = max(branch eras)`), so the map follows your
  furthest track. This is why there are no vision techs. **The reveal era also grants the
  EXPANSION PERMISSIONS** (`data/cycle.js` `EXPANSION_UNLOCKS`), each pinned to the era whose
  notch actually uncovers the ground it refers to.
- **One unit per class, nine classes**, and the class list is **content** (`content.unitClasses`,
  the editor's Unit classes tab). No named-unit ladder: techs raise the class's stat line and
  every unit of it already on the board improves. Each class carries **placement** and
  **movement** terrain sets — see below.

#### A row is prose PLUS a short list of effects
A row carries a **`description`** — prose with `:token:` markup for icons ("+2 :food:", "grants
a :melee: unit") — which is what the player reads, and an **`effects`** list, which is what the
game runs. See **The draft → Effects** below for the registry and the rule that governs it.

> ⚠️ An earlier version carried a full structured-effect vocabulary — ~16 ops, targets, scales,
> filters, triggers, durations and 50 named rule keys — and all 654 effects in the game were
> encoded against it. **It was removed on purpose**: expensive to author, hard to hold in your
> head, and it forced a decision about every mechanic long before any of them were built.
> `EFFECT_KINDS` is **not that coming back** — it holds exactly what the engine runs today, and
> grows only alongside the code that consumes it. **Do not add to it ahead of that code.** The
> old vocabulary is in git (`schema.js` / `describe-effect.js` before commit `4192d9f`).

**Exclusivity is a `group`**: techs sharing a group name are mutually exclusive, and the
validator rejects a group that spans branches or eras (the choice could never be offered) or one
with a single member (not a choice).

**Intrinsic class behaviour is never a tech.** Fortifications taunt, never move and never attack;
command units never attack. Those live in `UNIT_CLASS_BASE`, not in a tech. Relatedly, **classes
are granted, not unlocked** — "Mud Brick" hands you a fortification rather than switching
fortifications on.

#### The editor (`/editor.html`, `src/editor/`)
A second Vite entry on the same dev server. Filters by era and quadrant, **sortable columns**
(era then alphabetical by default), one table for techs/buildings/wonders/tier-unlocks driven by
a column spec, row expansion for the effect editor, and a Feasibility tab that computes which
cells dead-end a run — bounded to `activeEras`, so the twelve unbuilt eras don't drown the
signal. Building and wonder **placement is multi-select** — the rules compose, so "coastal AND
not adjacent to ocean" is two entries rather than a bespoke enum member.

**The Unit classes tab is a FIXED SET** — nine rows, no add and no delete, and the `id` is not
renameable, because the engine indexes units by class key. Its expanded row swaps the effect
editor for two **terrain checklists** (placement / movement). The group buttons above each list
(Ground, Water, Space, Earth, Mars, Celestial bodies, …) are **shortcuts only**: clicking one
ticks or unticks its boxes, and what gets saved is always the explicit terrain list — so
redefining a group later can never silently redefine content authored against it. `TERRAIN_KEYS`
is derived from the terrain registry rather than re-listed, so a new terrain appears
automatically.

**The Backlog tab is out-of-scope content, not a graveyard.** Rows there are read-only until
restored (edit after bringing something back, never before), they are excluded from validation
(a parked tech's `requires` legitimately points at another parked tech), and `↩ restore` puts a
row back into whichever live list it came from.

⚠️ **Save writes the real file.** `vite.config.js` adds a **dev-only** `/api/content`
middleware that writes `src/game/data/content.json` (temp file + rename, so an interrupted save
cannot corrupt it). A production build can read the dataset but not save it — authoring needs
`npm run dev` running. Ctrl/Cmd+S works; the tab warns on unload while dirty.

The game's **"no scrollbars anywhere" rule does not apply here** — it is a tool, and a
three-hundred-row table scrolls.

### The draft (`game/data/content.js`, `components/Progress`)

> ⚠️ **The 297-node radial web is GONE** — `progress.js`, `effects.js`,
> `definitions.js`, `ProgressTree`, `DefChips` and `sims/progress.mjs` were all
> deleted. The game runs on `content.json` now. Do not resurrect the web; its content
> sits in the backlog.

`data/content.js` is the ONLY module that reads `content.json`. It indexes the file and
answers the draft's one question — *given what I hold, what may I be offered?*

- **Three branches, three eras.** `draft.branchEra` is `{military, economy, society}`, each
  advanced by `recordPick` the moment that branch has taken `thresholdFor(era)` rows of its
  current era. **Wonders count** — they cost the same pick, so exempting them would make a
  wonder a free tempo gain.
- **The pool is CURRENT TIER ONLY** (`offerable`): same branch, `era === branchEra[q]`, not
  already taken, `requires` all held, no taken member of its `group`, and — for a wonder —
  no wonder already held unbuilt. Everything skipped is **gone** once the branch advances.
- **`revealEraOf` = max branch era**, which drives the map stage (`_syncReveal`) and the
  expansion permissions. One era, one reveal notch — 15 and 15 — so no lookup table.

**`ProgressOffer`** deals three cards; **`ProgressPanel`** is the three-column display of
what you hold. What the panel deliberately does NOT show is the whole point:

- **no dependency graph** — almost nothing has a prerequisite, so edges carried no signal
- **no unchosen techs** — you cannot plan a route to a distant node, because what you skip
  ceases to exist. Drawing the road not taken would draw a road that is not there.

A branch with an empty pool reads **"nothing left to draft"** rather than silently never
producing an offer.

#### Effects — a registry that grows ONE ENTRY AT A TIME
`EFFECT_KINDS` in `schema.js` lists the mechanics the engine can run;
`GameManager._applyEffect` is the switch that runs them. **They are added together:**

> an effect kind exists in the registry ONLY in the change that writes its engine case.

`validateContent` rejects a kind with no case, which is what keeps the two in step, and the
editor's **Wired** column shows at a glance which rows the engine actually runs. A row with
no effects is written down and does nothing — normal while the pool is being rebuilt.

Implemented today:

- **`unit_atk_base_pct`** / **`unit_def_base_pct`** — a percentage of BASE :attack: / :defense:
  on every unit, **stacking**. Nothing is stored on the unit; `unitStats` reads `mods` at call
  time, so a tech improves units placed long before it was taken.

  ⚠️ **BOTH STATS ARE TWO LAYERS** (atk is now THREE — see the earned slot), and mixing them
  up is the easy mistake:
  ```
  atk = ((base + unitAtkFlat) × (1 + unitAtkBasePct) + EARNED) × (1 + unitAtkPct)
  def =  (base + unitDefFlat) × (1 + unitDefBasePct)          × (1 + unitDefPct)   // def IS hit points
  ```
  `EARNED` is the per-unit permanent earned-flat (Marksmanship), passed into `unitStats` via
  `extra.earnedAtk`, kept on the unit INSTANCE (`t.unit.earnedAtk`) across combats — sits after
  the base-% and before the ordinary-%.
  Additive within a layer, multiplicative between. A **base modifier** raises the base itself,
  so Siege (base 20) gains 3.3× what Ranged (base 6) does from the same tech — with a FLAT
  line every class converged on ~285 attack and the classes stopped meaning anything. The
  `*Flat` term is folded in first so a future "+2 :attack: on a kill" is multiplied by your
  research instead of drowned by it. Only the two `*BasePct` sums have producers today; the
  rest are the slots the formula needs and are consumed correctly the moment an effect fills
  them.

  ⚠️ **THE PALACE IS NOT A UNIT.** Neither line touches its attack or its HP — it gets a tech
  line of its own, and `palaceDef` is that line's slot. Do not fold `unitAtk*` / `unitDef*`
  into `palaceMaxHp` or into the combat palace piece; both sites say so in a comment.
- **`grant_unit`** — queues N units of a CLASS onto `this.grants`, each opening its own
  placement selection. Stats are read live at placement, so a grant queued before an upgrade
  still benefits from it. All nine classes are offerable.
- **`grant_building`** — the building analogue: queues a BUILDING (by id) onto `this.grants`,
  opening a placement selection over legal controlled tiles. See **Content buildings** below.
- **building effect kinds (8)** — `self_tile_yield_bonus`, `radius_tile_yield_bonus`
  (terrain/has-unit filters), `radius_city_yield_bonus_per_citizen`,
  `yield_growth_per_wave_survived`, `yield_growth_per_nearby_unit_death`,
  `radius_yield_bonus_per_building_age`, `self_yield_bonus_per_distance_to_nearest_building`,
  `radius_yield_from_other_base_yields`. These are **CONTINUOUS** — `buildingBonuses(world, era)`
  in `world/territory.js` folds them into `territoryYield` every tick, keyed off each building
  instance's run state. See **Content buildings**.
- **`unit_crit_chance_pct`** — +crit chance for player units, summed flat (`mods.unitCritChancePct`).
  **Every unit (player AND enemy) already crits at a fixed 5% base** (`BASE_CRIT_CHANCE`); the tech
  chance adds on top for players. Capped at 100% at roll time. **One dial only**: the multiplier is
  a fixed constant (`CRIT_MULT` = 2× in `combat.js`), no tech touches it. Rolled in `_strike` off a
  per-wave seeded `_critRng`; the **palace never crits** (it carries no `side`).
- **`unit_speed`** — +combat acts to every unit that has movement terrain.
- **repositioning** (`reposition_range`, `reposition_domain`, `reposition_cost`,
  `reposition_teleport`) and **`formation`** — see § Repositioning above.
- **`road_network`** — raises `mods.connectionGold`; its bool `prodFromGold` param sets
  `connectionProd` (Maglev). See § City connections.
- **ranged theme (20 kinds)** — poison, preloaded shots, shot chaining, range/placement
  grants, class-scoped crit, and the earned-flat atk slot. See § Ranged combat below.

An effect param is a **number**, a **choice** (`options`), or a **bool** (`type:'bool'`, a
checkbox — used by `road_network`'s Maglev rider). An effect may also have **no params** at all
(`reposition_teleport` is a flag). The editor and validator branch on those three shapes.

⚠️ **The weapon/armour TIER ladder was deleted** (`WEAPON_TIERS`, `ARMOR_TIERS`, `bestTier`).
It replaced rather than stacked, contradicting the design's central rule, and it
double-counted against the base-modifier attack line that now carries that job.

---


## Conventions (carried over from v2 — still apply)

- **Screens, not routes.** `App.jsx` holds a `screen` state string; `transitionTo` fades to
  black and swaps mid-fade.
- **Model vs. UI.** Everything under `src/game/` is framework-free. React reads it through
  one bridge: `GameManager.subscribe` + `getVersion` → `useSyncExternalStore` in
  `useGame()`. **`subscribe`/`getVersion` must be ARROW FIELDS** — they are passed unbound.
  Mutators call `_emit()`. Never hold core game state in React state.
- **Styling:** plain CSS co-located with the component; design tokens in `index.css`.
- **`body { overflow: hidden }` — no scrollbars anywhere.** The panel must size everything to
  fit, never scroll. (This is why the terrain legend goes two-column.)
- **Icons over words in prose** — `<IconText>` swaps `:token:` markup for inline icons, and
  `InfoTip` routes string tooltips through it automatically.
- **Scalable frames:** `<NineSlice src slice width fill>`; our `Box` frames are 1254×1254
  sliced at 205.

## Gotchas

- `React.StrictMode` is on — effects run twice in dev.
- ⚠️ **v3 has NO `node_modules` of its own.** It runs on the ROOT install (React 19 + Vite 8),
  found by Node walking up from `v3/`, and npm adds every ancestor `node_modules/.bin` to PATH
  — which is why `npm run dev|build|lint` works from `v3/` with nothing installed there. Run
  npm commands from `v3/` so the right `package.json` is used. The preview config therefore
  launches the **root's** vite with `v3` as its root dir.
- Set `localStorage['autociv.mute'] = '1'` to disable music (keeps automated screenshots
  from hanging on a looping media stream).
- **The `sprites/ui/` set are BLACK SILHOUETTES** drawn for v2's parchment panel. v3's
  surfaces are dark, so `index.css` inverts them wherever they appear as an inline `<img>`.
  The 9-slice frames go through `border-image`, not `<img>`, so they are unaffected.
- Dead units are filtered out of `combat.units` at the start of each turn, so end-of-combat
  cannot see them. Casualties are **banked into `combat.fallen`** before that filter — without
  it, units that died were never marked destroyed on their tiles and came back free.
- Tile `x`/`y` are pre-computed by worldgen at **hex size 1** — multiply by `HEX_SIZE` when
  rendering, and note the noise fields sample the same coordinates.

### Combat (`game/manager/combat.js`, `game/data/enemies.js`, `game/data/units.js`)
A scaffold, driven by the **Simulate Combat** bar: pick a wave (1–30) and a host strength,
generate, then watch it play out at 2/6/12/30 beats per second (or Step / Resolve).

- **Enemies are v2's composition system**, kept as-is: a TYPE (melee / cavalry / ranged) × a
  DOMAIN (default / amphibious / astral) × a spawn TIER (grunt ½ / normal / elite ×2), bought
  against a per-wave HP budget. Their stat curves are v2's and should stay that way.
- **Travel classes** (`terrain.js` `travelClass`) decide what may path where, and they are
  finer than terrain `domain` because open space and a celestial body are both "space" for
  placement but nothing alike for movement:

  | class | who crosses it | terrain |
  |---|---|---|
  | `void` | **everyone** | space, deep space, battlefield |
  | `land` | everyone | plains, forest, hills, desert, tundra, island, exo-land |
  | `water` | amphibious, astral | coast, ocean, river, exosea |
  | `body` | **astral only** | Moon, Mars, asteroid, planet, star, singularity, exomoon |
  | `blocked` | **astral only** | mountain, exomountain |

  So **every domain crosses the void** — open space is how a host reaches you, not a barrier —
  and **astral is a strict superset**, not a separate space-only lane: what it buys is the
  ability to set foot on bodies and mountains.
- **Pathing is a FLOW FIELD, not columns.** One inward BFS from the palace per domain,
  computed once at combat start. Because the void is universal there is no special case for
  the muster ring; a domain with no viable entry is still dropped from the roll and its weight
  redistributed, as a safety net.
- **Phase order per turn**: enemies move → defenders move → defenders attack (the palace
  strikes here too) → enemies attack.
- **ONE PIECE ACTS PER BEAT.** A turn is expanded into a queue of single-piece actions and
  `combatStep()` advances to the next one that actually SHOWS something. Beats that produce
  nothing — nowhere to move, nothing in range — are skipped instantly, since only animation
  needs the clock. Roughly two thirds of queued beats cost no time at all.
- **The acting piece is ringed** and the current phase is named in the status bar.
- `lastAttackSeq` keys off a dedicated `actionSeq` bumped inside `_strike`, **not** `beat` —
  the beat counter only advances after the action resolves, which left cards comparing against
  a stale value and the lunge never played.
- The **palace** (atk 10, range 2) fights in the defenders' attack phase and animates like any
  other piece. If it falls, the wave is lost.
- The scratch **garrison** is bought against the same budget curve at `DEFENCE_RATIO`, always
  at strength 1 — so the strength slider genuinely raises difficulty instead of scaling both
  sides. Balance is **not** tuned; it is placeholder until the full game is assembled.
- **`_strike` is now a thin wrapper over `_dealBlow`** — the single-blow primitive that rolls
  crit (base + universal + **class** chance), applies damage, pushes the float, and fires a
  player unit's crit RIDERS (`_onPlayerCrit`: gold, earned-flat atk, banked shot). Callers that
  want the number back (chaining) read `{ landed, dealt, crit }`.
- **RANGED units run `_rangedAttack`, not `_strike`** (routed in `_runOneBeat`'s player-attack
  case): primary hit → poison (`_applyRangedPoison`) → shot chains (half-damage each unless
  falloff removed, no crit) → discharge banked shots (`preload`). Idle turns bank a shot
  instead. **Poison** is a per-unit stack counter (`piece.poison`, enemies too); `_poisonTick`
  runs at the start of the enemy's turn inside `_enemyMove`, before it acts. Per-unit combat
  state lives on the piece (`preload`, `poisonEscalator`); permanent per-unit state lives on the
  tile instance (`t.unit.earnedAtk`, `t.unit.stationaryCombats` — the latter reset by
  repositioning). See § Ranged theme in design.md for the full behaviour.


---

## The main cycle (`GameManager`, `data/cycle.js`)

**TWO CLOCKS THAT DO NOT TOUCH**, and confusing them is the mistake to avoid:

- **`game.wave`** — combat. 65 ticks of development → a **prep phase** → the wave; 30 waves.
  It scales on its own ladder and **never waits for your research**.
- **`draft.branchEra`** — three tech pools, moved only by drafting. `max()` of the three is the
  **reveal era**, which drives the map stage and the expansion permissions.

**Phase machine is `development → prep → combat`** (`game.phase`). Development ends at tick 65 by
entering **prep** (`_startPrep`) — the clock stops accruing, the mustered host is on the frontier,
and the player arranges the board (reposition/repair/upgrade). `beginWave()` (the PrepBanner's
button) starts combat; it un-pauses if needed, since combat borrows the clock. `gameTick` no-ops
outside `development`, so nothing accrues in prep. The sim calls `beginWave()` the instant it sees
prep.

One timer and one pacing control in the HUD serve both. Each tick either advances a running
combat by a beat, or advances the game: accrue output, grow cities, count down to the wave.

Each threshold resource does something DIFFERENT, and only two of the three stop the clock:

| resource | on crossing |
|---|---|
| **:progress:** | offers three advancements (`ProgressOffer`) — **pauses** |
| **:production:** | founds a city, or builds a held wonder (`BuildPrompt`) — **pauses** |
| **:food:** | **expands automatically, no prompt at all** (`_autoExpand`) |

`_restartTimer` is gated on `!selection`, exactly as v2's selections were.

`_autoExpand` scores `food + production + progress + 0.5·gold` (`GOLD_WEIGHT`), ties breaking
outward. ⚠️ **Gold counts HALF** because it is the only resource with no threshold — it buys
repairs and upgrades rather than compounding — and at full weight desert outranked plains and
hills. Water needs no special case: an outpost can never be on it, so it is never a target.

## Territory & expansion (`world/territory.js`)

Two depths, and they are now driven by DIFFERENT resources:

- **Settle** (:food:, automatic) — improve a tile: its yield **doubles** and all six neighbours
  become controlled. This is what makes the *next* expansion possible.
- **Found city** (:production:, prompted) — upgrade an improvement: no new ground, but the
  city's population compounds and adds to production/gold/progress on top of the tile's yield.

⚠️ **AN OUTPOST IS NEVER ON WATER** (`canExpandOnto`). Water is still controlled and still
pays its :gold: — it just cannot be settled, and therefore cannot be built on. No water
terrain appears in `TERRAIN_GATE` any more; a gate there would be dead config reading as a
rule.

**What may be settled** (`expansionTargets`) is anything VISIBLE that is one of:
**adjacent** to the controlled border (one ring past your outposts — this used to require the
tile to already be controlled), the **border of a gated region you have not entered**
(the only way onto the New World, Moon, Mars, exoplanet), or an **isolated speck** that
nothing is ever adjacent to.

Rules: cities never adjacent to another city, never on mountains, **never on water** (a city
may sit beside water and take the growth bonus, but is founded on land), and only where there
is food in reach (the tile's own food counts). **Bringing an encampment inside your borders clears it**
— that is the whole reason to push toward one.

Reachability has three shapes:
- **adjacency** — anything you already control
- **border-first** — big contiguous regions (New World, Moon, Mars, exoplanet) must be entered
  on a border tile; you cannot appear in the middle of Mars
- **always reachable** — isolated specks (islands, asteroids, planets, stars, singularities,
  the exomoon) are settleable directly the moment their gate opens. The border-first rule
  would strand them forever, since nothing is ever adjacent to them.

**Claimed ground beyond the frontier is INERT.** Improving a tile claims its six neighbours,
and some of those can lie past the current reveal — out in what is drawn as enemy battlefield.
Those tiles stay claimed but count for nothing until the map catches up: no yield, no expansion
target, no city site, and they are not painted as territory. They come alive on their own when
the era reveals them (`setTerritoryStage` bumps the memo version). `territoryStats` reports them
separately as `claimedBeyondFrontier`.

Territory is drawn as a **continuous outline** — one SVG segment per hex edge where controlled
meets uncontrolled — rather than a ring per tile, which read as a grid of boxes. Controlled
ground takes a faint warm wash; a brightness filter washed the terrain art out and fought the
expansion-target animation.

**Territory keeps incremental index sets** (`world.terr`), and `foodAround`/`waterAround` are
memoised against a `version` counter. Rescanning 5,400 tiles per tick made a 28-era simulation
take 18 seconds; it now takes 3.

City growth is separate from the expansion meter: each city banks its adjacent food (×1.5 with
water in reach) and buys population against an exponential cost.

### City connections (`layConnections`)
Cities wire themselves together **automatically, no tech needed**, and every tile ON a route
earns `mods.connectionGold` base :gold: (default **1**, raised by `road_network` techs; doubled
by an outpost since it is a base modifier). ⚠️ This **replaced** the old `layRoads`/`roadYield`
(palace-spoke network + road-adjacency bonus) — both are gone. Topology: an Old-World city routes
to the **palace** by shortest LAND path, unless a relay city is both nearer the palace than it is
and nearer to it than the palace is (then it routes to those); an off-world city connects to its
**two nearest same-landmass (`region`) cities**. Routes never cross water or open void. The rule is
global, so the network is **recomputed whole** on any city/territory change. Maglev's rider sets
`connectionProd` → route tiles also earn :production: equal to their gold. `t.road` marks route
tiles (still drawn by HexMap's `roadEdges`).

## Repositioning (prep phase — `world/reposition.js`, `costs.js`)
Moving a placed unit is a **prep-phase** action (`game.canReposition`). It costs :gold: per tile
of distance BEYOND your free **reposition range** (`mods.repositionRange`, 0 without research);
within range it is free. **Distance** is a 0-1 BFS (`repositionField`): a tile in a granted
**domain** (`mods.repositionDomains` — water / space / deep_space) costs 0 to cross, else 1;
nothing blocks a path. **Teleport** (`mods.repositionTeleport`) makes distance straight-line. A
destination must be empty and legal for the unit's class. `repositionTargets`/`repositionUnit` are
the API; the UI is **drag-to-reposition** in `HexMap` — press a unit (`onHexMouseDown`), the legal
tiles light (green free / amber paid-with-cost printed on the tile / red unaffordable), drop on one
to move or anywhere else to cancel; a non-unit press falls through to panning. **Formations** reuse
the same range as a combat buff — `_formationFlats` in
`combat.js` counts friendly neighbours within range at combat start and passes a **per-unit flat**
into `unitStats`'s `extra` arg (folded into the base, pre-multiplier).

## Buildings, units, and placement

**Content buildings** (`content.buildings`, resolved via `buildingDef` in `data/buildings.js`)
are unlocked and usually **granted** by a progress tech (`grant_building`). You place one on a
legal controlled tile and it pays out **every tick**. Each carries a **placement** rule list
(multi-select, same as wonders — and a non-empty list **overrides** the default open-void
exclusion, so a Space Telescope goes on space) and an **effects** list drawn from the 8 building
effect kinds. Unlike a tech's one-shot effect, these are **CONTINUOUS**: `buildingBonuses(world,
era)` in `world/territory.js` walks `world.terr.buildings`, evaluates each effect (self-tile,
radius, per-citizen, or a run-state growth term), and `territoryYield` adds the result to the
owning tiles' yield every tick (only for **visible** tiles).
- **Instance state** (`placeBuilding`): `{ key, level, builtEra, wavesSurvived, deathBonus }`.
  `wavesSurvived` ticks up in `endCombat`; `deathBonus` accumulates via the **unit-death hook**
  (`combat.js` `_onUnitDeath`, called wherever a piece dies — `_dealBlow`, `_poisonTick`) for
  `yield_growth_per_nearby_unit_death`; both are preserved through raze→ruin→repair (`razeTile`/
  `restoreTile` keep `builtEra`, reset the growth counters).
- **The Progress line** (14 buildings, one Economy tech per era 0–13): Shrine, Library (grows
  +2/wave), Academy (self + adjacent-garrison), Basilica (per-citizen city bonus), University,
  Observatory (mountain-filtered), Gazette (death hook, New-World ×2), Laboratory, Museum
  (per-building-age), Arctic Research Station (tundra-only), Space Telescope (space-only),
  Cogitarium (per-distance-to-nearest-building), Alien Research Center (exoplanet-only, sum of
  other base yields), Black Hole Station (singularity-only).

⚠️ The **legacy `BUILDING_DEFS`** in `buildings.js` (granary/lumbercamp/… — an adjacency-shaped
`base`+`per` model) are **superseded and unreferenced**: nothing grants them and `buildingDef`
resolves `CONTENT_BUILDINGS` first (one id, `library`, collides — content must win). They are
kept only as a parts bin; do not wire new content against them.

**Units** (`data/units.js`) are **one per class, nine classes, generated from
`content.unitClasses`**. `units.js` holds no unit data of its own any more — it turns the
content rows into defs (`acts` = the class's speed, `def` = hit points) and computes live
stats. ⚠️ There used to be thirteen NAMED units with `bestOfType` picking the strongest
unlocked one; that contradicted one-unit-per-class and meant two datasets describing the same
thing, so it was deleted. Don't reintroduce named units.

**Placement and movement are TERRAIN KEY SETS on the class**, and both are enforced:
- `canPlaceUnit(world, tile, def)` — where a unit may be **created**. This is what keeps naval
  units at sea and everything else off it. Passing no def falls back to any passable ground.
- `_playerWalkable(tile, def)` / `unitReachCells` — where it may **stand and walk**. An
  **empty movement set means never moves**, which is how fortifications/ranged/siege express
  that intrinsic behaviour as data rather than as engine special cases.
- Combat caches **one enemy-proximity field per CLASS** (`_moveFields`), not one per unit: a
  naval route is nothing like a melee route, but there are only nine classes.

**Where the army comes from is a deliberate split:**
- **Territory** raises the *line*: each city musters one melee levy per wave, capped at
  `UNITS_PER_CITY_CAP` (3) units per city. Without this the army only ever shrank — casualties
  are permanent and the draft grants far fewer units than a wave kills, so every run died
  around wave 5 regardless of play.
- **The draft** gives *quality* — stacking +:attack: today, and the arms a levy never is
  (bows, horses, walls) once those effect kinds exist.
- You **start** with a single Warrior, and every +:attack: tech grants a :melee: unit on top.
- **Buildings ARE granted now** — `grant_building` hands you a placeable that pays out every
  tick. The **Progress line** (Economy quadrant, eras 0–13, one tech each: Mythology→Shrine …
  Dark Matter→Black Hole Station) is the first fully-wired building set. See **Content buildings**
  below.

Placement reuses the expansion affordance: legal tiles pulse, you click one. Units never stand
on the palace tile (combat's occupancy map holds the palace there and would shadow them).

**On-tile UI** (`components/HexMap/TileCard`): a unit is a **hexagon badge** with its type icon
centred, a rim coloured by flavour, and **attack bottom-left / defence bottom-right** — always
the same two corners, so the numbers are read by position rather than by label. A building is a
**name card** showing its live yield as resource icons tinted to match the corner readout.
Hovering either reveals its **gold actions** (repair / upgrade) with prices, right on the thing
being spent on — repair and upgrade are the only gold sinks, so they belong there rather than
in a side panel.

**Hovering a unit paints its reach** (`GameManager.unitReachCells`): BLUE = ground it can walk
to this turn, RED = what it can strike from where it stands, AMBER = what it could strike after
moving first. Seeing a stat block drawn on the board reads far faster than the numbers do.

⚠️ **`clip-path` clips DESCENDANTS.** This has bitten twice and will again:
- `.hex` is clipped, so TileCards render in **their own layer** — an action button hanging
  below the hex was in the DOM but invisible.
- `.tc-unit` (the hexagon badge) is clipped, so the stat pills and level pip are **siblings**
  of it inside `.tc-unit-wrap`, not children, or they get sliced off at the badge edge.

⚠️ **A CSS `inset box-shadow` cannot outline a clip-path hexagon.** It is painted on the
element's *rectangle* and clipped afterwards, so the ring survives along the flat top/bottom
and the left/right extremes and vanishes on all four diagonals — it never actually borders the
tile. Every tile highlight (unit reach, expansion targets) is therefore a **real SVG polygon**
in one shared `.hex-overlay` layer, via `hexPoints()`.

⚠️ **Hover is cleared on a grace timer** (160 ms), because a tile's gold buttons hang below its
hex: reaching them means leaving the hex, and an instant clear unmounts the button out from
under the cursor mid-travel. Any new hover cancels the pending clear. The hovered anchor also
lifts its `z-index` so a neighbour's card cannot cover its buttons.

⚠️ **Card type is sized off the HEX, never in `rem`.** The whole content layer is camera-scaled,
so a fixed `rem` size shrinks to illegibility when zoomed out. The anchor sets
`fontSize: HEX_W * 0.17` inline and everything inside the card uses `em`.

## Pacing — how often the clock stops

Every threshold crossing stops the clock and asks the player something, so `RESOURCE_CONFIG`
*is* the pacing dial. The per-level requirement grows **geometrically** on top of the linear
term (`prev + X·n·G^n`, `THRESHOLD_GROWTH = 1.09`): the linear rule alone grows quadratically
in the level while output grows *exponentially* — more tiles, each worth more, multiplied by
the web — so it fell behind and the game turned into an offer every couple of ticks.

Only :progress: and :production: stop the clock; **:food: was the loudest of the three and is
now silent**, which is most of why the prompt rate fell.

⚠️ **The threshold ladder and the wave budget are COUPLED.** Raising thresholds means fewer
progress offers → fewer unit grants → a smaller army. Retune `BUDGET_BASE`/`BUDGET_GROWTH` in
`data/enemies.js` whenever `RESOURCE_CONFIG` moves, or a slower ladder reads as brutal
difficulty rather than as calmer pacing. `sims/campaign.mjs` reports **prompts per wave**,
which is the number to watch: currently **~0.5–0.7**, though that is measured against a nearly
empty tech pool and will rise as the pool fills.

## The wave & razing

Development **ends in a wave**, sized by the wave counter — **not** by how far your tech has
run, so dawdling does not make it easier and out-teching it is a real strategy. Every
**revealed, uncleared encampment fields an extra garrison standing on the camp**, already
inside your frontier: that is the pressure to expand toward them.

**The wave is mustered at the START of development and drawn on the battlefield ring
throughout** (`prepareWave` / `buildHost`, faded via `.muster`), so you can see what is coming
while there is still time to prepare. `startCombat` reuses that exact host — what you spent the
cycle looking at is what turns up.

⚠️ **A reveal RE-MUSTERS the wave** (`_syncReveal`). The battlefield ring is derived from the
known set, so opening the map moves it outward and leaves the mustered host standing on the old
ring with flow fields computed against the old world. Under the single era clock this could
only happen at the rollover, right before the muster; now **a draft can advance a branch at any
point in development**, so the host is rebuilt whenever the frontier moves.

A camp garrison's **travel domain** is: **island camps are always amphibious or astral**
(nothing else can leave an island); everything else takes the cheapest domain that can
actually path between the camp and the palace, read off the flow fields. This is not flavour —
a land-only garrison stuck on an island can neither march in nor be reached, so the battle ran
to the turn cap *every single era*.

An enemy with nothing in reach **razes the ground it stands on** — building, then city, then
improvement — leaving a **ruin**. Casualties are likewise not erased: a fallen unit stands on
its tile as `destroyed`. Both are **repair bills, not erasures**, which is what gives gold
something to do.

## Gold (`data/costs.js`, `components/Tile/TilePanel`)

Gold is the **only** resource you spend by hand — food buys expansions on a threshold,
production and progress arrive on their own. It has three sinks, all priced in `costs.js`:

- **Repair** — bring back a destroyed unit, or rebuild razed ground (a razed city returns
  *with its population*: you are rebuilding, not refounding)
- **Upgrade** — raise a unit's or building's level permanently. A building upgrade scales its
  **whole** payout including adjacency, so upgrading a well-placed building is worth far more
  than upgrading a badly-placed one.
- **Reroll** — redraw the three advancements on offer. The price **doubles with each reroll
  inside one offer** so it stays a decision rather than a slot machine, and resets at the next
  threshold.

Clicking a tile you control opens `TilePanel` with its actions and prices; buttons grey out
when you cannot afford them. Gold cannot be spent during a battle (`canSpend`).

**This is what makes the loop work.** Before it existed, waves killed 2–3 units an era with no
way to replace them and every seed died by era 5. With it, the same waves are survivable and
the tension is a budget rather than a death spiral.

## Campaign analysis (`sims/campaign.mjs`)

`node sims/campaign.mjs [waves]` plays the whole loop headlessly across 5 seeds with a greedy
AI. It answers two questions:

1. *Does the assembled game survive?* — wave outcomes, casualties, razes, gold spent.
2. **Does the CONTENT reach the player?** — a per-branch report of which era each branch
   reached and whether it is `STALLED` with an empty pool. **This is the number to watch while
   the tech pool is being rebuilt**, and it is why the sim survived the migration when the
   other two did not.

Measured at **6 waves: 5/5 survive**, palace 86–100%, ~0.5 casualties per wave, 3–4 cities,
and gold genuinely spent. All three branches currently report `STALLED` — see the scope box at
the top of this file.
