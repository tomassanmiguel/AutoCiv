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
- `Sprites/Icons/` — 10 icons: 5 resources (`Legitimacy`, `Gold`, `Food`, `Production`, `Progress`)
  + 3 unit/building stats (`Speed`, `Attack`, `Defense`) + 2 gold actions (`Repair`, `Upgrade`).

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
│   │   ├── Tile.js            # one tile; getTooltip(); `occupant` (deployed unit/building)
│   │   ├── data/
│   │   │   ├── eras.js        # 28 eras + soundtrack + eraTitle()
│   │   │   ├── map.js         # ROW/COL unlock eras + 9x26 terrain labels + COLUMN_SPECIALS
│   │   │   ├── terrain.js     # terrain registry (+ placement class) + canPlaceOn + seeded resolution
│   │   │   ├── slots.js       # Unit/Building slot categories (label + description)
│   │   │   ├── resources.js   # threshold config + T(N) formula + rubber band
│   │   │   ├── advancements.js# 560-entry progress pool (per era) + IMPLEMENTED registry
│   │   │   ├── units.js       # unit defs (Warrior/Wolf/Slinger + era-1 Bear/Lion) + stat helpers
│   │   │   ├── enemies.js     # enemy host generation (Horde/Elite/Group) + ENEMY_ROSTER
│   │   │   ├── buildings.js   # building defs (Mud Wall/Pier) + hp/effect/outputs helpers
│   │   │   ├── costs.js       # gold cost formulas (repair/upgrade/specialist/mercenary)
│   │   │   ├── policies.js    # policy defs (Burial Rites)
│   │   │   └── pops.js        # pop types (Citizen + specialists) + output/tooltip helpers
│   │   ├── audio/AudioManager.js  # era-driven cross-fading music
│   │   └── react/GameProvider.jsx # <GameProvider> + useGame() hook
│   └── components/
│       ├── common/{NineSlice,InfoTip,IconText}.jsx/.css # 9-slice frame; tooltip; inline-icon prose
│       ├── GameScreen.jsx/.css    # composes the in-game view
│       ├── Tableau/{Tableau,TileCard,CombatFx}.jsx/.css # camera + grid + placement + cards + combat floats
│       ├── UIPanel/UIPanel.jsx/.css   # resources + accordions + PopCard (+ replace/pick flash, fill juice)
│       ├── Menu/MenuOverlay.jsx/.css  # framed menu + TEMP era widget
│       ├── Hud/{EraBanner,TickCounter,SpeedControl,TransitionOverlay}.jsx/.css # top HUD + banners
│       ├── Progress/ProgressOverlay.jsx/.css # advancement chooser (cards/confirm/replace)
│       ├── Production/ProductionPrompt.jsx/.css # build flow prompt (pick / place, Back / Skip)
│       ├── Prep/CombatPrep.jsx/.css   # combat-preparation banner (Begin Combat button)
│       ├── Victory/{VictoryScreen,DefeatScreen}.jsx/.css # end-game popups (Victory / Defeat)
│       ├── Widgets/WidgetRail.jsx/.css # far-right widget rail (trophy/flask re-summon overlays)
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
- **Icons over words in prose (PERVASIVE — do this everywhere).** Gameplay descriptions,
  effects, and tooltips must show the **icon** for a type, not the word — resources
  (`:food:`/`:gold:`/`:production:`/`:progress:`/`:legitimacy:`), stats
  (`:speed:`/`:attack:`/`:defense:`), and unit/building/policy/pop types
  (`:cavalry:`/`:ranged:`/`:melee:`/`:policy:`/… — e.g. write ":cavalry: unit", not "cavalry
  unit"). Author strings with `:token:` markup; `<IconText>` (`components/common`) swaps tokens
  for inline icons that scale with the text. **`InfoTip` routes every string tooltip through
  IconText automatically**, so any `text=""` prop just works; for prose rendered outside a tooltip
  (slot lines, on-card/JSX descriptions) wrap it in `<IconText>` yourself. Token→icon map is at the
  top of `IconText.jsx`; add new tokens there. HP is `:defense:`. Any NEW prose must follow this.
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
- **`InfoTip` anchors to the element's bounding box and portals to `<body>`.** The floating tooltip
  is `position: fixed`, placed just beside the hovered element's `getBoundingClientRect()` (to the
  **left**, flipping right near the screen edge) and vertically centered on it — so it **never
  covers** the card/slot it describes (a `GAP` of 16px also clears the on-tile card's 1.42× hover
  growth). It renders through `createPortal` so a **transformed ancestor** can't become its
  containing block and throw the position off. Don't put `position: fixed` overlays inside a
  `transform`ed element and expect viewport coordinates.

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
- **Smooth era growth:** unlocking tiles shifts the grid's content origin (`minCol`/`maxRow`/
  enemy-row count), which would teleport every existing tile. On era change the camera is
  **counter-translated by that shift first** (via `prevLayoutRef`) so the current view holds
  still, then the zoom-out animates — no jolt.
