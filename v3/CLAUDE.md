# AutoCiv v3 — Project Guide (WIP)

> **Status: EARLY.** The **map** (hex grid, world generation, pan/zoom viewer), a
> **progress-web UI prototype**, and a **combat scaffold** exist, wrapped in the ported screen
> shell. There is **no economy or roster yet** — the resource tick is temporary scaffolding
> that fills the readout's bars, the progress web is a UI sample over v2 content, and combat
> is a "simulate this wave" debug harness rather than a campaign.
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
- **Progress is a radial tree** of rings; clearing enough of one ring opens the next, with
  either/or choices so builds diverge.
- **Enemy encampments** are scattered across the map and reinforce every wave until your
  borders reach them — the main pull to expand.

Only what is described under **Implemented** below is real in code. Everything else is
design intent recorded so the next reader knows where this is heading — **do not treat it
as built.**

---

## Running

```bash
cd v3
npm install
npm run dev                  # Vite dev server (5174 via .claude/launch.json)
npm run build
npm run lint
node sims/worldgen.mjs 200   # headless worldgen regression + map dump
node sims/progress.mjs       # progress-web structure check (no crossed edges, forks, reach)
```

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
├── sims/progress.mjs           # progress-web structure assertions + greedy playthrough
└── src/
    ├── App.jsx                 # screen router: loading → title → pregame → game
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
    │   ├── data/progress.js    # SAMPLE progress web (v2 content, invented shape)
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
        ├── Progress/           # radial progress web overlay
        ├── Combat/             # wave/strength/speed debug bar
        ├── Hud/                # StageBanner + OutputReadout (corner yields)
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
- **Culling** is what makes ~4000 tiles cheap: only tiles inside the visible rect render,
  and the cull rect only updates once it has moved by more than a hex. Zoomed in, DOM drops
  to ~180 nodes; zoomed out to fit, everything renders but each hex is tiny.
- **Stage changes** counter-translate the camera by the content-origin shift *first* (so the
  view holds still), then animate the zoom-out reveal — same trick v2 used for era growth.
- **`requestAnimationFrame` does not fire on a hidden tab**, which would strand the camera at
  the previous stage's zoom. `revealFullMap` **snaps instead of animating** when
  `document.hidden` or `prefers-reduced-motion`. Don't remove that guard.
- Hexes are square sprites clipped with `clip-path: polygon(25% 0, 75% 0, 100% 50%, 75%
  100%, 25% 100%, 0 50%)`. The terrain art is full-bleed isotropic texture, so losing the
  corners costs nothing. A ~1.5px inset gives the dark backdrop a grid-seam read.
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

> ⚠️ **The 1/s tick in `GameManager` is temporary scaffolding.** It exists so the threshold
> bars actually move — output is still just the revealed map's total yield, and **nothing is
> wired to crossing a level**. Rip it out when the real era/phase loop lands.

### Progress web (`game/data/progress.js`, `components/Progress/ProgressTree`)
A radial tree that **grows outward**, opened from the HUD's Progress button.

**72 nodes, 4 rings (12 / 16 / 20 / 24), four quadrants** — Society / Technology / Economy /
Military — each owning a 90° sector.

**The shape is generated from one parent template**, not hand-placed. Every quadrant is the
same 3 → 4 → 5 → 6 tree:

```
ring 1 parents: [0] [0] [1] [2]           → parent 0 FORKS
ring 2 parents: [0] [1] [2] [2] [3]       → parent 2 FORKS
ring 3 parents: [0,1] [2] [2] [3] [4] [4] → DIAMOND, then two FORKS
```

Two properties fall out of that, and **`validateStructure()` asserts both** (run
`node sims/progress.mjs`):

1. **No crossed edges.** Each ring is laid out in index order and every ring's parent-index
   sequence is non-decreasing; two straight edges between concentric arcs cannot cross when
   both endpoint orders agree. So the drawing is planar **by construction, not by eye** — and
   the check is a real segment-intersection test over all 64 edges, not a proxy.
2. **Forks are always siblings.** A parent has either exactly one child, or a set of children
   that are mutually exclusive. Nothing else is ever exclusive, so `excludes` is **derived**
   from the parent template rather than hand-listed (no fork list to drift).

**`prereqs` is ANY-of**, which is what lets a split **re-unify**: the ring-3 diamond lists both
descendants of the ring-1 fork as parents, so either branch reaches it (Theocracy, Printing
Press, Canning, Military Tradition). **`excludes` is mutual**, so taking one side kills the
other permanently, and with it anything downstream with no other route in. A greedy
playthrough takes **48 of 72** — a third of the web is closed off by the choices made.

- **Rings unlock by count**: take `RING_UNLOCK` (6) from a ring and the next appears. An
  unopened ring is **not rendered at all**, and the camera animates out to the new fit, so the
  web visibly expands.
- **Camera is the HexMap pattern** — ref-based, applied imperatively, so pan/zoom never
  re-render the 72 nodes. Wheel zooms at the cursor; left **or middle** drag pans; a drag that
  moved suppresses the click so panning never takes a node by accident. "Recentre" re-fits.
- **States**: green = taken, blue = available (pulsing), grey = locked. Each node is a
  `clip-path` hexagon with its category silhouette; hover gives an `InfoTip` with what it
  unlocks and its effect (through `IconText`, so `:token:`s render as icons). Edges light
  green once their prerequisite is taken and go dashed when the route is dead.

**The data is a sample, not the design.** All 72 names, what they unlock, and their effect
text are **verbatim from v2's registries**; the *shape* is invented to exercise the UI. A few
effects still mention `:legitimacy:`, which v3 dropped — left as-is so the file stays a
faithful v2 sample. **Clicking simply takes a node**: no cost, no progress spend, no economy
gating.

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
- **v3 has its own `node_modules`.** Run npm commands from `v3/`, not the repo root.
- Set `localStorage['autociv.mute'] = '1'` to disable music (keeps automated screenshots
  from hanging on a looping media stream).
- Tile `x`/`y` are pre-computed by worldgen at **hex size 1** — multiply by `HEX_SIZE` when
  rendering, and note the noise fields sample the same coordinates.

### Combat (`game/manager/combat.js`, `game/data/enemies.js`, `game/data/units.js`)
A scaffold, driven by the **Simulate Combat** bar: pick a wave (1–30) and a host strength,
generate, then watch it play out at 2/6/12/30 beats per second (or Step / Resolve).

- **Enemies are v2's composition system**, kept as-is: a TYPE (melee / cavalry / ranged) × a
  DOMAIN (default / amphibious / astral) × a spawn TIER (grunt ½ / normal / elite ×2), bought
  against a per-wave HP budget. Their stat curves are v2's and should stay that way.
- **Pathing is a FLOW FIELD, not columns.** One inward BFS from the palace per domain,
  computed once at combat start. The muster ring itself is crossable by everything, so a host
  can walk it to find an entry its domain can use; a domain with no viable entry is dropped
  from the roll and its weight redistributed (otherwise an all-space frontier produced empty
  waves).
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
