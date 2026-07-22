# AutoCiv — Project Guide (CLAUDE.md)

> **This is a living reference — keep it ACCURATE, TIGHT, and MINIMAL.** We are building
> AutoCiv **fast and iteratively**, so this file is optimized for *onboarding speed*, not
> completeness: it holds the **critical information needed to understand the project** —
> the **game rules/systems** and the **code architecture/conventions/gotchas** — and nothing
> more. It is **NOT** a comprehensive design doc, a full content catalogue, or a change log.
>
> **What to include:** the rules and mechanics that define how the game works; the systems
> and how they connect; the code layout and the non-obvious conventions/gotchas a new
> contributor would trip on. **What to leave out:** an exhaustive list of every unit /
> building / policy and its numbers (the code in `game/data/` is the source of truth for
> content); dated histories of what changed; anything aspirational or speculative.
>
> **Updating is removing and correcting, not just adding.** With every change: **delete**
> anything now false, **rewrite** anything that changed, and prefer describing the *general
> rule/system* over enumerating each new piece of content. An inaccurate or bloated line is
> worse than no line — it will be trusted and it slows the next reader down. Before finishing
> a task, re-read the sections you touched and reconcile them with what the code now does.

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
│   │   ├── GameManager.js     # ROOT: owns GameData + tick loop / phase machine / economy / adjacency
│   │   ├── manager/combat.js  # combat subsystem (mixin installed onto GameManager.prototype)
│   │   ├── GameData.js        # { era, phase, tick, speed, tableau, civilization }
│   │   ├── TableauData.js     # 9x26 grid of Tiles; per-era visibility + bounds
│   │   ├── CivilizationData.js# resources (threshold), pops, item slot groups
│   │   ├── Tile.js            # one tile; getTooltip(); `occupant` (deployed unit/building)
│   │   ├── data/
│   │   │   ├── eras.js        # 28 eras + soundtrack + eraTitle()
│   │   │   ├── map.js         # ROW/COL unlock eras + 9x26 terrain labels + COLUMN_SPECIALS
│   │   │   ├── terrain.js     # terrain registry (place class + combat defBonus) + canPlaceOn + seeded resolution
│   │   │   ├── slots.js       # Unit/Building slot categories (label + description)
│   │   │   ├── resources.js   # threshold config + T(N) formula + rubber band
│   │   │   ├── advancements.js# 560-entry progress pool (per era) + IMPLEMENTED registry
│   │   │   ├── units.js       # unit defs + stat helpers + unitRole (combatRole ?? types[0])
│   │   │   ├── enemies.js     # budget-based enemy host generation (threatBudget/unitCost/generateHost)
│   │   │   ├── buildings.js   # building defs (per-tick outputs, combat auras, underlaid Road/City) + helpers
│   │   │   ├── costs.js       # gold cost formulas (repair/upgrade/specialist/mercenary)
│   │   │   ├── policies.js    # policy defs (name = unlocking advancement); combat + economy effects
│   │   │   └── pops.js        # pop types (Citizen + specialists) + output/tooltip helpers
│   │   ├── audio/AudioManager.js  # era-driven cross-fading music
│   │   └── react/GameProvider.jsx # <GameProvider> + useGame() hook
│   └── components/
│       ├── common/{NineSlice,InfoTip,IconText}.jsx/.css # 9-slice frame; tooltip; inline-icon prose
│       ├── GameScreen.jsx/.css    # composes the in-game view
│       ├── Tableau/{Tableau,TileCard,CombatFx}.jsx/.css # camera + grid + placement + cards + combat floats
│       ├── UIPanel/UIPanel.jsx/.css   # resources + side-tab item groups + PopCard (replace/pick flash, fill juice)
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
  `GameManager` got large, so its **combat** subsystem lives in `game/manager/combat.js` as a mixin
  class whose methods are copied onto `GameManager.prototype` (`installCombat(GameManager)` at the
  bottom of `GameManager.js`). Those methods still call `this._foo()` freely — it's the **same single
  class**, just split across files. Split other subsystems the same way if a file gets unwieldy.
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
- **Combat defense:** `TERRAIN[key].defBonus` grants a flat combat-only :defense: to any unit OR
  building on the tile — **Forest +5, Mountain +10** (folded in by `_syncUnitStats`).

