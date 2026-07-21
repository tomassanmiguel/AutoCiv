# AutoCiv — Project Guide (CLAUDE.md)

> **This is a living document, and it must stay STRICTLY ACCURATE and TIGHT.** With
> **every change** to the game, update this file — both from a **game-design perspective**
> (rules, systems, content, balance) and a **code perspective** (architecture, modules,
> conventions, gotchas). We are building AutoCiv **iteratively, one piece at a time**, and
> this file is the single source of truth that accumulates as we go.
>
> **Updating is not just adding — it is also removing and correcting.** Every edit to the
> game is also an edit to this file: **delete** anything that is now false, **rewrite**
> anything that changed, and **do not leave outdated statements standing.** An inaccurate
> line here is worse than no line at all, because it will be trusted. Before finishing any
> task, re-read the sections you touched and reconcile them with what the code and rules
> now actually do.
>
> **How to update this file after a change:**
> 1. If the change alters a game rule or system, record it under **Game Design** — and
>    **remove or rewrite** any prior rule it supersedes or contradicts.
> 2. If it adds/changes code structure or conventions, update **Architecture & Code** —
>    fix the file tree, paths, and conventions so they match reality; delete stale entries.
> 3. Add a dated one-line entry to the **Changelog** at the bottom.
> 4. Keep it **concise**: no speculation, no aspirational features written as if they exist,
>    no duplication. Document only what is **actually true right now**. If unsure whether
>    something still holds, verify against the code before writing it down.

---

## What AutoCiv Is

AutoCiv is an **idle / roguelike civilization-building game**. You guide a civilization
to dominance **across space and time**, composing a **tableau** (a grid of tiles onto
which you deploy units and buildings) that must withstand **ever more challenging enemy
threats**. It is a *simplified* strategy game — depth comes from the combinations you
assemble, not from micromanagement.

**The core loop** runs in **eras**. Within an era: a **development phase** where the civ
accumulates resources, then a **combat phase** where the player's tableau does battle
against incoming enemies. Completing the loop advances to the next era; this repeats until
the game is won. There are **28 eras** (Stone → Infinity).

Core pillars:
- **Idle:** the game progresses on its own; the player makes periodic meaningful choices.
- **Roguelike:** runs are self-contained and escalate in difficulty; failure ends the run.
- **Tableau-building:** the player assembles pieces (units, buildings, policies, etc.) on a
  tile grid that interact to produce power.
- **Escalating threats:** enemies grow stronger over the eras, from antiquity to space.

> ⚠️ **Design status:** Only what is documented under **Game Systems** below is decided;
> the rest is undefined. Record each rule here **as we implement it** — do not invent
> mechanics ahead of implementation.

> 🚫 **Do NOT use the old prototype as truth.** There is an earlier, **outdated** AutoCiv
> prototype at `../Third Place/autociv/` (including a large `DESIGN.md`). It is from a
> previous, abandoned iteration. **Ignore it** — do not treat its rules, numbers, or code
> as authoritative. The current game's design lives only in this file and in the code here.

---

## Assets

**Source assets** live at the repo root and are the originals — leave them untouched:
- `Music/` — 11 `.wav` tracks: 10 era tracks (`AncientAutoCiv`, `ClassicalAutoCiv`,
  `MedievalAutoCiv`, `AutoCivRenaissance`, `AutoCivModern`, `AutoCivDigital`,
  `AutoCivCrisis`, `AutoCivFrontier`, `AutocivAscension`, `AutoCivFinal`) plus the
  title-screen track `First Fire to Stars` (served as `public/music/title.ogg`).
- `Sprites/Map Tiles/` — 14 terrain tiles (`Plains`, `Forest`, `Mountain`, `Coast`, `Ocean`,
  `Island`, `Space`, `Deep Space`, `Asteroid`, `Mars`, `Moon`, `Exohills`, `ExoPlains`,
  `Exosea`).
- `Sprites/Icons/` — 5 resource icons (`Legitimacy`, `Gold`, `Food`, `Production`, `Progress`).

