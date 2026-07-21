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
- `Music/` — 10 `.wav` soundtrack tracks (`AncientAutoCiv`, `ClassicalAutoCiv`,
  `MedievalAutoCiv`, `AutoCivRenaissance`, `AutoCivModern`, `AutoCivDigital`,
  `AutoCivCrisis`, `AutoCivFrontier`, `AutocivAscension`, `AutoCivFinal`).
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

---

## Architecture & Code

Current layout (grows as we add systems):

```
AutoCiv/
├── index.html                 # Vite entry; loads /src/main.jsx
├── public/
│   ├── favicon.svg
│   ├── sprites/{tiles,icons}/  # served images (normalized names)
│   └── music/*.ogg             # served soundtrack (transcoded)
├── src/
│   ├── main.jsx               # React root
│   ├── index.css              # global reset + CSS variables (theme tokens)
│   ├── App.jsx / App.css      # SCREEN ROUTER (state-based) + shared .btn styles
│   ├── screens/
│   │   └── TitleScreen.jsx/.css
│   ├── game/                  # framework-free game model + data (no React here)
│   │   ├── GameManager.js     # ROOT: owns GameData; subscribe/version store for React
│   │   ├── GameData.js        # { era, tableau, civilization } — full game status
│   │   ├── TableauData.js     # 8x22 grid of Tiles; per-era visibility + bounds
│   │   ├── CivilizationData.js# resources + item slot groups (UI panel data)
│   │   ├── Tile.js            # one tile; getTooltip()
│   │   ├── data/
│   │   │   ├── eras.js        # 28 eras + soundtrack (era -> track)
│   │   │   ├── map.js         # ROW/COL unlock eras + 8x22 terrain labels (from sheet)
│   │   │   ├── terrain.js     # terrain registry + seeded meta-type resolution
│   │   │   └── slots.js       # Unit/Building slot categories (label + description)
│   │   ├── audio/AudioManager.js  # era-driven cross-fading music
│   │   └── react/GameProvider.jsx # <GameProvider> + useGame() hook
│   └── components/
│       ├── GameScreen.jsx/.css    # composes the in-game view
│       ├── Tableau/Tableau.jsx/.css   # pan/zoom camera + grid + enemy slots + tooltip
│       ├── UIPanel/UIPanel.jsx/.css   # resources + accordions
│       ├── Menu/MenuOverlay.jsx/.css  # menu button + overlay + TEMP era widget
│       └── AudioController.jsx        # side-effect: keeps music synced to era
├── Music/ · Sprites/         # SOURCE assets (originals; see Assets)
└── .claude/launch.json       # preview server config (autociv-dev, port 5173)
```

### Conventions
- **Screens, not routes.** `App.jsx` holds a `screen` state string and renders the
  matching screen component. To add a screen: create `src/screens/<Name>.jsx` (+ `.css`),
  then add a `screen === '<name>'` branch in `App.jsx`. Screens receive navigation
  callbacks as props (e.g. `onNewGame`). We deliberately avoid `react-router` because this
  is a game, not a navigable website.
- **Styling:** plain CSS files co-located with their component, imported at the top of the
  `.jsx`. Global design tokens (colors, fonts, radius) live as CSS variables in
  `index.css`; reuse them rather than hard-coding values. Shared button classes
  (`.btn`, `.btn-primary`, `.btn-ghost`) live in `App.css`.
- **Theme:** deep space-dark surfaces with a bronze/gold "empire" accent. Display font
  `Cinzel` (serif) for titles/logos, `Inter` for body/UI.
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
- **Audio needs a user gesture** to start (browser autoplay policy); entering via the New
  Game click usually grants it, and `AudioController` also retries on the first
  pointer/keydown. Set `localStorage['autociv.mute'] = '1'` to disable music (used to keep
  automated screenshots from hanging — a looping media stream blocks network-idle capture).
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
- **Soundtrack:** 10 tracks, each starting at an era and playing until the next track's era:
  Stone→ancient, Iron→classical, Early Medieval→medieval, Renaissance→renaissance,
  Steam→modern, Silicon→digital, Invasion→crisis, Frontier→frontier, Early Galactic→ascension,
  Time→final. Cross-faded by `AudioManager` on era change.

### Tableau grid (`game/data/map.js`, `TableauData.js`)
- Grid is **8 rows × 22 columns**. Rows numbered **1 = bottom … 8 = top** (matches the design
  sheet); columns **1 = left … 22 = right**.
