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
> The content layer is pruned to a **microcosm** — `content.activeEras = 3`, with
> 43 techs / 10 buildings / 5 wonders in play and everything else **parked in
> `content.backlog`** (nothing deleted; the editor's Backlog tab restores rows).
> Widening the era range later should be a **data** change, not a code change.

> **Status: PLAYABLE PROTOTYPE.** The whole loop runs end to end — map, era cycle,
> territory economy, city growth, a **297-node progress web**, unit/building placement, an
> **era-closing wave** with razing and permanent casualties, and a **gold economy**
> (repair · upgrade · reroll) that is the counterweight to all of it.
> `node sims/campaign.mjs 4` plays it headlessly.
>
> ⚠️ **The web was just re-authored from the design brief and is TEXT ONLY** — no node grants
> anything yet, so the army is city levies and no building is ever placed. Wiring it back up,
> node by node, is the next job. See **Progress web** below.
>
> **Balance past ~era 5 is not tuned** and is known to fall apart in the late game; the
> four-era slice is what has been measured.
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
node sims/progress.mjs       # progress-web structure check (no crossed edges, forks, reach)
node sims/campaign.mjs 4     # play 4 eras headlessly across 5 seeds — the balance instrument
node sims/economy.mjs        # expansion-strategy sweep (wide vs tall)
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
├── sims/campaign.mjs           # plays the WHOLE loop headlessly: waves, gold, survival
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
    │   ├── data/schema.js      # what content.json may contain — every enum, + feasibility()
    │   ├── data/describe-effect.js # structured effect -> sentence (the round-trip check)
    │   ├── data/progress.js    # the OLD in-game web: 297 nodes, 11 rings (superseded content)
    │   ├── data/effects.js     # the effect VOCABULARY (wiring), split out of progress.js
    │   ├── data/definitions.js # sub-tooltip definitions: buildings + rules terms
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
        ├── Progress/           # radial web overlay · offer cards · definition chips
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

### The content layer (`game/data/content.json`, `game/data/schema.js`, `/editor.html`)

> **This is where techs, buildings and wonders now live**, and it is the source of truth going
> forward. It is **not wired to the game yet** — `progress.js` below still drives the in-game
> web. Two datasets exist on purpose during the migration; do not "fix" the duplication by
> deleting either until the engine reads `content.json`.

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
- **`tierUnlocks` are VISIBILITY ONLY**, one per era, and are **not per-quadrant**: a notch fires
  when **any** quadrant reaches its era (`revealEra = max(quadrant eras)`), so the map follows
  your furthest track. This is why there are no vision techs. The validator rejects any
  non-`vision` effect here — anything else would be a draft pick you didn't spend.
- **One unit per class, nine classes.** No named-unit ladder: techs raise the class's stat line
  and every unit of it already on the board improves. `UNIT_CLASS_BASE` holds placeholder stats.

#### There is NO effect system — a tech is described in writing
A tech carries a **`description`**: prose with `:token:` markup for icons ("+2 :food:", "grants
a :melee: unit"). `schema.js` holds the eras, branches, thresholds, unit-class base stats,
placements, icon tokens and the validators — and nothing else.

> ⚠️ An earlier version carried a full structured-effect vocabulary — ~16 ops, targets, scales,
> filters, triggers, durations and 50 named rule keys — and all 654 effects in the game were
> encoded against it. **It was removed on purpose**: expensive to author, hard to hold in your
> head, and it forced a decision about every mechanic long before any of them were built.
> Mechanics get wired **one at a time**, as each is actually implemented, against whatever the
> engine needs at that moment. **Do not reintroduce a general effect language ahead of the code
> that would consume it.** The old vocabulary is in git (`schema.js` / `describe-effect.js`
> before commit `4192d9f`) if it is ever wanted.

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

### Progress web (`game/data/progress.js`, `components/Progress/ProgressTree`)

> ⚠️ **SUPERSEDED as a content source by `content.json`** (above), but still what the game
> actually runs on: the 11-ring web, its rings, and its `ringUnlock` gating are live until the
> engine is migrated to the 15-era draft. Its *content* is frozen — author in the editor.

A radial tree that **grows outward**, opened from the HUD's Progress button.

**297 techs + 84 TBD slots, ELEVEN rings, four quadrants** — Society / Technology / Economy /
Military, each owning a 90° sector. **A ring is an AGE**, and `RING_AGES` names them:

| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Ancient | Bronze | Classical | Medieval | Renaissance | Industrial | Modern | Information | Solar System | Extrasolar | Galactic |

**Placement is DATED, not vibed.** Each ring is a period with real boundaries, and a tech goes
where its actual invention does — Fireworks is 9th-century China (Medieval), Satellites is 1957
(Modern), the ridden horse postdates the neolithic (Bronze, not Ancient):

| ring | span | ring | span |
|---|---|---|---|
| Ancient | before ~3300 BC | Industrial | ~1700–1900 |
| Bronze | ~3300–1200 BC | Modern | ~1900–1975 |
| Classical | ~1200 BC–500 AD | Information | ~1975–2040 |
| Medieval | ~500–1450 | Solar System | settling this system |
| Renaissance | ~1450–1700 | Extrasolar / Galactic | leaving it / the far future |

The three off-Earth rings are the exception: they are ordered by **reach**, not date, because
there are no dates to have.

**Rings are therefore UNEQUAL, and that is correct.** Economy's Industrial ring holds 16 nodes
because that is when economics happened; **Society's Information ring holds NONE**, which is a
real gap in the design (no internet-age culture or government material exists in the brief)
rather than something to paper over. **Do not pad a ring to match its neighbours.** Totals per
ring run 18 / 20 / 27 / 33 / 29 / 41 / 40 / 23 / 24 / 20 / 22.

⚠️ **Exactly four techs sit off their date**, all for the same reason — an exclusive group must
occupy one ring or its choice can never be offered. They are listed in the file header
(Democracy, Schism, Techno, Yakhchals). **Anything else that looks misplaced is a bug**; fix it
rather than adding to that list.

Every quadrant-ring also carries `TBD_PER_RING` placeholder nodes (1 in ring 0, 2 elsewhere):
drawn as dashed hollow hexes with a `?`, **never takeable and never offered**
(`GameManager.progressState` short-circuits on `node.tbd`), there to show where the web has
room. They are generated in the build loop, not authored — change the constant, not 84 entries.

> ⚠️ **The nodes are DESIGN TEXT, not wiring.** They carry no `effects`, so taking one grants
> nothing — the web is a readable plan. The effect vocabulary lives on in `data/effects.js`,
> unchanged and still applied by `_applyEffects`; wiring a node means attaching records from
> there. A node that HAS effects gets its text generated by `describe()` instead, so a wired
> node's description can never drift — **never hand-write text for a wired node.** Until nodes
> are wired, `campaign.mjs` shows an army of city levies only and no buildings at all.

> ⚠️ **NOTHING HAS A PREREQUISITE right now.** A node opens when its ring opens. The `from:`
> option, the edge drawing, and the planarity rule below are all **kept and simply unused**, so
> dependencies can come back without a rewrite — and the validator still enforces them, so the
> first `from:` you add is checked the moment you add it.

**Exclusivity is explicit and rare** (`EXCLUSIVE`, 18 groups) — only real either/ors: Longbow
vs Crossbow, Monotheism vs Polytheism, Democracy vs Communism vs Fascism, the six music
genres. Members must share a ring (see the four dated exceptions above). A greedy playthrough
takes **273 of 297**.

**`validateStructure()` asserts the structure** (`node sims/progress.mjs`): one ring per age,
**every ring legible at its radius**, unique names, exclusivity within one ring, every `sub:`
term defined, enough attainable nodes per ring to open the next, and (vacuously, for now) no
crossed edges.

- **Ring radii are sized by the FULLEST ring, not by taste.** A quadrant-ring of `k` nodes
  spreads them over 90°, so the arc between neighbours is `R·(π/2)/(k+1)` and must clear
  `NODE_SIZE`. Economy's Ancient ring (8 techs + a TBD, at the smallest radius) is the binding
  constraint at `RING0 = 520`; the sim prints the tightest gap per ring, so shrink these only if
  it still passes.
- **Edges are polar CURVES, not chords** (`edgePoints`) — unused while there are no
  dependencies, kept because it is what keeps the drawing planar when they return. A straight
  chord between two rings dips *inside* the inner ring whenever its endpoints are far apart in
  angle (a parent with six children fans that wide), so it wanders into the band below and
  crosses edges living there. A curve that interpolates radius **and** angle stays in its own
  annulus and has exactly one point per radius, at
  `angle(t) = parentAngle + (childAngle − parentAngle)·t`. Linear interpolation preserves order,
  so two edges of one band whose parent angles and child angles are both non-decreasing can
  never swap sides. The authoring rule: **read a ring in order and parent indices must never go
  backwards**.
- **Rings unlock by count**, and the count is DERIVED: `ringUnlock(r)` is 40% of what ring `r`
  actually holds (min 4), because the rings are unequal — a fixed number would be a stroll
  through Ancient (18 nodes) and a wall at Industrial (41). Reaching Galactic takes **110 picks**.
  An unopened ring is **not rendered at all**, and the camera animates out to the new fit.
- **"Show all"** (header toggle) draws every ring regardless of what is open — the design view
  of the whole web. It is **presentation only**: nodes in unopened rings read `locked` and
  cannot be taken, so inspecting the far rings never skips the progression that reaches them.
  Edges are left neutral rather than dashed in that mode, or the entire outer web greys out and
  the shape — the one thing the view is for — stops reading.
- **Camera is the HexMap pattern** — ref-based, applied imperatively, so pan/zoom never
  re-render the ~300 nodes. Wheel zooms at the cursor; left **or middle** drag pans; a drag that
  moved suppresses the click so panning never takes a node by accident. "Recentre" re-fits.
- **States**: green = taken, blue = available (pulsing), grey = locked. Each node is a
  `clip-path` hexagon with an icon picked from its `tag` — the one non-free-text field on a
  node, driving both the icon and the "unlocks" line. Age names are drawn on each ring circle
  along the **Society/Technology divider**, where no node ever sits.

#### Sub-definitions (`data/definitions.js`, `components/Progress/DefChips`)
A node says "unlocks the guildhall" or "outposts get +2 :gold:" with no room to say what a
guildhall or an outpost IS. Terms it leans on go in `sub: [...]` and are defined **once** in
`definitions.js` (~75 entries: the buildings the web promises, plus concepts like outpost,
temple, mercenary, taunt, bleed, blast radius). They render as hoverable chips, each its own
`InfoTip`, so hovering one opens a definition **on top of** the node's tooltip.

⚠️ That nesting only works because the node tooltip is `<InfoTip interactive>`: a plain tooltip
has `pointer-events: none` and vanishes the moment the cursor leaves the anchor. `interactive`
turns pointer events on and adds a 90 ms grace timer, so crossing the 16px gap into the tooltip
doesn't close it.

Two things keep that from feeling sticky, both in `InfoTip`:
- **One open tooltip per nesting DEPTH** (a module-level `openAt` registry plus a `TipDepth`
  context). Opening at depth `d` immediately closes anything open at `d` or deeper, so moving
  between anchors *swaps* instead of leaving the old one up for the whole grace period. Depth
  is what preserves nesting: a chip opens at depth 1 and leaves its parent at depth 0 alone.
- ⚠️ **A portal still bubbles events through the REACT tree.** Mousemove over anything inside a
  tooltip reaches the anchor's `onMouseMove` and re-runs `place()` — which then closed the
  nested tooltip that very move had just opened. The tooltip container therefore
  `stopPropagation()`s mousemove.

A building named in `definitions.js` is **design text**; `data/buildings.js` holds the ones
actually placeable. The two are deliberately separate — the design can name fifty buildings
while ten exist, and nothing silently half-works.

#### Node effects — a vocabulary, not 300 bespoke rules
There are **twelve effect kinds** with parameters, applied by `GameManager._applyEffects` into
ONE accumulated record, `game.mods`:

| kind | what it does |
|---|---|
| `terrain` / `improved` | extra yields on a terrain type, or on every improvement |
| `mult` | percentage on a resource — **additive per resource, applied once at the end** |
| `threshold` | multiplier on a threshold (<1 is cheaper), applied at comparison time |
| `unit` | unlocks a **better unit of its class** and grants some. Each unit key appears **exactly once** in the tree — asserted, because two techs both "unlocking the Mud Brick Wall" is a design smell |
| `troops` | just bodies: N units of a **class**, resolved to the best unlocked unit of it **at placement time**. Opens with the class's base unit if it is still empty, so a grant can never be stranded |
| `building` | unlocks it and queues a placement. Which node is the **unlocker** is derived — the earliest in ring order — so later ones read "grants another Granary" |
| `weapon` / `armor` | a **TIER**, see below |
| `unitMod` | per-type (melee/ranged/cavalry/defense) atk/hp/range/moves |
| `road` | unlocks roads and sets what a road-adjacent tile earns |
| `settle` | an expansion permission (tundra, ocean, mountain…) |
| `city` / `palace` | per-city yields and growth rate; palace HP |

**Effect TEXT is generated from the effects** (`describe`), so a WIRED node's description can
never drift from what it actually does — never hand-write one.

**Units are described by CLASS, never by name** — "grants 2 :melee: units". Which unit you
actually get is the reveal when you place it, and it keeps the offer readable as the tiers
climb. Buildings keep their names; they are distinctive, named things.

**Weapons and armour are TIERS, not stacks.** You start the game on **Clubs** and **Hides**; a
node moves you to Bronze → Iron → Steel (and Leather → Bronze Mail → Iron Mail), *replacing*
the tier below via `bestTier`, so taking a lower tier later is a no-op. Weapons arm **melee and
cavalry only** — ranged improve through their own `unitMod` line, so bows and blades advance
separately.

`validateStructure()` also asserts every `unit`/`building` effect names something real, and
that no unit is unlocked twice.

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


---

## The main cycle (`GameManager`, `data/eras.js`)

**28 eras × 65 ticks**, driven by ONE clock and ONE pacing control in the HUD. Each tick either
advances a running combat by a beat, or advances the game: accrue output, grow cities, count
down the era. The era drives the map reveal (`stageForEra`) and hands out expansion
permissions (`EXPANSION_UNLOCKS`).

Crossing a **progress** threshold offers three advancements; crossing a **food** threshold
offers one expansion. Either **pauses the clock** until resolved, exactly as v2's selections
did (`_restartTimer` is gated on `!selection`).

## Territory & expansion (`world/territory.js`)

One verb, two depths:

- **Settle** — improve a controlled tile: its yield **doubles** and all six neighbours become
  controlled. This is what makes the *next* expansion possible.
- **Found city** — upgrade an improvement: no new ground, but the city's population compounds
  and adds to production/gold/progress on top of the tile's natural yield.

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

## Buildings, units, and placement

**Buildings** (`data/buildings.js`) are unlocked by a progress node, which usually grants one
or more **placements**. Every building's payout is **adjacency-shaped**: a flat base plus a
per-neighbour bonus keyed to terrain / control / improvements / cities / other buildings.
That is the whole design — *where* you put it matters more than which one you got. A Lumber
Camp in deep forest pays several times what one on the plains does.

**Units** (`data/units.js`) come in four flavours: **melee, ranged, cavalry, and defensive
construction**. A construction (Mud Brick Wall, Palisade, Stone Wall) has `atk: 0` and
`acts: 0` — it never moves and never strikes, it just soaks a lane. The Watchtower is the one
construction that shoots back.

**Where the army comes from is a deliberate split:**
- **Territory** raises the *line*: each city musters one melee levy per era, capped at
  `UNITS_PER_CITY_CAP` (3) units per city. Without this the army only ever shrank — casualties
  are permanent and the web grants far fewer units than a wave kills, so every run died around
  era 5 regardless of play.
- **The progress web** gives *quality* (weapon/armour tiers) and the arms a levy never is —
  bows, horses, walls.
- You **start** with a single Warrior; **every ring-0 node grants a unit or a building**, so
  the opening is stocked by what you choose rather than by what you were handed.

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

⚠️ **The threshold ladder and the wave budget are COUPLED.** Raising thresholds means fewer
progress offers → fewer unit grants → a smaller army. Retune `BUDGET_BASE`/`BUDGET_GROWTH` in
`data/enemies.js` whenever `RESOURCE_CONFIG` moves, or a slower ladder reads as brutal
difficulty rather than as calmer pacing. `sims/campaign.mjs` reports **prompts per era**, which
is the number to watch: currently **~4–7**, down from ~25.

## The era's battle & razing

Each era **ends in a wave**, sized by the era you have reached — dawdling does not make it
easier. Every **revealed, uncleared encampment fields an extra garrison standing on the camp**,
already inside your frontier: that is the pressure to expand toward them.

**The wave is mustered at the START of the era and drawn on the battlefield ring throughout**
(`prepareWave` / `buildHost`, faded via `.muster`), so you can see what is coming while there
is still time to prepare. `startCombat` reuses that exact host — what you spent the era looking
at is what turns up. The flow fields depend only on terrain and the known set, neither of which
moves within an era, so a host built at era start is still valid when it attacks.

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

`node sims/campaign.mjs [eras]` plays the whole loop headlessly across 5 seeds with a greedy
AI, and reports survival, wave outcomes, casualties, razes, and what gold was spent on. It is
the instrument the economy sim cannot replace: it answers *does the assembled game survive*.

Measured at **4 eras: 5/5 survive**, palace 92–100%, ~1 casualty and 1–3 razes per wave, and
gold genuinely spent (≈40 upgrades, 4–7 repairs, 2–6 rebuilds per run). **Past ~era 12 it
falls apart** — the wave budget outruns a unit count capped by cities. That is known and
deliberately untuned.

## Economy analysis (`sims/economy.mjs`)

`node sims/economy.mjs [--trace]` runs eleven expansion strategies across three seeds and
reports cumulative output at short / medium / long horizons. It is the tuning instrument for
the wide-vs-tall trade-off — see the numbers in the commit that introduced it.