**Served copies** are what the game actually loads, under `public/` with normalized
lowercase-hyphen names:
- `public/sprites/tiles/*.png`, `public/sprites/icons/*.png` — copied verbatim.
- `public/music/*.ogg` — **transcoded from the WAVs** (the WAVs are 22–52 MB each, ~350 MB
  total; the OGGs are ~2–5 MB, ~33 MB total — too big to ship as WAV). Transcoded with
  `ffmpeg-static` (a devDependency): `libvorbis -q:a 5`. **Re-run the transcode if music
  changes** (see the copy loop history / `ffmpeg-static` binary path).

---

## Tech Stack

Mirrors the sibling `../Third Place/website` setup:
- **React 19** + **Vite 8**, plain **JavaScript / JSX** (no TypeScript).
- **ESLint 9** flat config with `react-hooks` + `react-refresh` plugins.
- No router — screens are managed via local state (see below). No state library yet.

## Running the Game

```bash
npm install      # first time only
npm run dev      # start Vite dev server (localhost)
npm run build    # production build to dist/
npm run preview  # preview the production build
npm run lint     # eslint
```

The dev server prints the localhost URL (default `http://localhost:5173`).

## Version Control

This project is a git repo on branch `main`. **Keep git up to date as we work: every logical
change gets its OWN commit.** After finishing a change, stage and commit it with a clear,
specific message before moving on — do not batch unrelated changes into one commit, and do not
let the working tree drift far ahead of the last commit. End every commit message with the
trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

- Gitignored (not committed): `node_modules/`, `dist/`, the source audio `Music/` (~340 MB of
  WAVs — the served `public/music/*.ogg` copies ARE committed), and `.claude/settings.local.json`.
- No GitHub remote is configured yet (local history only).

## Working Style

- **The user does visual verification — don't spin wheels in the browser preview.** Make the
  change, sanity-check the code, commit it, and let the user confirm how it looks/plays. The
  Claude Preview tooling is flaky here (the screenshot tab and the eval/DOM tab frequently
  desync, and looping audio stalls screenshots), so heavy preview-driven verification wastes
  time. A quick sanity check is fine; full sign-off is the user's.

---

## Architecture & Code

Current layout (grows as we add systems):

```
AutoCiv/
├── index.html                 # Vite entry; loads /src/main.jsx
├── public/
│   ├── favicon.svg
│   ├── sprites/{tiles,icons,ui}/ # served images (ui/ = frames, type silhouettes, title card)
│   └── music/*.ogg             # served soundtrack (transcoded)
├── src/
│   ├── main.jsx               # React root
│   ├── index.css              # global reset + CSS variables (theme tokens)
│   ├── App.jsx / App.css      # SCREEN ROUTER (state-based) + shared .btn styles
│   ├── screens/
│   │   ├── LoadingScreen.jsx/.css  # click-to-start splash (unlocks audio)
│   │   └── TitleScreen.jsx/.css
│   ├── game/                  # framework-free game model + data (no React here)
│   │   ├── GameManager.js     # ROOT: owns GameData + the tick loop / phase machine
│   │   ├── GameData.js        # { era, phase, tick, speed, tableau, civilization }
│   │   ├── TableauData.js     # 9x26 grid of Tiles; per-era visibility + bounds
│   │   ├── CivilizationData.js# resources (threshold), pops, item slot groups
│   │   ├── Tile.js            # one tile; getTooltip()
│   │   ├── data/
│   │   │   ├── eras.js        # 28 eras + soundtrack + eraTitle()
│   │   │   ├── map.js         # ROW/COL unlock eras + 9x26 terrain labels + COLUMN_SPECIALS
│   │   │   ├── terrain.js     # terrain registry + seeded meta-type resolution
│   │   │   ├── slots.js       # Unit/Building slot categories (label + description)
│   │   │   ├── resources.js   # threshold config + T(N) formula + rubber band
│   │   │   └── pops.js        # pop types (Citizen) + output/tooltip helpers
│   │   ├── audio/AudioManager.js  # era-driven cross-fading music
│   │   └── react/GameProvider.jsx # <GameProvider> + useGame() hook
│   └── components/
│       ├── common/{NineSlice,InfoTip}.jsx/.css # 9-slice frame; hover tooltip
│       ├── GameScreen.jsx/.css    # composes the in-game view
│       ├── Tableau/Tableau.jsx/.css   # pan/zoom camera + grid + enemy slots + tooltip
│       ├── UIPanel/UIPanel.jsx/.css   # resources + accordions + PopCard
│       ├── Menu/MenuOverlay.jsx/.css  # framed menu + TEMP era widget
│       ├── Hud/{EraBanner,TickCounter,SpeedControl,TransitionOverlay}.jsx/.css # top HUD + banners
│       └── AudioController.jsx        # syncs the App-owned AudioManager to the era
├── Music/ · Sprites/         # SOURCE assets (originals; see Assets)
└── .claude/launch.json       # preview server config (autociv-dev, port 5173)
```

