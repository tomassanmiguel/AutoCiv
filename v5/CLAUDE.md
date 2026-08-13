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

## Status
Under active construction. This file will be filled in as systems land. See the task list.