- Each **row** and each **column** has an unlock era. A tile `(row, col)` is **visible when
  `currentEraIndex >= max(rowUnlockEra, colUnlockEra)`**. The unlocked set is always a
  **contiguous rectangle** growing outward from the Stone core.
- **Stone (era 0) start:** rows 2–4 × cols 9–12 = 12 tiles. Columns unlock outward from the
  center; rows grow up into space (Atomic/Lunar/Solar) and down to Iron. **Full 8×22 grid is
  visible from Xenotic (era 21) onward.**
- Above the visible columns sit **3 rows of enemy slots** (placeholder red squares; where
  enemies will appear).

### Terrain (`game/data/terrain.js`)
- Grid cells carry a **design label**; some are concrete, some are **meta-types** resolved to
  concrete sprites **deterministically** (seeded RNG, stable across renders). Splits:
  - **Old World** → 50/50 plains/forest.
  - **New World** → plains/forest/mountain in a **5/5/6** ratio.
  - **Ocean** → 2 island tiles (rest ocean).
  - **Deep Space** → 2 asteroid tiles (rest deep space).
  - **Space** → 2 asteroid tiles (rest space), not adjacent to earth/moon/mars.
  - **Exoplanet** → 50/50 exoplains/exohills.
  - Concrete labels: Coast, Mountains(→mountain), Mars, Exosea, Moon.
- **Per-run randomization:** the resolution is seeded, so it is stable *within* a run but
  **`GameScreen` passes a fresh `Math.random()` seed to `GameManager` each new game**, so the
  randomized regions differ every run.
- **Coast orientation:** a Coast tile whose eastern neighbor is a land label (New World / Old
  World / Mountains) is a **west coast** and gets `tile.flipX = true` (rendered `scaleX(-1)`)
  so the coastline faces the continent. See `isWestCoast()` / `LAND_LABELS` in `map.js`.

### Camera (`components/Tableau`)
- Mouse-**wheel zoom** (anchored at cursor) + **drag to pan**, clamped between fit-all (most
  zoomed out) and ~2×2 tiles (most zoomed in). `revealFullTableau()` animates a zoom-out to
  fit; it fires on every era change and is the **reusable hook for future era transitions**.
- Hovering a tile shows a tooltip from `tile.getTooltip()` (currently terrain name + coords).

### Civilization panel (`CivilizationData.js`, `components/UIPanel`)
- **Legitimacy** — the civ's "HP": a large centered scalar. **Starts at 50.** Stores
  `{ value, output }`.
- **Gold** — icon + value (left) + per-tick delta (right). `{ value, output }`.
- **Food / Production / Progress** — icon + **progress bar** (`value / threshold`) + per-tick
  delta. `{ value, output, threshold }`. Threshold = amount to unlock the next upgrade.
- All values/outputs currently **0** except legitimacy=50; thresholds are a **placeholder
  (100)** so bars render — real thresholds arrive with those systems.
- **Item dropdowns** (accordions, **only one open at a time**, no scrollbars): **Units (8)**,
  **Buildings (7)**, **Policies (5)**, **Population (5)**. The open accordion **flex-grows to
  fill the remaining panel height**; its slots are **large full-width rows** that divide that
  space equally.
  - **Units** and **Buildings** slots are **fixed categories** (label + description) defined in
    `game/data/slots.js`. Unit categories (8): Melee, Ranged, Cavalry, Siege, Utility, Naval,
    Astral, Astral Utility. Building categories (7): Food, Progress, Gold, Production,
    Legitimacy, Utility, Defense. Each row shows the category label, an EMPTY/occupied state,
    and a description of what it does (**placeholder text** in `slots.js` — mechanics TBD).
    Policies/Population are generic empty slots for now.
  - Descriptions are **line-clamped** to the row height (fuller in taller windows) with the
    complete text available on **hover** (title attr). `CivilizationData.units/buildings` are
    index-aligned to the category lists.

### Menu (`components/Menu/MenuOverlay`)
- Floating hamburger button (upper-left) opens an overlay above the tableau. Currently holds a
  **temporary Era control** (slider + Prev/Next, tagged "temporary") that drives the viewer via
  `GameManager.setEra`, plus **Exit to Title**.

---

## Roadmap (loose, piece-by-piece)

- [x] Project scaffold + placeholder title screen.
- [x] UI viewer: tableau grid + camera, enemy slots, civ panel, menu/era widget, era music.
- [ ] Replace the temporary era widget with real development→combat era progression.
- [ ] Populate item slots (units/buildings/policies/population) as those systems land.
- [ ] Enemy content in the enemy slots + combat resolution.

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