- Hovering an empty tile shows a tooltip from `tile.getTooltip()` (terrain name). Occupied tiles
  instead show their **on-tile card** (`TileCard`) with its own hover tooltip (see Production/build).
- During production **placement**, valid tiles flash yellow / occupied red and are click-to-build.

### Game loop (`GameManager`, `game/data/resources.js`, `game/data/pops.js`)
- Each era runs: **development** (timer-driven ticks) → **preparation** (spend gold /
  arrange the board) → **battle** (25s of combat) → **transition** (banner) → next era,
  until the last era (`won`) or legitimacy 0 (`defeated`). State on `GameData`: `phase`
  (`development`/`prep`/`battle`/`transition`), `tick` (0..65), `speed`.
- **Development:** **65 ticks/era**, **paused by default**. A speed widget sets
  `paused`/`standard`(1/s)/`fast`(3/s)/`super`(5/s)/`ultra`(10/s); `GameManager` runs a
  `setInterval` at the chosen rate. Each tick: recompute per-tick `output` from population,
  add it to each threshold resource's `value`, then cross any reached thresholds.
- **Threshold resources** (progress/food/production) accumulate `value` toward the current level's
  `threshold`; on reaching it, `value` **resets** (overflow carries), `level` (# thresholds reached)
  increments, and the **per-level threshold grows**: `threshold(N)=threshold(N-1)+X·1.25^E·n·R`
  (`resources.js`: `T0`/`X`/`targetPerEra`; **E = 0-based era; n = the GLOBAL level, never resets**).
  Because the delta is always positive, **each level's requirement is strictly higher than the last**.
  R rubber-bands the running level toward `(era+1)·targetPerEra`. **Food** crossings add pops via
  `addPops(era+1)`; **progress** crossings open an advancement selection; **production** crossings
  open a build selection (both see below). **Gold** also accrues per tick (`gold.value +=
  gold.output`), driven by Trader specialists. At the **end of development** each era, deployed
  buildings accrue their end-of-era output (Pier food) into resources + their lifetime total.
- **Pops** (`pops.js`): **Citizen** (generalist: 1 progress/food/production each per tick) plus
  unlockable **specialists** — Builder (+5 production), Farmer (+5 food), Trader (+5 gold). Start = 1
  Citizen (`STARTING_CITIZENS`). **Growth split** (`addPops`): each new pop alternates by a running
  `growthParity` — **EVEN → a specialist** (cycled bottom-to-top via `specialistCursor`), **ODD →
  citizen**; with no specialists unlocked, all growth is citizens.
- **Phase machine:** dev ends at 65 ticks → `_startPrep` (`phase='prep'`; no ticking — the
  player spends gold and arranges the board, then presses **Begin Combat** → `beginCombat` →
  `_startCombat`) → `phase='battle'`, 25s combat (see below) → `_endCombat` →
  `phase='transition'` → the `TransitionOverlay` typewriter → `completeTransition()` → next
  era (paused). Completing the **final era (Infinity)** sets
  `data.won = true` (Victory); legitimacy hitting 0 sets `data.defeated = true` (Defeat) and freezes
  the game. The temporary era slider calls `setEra` (instant debug jump; resets `won`/`defeated`,
  regenerates the enemy host).
- **Interpretations** (flagged in `resources.js`): E is 0-based; `value` resets per level (carries
  overflow) while the per-level threshold grows; n = global level (never resets); R's
  `expected = (era+1)·targetPerEra`, actual = level; "Copper Age"→Bronze; starting pops = 1.

### Advancements / progress selection (`game/data/advancements.js`, `components/Progress`)
- **Pool:** `advancements.js` holds all **560** advancements (28 eras × 20, verbatim names,
  misspellings kept), each with a stable `id` and `eraIndex`. `IMPLEMENTED` (keyed by name) lists
  the few that currently do something and what they unlock (`kind`: `unit`/`building`/`pop`/`policy`/
  `modifier`). Only the **Stone** subset is implemented so far (Warrior is pre-unlocked in Melee).
- **Trigger:** crossing a progress threshold sets `data.selection` (a small state machine) and holds
  the game **paused** (`_restartTimer` is gated on `!selection`). Multiple owed choices queue via
  `pendingProgress`; each resolves then opens the next. Choices earned but unresolved are dropped on
  era change (`_beginEra`/`setEra` clear `selection`+`pending`).
- **Options:** draw up to 3 **unchosen** advancements with `eraIndex <= current era`, weighted by
  **2^eraIndex** (so current-era options dominate). Only implemented ones are weighted; if fewer than
  3, the rest are unimplemented **"Not Yet Implemented"** filler cards. Card = name + era + corner
  silhouette (policy→policy icon, pop→pop icon, unit/building→the unlocked type's category
  silhouette, modifier→defense icon, unimplemented→`?`) + description. Hover highlights + enlarges.
  If the era's pool is fully **exhausted** (nothing unchosen left), the owed choice is silently
  **skipped** rather than opening a zero-card selection (no soft-lock).
- **Stages** (`selection.stage`): `choose` (3 cards + **Hide**; hidden cards restored by the rail
  flask) → on a full-slot unlock, `confirm` (an "Are you sure?" with **don't-ask-again** →
  `civ.askBeforeReplace`) → `replace` (chooser hidden with no re-show; the panel's candidate slots
  **flash red** and are clickable → `resolveReplace`; **Cancel** returns to `choose`). Empty slots
  fill immediately.
- **Unlock rules:** unit/building fills its category slot(s) (a multi-type item fills each empty type
  slot; only when **all** its type slots are full does it go to replace). Policies use the 5 generic
  slots; specialists use population slots **1–4** (Citizen slot 0 is never replaced). Unlocking a
  specialist **converts 1 citizen** to it if ≥2 citizens; **replacing** a specialist splits its pops
  **half → new type, half → citizens** (`floor` to the new type). `modifier` (Clothes → `+5`
  `modifiers.unitHpBonus`) applies immediately with no slot **and retroactively bumps the hp/maxHp of
  units already on the board**.
- **Resume:** resolving clears the selection and resumes at `data.speed` — the speed selected before
  (or changed during) the selection; the speed control stays clickable (backdrop sits below the HUD).

### Production / build (`components/Production`, `components/Tableau/TileCard`)
- Crossing a **production** threshold opens a `selection` of `type:'production'` (game paused), a
  two-stage flow driven by `ProductionPrompt`:
  - **pick:** the panel's **unlocked unit/building** slots flash **yellow** and are clickable
    (`pickBuild`). Units auto-expands (unless Buildings already open). **Skip** declines the build.
  - **place:** valid tiles on the tableau flash **yellow** (empty) / **red** (occupied → replace);
    clicking one runs `placeAt`, creating the instance (`tile.occupant`). **Back** returns to pick.
    Validity = tile visible this era **and** `canPlaceOn(unit/building.placement, terrain)` (terrain
    `place` class: land/coast/sea/space); Warrior/Wolf/Slinger are land, Pier is coast.
- **Instances** live on `Tile.occupant` (`{ kind, key, level, hp, maxHp, damaged, lifetimeOutput? }`)
  and persist across eras. **Deployed buildings** produce their end-of-era output (Pier food) into
  resources + `lifetimeOutput` (`_accrueBuildingOutputs`).
- **On-tile cards** (`TileCard`): ~70% of the tile, centered, **enlarge to fill on hover** (which
  shows a rich tooltip and hides the tile tooltip). Corner **level** badge. Units show name + type +
  **Speed/Atk/Def icons**; buildings show name + type + **Def + current outputs** (lifetime total in
  the tooltip). **Damaged** instances gray out and read "(damaged)". The tile sprite lives on its own
  `.tile-bg` layer so the west-coast mirror never flips the card.
- **Fill juice:** filling a roster slot (advancement unlock) sets `data.justFilled`; the panel opens
  that tab and the slot **remounts** (keyed by occupant) to play a "slam" pop-in animation. The slam
  is gated to the just-filled slot (a `.slam` class) so merely switching tabs — which now remounts
  every card, since only the open group renders a body — doesn't replay it.
- All flashing (replace red / pick yellow / tile placement) is a slow ~1.4s pulse.

### Gold economy (`game/data/costs.js`, `GameManager`, `Tableau`, `TileCard`, `UIPanel`, `Prep`)
Gold (accrued per tick + from empty combat columns) is spent in five ways. All costs live
in `costs.js` (E = 0-based era, L = current level, rounded): unit upgrade `50·1.25^E·L^1.5`;
building upgrade `100·1.25^E·L^1.5`; unit repair `25+15E`; building repair `40+20E`;
specialist convert `(75+25E)·1.25^E`; mercenary hire `(50+25E)·1.25^E` (mercenary cost is
**not** in the design brief — chosen to sit between a repair and a specialist). Every spend
button is **grayed out when gold is insufficient**; the mutator re-checks and deducts.
- **Repair / Upgrade** (`repairOccupant` / `upgradeOccupant`): each deployed **on-tile card**
  (`TileCard`) shows one gold-cost action button — **Repair** (`:defense:` restore, repair
  icon) on a **damaged** instance, else **Upgrade** (upgrade icon, `level+1` → higher Atk/HP,
  HP recomputed + topped up). Offered during **development + preparation** only (`_canEconomize`:
  not battle/transition, no open selection, not won/defeated). Both replay a **green flash +
  grow/shrink** "pop" on the card (`occ.fxSeq`/`fxKind`, `_fxTag`; suppressed in combat).
- **Specialist convert** (`convertSpecialistWithGold` / `specialistConvertInfo`): each unlocked
  specialist **PopCard** carries a **Convert +N** button (N = `era+1`) that spends gold to turn
  N citizens into that specialist. Disabled without N citizens or enough gold; flashes green
  (`data.popFx`). Citizen slot never shows it.
- **Mercenaries** (`hireMercenary` / `mercEligible`): during **prep**, every empty tile that can
  host ≥1 of your unlocked roster units shows a **Hire** button (+ a gold ring when the hire is
  affordable). Clicking spawns a **random valid roster unit** (at that slot's level) flagged
  `mercenary` (dashed frame) — it fights this one battle and **disbands when the battle ends**
  (removed in `_endCombat`, and in `_defeat` so a lost battle leaves no stragglers). Mercenaries
  can't be repaired/upgraded (no sinking gold into a disposable unit). Hire buttons are **hidden
  while a reposition drag is active** so they can't get in the way of the drop.
- **Reposition** (`canReposition` / `moveUnit`, free): **units** (not buildings) can be **dragged**
  to a valid **empty** tile during dev/prep — **and while choosing a build's location** (drag a unit
  aside to make room for the building). On grab (past a small threshold) valid tiles flash yellow,
  the source dims, and a labelled ghost follows the cursor (positioned imperatively so ticks don't
  reset it); dropping on a valid tile moves the unit, any invalid drop snaps back. You can't displace
  an occupied tile. During placement a real drag suppresses the source tile's placement click (via
  `movedRef`), so a plain click still places/replaces but a drag only moves.