### Conventions
- **Screens, not routes.** `App.jsx` holds a `screen` state string and renders the
  matching screen component. To add a screen: create `src/screens/<Name>.jsx` (+ `.css`),
  then add a `screen === '<name>'` branch in `App.jsx`. Screens receive navigation
  callbacks as props (e.g. `onNewGame`). We deliberately avoid `react-router` because this
  is a game, not a navigable website. Screen changes go through `App`'s `transitionTo`, which
  **fades to black** (a `.screen-fade` overlay) and swaps the screen mid-fade.
  - **Screen flow:** `loading` → `title` → `game`. The app starts on the **LoadingScreen**
    splash whose only job is to collect the first user gesture (browser autoplay policy). It
    shows "Loading…" while a faux bar fills and **only allows advancing once full**; then a
    click/keypress fades to the title screen, at which point the title music can start.
    Pixel-art styled with the `--font-pixel` (Press Start 2P) font.
- **Styling:** plain CSS files co-located with their component, imported at the top of the
  `.jsx`. Global design tokens (colors, fonts, radius) live as CSS variables in
  `index.css`; reuse them rather than hard-coding values. Shared button classes
  (`.btn`, `.btn-primary`, `.btn-ghost`) live in `App.css`.
- **Theme:** deep space-dark surfaces with a bronze/gold "empire" accent. Display font
  `Cinzel` (serif) for titles/logos, `Inter` for body/UI.
- **Scalable frames:** `<NineSlice src slice width fill repeat>` (`components/common`) wraps a
  box in a frame sprite via CSS `border-image` — corners fixed, edges/center scale to any size.
  Frame PNGs live in `public/sprites/ui/`. `slice` = border inset in SOURCE px (our `Box`
  frames are 1254x1254, sliced at 205); `width` = rendered border thickness. Reuse it for any
  future framed element instead of hand-rolling `border-image`.
- **Model vs. UI:** all game logic/data lives under `src/game/` and is **framework-free**
  (plain classes, no React imports) so it stays testable. React reads it through one bridge:
  `GameManager` exposes `subscribe(fn)` + `getVersion()`; `useGame()` (in `react/GameProvider`)
  wires those into `useSyncExternalStore` and returns the manager. Mutating methods on the
  manager call `_emit()` to bump the version and re-render subscribers. **Add new state to the
  data classes and new mutators to `GameManager`; never hold core game state in React state.**
- **Naming:** components in `PascalCase`, files match component name.

### Gotchas / notes
- `React.StrictMode` is on — effects run twice in dev. `Tableau`'s mount effect is written to
  tolerate this (first pass snaps to fit, second animates the reveal).
- `body { overflow: hidden }` — the game owns the full viewport; **no scrollbars anywhere**
  (a hard UI requirement — the panel must size everything to fit, never scroll).
- **One session-long AudioManager, owned by `App`.** `App` creates it and plays the title
  track on the title screen; in game, `GameScreen`'s `AudioController` drives the era track on
  the *same* manager. Because it's shared, title↔era music **cross-fades** on the same system
  across screen changes (never stopped between screens). It **needs a user gesture** to start
  (autoplay policy) — `App` unlocks it on the first pointer/keydown. Set
  `localStorage['autociv.mute'] = '1'` to disable music (used to keep automated screenshots
  from hanging — a looping media stream blocks network-idle capture).