### Camera (`components/Tableau`)
- Mouse-**wheel zoom** (anchored at cursor) + **drag to pan**, clamped between fit-all (most
  zoomed out) and ~2×2 tiles (most zoomed in). `revealFullTableau()` animates a zoom-out to
  fit; it fires on every era change and is the **reusable hook for future era transitions**.
- **Smooth era growth:** unlocking tiles shifts the grid's content origin (`minCol`/`maxRow`/
  enemy-row count), which would teleport every existing tile. On era change the camera is
  **counter-translated by that shift first** (via `prevLayoutRef`) so the current view holds
  still, then the zoom-out animates — no jolt.
- Hovering a tile shows a tooltip from `tile.getTooltip()` — the **terrain name + any special
  effect** (`TERRAIN[key].note`, e.g. Forest +5 / Mountain +10 :defense: in combat). This works even
  when a unit occupies the tile: over the surrounding **terrain** you get the tile tooltip, over an
  **on-tile card** (occupant or underlapping Road) the card's own tooltip takes over (`tileTip` checks
  `e.target.closest('.tile-card-anchor, .underlap-anchor')`).
- During production **placement**, valid tiles flash yellow / occupied red and are click-to-build.

### Game loop (`GameManager`, `game/data/resources.js`, `game/data/pops.js`)
- Each era runs: **development** (timer-driven ticks) → **preparation** (spend gold /
  arrange the board) → **battle** (25s of combat) → **transition** (banner) → next era,
  until the last era (`won`) or legitimacy 0 (`defeated`). State on `GameData`: `phase`
  (`development`/`prep`/`battle`/`transition`), `tick` (0..`ticksPerEra()`), `speed`.