- **CombatPrep** (`components/Prep`): a non-blocking horizontal bar pinned to the **bottom** of the
  tableau (mounted in `GameScreen`) shown in the `prep` phase with a prominent **Begin Combat**
  button; kept at the bottom so it never covers the enemy formation up top. The tableau + panel stay
  interactive so all the above can happen. The enemy host is visible on the battlefield throughout prep.

### Combat (`GameManager` combat methods, `game/data/enemies.js`, `Tableau/TileCard`)
- **Enemy host** (`generateHost`, regenerated each era, visible as a preview during development):
  one composition — **Horde** (Classical+, units 1–5 eras ago, 50% of the battlefield), **Elite**
  (10%; current-era units +1 upgrade OR last-era units +2 upgrades), or **Group** (25%; current +
  previous era). Units only spawn in columns whose **terrain can host** them (`columnPlaces` +
  `canPlaceOn`); each column is re-ordered **melee/cavalry front, ranged back** (packed from the
  front slot). Enemies never spawn support/buildings. Roster of enemy unit keys per era = `ENEMY_ROSTER`
  (only era **−1** = Bear/Lion/Wolf and era 0 = Warrior/Slinger/Wolf are defined so far); a composition
  whose exact era window has no rostered units **falls back** to all units at/below the current era, so
  hosts are never empty. Enemies fade after each combat.
