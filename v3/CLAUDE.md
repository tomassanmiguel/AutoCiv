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
| `earth` | 0–12 | Old World (holds the palace), ocean channel, New World, islands |
| `space` | 13–20 | Moon disc (r2) + Mars disc (r3) + scattered asteroids |
| `deep` | 21–31 | the deep-space "ocean"; the exoplanet (r5) is embedded here |
| `galactic` | 32–34 | deep space scattered with planets, stars, singularities |
| `battlefield` | 35–36 | outermost 2 rings — where enemies will muster |

≈**4000 tiles** total. A band must be ≥ `2·radius+1` rings wide to contain its body — an
invariant checks bodies don't spill out.

### Generation (`game/world/worldgen.js`)
`generateWorld(seed)` is **pure and deterministic** — no `Math.random`, no React, no game
state. A run persists only its seed.
- **Earth** is shaped by a random split axis: land below the axis threshold is Old World,
  above it is New World, the gap between is the ocean channel, and a noisy radial falloff
  turns the rim to sea. The continent-boundary wobble is **damped to zero at the centre**,
  so the palace is always solidly inland in the Old World.
- **Land terrain** comes from two noise fields plus a latitude term: elevation →
  mountain/hills, high latitude → tundra, then moisture → desert/plains/forest.
- **Coast** is derived, not authored: any water tile touching land becomes shallow `coast`.
  There is **no directional coast tile and no `flipX`** — v2's west-coast mirroring is gone
  (the `full-coast` sprite is isotropic). Shorelines as edge decals are a later job.
- Moon/Mars/exoplanet are **discs stamped into their band**; the exoplanet is a small world
  of its own (exosea rim, exoplains/exohills/exomountain inland).
- **Encampments** are placed round-robin over the six wedges so the angular spread is
  guaranteed rather than hoped for, kept out of the start radius, and spaced apart.

### Invariants (`game/world/invariants.js`)
`validate(world)` returns violations; `generateWorld` **re-rolls deterministically**
(`seed + n·φ`) until clean, up to 16 attempts. This is what makes generation "varied but
predictable". Two classes:
- **Correctness** — palace on passable land, palace ring open, bodies inside their band,
  ≥80% of the Old World walkable from the palace (no mountain wall sealing you in), every
  reveal stage adds ≥15 tiles.
- **Viability** — plains/forest/hills/water all within the start radius, minimum total
  Earth yield per resource (progress especially — it drives the tech tree), continent size
  floors, New World genuinely separated by water, encampments in all six wedges with one in
  early reach.

`node sims/worldgen.mjs 200` is the source of truth: currently **200/200 clean, ~4ms per
world**, and it prints the reveal ladder, Earth yield spread, and an ASCII map.

### Known world (`GameManager`, `regions.js` `STAGES`)
Every tile is stamped a `revealStage` at generation time; a tile is known when
`revealStage <= game.stage`. Encoding it per-tile keeps the geometric nuance (e.g. "New
World Coastline" is land touching water) in the generator, where it belongs.

The 13-notch ladder: Local · Old World · Islands · New World Coastline · Full Earth · Earth
and Space · Moon · Mars · Deeper Space · Exo Coastline · Full Exo · Outer Galaxy I · Full
Map. In the real game each notch will be unlocked by a progress tech; for now the menu
slider drives it directly.

### Map viewer (`components/HexMap`)
- **Camera lives in a ref** and is applied imperatively (`transform` on the content div), so
  pan/zoom **never re-render React** — ported from v2's Tableau.
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
