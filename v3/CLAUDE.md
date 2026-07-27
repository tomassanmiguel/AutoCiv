# AutoCiv v3 — Project Guide (WIP)

> **Status: EARLY.** Only the **map** exists — hex grid, world generation, and a pan/zoom
> viewer, wrapped in the ported screen shell. There is **no economy, combat, roster, tech
> tree, or tick loop yet.**
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
    │   ├── audio/              # AudioManager (ported) + tracks.js
    │   └── react/GameProvider.jsx # <GameProvider> + useGame()
    └── components/
        ├── common/             # NineSlice · InfoTip · IconText (ported unchanged)
        ├── GameScreen.jsx      # map + panel + HUD strip
        ├── HexMap/             # camera, culling, hex rendering, hover card
        ├── UIPanel/            # known-world yield readout + terrain census
        ├── Hud/StageBanner.jsx # current reveal stage
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
| `earth` | 0–9 | Old World (holds the palace), ocean channel, New World, islands, rivers |
| `space` | 10–20 | Moon disc (r1, @13) + Mars disc (r2, @18) + scattered asteroids |
| `deep` | 21–31 | the deep-space "ocean"; the exoplanet (r4, @27) is embedded here |
| `galactic` | 32–38 | deep space **littered throughout** with planets, stars, singularities |

≈**4,900 tiles** total; **4,447** are revealable and the outer 2 rings exist purely as
battlefield headroom. A band must be ≥ `2·radius+1` rings wide to contain its body, and the
Moon/Mars sit ≥2 rings clear of Earth's rim — both are invariants.

**The battlefield ring is derived, not generated.** `GameManager._battlefieldRing` dilates the
current known set by `BATTLEFIELD_DEPTH` (2), so the muster zone always hugs the frontier and
the threat stays visible at every map scale. That is why the world extends 2 rings past the
last revealable one.

### Generation (`game/world/worldgen.js`)
`generateWorld(seed)` is **pure and deterministic** — no `Math.random`, no React, no game
state. A run persists only its seed.
- **Earth** is shaped by a random split axis: land below the axis threshold is Old World,
  above it is New World, the gap between is the ocean channel, and a noisy radial falloff
  turns the rim to sea. The continent-boundary wobble is **damped to zero at the centre**,
  so the palace is always solidly inland in the Old World.
- **Climate is CONCENTRIC**, which is the right model for a radial map: an arid belt through
  Earth's middle and tundra out towards the rim, both noise-wobbled. Land reaching the rim is
  fine — there is no forced ring of ocean.
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
- **Encampments are LAND ONLY** — Earth's continents/islands and the exoplanet. The Moon,
  Mars, asteroids and open space stay clear. Earth's are placed round-robin over the six
  wedges so the angular spread is guaranteed rather than hoped for.

### Invariants (`game/world/invariants.js`)
`validate(world)` returns violations; `generateWorld` **re-rolls deterministically**
(`seed + n·φ`) until clean, up to 16 attempts. This is what makes generation "varied but
predictable". Two classes:
- **Correctness** — palace on passable land, palace ring open, bodies inside their band and
  ≥2 rings clear of Earth, ≥80% of the Old World walkable from the palace (only mountains
  block; rivers will be bridgeable), exoplanet landmass connected, **no holes in the known
  world**, every reveal stage adds ≥8 tiles.
- **Viability** — plains/forest/hills/water all within the start radius, minimum total Earth
  yield per resource, continent size floors, New World genuinely separated by water, a desert
  belt and a tundra rim, mountains sparse but present, at least one real river, and
  encampments on land across all six wedges with one in early reach.

**The hole check is asymmetric on purpose.** Earth's stages are region-shaped and genuinely
can enclose a pocket, so they get a real (radius-bounded) flood. Beyond Earth the reveal is
concentric and hole-free by construction, verified far more cheaply by asserting each ring
flips in one go. Doing the full flood for all 13 stages cost ~25ms per world; this is ~1.5ms.

`node sims/worldgen.mjs 200` is the source of truth: currently **200/200 clean, ~45ms per
world** (~28ms to build, ×1.6 attempts), and it prints the reveal ladder, Earth yield spread,
and an ASCII map.

### Known world (`GameManager`, `regions.js` `STAGES`)
Every tile is stamped a `revealStage` at generation time; a tile is known when
`revealStage <= game.stage`. Encoding it per-tile keeps the geometric nuance in the
generator, where it belongs.

**The known world must never contain an unrevealed hole.** Two mechanisms uphold that:
Earth's stages are region-shaped and get a `sealReveal` pass that pulls any enclosed pocket
into the stage that enclosed it; beyond Earth the reveal is purely **concentric**
(`REVEAL_RADIUS`), which makes holes impossible. That concentricity is *why* the Moon and
Mars sit at different distances rather than side by side — each has to fall entirely within
one reveal step. The map is free to grow as a non-circle; it just cannot grow around
something.

Earth's ladder: Old World (+ its seas) → islands and open ocean → the **waters** off the New
World → the New World itself. Giving the coastal stage only the sea is what keeps "Full
Earth" substantial: a small New World is nearly all coastline, so splitting its land across
both stages starved the last one.

The 13-notch ladder: Local · Old World · Islands · New World Coastline · Full Earth · Earth
and Space · Moon · Mars · Deeper Space · Exo Coastline · Full Exo · Outer Galaxy I · Full
Map. In the real game each notch will be unlocked by a progress tech; for now the menu
slider drives it directly.

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

### Panel (`components/UIPanel`)
Deliberately narrow (320px) — the map is the main view. Shows the **known world's potential**:
total base yield of every revealed tile plus a terrain census, which makes it a design
instrument (reveal a stage, read what that frontier is worth). Switches to a two-column
legend past 12 terrains so it never scrolls. Roster tabs are gone until v3 content exists.

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