- **Audio never piles up:** `AudioManager` models playback as channels with one shared fade
  loop — a new track fades in while *all* previous tracks fade out and stop, so rapid era
  changes (e.g. dragging the era slider across track boundaries) can't leave two tracks
  playing at once.

---

## Game Systems (implemented)

Everything here is real and reflected in code. This is the authoritative spec for what
exists; extend it as systems land.

### Eras (`game/data/eras.js`)
- **28 eras**, ordered, indexed 0..27: Stone, Bronze, Iron, Classical, Early Medieval, Late
  Medieval, Renaissance, Exploration, Revolution, Steam, Gilded, Modern, Atomic, Silicon,
  Lunar, Intelligence, Solar, Invasion, Exodus, Frontier, Liminite, Xenotic, Evolution,
  Early Galactic, Late Galactic, Utopian, Time, Infinity. The **era index is the canonical
  era number** used everywhere.
- **Soundtrack:** a title track (`TITLE_TRACK`) plays on the menu, and 10 era tracks each start
  at an era and play until the next track's era: Stone→ancient, Iron→classical, Early
  Medieval→medieval, Renaissance→renaissance, Steam→modern, Silicon→digital, Invasion→crisis,
  Frontier→frontier, Early Galactic→ascension, Time→final. All cross-faded by the shared
  `AudioManager` — on era change and on title↔game screen changes.

### Tableau grid (`game/data/map.js`, `TableauData.js`)
- Grid is **9 rows × 26 columns**. Rows numbered **1 = bottom … 9 = top**; columns
  **1 = left … 26 = right**.
- Each **row** and each **column** has an unlock era. A tile `(row, col)` is **visible when
  `currentEraIndex >= max(rowUnlockEra, colUnlockEra)`**. The unlocked set is always a
  **contiguous rectangle** growing outward from the Stone core.
- **Stone (era 0) start:** rows 2–4 × cols 9–12 = 12 tiles. Columns unlock outward from the
  center; rows grow up into space (Atomic/Lunar/Solar/Invasion) and down to Iron. **Full 9×26
  grid is visible from Utopian (era 25) onward.**
- **Expansions:** row 9 (Invasion) is a new top row of Space with one Asteroid west of the
  deep-space window; Deep Space/Exoplanet extend up into it. Cols 23–26 are far-right "Galactic"
  deep space (23–24 Early Galactic, 25 Late Galactic, 26 Utopian); cols 24–26 scatter special
  tiles per column via `COLUMN_SPECIALS` (col 24: 2 planets + 1 star; cols 25–26: + 1 singularity).
- Above the visible columns sit rows of enemy slots rendered with the **Battlefield tile**
  (hover shows a "Battlefield" tooltip): **3 rows, growing to 4 from the Revolution era**.

### Terrain (`game/data/terrain.js`)
- Grid cells carry a **design label**; some are concrete, some are **meta-types** resolved to
  concrete sprites **deterministically** (seeded RNG, stable across renders). Splits:
  - **Old World** → 50/50 plains/forest.
  - **New World** → plains/forest/mountain in a **5/5/6** ratio.
  - **Ocean** → 2 island tiles (rest ocean).
  - **Deep Space** → 2 asteroid tiles (rest deep space).
  - **Space** → 2 asteroid tiles (rest space), not adjacent to earth/moon/mars.
  - **Exoplanet** → 50/50 exoplains/exohills.
  - **Galactic** → deep space with per-column specials (planet/star/singularity) from `COLUMN_SPECIALS`.
  - Concrete labels: Coast, Mountains(→mountain), Mars, Exosea, Moon, Asteroid.
- **Per-run randomization:** the resolution is seeded, so it is stable *within* a run.
  **`App` generates a fresh random seed in the New Game handler** (not during render) and passes
  it via `GameScreen` → `GameManager`, so the randomized regions differ every run.
- **Coast orientation:** a Coast tile whose eastern neighbor is a land label (New World / Old
  World / Mountains) is a **west coast** and gets `tile.flipX = true` (rendered `scaleX(-1)`)
  so the coastline faces the continent. See `isWestCoast()` / `LAND_LABELS` in `map.js`.

