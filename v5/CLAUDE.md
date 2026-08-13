# AutoCiv v5 — Project Guide (WIP)

> **v5 is a fresh fork.** It reuses v3's *infrastructure* (Vite tooling, the `/api/content`
> save middleware, the common UI kit, hex geometry, the `GameProvider` bridge, the editor
> shell) but the **game model is rebuilt** for v5's design, which is different from v3:
>
> - **Turn-based**, not tick/idle. Each turn: generate resources → spend → end turn.
> - **Abstract combat.** Military is an empire-wide **12-scalar** aggregate (Attack/Defense/
>   Bombardment × Land/Sea/Sky/Space). A wave every **3 turns** resolves as arithmetic vs an
>   enemy card — it does **not** reference the map. See `docs/combat.md`.
> - **Legitimacy** is the life total (starts 100; 0 = loss). Combat costs legitimacy, yields gold.
> - **One spend economy**, no threshold resources: production→deployables, gold→upkeep/mercs/
>   rerolls, food→territory expansion, progress→tech unlocks.
> - **One tech draft**: 3 from the current era pool + **1 wildcard** from any earlier era.
>   Spend progress to unlock; **4 unlocks advance the era**.
>
> The **balance model** and **enemy formula** live in [`design/balance-targets.md`](design/balance-targets.md).
> The **content** (eras, terrain, deployables, techs) is authored in the sheet and lives in
> `src/game/data/content.json`, edited via `/editor.html`.

## Running
```bash
cd v5
npm install        # first time (own node_modules)
npm run dev        # http://localhost:5175/  game · /editor.html  content editor
npm run build      # both entries
npm run lint
```

## Status — PLAYABLE PROTOTYPE (Stone · Bronze · Iron)

The whole loop runs end to end: expand territory with :food:, build deployables with
:production:, draft techs with :progress: (3 + wildcard, spend to unlock, 4 → next era), face a
wave every 3 turns resolved by abstract combat, lose on :legitimacy: 0. Verified via a 12-turn
greedy playthrough (eras advance, 25 tiles controlled, 13 deployables, 4 waves resolved, no errors).
Content is Stone/Bronze/Iron only and **everything seeded is wired** — the editor and engine share
`content.json`.

## Layout
```
v5/src/
├── App.jsx                     # loading → title → game router
├── game/                       # framework-free model (no React)
│   ├── GameEngine.js           # state + turn loop + subscribe/getVersion bridge; economy,
│   │                           #   territory, tech draft, combat orchestration
│   ├── systems/combat.js       # 12-scalar resolver + era-independent enemy formula (pure)
│   ├── world/worldgen.js       # deterministic hex-disc terrain
│   ├── hex/coords.js           # hex geometry (reused from v3)
│   ├── data/schema.js          # ERAS, effect registry (EFFECT_KINDS), cost formulas, validate
│   ├── data/content.json       # THE CONTENT LAYER (editor-owned)
│   └── data/content.js         # indexed view + draft helpers
├── components/GameScreen.jsx   # whole in-game UI (map, panels, combat modal, end states)
└── editor/Editor.jsx           # /editor.html — content editor over content.json (/api/content)
```

## How content → mechanics works
A tech/deployable carries `effects` — small structured objects (`{name, ...params}`) drawn from
`schema.js` `EFFECT_KINDS`. The engine interprets them: tech effects fold into `mods`
(`_recomputeMods`); deployable `econ` effects run in `computeEconomy` each turn; deployable
`combat` effects aggregate in `playerScalars`. **An effect kind exists only once the engine runs
it** — add to the registry alongside the code that consumes it. The editor renders inputs from each
kind's `params`, so new content is authored without touching code.

## Notes
- Combat does NOT reference the map — it's an empire-wide 12-scalar aggregate. The map drives the
  economy and placement only (a deployable replaces its tile's natural yield).
- Dev-only: `window.__g` is the live engine (for console poking). `localStorage['autociv.mute']='1'`
  silences audio.
- Preview: `autociv-v5-dev` (port 5176) in the repo-root `.claude/launch.json`.
- **Not yet built:** eras past Iron, mercenaries, repair/upgrade gold sinks, Sky/Space domains in
  play, the win tech (Ascendancy). Balance is untuned (early waves are gentle).