- **Development:** **65 ticks/era** (the **Calendar** policy adds 5, via `ticksPerEra()`),
  **paused by default**. A speed widget sets
  `paused`/`standard`(1/s)/`fast`(3/s)/`super`(5/s)/`ultra`(10/s); `GameManager` runs a
  `setInterval` at the chosen rate. Each tick: recompute per-tick `output` from population,
  add it to each threshold resource's `value` (and `gold`/`legitimacy`), then cross any reached
  thresholds. Policy/building add-ons to per-tick `output` (`_recomputeOutputs`): pop-output policies
  **Language** (Citizen +1 :progress:), **Trade Networks** (Citizen +2 :gold:), **Specialization** (each
  specialist +1 of its highest output); **Ownership** (+2 :gold: per deployed building); **Brewery**
  (+1 :gold: per unit in range); **per-tick output buildings** (`_buildingTickOutputs` → `occ.tickOutput`):
  **Ranch**/**Farm**/**Aqueduct** food (Aqueduct DOUBLES per adjacent Aqueduct), **Kiln**/**Forging**/
  **Glassworks** production, **Mine** gold, **Mint** gold (5/7/9% of current :legitimacy:), **Temple**
  :legitimacy: (:legitimacy: now accrues **per tick** — `civ.legitimacy.output`); then a block of
  **PERCENTAGE output modifiers that are ADDITIVE per resource** (sum the bonuses, then ×(1+bonus) —
  NOT chained multiplications): **Slavery** (+10% :production:, −5% :progress:), **Democracy** (+20%
  :progress:), **Weights and Measures** (+50% :gold:). **Outputs are tracked as FLOATS** and **rounded
  DOWN in the UI** (`fmtDelta` to 1 decimal; resource values + per-tick cards floored). A pop's per-tick
  output can be **negative** (**Philosopher** −1 :gold:): when `gold.value` goes below 0 the deficit is
  cleared and legitimacy bleeds 1:1 via `_damageLegitimacy` (which also triggers a **development-phase
  defeat** if legitimacy hits 0). **Food-threshold modifiers** (`civ.modifiers.foodThresholdMult`, ×0.95
  each, stacking): **Basket Weaving** and **The Plough**; **progress-threshold**
  (`progressThresholdMult`, ×0.95): **Alphabet**. A `modifier` may also grant an immediate one-off
  (**Mathematics** → +2 production builds; **Clothes**/**Concrete** → flat unit/building :defense:).
- **Threshold resources** (progress/food/production) accumulate `value` toward the current level's
  `threshold`; on reaching it, `value` **resets** (overflow carries), `level` (# thresholds reached)
  increments, and the **per-level threshold grows**: `threshold(N)=threshold(N-1)+X·1.25^E·n·R`
  (`resources.js`: `T0`/`X`/`targetPerEra`; **E = 0-based era; n = the GLOBAL level, never resets**).
  Because the delta is always positive, **each level's requirement is strictly higher than the last**.
  R rubber-bands the running level toward `(era+1)·targetPerEra`. **Food** crossings add pops via
  `addPops(era+1)`; **progress** crossings open an advancement selection; **production** crossings
  open a build selection (both see below). **Gold** also accrues per tick (`gold.value +=
  gold.output`), driven by Trader specialists. Per-tick buildings accrue a lifetime total each tick
  (`_accrueBuildingTickLifetime`); **"end of era" resolves at END OF COMBAT** everywhere — Pier's
  end-of-era food accrues in `_endCombat` (`_accrueBuildingOutputs`), not end of development.
- **Pops** (`pops.js`): **Citizen** (generalist: 1 progress/food/production each per tick) plus
  unlockable **specialists** — Builder (+5 production), Farmer (+5 food), Trader (+5 gold), **Shaman**
  (+3 progress, and **+10 legitimacy per Shaman at the end of each combat**, in `_endCombat`), **Scholar**
  (+6 progress), **Philosopher** (+10 progress, **−1 gold** → legitimacy drain, see above), **Poet**
  (+1 progress, **+2 per era** via `civ.poetBonus`, applied in `popOutput` and reset to 0 when the Poet is
  unlocked). Effective per-pop output (incl. policy add-ons and the Poet escalator) is `popOutput(key)`.
  Start = 1
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
  misspellings kept), each with a stable `id` and `eraIndex`. `IMPLEMENTED` (keyed by name) is the
  registry of which ones actually do something + what they unlock (`kind`: `unit`/`building`/`pop`/
  `policy`/`modifier`) — **this registry + `game/data/` are the source of truth for content; don't
  re-catalogue every piece here.** All of **Stone** (era 0), **Bronze** (era 1), **Iron** (era 2), and
  **Classical** (era 3) are implemented; later eras are filled a batch at a time. Warrior is pre-unlocked in the Melee unit slot and **Totem** in the
  Legitimacy building slot. **A policy's display name matches the advancement that unlocks it**
  (e.g. Language→`language` policy).
- **Trigger:** crossing a progress threshold sets `data.selection` (a small state machine) and holds
  the game **paused** (`_restartTimer` is gated on `!selection`). Multiple owed choices queue via
  `pendingProgress`; each resolves then opens the next. Choices earned but unresolved are dropped on
  era change (`_beginEra`/`setEra` clear `selection`+`pending`).
- **Options:** draw up to 3 **unchosen** advancements with `eraIndex <= current era`, weighted by
  **2^eraIndex** (so current-era options dominate). Only implemented ones are weighted; if fewer than
  3, the rest are unimplemented **"Not Yet Implemented"** filler cards. Card (`ProgressOverlay`
  `UnlockDetail`) = the advancement name + era + corner silhouette, then a **structured body**
  built from the unlock's real data (NOT a prose blurb): **"Unlocks <Name>"** + type line
  (`:cavalry: Cavalry unit`, `Policy`, `Specialist`, …) + the unlock's own **rules text**
  (unit description/ability, `buildingEffect`, policy effect, pop outputs+note) + **stats**
  (units: Speed/Atk/Def; buildings: Def). A **modifier/bonus** shows just its effect. Hover enlarges.
  If the era's pool is fully **exhausted** (nothing unchosen left), the owed choice is silently
  **skipped** rather than opening a zero-card selection (no soft-lock).
- **Stages** (`selection.stage`): `choose` (3 cards + **Hide**; hidden cards restored by the rail
  flask) → on a full-slot unlock with **multiple** candidate slots, straight to `replace` (the panel's
  candidate slots **flash red** and are clickable → `resolveReplace`; that click IS the confirmation,
  so **no "are you sure"**). A **single-candidate** (auto) replacement still routes through `confirm`
  (an "Are you sure?" with **don't-ask-again** → `civ.askBeforeReplace`), since there's no pick to
  confirm it. Empty slots fill immediately.
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
- **Instances** live on `Tile.occupant` (`{ kind, key, level, hp, maxHp, damaged, lifetimeOutput?,
  warband?, permDef?, permAtk?, storedProgress?, ranchBonus?, tickOutput? }`) and persist across eras. Buildings output
  in two ways: **per-tick** (`_buildingTickOutputs` → `_recomputeOutputs`; **Ranch** food = `5 +
  ranchBonus` growing +2/3/4/… each combat end, reset if destroyed; **Kiln** production = `2 +
  (level+1)·adjacentBuildings`; **Mine** gold = `8·level`, ×2 on a mountain) or **end-of-combat**
  (Pier food, flat `200 + 100·(level−1)`; **Library** progress; `_accrueBuildingOutputs`).
- **Underlapping buildings** (the **Road** — a Utility building flagged `def.underlap`) live in a
  **separate** `Tile.underlap` slot: they **underlap** the occupant, are **never replaced**, have **no
  HP/combat**, and render as a name-only card in the tile's bottom strip (the occupant card takes the
  top 80%). The Road links every tile it touches into one adjacency group (see Combat → road-augmented
  adjacency). Placement (`_canPlaceHere`/`placementState`/`_createInstance`) treats it as a plain
  (never-replace) placement that ignores the occupant but can't stack a second underlap.
- **City / multi-building tiles** (the **City** — a Utility building flagged `def.underlaidCity`): lives
  in its own underlaid `Tile.city` slot (independent of a Road) and lets the tile hold **`extraCap` (2)
  additional buildings** in `Tile.extras[]`, on top of the primary occupant. Placement fills the occupant
  first, then extras; **city buildings never replace** (a building occupant on a city tile is protected;
  extras are additive), and a full city (occupant + 2 extras) is an invalid placement. **Extras are
  economic-only**: they feed every building-iteration path (via the `_buildingInstances()`/`_buildingsOn()`
  helpers — used by tick outputs, end-of-combat effects, adjacency counts, brewery/campfire/baths/embassy
  sources, cave-painting ageing, deployed-building count) but are **NOT combat targets/blockers and never
  take damage** (only `tile.occupant` fights). Render: on a city tile the occupant + extras show as
  name-only `strip` `TileCard`s (details on hover) with a corner "City" badge; strips have no inline
  repair/upgrade button, so **extras can't be individually repaired/upgraded** (a known limitation).
- **Cave Painting** (progress building, hp 8, **can't be upgraded** via `def.noUpgrade`): carries
  `storedProgress` (starts 5, **doubles each era after combat** in `_ageCavePaintings`, capped 50000).
  When a build is placed on its tile (**overbuilt**, in `_createInstance`), that stored :progress: is
  granted to the civ (and may open advancement choices). Card/tooltip show the current stored value.
- **Totem** (legitimacy building, **pre-unlocked**, hp 15/+5): grants `10 + 5·(level−1)` :legitimacy:
  at each combat's end. **Brewery** (gold building, hp 5, range = level): +1 :gold:/tick per unit in
  range, and units in range get a **±10% aura** (+10% atk, −10% hp). Neither uses `_accrueBuildingOutputs`
  — Totem/Sacred-Grounds/Shaman resolve in `_endCombat`; Brewery/Ownership gold in `_recomputeOutputs`.
- **On-tile cards** (`TileCard`): ~70% of the tile, centered, **enlarge to fill on hover** (which
  shows a rich tooltip and hides the tile tooltip). Corner **level** badge. Units show name + type +
  **Speed/Atk/Def icons** (Atk/Def are the synced **effective** `occ.atk`/`occ.maxHp`, incl. Warband/
  Brewery); buildings show name + type + **Def + current outputs** (lifetime total in the tooltip).
  The unit tooltip also notes Forest/Brewery/Tribalism bonuses. **Damaged** instances gray out and read
  "(damaged)". Hovering the on-card **Upgrade** button switches the tooltip to a **dark-green preview**
  of the next level (`InfoTip` `tipClassName="upgrade-preview"`; `renderTip(true)`). The tile sprite
  lives on its own `.tile-bg` layer so the west-coast mirror never flips the card.
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
- **Mercenaries** (`hireMercenary` / `mercEligible`, cost `mercCost` — **halved by Hospitality
  Rites**): during **prep**, every empty tile that can host ≥1 of your unlocked roster **combat**
  units (`_placeableUnitsAt` excludes **utility** units like the Baker) shows a **Hire** button (+ a
  gold ring when affordable). Clicking spawns a **random valid roster unit** (at that slot's level) flagged
  `mercenary` (dashed frame) — it fights this one battle and **disbands when the battle ends**
  (removed in `_endCombat`, and in `_defeat` so a lost battle leaves no stragglers). Mercenaries
  can't be repaired/upgraded (no sinking gold into a disposable unit). Hire buttons are **hidden
  while a reposition drag is active** so they can't get in the way of the drop.
- **Reposition** (`canReposition` / `moveUnit`, free): **units** (not buildings) can be **dragged**
  to a valid **empty** tile during dev/prep — **and throughout a production selection** (pick or place:
  rearrange freely, or drag a unit aside to make room to build). Dropping onto **another unit swaps them** (both must fit the
  other's terrain). On grab (past a small threshold) valid tiles flash yellow, the source dims, and a
  labelled ghost follows the cursor (positioned imperatively so ticks don't reset it); an invalid drop
  snaps back. During placement a real drag suppresses the source tile's placement click (via
  `movedRef`), so a plain click still places/replaces but a drag only moves.
- **CombatPrep** (`components/Prep`): a non-blocking horizontal bar in the **bottom-right** of the
  tableau (mounted in `GameScreen`) shown in the `prep` phase with a prominent **Begin Combat**
  button. Bottom so it never covers the enemy formation up top; right-aligned + `z-index: 21` (above
  the HUD strip) so it clears the left-packed HUD widgets and the button stays clickable. The tableau
  + panel stay interactive so all the above can happen. The enemy host is visible throughout prep.

### Combat (`GameManager` combat methods, `game/data/enemies.js`, `Tableau/TileCard`)
- **Enemy host** (`generateHost`, regenerated each era, visible as a preview during development):
  a **budget-based** system (`enemies.js`). Each era gets a **threat budget** `B0·growth^era`
  (`BUDGET_BASE`/`BUDGET_GROWTH`), times a per-host **±`STRENGTH_VARIANCE`** random swing. It's **spent
  buying enemy units** from a candidate pool = the player's own **combat** `UNIT_DEFS` (no utility) from
  `era−ERA_SPREAD` up to **era+1** (a rare next-era peek), weighted toward recent eras (falling back to
  all units ≤ era+1 when later eras aren't implemented yet). A unit's **cost** ≈ its combat value
  `atk·(25/cooldown) + def` at its level; each unit's level is a **geometric upgrade roll** (`rollLevel`:
  repeated 50% coin, so P(≥k upgrades)=0.5^k ⇒ ~1/32 reach +5). The buy loop keeps buying **bodies** into
  valid columns (terrain via `columnPlaces`+`canPlaceOn`) — skipping unaffordable rolls, not stopping —
  until the board is full or nothing's affordable; only then does **leftover budget level up placed
  enemies**. So the host grows in COUNT as the budget rises, with a random upgrade tail, and only once the
  board is full do levels inflate (fewer-but-stronger). Columns re-ordered **melee/cavalry front, ranged
  back**. Enemies never spawn support/buildings; they fade after each combat. (`ENEMY_ROSTER` + the old
  Horde/Elite/Group fractions are retired.)
- **Loop:** `_combatStep` runs every 50ms real, advancing combat time by the speed multiplier (the
  speed widget = 1x/3x/5x/10x); a battle is `COMBAT_DURATION = 25` combat-seconds. Attacks resolve
  **bottom-to-top, left-to-right**; each unit attacks on its **cooldown** (fractional, floored at
  `MIN_COOLDOWN = 1`s). **Melee/cavalry** only strike as the column's front-most friendly **unit**
  (buildings shield the enemy as a front-line target but do NOT block your own melee); **ranged**
  strike the front enemy at any range; an **empty column** yields **gold** (player) / **legitimacy
  damage** (enemy) — but a melee/cavalry that is **obstructed by a friendly unit in front earns no
  empty-column gold** (only the front unit, or any ranged, does). Buildings are targetable/front-line
  but don't attack. HP≤0 → `damaged` (inactive
  until repaired). Non-destroyed instances **heal to full** at combat end (damage doesn't persist);
  destroyed ones stay damaged. Wolf `shift`: after attacking, moves to an adjacent empty valid space.
- **Repositioning** (`_combatReposition` → `_repositionDest`, each step before attacks): a unit whose
  **own column has no enemies** flows to an empty/valid tile at **road-augmented distance 1**
  (`_reachableWithin`) in a **different** enemy-holding column. **melee/cavalry** → a column with **no
  friendly melee/cavalry** (become its front line); **ranged** → a column with friendly **cover** (a
  defensive building or a melee unit). Without a road this is exactly the same-row neighbour (a LATERAL
  step — never a jump to a distant row/region); a **Road** bridges it to any of the network's ports, so
  roads let units reposition farther. A unit flagged **`longSupport`** (the **Horseman**) instead
  supports **any column on its landmass** that lacks a melee/cavalry front (`_landmassSupportDest` over
  `_landmassTiles`, a visible-land connected component — a sea gap blocks it). Otherwise it stays (an
  enemy-free column still yields gold). At
  combat end each unit **shifts back** to the tile it started on (`_startCombat` records `homeRow/Col`;
  `_restoreUnitHomes` restores them in `_endCombat`/`_defeat` and disbands mercenaries). Any unit that
  changes tiles (reposition / Wolf shift / shift-back / drag) **slides** to the new cell rather than
  teleporting — a FLIP in `Tableau` (per-occupant `posRef` of last cell) drives a `TileCard` `.tc-slide`.
- **Stat pipeline** (`_syncUnitStats(inCombat)`, syncs **units AND buildings**): **units** store
  `occ.atk`/`occ.maxHp` — flat hp from **Clothes/Leatherwork** + **Hereditary Rule** + a Baker's
  permanent **`occ.permDef`**; flat atk from Warband/**Tribalism** (+1 atk/def per other same-key unit),
  an intrinsic **`packAtk`** (the **Legionnaire**'s +3 :attack: per other same-key unit, always on) and
  a Public Baths' permanent **`occ.permAtk`**; plus **terrain def** (Forest **+5** / Mountain **+10**,
  combat only); atk is then multiplied by the **Brewery** aura (×1.1 atk / ×0.9 hp), the **Brothel** aura
  (+10/15/20% atk, plus −0.5s cooldown via `_effectiveCooldown`), **Caste System** (×1.25 for level-2+
  units), and **Composite Bows** (×1.5 for ranged-role units, incl. Catapult/Trireme). **Buildings** store
  `occ.maxHp` = `buildingHp(def, level, buildingHpBonus)` (Masonry +10 / **Concrete +12** / Hereditary
  +1·era) + terrain def (combat only). `occ.atkMult`/`casteActive`/`cdReduce` are stashed so the on-card
  upgrade preview matches.
  Synced at `_startCombat` **and after any mid-combat move OR Baker buff** (`_combatStep` re-syncs);
  `_effectiveAtk` reads `occ.atk` (enemies fall back to base). A unit's **combat role** = `unitRole(def)`
  = `combatRole ?? types[0]` (naval **Galley** fights as :melee:); **utility** units (**Baker**) never
  attack — on their cooldown they "act" (`_utilityAct`: grant permanent +def to adjacent units), earning
  no gold and not repositioning. "**Range X**" / adjacency = **road-augmented** graph distance
  (`_reachableWithin`/`_adjacentTiles`). Building-output hooks skip `damaged` instances.
- **End-of-combat effects** (`_endCombat`, survival only — not on defeat) run via `_applyEraEndEffects`,
  which **Festivals** triggers an **additional time** (`festivals ? 2 : 1`): **legitimacy** — each
  undamaged **Totem** grants `10 + 5·(level−1)`, each **Colosseum** +5 per deployed unit, each **Shaman**
  +10, **Sacred Grounds** +1 per **empty, visible, land** tile; **Oral Tradition** — gain :gold: +
  :progress: equal to post-combat :legitimacy: (progress banked, opens next dev); **Hereditary Rule** —
  permanent +1 :defense: to all units & buildings (`unitHpBonus`/`buildingHpBonus`); **Ranch** food bonus
  grows (or resets if destroyed); **Forging** upgrades a random adjacent unit; **Surveying** lays a Road on
  a random valid tile; deployed buildings' end-of-combat output accrues (Pier food, Library progress).
- **Event-triggered policies** (checked via `_hasPolicy`): **Hunting** — a player unit attacking a
  column with **no enemy target** ("unblocked" damage) gains :food: equal to its :attack:, alongside
  the usual gold (in `_resolveAttack`'s empty-column branch); **Burial Rites** — any
  unit that dies banks :progress: equal to its :defense: (added to `progress.value`, NOT crossed
  mid-combat — progress choices only open in development, so it carries into next era's dev); **Midwivery**
  — creating a unit yields :production: equal to its effective :defense: (in `_createInstance`, during
  development, so it may cross a production threshold and chain another build).
- **Unblocked-damage bonuses** (empty-column "unblocked" attacks, `_resolveAttack`): a unit's own gold
  multiplier (**Trireme** ×3 gold) plus a **Lighthouse** bonus (**+200%/+250%/+300%…** to ALL resources a
  **naval** unit gains in the Lighthouse's contiguous **waters**, `_navalUnblockedBonus`/`_watersTiles`).
  These **stack ADDITIVELY** (Trireme+Lighthouse ⇒ ×(3+2), not ×3×3). **Siege** units (**Catapult**,
  `def.splash`) instead strike the **rear** enemy in the column and deal `splash`× damage to its neighbours.
- **Legitimacy losses** all route through **`_damageLegitimacy(amount)`** (combat empty-column hits,
  Philosopher gold-drain), which **Democracy** DOUBLES and clamps at 0 (→ defeat); it returns the applied
  amount for the floating combat number.
- **Timed-trigger buildings** (crossing an every-N-combat-seconds mark, like Embassy): **Embassy** hires a
  free mercenary onto an empty adjacent tile every **8s** (`_applyEmbassyMercs`/`_spawnMercAdjacent`);
  **Public Baths** every **5s** heals adjacent friendlies 50% of max HP and permanently grants adjacent
  units **+level `occ.permAtk`** (`_applyPublicBaths`).
- **Campfire** (utility building): each **whole combat-second** it heals each **road-augmented-adjacent**
  friendly (unit or building, below max, not destroyed) by `5/7/9/…%` (per level) of their max HP
  (`_applyCampfireHealing`, floating green `+N` via a `heal` combat event).
- **Rendering:** enemies render as red-framed `TileCard`s in the battlefield slots. In combat the Def
  stat shows **remaining HP** (reddening via `color-mix` as it drops; full value outside combat) and a
  **cooldown bar** ticks below each unit. `TickCounter` shows battle seconds remaining. **DefeatScreen**
  mirrors Victory (rail **💀** re-summons it). Instances carry combat state on the same object
  (`hp`/`maxHp`/`damaged`/`cdTimer`/`lastAttackSeq`).
- **Juice** (driven by `data.combatEvents`, rebuilt each step, keyed by `combatSeq`): `CombatFx`
  (inside `.tableau-content`) floats **damage / gold-gained / legitimacy-lost** numbers over the
  source cell; each unit **thrusts** toward the enemy on attack (a `.tc-lunge` wrapper keyed by
  `lastAttackSeq` remounts to replay it, and only carries the `.attacking` class — which holds the
  animation — when it actually attacked THIS step, so entering/leaving combat no longer jerks every
  card; `_startCombat` clears `lastAttackSeq`); destroyed cards **shake then fade to gray** (CSS on
  `.damaged`); the panel gold/legitimacy values **pulse** as they change during combat.

### HUD (`components/Hud`)
- **HUD strip** (`.top-hud`): a full-width horizontal strip. NOTE: `.tableau-window` is a flex
  column with `<Tableau/>` first (grows to fill) and the strip second, so the strip actually renders
  along the **bottom** of the tableau window (despite the `top-hud` name). `z-index: 20`, and it
  captures pointer events across its full width — so bottom-anchored overlays must sit above it and
  clear of its widgets. Order: **EraBanner (`"<Era> Age"`) → menu button → TickCounter →
  SpeedControl**, packed left.
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
  dropdowns get height), with a **+N/t delta** when it has per-tick income (Temples). **Starts at 100.**
  Stores `{ value, output }` — `output` now accrues per tick (see Game loop).
- **Gold** — icon + value (left) + per-tick delta (right). `{ value, output }`.
- **Food / Production / Progress** — threshold resources (see Game loop): icon + **level number**
  (# thresholds reached) + **bar** (`value / threshold` toward the current level's requirement) +
  per-tick delta. Shape `{ value, output, level, threshold }`.
- **Item groups** are **icon side tabs** (`.panel-tabs`, a vertical strip on the left of the dropdown
  area) — **Units**, **Buildings (8)**, **Policies (5)**, **Population (5)** — **all four always
  visible** as `TAB_ICON` images (`ui/{unit,building,policy,pop}.png`); the tabs **split the full
  height** and extend a few px right (negative margin) to tuck under the content box's 9-slice frame.
  The **active** tab's slots fill the dark `Box Dark`-framed content body (`.tab-body`, rendered by
  `SlotList`). `activeTab` is the player's choice, but a **replace** forces the relevant tab active
  and a **build pick** jumps to Units and makes the pickable **Units/Buildings tabs pulse gold**
  (`.pick-hl`). A fill/unlock switches to that group's tab (for the slam). Slot boxes are **solid**
  parchment (so the type icon reads); stat icon+value pairs never shrink/overlap (wrap instead).
  **empty** slots show a centered type silhouette, while
  **filled** slots render a compact **item card** — the **type** shows as an ICON next to the name
  (no "MELEE"/"POLICY" text, no corner watermark, so cards stay compact and the policy effect fits);
  units then show **Speed/Atk/Def stat icons** (`/sprites/icons/{speed,attack,defense}.png`,
  level-scaled, incl. Clothes/Leatherwork/Hereditary HP; **utility units omit Atk** — they don't
  attack); buildings show a **Def stat + effect** (an underlapping Road shows name + effect only, no
  Def); policies show the effect. Descriptions/effects always report the
  **current** value for the current era + level (e.g. the Pier's food), never the upgrade sequence
  or per-level deltas. Full descriptions (icon stats for units) on hover. During an advancement **replace**, the relevant group's tab force-activates
  and its candidate slots **flash red** and are clickable (`resolveReplace`). `CivilizationData`
  roster slots hold `{ key, level }` (Warrior pre-fills Melee); `pops` holds counts by type.
  - **Slot data** lives in `game/data/slots.js`: `UNIT_CATEGORIES` (9), `BUILDING_CATEGORIES`
    (8), and `POLICY_INFO` / `POPULATION_INFO` (one silhouette + description each). Each entry
    has a `silhouette` (path in `public/sprites/ui/`) and a `description`.
  - **Unit categories (9, display order):** Melee, Ranged, Cavalry, Siege, Utility, Naval,
    Aerial, Astral, Astral Utility. **Units are era-gated** by an `unlock` era id — only
    categories unlocked at the current era show, so early eras show fewer:
    Melee/Ranged/Cavalry from Stone; Utility + Naval from **Bronze** (the brief's "Copper Age");
    Siege from Iron; Aerial from Gilded; Astral Utility from Atomic; Astral from Lunar. Building
    categories (not era-gated): Progress, Production, Gold, Food, Legitimacy, Defense, and **two
    Utility slots** — a utility building fills the first empty one (`_unlockTarget` is fill-first-empty);
    the underlapping **Road** occupies a Utility slot too.
  - **Hover** any slot for a tooltip (`<InfoTip>`): category name + description. Policies use one
    shared silhouette + description.
  - **Population** renders a richer **`PopCard`** for each unlocked pop type: name + **effective**
    output icons in the body and the **count** on the far right. The output shown is
    `GameManager.popOutput(key)` — the base pop output **plus any policy modifiers** (e.g. Language
    gives each Citizen +1 :progress:), which is the same source of truth `_recomputeOutputs` uses,
    so card and economy always agree. Hover shows per-tick output **and the total from that pop
    type**. The Citizen starts unlocked; specialists unlock via advancements. Each specialist card
    also has a gold **Convert +N** button (dev/prep only) — see **Gold economy**.
  - `CivilizationData.units` (9) / `buildings` (8) / `policies` (5) are index-aligned to the
    category lists; `null` = empty slot, else `{ key, level }`.

### Menu (`components/Menu/MenuOverlay`)
- Framed hamburger button (in the left HUD) opens a 9-slice-boxed overlay (light panel, dark
  framed buttons). Holds a **temporary Era control** (slider + Prev/Next) that calls
  `GameManager.setEra` as an **instant debug jump** (no banner), plus **Exit to Title**.