### Camera (`components/Tableau`)
- Mouse-**wheel zoom** (anchored at cursor) + **drag to pan**, clamped between fit-all (most
  zoomed out) and ~2×2 tiles (most zoomed in). `revealFullTableau()` animates a zoom-out to
  fit; it fires on every era change and is the **reusable hook for future era transitions**.
- Hovering a tile shows a tooltip from `tile.getTooltip()` (currently just the terrain name).

### Game loop (`GameManager`, `game/data/resources.js`, `game/data/pops.js`)
- Each era runs: **development** (timer-driven ticks) → **battle** (skipped, banner only) →
  **transition** (banner) → next era, until the last era (`won`). State on `GameData`:
  `phase` (`development`/`battle`/`transition`), `tick` (0..65), `speed`.
- **Development:** **65 ticks/era**, **paused by default**. A speed widget sets
  `paused`/`standard`(1/s)/`fast`(2/s)/`super`(3/s)/`ultra`(5/s); `GameManager` runs a
  `setInterval` at the chosen rate. Each tick: recompute per-tick `output` from population,
  add it to each threshold resource's `value`, then cross any reached thresholds.
- **Threshold resources** (progress/food/production) accumulate a **cumulative** `value` toward a
  **cumulative** `threshold`; each crossing bumps `level` (# thresholds reached). Formula
  `T(N)=T(N-1)+X·1.25^E·n·R` (`resources.js`: `T0`/`X`/`targetPerEra`; **E = 0-based era; n = the
  GLOBAL level and never resets**, so deltas grow monotonically). R rubber-bands the running level
  toward `(era+1)·targetPerEra`. **Food** crossings add pops = **era number**; production/progress
  do nothing yet.
- **Pops** (`pops.js`): only **Citizen** for now (auto-unlocked), producing **1 progress + 1 food
  + 1 production** per pop per tick. All population is Citizens. Start = 1 (`STARTING_CITIZENS`).
- **Phase machine:** dev ends at 65 ticks → `phase='battle'`; the UI's `TransitionOverlay` plays
  the banner and calls back `endBattle()` → `phase='transition'` → banner → `completeTransition()`
  → next era (paused). The temporary era slider calls `setEra` (instant debug jump, no banner).
- **Interpretations** (flagged in `resources.js`): E is 0-based; value/threshold/n all cumulative
  (nothing resets per era); R's `expected = (era+1)·targetPerEra`, actual = level; "Copper
  Age"→Bronze; starting pops = 1.

### HUD (`components/Hud`)
- **Top-row HUD** (`.top-hud`, upper-left): **menu button → EraBanner (`"<Era> Age"`) → TickCounter
  → SpeedControl**, horizontal.
- **TickCounter** — ticks remaining in the era's development phase (counts down 65→0) in a box.
- **SpeedControl** — framed speed buttons (`paused`/`standard`/`fast`/`super`/`ultra`) with tooltips.
- **TransitionOverlay** — battle banner + era-transition banner (fade in → **typewriter**: delete
  the previous age char-by-char, type the new age char-by-char → fade out), driving phase callbacks.
- **AudioController** subscribes to the manager and crossfades the era track on any track-boundary
  era change (loop or debug jump).

### Civilization panel (`CivilizationData.js`, `components/UIPanel`)
- **Framing:** the whole panel is wrapped in the light `Box` 9-slice frame and each dropdown in
  the dark `Box Dark` frame, via `<NineSlice>` (see below). The frames carry a parchment fill,
  so the panel uses a **dark-ink-on-parchment** palette (CSS vars `--ink`/`--ink-soft`/`--brass`
  scoped to `.ui-panel`); slot rows sit on a translucent parchment inset to stay readable.
  Panel width is 400px to fit the ornate border.
- **Legitimacy** — the civ's "HP": a large centered scalar. **Starts at 50.** Stores
  `{ value, output }`.
- **Gold** — icon + value (left) + per-tick delta (right). `{ value, output }`.
- **Food / Production / Progress** — threshold resources (see Game loop): icon + **level number**
  (# thresholds reached) + **bar** (fills from the current level's `floor` to the next
  `threshold`) + per-tick delta. Shape `{ value, output, level, n, floor, threshold }`.
- **Item dropdowns** (accordions, **only one open at a time**, no scrollbars): **Units**,
  **Buildings (7)**, **Policies (5)**, **Population (5)**. The open accordion **flex-grows to
  fill the remaining panel height**; its slots are **large full-width boxes** that divide that
  space equally, **each showing a centered type silhouette** (no inline text).
  - **Slot data** lives in `game/data/slots.js`: `UNIT_CATEGORIES` (9), `BUILDING_CATEGORIES`
    (7), and `POLICY_INFO` / `POPULATION_INFO` (one silhouette + description each). Each entry
    has a `silhouette` (path in `public/sprites/ui/`) and a `description`.
  - **Unit categories (9, display order):** Melee, Ranged, Cavalry, Siege, Utility, Naval,
    Aerial, Astral, Astral Utility. **Units are era-gated** by an `unlock` era id — only
    categories unlocked at the current era show, so early eras show fewer:
    Melee/Ranged/Cavalry from Stone; Utility + Naval from **Bronze** (the brief's "Copper Age");
    Siege from Iron; Aerial from Gilded; Astral Utility from Atomic; Astral from Lunar. Building
    categories: Progress, Production, Gold, Food, Legitimacy, Defense, Utility (not era-gated).
  - **Hover** any slot for a tooltip (`<InfoTip>`): category name + description. Policies use one
    shared silhouette + description.
  - **Population** renders a richer **`PopCard`** for each unlocked pop type: name + output icons
    in the body and the **count** on the far right. Hover shows per-tick output **and the total
    from that pop type** (`popTotalSummary`). Only the Citizen is unlocked for now.
  - `CivilizationData.units` (9) / `buildings` (7) are index-aligned to the category lists;
    `null` = empty slot.

### Menu (`components/Menu/MenuOverlay`)
- Framed hamburger button (in the left HUD) opens a 9-slice-boxed overlay (light panel, dark
  framed buttons). Holds a **temporary Era control** (slider + Prev/Next) that calls
  `GameManager.setEra` as an **instant debug jump** (no banner), plus **Exit to Title**.

---

## Roadmap (loose, piece-by-piece)

- [x] Project scaffold + placeholder title screen.
- [x] UI viewer: tableau grid + camera, enemy slots, civ panel, menu/era widget, era music.
- [x] Development phase: tick engine, resources/thresholds, Citizen pops, speed control, era
  banners + typewriter transition. Battle phase is stubbed (banner only).
- [ ] Real battle phase (enemies in the Battlefield slots + combat resolution).
- [ ] More pop types / specialists; buildings, units, policies actually populating slots.
- [ ] Spend gold; make production/progress do something; legitimacy loss/defeat.

---

## Changelog

- **2026-07-21** — Initial Vite + React scaffold (mirrors Third Place website stack).
  Added state-based screen router in `App.jsx` and a placeholder `TitleScreen`. Established
  theme tokens and shared button styles. This CLAUDE.md created as the living project guide.
- **2026-07-21** — Strengthened the maintenance contract: updates must remove/correct stale
  info and keep the doc strictly accurate and tight, not merely append.
- **2026-07-21** — Built the UI viewer: framework-free `game/` model layer
  (GameManager→GameData→TableauData/CivilizationData/Tile) with a `useSyncExternalStore`
  bridge; 8×22 tableau from the real design sheet (row/col unlock model, 28 eras, seeded
  meta-terrain resolution); pan/zoom camera with reusable `revealFullTableau`; enemy slots;
  civ panel (Legitimacy/Gold/Food/Production/Progress + Units/Buildings/Policies/Population
  accordions); menu overlay with a temporary era widget; era-driven cross-fading music.
  Wired assets into `public/` and transcoded the soundtrack WAV→OGG (~350 MB → ~33 MB).
- **2026-07-21** — Fixes: (1) rewrote `AudioManager` to a channel-based cross-fade so tracks
  can't stack when the era changes rapidly; (2) west-facing coast tiles are mirrored
  (`flipX`/`isWestCoast`); (3) terrain regions now randomize per run (fresh random seed per
  new game) instead of a static map.
- **2026-07-21** — Reworked the panel dropdowns: slots are now large full-width rows that
  flex-fill the panel height, each with a category label + description. Units cut 9→8 and
  Buildings labeled with fixed categories (`game/data/slots.js`); descriptions clamp to the
  row with full text on hover.
- **2026-07-21** — Set up git (branch `main`, per-change commits) and added the
  version-control + working-style notes to this file. Added the reusable `<NineSlice>`
  (border-image) component and framed the info panel (light `Box`) and dropdowns (dark
  `Box Dark`) with 9-slice parchment frames, restyling the panel to dark-ink-on-parchment.
- **2026-07-21** — Added `<InfoTip>` hover tooltips to the five top resources. Fixed ESLint
  errors: moved the map-seed generation to `App`'s New Game handler (was calling `Math.random`
  during render — the map could regenerate on an incidental re-render), and created the
  `AudioManager` inside an effect instead of during render.
- **2026-07-21** — Slots now show a **centered type silhouette** (from `public/sprites/ui/`)
  instead of inline text, with the description on hover. Added a 9th unit category **Aerial**
  and made unit categories **era-gated** (`unlock` era in `slots.js`; "Copper Age" → Bronze,
  "Support" → Utility). Reordered building categories and refreshed all slot descriptions.
- **2026-07-21** — Fixed tiles blurring on zoom (removed `will-change: transform` from the
  tableau content). Rebuilt the title screen around the **Title Card** art (which already
  contains the logo): dropped the old text logo/kicker/tagline/footer/starfield and placed
  parchment-framed (`Box` 9-slice) menu buttons in the card's open sky. The card fits the
  viewport (letterboxed) and uses `container-type: size` so the menu scales via `cq` units.
- **2026-07-21** — Added the title-screen track (`First Fire to Stars` → `public/music/title.ogg`)
  and moved the `AudioManager` up to `App` so it's session-long: title↔era music now cross-fades
  on the same system across screen changes (`AudioController` just syncs the era). Added a
  fade-to-black screen transition (`App.transitionTo` + `.screen-fade`). Trimmed dead App.css.
- **2026-07-21** — Added a pixel-art **LoadingScreen** click-to-start splash as the entry point.
  It captures the first gesture (so audio can autoplay), then fades into the title screen where
  the music begins. Added the `--font-pixel` (Press Start 2P) web font.
- **2026-07-21** — Expanded the map from 8×22 to **9×26**: new top row 9 (Invasion) with an
  Asteroid + Deep Space/Exoplanet extended up, and far-right **Galactic** deep-space columns
  23–26 (Early/Late Galactic, Utopian) that scatter planet/star/singularity tiles per column
  (`COLUMN_SPECIALS`). Added planet/star/singularity terrains + the `Asteroid` label. Enemy
  slots now render the **Battlefield** tile instead of red squares.
- **2026-07-21** — Battlefield-slot tooltip; enemy rows grow 3→4 from the Revolution era.
- **2026-07-21** — Implemented the **development-phase game loop**: `GameManager` tick engine
  (65 ticks/era, speed-controlled), cumulative threshold resources (`resources.js` formula),
  Citizen pops (`pops.js`) producing progress/food/production, food thresholds adding pops.
  Added the left HUD (era banner, speed widget, framed menu), the battle/era **TransitionOverlay**
  (slot-machine era spin), resource level numbers + bar-to-next-threshold, and the Citizen
  `PopCard`. Battle phase is a stubbed banner. Engine verified stable over all 28 eras via sim.
- **2026-07-21** — Loop fixes: threshold `n` is now the global level (never resets per era) with
  the rubber band vs `(era+1)·targetPerEra` (thresholds now strictly monotonic); music crossfades
  reliably via a direct manager subscription; moved the speed control to a top HUD row and added a
  ticks-remaining `TickCounter`; replaced the slot-machine era spin with a **typewriter** effect;
  removed the pop-card silhouette and added a total-output line to its tooltip.