- **Loop:** `_combatStep` runs every 50ms real, advancing combat time by the speed multiplier (the
  speed widget = 1x/3x/5x/10x); a battle is `COMBAT_DURATION = 25` combat-seconds. Attacks resolve
  **bottom-to-top, left-to-right**; each unit attacks on its **cooldown** (fractional, floored at
  `MIN_COOLDOWN = 1`s). **Melee/cavalry** only strike as the column's front-most friendly **unit**
  (buildings shield the enemy as a front-line target but do NOT block your own melee); **ranged**
  strike the front enemy at any range; an **empty column** yields **gold** (player) / **legitimacy
  damage** (enemy). Buildings are targetable/front-line but don't attack. HP≤0 → `damaged` (inactive
  until repaired). Non-destroyed instances **heal to full** at combat end (damage doesn't persist);
  destroyed ones stay damaged. Wolf `shift`: after attacking, moves to an adjacent empty valid space.
- **Rendering:** enemies render as red-framed `TileCard`s in the battlefield slots. In combat the Def
  stat shows **remaining HP** (reddening via `color-mix` as it drops; full value outside combat) and a
  **cooldown bar** ticks below each unit. `TickCounter` shows battle seconds remaining. **DefeatScreen**
  mirrors Victory (rail **💀** re-summons it). Instances carry combat state on the same object
  (`hp`/`maxHp`/`damaged`/`cdTimer`/`lastAttackSeq`).
- **Juice** (driven by `data.combatEvents`, rebuilt each step, keyed by `combatSeq`): `CombatFx`
  (inside `.tableau-content`) floats **damage / gold-gained / legitimacy-lost** numbers over the
  source cell; each unit **thrusts** toward the enemy on attack (a `.tc-lunge` wrapper keyed by
  `lastAttackSeq` remounts to replay it); destroyed cards **shake then fade to gray** (CSS on
  `.damaged`); the panel gold/legitimacy values **pulse** as they change during combat.

### HUD (`components/Hud`)
- **Top-row HUD** (`.top-hud`): its own strip at the top of the tableau window (does NOT overlap
  the tiles — `.tableau-window` is a column, HUD strip then tableau). Order: **EraBanner
  (`"<Era> Age"`) → menu button → TickCounter → SpeedControl**, horizontal.
- **TickCounter** — ticks remaining in development (65→0), a **⚔** glyph during preparation,
  or **seconds remaining** during a battle.
- **SpeedControl** — framed speed buttons (`paused`/`standard`/`fast`/`super`/`ultra`); the same
  control accelerates combat (as a time multiplier).
- **TransitionOverlay** — a brief **"Battle"** announcement, then the era-transition banner (fade
  in → **typewriter** delete/type the age → fade out → `completeTransition`). The fight is **held**
  (`data.combatIntro`) until the "Battle" banner clears — the overlay calls `dismissCombatIntro()`
  when it finishes, and `_combatStep` no-ops until then, so combat never runs under the banner.
- **AudioController** subscribes to the manager and crossfades the era track on any track-boundary
  era change (loop or debug jump).

### End-game & widgets (`components/Victory`, `components/Widgets`)
- **VictoryScreen** / **DefeatScreen** — mirror-image centered 9-slice popups over a dimmed tableau,
  shown when `game.data.won` (final era completed) / `game.data.defeated` (legitimacy 0). Each reads
  **"Victory"** / **"Defeat"** and offers **Hide** (keep the map/battlefield inspectable) and **Return
  to Title** (`onExit`); the `hidden` flags live on `GameScreen`.
- **WidgetRail** — a vertical stack of framed icon buttons on the **right edge of the tableau window**
  (below the HUD). Contextual widgets: **Victory trophy** (🏆), **Defeat skull** (💀), and the
  **Progress flask** — each re-opens its hidden overlay. Add future widgets here.

### Civilization panel (`CivilizationData.js`, `components/UIPanel`)
- **Framing:** the whole panel is wrapped in the light `Box` 9-slice frame and each dropdown in
  the dark `Box Dark` frame, via `<NineSlice>` (see below). The frames carry a parchment fill,
  so the panel uses a **dark-ink-on-parchment** palette (CSS vars `--ink`/`--ink-soft`/`--brass`
  scoped to `.ui-panel`); slot rows sit on a translucent parchment inset to stay readable.
  Panel width is 400px to fit the ornate border.
- **Legitimacy** — the civ's "HP": icon + value on one compact centered row (kept small so the
  dropdowns get height). **Starts at 50.** Stores `{ value, output }`.
- **Gold** — icon + value (left) + per-tick delta (right). `{ value, output }`.
- **Food / Production / Progress** — threshold resources (see Game loop): icon + **level number**
  (# thresholds reached) + **bar** (`value / threshold` toward the current level's requirement) +
  per-tick delta. Shape `{ value, output, level, threshold }`.
- **Item dropdowns** (accordions, **only one open at a time**, no scrollbars): **Units**,
  **Buildings (7)**, **Policies (5)**, **Population (5)**. While one group is **expanded** the other
  three are **hidden entirely** (`soloOpen`) so the open group — the only one with the dark `Box
  Dark` frame and a body — fills the whole dropdown area and its cards get maximum room; collapse it
  via its header to bring the **slim clickable tabs** back and pick another. This holds during a
  build **pick** too (it defaults **Units** open so the yellow pickable slots show; collapse to
  switch to Buildings). **empty** slots show a centered type silhouette, while
  **filled** slots render a compact **item card** — the **type** shows as an ICON next to the name
  (no "MELEE"/"POLICY" text, no corner watermark, so cards stay compact and the policy effect fits);
  units then show **Speed/Atk/Def stat icons** (`/sprites/icons/{speed,attack,defense}.png`,
  level-scaled, incl. the Clothes HP bonus); buildings/policies show the effect. Descriptions/effects always report the
  **current** value for the current era + level (e.g. the Pier's food), never the upgrade sequence
  or per-level deltas. Full descriptions (icon stats for units) on hover. During an advancement **replace**, the active group's accordion force-opens
  and its candidate slots **flash red** and are clickable (`resolveReplace`). `CivilizationData`
  roster slots hold `{ key, level }` (Warrior pre-fills Melee); `pops` holds counts by type.
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
    from that pop type** (`popTotalSummary`). The Citizen starts unlocked; specialists (Builder/
    Farmer/Trader) unlock via advancements. Each specialist card also has a gold **Convert +N**
    button (dev/prep only) — see **Gold economy**.
  - `CivilizationData.units` (9) / `buildings` (7) / `policies` (5) are index-aligned to the
    category lists; `null` = empty slot, else `{ key, level }`.

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
- [x] Progress selection: threshold → paused 3-card advancement chooser (hide/re-muster, weighted
  pool), unlock into roster slots (fill / confirm / replace), specialists + pop-growth split.
- [x] Production/build flow: choose a unit/building, placement mode (valid tiles flash), deploy an
  instance onto a tile with an on-tile card; damaged appearance; slot-fill "slam" juice.
- [x] Battle phase: per-era enemy hosts, 25s combat (cooldowns/targeting/gold/legitimacy), damaged
  state, Defeat screen, and **combat juice** (attack thrust, floating damage/gold/legitimacy numbers,
  death shake→gray, panel value pulses). Reddening Def + no-persist damage done; Clothes retroactive.
- [x] Gold economy: a **preparation** phase; **repair**/**upgrade** deployed instances; **buy
  specialists**; **hire mercenaries**; **drag-reposition** units. (Spend gold is live.)
- [ ] Battle abilities/policies that need combat: Burial Rites (progress on death), more unit
  abilities.

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
- **2026-07-21** — Smoothed the era map growth: on era change the camera is counter-translated by
  the grid's content-origin shift (`prevLayoutRef`) before the zoom-out animates, so tiles no
  longer teleport/jolt.
- **2026-07-21** — Rebalanced speeds: Fast 2→**3** t/s, Super 3→**5** t/s, Ultra 5→**10** t/s
  (`SPEED_TPS` + SpeedControl tooltips).
- **2026-07-21** — Added the **Victory screen** (`components/Victory`): a light-`Box` 9-slice
  "Victory" popup shown on completing the final era (`won`), with **Hide** (keeps the map
  inspectable) and **Return to Title**. Added a far-right **WidgetRail** (`components/Widgets`)
  whose **trophy** widget re-summons the popup after it's hidden.
- **2026-07-21** — Implemented the **progress / advancement selection**. Added the 560-entry
  advancement pool + `IMPLEMENTED` registry (`data/advancements.js`) and unit/building/policy/
  specialist defs (`units.js`/`buildings.js`/`policies.js`/`pops.js`; Warrior pre-unlocked). A
  progress threshold now pauses the game and opens a weighted 3-card chooser (`ProgressOverlay`)
  with Hide/re-muster (rail flask), fill-or-replace into roster slots (confirm + don't-ask-again,
  red-flashing candidate slots), specialist unlock/citizen-conversion, and the EVEN/ODD pop-growth
  split. Filled panel slots now render item cards. Engine flows verified via a Node sim; an
  adversarial multi-agent review pass ran over the slice. Production/build flow is next.
- **2026-07-21** — Review fixes on the progress slice: tick now counts before opening a choice (no
  free extra accumulation tick per advancement); unlocking a policy/specialist fills one slot, not
  all; replace-candidate slots keep their tooltip + gained keyboard activation.
- **2026-07-21** — Unit/building **stat icons** (Speed/Attack/Defense served into
  `public/sprites/icons`) replace the text stat line; building effects report the **current**
  era/level value (e.g. Pier food) not the upgrade sequence; card formatting: smaller corner
  silhouettes, no icon/text overlap, wrapping policy text, larger stat icons.
- **2026-07-21** — Implemented the **production / build flow** (`components/Production`,
  `Tableau/TileCard`). A production threshold pauses and opens a pick→place selection: unlocked
  units/buildings flash yellow in the panel, then valid tiles flash yellow/red on the tableau;
  placing deploys a `tile.occupant` instance rendered as an on-tile card (hover-enlarge + tooltip,
  level badge, damaged gray-out). Added terrain placement classes + `canPlaceOn`, building
  end-of-era outputs + lifetime (Pier food), and a roster slot-fill "slam" animation. Model verified
  via a Node sim (pick/place, land-only validity, replace, Pier accrual, full-era resolve).
- **2026-07-21** — Production-slice review fixes: (1) a threshold crossing on the FINAL dev tick is
  now presented before the era ends (was discarded); (2) an exhausted advancement pool auto-skips
  instead of opening a zero-card soft-lock; (3) `_endDevelopment` guarded against double-accrue;
  (4) a drag-vs-click guard so panning during placement no longer drops the unit on the wrong tile;
  (5) placement flashes were inset box-shadows hidden behind the new `.tile-bg` layer — moved onto
  `.tile-bg` and made bolder (this is why the Pier's coast tiles didn't visibly highlight).
- **2026-07-21** — **Pervasive inline-icon prose** (`IconText` + `:token:` markup): gameplay
  descriptions/effects/tooltips now render resource/stat/type **icons** instead of the words
  (InfoTip auto-routes string tooltips through it). Tokenized the implemented content + category/
  resource descriptions. Bolder panel replace/pick flashes; shrank on-card stat icons to stay
  within the card frame (tooltip keeps the large readable ones).
- **2026-07-21** — Implemented the **combat / battle phase**. Each era generates an enemy host
  (`data/enemies.js`: Horde/Elite/Group, terrain-gated columns, melee-front ordering; era −1 Bear/
  Lion/Wolf wildlife). The battle phase runs a 25s combat (`_combatStep`, speed = time multiplier):
  bottom-to-top/left-to-right, cooldown-based (fractional, min 1s) attacks — melee/cavalry as the
  front-most friendly, ranged at range, empty columns → gold / legitimacy damage; HP≤0 → damaged;
  survivors heal between combats; Wolf shifts after attacking; legitimacy 0 → **Defeat** screen.
  Enemies render as red `TileCard`s with cooldown bars + remaining-HP (reddening) Def. Model verified
  via a Node sim (host validity/ordering, resolve, defeat, heal). Combat juice is the next slice.
- **2026-07-21** — Combat-slice review fixes: (1) enemy hosts were EMPTY from Iron on (roster only
  covers eras −1/0) — `buildPool` now falls back to the nearest rostered units, so no era is a
  walkover; (2) a friendly building in front zeroed the column's melee — the melee gate now uses a
  unit-only front row so walls shield without disabling your attackers; (3) Victory/Defeat raised to
  z-index 200 (above the battle banner); (4) TickCounter shows a dash during the transition phase.
  Floating combat numbers/thrust/death-shake juice remains the next slice.
- **2026-07-21** — **Combat juice** + card polish: `CombatFx` floats damage/gold/legitimacy numbers
  over the source cell; unit cards **thrust** on attack (keyed by `lastAttackSeq`); destroyed cards
  **shake→fade to gray**; panel gold/legitimacy **pulse** as they change. Clothes now applies **+5 HP
  retroactively** to deployed units. Card **type shown as an icon** (dropped the "MELEE"/"POLICY" text
  + corner watermark so the policy card fits). Selected **speed button** clearly highlighted.
- **2026-07-21** — **Gold economy** (makes gold useful). Added `game/data/costs.js` (repair / upgrade /
  specialist / mercenary formulas) and a new **preparation phase** between development and battle
  (`_startPrep` → `CombatPrep` banner → **Begin Combat**). Gold now buys: **repair** a damaged
  unit/building, **upgrade** a healthy one (both via a gold-cost button on the on-tile card, with a
  green flash + grow/shrink pop), **specialists** (a **Convert +N** button on each specialist PopCard
  turns era+1 citizens into that type), and **mercenaries** (hire a random valid roster unit onto an
  empty tile during prep; flagged `mercenary`, disbands in `_endCombat`). **Units drag to reposition**
  onto a valid empty tile any time in dev/prep (valid tiles flash yellow, invalid drops snap back;
  no displacing). All buttons gray out when gold is short. Added `Repair`/`Upgrade` icons. Model
  verified via a Node sim (29 checks); an adversarial multi-agent review ran over the slice.
- **2026-07-21** — UI fixes: (1) the on-tile **Repair** button no longer looks grayed on a damaged
  card — the damaged **grayscale** filter now wraps an inner `.tc-body` so the sibling action button
  keeps full color; (2) the card **level badge** moved in-flow into a name/level header row so it can
  no longer **overlap** the name; (3) combat is **held** until the "Battle" banner clears
  (`data.combatIntro` + `dismissCombatIntro()`), so the fight no longer runs under the popup; (4)
  `InfoTip` **portals** its tooltip to `<body>` so the hover-scaled tile card (a transformed ancestor)
  can't misplace it; (5) the civ panel now **collapses closed dropdowns to slim tabs** and shrinks the
  legitimacy header to a compact row, so the open group fills the height and its cards fit (the fill
  "slam" is gated to the just-filled slot so tab-switching doesn't replay it).
- **2026-07-21** — Follow-ups on the above: (1) `InfoTip` now anchors to the hovered element's
  bounding box and opens **beside** it (left, flipping right at the edge, vertically centered)
  instead of over the cursor, so a card/slot tooltip **never covers** it; (2) while a panel dropdown
  is expanded the other three are **hidden entirely** (collapse via the header to switch), giving
  the open group the whole area so late-game unit cards stop getting cut off — closed groups stay as
  slim tabs only during a build pick; (3) on-tile card names now **shrink + wrap to two lines** and
  only ellipsize as a true last resort (no more premature truncation).
- **2026-07-21** — More reposition/panel fixes: (1) units can now be **dragged while choosing a
  build's location** (drag one aside to make room), with a real drag suppressing the placement click
  so click=place/replace, drag=move; (2) **Hire** buttons are hidden during a reposition drag so they
  can't block the drop; (3) the panel's hide-the-other-dropdowns behavior now applies **during a
  build pick** too (defaults Units open, collapse to switch to Buildings) instead of falling back to
  slim tabs.
